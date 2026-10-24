// test/subscription-service.test.js — assinaturas: painel administrativo e área do assinante
const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../lib/subscription-service.js');

const NOW = Date.parse('2026-10-24T15:00:00Z');

function fakeDb() {
  const subscribers = [
    { id: 1, name: 'Maria Silva', phone: '11987654321', email: 'maria@x.com', cpf: '52998224725', birth_date: '1990-05-17', address_cep: '01310100', address_street: 'Avenida Paulista', address_number: '1000', address_complement: null, address_neighborhood: 'Bela Vista', address_city: 'São Paulo', address_state: 'SP', address_reference: null },
    { id: 2, name: 'João Antigo', phone: '11977776666', email: 'joao@x.com', cpf: null, birth_date: null, address_cep: '20040020', address_street: 'Rua do Rio', address_number: '5', address_complement: null, address_neighborhood: 'Centro', address_city: 'Rio de Janeiro', address_state: 'RJ', address_reference: null }
  ];
  const state = { subscribers, subscriptions: [], events: [], answered: new Set() };
  const open = ['awaiting_payment', 'active', 'payment_pending', 'suspended'];
  return Object.assign(state, {
    async ensureSubscribersSchema() {},
    async ensureQuestionnaireSchema() {},
    async ensureSubscriptionsSchema() {},
    async getSubscriberBy(_e, field, value) { return subscribers.find((s) => s[field] === value) || null; },
    async insertSubscription(_e, { subscriberId, plan, priceCents, status }) {
      if (state.subscriptions.some((s) => s.subscriber_id === subscriberId && s.plan === plan && open.includes(s.status))) return null;
      const row = { id: state.subscriptions.length + 1, subscriber_id: subscriberId, plan, price_cents: priceCents, status, payment_link: null, payment_link_sent_at: null, requested_at: new Date(NOW).toISOString(), activated_at: status === 'active' ? new Date(NOW).toISOString() : null, cancelled_at: null };
      state.subscriptions.push(row);
      return row;
    },
    async insertSubscriptionEvent(_e, ev) { state.events.push({ ...ev, created_at: new Date(NOW + state.events.length).toISOString(), id: state.events.length + 1 }); },
    async getSubscription(_e, id) { return state.subscriptions.find((s) => s.id === id) || null; },
    async getLatestSubscription(_e, subscriberId) { const mine = state.subscriptions.filter((s) => s.subscriber_id === subscriberId); return mine.length ? mine[mine.length - 1] : null; },
    async transitionSubscription(_e, id, from, to, actor, note) {
      const s = state.subscriptions.find((x) => x.id === id && x.status === from);
      if (!s) return null;
      s.status = to;
      if (to === 'active' && !s.activated_at) s.activated_at = new Date(NOW).toISOString();
      if (to === 'cancelled') s.cancelled_at = new Date(NOW).toISOString();
      state.events.push({ subscriptionId: id, from, to, actor, note, id: state.events.length + 1, created_at: new Date(NOW + state.events.length).toISOString() });
      return s;
    },
    async setSubscriptionPaymentLink(_e, id, link) { const s = state.subscriptions.find((x) => x.id === id); if (!s) return null; s.payment_link = link; s.payment_link_sent_at = null; return s; },
    async markPaymentLinkSent(_e, id) { const s = state.subscriptions.find((x) => x.id === id && x.payment_link); if (!s) return null; s.payment_link_sent_at = new Date(NOW).toISOString(); return s; },
    async listSubscriptions() {
      return state.subscriptions.map((s) => ({ ...s, ...subscribers.find((x) => x.id === s.subscriber_id), id: s.id, questionnaire_answered: state.answered.has(s.subscriber_id) })).reverse();
    },
    async listSubscriptionEvents(_e, id) { return state.events.filter((e) => e.subscriptionId === id).reverse().map((e) => ({ id: e.id, subscription_id: id, from_status: e.from, to_status: e.to, actor: e.actor, note: e.note, created_at: e.created_at })); }
  });
}
const deps = (db) => ({ execute: async () => ({ rows: [] }), db, now: () => NOW });

async function seed(db) {
  const a = await svc.adminCreate(deps(db), 1, 'awaiting_payment');
  return a.subscription.id;
}

// -------------------------------------------------------------- cadastro admin --

test('the admin can register a subscription for a client who already exists, active or waiting for payment', async () => {
  const db = fakeDb();
  const active = await svc.adminCreate(deps(db), 1, 'active');
  assert.equal(active.status, 'ok');
  assert.equal(active.subscription.status, 'active');
  assert.equal(active.subscription.priceCents, 12000);
  assert.deepEqual(db.events, [{ subscriptionId: 1, from: null, to: 'active', actor: 'admin', note: 'Cadastrada pelo administrador', id: 1, created_at: db.events[0].created_at }]);

  const waiting = await svc.adminCreate(deps(db), 2, 'awaiting_payment');
  assert.equal(waiting.subscription.status, 'awaiting_payment');
});

