// test/handlers-subscriber-area.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const sess = require('../lib/subscriber-session.js');
const { createSubscriberAreaHandler } = require('../lib/handlers/subscriber-area.js');

const SECRET = 'test-secret';

function fakeDb() {
  const row = { id: 1, name: 'Maria Silva', phone: '11987654321', email: 'maria@x.com', password_hash: null, failed_attempts: 0, locked_until: null };
  return {
    row,
    async ensureSubscribersSchema() {},
    async getSubscriberBy(_e, field, value) {
      if (field === 'id') return value === 1 ? row : null;
      if (field === 'phone') return value === row.phone ? row : null;
      if (field === 'email') return value === row.email ? row : null;
      return null;
    },
    async recordFailedLogin() {
      if (row.failed_attempts + 1 >= 5) { row.failed_attempts = 0; row.locked_until = new Date(Date.now() + 15 * 60000).toISOString(); }
      else row.failed_attempts += 1;
      return { failed_attempts: row.failed_attempts, locked_until: row.locked_until };
    },
    async clearLoginFailures() { row.failed_attempts = 0; row.locked_until = null; },
    async setSubscriberPasswordHash(_e, _id, hash) { row.password_hash = hash; row.failed_attempts = 0; row.locked_until = null; return true; }
  };
}
const make = (db, extra = {}) => createSubscriberAreaHandler({ execute: async () => ({ rows: [] }), db, sessionSecret: SECRET, ...extra });
const cookieOf = (res) => /subscriber_session=([^;]+)/.exec(res.headers['Set-Cookie'])[1];
const withCookie = (token) => ({ cookie: `${sess.COOKIE_NAME}=${token}` });

async function loggedIn(handler) {
  const res = mockRes();
  await handler(mockReq({ method: 'POST', query: { action: 'login' }, body: { login: '(11) 98765-4321', password: '123mudar' } }), res);
  return cookieOf(res);
}

