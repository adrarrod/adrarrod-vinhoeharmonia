// lib/promo-service.js — interruptor da Black Friday. O administrador liga e
// desliga pelo painel e vale na hora, sem novo deploy: o servidor lê este ajuste
// a cada pedido e a vitrine o consulta ao abrir. Sem ajuste salvo, a promoção
// está desligada.
const defaultDb = require('./db.js');

const KEY = 'black_friday';

class InvalidPromoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidPromoError';
  }
}

function dbOf(deps) {
  return deps.db || defaultDb;
}

async function isBlackFridayActive(deps) {
  const db = dbOf(deps);
  await db.ensureSettingsSchema(deps.execute);
  return (await db.getSetting(deps.execute, KEY)) === 'on';
}

async function setBlackFridayActive(deps, active) {
  if (typeof active !== 'boolean') throw new InvalidPromoError('blackFriday must be true or false');
  const db = dbOf(deps);
  await db.ensureSettingsSchema(deps.execute);
  await db.setSetting(deps.execute, KEY, active ? 'on' : 'off');
}

// O que a vitrine e o painel precisam saber.
async function state(deps) {
  return { blackFriday: await isBlackFridayActive(deps) };
}

module.exports = { InvalidPromoError, isBlackFridayActive, setBlackFridayActive, state };
