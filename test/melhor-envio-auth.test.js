// test/melhor-envio-auth.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAuthorizationUrl, exchangeCodeForTokens, refreshTokens } = require('../lib/melhor-envio-auth.js');

test('buildAuthorizationUrl builds the exact OAuth2 authorize URL', () => {
  const url = buildAuthorizationUrl({
    clientId: '11319',
    redirectUri: 'https://vinho-harmonia.vercel.app/api/melhor-envio-callback',
    state: 'abc123'
  });
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, 'https://melhorenvio.com.br/oauth/authorize');
  assert.equal(parsed.searchParams.get('client_id'), '11319');
  assert.equal(parsed.searchParams.get('redirect_uri'), 'https://vinho-harmonia.vercel.app/api/melhor-envio-callback');
  assert.equal(parsed.searchParams.get('response_type'), 'code');
  assert.equal(parsed.searchParams.get('state'), 'abc123');
  assert.equal(parsed.searchParams.get('scope'), 'shipping-calculate');
});

test('exchangeCodeForTokens posts the authorization_code grant and parses the response', async () => {
  const calls = [];
  const deps = {
    env: { MELHOR_ENVIO_CLIENT_ID: '11319', MELHOR_ENVIO_CLIENT_SECRET: 'secret', MELHOR_ENVIO_REDIRECT_URI: 'https://site/cb' },
    fetchImpl: async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, json: async () => ({ access_token: 'AT', refresh_token: 'RT', expires_in: 2592000 }) };
    }
  };
  const result = await exchangeCodeForTokens(deps, 'the-code');
  assert.equal(calls[0].url, 'https://melhorenvio.com.br/oauth/token');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.grant_type, 'authorization_code');
  assert.equal(body.client_id, '11319');
  assert.equal(body.client_secret, 'secret');
  assert.equal(body.redirect_uri, 'https://site/cb');
  assert.equal(body.code, 'the-code');
  assert.deepEqual(result, { accessToken: 'AT', refreshToken: 'RT', expiresIn: 2592000 });
});

test('exchangeCodeForTokens throws with a useful message when Melhor Envio rejects the code', async () => {
  const deps = {
    env: { MELHOR_ENVIO_CLIENT_ID: '11319', MELHOR_ENVIO_CLIENT_SECRET: 'secret', MELHOR_ENVIO_REDIRECT_URI: 'https://site/cb' },
    fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ message: 'invalid_grant' }) })
  };
  await assert.rejects(() => exchangeCodeForTokens(deps, 'bad-code'), /invalid_grant/);
});

test('refreshTokens posts the refresh_token grant', async () => {
  const calls = [];
  const deps = {
    env: { MELHOR_ENVIO_CLIENT_ID: '11319', MELHOR_ENVIO_CLIENT_SECRET: 'secret', MELHOR_ENVIO_REDIRECT_URI: 'https://site/cb' },
    fetchImpl: async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, json: async () => ({ access_token: 'AT2', refresh_token: 'RT2', expires_in: 2592000 }) };
    }
  };
  const result = await refreshTokens(deps, 'old-refresh-token');
  assert.equal(calls[0].url, 'https://melhorenvio.com.br/oauth/token');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.grant_type, 'refresh_token');
  assert.equal(body.refresh_token, 'old-refresh-token');
  assert.equal(body.client_id, '11319');
  assert.equal(body.client_secret, 'secret');
  assert.deepEqual(result, { accessToken: 'AT2', refreshToken: 'RT2', expiresIn: 2592000 });
});

test('exchangeCodeForTokens defaults expiresIn to 30 days when Melhor Envio omits expires_in', async () => {
  const deps = {
    env: { MELHOR_ENVIO_CLIENT_ID: '1', MELHOR_ENVIO_CLIENT_SECRET: 's', MELHOR_ENVIO_REDIRECT_URI: 'https://site/cb' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ access_token: 'AT', refresh_token: 'RT' }) })
  };
  const result = await exchangeCodeForTokens(deps, 'code');
  assert.equal(result.expiresIn, 30 * 24 * 60 * 60);
});
