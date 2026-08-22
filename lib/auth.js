// lib/auth.js
const crypto = require('node:crypto');

const SESSION_COOKIE_NAME = 'admin_session';

function signSession(password, secret) {
  return crypto.createHmac('sha256', secret).update(password).digest('hex');
}

function verifySession(token, password, secret) {
  if (!token || typeof token !== 'string') return false;
  let provided;
  try {
    provided = Buffer.from(token, 'hex');
  } catch {
    return false;
  }
  const expectedHex = crypto.createHmac('sha256', secret).update(password).digest('hex');
  const expected = Buffer.from(expectedHex, 'hex');
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return acc;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) acc[key] = value;
    return acc;
  }, {});
}

function buildSessionCookie(token) {
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`;
}

module.exports = { SESSION_COOKIE_NAME, signSession, verifySession, parseCookies, buildSessionCookie };
