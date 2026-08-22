// test/payment.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPreference, fetchPaymentStatus } = require('../lib/payment.js');

test('createPreference reports not configured when MP_ACCESS_TOKEN is missing', async () => {
  const deps = { env: {}, fetchImpl: async () => { throw new Error('should not be called'); } };
  const result = await createPreference(deps, { id: 1, total: 100, items: [{ name: 'Porta 6', qty: 1, price: 57.1 }] });
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
  const order = { id: 9, total: 129.2, items: [{ name: 'Porta 6', qty: 2, price: 57.1 }] };
  const result = await createPreference(deps, order);
  assert.deepEqual(result, { configured: true, initPoint: 'https://mp.example/checkout/pref123', preferenceId: 'pref123' });
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.items[0].title, 'Porta 6');
  assert.equal(body.external_reference, '9');
});

test('createPreference throws if Mercado Pago responds with an error', async () => {
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok', SITE_URL: 'https://example.com' },
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ message: 'invalid token' }) })
  };
  await assert.rejects(() => createPreference(deps, { id: 1, total: 10, items: [] }));
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
