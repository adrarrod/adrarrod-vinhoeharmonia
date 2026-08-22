// test/payment.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPreference, fetchPaymentStatus } = require('../lib/payment.js');

test('createPreference reports not configured when MP_ACCESS_TOKEN is missing', async () => {
  const deps = { env: {}, fetchImpl: async () => { throw new Error('should not be called'); } };
  const result = await createPreference(deps, { id: 1, total: 100 });
  assert.deepEqual(result, { configured: false });
});

test('createPreference calls Mercado Pago and returns the checkout URL', async () => {
  const calls = [];
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok', SITE_URL: 'https://example.com' },
    fetchImpl: async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, json: async () => ({ id: 'pref123', init_point: 'https://mp.example/checkout/pref123' }) };
    }
  };
  const order = { id: 9, total: 129.2 };
  const result = await createPreference(deps, order);
  assert.deepEqual(result, { configured: true, initPoint: 'https://mp.example/checkout/pref123', preferenceId: 'pref123' });
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].unit_price, 129.2);
  assert.equal(body.external_reference, '9');
  assert.equal(body.back_urls.success, 'https://example.com/?pedido=9&pagamento=sucesso');
  assert.equal(body.auto_return, 'approved');
});

// Regressão: a preferência já foi montada com uma linha por vinho, e a soma
// dessas linhas é o SUBTOTAL — frete ficava de fora e o desconto de cupom era
// cobrado do cliente. Cobrar order.total num item único elimina a aritmética.
test('createPreference charges order.total, including freight and coupon discount', async () => {
  let sent = null;
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok', SITE_URL: 'https://example.com' },
    fetchImpl: async (url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: 'pref1', init_point: 'https://mp.example/pref1' }) };
    }
  };
  // subtotal 134.20 − desconto 13.42 + frete 15.00 = 135.78
  await createPreference(deps, { id: 42, total: 135.78 });

  assert.equal(sent.items.length, 1);
  assert.equal(sent.items[0].unit_price, 135.78);
  assert.equal(sent.items[0].quantity, 1);
  assert.equal(sent.items[0].currency_id, 'BRL');
  assert.match(sent.items[0].title, /Pedido #42/);
  // O valor cobrado é exatamente o total do pedido — nem o subtotal (134.20),
  // nem subtotal+frete (149.20).
  const charged = sent.items.reduce((acc, item) => acc + item.unit_price * item.quantity, 0);
  assert.equal(charged, 135.78);
});

test('createPreference throws if Mercado Pago responds with an error', async () => {
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok', SITE_URL: 'https://example.com' },
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ message: 'invalid token' }) })
  };
  await assert.rejects(() => createPreference(deps, { id: 1, total: 10 }));
});

// Mercado Pago costuma mandar um array "cause" com o motivo detalhado do erro
// (código + descrição interna), que ficava sendo descartado — sem ele, uma
// falha 403 vira só "unknown" e não dá pra saber o que de fato aconteceu.
test('createPreference includes Mercado Pago\'s cause array in the thrown error', async () => {
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok', SITE_URL: 'https://example.com' },
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        message: 'At least one policy returned UNAUTHORIZED.',
        cause: [{ code: 'PA_UNAUTHORIZED_RESULT_FROM_POLICIES', description: 'the account is blocked' }]
      })
    })
  };
  await assert.rejects(
    () => createPreference(deps, { id: 1, total: 10 }),
    /PA_UNAUTHORIZED_RESULT_FROM_POLICIES.*the account is blocked/
  );
});

test('fetchPaymentStatus returns not-configured when token missing', async () => {
  const deps = { env: {}, fetchImpl: async () => { throw new Error('should not be called'); } };
  const result = await fetchPaymentStatus(deps, 'pay123');
  assert.deepEqual(result, { configured: false });
});

test('fetchPaymentStatus queries Mercado Pago payment status', async () => {
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok' },
    fetchImpl: async (url, opts) => {
      assert.match(url, /\/v1\/payments\/pay123/);
      assert.equal(opts.headers.Authorization, 'Bearer tok');
      return { ok: true, json: async () => ({ status: 'approved', external_reference: '9' }) };
    }
  };
  const result = await fetchPaymentStatus(deps, 'pay123');
  assert.deepEqual(result, { configured: true, status: 'approved', orderId: '9' });
});
