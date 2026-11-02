// test/promo-service.test.js — interruptor da Black Friday
const test = require('node:test');
const assert = require('node:assert/strict');
const promo = require('../lib/promo-service.js');

function fakeDb(initial) {
  const settings = new Map(Object.entries(initial || {}));
  const calls = [];
  return {
    settings, calls,
    async ensureSettingsSchema() { calls.push('ensure'); },
    async getSetting(_e, key) { calls.push(['get', key]); return settings.has(key) ? settings.get(key) : null; },
    async setSetting(_e, key, value) { calls.push(['set', key, value]); settings.set(key, value); }
  };
}
const deps = (db) => ({ execute: async () => ({ rows: [] }), db });

test('the promotion starts off: a store that never flipped the switch has no discounts', async () => {
  assert.equal(await promo.isBlackFridayActive(deps(fakeDb())), false);
});

test('turning it on makes it active, and turning it off ends it', async () => {
  const db = fakeDb();
  await promo.setBlackFridayActive(deps(db), true);
  assert.equal(await promo.isBlackFridayActive(deps(db)), true);
  assert.equal(db.settings.get('black_friday'), 'on');
  await promo.setBlackFridayActive(deps(db), false);
  assert.equal(await promo.isBlackFridayActive(deps(db)), false);
  assert.equal(db.settings.get('black_friday'), 'off');
});

test('only the exact value "on" counts as active; anything else is off', async () => {
  for (const value of ['off', '', 'true', 'ON', '1', 'yes']) {
    assert.equal(await promo.isBlackFridayActive(deps(fakeDb({ black_friday: value }))), false, value);
  }
});

test('it makes sure the settings table exists before reading or writing', async () => {
  const db = fakeDb();
  await promo.isBlackFridayActive(deps(db));
  assert.equal(db.calls[0], 'ensure');
  const db2 = fakeDb();
  await promo.setBlackFridayActive(deps(db2), true);
  assert.equal(db2.calls[0], 'ensure');
});

test('state gives the page what it needs to know', async () => {
  assert.deepEqual(await promo.state(deps(fakeDb())), { blackFriday: false });
  assert.deepEqual(await promo.state(deps(fakeDb({ black_friday: 'on' }))), { blackFriday: true });
});

test('setBlackFridayActive refuses anything that is not a real true/false', async () => {
  const db = fakeDb();
  for (const bad of ['true', 1, null, undefined, {}]) {
    await assert.rejects(() => promo.setBlackFridayActive(deps(db), bad), promo.InvalidPromoError, String(bad));
  }
  assert.equal(db.settings.size, 0);
});
