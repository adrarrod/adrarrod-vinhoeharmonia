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

test('validateOrderPayload rejects any delivery type other than delivery (loja só faz envios)', () => {
  const pickup = validPayload({ delivery: { type: 'pickup', address: null, freightCost: 0 } });
  const { valid, errors } = svc.validateOrderPayload(pickup);
  assert.equal(valid, false);
  assert.ok(errors.includes('deliveryType'));

  const missingAddress = validPayload({ delivery: { type: 'delivery', address: { street: '', number: '', complement: '', cep: '', neighborhood: '', city: '', state: '' }, freightCost: 15 } });
  assert.equal(svc.validateOrderPayload(missingAddress).valid, false);
});

test('validateOrderPayload rejects an empty cart', () => {
  const payload = validPayload({ items: [] });
  const { valid, errors } = svc.validateOrderPayload(payload);
  assert.equal(valid, false);
  assert.ok(errors.includes('items'));
});

// Cada uma dessas quantidades falsificadas distorce o total gravado; nenhuma
// pode chegar a computeTotals/insertOrder.
const BAD_QTIES = [
  ['fracionária (0.5 = 50% de desconto)', 0.5],
  ['ausente', undefined],
  ['não numérica', '2'],
  ['negativa', -1],
  ['acima do limite de 99', 100]
];

for (const [label, qty] of BAD_QTIES) {
  test(`validateOrderPayload rejects an item with qty ${label}`, () => {
    const item = { slug: 'porta-6', name: 'Porta 6', price: 57.1 };
    if (qty !== undefined) item.qty = qty;
    const { valid, errors } = svc.validateOrderPayload(validPayload({ items: [item] }));
    assert.equal(valid, false);
    assert.ok(errors.includes('items'));
  });

  test(`createOrder rejects qty ${label} without touching the db`, async () => {
    let called = false;
    const execute = async () => { called = true; return { rows: [] }; };
    const item = { slug: 'porta-6', name: 'Porta 6', price: 57.1 };
    if (qty !== undefined) item.qty = qty;
    await assert.rejects(() => svc.createOrder({ execute }, validPayload({ items: [item] })), svc.ValidationError);
    assert.equal(called, false);
  });
}

test('validateOrderPayload accepts qty at both ends of the allowed range', () => {
  assert.equal(svc.MAX_QTY_PER_ITEM, 99);
  for (const qty of [1, svc.MAX_QTY_PER_ITEM]) {
    const payload = validPayload({ items: [{ slug: 'porta-6', name: 'Porta 6', price: 57.1, qty }] });
    assert.equal(svc.validateOrderPayload(payload).valid, true);
  }
});

test('validateOrderPayload rejects a negative freight cost', () => {
  const payload = validPayload({
    delivery: { ...validPayload().delivery, freightCost: -50 }
  });
  const { valid, errors } = svc.validateOrderPayload(payload);
  assert.equal(valid, false);
  assert.ok(errors.includes('freightCost'));
});

test('validateOrderPayload rejects a non-numeric or missing freight cost on delivery', () => {
  for (const freightCost of ['15', NaN, null]) {
    const payload = validPayload({ delivery: { ...validPayload().delivery, freightCost } });
    const { valid, errors } = svc.validateOrderPayload(payload);
    assert.equal(valid, false);
    assert.ok(errors.includes('freightCost'));
  }

  const omitted = validPayload();
  delete omitted.delivery.freightCost;
  assert.equal(svc.validateOrderPayload(omitted).valid, false);
});

