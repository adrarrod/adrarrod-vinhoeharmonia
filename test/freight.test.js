// test/freight.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { quoteFreight } = require('../lib/freight.js');

function fakeDb(accessToken) {
  return {
    async getMelhorEnvioTokens() {
      return accessToken ? { access_token: accessToken, refresh_token: 'RT', expires_at: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString() } : null;
    },
    async saveMelhorEnvioTokens() {}
  };
}

test('falls back to flat-rate rule when Melhor Envio CEP de origem is missing', async () => {
  const deps = { fetchImpl: async () => { throw new Error('should not be called'); }, env: {}, execute: async () => ({ rows: [] }), db: fakeDb('tok') };
  const result = await quoteFreight(deps, { cep: '01000-000', subtotal: 100 });
  assert.deepEqual(result, { cost: 15, free: false, source: 'fallback' });
});

test('fallback is free above the R$150 threshold', async () => {
  const deps = { fetchImpl: async () => { throw new Error('should not be called'); }, env: {}, execute: async () => ({ rows: [] }), db: fakeDb('tok') };
  const result = await quoteFreight(deps, { cep: '01000-000', subtotal: 200 });
  assert.deepEqual(result, { cost: 0, free: true, source: 'fallback' });
});

test('falls back when Melhor Envio has never been connected (no stored token)', async () => {
  const deps = {
    env: { MELHOR_ENVIO_CEP_ORIGEM: '01000-000' },
    fetchImpl: async () => { throw new Error('should not be called'); },
    execute: async () => ({ rows: [] }),
    db: fakeDb(null)
  };
  const result = await quoteFreight(deps, { cep: '20000-000', subtotal: 100 });
  assert.deepEqual(result, { cost: 15, free: false, source: 'fallback' });
});

test('calls Melhor Envio when connected and returns the cheapest quoted service', async () => {
  const calls = [];
  const deps = {
    env: { MELHOR_ENVIO_CEP_ORIGEM: '01000-000' },
    fetchImpl: async (url, opts) => {
      calls.push({ url, opts });
      return {
        ok: true,
        json: async () => ([{ price: '22.50', error: null }, { price: '18.00', error: null }])
      };
    },
    execute: async () => ({ rows: [] }),
    db: fakeDb('tok')
  };
  const result = await quoteFreight(deps, { cep: '20000-000', subtotal: 100 });
  assert.equal(result.cost, 18);
  assert.equal(result.free, false);
  assert.equal(result.source, 'melhor-envio');
  assert.equal(calls[0].url, 'https://melhorenvio.com.br/api/v2/me/shipment/calculate');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
  assert.ok(calls[0].opts.headers['User-Agent']);
});

test('prefers custom_price over price when both are present', async () => {
  const deps = {
    env: { MELHOR_ENVIO_CEP_ORIGEM: '01000-000' },
    fetchImpl: async () => ({ ok: true, json: async () => ([{ price: '99.00', custom_price: '19.90', error: null }]) }),
    execute: async () => ({ rows: [] }),
    db: fakeDb('tok')
  };
  const result = await quoteFreight(deps, { cep: '20000-000', subtotal: 100 });
  assert.equal(result.cost, 19.9);
});

test('overrides Melhor Envio price with free shipping above R$150', async () => {
  const deps = {
    env: { MELHOR_ENVIO_CEP_ORIGEM: '01000-000' },
    fetchImpl: async () => ({ ok: true, json: async () => ([{ price: '22.50', error: null }]) }),
    execute: async () => ({ rows: [] }),
    db: fakeDb('tok')
  };
  const result = await quoteFreight(deps, { cep: '20000-000', subtotal: 200 });
  assert.deepEqual(result, { cost: 0, free: true, source: 'melhor-envio' });
});

test('falls back gracefully if the Melhor Envio call fails', async () => {
  const deps = {
    env: { MELHOR_ENVIO_CEP_ORIGEM: '01000-000' },
    fetchImpl: async () => { throw new Error('network down'); },
    execute: async () => ({ rows: [] }),
    db: fakeDb('tok')
  };
  const result = await quoteFreight(deps, { cep: '20000-000', subtotal: 100 });
  assert.deepEqual(result, { cost: 15, free: false, source: 'fallback' });
});
