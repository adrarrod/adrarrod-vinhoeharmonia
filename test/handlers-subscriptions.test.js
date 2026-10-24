// test/handlers-subscriptions.test.js — contratação do clube pela API pública
// (área do assinante) e gestão das assinaturas pelo painel administrativo.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const { fakeClubDb, NOW } = require('./helpers/club-fake-db.js');
const auth = require('../lib/auth.js');
const sess = require('../lib/subscriber-session.js');
const { createSubscriberAreaHandler } = require('../lib/handlers/subscriber-area.js');
const { createSubscribersHandler } = require('../lib/handlers/subscribers.js');

const SECRET = 'test-secret';
const PASSWORD = 'admin-pass';

const base = (db, extra = {}) => ({ execute: async () => ({ rows: [] }), db, sessionSecret: SECRET, clubOpen: true, now: () => NOW, ...extra });
const area = (db, extra) => createSubscriberAreaHandler(base(db, extra));
const admin = (db) => createSubscribersHandler({ ...base(db), adminPassword: PASSWORD });
const adminHeaders = () => ({ cookie: `${auth.SESSION_COOKIE_NAME}=${auth.signSession(PASSWORD, SECRET)}` });
const cookieHeader = (token) => ({ cookie: `${sess.COOKIE_NAME}=${token}` });
const cookieOf = (res) => /subscriber_session=([^;]+)/.exec(res.headers['Set-Cookie'])[1];

