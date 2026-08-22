const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const { createFreightHandler } = require('../lib/handlers/freight.js');

test('POST returns a freight quote', async () => {
  const handler = createFreightHandler({ env: {}, fetchImpl: async () => { throw new Error('unused'); } });
  const req = mockReq({ method: 'POST', body: { cep: '01000-000', subtotal: 100 } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { cost: 15, free: false, source: 'fallback' });
});

test('POST without cep returns 400', async () => {
  const handler = createFreightHandler({ env: {}, fetchImpl: async () => {} });
  const req = mockReq({ method: 'POST', body: { subtotal: 100 } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
});

test('non-POST returns 405', async () => {
  const handler = createFreightHandler({ env: {}, fetchImpl: async () => {} });
  const req = mockReq({ method: 'GET' });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 405);
});
