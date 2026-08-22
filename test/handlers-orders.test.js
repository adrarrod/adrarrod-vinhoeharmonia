// test/handlers-orders.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const { createOrdersHandler } = require('../lib/handlers/orders.js');
const auth = require('../lib/auth.js');

const SECRET = 'test-secret';
const PASSWORD = 'admin-pass';

function makeDeps(overrides = {}) {
  return {
    execute: async (text) => (text.startsWith('INSERT') ? { rows: [{ id: 1 }] } : { rows: [] }),
    adminPassword: PASSWORD,
    sessionSecret: SECRET,
    ...overrides
  };
}

function validBody() {
  return {
    customer: { fullName: 'Maria Silva', birthDate: '1990-05-20', cpf: '111.222.333-44', phone: '11987654321', email: 'maria@example.com' },
    delivery: { type: 'pickup', address: null, freightCost: 0 },
    items: [{ slug: 'porta-6', name: 'Porta 6', price: 57.1, qty: 1 }],
    couponCode: null,
    paymentMethod: 'pix'
  };
}

test('POST creates an order and returns 201 with totals', async () => {
  const handler = createOrdersHandler(makeDeps());
  const req = mockReq({ method: 'POST', body: validBody() });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.id, 1);
  assert.equal(res.body.total, 57.1);
});

test('POST with invalid payload returns 400 with error list', async () => {
  const handler = createOrdersHandler(makeDeps());
  const req = mockReq({ method: 'POST', body: { ...validBody(), items: [] } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.errors.includes('items'));
});

test('GET without a valid admin session returns 401', async () => {
  const handler = createOrdersHandler(makeDeps());
  const req = mockReq({ method: 'GET', headers: {} });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
});

test('GET with a valid admin session returns the order list', async () => {
  const token = auth.signSession(PASSWORD, SECRET);
  const deps = makeDeps({ execute: async () => ({ rows: [{ id: 1 }, { id: 2 }] }) });
  const handler = createOrdersHandler(deps);
  const req = mockReq({ method: 'GET', headers: { cookie: `admin_session=${token}` } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 2);
});

test('unsupported method returns 405', async () => {
  const handler = createOrdersHandler(makeDeps());
  const req = mockReq({ method: 'DELETE' });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 405);
});