test('a subscription cannot be registered with another status, for a missing client, or twice while one is open', async () => {
  const db = fakeDb();
  assert.deepEqual(await svc.adminCreate(deps(db), 1, 'cancelled'), { status: 'invalid' });
  assert.deepEqual(await svc.adminCreate(deps(db), 1, 'xyz'), { status: 'invalid' });
  assert.deepEqual(await svc.adminCreate(deps(db), 99, 'active'), { status: 'not_found' });
  await svc.adminCreate(deps(db), 1, 'active');
  assert.deepEqual(await svc.adminCreate(deps(db), 1, 'active'), { status: 'exists' });
  assert.equal(db.subscriptions.length, 1);
});

// ---------------------------------------------------------------------- lista --

test('the admin list has every request with the client data, the delivery address and the counts by status', async () => {
  const db = fakeDb();
  await svc.adminCreate(deps(db), 1, 'awaiting_payment');
  await svc.adminCreate(deps(db), 2, 'active');
  db.answered.add(1);
  const { subscriptions, counts } = await svc.adminList(deps(db));

  assert.deepEqual(counts, { total: 2, awaiting_payment: 1, active: 1, payment_pending: 0, cancelled: 0, suspended: 0 });
  const maria = subscriptions.find((s) => s.subscriberId === 1);
  assert.equal(maria.status, 'awaiting_payment');
  assert.equal(maria.statusLabel, 'Aguardando pagamento');
  assert.equal(maria.name, 'Maria Silva');
  assert.equal(maria.cpf, '52998224725');
  assert.equal(maria.birthDate, '1990-05-17');
  assert.deepEqual(maria.address, { cep: '01310100', street: 'Avenida Paulista', number: '1000', complement: null, neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP', reference: null });
  assert.equal(maria.outsideSaoPaulo, false);
  assert.equal(maria.questionnaireAnswered, true);
  assert.equal(maria.priceCents, 12000);
  assert.ok(maria.requestedAt);

  const joao = subscriptions.find((s) => s.subscriberId === 2);
  assert.equal(joao.outsideSaoPaulo, true, 'flags an address outside São Paulo');
  assert.equal(joao.questionnaireAnswered, false);
});

test('the admin list never carries a password hash', async () => {
  const db = fakeDb();
  db.subscribers[0].password_hash = 'scrypt$aa$bb';
  await svc.adminCreate(deps(db), 1, 'active');
  assert.ok(!JSON.stringify(await svc.adminList(deps(db))).includes('scrypt'));
});

// ----------------------------------------------------------- link de pagamento --

test('the admin can save the payment link; it must be https and the subscription must still be open', async () => {
  const db = fakeDb();
  const id = await seed(db);
  const ok = await svc.adminSetLink(deps(db), id, ' https://mpago.la/abc123 ');
  assert.equal(ok.status, 'ok');
  assert.equal(ok.subscription.paymentLink, 'https://mpago.la/abc123');
  assert.equal(ok.subscription.paymentLinkSentAt, null);
  assert.equal(db.events.at(-1).note, 'Link de pagamento cadastrado');
  assert.equal(db.events.at(-1).actor, 'admin');

  for (const bad of ['http://x.com/pay', 'mpago.la/abc', 'javascript:alert(1)', '', null]) {
    assert.deepEqual(await svc.adminSetLink(deps(db), id, bad), { status: 'invalid' }, String(bad));
  }
  assert.deepEqual(await svc.adminSetLink(deps(db), 99, 'https://mpago.la/x'), { status: 'not_found' });
  await svc.adminTransition(deps(db), id, 'cancelled');
  assert.deepEqual(await svc.adminSetLink(deps(db), id, 'https://mpago.la/x'), { status: 'closed' });
});

test('marking the link as sent needs a saved link, and is written to the history', async () => {
  const db = fakeDb();
  const id = await seed(db);
  assert.deepEqual(await svc.adminMarkSent(deps(db), id), { status: 'no_link' });
  await svc.adminSetLink(deps(db), id, 'https://mpago.la/abc123');
  const sent = await svc.adminMarkSent(deps(db), id);
  assert.equal(sent.status, 'ok');
  assert.ok(sent.subscription.paymentLinkSentAt);
  assert.equal(db.events.at(-1).note, 'Link de pagamento enviado ao cliente');
  assert.deepEqual(await svc.adminMarkSent(deps(db), 99), { status: 'not_found' });
});

// ----------------------------------------------------------------------- status --

test('confirming the payment is the only way a subscription becomes active, and it is written to the history', async () => {
  const db = fakeDb();
  const id = await seed(db);
  assert.equal(db.subscriptions[0].status, 'awaiting_payment');
  await svc.adminSetLink(deps(db), id, 'https://mpago.la/abc123');
  await svc.adminMarkSent(deps(db), id);
  assert.equal(db.subscriptions[0].status, 'awaiting_payment', 'sending the link does not activate it');

  const r = await svc.adminTransition(deps(db), id, 'active');
  assert.equal(r.status, 'ok');
  assert.equal(r.subscription.status, 'active');
  assert.ok(r.subscription.activatedAt);
  assert.deepEqual([db.events.at(-1).from, db.events.at(-1).to, db.events.at(-1).actor, db.events.at(-1).note], ['awaiting_payment', 'active', 'admin', 'Pagamento confirmado pelo administrador']);
});

test('the admin may add a note to a status change', async () => {
  const db = fakeDb();
  const id = await seed(db);
  await svc.adminTransition(deps(db), id, 'active', '  Pix recebido em 24/10  ');
  assert.equal(db.events.at(-1).note, 'Pix recebido em 24/10');
});

test('only the allowed status changes go through; a cancelled subscription is final', async () => {
  const db = fakeDb();
  const id = await seed(db);
  assert.deepEqual(await svc.adminTransition(deps(db), id, 'payment_pending'), { status: 'invalid_transition' }, 'cannot skip to pending before it was ever active');
  assert.deepEqual(await svc.adminTransition(deps(db), id, 'awaiting_payment'), { status: 'invalid_transition' });
  assert.deepEqual(await svc.adminTransition(deps(db), id, 'nope'), { status: 'invalid_transition' });
  await svc.adminTransition(deps(db), id, 'active');
  assert.equal((await svc.adminTransition(deps(db), id, 'payment_pending')).status, 'ok');
  assert.equal((await svc.adminTransition(deps(db), id, 'active')).status, 'ok');
  assert.equal((await svc.adminTransition(deps(db), id, 'cancelled')).status, 'ok');
  assert.ok(db.subscriptions[0].cancelled_at);
  assert.deepEqual(await svc.adminTransition(deps(db), id, 'active'), { status: 'invalid_transition' });
  assert.deepEqual(await svc.adminTransition(deps(db), 99, 'active'), { status: 'not_found' });
});

test('if the status changed between reading and writing, the change is refused instead of overwriting', async () => {
  const db = fakeDb();
  const id = await seed(db);
  const realTransition = db.transitionSubscription;
  db.transitionSubscription = async (...args) => { db.subscriptions[0].status = 'cancelled'; return realTransition(...args); };
  assert.deepEqual(await svc.adminTransition(deps(db), id, 'active'), { status: 'conflict' });
  assert.equal(db.subscriptions[0].status, 'cancelled');
});

test('the status history lists every change, newest first, or null when the subscription does not exist', async () => {
  const db = fakeDb();
  const id = await seed(db);
  await svc.adminSetLink(deps(db), id, 'https://mpago.la/abc123');
  await svc.adminTransition(deps(db), id, 'active');
  const events = await svc.adminEvents(deps(db), id);
  assert.deepEqual(events.map((e) => [e.from, e.to, e.actor]), [['awaiting_payment', 'active', 'admin'], ['awaiting_payment', 'awaiting_payment', 'admin'], [null, 'awaiting_payment', 'admin']]);
  assert.ok(events.every((e) => e.createdAt));
  assert.equal(await svc.adminEvents(deps(db), 99), null);
});

// -------------------------------------------------------------- área do assinante --

test('the client sees the situation of their own subscription, and the payment link only while payment is due', async () => {
  const db = fakeDb();
  assert.equal(await svc.mine(deps(db), db.subscribers[0]), null, 'no subscription yet');

  const id = await seed(db);
  await svc.adminSetLink(deps(db), id, 'https://mpago.la/abc123');
  const waiting = await svc.mine(deps(db), db.subscribers[0]);
  assert.equal(waiting.status, 'awaiting_payment');
  assert.equal(waiting.statusLabel, 'Aguardando pagamento');
  assert.equal(waiting.priceCents, 12000);
  assert.equal(waiting.paymentLink, 'https://mpago.la/abc123');

  await svc.adminTransition(deps(db), id, 'active');
  const active = await svc.mine(deps(db), db.subscribers[0]);
  assert.equal(active.statusLabel, 'Ativa');
  assert.equal(active.paymentLink, null, 'the link is not shown once it is paid');
  assert.ok(active.activatedAt);

  await svc.adminTransition(deps(db), id, 'payment_pending');
  assert.equal((await svc.mine(deps(db), db.subscribers[0])).paymentLink, 'https://mpago.la/abc123');
});

test('a client never sees another client\'s subscription', async () => {
  const db = fakeDb();
  await seed(db); // da Maria (1)
  assert.equal(await svc.mine(deps(db), db.subscribers[1]), null);
});
