// test/handlers-stock.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const auth = require('../lib/auth.js');
const Catalog = require('../js/catalog.js');
const { createStockHandler } = require('../lib/handlers/stock.js');
const { createCancelOrderHandler } = require('../lib/handlers/order-cancel.js');

const PASSWORD = 'admin-pass';
const SECRET = 'test-secret';
const A = Catalog.MENU[0].slug;

function adminHeaders() {
  return { cookie: `${auth.SESSION_COOKIE_NAME}=${auth.signSession(PASSWORD, SECRET)}` };
}

function fakeDb(state = {}, cancelResult = null) {
  const calls = [];
  return {
    calls,
    async ensureStockSchema() {},
    async getStock() { return { ...state }; },
    async setStock(_e, slug, qty) { calls.push(['set', slug, qty]); state[slug] = qty; },
    async releaseStock(_e, slug, qty) { calls.push(['release', slug, qty]); state[slug] = (state[slug] || 0) + qty; },
    async cancelOrder(_e, id) { calls.push(['cancel', id]); return cancelResult; }
  };
}
const base = (db, extra = {}) => ({ execute: async () => ({ rows: [] }), db, adminPassword: PASSWORD, sessionSecret: SECRET, ...extra });

// --- /api/stock ---

test('GET stock is public and returns the live quantity of every wine, never cached', async () => {
  const handler = createStockHandler(base(fakeDb({ [A]: 1 })));
  const res = mockRes();
  await handler(mockReq({ method: 'GET' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body[A], 1);
  assert.equal(Object.keys(res.body).length, Catalog.MENU.length);
  assert.match(res.headers['Cache-Control'], /no-store/);
});

test('GET stock answers 500 (not a crash) when the database fails', async () => {
  const db = fakeDb();
  db.getStock = async () => { throw new Error('down'); };
  const handler = createStockHandler(base(db));
  const res = mockRes();
  await handler(mockReq({ method: 'GET' }), res);
  assert.equal(res.statusCode, 500);
});

test('POST stock without an admin session is rejected and changes nothing', async () => {
  const db = fakeDb();
  const handler = createStockHandler(base(db));
  const res = mockRes();
  await handler(mockReq({ method: 'POST', headers: {}, body: { slug: A, quantity: 5 } }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(db.calls.length, 0);
});

test('POST stock with an admin session sets the quantity', async () => {
  const db = fakeDb();
  const handler = createStockHandler(base(db));
  const res = mockRes();
  await handler(mockReq({ method: 'POST', headers: adminHeaders(), body: { slug: A, quantity: 5 } }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(db.calls, [['set', A, 5]]);
});

test('POST stock rejects an invalid quantity or unknown wine with 400', async () => {
  const db = fakeDb();
  const handler = createStockHandler(base(db));
  for (const body of [{ slug: A, quantity: -1 }, { slug: A, quantity: 'x' }, { slug: 'nao-existe', quantity: 1 }, {}]) {
    const res = mockRes();
    await handler(mockReq({ method: 'POST', headers: adminHeaders(), body }), res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  assert.equal(db.calls.length, 0);
});

test('stock handler rejects other methods with 405', async () => {
  const handler = createStockHandler(base(fakeDb()));
  const res = mockRes();
  await handler(mockReq({ method: 'DELETE' }), res);
  assert.equal(res.statusCode, 405);
});

// --- /api/order-cancel ---

test('cancel order requires an admin session', async () => {
  const db = fakeDb();
  const handler = createCancelOrderHandler(base(db));
  const res = mockRes();
  await handler(mockReq({ method: 'POST', headers: {}, body: { orderId: 4 } }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(db.calls.length, 0);
});

test('cancel order returns the bottles to stock and says it cancelled', async () => {
  const db = fakeDb({ [A]: 0 }, [{ slug: A, qty: 1 }]);
  const handler = createCancelOrderHandler(base(db));
  const res = mockRes();
  await handler(mockReq({ method: 'POST', headers: adminHeaders(), body: { orderId: 4 } }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { cancelled: true });
  assert.deepEqual(db.calls, [['cancel', 4], ['release', A, 1]]);
});

test('cancelling an already cancelled order is a harmless no-op', async () => {
  const db = fakeDb({ [A]: 0 }, null);
  const handler = createCancelOrderHandler(base(db));
  const res = mockRes();
  await handler(mockReq({ method: 'POST', headers: adminHeaders(), body: { orderId: 4 } }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { cancelled: false });
  assert.equal(db.calls.some((c) => c[0] === 'release'), false);
});

test('cancel order rejects a missing or non-numeric orderId, and non-POST methods', async () => {
  const handler = createCancelOrderHandler(base(fakeDb()));
  for (const body of [{}, { orderId: 'abc' }, { orderId: -1 }, { orderId: 1.5 }]) {
    const res = mockRes();
    await handler(mockReq({ method: 'POST', headers: adminHeaders(), body }), res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  const res = mockRes();
  await handler(mockReq({ method: 'GET', headers: adminHeaders() }), res);
  assert.equal(res.statusCode, 405);
});
