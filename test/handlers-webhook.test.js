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

test('a failing status lookup still returns 200 so Mercado Pago does not retry forever', async () => {
  let called = false;
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok' },
    // fetchPaymentStatus lança em resposta não-200; é esse caminho que o handler precisa absorver.
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    execute: async () => { called = true; return { rows: [] }; }
  };
  const handler = createWebhookHandler(deps);
  const req = mockReq({ method: 'POST', body: { data: { id: 'pay123' } } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { received: true, warning: 'status_check_failed' });
  assert.equal(called, false);
});

test('a failing status write still returns 200 so Mercado Pago does not retry forever', async () => {
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'approved', external_reference: '9' }) }),
    // Consulta ao Mercado Pago funciona; quem falha é a gravação no Postgres.
    execute: async () => { throw new Error('connection terminated'); }
  };
  const handler = createWebhookHandler(deps);
  const req = mockReq({ method: 'POST', body: { data: { id: 'pay123' } } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { received: true, warning: 'status_check_failed' });
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
