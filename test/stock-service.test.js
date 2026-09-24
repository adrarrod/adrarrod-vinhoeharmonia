// test/stock-service.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Catalog = require('../js/catalog.js');
const stock = require('../lib/stock-service.js');

const [A, B, C] = Catalog.MENU.slice(0, 3).map((w) => w.slug);

// db falso em memória: reserveStock respeita "quantity >= qty", como o SQL real.
function fakeDb(initial) {
  const state = { ...initial };
  const calls = [];
  return {
    state,
    calls,
    async ensureStockSchema(_execute, seed) { calls.push(['ensure', seed]); for (const r of seed) if (!(r.slug in state)) state[r.slug] = r.quantity; },
    async getStock() { return { ...state }; },
    async reserveStock(_execute, slug, qty) { calls.push(['reserve', slug, qty]); if ((state[slug] || 0) >= qty) { state[slug] -= qty; return true; } return false; },
    async releaseStock(_execute, slug, qty) { calls.push(['release', slug, qty]); state[slug] = (state[slug] || 0) + qty; },
    async setStock(_execute, slug, qty) { calls.push(['set', slug, qty]); state[slug] = qty; },
    async cancelOrder(_execute, id) { calls.push(['cancel', id]); return this.cancelResult === undefined ? null : this.cancelResult; }
  };
}
const depsOf = (db) => ({ execute: async () => ({ rows: [] }), db });

test('ensureStock seeds every catalog wine with its initialStock', async () => {
  const db = fakeDb({});
  await stock.ensureStock(depsOf(db));
  const seed = db.calls.find((c) => c[0] === 'ensure')[1];
  assert.equal(seed.length, Catalog.MENU.length);
  const first = Catalog.MENU[0];
  assert.deepEqual(seed[0], { slug: first.slug, quantity: first.initialStock });
});

test('getStockMap returns only catalog wines, so discontinued rows never leak to the store', async () => {
  const db = fakeDb({ [A]: 3, 'vinho-que-saiu-do-catalogo': 9 });
  const map = await stock.getStockMap(depsOf(db));
  assert.equal(map[A], 3);
  assert.equal('vinho-que-saiu-do-catalogo' in map, false);
});

test('getStockMap on a fully seeded table is a single read: no schema/seed work on every store visit', async () => {
  const full = {};
  for (const w of Catalog.MENU) full[w.slug] = 1;
  const db = fakeDb(full);
  await stock.getStockMap(depsOf(db));
  assert.equal(db.calls.some((c) => c[0] === 'ensure'), false);
});

test('getStockMap seeds first when the table is missing or has no row for a wine', async () => {
  const db = fakeDb({});
  const map = await stock.getStockMap(depsOf(db));
  assert.equal(db.calls.some((c) => c[0] === 'ensure'), true);
  assert.equal(map[Catalog.MENU[0].slug], Catalog.MENU[0].initialStock);
});

test('reserveItems takes the quantity from stock', async () => {
  const db = fakeDb({ [A]: 5, [B]: 1 });
  await stock.ensureStock(depsOf(db));
  await stock.reserveItems(depsOf(db), [{ slug: A, qty: 2 }, { slug: B, qty: 1 }]);
  assert.equal(db.state[A], 3);
  assert.equal(db.state[B], 0);
});

test('reserveItems sums repeated slugs before checking, so two lines cannot dodge the limit', async () => {
  const db = fakeDb({ [A]: 3 });
  await assert.rejects(
    () => stock.reserveItems(depsOf(db), [{ slug: A, qty: 2 }, { slug: A, qty: 2 }]),
    stock.OutOfStockError
  );
  assert.equal(db.state[A], 3);
});

test('reserveItems is all-or-nothing: earlier reservations are given back when a later item is short', async () => {
  const db = fakeDb({ [A]: 5, [B]: 0 });
  await assert.rejects(
    () => stock.reserveItems(depsOf(db), [{ slug: A, qty: 2 }, { slug: B, qty: 1 }]),
    (err) => {
      assert.ok(err instanceof stock.OutOfStockError);
      assert.deepEqual(err.items.map((i) => ({ slug: i.slug, available: i.available })), [{ slug: B, available: 0 }]);
      return true;
    }
  );
  assert.equal(db.state[A], 5);
});

test('OutOfStockError lists every short item with its name and what is still available', async () => {
  const db = fakeDb({ [A]: 1, [B]: 2, [C]: 9 });
  await assert.rejects(
    () => stock.reserveItems(depsOf(db), [{ slug: A, qty: 3 }, { slug: B, qty: 5 }, { slug: C, qty: 1 }]),
    (err) => {
      assert.deepEqual(
        err.items,
        [
          { slug: A, name: Catalog.findBySlug(A).name, available: 1 },
          { slug: B, name: Catalog.findBySlug(B).name, available: 2 }
        ]
      );
      return true;
    }
  );
  assert.equal(db.state[C], 9);
});

test('releaseItems puts the quantities back', async () => {
  const db = fakeDb({ [A]: 0 });
  await stock.releaseItems(depsOf(db), [{ slug: A, qty: 2 }]);
  assert.equal(db.state[A], 2);
});

test('setStockQuantity stores a valid quantity', async () => {
  const db = fakeDb({});
  await stock.setStockQuantity(depsOf(db), A, 12);
  assert.equal(db.state[A], 12);
});

test('setStockQuantity rejects an unknown wine, negatives, fractions and absurd values', async () => {
  const db = fakeDb({});
  for (const [slug, qty] of [['nao-existe', 1], [A, -1], [A, 1.5], [A, '3'], [A, NaN], [A, 100000]]) {
    await assert.rejects(() => stock.setStockQuantity(depsOf(db), slug, qty), stock.InvalidStockError, `${slug} ${qty}`);
  }
  assert.equal(db.calls.filter((c) => c[0] === 'set').length, 0);
});

test('cancelOrder gives the items of a newly cancelled order back to stock', async () => {
  const db = fakeDb({ [A]: 0, [B]: 0 });
  db.cancelResult = [{ slug: A, qty: 1 }, { slug: B, qty: 2 }];
  const result = await stock.cancelOrder(depsOf(db), 4);
  assert.deepEqual(result, { cancelled: true });
  assert.equal(db.state[A], 1);
  assert.equal(db.state[B], 2);
});

test('cancelOrder does nothing for an order that was already cancelled or does not exist', async () => {
  const db = fakeDb({ [A]: 0 });
  db.cancelResult = null;
  const result = await stock.cancelOrder(depsOf(db), 4);
  assert.deepEqual(result, { cancelled: false });
  assert.equal(db.state[A], 0);
});
