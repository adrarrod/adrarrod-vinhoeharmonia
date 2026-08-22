// lib/orders-service.js
const Pricing = require('../js/pricing.js');
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

  const d = payload.delivery || {};
  if (d.type === 'delivery') {
    const a = d.address || {};
    for (const field of ['street', 'number', 'cep', 'neighborhood', 'city', 'state']) {
      if (!a[field] || !String(a[field]).trim()) errors.push(field);
    }
    if (a.cep && !CEP_RE.test(a.cep)) errors.push('cep');
  } else if (d.type !== 'pickup') {
    errors.push('deliveryType');
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) errors.push('items');
  if (!['pix', 'card'].includes(payload.paymentMethod)) errors.push('paymentMethod');

  return { valid: errors.length === 0, errors };
}

async function createOrder(deps, payload) {
  const { valid, errors } = validateOrderPayload(payload);
  if (!valid) throw new ValidationError(errors);

  const totals = Pricing.computeTotals(payload.items, payload.couponCode, payload.delivery.freightCost || 0);

  const row = {
    fullName: payload.customer.fullName.trim(),
    birthDate: payload.customer.birthDate,
    cpf: payload.customer.cpf,
    phone: payload.customer.phone,
    email: payload.customer.email,
    deliveryType: payload.delivery.type,
    address: payload.delivery.type === 'delivery'
      ? payload.delivery.address
      : { street: '', number: '', complement: '', cep: '', neighborhood: '', city: '', state: '' },
    items: payload.items,
    couponCode: totals.couponCode,
    subtotal: totals.subtotal,
    discount: totals.discount,
    freight: totals.freight,
    total: totals.total,
    paymentMethod: payload.paymentMethod
  };

  const { id } = await db.insertOrder(deps.execute, row);
  return { id, ...totals };
}

async function listOrdersForAdmin(deps) {
  return db.listOrders(deps.execute);
}

async function setOrderStatus(deps, id, status) {
  return db.updateOrderStatus(deps.execute, id, status);
}

module.exports = { ValidationError, isAdult, validateOrderPayload, createOrder, listOrdersForAdmin, setOrderStatus };
