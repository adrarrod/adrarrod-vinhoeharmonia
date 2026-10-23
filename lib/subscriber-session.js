// lib/subscriber-session.js — sessão (cookie) da área do assinante. Separada da
// sessão do admin: o texto assinado começa com "subscriber:", então um token de
// um nunca vale no outro.
const crypto = require('node:crypto');
const auth = require('./auth.js');

const COOKIE_NAME = 'subscriber_session';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function sign(secret, id, exp, fp) {
  return crypto.createHmac('sha256', secret).update(`subscriber:${id}.${exp}.${fp}`).digest('hex');
}

// fp = fingerprint da senha atual (lib/password.js): trocar a senha invalida o token.
function signToken(id, secret, fp, now = Date.now()) {
  const exp = Math.floor(now / 1000) + MAX_AGE_SECONDS;
  return `${id}.${exp}.${sign(secret, id, exp, fp)}`;
}

function parts(token) {
  if (typeof token !== 'string') return null;
  const m = /^(\d+)\.(\d+)\.([0-9a-f]+)$/.exec(token);
  return m ? { id: Number(m[1]), exp: Number(m[2]), sig: m[3] } : null;
}

// Só lê o id (sem validar nada): serve para saber qual assinante carregar do
// banco antes de conferir a assinatura com a senha dele.
function readTokenId(token) {
  const p = parts(token);
  return p && Number.isInteger(p.id) && p.id > 0 ? p.id : null;
}

function verifyToken(token, secret, fp, now = Date.now()) {
  const p = parts(token);
  if (!p || !secret) return false;
  if (now >= p.exp * 1000) return false;
  const expected = Buffer.from(sign(secret, p.id, p.exp, fp), 'hex');
  const provided = Buffer.from(p.sig, 'hex');
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function buildCookie(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
}

function clearCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

function tokenFromRequest(req) {
  return auth.parseCookies(req.headers && req.headers.cookie)[COOKIE_NAME];
}

module.exports = { COOKIE_NAME, MAX_AGE_SECONDS, signToken, readTokenId, verifyToken, buildCookie, clearCookie, tokenFromRequest };
