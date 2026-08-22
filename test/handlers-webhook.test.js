// test/handlers-webhook.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const { createWebhookHandler } = require('../lib/handlers/webhook.js');

test('approved payment sets order status to pago', async () => {
  const updates = [];
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'approved', external_reference: '9' }) }),
    execute: async (text, params) => { updates.push({ text, params }); return { rows: [] }; }
  };
  const handler = createWebhookHandler(deps);
  const req = mockReq({ method: 'POST', body: { data: { id: 'pay123' } } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(updates[0].params[0], 'pago');
  assert.equal(updates[0].params[1], '9');
});

test('rejected payment sets order status to pagamento_recusado', async () => {
  const updates = [];
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'rejected', external_reference: '9' }) }),
    execute: async (text, params) => { updates.push({ text, params }); return { rows: [] }; }
  };
  const handler = createWebhookHandler(deps);
  const req = mockReq({ method: 'POST', body: { data: { id: 'pay123' } } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(updates[0].params[0], 'pagamento_recusado');
});

test('missing payment id returns 200 without touching the db (Mercado Pago retries on non-2xx)', async () => {
  let called = false;
  const deps = { env: {}, fetchImpl: async () => {}, execute: async () => { called = true; return { rows: [] }; } };
  const handler = createWebhookHandler(deps);
  const req = mockReq({ method: 'POST', body: {} });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(called, false);
});
