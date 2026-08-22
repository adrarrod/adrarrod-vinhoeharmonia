// test/handlers-webhook.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const { createWebhookHandler } = require('../lib/handlers/webhook.js');
const { buildManifest } = require('../lib/mp-signature.js');

const SECRET = 'test-webhook-secret';

function signedRequest({ dataId = 'pay123', requestId = 'req-1', body = { data: { id: dataId } } } = {}) {
  const ts = String(Date.now());
  const manifest = buildManifest({ dataId, requestId, ts });
  const v1 = crypto.createHmac('sha256', SECRET).update(manifest).digest('hex');
  return mockReq({
    method: 'POST',
    body,
    query: { 'data.id': dataId },
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId }
  });
}

test('approved payment sets order status to pago', async () => {
  const updates = [];
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok', MP_WEBHOOK_SECRET: SECRET },
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'approved', external_reference: '9' }) }),
    execute: async (text, params) => { updates.push({ text, params }); return { rows: [] }; }
  };
  const handler = createWebhookHandler(deps);
  const req = signedRequest({ dataId: 'pay123' });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(updates[0].params[0], 'pago');
  assert.equal(updates[0].params[1], '9');
});

test('rejected payment sets order status to pagamento_recusado', async () => {
  const updates = [];
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok', MP_WEBHOOK_SECRET: SECRET },
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'rejected', external_reference: '9' }) }),
    execute: async (text, params) => { updates.push({ text, params }); return { rows: [] }; }
  };
  const handler = createWebhookHandler(deps);
  const req = signedRequest({ dataId: 'pay123' });
  const res = mockRes();
  await handler(req, res);
  assert.equal(updates[0].params[0], 'pagamento_recusado');
});

test('a failing status lookup still returns 200 so Mercado Pago does not retry forever', async () => {
  let called = false;
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok', MP_WEBHOOK_SECRET: SECRET },
    // fetchPaymentStatus lança em resposta não-200; é esse caminho que o handler precisa absorver.
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    execute: async () => { called = true; return { rows: [] }; }
  };
  const handler = createWebhookHandler(deps);
  const req = signedRequest({ dataId: 'pay123' });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { received: true, warning: 'status_check_failed' });
  assert.equal(called, false);
});

test('a failing status write still returns 200 so Mercado Pago does not retry forever', async () => {
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok', MP_WEBHOOK_SECRET: SECRET },
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'approved', external_reference: '9' }) }),
    // Consulta ao Mercado Pago funciona; quem falha é a gravação no Postgres.
    execute: async () => { throw new Error('connection terminated'); }
  };
  const handler = createWebhookHandler(deps);
  const req = signedRequest({ dataId: 'pay123' });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { received: true, warning: 'status_check_failed' });
});

test('missing payment id returns 200 without touching the db (Mercado Pago retries on non-2xx)', async () => {
  let called = false;
  const deps = { env: { MP_WEBHOOK_SECRET: SECRET }, fetchImpl: async () => {}, execute: async () => { called = true; return { rows: [] }; } };
  const handler = createWebhookHandler(deps);
  const req = signedRequest({ dataId: '', requestId: 'req-1', body: {} });
  req.query = {};
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(called, false);
});

test('a request without MP_WEBHOOK_SECRET configured is ignored, never touches the db', async () => {
  let called = false;
  const deps = { env: { MP_ACCESS_TOKEN: 'tok' }, fetchImpl: async () => { throw new Error('should not be called'); }, execute: async () => { called = true; return { rows: [] }; } };
  const handler = createWebhookHandler(deps);
  const req = signedRequest({ dataId: 'pay123' });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ignored: true, warning: 'webhook_secret_not_configured' });
  assert.equal(called, false);
});

test('a request with an invalid signature is rejected with 401, never touches the db', async () => {
  let called = false;
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok', MP_WEBHOOK_SECRET: SECRET },
    fetchImpl: async () => { throw new Error('should not be called'); },
    execute: async () => { called = true; return { rows: [] }; }
  };
  const handler = createWebhookHandler(deps);
  const req = mockReq({
    method: 'POST',
    body: { data: { id: 'pay123' } },
    query: { 'data.id': 'pay123' },
    headers: { 'x-signature': 'ts=123,v1=0000000000000000000000000000000000000000000000000000000000000000', 'x-request-id': 'req-1' }
  });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'invalid_signature' });
  assert.equal(called, false);
});

test('a request with no x-signature header at all is rejected with 401', async () => {
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok', MP_WEBHOOK_SECRET: SECRET },
    fetchImpl: async () => { throw new Error('should not be called'); },
    execute: async () => { throw new Error('should not be called'); }
  };
  const handler = createWebhookHandler(deps);
  const req = mockReq({ method: 'POST', body: { data: { id: 'pay123' } }, query: { 'data.id': 'pay123' }, headers: {} });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
});