test('createOrder rejects a negative freight cost without touching the db', async () => {
  let called = false;
  const execute = async () => { called = true; return { rows: [] }; };
  const payload = validPayload({ delivery: { ...validPayload().delivery, freightCost: -50 } });
  await assert.rejects(() => svc.createOrder({ execute }, payload), svc.ValidationError);
  assert.equal(called, false);
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

test('createOrder ensures the schema exists before inserting', async () => {
  const calls = [];
  const execute = async (text, params) => {
    calls.push({ text, params });
    if (text.startsWith('INSERT')) return { rows: [{ id: 7 }] };
    return { rows: [] };
  };
  await svc.createOrder({ execute }, validPayload());
  assert.match(calls[0].text, /CREATE TABLE IF NOT EXISTS orders/);
  assert.ok(calls.findIndex((c) => /CREATE TABLE/.test(c.text)) < calls.findIndex((c) => c.text.startsWith('INSERT')));
});

test('listOrdersForAdmin ensures the schema exists before selecting', async () => {
  const calls = [];
  const execute = async (text, params) => {
    calls.push({ text, params });
    return { rows: [] };
  };
  await svc.listOrdersForAdmin({ execute });
  assert.match(calls[0].text, /CREATE TABLE IF NOT EXISTS orders/);
  assert.match(calls[1].text, /SELECT \* FROM orders/);
});

test('createOrder ignores a forged item price and charges the catalog price', async () => {
  const calls = [];
  const execute = async (text, params) => {
    calls.push({ text, params });
    if (text.startsWith('INSERT')) return { rows: [{ id: 1 }] };
    return { rows: [] };
  };
  // Porta 6 custa R$57,10 no catálogo; o cliente tenta pagar R$0,01.
  const payload = validPayload({
    items: [{ slug: 'porta-6', name: 'Grátis', price: 0.01, qty: 2 }]
  });
  const result = await svc.createOrder({ execute }, payload);
  assert.equal(result.subtotal, 114.2);
  // subtotal (114.20) + frete (15, do validPayload default) = 129.20
  assert.equal(result.total, 129.2);

  const insert = calls.find((c) => c.text.startsWith('INSERT'));
  const storedItems = JSON.parse(insert.params[9]);
  assert.equal(storedItems[0].price, 57.1);
  assert.equal(storedItems[0].name, 'Porta 6');
});

test('createOrder rejects an item whose slug is not in the catalog', async () => {
  let called = false;
  const execute = async () => { called = true; return { rows: [] }; };
  const payload = validPayload({ items: [{ slug: 'vinho-inventado', name: 'X', price: 1, qty: 1 }] });

  const { valid, errors } = svc.validateOrderPayload(payload);
  assert.equal(valid, false);
  assert.ok(errors.includes('items'));

  await assert.rejects(() => svc.createOrder({ execute }, payload), svc.ValidationError);
  assert.equal(called, false);
});

test('createOrder throws ValidationError and never calls execute for an invalid payload', async () => {
  let called = false;
  const execute = async () => { called = true; return { rows: [] }; };
  await assert.rejects(() => svc.createOrder({ execute }, validPayload({ items: [] })), svc.ValidationError);
  assert.equal(called, false);
});

test('createOrder applies free shipping once subtotal crosses R$150', async () => {
  const execute = async (text) => (text.startsWith('INSERT') ? { rows: [{ id: 1 }] } : { rows: [] });
  const payload = validPayload({ items: [{ slug: 'porta-6', name: 'Porta 6', price: 57.1, qty: 3 }] }); // subtotal 171.30
  const result = await svc.createOrder({ execute }, payload);
  assert.equal(result.subtotal, 171.3);
  assert.equal(result.freight, 0);
});

test('listOrdersForAdmin delegates to db.listOrders', async () => {
  const execute = async (text) => {
    if (text.includes('CREATE TABLE')) return { rows: [] };
    assert.match(text, /SELECT \* FROM orders/);
    return { rows: [{ id: 1 }] };
  };
  const orders = await svc.listOrdersForAdmin({ execute });
  assert.deepEqual(orders, [{ id: 1 }]);
});

test('getOrderForPayment delegates to db.getOrderById', async () => {
  const execute = async (text, params) => {
    assert.match(text, /SELECT \* FROM orders WHERE id = \$1/);
    assert.deepEqual(params, [7]);
    return { rows: [{ id: 7, total: '129.20' }] };
  };
  const order = await svc.getOrderForPayment({ execute }, 7);
  assert.deepEqual(order, { id: 7, total: '129.20' });
});

test('getOrderForPayment returns null when the order does not exist', async () => {
  const execute = async () => ({ rows: [] });
  assert.equal(await svc.getOrderForPayment({ execute }, 123), null);
});

test('setOrderStatus delegates to db.updateOrderStatus', async () => {
  const execute = async (text, params) => {
    assert.match(text, /UPDATE orders SET status/);
    assert.deepEqual(params, ['pago', 5]);
    return { rows: [] };
  };
  await svc.setOrderStatus({ execute }, 5, 'pago');
});
