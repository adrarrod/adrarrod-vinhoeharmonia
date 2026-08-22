// test/handlers-melhor-envio.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const auth = require('../lib/auth.js');
const { createConnectHandler } = require('../lib/handlers/melhor-envio-connect.js');
const { createCallbackHandler } = require('../lib/handlers/melhor-envio-callback.js');
const { createStatusHandler } = require('../lib/handlers/melhor-envio-status.js');

const ADMIN_PASSWORD = 'senha-teste';
const SESSION_SECRET = 'segredo-teste';

function adminCookieHeader() {
  const token = auth.signSession(ADMIN_PASSWORD, SESSION_SECRET);
  return `${auth.SESSION_COOKIE_NAME}=${token}`;
}

// --- connect ---

test('connect: rejects non-admin requests', async () => {
  const handler = createConnectHandler({ adminPassword: ADMIN_PASSWORD, sessionSecret: SESSION_SECRET, env: {} });
  const req = mockReq({ method: 'GET', headers: {} });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
});

test('connect: redirects an authenticated admin to the Melhor Envio authorize URL and sets a state cookie', async () => {
  const handler = createConnectHandler({
    adminPassword: ADMIN_PASSWORD,
    sessionSecret: SESSION_SECRET,
    env: { MELHOR_ENVIO_CLIENT_ID: '11319', MELHOR_ENVIO_REDIRECT_URI: 'https://site/api/melhor-envio-callback' },
    randomState: () => 'fixed-state-value'
  });
  const req = mockReq({ method: 'GET', headers: { cookie: adminCookieHeader() } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 302);
  assert.match(res.headers.Location, /^https:\/\/melhorenvio\.com\.br\/oauth\/authorize\?/);
  assert.match(res.headers.Location, /client_id=11319/);
  assert.match(res.headers.Location, /state=fixed-state-value/);
  assert.match(res.headers['Set-Cookie'], /me_oauth_state=fixed-state-value/);
});

test('connect: rejects non-GET requests', async () => {
  const handler = createConnectHandler({ adminPassword: ADMIN_PASSWORD, sessionSecret: SESSION_SECRET, env: {} });
  const req = mockReq({ method: 'POST', headers: { cookie: adminCookieHeader() } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 405);
});

// --- callback ---

function fakeDb(saved) {
  return {
    async saveMelhorEnvioTokens(_execute, tokens) { saved.push(tokens); },
    async getMelhorEnvioTokens() { return null; }
  };
}

test('callback: exchanges a valid code+state and redirects to admin with success', async () => {
  const saved = [];
  const handler = createCallbackHandler({
    env: { MELHOR_ENVIO_CLIENT_ID: '1', MELHOR_ENVIO_CLIENT_SECRET: 's', MELHOR_ENVIO_REDIRECT_URI: 'https://site/cb' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ access_token: 'AT', refresh_token: 'RT', expires_in: 2592000 }) }),
    execute: async () => ({ rows: [] }),
    db: fakeDb(saved)
  });
  const req = mockReq({ method: 'GET', query: { code: 'the-code', state: 'abc' }, headers: { cookie: 'me_oauth_state=abc' } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 302);
  assert.match(res.headers.Location, /melhor_envio=conectado/);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].accessToken, 'AT');
});

test('callback: rejects when state does not match the cookie (CSRF)', async () => {
  const saved = [];
  const handler = createCallbackHandler({
    env: {},
    fetchImpl: async () => { throw new Error('should not be called'); },
    execute: async () => ({ rows: [] }),
    db: fakeDb(saved)
  });
  const req = mockReq({ method: 'GET', query: { code: 'the-code', state: 'wrong' }, headers: { cookie: 'me_oauth_state=abc' } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 302);
  assert.match(res.headers.Location, /melhor_envio=erro/);
  assert.equal(saved.length, 0);
});

test('callback: redirects with error when Melhor Envio itself reports an error', async () => {
  const handler = createCallbackHandler({ env: {}, fetchImpl: async () => { throw new Error('should not be called'); }, execute: async () => ({ rows: [] }), db: fakeDb([]) });
  const req = mockReq({ method: 'GET', query: { error: 'access_denied', state: 'abc' }, headers: { cookie: 'me_oauth_state=abc' } });
  const res = mockRes();
  await handler(req, res);
  assert.match(res.headers.Location, /melhor_envio=erro/);
});

test('callback: redirects with error when the token exchange throws', async () => {
  const handler = createCallbackHandler({
    env: {},
    fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ message: 'invalid_grant' }) }),
    execute: async () => ({ rows: [] }),
    db: fakeDb([])
  });
  const req = mockReq({ method: 'GET', query: { code: 'bad', state: 'abc' }, headers: { cookie: 'me_oauth_state=abc' } });
  const res = mockRes();
  await handler(req, res);
  assert.match(res.headers.Location, /melhor_envio=erro/);
});

// --- status ---

test('status: rejects non-admin requests', async () => {
  const handler = createStatusHandler({ adminPassword: ADMIN_PASSWORD, sessionSecret: SESSION_SECRET, execute: async () => ({ rows: [] }), db: fakeDb([]) });
  const req = mockReq({ method: 'GET', headers: {} });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
});

test('status: reports connected true/false for an authenticated admin', async () => {
  const connectedDb = { async getMelhorEnvioTokens() { return { access_token: 'AT' }; } };
  const handlerConnected = createStatusHandler({ adminPassword: ADMIN_PASSWORD, sessionSecret: SESSION_SECRET, execute: async () => ({ rows: [] }), db: connectedDb });
  const req1 = mockReq({ method: 'GET', headers: { cookie: adminCookieHeader() } });
  const res1 = mockRes();
  await handlerConnected(req1, res1);
  assert.equal(res1.statusCode, 200);
  assert.deepEqual(res1.body, { connected: true });

  const notConnectedDb = { async getMelhorEnvioTokens() { return null; } };
  const handlerNotConnected = createStatusHandler({ adminPassword: ADMIN_PASSWORD, sessionSecret: SESSION_SECRET, execute: async () => ({ rows: [] }), db: notConnectedDb });
  const req2 = mockReq({ method: 'GET', headers: { cookie: adminCookieHeader() } });
  const res2 = mockRes();
  await handlerNotConnected(req2, res2);
  assert.deepEqual(res2.body, { connected: false });
});
