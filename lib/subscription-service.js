// lib/subscription-service.js — assinaturas do Clube V&H Personnalité: o que o
// administrador vê e faz (link de pagamento, confirmar pagamento, cancelar) e o
// que o próprio cliente vê na área dele. O status só muda por aqui, e só o
// administrador o muda: o cliente nunca tem esse poder.
const defaultDb = require('./db.js');
const Clube = require('../js/clube.js');

function dbOf(deps) {
  return deps.db || defaultDb;
}

async function ensureSchemas(deps, db) {
  await db.ensureSubscribersSchema(deps.execute);
  await db.ensureSubscriptionsSchema(deps.execute);
}

function iso(value) {
  if (value === null || value === undefined) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Dados da assinatura em si (sem os do cliente).
function baseApi(row) {
  return {
    id: row.id,
    subscriberId: row.subscriber_id,
    status: row.status,
    statusLabel: Clube.statusLabel(row.status),
    plan: row.plan,
    priceCents: row.price_cents,
    requestedAt: iso(row.requested_at),
    activatedAt: iso(row.activated_at),
    cancelledAt: iso(row.cancelled_at),
    paymentLink: row.payment_link || null,
    paymentLinkSentAt: iso(row.payment_link_sent_at)
  };
}

// Linha da lista do painel: a assinatura mais os dados do cliente (nunca a senha).
function listItem(row) {
  return {
    ...baseApi(row),
    name: row.name,
    phone: row.phone,
    email: row.email,
    cpf: row.cpf || null,
    birthDate: row.birth_date || null,
    address: {
      cep: row.address_cep || null,
      street: row.address_street || null,
      number: row.address_number || null,
      complement: row.address_complement || null,
      neighborhood: row.address_neighborhood || null,
      city: row.address_city || null,
      state: row.address_state || null,
      reference: row.address_reference || null
    },
    outsideSaoPaulo: !!row.address_state && row.address_state !== 'SP',
    questionnaireAnswered: !!row.questionnaire_answered
  };
}

function eventApi(row) {
  return { id: row.id, from: row.from_status || null, to: row.to_status, actor: row.actor, note: row.note || null, createdAt: iso(row.created_at) };
}

// ---- painel administrativo ------------------------------------------------

async function adminList(deps) {
  const db = dbOf(deps);
  await ensureSchemas(deps, db);
  await db.ensureQuestionnaireSchema(deps.execute);
  const subscriptions = (await db.listSubscriptions(deps.execute)).map(listItem);
  const counts = { total: subscriptions.length };
  Clube.STATUSES.forEach((status) => { counts[status] = subscriptions.filter((s) => s.status === status).length; });
  return { subscriptions, counts };
}

// Histórico de mudanças de uma assinatura, ou null se ela não existe.
async function adminEvents(deps, id) {
  const db = dbOf(deps);
  await ensureSchemas(deps, db);
  if (!(await db.getSubscription(deps.execute, id))) return null;
  return (await db.listSubscriptionEvents(deps.execute, id)).map(eventApi);
}

// { status: 'ok', subscription } | 'invalid' (link) | 'closed' (já cancelada) | 'not_found'
async function adminSetLink(deps, id, link) {
  const db = dbOf(deps);
  await ensureSchemas(deps, db);
  const current = await db.getSubscription(deps.execute, id);
  if (!current) return { status: 'not_found' };
  if (current.status === 'cancelled') return { status: 'closed' };
  const clean = typeof link === 'string' ? link.trim() : '';
  if (!Clube.isValidPaymentLink(clean)) return { status: 'invalid' };

  const row = await db.setSubscriptionPaymentLink(deps.execute, id, clean);
  await db.insertSubscriptionEvent(deps.execute, { subscriptionId: id, from: current.status, to: current.status, actor: 'admin', note: 'Link de pagamento cadastrado' });
  return { status: 'ok', subscription: baseApi(row) };
}

// Anota que o link foi enviado ao cliente (por e-mail ou WhatsApp). Enviar o
// link não ativa nada: a assinatura continua aguardando o pagamento.
async function adminMarkSent(deps, id) {
  const db = dbOf(deps);
  await ensureSchemas(deps, db);
  const current = await db.getSubscription(deps.execute, id);
  if (!current) return { status: 'not_found' };
  if (!current.payment_link) return { status: 'no_link' };
  const row = await db.markPaymentLinkSent(deps.execute, id);
  await db.insertSubscriptionEvent(deps.execute, { subscriptionId: id, from: current.status, to: current.status, actor: 'admin', note: 'Link de pagamento enviado ao cliente' });
  return { status: 'ok', subscription: baseApi(row) };
}

const DEFAULT_NOTES = {
  active: 'Pagamento confirmado pelo administrador',
  payment_pending: 'Pagamento marcado como pendente',
  cancelled: 'Assinatura cancelada pelo administrador',
  suspended: 'Assinatura suspensa'
};

// { status: 'ok', subscription } | 'not_found' | 'invalid_transition' | 'conflict'
async function adminTransition(deps, id, to, note) {
  const db = dbOf(deps);
  await ensureSchemas(deps, db);
  const current = await db.getSubscription(deps.execute, id);
  if (!current) return { status: 'not_found' };
  if (!Clube.canTransition(current.status, to)) return { status: 'invalid_transition' };

  const text = typeof note === 'string' && note.trim() !== '' ? note.trim().slice(0, 300) : (DEFAULT_NOTES[to] || null);
  const row = await db.transitionSubscription(deps.execute, id, current.status, to, 'admin', text);
  if (!row) return { status: 'conflict' };
  return { status: 'ok', subscription: baseApi(row) };
}

// Para o cliente que já era assinante antes do site: o administrador cria a
// assinatura dele, já ativa (ou aguardando pagamento).
async function adminCreate(deps, subscriberId, status) {
  if (status !== 'active' && status !== 'awaiting_payment') return { status: 'invalid' };
  const db = dbOf(deps);
  await ensureSchemas(deps, db);
  if (!(await db.getSubscriberBy(deps.execute, 'id', subscriberId))) return { status: 'not_found' };
  const row = await db.insertSubscription(deps.execute, { subscriberId, plan: Clube.PLAN.id, priceCents: Clube.PLAN.priceCents, status });
  if (!row) return { status: 'exists' };
  await db.insertSubscriptionEvent(deps.execute, { subscriptionId: row.id, from: null, to: status, actor: 'admin', note: 'Cadastrada pelo administrador' });
  return { status: 'ok', subscription: baseApi(row) };
}

// ---- área do assinante ----------------------------------------------------

// A assinatura mais recente do próprio cliente, ou null. O link de pagamento só
// aparece enquanto há pagamento a fazer.
async function mine(deps, subscriber) {
  const db = dbOf(deps);
  await ensureSchemas(deps, db);
  const row = await db.getLatestSubscription(deps.execute, subscriber.id);
  if (!row) return null;
  const api = baseApi(row);
  const due = row.status === 'awaiting_payment' || row.status === 'payment_pending';
  return {
    id: api.id,
    status: api.status,
    statusLabel: api.statusLabel,
    priceCents: api.priceCents,
    requestedAt: api.requestedAt,
    activatedAt: api.activatedAt,
    paymentLink: due ? api.paymentLink : null
  };
}

module.exports = { adminList, adminEvents, adminSetLink, adminMarkSent, adminTransition, adminCreate, mine };
