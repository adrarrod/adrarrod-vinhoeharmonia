// test/freight.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { quoteFreight } = require('../lib/freight.js');

test('falls back to flat-rate rule when Melhor Envio env vars are missing', async () => {
  const deps = { fetchImpl: async () => { throw new Error('should not be called'); }, env: {} };
  const result = await quoteFreight(deps, { cep: '01000-000', subtotal: 100 });
  assert.deepEqual(result, { cost: 15, free: false, source: 'fallback' });
});

test('fallback is free above the R$150 threshold', async () => {
  const deps = { fetchImpl: async () => { throw new Error('should not be called'); }, env: {} };
  const result = await quoteFreight(deps, { cep: '01000-000', subtotal: 200 });
  assert.deepEqual(result, { cost: 0, free: true, source: 'fallback' });
});

test('calls Melhor Envio when configured and returns the cheapest quoted service', async () => {
  const calls = [];
  const deps = {
    env: { MELHOR_ENVIO_TOKEN: 'tok', MELHOR_ENVIO_CEP_ORIGEM: '01000-000' },
    fetchImpl: async (url, opts) => {
      calls.push({ url, opts });
      return {
        ok: true,
        json: async () => ([{ price: '22.50', error: null }, { price: '18.00', error: null }])
      };
    }
  };
  const result = await quoteFreight(deps, { cep: '20000-000', subtotal: 100 });
  assert.equal(result.cost, 18);
  assert.equal(result.free, false);
  assert.equal(result.source, 'melhor-envio');
  assert.match(calls[0].url, /melhorenvio\.com\.br/);
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
});

test('overrides Melhor Envio price with free shipping above R$150', async () => {
  const deps = {
    env: { MELHOR_ENVIO_TOKEN: 'tok', MELHOR_ENVIO_CEP_ORIGEM: '01000-000' },
    fetchImpl: async () => ({ ok: true, json: async () => ([{ price: '22.50', error: null }]) })
  };
  const result = await quoteFreight(deps, { cep: '20000-000', subtotal: 200 });
  assert.deepEqual(result, { cost: 0, free: true, source: 'melhor-envio' });
});

test('falls back gracefully if the Melhor Envio call fails', async () => {
  const deps = {
    env: { MELHOR_ENVIO_TOKEN: 'tok', MELHOR_ENVIO_CEP_ORIGEM: '01000-000' },
    fetchImpl: async () => { throw new Error('network down'); }
  };
  const result = await quoteFreight(deps, { cep: '20000-000', subtotal: 100 });
  assert.deepEqual(result, { cost: 15, free: false, source: 'fallback' });
});