test('login with the right data answers 200, the subscriber and a secure session cookie', async () => {
  const res = mockRes();
  await make(fakeDb())(mockReq({ method: 'POST', query: { action: 'login' }, body: { login: 'maria@x.com', password: '123mudar' } }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.subscriber, { name: 'Maria Silva', phone: '11987654321', email: 'maria@x.com', usingInitialPassword: true });
  assert.match(res.headers['Set-Cookie'], /^subscriber_session=.+; HttpOnly; Secure; SameSite=Strict/);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('login with a wrong password answers 401 with no cookie and the same message as an unknown login', async () => {
  const wrong = mockRes();
  await make(fakeDb())(mockReq({ method: 'POST', query: { action: 'login' }, body: { login: 'maria@x.com', password: 'errada' } }), wrong);
  const unknown = mockRes();
  await make(fakeDb())(mockReq({ method: 'POST', query: { action: 'login' }, body: { login: 'ninguem@x.com', password: 'errada' } }), unknown);
  assert.equal(wrong.statusCode, 401);
  assert.deepEqual(wrong.body, { error: 'invalid_credentials' });
  assert.deepEqual(unknown.body, wrong.body);
  assert.equal(wrong.headers['Set-Cookie'], undefined);
});

test('after too many wrong passwords login answers 429 telling how long to wait', async () => {
  const handler = make(fakeDb());
  let res;
  for (let i = 0; i < 5; i++) {
    res = mockRes();
    await handler(mockReq({ method: 'POST', query: { action: 'login' }, body: { login: 'maria@x.com', password: 'errada' } }), res);
  }
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error, 'locked');
  assert.equal(res.body.retryAfterMinutes, 15);
});

test('login without a body does not crash: it is just invalid', async () => {
  for (const body of [null, undefined, 'texto', {}]) {
    const res = mockRes();
    await make(fakeDb())(mockReq({ method: 'POST', query: { action: 'login' }, body }), res);
    assert.equal(res.statusCode, 401, String(body));
  }
});

test('GET answers 200 with the subscriber when the cookie is valid, and 401 when there is none or it is invalid', async () => {
  const db = fakeDb();
  const handler = make(db);
  const token = await loggedIn(handler);

  const ok = mockRes();
  await handler(mockReq({ method: 'GET', headers: withCookie(token) }), ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.subscriber.name, 'Maria Silva');

  for (const headers of [{}, withCookie('lixo'), withCookie(token.replace(/^1\./, '2.'))]) {
    const res = mockRes();
    await handler(mockReq({ method: 'GET', headers }), res);
    assert.equal(res.statusCode, 401);
  }
});

test('an admin session cookie does not open the subscriber area', async () => {
  const auth = require('../lib/auth.js');
  const res = mockRes();
  await make(fakeDb())(mockReq({ method: 'GET', headers: { cookie: `${auth.SESSION_COOKIE_NAME}=${auth.signSession('x', SECRET)}` } }), res);
  assert.equal(res.statusCode, 401);
});

test('logout expires the cookie', async () => {
  const res = mockRes();
  await make(fakeDb())(mockReq({ method: 'POST', query: { action: 'logout' } }), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Set-Cookie'], /^subscriber_session=;.*Max-Age=0/);
});

test('changing the password answers 200 with a fresh cookie; the old password stops working', async () => {
  const db = fakeDb();
  const handler = make(db);
  const token = await loggedIn(handler);

  const res = mockRes();
  await handler(mockReq({ method: 'POST', query: { action: 'password' }, headers: withCookie(token), body: { currentPassword: '123mudar', newPassword: 'nova-senha-1' } }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  const fresh = cookieOf(res);
  assert.notEqual(fresh, token);

  const me = mockRes();
  await handler(mockReq({ method: 'GET', headers: withCookie(fresh) }), me);
  assert.equal(me.statusCode, 200);
  assert.equal(me.body.subscriber.usingInitialPassword, false);

  const old = mockRes();
  await handler(mockReq({ method: 'POST', query: { action: 'login' }, body: { login: 'maria@x.com', password: '123mudar' } }), old);
  assert.equal(old.statusCode, 401);
});

test('changing the password: 401 without session, 403 for a wrong current password, 400 for a weak new one', async () => {
  const handler = make(fakeDb());
  const token = await loggedIn(handler);

  const noSession = mockRes();
  await handler(mockReq({ method: 'POST', query: { action: 'password' }, body: { currentPassword: '123mudar', newPassword: 'nova-senha-1' } }), noSession);
  assert.equal(noSession.statusCode, 401);

  const wrong = mockRes();
  await handler(mockReq({ method: 'POST', query: { action: 'password' }, headers: withCookie(token), body: { currentPassword: 'errada', newPassword: 'nova-senha-1' } }), wrong);
  assert.equal(wrong.statusCode, 403);
  assert.deepEqual(wrong.body, { error: 'wrong_password' });

  const weak = mockRes();
  await handler(mockReq({ method: 'POST', query: { action: 'password' }, headers: withCookie(token), body: { currentPassword: '123mudar', newPassword: '123mudar' } }), weak);
  assert.equal(weak.statusCode, 400);
  assert.deepEqual(weak.body, { error: 'weak_password' });
});

test('unknown action or method answers 400/405, a missing secret 503, and a database failure 500', async () => {
  const handler = make(fakeDb());
  const bad = mockRes();
  await handler(mockReq({ method: 'POST', query: { action: 'xyz' } }), bad);
  assert.equal(bad.statusCode, 400);

  const del = mockRes();
  await handler(mockReq({ method: 'DELETE' }), del);
  assert.equal(del.statusCode, 405);

  const noSecret = mockRes();
  await make(fakeDb(), { sessionSecret: undefined })(mockReq({ method: 'GET' }), noSecret);
  assert.equal(noSecret.statusCode, 503);

  const broken = fakeDb();
  broken.getSubscriberBy = async () => { throw new Error('down'); };
  const res = mockRes();
  await make(broken)(mockReq({ method: 'POST', query: { action: 'login' }, body: { login: 'maria@x.com', password: 'x' } }), res);
  assert.equal(res.statusCode, 500);
});
