// lib/password.js — senhas dos assinantes. Nunca guardamos a senha em texto: só
// um "embaralhado" irreversível (scrypt + sal aleatório).
const crypto = require('node:crypto');

const DEFAULT_PASSWORD = '123mudar';
const MIN_LENGTH = 6;
const MAX_LENGTH = 100;
const KEY_LENGTH = 64;

function scrypt(plain, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(plain, salt, KEY_LENGTH, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(plain), salt);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

// Comparação em tempo constante. `stored` nulo = o assinante ainda está na
// senha inicial (nada é gravado no banco para ela). Nunca lança erro.
async function verifyPassword(plain, stored) {
  if (typeof plain !== 'string') return false;
  if (stored === null || stored === undefined) {
    const a = crypto.createHash('sha256').update(plain).digest();
    const b = crypto.createHash('sha256').update(DEFAULT_PASSWORD).digest();
    return crypto.timingSafeEqual(a, b);
  }
  const m = /^scrypt\$([0-9a-f]+)\$([0-9a-f]+)$/.exec(String(stored));
  if (!m) return false;
  try {
    const expected = Buffer.from(m[2], 'hex');
    if (expected.length !== KEY_LENGTH) return false;
    const actual = await scrypt(plain, Buffer.from(m[1], 'hex'));
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Regra para a senha que o assinante escolhe: tamanho razoável e não pode ser
// a própria senha inicial (que todo mundo conhece).
function validateNewPassword(value) {
  return typeof value === 'string' && value.length >= MIN_LENGTH && value.length <= MAX_LENGTH && value !== DEFAULT_PASSWORD;
}

// Identifica "qual senha está valendo" sem expor o hash: a sessão é amarrada a
// isso, então trocar ou redefinir a senha derruba todas as sessões abertas.
function fingerprint(stored) {
  return crypto.createHash('sha256').update(stored === null || stored === undefined ? 'default' : String(stored)).digest('hex').slice(0, 16);
}

module.exports = { DEFAULT_PASSWORD, MIN_LENGTH, MAX_LENGTH, hashPassword, verifyPassword, validateNewPassword, fingerprint };
