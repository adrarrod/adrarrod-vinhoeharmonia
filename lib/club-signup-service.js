// lib/club-signup-service.js — contratação do Clube V&H Personnalité.
// Duas portas, a mesma regra: `signup` (cliente novo: cria a conta e a
// solicitação) e `contract` (cliente que já tem conta: completa os dados e
// solicita). A assinatura nasce "Aguardando pagamento"; só o administrador a
// ativa, depois de confirmar o pagamento.
const defaultDb = require('./db.js');
const password = require('./password.js');
const session = require('./subscriber-session.js');
const area = require('./subscriber-area-service.js');
const { parseRequiredEmail } = require('./subscribers-service.js');
const Clube = require('../js/clube.js');
const Questionario = require('../js/questionario.js');

function dbOf(deps) {
  return deps.db || defaultDb;
}

function nowOf(deps) {
  return deps.now ? deps.now() : Date.now();
}

function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

// Campo de texto obrigatório com limite: devolve { value, error }.
function required(value, max) {
  const t = text(value);
  if (t === null) return { value: null, error: 'required' };
  if (t.length > max) return { value: null, error: 'invalid' };
  return { value: t, error: null };
}

function optional(value, max) {
  const t = text(value);
  if (t === null) return { value: null, error: null };
  return t.length > max ? { value: null, error: 'invalid' } : { value: t, error: null };
}

const CONSENTS = ['age18', 'terms', 'privacy', 'subscription'];

// A rota de cadastro é pública: passando deste número de solicitações por hora,
// o site segura novas (provável cadastro em massa) até a fila baixar.
const MAX_REQUESTS_PER_HOUR = 30;

// Confere o que o cliente enviou. `withAccount` = cadastro novo (pede nome,
// e-mail, celular e senha); sem ele, só CPF, nascimento, endereço e aceites.
// Devolve { errors, value }; errors vazio = tudo certo.
function validate(payload, now, { withAccount }) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const a = p.address && typeof p.address === 'object' ? p.address : {};
  const c = p.consents && typeof p.consents === 'object' ? p.consents : {};
  const errors = {};
  const value = {};
  const take = (key, field) => { if (field.error) errors[key] = field.error; else value[key] = field.value; };

  if (withAccount) {
    const name = required(p.name, 120);
    if (!name.error && !/\S+\s+\S+/.test(name.value)) name.error = 'invalid';
    take('name', name);

    const email = parseRequiredEmail(p.email);
    if (email.reason) errors.email = email.reason; else value.email = email.value;

    if (text(p.phone) === null) errors.phone = 'required';
    else if (!Clube.isValidMobile(p.phone)) errors.phone = 'invalid';
    else value.phone = Clube.cleanDigits(p.phone);
  }

  if (text(p.cpf) === null) errors.cpf = 'required';
  else if (!Clube.isValidCpf(p.cpf)) errors.cpf = 'invalid';
  else value.cpf = Clube.cleanDigits(p.cpf);

  if (text(p.birthDate) === null) errors.birthDate = 'required';
  else if (!Clube.isValidBirthDate(p.birthDate, now)) errors.birthDate = 'invalid';
  else if (!Clube.isAdult(p.birthDate, now)) errors.birthDate = 'underage';
  else value.birthDate = p.birthDate;

  if (text(a.cep) === null) errors.cep = 'required';
  else if (!/^\d{8}$/.test(Clube.cleanDigits(a.cep))) errors.cep = 'invalid';
  else if (!Clube.isSaoPauloCep(a.cep)) errors.cep = 'outside_area';
  else value.cep = Clube.cleanDigits(a.cep);

  take('street', required(a.street, 120));
  take('number', required(a.number, 20));
  take('neighborhood', required(a.neighborhood, 120));
  take('city', required(a.city, 120));
  take('complement', optional(a.complement, 120));
  take('reference', optional(a.reference, 200));

  const state = text(a.state);
  if (state === null) errors.state = 'required';
  else if (state.toUpperCase() !== 'SP') errors.state = 'outside_area';
  else value.state = 'SP';

  if (withAccount) {
    if (typeof p.password !== 'string' || p.password === '') errors.password = 'weak';
    else if (!password.validateNewPassword(p.password)) errors.password = 'weak';
    if (p.password !== p.passwordConfirm) errors.passwordConfirm = 'mismatch';
  }

  CONSENTS.forEach((key) => { if (c[key] !== true) errors[key] = 'required'; });
  value.marketing = c.marketing === true;

  // O questionário pode ficar para depois; se vier, tem de estar completo e válido.
  value.answers = null;
  if (p.answers !== null && p.answers !== undefined) {
    const checked = Questionario.validateAnswers(p.answers);
    if (!checked.valid) errors.answers = checked.errors;
    else value.answers = checked.value;
  }

  return { errors, value };
}

