// lib/subscribers-service.js — cadastro de assinantes (uso interno, via painel admin).
const defaultDb = require('./db.js');

class ValidationError extends Error {
  constructor(errors) {
    super(`Invalid subscriber: ${errors.join(', ')}`);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Limites de tamanho: o formulário é de uso interno, mas o limite protege o
// banco de um texto colado por engano.
const MAX = { name: 120, email: 254, street: 120, complement: 120, number: 20, neighborhood: 120, city: 120 };

function dbOf(deps) {
  return deps.db || defaultDb;
}

// Texto digitado -> texto sem espaços nas pontas, ou null se ficou vazio.
function text(value) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t === '' ? null : t;
}

// Valida e normaliza o formulário. Só nome e telefone são obrigatórios.
// Telefone e CEP são guardados só com números (formatação é da tela).
function validateSubscriber(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const errors = [];

  const name = text(p.name);
  if (!name) errors.push('name');

  const phoneDigits = typeof p.phone === 'string' ? p.phone.replace(/\D/g, '') : '';
  if (!/^\d{10,11}$/.test(phoneDigits)) errors.push('phone');

  const email = text(p.email);
  if (email !== null && !EMAIL_RE.test(email)) errors.push('email');

  const value = {
    name,
    phone: /^\d{10,11}$/.test(phoneDigits) ? phoneDigits : null,
    email,
    street: text(p.street),
    complement: text(p.complement),
    number: text(p.number),
    neighborhood: text(p.neighborhood),
    city: text(p.city),
    state: null,
    cep: null
  };

  for (const field of Object.keys(MAX)) {
    if (value[field] !== null && value[field].length > MAX[field]) errors.push(field);
  }

  const state = text(p.state);
  if (state !== null) {
    if (/^[A-Za-z]{2}$/.test(state)) value.state = state.toUpperCase();
    else errors.push('state');
  }

  const cep = text(p.cep);
  if (cep !== null) {
    const digits = cep.replace(/\D/g, '');
    if (/^\d{8}$/.test(digits) && /^[\d\-.\s]+$/.test(cep)) value.cep = digits;
    else errors.push('cep');
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)], value };
}

// Forma entregue ao painel (camelCase), em vez das colunas address_* do banco.
function toApi(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    street: row.address_street,
    complement: row.address_complement,
    number: row.address_number,
    neighborhood: row.address_neighborhood,
    city: row.address_city,
    state: row.address_state,
    cep: row.address_cep,
    createdAt: row.created_at
  };
}

async function createSubscriber(deps, payload) {
  const { valid, errors, value } = validateSubscriber(payload);
  if (!valid) throw new ValidationError(errors);
  const db = dbOf(deps);
  await db.ensureSubscribersSchema(deps.execute);
  return toApi(await db.insertSubscriber(deps.execute, value));
}

// Devolve o assinante atualizado, ou null se o id não existe.
async function updateSubscriber(deps, id, payload) {
  const { valid, errors, value } = validateSubscriber(payload);
  if (!valid) throw new ValidationError(errors);
  const db = dbOf(deps);
  await db.ensureSubscribersSchema(deps.execute);
  const row = await db.updateSubscriber(deps.execute, id, value);
  return row ? toApi(row) : null;
}

async function listSubscribers(deps) {
  const db = dbOf(deps);
  await db.ensureSubscribersSchema(deps.execute);
  return (await db.listSubscribers(deps.execute)).map(toApi);
}

async function removeSubscriber(deps, id) {
  const db = dbOf(deps);
  await db.ensureSubscribersSchema(deps.execute);
  return db.deleteSubscriber(deps.execute, id);
}

module.exports = { ValidationError, validateSubscriber, toApi, createSubscriber, updateSubscriber, listSubscribers, removeSubscriber };
