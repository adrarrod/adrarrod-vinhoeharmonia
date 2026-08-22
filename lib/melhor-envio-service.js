// lib/melhor-envio-service.js
const defaultDb = require('./db.js');
const meAuth = require('./melhor-envio-auth.js');

const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000; // renova 1 dia antes do vencimento

async function getValidAccessToken(deps) {
  const db = deps.db || defaultDb;
  const stored = await db.getMelhorEnvioTokens(deps.execute);
  if (!stored) return null;

  const expiresAt = new Date(stored.expires_at).getTime();
  if (Date.now() < expiresAt - REFRESH_MARGIN_MS) {
    return stored.access_token;
  }

  try {
    const fresh = await meAuth.refreshTokens(deps, stored.refresh_token);
    const newExpiresAt = new Date(Date.now() + fresh.expiresIn * 1000).toISOString();
    await db.saveMelhorEnvioTokens(deps.execute, {
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken,
      expiresAt: newExpiresAt
    });
    return fresh.accessToken;
  } catch {
    return Date.now() < expiresAt ? stored.access_token : null;
  }
}

async function saveAuthorizationCode(deps, code) {
  const db = deps.db || defaultDb;
  const tokens = await meAuth.exchangeCodeForTokens(deps, code);
  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
  await db.saveMelhorEnvioTokens(deps.execute, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt
  });
}

async function isConnected(deps) {
  const db = deps.db || defaultDb;
  const stored = await db.getMelhorEnvioTokens(deps.execute);
  return Boolean(stored);
}

module.exports = { getValidAccessToken, saveAuthorizationCode, isConnected };
