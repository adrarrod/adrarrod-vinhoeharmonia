// test/handlers-questionnaire.test.js — o questionário pela API da área do assinante
// e pelo painel administrativo.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const auth = require('../lib/auth.js');
const sess = require('../lib/subscriber-session.js');
const { createSubscriberAreaHandler } = require('../lib/handlers/subscriber-area.js');
const { createSubscribersHandler } = require('../lib/handlers/subscribers.js');

const SECRET = 'test-secret';
const PASSWORD = 'admin-pass';

function validAnswers(overrides = {}) {
  return {
    q2: ['Tintos'], q3: 'Gosto de todos', q4: 'Gosto dos dois', q5: 'Nunca reparei nisso',
    q6: 'Gosto dos dois', q7: 'Adoro conhecer novidades', q11: 'Um pouco de tudo', ...overrides
  };
}

function fakeDb() {
  const subscribers = [
    { id: 1, name: 'Maria Silva', phone: '11987654321', email: 'maria@x.com', password_hash: null, failed_attempts: 0, locked_until: null },
    { id: 2, name: 'João Souza', phone: '1133334444', email: null, password_hash: null, failed_attempts: 0, locked_until: null }
  ];
  const responses = [];
  return {
    subscribers, responses,
    async ensureSubscribersSchema() {},
    async ensureQuestionnaireSchema() {},
    async getSubscriberBy(_e, field, value) {
      return subscribers.find((s) => (field === 'email' ? (s.email || '').toLowerCase() === value : s[field] === value)) || null;
    },
    async recordFailedLogin() { return { failed_attempts: 1, locked_until: null }; },
    async clearLoginFailures() {},
    async setSubscriberPasswordHash() { return true; },
    async findSubscriberConflicts(_e, { email, excludeId }) {
      return subscribers.filter((s) => s.id !== excludeId && email && s.email && s.email.toLowerCase() === email.toLowerCase()).map((s) => ({ id: s.id, phone: s.phone, email: s.email }));
    },
    async updateSubscriberEmail(_e, id, email) { subscribers.find((s) => s.id === id).email = email; return true; },
    async insertQuestionnaireResponse(_e, subscriberId, version, answers) {
      const row = { id: responses.length + 1, subscriber_id: subscriberId, version, answers, created_at: new Date(Date.UTC(2026, 9, 22, 12, 0, responses.length)).toISOString() };
      responses.push(row);
      return row;
    },
    async getLatestQuestionnaireResponse(_e, id) { const mine = responses.filter((r) => r.subscriber_id === id); return mine.length ? mine[mine.length - 1] : null; },
    async listQuestionnaireHistory(_e, id) { return responses.filter((r) => r.subscriber_id === id).reverse(); },
    async listLatestQuestionnaireResponses() {
      const ids = [...new Set(responses.map((r) => r.subscriber_id))];
      return ids.map((id) => {
        const mine = responses.filter((r) => r.subscriber_id === id);
        const s = subscribers.find((x) => x.id === id);
        return { ...mine[mine.length - 1], submissions: mine.length, first_submitted_at: mine[0].created_at, name: s.name, phone: s.phone, email: s.email };
      });
    }
  };
}

const area = (db) => createSubscriberAreaHandler({ execute: async () => ({ rows: [] }), db, sessionSecret: SECRET });
const admin = (db) => createSubscribersHandler({ execute: async () => ({ rows: [] }), db, adminPassword: PASSWORD, sessionSecret: SECRET });
const adminHeaders = () => ({ cookie: `${auth.SESSION_COOKIE_NAME}=${auth.signSession(PASSWORD, SECRET)}` });
const cookieHeader = (token) => ({ cookie: `${sess.COOKIE_NAME}=${token}` });

async function loginAs(handler, login) {
  const res = mockRes();
  await handler(mockReq({ method: 'POST', query: { action: 'login' }, body: { login, password: '123mudar' } }), res);
  return /subscriber_session=([^;]+)/.exec(res.headers['Set-Cookie'])[1];
}

// --------------------------------------------------------- área do assinante --

test('GET (who am I) now also says whether the questionnaire was answered', async () => {
  const db = fakeDb();
  const handler = area(db);
  const token = await loginAs(handler, 'maria@x.com');

  const before = mockRes();
  await handler(mockReq({ method: 'GET', headers: cookieHeader(token) }), before);
  assert.equal(before.statusCode, 200);
  assert.deepEqual(before.body.questionnaire, { answered: false, submittedAt: null });

  await handler(mockReq({ method: 'POST', query: { action: 'questionnaire' }, headers: cookieHeader(token), body: { email: 'maria@x.com', answers: validAnswers() } }), mockRes());
  const after = mockRes();
  await handler(mockReq({ method: 'GET', headers: cookieHeader(token) }), after);
  assert.equal(after.body.questionnaire.answered, true);
  assert.ok(after.body.questionnaire.submittedAt);
});

