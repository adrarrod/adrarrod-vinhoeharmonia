// test/orders-service.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../lib/orders-service.js');

function validPayload(overrides = {}) {
  return {
    customer: { fullName: 'Maria Silva', birthDate: '1990-05-20', cpf: '111.222.333-44', phone: '11987654321', email: 'maria@example.com' },
    delivery: { type: 'delivery', address: { street: 'Rua A', number: '10', complement: '', cep: '01000-000', neighborhood: 'Centro', city: 'São Paulo', state: 'SP' }, freightCost: 15 },
    items: [{ slug: 'porta-6', name: 'Porta 6', price: 57.1, qty: 2 }],
    couponCode: null,
    paymentMethod: 'pix',
    ...overrides
  };
}

test('isAdult is true at exactly 18 and false the day before', () => {
  assert.equal(svc.isAdult('2008-08-22', new Date('2026-08-22')), true);
  assert.equal(svc.isAdult('2008-08-23', new Date('2026-08-22')), false);
});

test('validateOrderPayload accepts a well-formed payload', () => {
  const { valid, errors } = svc.validateOrderPayload(validPayload());
  assert.equal(valid, true);
  assert.deepEqual(errors, []);
});

test('validateOrderPayload rejects missing required customer fields', () => {
  const payload = validPayload({ customer: { fullName: '', birthDate: '1990-05-20', cpf: '', phone: '11987654321', email: 'maria@example.com' } });
  const { valid, errors } = svc.validateOrderPayload(payload);
  assert.equal(valid, false);
  assert.ok(errors.includes('fullName'));
  assert.ok(errors.includes('cpf'));
});

test('validateOrderPayload rejects underage birth dates', () => {
  const payload = validPayload({ customer: { ...validPayload().customer, birthDate: '2015-01-01' } });
  const { valid, errors } = svc.validateOrderPayload(payload);
  assert.equal(valid, false);
  assert.ok(errors.includes('birthDate'));
});

test('validateOrderPayload requires address fields only when delivery type is delivery', () => {
  const pickup = validPayload({ delivery: { type: 'pickup', address: null, freightCost: 0 } });
  assert.equal(svc.validateOrderPayload(pickup).valid, true);

  const missingAddress = validPayload({ delivery: { type: 'delivery', address: { street: '', number: '', complement: '', cep: '', neighborhood: '', city: '', state: '' }, freightCost: 15 } });
  assert.equal(svc.validateOrderPayload(missingAddress).valid, false);
});

test('validateOrderPayload rejects an empty cart', () => {
  const payload = validPayload({ items: [] });
  const { valid, errors } = svc.validateOrderPayload(payload);
  assert.equal(valid, false);
  assert.ok(errors.includes('items'));
});

test('createOrder validates, computes totals, persists via deps.execute, returns totals + id', async () => {
  const calls = [];
  const execute = async (text, params) => {
    calls.push({ text, params });
    if (text.startsWith('INSERT')) return { rows: [{ id: 7 }] };
    return { rows: [] };
  };
  const result = await svc.createOrder({ execute }, validPayload());
  assert.equal(result.id, 7);
  assert.equal(result.subtotal, 114.2);
  assert.equal(result.freight, 15);
  assert.equal(result.total, 129.2);
  assert.ok(calls.some((c) => c.text.startsWith('INSERT')));
});

test('createOrder throws ValidationError and never calls execute for an invalid payload', async () => {
  let called = false;
  const execute = async () => { called = true; return { rows: [] }; };
  await assert.rejects(() => svc.createOrder({ execute }, validPayload({ items: [] })), svc.ValidationError);
  assert.equal(called, false);
});

test('createOrder applies free shipping once subtotal crosses R$150', async () => {
  const execute = async (text) => (text.startsWith('INSERT') ? { rows: [{ id: 1 }] } : { rows: [] });
  const payload = validPayload({ items: [{ slug: 'porta-6', name: 'Porta 6', price: 80, qty: 2 }] }); // subtotal 160
  const result = await svc.createOrder({ execute }, payload);
  assert.equal(result.freight, 0);
});

test('listOrdersForAdmin delegates to db.listOrders', async () => {
  const execute = async (text) => {
    assert.match(text, /SELECT \* FROM orders/);
    return { rows: [{ id: 1 }] };
  };
  const orders = await svc.listOrdersForAdmin({ execute });
  assert.deepEqual(orders, [{ id: 1 }]);
});

test('setOrderStatus delegates to db.updateOrderStatus', async () => {
  const execute = async (text, params) => {
    assert.match(text, /UPDATE orders SET status/);
    assert.deepEqual(params, ['pago', 5]);
    return { rows: [] };
  };
  await svc.setOrderStatus({ execute }, 5, 'pago');
});
