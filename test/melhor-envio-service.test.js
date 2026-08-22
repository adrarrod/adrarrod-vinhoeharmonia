// test/melhor-envio-service.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const meService = require('../lib/melhor-envio-service.js');

function fakeDb({ stored = null } = {}) {
  const saved = [];
  return {
    stored,
    saved,
    execute: async () => ({ rows: [] }),
    async getMelhorEnvioTokens() {
      return this.stored;
    },
    async saveMelhorEnvioTokens(_execute, tokens) {
      saved.push(tokens);
      this.stored = { access_token: tokens.accessToken, refresh_token: tokens.refreshToken, expires_at: tokens.expiresAt };
    }
  };
}

test('getValidAccessToken returns null when never connected', async () => {
  const db = fakeDb();
  const deps = { execute: db.execute, env: {}, fetchImpl: async () => { throw new Error('should not fetch'); }, db };
  const token = await meService.getValidAccessToken(deps);
  assert.equal(token, null);
});

test('getValidAccessToken returns the stored token when it is far from expiring', async () => {
  const farFuture = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
  const db = fakeDb({ stored: { access_token: 'AT', refresh_token: 'RT', expires_at: farFuture } });
  const deps = { execute: db.execute, env: {}, fetchImpl: async () => { throw new Error('should not fetch'); }, db };
  const token = await meService.getValidAccessToken(deps);
  assert.equal(token, 'AT');
});

test('getValidAccessToken refreshes when the token is within the renewal margin', async () => {
  const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // vence em 1h, dentro da margem de 24h
  const db = fakeDb({ stored: { access_token: 'OLD_AT', refresh_token: 'OLD_RT', expires_at: soon } });
  let refreshCalledWith = null;
  const deps = {
    execute: db.execute,
    env: { MELHOR_ENVIO_CLIENT_ID: '1', MELHOR_ENVIO_CLIENT_SECRET: 's' },
    fetchImpl: async (url, opts) => {
      refreshCalledWith = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ access_token: 'NEW_AT', refresh_token: 'NEW_RT', expires_in: 2592000 }) };
    },
    db
  };
  const token = await meService.getValidAccessToken(deps);
  assert.equal(token, 'NEW_AT');
  assert.equal(refreshCalledWith.grant_type, 'refresh_token');
  assert.equal(refreshCalledWith.refresh_token, 'OLD_RT');
  assert.equal(db.saved[0].accessToken, 'NEW_AT');
});

test('getValidAccessToken falls back to the still-valid stored token when refresh fails', async () => {
  const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const db = fakeDb({ stored: { access_token: 'OLD_AT', refresh_token: 'OLD_RT', expires_at: soon } });
  const deps = {
    execute: db.execute,
    env: { MELHOR_ENVIO_CLIENT_ID: '1', MELHOR_ENVIO_CLIENT_SECRET: 's' },
    fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ message: 'invalid_grant' }) }),
    db
  };
  const token = await meService.getValidAccessToken(deps);
  assert.equal(token, 'OLD_AT');
});

test('getValidAccessToken returns null when refresh fails and the stored token already expired', async () => {
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const db = fakeDb({ stored: { access_token: 'OLD_AT', refresh_token: 'OLD_RT', expires_at: past } });
  const deps = {
    execute: db.execute,
    env: { MELHOR_ENVIO_CLIENT_ID: '1', MELHOR_ENVIO_CLIENT_SECRET: 's' },
    fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ message: 'invalid_grant' }) }),
    db
  };
  const token = await meService.getValidAccessToken(deps);
  assert.equal(token, null);
});

test('saveAuthorizationCode exchanges the code and persists the returned tokens', async () => {
  const db = fakeDb();
  const deps = {
    execute: db.execute,
    env: { MELHOR_ENVIO_CLIENT_ID: '1', MELHOR_ENVIO_CLIENT_SECRET: 's', MELHOR_ENVIO_REDIRECT_URI: 'https://site/cb' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ access_token: 'AT', refresh_token: 'RT', expires_in: 2592000 }) }),
    db
  };
  await meService.saveAuthorizationCode(deps, 'the-code');
  assert.equal(db.saved.length, 1);
  assert.equal(db.saved[0].accessToken, 'AT');
  assert.equal(db.saved[0].refreshToken, 'RT');
  assert.ok(new Date(db.saved[0].expiresAt).getTime() > Date.now());
});

test('isConnected reflects whether tokens are stored', async () => {
  const connected = fakeDb({ stored: { access_token: 'AT', refresh_token: 'RT', expires_at: new Date().toISOString() } });
  const notConnected = fakeDb();
  assert.equal(await meService.isConnected({ execute: connected.execute, db: connected }), true);
  assert.equal(await meService.isConnected({ execute: notConnected.execute, db: notConnected }), false);
});