function conflictField(conflicts, value) {
  if (conflicts.some((x) => x.cpf && x.cpf === value.cpf)) return 'cpf';
  if (conflicts.some((x) => x.email && value.email && x.email.toLowerCase() === value.email)) return 'email';
  return 'phone';
}

async function ensureSchemas(deps, db) {
  await db.ensureSubscribersSchema(deps.execute);
  await db.ensureQuestionnaireSchema(deps.execute);
  await db.ensureSubscriptionsSchema(deps.execute);
}

function consentEntries(value) {
  return CONSENTS.concat('marketing').map((type) => ({
    type,
    version: Clube.LEGAL_VERSION,
    accepted: type === 'marketing' ? value.marketing : true
  }));
}

function subscriptionApi(row) {
  return { id: row.id, status: row.status, priceCents: row.price_cents };
}

// Grava consentimentos, questionário e a solicitação. Devolve a assinatura
// criada, ou null se o cliente já tem uma aberta.
async function recordRequest(deps, db, subscriberId, value) {
  const subscription = await db.insertSubscription(deps.execute, {
    subscriberId, plan: Clube.PLAN.id, priceCents: Clube.PLAN.priceCents, status: 'awaiting_payment'
  });
  if (!subscription) return null;
  await db.insertConsents(deps.execute, subscriberId, consentEntries(value));
  if (value.answers) await db.insertQuestionnaireResponse(deps.execute, subscriberId, Questionario.VERSION, value.answers);
  await db.insertSubscriptionEvent(deps.execute, {
    subscriptionId: subscription.id, from: null, to: 'awaiting_payment', actor: 'cliente', note: 'Solicitação feita pelo site'
  });
  return subscription;
}

// Cliente novo.
async function signup(deps, payload) {
  if (!deps.clubOpen) return { status: 'closed' };
  if (payload && typeof payload === 'object' && text(payload.website) !== null) return { status: 'invalid', errors: {} };

  const { errors, value } = validate(payload, nowOf(deps), { withAccount: true });
  if (Object.keys(errors).length) return { status: 'invalid', errors };

  const db = dbOf(deps);
  await ensureSchemas(deps, db);

  if ((await db.countRecentSubscriptions(deps.execute, 60)) >= MAX_REQUESTS_PER_HOUR) return { status: 'busy' };

  const conflicts = await db.findSignupConflicts(deps.execute, { phone: value.phone, email: value.email, cpf: value.cpf });
  if (conflicts.length) return { status: 'exists', field: conflictField(conflicts, value) };

  const passwordHash = await password.hashPassword(payload.password);
  const row = await db.insertSubscriberWithProfile(deps.execute, { ...value, passwordHash });
  let subscription;
  try {
    subscription = await recordRequest(deps, db, row.id, value);
    if (!subscription) throw new Error('could not create the subscription');
  } catch (err) {
    // Nada de cadastro pela metade: sem a solicitação, a conta também sai.
    try { await db.deleteSubscriber(deps.execute, row.id); } catch (cleanup) { /* o erro original é o que importa */ }
    throw err;
  }

  return {
    status: 'ok',
    subscriber: area.toArea(row),
    token: session.signToken(row.id, deps.sessionSecret, password.fingerprint(passwordHash), nowOf(deps)),
    subscription: subscriptionApi(subscription)
  };
}

// Cliente que já tem conta (cadastrado pelo admin): completa os dados e solicita.
async function contract(deps, subscriber, payload) {
  if (!deps.clubOpen) return { status: 'closed' };

  const { errors, value } = validate(payload, nowOf(deps), { withAccount: false });
  if (Object.keys(errors).length) return { status: 'invalid', errors };

  const db = dbOf(deps);
  await ensureSchemas(deps, db);

  // Só o CPF precisa ser conferido: o celular e o e-mail já são deste cliente.
  const conflicts = await db.findSignupConflicts(deps.execute, { phone: '', email: null, cpf: value.cpf, excludeId: subscriber.id });
  if (conflicts.length) return { status: 'exists', field: 'cpf' };

  await db.updateSubscriberProfile(deps.execute, subscriber.id, value);
  const subscription = await recordRequest(deps, db, subscriber.id, value);
  if (!subscription) return { status: 'already_subscribed' };
  return { status: 'ok', subscription: subscriptionApi(subscription) };
}

module.exports = { signup, contract };
