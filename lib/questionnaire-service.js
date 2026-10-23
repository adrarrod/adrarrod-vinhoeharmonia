// lib/questionnaire-service.js — questionário do Clube V&H Personnalité: grava e
// lê as respostas. Quem responde é sempre o assinante da sessão (a linha do
// banco vinda do cookie): nenhum id enviado pela página é levado em conta.
const defaultDb = require('./db.js');
const Q = require('../js/questionario.js');
const { parseRequiredEmail } = require('./subscribers-service.js');
const { buildCsv } = require('./questionnaire-csv.js');

// errors = { email?: 'required'|'invalid'|'duplicate', answers?: { q2: 'required', ... } }
class QuestionnaireError extends Error {
  constructor(errors) {
    super('Invalid questionnaire submission');
    this.name = 'QuestionnaireError';
    this.errors = errors;
  }
}

function dbOf(deps) {
  return deps.db || defaultDb;
}

async function ensureSchemas(deps, db) {
  await db.ensureSubscribersSchema(deps.execute);
  await db.ensureQuestionnaireSchema(deps.execute);
}

function iso(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function answersOf(row) {
  return typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers;
}

async function submit(deps, subscriber, payload) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const email = parseRequiredEmail(body.email);
  const answers = Q.validateAnswers(body.answers);

  const errors = {};
  if (email.reason) errors.email = email.reason;
  if (!answers.valid) errors.answers = answers.errors;
  if (Object.keys(errors).length) throw new QuestionnaireError(errors);

  const db = dbOf(deps);
  await ensureSchemas(deps, db);

  // O e-mail também é login: não pode ser de outro assinante.
  const conflicts = await db.findSubscriberConflicts(deps.execute, { phone: null, email: email.value, excludeId: subscriber.id });
  if (conflicts.length) throw new QuestionnaireError({ email: 'duplicate' });

  if (!subscriber.email || subscriber.email.toLowerCase() !== email.value) {
    await db.updateSubscriberEmail(deps.execute, subscriber.id, email.value);
  }
  const saved = await db.insertQuestionnaireResponse(deps.execute, subscriber.id, Q.VERSION, answers.value);
  return { submittedAt: iso(saved.created_at) };
}

// O que a página precisa para abrir o questionário: o e-mail do cadastro e as
// respostas atuais (para o assinante poder revisar e atualizar).
async function load(deps, subscriber) {
  const db = dbOf(deps);
  await ensureSchemas(deps, db);
  const latest = await db.getLatestQuestionnaireResponse(deps.execute, subscriber.id);
  return {
    email: subscriber.email || '',
    response: latest ? { version: latest.version, answers: answersOf(latest), submittedAt: iso(latest.created_at) } : null
  };
}

async function statusFor(deps, subscriber) {
  const db = dbOf(deps);
  await ensureSchemas(deps, db);
  const latest = await db.getLatestQuestionnaireResponse(deps.execute, subscriber.id);
  return { answered: !!latest, submittedAt: latest ? iso(latest.created_at) : null };
}

// ---- painel administrativo ------------------------------------------------

async function adminList(deps) {
  const db = dbOf(deps);
  await ensureSchemas(deps, db);
  return (await db.listLatestQuestionnaireResponses(deps.execute)).map((r) => ({
    subscriberId: r.subscriber_id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    version: r.version,
    submissions: r.submissions,
    firstSubmittedAt: iso(r.first_submitted_at),
    submittedAt: iso(r.created_at),
    answers: answersOf(r)
  }));
}

// Todos os envios de um assinante (o mais novo primeiro), ou null se ele não existe.
async function adminDetail(deps, subscriberId) {
  const db = dbOf(deps);
  await ensureSchemas(deps, db);
  const subscriber = await db.getSubscriberBy(deps.execute, 'id', subscriberId);
  if (!subscriber) return null;
  const history = await db.listQuestionnaireHistory(deps.execute, subscriberId);
  return {
    subscriber: { id: subscriber.id, name: subscriber.name, phone: subscriber.phone, email: subscriber.email },
    submissions: history.map((r) => ({ id: r.id, version: r.version, submittedAt: iso(r.created_at), answers: answersOf(r) }))
  };
}

async function exportCsv(deps) {
  return buildCsv(await adminList(deps));
}

module.exports = { QuestionnaireError, submit, load, statusFor, adminList, adminDetail, exportCsv };
