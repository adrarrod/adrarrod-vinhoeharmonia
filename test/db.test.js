const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../lib/db.js');

function fakeExecute(responses) {
  const calls = [];
  const execute = async (text, params) => {
    calls.push({ text, params });
    return responses.shift() || { rows: [] };
  };
  execute.calls = calls;
  return execute;
}

test('ensureSchema runs the CREATE TABLE statement', async () => {
  const execute = fakeExecute([{ rows: [] }]);
  await db.ensureSchema(execute);
  assert.equal(execute.calls.length, 1);
  assert.match(execute.calls[0].text, /CREATE TABLE IF NOT EXISTS orders/);
});

test('insertOrder inserts all row fields and returns the new id', async () => {
  const row = {
    fullName: 'Maria Silva', birthDate: '1990-01-01', cpf: '11122233344',
    phone: '11987654321', email: 'maria@example.com', deliveryType: 'delivery',
    address: { street: 'Rua A', number: '10', complement: '', cep: '01000-000', neighborhood: 'Centro', city: 'São Paulo', state: 'SP' },
    items: [{ slug: 'porta-6', name: 'Porta 6', price: 57.1, qty: 1 }],
    couponCode: null, subtotal: 57.1, discount: 0, freight: 15, total: 72.1,
    paymentMethod: 'pix'
  };
  const execute = fakeExecute([{ rows: [{ id: 42 }] }]);
  const result = await db.insertOrder(execute, row);
  assert.equal(result.id, 42);
  assert.equal(execute.calls.length, 1);
  assert.match(execute.calls[0].text, /INSERT INTO orders/);
  assert.equal(execute.calls[0].params[0], row.fullName);
  assert.equal(JSON.parse(execute.calls[0].params[9]).length, 1);
});

test('listOrders returns rows most-recent-first via ORDER BY', async () => {
  const execute = fakeExecute([{ rows: [{ id: 2 }, { id: 1 }] }]);
  const orders = await db.listOrders(execute);
  assert.deepEqual(orders, [{ id: 2 }, { id: 1 }]);
  assert.match(execute.calls[0].text, /ORDER BY created_at DESC/);
});

test('updateOrderStatus updates the status column for the given id', async () => {
  const execute = fakeExecute([{ rows: [] }]);
  await db.updateOrderStatus(execute, 42, 'pago');
  assert.match(execute.calls[0].text, /UPDATE orders SET status/);
  assert.deepEqual(execute.calls[0].params, ['pago', 42]);
});
