// lib/orders-service.js
const Pricing = require('../js/pricing.js');
const Catalog = require('../js/catalog.js');
const db = require('./db.js');

class ValidationError extends Error {
  constructor(errors) {
    super(`Invalid order payload: ${errors.join(', ')}`);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

const CPF_RE = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;
const CEP_RE = /^\d{5}-?\d{3}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\d{10,11}$/;

// Mesmo limite que o carrinho do navegador aplica (js/store.js clampa 1..99).
// A regra só vale de verdade aqui: o cliente pode postar direto na API.
const MAX_QTY_PER_ITEM = 99;

function isValidQty(qty) {
  return Number.isInteger(qty) && qty >= 1 && qty <= MAX_QTY_PER_ITEM;
}

function isAdult(birthDateStr, today = new Date()) {
  const birth = new Date(birthDateStr);
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birth.getUTCMonth();
  const dayDiff = today.getUTCDate() - birth.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age >= 18;
}

function validateOrderPayload(payload) {
  const errors = [];
  const c = payload.customer || {};
  if (!c.fullName || !c.fullName.trim()) errors.push('fullName');
  if (!c.birthDate || !isAdult(c.birthDate)) errors.push('birthDate');
  if (!c.cpf || !CPF_RE.test(c.cpf)) errors.push('cpf');
  if (!c.phone || !PHONE_RE.test(c.phone.replace(/\D/g, ''))) errors.push('phone');
  if (!c.email || !EMAIL_RE.test(c.email)) errors.push('email');

  // A loja só faz envios — não há mais opção de retirada no balcão.
  const d = payload.delivery || {};
  if (d.type === 'delivery') {
    const a = d.address || {};
    for (const field of ['street', 'number', 'cep', 'neighborhood', 'city', 'state']) {
      if (!a[field] || !String(a[field]).trim()) errors.push(field);
    }
    if (a.cep && !CEP_RE.test(a.cep)) errors.push('cep');
  } else {
    errors.push('deliveryType');
  }

  // Frete vem pronto do navegador (cálculo do Melhor Envio no checkout), então
  // pelo menos garantimos sanidade: nada de negativo, NaN ou string.
  const freight = d.freightCost;
  if (!(typeof freight === 'number' && Number.isFinite(freight) && freight >= 0)) {
    errors.push('freightCost');
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    errors.push('items');
  } else if (payload.items.some((item) => !item || !Catalog.findBySlug(item.slug) || !isValidQty(item.qty))) {
    // Um slug fora do catálogo não tem preço confiável para ser cobrado, e uma
    // qty fracionária/ausente/negativa distorce o total (0.5 vira 50% de
    // desconto; ausente vira NaN, que o Math.max de computeTotals não corrige).
    errors.push('items');
  }
  if (!['pix', 'card'].includes(payload.paymentMethod)) errors.push('paymentMethod');

  return { valid: errors.length === 0, errors };
}

async function createOrder(deps, payload) {
  const { valid, errors } = validateOrderPayload(payload);
  if (!valid) throw new ValidationError(errors);

  // Nunca confie no preço vindo do navegador: reconstrói cada item a partir do
  // catálogo, aproveitando do cliente só slug, qty e note.
  const items = payload.items.map((item) => {
    const wine = Catalog.findBySlug(item.slug);
    return { slug: wine.slug, name: wine.name, price: wine.price, qty: item.qty, note: item.note };
  });

  const totals = Pricing.computeTotals(items, payload.couponCode, payload.delivery.freightCost || 0);

  const row = {
    fullName: payload.customer.fullName.trim(),
    birthDate: payload.customer.birthDate,
    cpf: payload.customer.cpf,
    phone: payload.customer.phone,
    email: payload.customer.email,
    deliveryType: payload.delivery.type,
    address: payload.delivery.address,
    items,
    couponCode: totals.couponCode,
    subtotal: totals.subtotal,
    discount: totals.discount,
    freight: totals.freight,
    total: totals.total,
    paymentMethod: payload.paymentMethod
  };

  // CREATE TABLE IF NOT EXISTS é idempotente e barato: garante que a tabela
  // exista em um banco recém-criado, sem precisar de um passo de migração.
  await db.ensureSchema(deps.execute);
  const { id } = await db.insertOrder(deps.execute, row);
  return { id, ...totals };
}

async function listOrdersForAdmin(deps) {
  // Cobre o caso de abrir /admin antes do primeiro pedido (tabela ainda não existe).
  await db.ensureSchema(deps.execute);
  return db.listOrders(deps.execute);
}

async function setOrderStatus(deps, id, status) {
  return db.updateOrderStatus(deps.execute, id, status);
}

// Fonte de verdade para o que será cobrado: o pedido já gravado, com os preços
// reconstruídos do catálogo por createOrder — nunca o total/itens que o
// navegador manda em /api/create-payment.
async function getOrderForPayment(deps, id) {
  return db.getOrderById(deps.execute, id);
}

module.exports = { ValidationError, MAX_QTY_PER_ITEM, isAdult, validateOrderPayload, createOrder, listOrdersForAdmin, setOrderStatus, getOrderForPayment };
