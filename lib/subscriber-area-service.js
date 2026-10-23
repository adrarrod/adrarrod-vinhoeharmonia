// lib/subscriber-area-service.js — login e senha da área do assinante.
const defaultDb = require('./db.js');
const password = require('./password.js');
const session = require('./subscriber-session.js');

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function dbOf(deps) {
  return deps.db || defaultDb;
}

function nowOf(deps) {
  return deps.now ? deps.now() : Date.now();
}

// O que a página recebe: nunca o hash nem os contadores de tentativas.
function toArea(row) {
  return {
    name: row.name,
    phone: row.phone,
    email: row.email,
    usingInitialPassword: row.password_hash === null || row.password_hash === undefined
  };
}

function tokenFor(deps, row) {
  return session.signToken(row.id, deps.sessionSecret, password.fingerprint(row.password_hash), nowOf(deps));
}

// Celular (só os números conta) ou e-mail: quem tem "@" é e-mail.
async function findByLogin(deps, login) {
  if (typeof login !== 'string') return null;
  const db = dbOf(deps);
  const text = login.trim();
  if (text.includes('@')) return db.getSubscriberBy(deps.execute, 'email', text.toLowerCase());
  const digits = text.replace(/\D/g, '');
  if (!/^\d{10,11}$/.test(digits)) return null;
  return db.getSubscriberBy(deps.execute, 'phone', digits);
}

function lockedMinutes(row, now) {
  if (!row.locked_until) return 0;
  const left = new Date(row.locked_until).getTime() - now;
  return left > 0 ? Math.ceil(left / 60000) : 0;
}

// Soma um erro de senha e diz se a conta acabou de ser travada.
async function failAttempt(deps, row) {
  const updated = await dbOf(deps).recordFailedLogin(deps.execute, row.id, MAX_ATTEMPTS, LOCK_MINUTES);
  const minutes = updated ? lockedMinutes(updated, nowOf(deps)) : 0;
  return minutes ? { status: 'locked', retryAfterMinutes: minutes } : null;
}

async function login(deps, { login: who, password: plain } = {}) {
  const db = dbOf(deps);
  await db.ensureSubscribersSchema(deps.execute);
  const row = await findByLogin(deps, who);
  if (!row) {
    // Gasta o mesmo tempo de uma conferência real: não revela se o login existe.
    await password.hashPassword(typeof plain === 'string' ? plain : '');
    return { status: 'invalid' };
  }
  const minutes = lockedMinutes(row, nowOf(deps));
  if (minutes) return { status: 'locked', retryAfterMinutes: minutes };

  if (!(await password.verifyPassword(plain, row.password_hash))) {
    return (await failAttempt(deps, row)) || { status: 'invalid' };
  }
  if (row.failed_attempts > 0 || row.locked_until) await db.clearLoginFailures(deps.execute, row.id);
  return { status: 'ok', subscriber: toArea(row), token: tokenFor(deps, row) };
}

// Assinante da sessão (cookie), ou null se não houver sessão válida.
async function currentRow(deps, token) {
  const id = session.readTokenId(token);
  if (id === null) return null;
  const db = dbOf(deps);
  await db.ensureSubscribersSchema(deps.execute);
  const row = await db.getSubscriberBy(deps.execute, 'id', id);
  if (!row) return null;
  return session.verifyToken(token, deps.sessionSecret, password.fingerprint(row.password_hash), nowOf(deps)) ? row : null;
}

async function currentSubscriber(deps, token) {
  const row = await currentRow(deps, token);
  return row ? toArea(row) : null;
}

async function changePassword(deps, token, { currentPassword, newPassword } = {}) {
  const row = await currentRow(deps, token);
  if (!row) return { status: 'unauthorized' };
  const minutes = lockedMinutes(row, nowOf(deps));
  if (minutes) return { status: 'locked', retryAfterMinutes: minutes };
  if (!password.validateNewPassword(newPassword)) return { status: 'weak' };

  if (!(await password.verifyPassword(currentPassword, row.password_hash))) {
    return (await failAttempt(deps, row)) || { status: 'wrong_password' };
  }
  const hash = await password.hashPassword(newPassword);
  await dbOf(deps).setSubscriberPasswordHash(deps.execute, row.id, hash);
  return { status: 'ok', token: tokenFor(deps, { id: row.id, password_hash: hash }) };
}

module.exports = { MAX_ATTEMPTS, LOCK_MINUTES, toArea, login, currentSubscriber, changePassword };
