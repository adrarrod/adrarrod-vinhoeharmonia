// lib/subscribers-service.js — cadastro de assinantes (uso interno, via painel admin).
const defaultDb = require('./db.js');
const subscriptions = require('./subscription-service.js');

class ValidationError extends Error {
  constructor(errors) {
    super(`Invalid subscriber: ${errors.join(', ')}`);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

// Celular ou e-mail já cadastrado em outro assinante (os dois servem de login).
class DuplicateError extends Error {
  constructor(field) {
    super(`Subscriber already exists with this ${field}`);
    this.name = 'DuplicateError';
    this.field = field;
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

  // Minúsculas: o e-mail é usado como login e não deve depender de como foi digitado.
  const rawEmail = text(p.email);
  const email = rawEmail === null ? null : rawEmail.toLowerCase();
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

// Para telas que exigem o e-mail (questionário): { value, reason }, com reason
// null, 'required' (vazio) ou 'invalid'. O valor sai em minúsculas.
function parseRequiredEmail(raw) {
  const value = text(raw);
  if (value === null) return { value: null, reason: 'required' };
  const lower = value.toLowerCase();
  if (!EMAIL_RE.test(lower) || lower.length > MAX.email) return { value: null, reason: 'invalid' };
  return { value: lower, reason: null };
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

async function assertNoDuplicate(deps, db, value, excludeId) {
  const conflicts = await db.findSubscriberConflicts(deps.execute, { phone: value.phone, email: value.email, excludeId });
  if (!conflicts.length) return;
  throw new DuplicateError(conflicts.some((c) => c.phone === value.phone) ? 'phone' : 'email');
}

async function createSubscriber(deps, payload) {
  const { valid, errors, value } = validateSubscriber(payload);
  if (!valid) throw new ValidationError(errors);
  const db = dbOf(deps);
  await db.ensureSubscribersSchema(deps.execute);
  await assertNoDuplicate(deps, db, value, null);
  const row = await db.insertSubscriber(deps.execute, value);
  // Quem o administrador cadastra já é assinante: nasce com a assinatura do clube
  // ativa. Se ela não puder ser criada, o cadastro também é desfeito.
  try {
    const created = await subscriptions.adminCreate(deps, row.id, 'active');
    if (created.status !== 'ok') throw new Error('could not create the subscription');
  } catch (err) {
    try { await db.deleteSubscriber(deps.execute, row.id); } catch (cleanup) { /* o erro original é o que importa */ }
    throw err;
  }
  return toApi(row);
}

// Devolve o assinante atualizado, ou null se o id não existe.
async function updateSubscriber(deps, id, payload) {
  const { valid, errors, value } = validateSubscriber(payload);
  if (!valid) throw new ValidationError(errors);
  const db = dbOf(deps);
  await db.ensureSubscribersSchema(deps.execute);
  await assertNoDuplicate(deps, db, value, id);
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

// "Esqueci minha senha": volta o assinante para a senha inicial (123mudar).
async function resetSubscriberPassword(deps, id) {
  const db = dbOf(deps);
  await db.ensureSubscribersSchema(deps.execute);
  return db.setSubscriberPasswordHash(deps.execute, id, null);
}

module.exports = { ValidationError, DuplicateError, resetSubscriberPassword, parseRequiredEmail, validateSubscriber, toApi, createSubscriber, updateSubscriber, listSubscribers, removeSubscriber };
