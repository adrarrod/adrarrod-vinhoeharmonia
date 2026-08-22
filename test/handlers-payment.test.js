// test/handlers-payment.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const { createPaymentHandler } = require('../lib/handlers/payment.js');

// Simula o que o Postgres realmente devolve: NUMERIC vira STRING (para não
// perder precisão) e JSONB vira array de objetos já parseado.
function orderRow(overrides = {}) {
  return {
    id: 9,
    items: [
      { slug: 'porta-6', name: 'Porta 6', price: 57.1, qty: 2, note: '' },
      { slug: 'porta-6', name: 'Outro', price: 20, qty: 1, note: 'presente' }
    ],
    subtotal: '134.20',
    discount: '0',
    freight: '15.00',
    total: '149.20',
    payment_method: 'card',
    ...overrides
  };
}

// execute fake: responde ao SELECT do pedido com a linha dada (ou nenhuma).
function fakeExecute(row, calls) {
  return async (text, params) => {
    if (calls) calls.push({ text, params });
    assert.match(text, /SELECT \* FROM orders WHERE id = \$1/);
    return { rows: row ? [row] : [] };
  };
}

test('POST returns 404 when the order does not exist', async () => {
  const handler = createPaymentHandler({
    execute: fakeExecute(null),
    env: { MP_ACCESS_TOKEN: 'tok', SITE_URL: 'https://example.com' },
    fetchImpl: async () => { throw new Error('should not call Mercado Pago'); }
  });
  const req = mockReq({ method: 'POST', body: { orderId: 404 } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'order_not_found' });
});

test('POST returns not-configured when Mercado Pago token is missing', async () => {
  const handler = createPaymentHandler({
    execute: fakeExecute(orderRow()),
    env: {},
    fetchImpl: async () => { throw new Error('unused'); }
  });
  const req = mockReq({ method: 'POST', body: { orderId: 9 } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { configured: false });
});

test('POST returns the checkout URL when configured', async () => {
  const handler = createPaymentHandler({
    execute: fakeExecute(orderRow()),
    env: { MP_ACCESS_TOKEN: 'tok', SITE_URL: 'https://example.com' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ id: 'pref1', init_point: 'https://mp.example/pref1' }) })
  });
  const req = mockReq({ method: 'POST', body: { orderId: 9 } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.configured, true);
  assert.equal(res.body.initPoint, 'https://mp.example/pref1');
  assert.equal(res.body.preferenceId, 'pref1');
});

test('POST looks the order up by the id from the body', async () => {
  const calls = [];
  const handler = createPaymentHandler({
    execute: fakeExecute(orderRow(), calls),
    env: { MP_ACCESS_TOKEN: 'tok', SITE_URL: 'https://example.com' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ id: 'pref1', init_point: 'https://mp.example/pref1' }) })
  });
  await handler(mockReq({ method: 'POST', body: { orderId: 9 } }), mockRes());
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, [9]);
});

test('POST prices the preference from the stored order, ignoring a forged body total', async () => {
  let sent = null;
  const handler = createPaymentHandler({
    execute: fakeExecute(orderRow()),
    env: { MP_ACCESS_TOKEN: 'tok', SITE_URL: 'https://example.com' },
    fetchImpl: async (url, options) => {
      sent = JSON.parse(options.body);
      return { ok: true, json: async () => ({ id: 'pref1', init_point: 'https://mp.example/pref1' }) };
    }
  });
  // O cliente tenta pagar R$0,01 por um item de R$57,10 — o corpo forjado é ignorado.
  const req = mockReq({
    method: 'POST',
    body: { orderId: 9, total: 0.01, items: [{ name: 'Grátis', qty: 1, price: 0.01 }] }
  });
  await handler(req, mockRes());

  assert.equal(sent.items.length, 2);
  assert.deepEqual(sent.items[0], { title: 'Porta 6', quantity: 2, unit_price: 57.1, currency_id: 'BRL' });
  assert.deepEqual(sent.items[1], { title: 'Outro', quantity: 1, unit_price: 20, currency_id: 'BRL' });
  assert.equal(sent.external_reference, '9');
});

// Regressão do bug clássico Postgres + Node: NUMERIC volta como string. Se o
// handler repassasse os valores crus, o Mercado Pago receberia strings.
test('POST sends real numbers to Mercado Pago even when the driver returns strings', async () => {
  let sent = null;
  const handler = createPaymentHandler({
    // Aqui até os números dentro do JSONB vêm como string, o pior caso.
    execute: fakeExecute(orderRow({
      items: [{ slug: 'porta-6', name: 'Porta 6', price: '57.10', qty: '2', note: '' }]
    })),
    env: { MP_ACCESS_TOKEN: 'tok', SITE_URL: 'https://example.com' },
    fetchImpl: async (url, options) => {
      sent = JSON.parse(options.body);
      return { ok: true, json: async () => ({ id: 'pref1', init_point: 'https://mp.example/pref1' }) };
    }
  });
  await handler(mockReq({ method: 'POST', body: { orderId: 9 } }), mockRes());

  assert.equal(typeof sent.items[0].unit_price, 'number');
  assert.equal(typeof sent.items[0].quantity, 'number');
  assert.equal(sent.items[0].unit_price, 57.1);
  assert.equal(sent.items[0].quantity, 2);
});

test('POST returns 502 when Mercado Pago fails', async () => {
  const handler = createPaymentHandler({
    execute: fakeExecute(orderRow()),
    env: { MP_ACCESS_TOKEN: 'tok', SITE_URL: 'https://example.com' },
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ message: 'invalid token' }) })
  });
  const res = mockRes();
  await handler(mockReq({ method: 'POST', body: { orderId: 9 } }), res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, 'mercado_pago_error');
});

test('POST without orderId returns 400 and never touches the db', async () => {
  let called = false;
  const handler = createPaymentHandler({
    execute: async () => { called = true; return { rows: [] }; },
    env: {},
    fetchImpl: async () => {}
  });
  const res = mockRes();
  await handler(mockReq({ method: 'POST', body: {} }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
});

test('non-POST returns 405', async () => {
  const handler = createPaymentHandler({ execute: async () => ({ rows: [] }), env: {}, fetchImpl: async () => {} });
  const res = mockRes();
  await handler(mockReq({ method: 'GET' }), res);
  assert.equal(res.statusCode, 405);
});
