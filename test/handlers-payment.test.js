// test/handlers-payment.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const { createPaymentHandler } = require('../lib/handlers/payment.js');

test('POST returns not-configured when Mercado Pago token is missing', async () => {
  const handler = createPaymentHandler({ env: {}, fetchImpl: async () => { throw new Error('unused'); } });
  const req = mockReq({ method: 'POST', body: { orderId: 1, total: 100, items: [{ name: 'Porta 6', qty: 1, price: 57.1 }] } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { configured: false });
});

test('POST returns the checkout URL when configured', async () => {
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok', SITE_URL: 'https://example.com' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ id: 'pref1', init_point: 'https://mp.example/pref1' }) })
  };
  const handler = createPaymentHandler(deps);
  const req = mockReq({ method: 'POST', body: { orderId: 9, total: 100, items: [{ name: 'Porta 6', qty: 1, price: 57.1 }] } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.initPoint, 'https://mp.example/pref1');
});

test('POST without orderId returns 400', async () => {
  const handler = createPaymentHandler({ env: {}, fetchImpl: async () => {} });
  const req = mockReq({ method: 'POST', body: { total: 100, items: [] } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
});

test('non-POST returns 405', async () => {
  const handler = createPaymentHandler({ env: {}, fetchImpl: async () => {} });
  const req = mockReq({ method: 'GET' });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 405);
});