function signupBody(overrides = {}) {
  return {
    name: 'Maria Silva Souza', email: 'maria@example.com', phone: '(11) 98765-4321', cpf: '529.982.247-25', birthDate: '1990-05-17',
    address: { cep: '01310-100', street: 'Avenida Paulista', number: '1000', complement: '', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP', reference: '' },
    password: 'minha-senha-1', passwordConfirm: 'minha-senha-1',
    consents: { age18: true, terms: true, privacy: true, subscription: true, marketing: false },
    answers: null, website: '',
    ...overrides
  };
}

async function post(handler, query, body, headers = {}) {
  const res = mockRes();
  await handler(mockReq({ method: 'POST', query, body, headers }), res);
  return res;
}

const legacy = { name: 'João Antigo', phone: '11977776666', email: 'joao@x.com' };
async function loginAs(handler, login, password = '123mudar') {
  const res = await post(handler, { action: 'login' }, { login, password });
  return cookieOf(res);
}

// -------------------------------------------------------------- público --

test('GET ?resource=club tells, without any login, whether the club is open for sign-ups', async () => {
  for (const [open, expected] of [[true, true], [false, false]]) {
    const res = mockRes();
    await area(fakeClubDb(), { clubOpen: open })(mockReq({ method: 'GET', query: { resource: 'club' }, headers: {} }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { open: expected });
  }
});

test('POST ?action=signup creates the account and the request, answers 201 and logs the client in', async () => {
  const db = fakeClubDb();
  const handler = area(db);
  const res = await post(handler, { action: 'signup' }, signupBody());
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.subscriber.name, 'Maria Silva Souza');
  assert.equal(res.body.subscription.status, 'awaiting_payment');
  assert.match(res.headers['Set-Cookie'], /^subscriber_session=.+; HttpOnly; Secure; SameSite=Strict/);
  assert.equal(res.headers['Cache-Control'], 'no-store');

  const me = mockRes();
  await handler(mockReq({ method: 'GET', headers: cookieHeader(cookieOf(res)) }), me);
  assert.equal(me.statusCode, 200);
  assert.equal(me.body.subscriber.name, 'Maria Silva Souza');
  assert.equal(me.body.subscriber.usingInitialPassword, false);
  assert.equal(me.body.subscription.status, 'awaiting_payment');
  assert.equal(me.body.subscription.statusLabel, 'Aguardando pagamento');
  assert.equal(me.body.subscription.priceCents, 12000);
});

test('sign-up answers: 403 when the club is closed, 400 with the problems by field, 409 when the client already exists, 429 on a burst', async () => {
  const closed = await post(area(fakeClubDb(), { clubOpen: false }), { action: 'signup' }, signupBody());
  assert.equal(closed.statusCode, 403);
  assert.deepEqual(closed.body, { error: 'club_closed' });

  const db = fakeClubDb();
  const bad = await post(area(db), { action: 'signup' }, signupBody({ cpf: '111.111.111-11', birthDate: '2012-01-01', address: { ...signupBody().address, cep: '20040-020', state: 'RJ' } }));
  assert.equal(bad.statusCode, 400);
  assert.deepEqual(bad.body.errors, { cpf: 'invalid', birthDate: 'underage', cep: 'outside_area', state: 'outside_area' });
  assert.equal(db.subscribers.length, 0);
  assert.equal(bad.headers['Set-Cookie'], undefined);

  const taken = fakeClubDb([{ name: 'Outra', phone: '11999990000', email: 'maria@example.com' }]);
  const exists = await post(area(taken), { action: 'signup' }, signupBody());
  assert.equal(exists.statusCode, 409);
  assert.deepEqual(exists.body, { error: 'exists', field: 'email' });
  assert.equal(taken.subscribers.length, 1);

  const busy = fakeClubDb();
  busy.countRecentSubscriptions = async () => 30;
  assert.equal((await post(area(busy), { action: 'signup' }, signupBody())).statusCode, 429);

  const noBody = await post(area(fakeClubDb()), { action: 'signup' }, null);
  assert.equal(noBody.statusCode, 400);
});

test('a client cannot set their own status: whatever is sent in the body, the request waits for payment', async () => {
  const db = fakeClubDb();
  const res = await post(area(db), { action: 'signup' }, signupBody({ status: 'active', subscription: { status: 'active' }, paymentConfirmed: true }));
  assert.equal(res.statusCode, 201);
  assert.equal(db.subscriptions[0].status, 'awaiting_payment');
});

test('personal data never travels in the URL: sign-up is a POST with the data in the body', async () => {
  const db = fakeClubDb();
  const res = mockRes();
  await area(db)(mockReq({ method: 'GET', query: { action: 'signup', cpf: '52998224725', email: 'maria@example.com' } }), res);
  assert.equal(db.subscribers.length, 0);
  assert.equal(res.statusCode, 401);
});

// ------------------------------------------------------- cliente existente --

function contractBody(overrides = {}) {
  return {
    cpf: '529.982.247-25', birthDate: '1990-05-17',
    address: { cep: '01310-100', street: 'Avenida Paulista', number: '1000', complement: '', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP', reference: '' },
    consents: { age18: true, terms: true, privacy: true, subscription: true, marketing: false },
    answers: null,
    ...overrides
  };
}

test('an existing client logs in and requests the subscription with POST ?action=contract', async () => {
  const db = fakeClubDb([legacy]);
  const handler = area(db);
  const token = await loginAs(handler, 'joao@x.com');
  const res = await post(handler, { action: 'contract' }, contractBody(), cookieHeader(token));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.subscription.status, 'awaiting_payment');
  assert.equal(db.subscribers.length, 1);
  assert.equal(db.subscriptions[0].subscriber_id, 1);
});

test('contract needs a session, refuses bad data, and answers 409 for a second open subscription or a CPF that is not theirs', async () => {
  const db = fakeClubDb([legacy, { name: 'Outra', phone: '11955554444', email: 'o@x.com', cpf: '11144477735' }]);
  const handler = area(db);
  assert.equal((await post(handler, { action: 'contract' }, contractBody(), {})).statusCode, 401);
  assert.equal((await post(handler, { action: 'contract' }, contractBody(), adminHeaders())).statusCode, 401);

  const token = await loginAs(handler, 'joao@x.com');
  const bad = await post(handler, { action: 'contract' }, contractBody({ cpf: '123' }), cookieHeader(token));
  assert.equal(bad.statusCode, 400);
  assert.deepEqual(bad.body.errors, { cpf: 'invalid' });

  const stolen = await post(handler, { action: 'contract' }, contractBody({ cpf: '111.444.777-35' }), cookieHeader(token));
  assert.equal(stolen.statusCode, 409);
  assert.deepEqual(stolen.body, { error: 'exists', field: 'cpf' });

  assert.equal((await post(handler, { action: 'contract' }, contractBody(), cookieHeader(token))).statusCode, 200);
  const again = await post(handler, { action: 'contract' }, contractBody(), cookieHeader(token));
  assert.equal(again.statusCode, 409);
  assert.deepEqual(again.body, { error: 'already_subscribed' });
  assert.equal(db.subscriptions.length, 1);

  const closed = await post(area(db, { clubOpen: false }), { action: 'contract' }, contractBody(), cookieHeader(token));
  assert.equal(closed.statusCode, 403);
});

test('"who am I" shows no subscription for a client who has none, and still works if the subscription lookup fails', async () => {
  const db = fakeClubDb([legacy]);
  const handler = area(db);
  const token = await loginAs(handler, 'joao@x.com');
  const none = mockRes();
  await handler(mockReq({ method: 'GET', headers: cookieHeader(token) }), none);
  assert.equal(none.body.subscription, null);

  db.getLatestSubscription = async () => { throw new Error('down'); };
  const failing = mockRes();
  await handler(mockReq({ method: 'GET', headers: cookieHeader(token) }), failing);
  assert.equal(failing.statusCode, 200);
  assert.equal(failing.body.subscription, null);
});

test('a client sees the payment link of their own subscription only', async () => {
  const db = fakeClubDb([legacy, { name: 'Outra', phone: '11955554444', email: 'o@x.com' }]);
  const handler = area(db);
  const joao = await loginAs(handler, 'joao@x.com');
  await post(handler, { action: 'contract' }, contractBody(), cookieHeader(joao));
  await post(admin(db), { action: 'sub-link', subscription: '1' }, { link: 'https://mpago.la/abc123' }, adminHeaders());

  const mine = mockRes();
  await handler(mockReq({ method: 'GET', headers: cookieHeader(joao) }), mine);
  assert.equal(mine.body.subscription.paymentLink, 'https://mpago.la/abc123');

  const outra = await loginAs(handler, 'o@x.com');
  const theirs = mockRes();
  await handler(mockReq({ method: 'GET', headers: cookieHeader(outra) }), theirs);
  assert.equal(theirs.body.subscription, null);
});

// -------------------------------------------------------------------- admin --

async function seedRequest(db) {
  await post(area(db), { action: 'signup' }, signupBody());
}

test('admin: every subscription route needs the admin session', async () => {
  const db = fakeClubDb();
  await seedRequest(db);
  const routes = [
    { method: 'GET', query: { view: 'subscriptions' } },
    { method: 'GET', query: { view: 'subscription-events', subscription: '1' } },
    { method: 'POST', query: { action: 'sub-link', subscription: '1' }, body: { link: 'https://mpago.la/x' } },
    { method: 'POST', query: { action: 'sub-link-sent', subscription: '1' } },
    { method: 'POST', query: { action: 'sub-status', subscription: '1' }, body: { to: 'active' } },
    { method: 'POST', query: { action: 'sub-create', id: '1' }, body: { status: 'active' } }
  ];
  for (const route of routes) {
    for (const headers of [{}, cookieHeader('lixo')]) {
      const res = mockRes();
      await admin(db)(mockReq({ ...route, headers }), res);
      assert.equal(res.statusCode, 401, JSON.stringify(route));
    }
  }
  assert.equal(db.subscriptions[0].status, 'awaiting_payment');
  assert.equal(db.subscriptions[0].payment_link, null);
});

test('admin: GET ?view=subscriptions lists the new request with the client data and counts by status', async () => {
  const db = fakeClubDb();
  await seedRequest(db);
  const res = mockRes();
  await admin(db)(mockReq({ method: 'GET', query: { view: 'subscriptions' }, headers: adminHeaders() }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.counts.awaiting_payment, 1);
  assert.equal(res.body.counts.total, 1);
  const item = res.body.subscriptions[0];
  assert.equal(item.name, 'Maria Silva Souza');
  assert.equal(item.cpf, '52998224725');
  assert.equal(item.address.city, 'São Paulo');
  assert.equal(item.statusLabel, 'Aguardando pagamento');
  assert.ok(!JSON.stringify(res.body).includes('scrypt'), 'no password hash');
});

test('admin: the payment link is saved, marked as sent, and the subscription stays waiting until the payment is confirmed', async () => {
  const db = fakeClubDb();
  await seedRequest(db);
  const handler = admin(db);

  const saved = await post(handler, { action: 'sub-link', subscription: '1' }, { link: 'https://mpago.la/abc123' }, adminHeaders());
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.subscription.paymentLink, 'https://mpago.la/abc123');

  const sent = await post(handler, { action: 'sub-link-sent', subscription: '1' }, null, adminHeaders());
  assert.equal(sent.statusCode, 200);
  assert.ok(sent.body.subscription.paymentLinkSentAt);
  assert.equal(db.subscriptions[0].status, 'awaiting_payment', 'sending the link does not activate it');

  const confirmed = await post(handler, { action: 'sub-status', subscription: '1' }, { to: 'active', note: 'Pix recebido' }, adminHeaders());
  assert.equal(confirmed.statusCode, 200);
  assert.equal(confirmed.body.subscription.status, 'active');
  assert.ok(confirmed.body.subscription.activatedAt);

  const events = mockRes();
  await handler(mockReq({ method: 'GET', query: { view: 'subscription-events', subscription: '1' }, headers: adminHeaders() }), events);
  assert.equal(events.statusCode, 200);
  assert.deepEqual(events.body.events.map((e) => [e.from, e.to, e.actor]), [['awaiting_payment', 'active', 'admin'], ['awaiting_payment', 'awaiting_payment', 'admin'], ['awaiting_payment', 'awaiting_payment', 'admin'], [null, 'awaiting_payment', 'cliente']]);
  assert.equal(events.body.events[0].note, 'Pix recebido');
});

test('admin: bad links, unknown subscriptions and impossible status changes are answered with the right codes', async () => {
  const db = fakeClubDb();
  await seedRequest(db);
  const handler = admin(db);

  assert.equal((await post(handler, { action: 'sub-link', subscription: '1' }, { link: 'http://insecure.example' }, adminHeaders())).statusCode, 400);
  assert.equal((await post(handler, { action: 'sub-link', subscription: '99' }, { link: 'https://mpago.la/x' }, adminHeaders())).statusCode, 404);
  assert.equal((await post(handler, { action: 'sub-link-sent', subscription: '1' }, null, adminHeaders())).statusCode, 400, 'no link yet');
  assert.equal((await post(handler, { action: 'sub-link-sent', subscription: '99' }, null, adminHeaders())).statusCode, 404);
  assert.equal((await post(handler, { action: 'sub-status', subscription: '99' }, { to: 'active' }, adminHeaders())).statusCode, 404);
  assert.equal((await post(handler, { action: 'sub-status', subscription: '1' }, { to: 'payment_pending' }, adminHeaders())).statusCode, 409);
  assert.equal((await post(handler, { action: 'sub-status', subscription: '1' }, { to: 'xyz' }, adminHeaders())).statusCode, 409);

  await post(handler, { action: 'sub-status', subscription: '1' }, { to: 'cancelled' }, adminHeaders());
  assert.equal((await post(handler, { action: 'sub-status', subscription: '1' }, { to: 'active' }, adminHeaders())).statusCode, 409, 'cancelled is final');
  assert.equal((await post(handler, { action: 'sub-link', subscription: '1' }, { link: 'https://mpago.la/x' }, adminHeaders())).statusCode, 409);

  for (const query of [{ action: 'sub-link' }, { action: 'sub-link', subscription: 'abc' }, { action: 'sub-status', subscription: '0' }, { action: 'sub-link-sent' }]) {
    assert.equal((await post(handler, query, { link: 'https://mpago.la/x', to: 'active' }, adminHeaders())).statusCode, 400, JSON.stringify(query));
  }
  const noEvents = mockRes();
  await handler(mockReq({ method: 'GET', query: { view: 'subscription-events', subscription: '99' }, headers: adminHeaders() }), noEvents);
  assert.equal(noEvents.statusCode, 404);
  const badEvents = mockRes();
  await handler(mockReq({ method: 'GET', query: { view: 'subscription-events' }, headers: adminHeaders() }), badEvents);
  assert.equal(badEvents.statusCode, 400);
});

test('admin: POST ?action=sub-create registers a subscription for a client who already existed', async () => {
  const db = fakeClubDb([legacy]);
  const handler = admin(db);
  const ok = await post(handler, { action: 'sub-create', id: '1' }, { status: 'active' }, adminHeaders());
  assert.equal(ok.statusCode, 201);
  assert.equal(ok.body.subscription.status, 'active');
  assert.equal((await post(handler, { action: 'sub-create', id: '1' }, { status: 'active' }, adminHeaders())).statusCode, 409);
  assert.equal((await post(handler, { action: 'sub-create', id: '99' }, { status: 'active' }, adminHeaders())).statusCode, 404);
  assert.equal((await post(handler, { action: 'sub-create', id: '1' }, { status: 'cancelled' }, adminHeaders())).statusCode, 400);
  assert.equal((await post(handler, { action: 'sub-create' }, { status: 'active' }, adminHeaders())).statusCode, 400);
});

test('"who am I" brings the profile: the delivery address and a masked CPF, only for the logged-in client', async () => {
  const db = fakeClubDb();
  const handler = area(db);
  const created = await post(handler, { action: 'signup' }, signupBody());
  const me = mockRes();
  await handler(mockReq({ method: 'GET', headers: cookieHeader(cookieOf(created)) }), me);
  assert.equal(me.body.profile.cpfMasked, '***.***.***-25');
  assert.equal(me.body.profile.address.city, 'São Paulo');
  assert.equal(me.body.profile.address.cep, '01310100');
  assert.ok(!JSON.stringify(me.body).includes('52998224725'), 'the full CPF is never sent back');
  assert.ok(!JSON.stringify(me.body).includes('scrypt'));
});
