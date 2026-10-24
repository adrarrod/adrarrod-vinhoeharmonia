// test/club-signup-service.test.js — contratação do Clube V&H Personnalité
const test = require('node:test');
const assert = require('node:assert/strict');
const signup = require('../lib/club-signup-service.js');
const pw = require('../lib/password.js');
const sess = require('../lib/subscriber-session.js');
const Clube = require('../js/clube.js');

const SECRET = 'test-secret';
const NOW = Date.parse('2026-10-24T15:00:00Z');

function validPayload(overrides = {}) {
  return {
    name: 'Maria Silva Souza',
    email: ' Maria@Example.COM ',
    phone: '(11) 98765-4321',
    cpf: '529.982.247-25',
    birthDate: '1990-05-17',
    address: { cep: '01310-100', street: 'Avenida Paulista', number: '1000', complement: 'Apto 12', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP', reference: 'Portão azul' },
    password: 'minha-senha-1',
    passwordConfirm: 'minha-senha-1',
    consents: { age18: true, terms: true, privacy: true, subscription: true, marketing: false },
    answers: null,
    website: '',
    ...overrides
  };
}

function validAnswers() {
  return { q2: ['Tintos'], q3: 'Gosto de todos', q4: 'Gosto dos dois', q5: 'Nunca reparei nisso', q6: 'Gosto dos dois', q7: 'Adoro conhecer novidades', q11: 'Um pouco de tudo' };
}

function fakeDb(existing = []) {
  const subscribers = existing.map((s, i) => ({ id: i + 1, password_hash: null, ...s }));
  let nextId = subscribers.length + 1;
  const state = { subscribers, consents: [], subscriptions: [], events: [], responses: [], deleted: [], calls: [] };
  return Object.assign(state, {
    async ensureSubscribersSchema() {},
    async ensureQuestionnaireSchema() {},
    async ensureSubscriptionsSchema() {},
    async findSignupConflicts(_e, { phone, email, cpf, excludeId }) {
      return subscribers.filter((s) => s.id !== excludeId && (s.phone === phone || (email && s.email && s.email.toLowerCase() === email) || (cpf && s.cpf === cpf)))
        .map((s) => ({ id: s.id, phone: s.phone, email: s.email, cpf: s.cpf }));
    },
    async insertSubscriberWithProfile(_e, v) {
      const row = { id: nextId++, name: v.name, phone: v.phone, email: v.email, address_street: v.street, address_complement: v.complement, address_number: v.number, address_neighborhood: v.neighborhood, address_city: v.city, address_state: v.state, address_cep: v.cep, address_reference: v.reference, cpf: v.cpf, birth_date: v.birthDate, password_hash: v.passwordHash, failed_attempts: 0, locked_until: null };
      subscribers.push(row);
      return row;
    },
    async updateSubscriberProfile(_e, id, v) {
      const row = subscribers.find((s) => s.id === id);
      if (!row) return null;
      Object.assign(row, { address_street: v.street, address_complement: v.complement, address_number: v.number, address_neighborhood: v.neighborhood, address_city: v.city, address_state: v.state, address_cep: v.cep, address_reference: v.reference, cpf: v.cpf, birth_date: v.birthDate });
      return row;
    },
    async insertConsents(_e, subscriberId, entries) { entries.forEach((e) => state.consents.push({ subscriber_id: subscriberId, ...e })); },
    async insertSubscription(_e, { subscriberId, plan, priceCents, status }) {
      if (state.subscriptions.some((s) => s.subscriber_id === subscriberId && s.plan === plan && Clube.isOpen(s.status))) return null;
      const row = { id: state.subscriptions.length + 1, subscriber_id: subscriberId, plan, price_cents: priceCents, status, payment_link: null, requested_at: new Date(NOW).toISOString() };
      state.subscriptions.push(row);
      return row;
    },
    async insertSubscriptionEvent(_e, ev) { state.events.push(ev); },
    async countRecentSubscriptions() { return state.subscriptions.length; },
    async insertQuestionnaireResponse(_e, subscriberId, version, answers) { state.responses.push({ subscriber_id: subscriberId, version, answers }); return { id: state.responses.length, created_at: new Date(NOW).toISOString() }; },
    async deleteSubscriber(_e, id) { const i = subscribers.findIndex((s) => s.id === id); if (i === -1) return false; state.deleted.push(id); subscribers.splice(i, 1); return true; }
  });
}
const deps = (db, extra = {}) => ({ execute: async () => ({ rows: [] }), db, sessionSecret: SECRET, clubOpen: true, now: () => NOW, ...extra });

const existingMaria = { name: 'Maria Antiga', phone: '11999990000', email: 'maria@example.com', cpf: '11144477735' };

// ------------------------------------------------------------ novo cliente --

test('a valid request creates the account, the consents and a subscription waiting for payment, and logs the client in', async () => {
  const db = fakeDb();
  const r = await signup.signup(deps(db), validPayload());
  assert.equal(r.status, 'ok');

  assert.equal(db.subscribers.length, 1);
  const s = db.subscribers[0];
  assert.deepEqual([s.name, s.phone, s.email, s.cpf, s.birth_date], ['Maria Silva Souza', '11987654321', 'maria@example.com', '52998224725', '1990-05-17']);
  assert.deepEqual([s.address_cep, s.address_street, s.address_number, s.address_complement, s.address_neighborhood, s.address_city, s.address_state, s.address_reference],
    ['01310100', 'Avenida Paulista', '1000', 'Apto 12', 'Bela Vista', 'São Paulo', 'SP', 'Portão azul']);

  assert.equal(db.subscriptions.length, 1);
  assert.deepEqual([db.subscriptions[0].status, db.subscriptions[0].plan, db.subscriptions[0].price_cents], ['awaiting_payment', 'personnalite', 12000]);
  assert.deepEqual(db.events, [{ subscriptionId: 1, from: null, to: 'awaiting_payment', actor: 'cliente', note: 'Solicitação feita pelo site' }]);

  assert.equal(sess.readTokenId(r.token), s.id);
  assert.equal(r.subscriber.name, 'Maria Silva Souza');
  assert.equal(r.subscription.status, 'awaiting_payment');
});

test('the password is stored only as a hash, and it is the one the client chose (not the initial 123mudar)', async () => {
  const db = fakeDb();
  await signup.signup(deps(db), validPayload());
  const hash = db.subscribers[0].password_hash;
  assert.ok(hash.startsWith('scrypt$'));
  assert.ok(!JSON.stringify(db).includes('minha-senha-1'));
  assert.equal(await pw.verifyPassword('minha-senha-1', hash), true);
  assert.equal(await pw.verifyPassword('123mudar', hash), false);
});

test('every acceptance is recorded with the version of the text, the marketing one separately and optional', async () => {
  const db = fakeDb();
  await signup.signup(deps(db), validPayload({ consents: { age18: true, terms: true, privacy: true, subscription: true, marketing: true } }));
  assert.deepEqual(db.consents.map((c) => [c.type, c.accepted]), [['age18', true], ['terms', true], ['privacy', true], ['subscription', true], ['marketing', true]]);
  assert.ok(db.consents.every((c) => c.version === Clube.LEGAL_VERSION && c.subscriber_id === 1));

  const db2 = fakeDb();
  await signup.signup(deps(db2), validPayload());
  assert.equal(db2.consents.find((c) => c.type === 'marketing').accepted, false);
});

test('the questionnaire answered during the request is saved for the new subscriber, and it may be left for later', async () => {
  const withAnswers = fakeDb();
  await signup.signup(deps(withAnswers), validPayload({ answers: validAnswers() }));
  assert.equal(withAnswers.responses.length, 1);
  assert.equal(withAnswers.responses[0].subscriber_id, 1);
  assert.equal(withAnswers.responses[0].version, '1.0');
  assert.equal(withAnswers.responses[0].answers.q3, 'Gosto de todos');

  const later = fakeDb();
  const r = await signup.signup(deps(later), validPayload({ answers: null }));
  assert.equal(r.status, 'ok');
  assert.equal(later.responses.length, 0);
});

test('while the club is closed nothing is created', async () => {
  const db = fakeDb();
  assert.deepEqual(await signup.signup(deps(db, { clubOpen: false }), validPayload()), { status: 'closed' });
  assert.equal(db.subscribers.length, 0);
});

// ---------------------------------------------------------------- validação --

test('missing or wrong data is reported field by field and nothing is saved', async () => {
  const db = fakeDb();
  const r = await signup.signup(deps(db), validPayload({
    name: 'Maria', email: 'x', phone: '1133334444', cpf: '111.111.111-11', birthDate: '', password: '123', passwordConfirm: '456',
    address: { cep: '', street: '', number: '', neighborhood: '', city: '', state: '' },
    consents: {}
  }));
  assert.equal(r.status, 'invalid');
  assert.deepEqual(r.errors, {
    name: 'invalid', email: 'invalid', phone: 'invalid', cpf: 'invalid', birthDate: 'required',
    cep: 'required', street: 'required', number: 'required', neighborhood: 'required', city: 'required', state: 'required',
    password: 'weak', passwordConfirm: 'mismatch',
    age18: 'required', terms: 'required', privacy: 'required', subscription: 'required'
  });
  assert.equal(db.subscribers.length, 0);
  assert.equal(db.subscriptions.length, 0);
});

test('only people 18 or older may sign up, and the birth date must be real', async () => {
  const db = fakeDb();
  assert.equal((await signup.signup(deps(db), validPayload({ birthDate: '2010-01-01' }))).errors.birthDate, 'underage');
  assert.equal((await signup.signup(deps(db), validPayload({ birthDate: '1990-02-30' }))).errors.birthDate, 'invalid');
  assert.equal((await signup.signup(deps(db), validPayload({ birthDate: '2008-10-24' }))).status, 'ok', 'turns 18 today');
});

test('a delivery address outside São Paulo state is refused, by CEP or by state, in the server too', async () => {
  const db = fakeDb();
  const rio = await signup.signup(deps(db), validPayload({ address: { ...validPayload().address, cep: '20040-020', state: 'RJ' } }));
  assert.equal(rio.status, 'invalid');
  assert.equal(rio.errors.cep, 'outside_area');
  assert.equal(rio.errors.state, 'outside_area');

  const wrongState = await signup.signup(deps(db), validPayload({ address: { ...validPayload().address, state: 'MG' } }));
  assert.deepEqual(wrongState.errors, { state: 'outside_area' });

  const wrongCep = await signup.signup(deps(db), validPayload({ address: { ...validPayload().address, cep: '30140-071' } }));
  assert.deepEqual(wrongCep.errors, { cep: 'outside_area' });
  assert.equal(db.subscribers.length, 0);
});

test('lower-case "sp" is accepted and stored as SP; the password must be confirmed and cannot be 123mudar', async () => {
  const db = fakeDb();
  const r = await signup.signup(deps(db), validPayload({ address: { ...validPayload().address, state: 'sp' } }));
  assert.equal(r.status, 'ok');
  assert.equal(db.subscribers[0].address_state, 'SP');

  const bad = await signup.signup(deps(fakeDb()), validPayload({ password: '123mudar', passwordConfirm: '123mudar' }));
  assert.equal(bad.errors.password, 'weak');
});

test('the marketing consent is optional, but the four required acceptances are not', async () => {
  for (const missing of ['age18', 'terms', 'privacy', 'subscription']) {
    const db = fakeDb();
    const r = await signup.signup(deps(db), validPayload({ consents: { age18: true, terms: true, privacy: true, subscription: true, [missing]: false } }));
    assert.deepEqual(r.errors, { [missing]: 'required' }, missing);
    assert.equal(db.subscribers.length, 0);
  }
  assert.equal((await signup.signup(deps(fakeDb()), validPayload({ consents: { age18: true, terms: true, privacy: true, subscription: true } }))).status, 'ok');
});

test('questionnaire answers sent with the request must be valid, otherwise nothing is created', async () => {
  const db = fakeDb();
  const r = await signup.signup(deps(db), validPayload({ answers: { q3: 'Gosto de todos' } }));
  assert.equal(r.status, 'invalid');
  assert.ok(r.errors.answers.q2 === 'required');
  assert.equal(db.subscribers.length, 0);
});

test('a filled hidden field (bots) is refused without creating anything', async () => {
  const db = fakeDb();
  const r = await signup.signup(deps(db), validPayload({ website: 'http://spam.example' }));
  assert.equal(r.status, 'invalid');
  assert.equal(db.subscribers.length, 0);
});

// ------------------------------------------------------- cliente já existente --

test('an e-mail, phone or CPF already registered is not duplicated: the client is told to log in', async () => {
  for (const [payload, field] of [
    [validPayload({ email: 'MARIA@example.com' }), 'email'],
    [validPayload({ phone: '(11) 99999-0000', email: 'outra@example.com' }), 'phone'],
    [validPayload({ cpf: '111.444.777-35' }), 'cpf']
  ]) {
    const db = fakeDb([existingMaria]);
    const r = await signup.signup(deps(db), payload);
    assert.deepEqual(r, { status: 'exists', field }, field);
    assert.equal(db.subscribers.length, 1, 'no second account');
    assert.equal(db.subscriptions.length, 0);
  }
});

test('if something fails after the account was created, the account is removed so no half-finished sign-up is left', async () => {
  const db = fakeDb();
  db.insertSubscription = async () => { throw new Error('database down'); };
  await assert.rejects(() => signup.signup(deps(db), validPayload()), /database down/);
  assert.equal(db.subscribers.length, 0);
  assert.deepEqual(db.deleted, [1]);
});

// ------------------------------------------------- cliente que já tem conta --

function contractPayload(overrides = {}) {
  return {
    cpf: '529.982.247-25',
    birthDate: '1990-05-17',
    address: { cep: '01310-100', street: 'Avenida Paulista', number: '1000', complement: '', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP', reference: '' },
    consents: { age18: true, terms: true, privacy: true, subscription: true, marketing: false },
    answers: null,
    ...overrides
  };
}
const legacy = { name: 'João Antigo', phone: '11977776666', email: 'joao@x.com' };

test('a client who already has an account only completes the missing data and requests the subscription', async () => {
  const db = fakeDb([legacy]);
  const row = db.subscribers[0];
  const r = await signup.contract(deps(db), row, contractPayload());
  assert.equal(r.status, 'ok');
  assert.equal(db.subscribers.length, 1, 'same account, not a new one');
  assert.deepEqual([row.cpf, row.birth_date, row.address_cep, row.address_city], ['52998224725', '1990-05-17', '01310100', 'São Paulo']);
  assert.equal(row.name, 'João Antigo');
  assert.equal(row.password_hash, null, 'the password is untouched');
  assert.deepEqual([db.subscriptions[0].status, db.subscriptions[0].subscriber_id], ['awaiting_payment', 1]);
  assert.equal(db.events[0].actor, 'cliente');
  assert.equal(db.consents.length, 5);
});

test('a client with an open subscription cannot request another one, but can after cancelling', async () => {
  const db = fakeDb([legacy]);
  const row = db.subscribers[0];
  assert.equal((await signup.contract(deps(db), row, contractPayload())).status, 'ok');
  assert.deepEqual(await signup.contract(deps(db), row, contractPayload()), { status: 'already_subscribed' });
  assert.equal(db.subscriptions.length, 1);
  db.subscriptions[0].status = 'cancelled';
  assert.equal((await signup.contract(deps(db), row, contractPayload())).status, 'ok');
  assert.equal(db.subscriptions.length, 2);
});

test('an existing client is held to the same rules: São Paulo only, 18+, valid CPF, acceptances', async () => {
  const db = fakeDb([legacy]);
  const row = db.subscribers[0];
  const r = await signup.contract(deps(db), row, contractPayload({ cpf: '123', birthDate: '2012-01-01', address: { ...contractPayload().address, cep: '30140-071', state: 'MG' }, consents: {} }));
  assert.equal(r.status, 'invalid');
  assert.deepEqual(Object.keys(r.errors).sort(), ['age18', 'birthDate', 'cep', 'cpf', 'privacy', 'state', 'subscription', 'terms']);
  assert.equal(db.subscriptions.length, 0);
  assert.equal(row.cpf, undefined, 'nothing was saved on the account');
});

test('an existing client cannot take a CPF that belongs to someone else', async () => {
  const db = fakeDb([legacy, { name: 'Outra', phone: '11955554444', email: 'o@x.com', cpf: '52998224725' }]);
  const r = await signup.contract(deps(db), db.subscribers[0], contractPayload());
  assert.deepEqual(r, { status: 'exists', field: 'cpf' });
  assert.equal(db.subscriptions.length, 0);
});

test('an existing client may keep their own CPF when asking again', async () => {
  const db = fakeDb([{ ...legacy, cpf: '52998224725' }]);
  assert.equal((await signup.contract(deps(db), db.subscribers[0], contractPayload())).status, 'ok');
});

test('an existing client can answer the questionnaire along with the request, and the club may be closed', async () => {
  const db = fakeDb([legacy]);
  await signup.contract(deps(db), db.subscribers[0], contractPayload({ answers: validAnswers() }));
  assert.equal(db.responses.length, 1);
  assert.equal(db.responses[0].subscriber_id, 1);

  const closed = fakeDb([legacy]);
  assert.deepEqual(await signup.contract(deps(closed, { clubOpen: false }), closed.subscribers[0], contractPayload()), { status: 'closed' });
});

test('an unusual burst of sign-ups (more than 30 in an hour) is held back, and normal traffic is not', async () => {
  const busy = fakeDb();
  busy.countRecentSubscriptions = async (_e, minutes) => { assert.equal(minutes, 60); return 30; };
  assert.deepEqual(await signup.signup(deps(busy), validPayload()), { status: 'busy' });
  assert.equal(busy.subscribers.length, 0);

  const normal = fakeDb();
  normal.countRecentSubscriptions = async () => 29;
  assert.equal((await signup.signup(deps(normal), validPayload())).status, 'ok');
});