test('"who am I" keeps working when the questionnaire table cannot be read', async () => {
  const db = fakeDb();
  db.getLatestQuestionnaireResponse = async () => { throw new Error('down'); };
  const handler = area(db);
  const token = await loginAs(handler, 'maria@x.com');
  const res = mockRes();
  await handler(mockReq({ method: 'GET', headers: cookieHeader(token) }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.subscriber.name, 'Maria Silva');
  assert.equal(res.body.questionnaire, null);
});

test('POST ?action=questionnaire saves the answers for the logged-in subscriber and answers 200', async () => {
  const db = fakeDb();
  const handler = area(db);
  const token = await loginAs(handler, 'maria@x.com');
  const res = mockRes();
  await handler(mockReq({ method: 'POST', query: { action: 'questionnaire' }, headers: cookieHeader(token), body: { email: 'maria@x.com', answers: validAnswers({ q10: 'nada de vinho doce' }) } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.submittedAt);
  assert.equal(db.responses.length, 1);
  assert.equal(db.responses[0].subscriber_id, 1);
  assert.equal(db.responses[0].answers.q10, 'nada de vinho doce');
});

test('saving needs a session: without one (or with an admin cookie) it answers 401 and stores nothing', async () => {
  const db = fakeDb();
  const handler = area(db);
  for (const headers of [{}, cookieHeader('lixo'), adminHeaders()]) {
    const res = mockRes();
    await handler(mockReq({ method: 'POST', query: { action: 'questionnaire' }, headers, body: { email: 'maria@x.com', answers: validAnswers() } }), res);
    assert.equal(res.statusCode, 401);
  }
  assert.equal(db.responses.length, 0);
});

test('an invalid form answers 400 with the problems by field, and a taken e-mail answers 409', async () => {
  const db = fakeDb();
  const handler = area(db);
  const token = await loginAs(handler, '(11) 3333-4444'); // João, sem e-mail

  const bad = mockRes();
  await handler(mockReq({ method: 'POST', query: { action: 'questionnaire' }, headers: cookieHeader(token), body: { email: '', answers: { q3: 'Gosto de todos' } } }), bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.errors.email, 'required');
  assert.deepEqual(Object.keys(bad.body.errors.answers).sort(), ['q11', 'q2', 'q4', 'q5', 'q6', 'q7']);

  const taken = mockRes();
  await handler(mockReq({ method: 'POST', query: { action: 'questionnaire' }, headers: cookieHeader(token), body: { email: 'MARIA@x.com', answers: validAnswers() } }), taken);
  assert.equal(taken.statusCode, 409);
  assert.deepEqual(taken.body, { error: 'duplicate', field: 'email' });
  assert.equal(db.responses.length, 0);

  const noBody = mockRes();
  await handler(mockReq({ method: 'POST', query: { action: 'questionnaire' }, headers: cookieHeader(token), body: null }), noBody);
  assert.equal(noBody.statusCode, 400);
});

test('subscribers are isolated: João cannot see Maria\'s answers, and a subscriber id in the body is ignored', async () => {
  const db = fakeDb();
  const handler = area(db);
  const maria = await loginAs(handler, 'maria@x.com');
  const joao = await loginAs(handler, '1133334444');

  await handler(mockReq({ method: 'POST', query: { action: 'questionnaire' }, headers: cookieHeader(maria), body: { email: 'maria@x.com', answers: validAnswers({ q10: 'segredo da Maria' }) } }), mockRes());
  // João tenta gravar "como" Maria
  await handler(mockReq({ method: 'POST', query: { action: 'questionnaire' }, headers: cookieHeader(joao), body: { email: 'joao@x.com', subscriberId: 1, subscriber_id: 1, answers: validAnswers({ q10: 'do João' }) } }), mockRes());
  assert.deepEqual(db.responses.map((r) => [r.subscriber_id, r.answers.q10]), [[1, 'segredo da Maria'], [2, 'do João']]);

  const res = mockRes();
  await handler(mockReq({ method: 'GET', query: { resource: 'questionnaire', id: '1', subscriberId: '1' }, headers: cookieHeader(joao) }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.response.answers.q10, 'do João');
  assert.ok(!JSON.stringify(res.body).includes('segredo da Maria'));
});

test('GET ?resource=questionnaire returns the e-mail and the current answers (null before the first submission), and needs a session', async () => {
  const db = fakeDb();
  const handler = area(db);
  const token = await loginAs(handler, 'maria@x.com');

  const first = mockRes();
  await handler(mockReq({ method: 'GET', query: { resource: 'questionnaire' }, headers: cookieHeader(token) }), first);
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.body, { email: 'maria@x.com', response: null });

  await handler(mockReq({ method: 'POST', query: { action: 'questionnaire' }, headers: cookieHeader(token), body: { email: 'maria@x.com', answers: validAnswers() } }), mockRes());
  const second = mockRes();
  await handler(mockReq({ method: 'GET', query: { resource: 'questionnaire' }, headers: cookieHeader(token) }), second);
  assert.equal(second.body.response.version, '1.0');
  assert.deepEqual(second.body.response.answers.q2, ['Tintos']);

  const anon = mockRes();
  await handler(mockReq({ method: 'GET', query: { resource: 'questionnaire' }, headers: {} }), anon);
  assert.equal(anon.statusCode, 401);
});

// --------------------------------------------------------------------- admin --

async function seedAnswered(db) {
  const handler = area(db);
  const maria = await loginAs(handler, 'maria@x.com');
  await handler(mockReq({ method: 'POST', query: { action: 'questionnaire' }, headers: cookieHeader(maria), body: { email: 'maria@x.com', answers: validAnswers({ q10: 'sem doces' }) } }), mockRes());
  await handler(mockReq({ method: 'POST', query: { action: 'questionnaire' }, headers: cookieHeader(maria), body: { email: 'maria@x.com', answers: validAnswers({ q3: 'Ainda não sei' }) } }), mockRes());
}

test('admin: the questionnaire list, one subscriber\'s detail and the CSV all need the admin session', async () => {
  const db = fakeDb();
  await seedAnswered(db);
  for (const query of [{ view: 'questionnaire' }, { view: 'questionnaire', id: '1' }, { export: 'csv' }]) {
    const res = mockRes();
    await admin(db)(mockReq({ method: 'GET', query, headers: cookieHeader('x') }), res);
    assert.equal(res.statusCode, 401, JSON.stringify(query));
  }
});

test('admin: GET ?view=questionnaire lists who answered, with date, version and number of submissions', async () => {
  const db = fakeDb();
  await seedAnswered(db);
  const res = mockRes();
  await admin(db)(mockReq({ method: 'GET', query: { view: 'questionnaire' }, headers: adminHeaders() }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.responses.length, 1);
  const r = res.body.responses[0];
  assert.equal(r.subscriberId, 1);
  assert.equal(r.name, 'Maria Silva');
  assert.equal(r.submissions, 2);
  assert.equal(r.version, '1.0');
  assert.equal(r.answers.q3, 'Ainda não sei');
});

test('admin: GET ?view=questionnaire&id= returns every submission, 404 for an unknown subscriber and 400 for a bad id', async () => {
  const db = fakeDb();
  await seedAnswered(db);
  const ok = mockRes();
  await admin(db)(mockReq({ method: 'GET', query: { view: 'questionnaire', id: '1' }, headers: adminHeaders() }), ok);
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.body.submissions.map((s) => s.answers.q3), ['Ainda não sei', 'Gosto de todos']);

  const none = mockRes();
  await admin(db)(mockReq({ method: 'GET', query: { view: 'questionnaire', id: '99' }, headers: adminHeaders() }), none);
  assert.equal(none.statusCode, 404);

  for (const id of ['abc', '0', '-1', '1.5']) {
    const bad = mockRes();
    await admin(db)(mockReq({ method: 'GET', query: { view: 'questionnaire', id }, headers: adminHeaders() }), bad);
    assert.equal(bad.statusCode, 400, id);
  }
});

test('admin: GET ?export=csv downloads a spreadsheet file with the latest answers', async () => {
  const db = fakeDb();
  await seedAnswered(db);
  const res = mockRes();
  await admin(db)(mockReq({ method: 'GET', query: { export: 'csv' }, headers: adminHeaders() }), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Content-Type'], /^text\/csv; charset=utf-8/);
  assert.match(res.headers['Content-Disposition'], /^attachment; filename="respostas-questionario-\d{4}-\d{2}-\d{2}\.csv"$/);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.body.charCodeAt(0), 0xFEFF);
  assert.ok(res.body.includes('Maria Silva'));
  assert.ok(res.body.includes('Ainda não sei'));
  assert.ok(!res.body.includes('sem doces'), 'the older submission is not exported');
});
