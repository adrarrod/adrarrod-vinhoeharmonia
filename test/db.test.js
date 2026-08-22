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

test('getOrderById selects a single order by id and returns null when absent', async () => {
  const found = fakeExecute([{ rows: [{ id: 42, total: '72.10' }] }]);
  assert.deepEqual(await db.getOrderById(found, 42), { id: 42, total: '72.10' });
  assert.match(found.calls[0].text, /SELECT \* FROM orders WHERE id = \$1/);
  assert.deepEqual(found.calls[0].params, [42]);

  const missing = fakeExecute([{ rows: [] }]);
  assert.equal(await db.getOrderById(missing, 999), null);
});

test('updateOrderStatus updates the status column for the given id', async () => {
  const execute = fakeExecute([{ rows: [] }]);
  await db.updateOrderStatus(execute, 42, 'pago');
  assert.match(execute.calls[0].text, /UPDATE orders SET status/);
  assert.deepEqual(execute.calls[0].params, ['pago', 42]);
});

test('getMelhorEnvioTokens ensures its own schema then selects the single stored row', async () => {
  const execute = fakeExecute([{ rows: [] }, { rows: [{ access_token: 'AT', refresh_token: 'RT', expires_at: '2026-09-01T00:00:00.000Z' }] }]);
  const tokens = await db.getMelhorEnvioTokens(execute);
  assert.match(execute.calls[0].text, /CREATE TABLE IF NOT EXISTS melhor_envio_tokens/);
  assert.match(execute.calls[1].text, /SELECT access_token, refresh_token, expires_at FROM melhor_envio_tokens WHERE id = 1/);
  assert.deepEqual(tokens, { access_token: 'AT', refresh_token: 'RT', expires_at: '2026-09-01T00:00:00.000Z' });
});

test('getMelhorEnvioTokens returns null when nothing has been connected yet', async () => {
  const execute = fakeExecute([{ rows: [] }, { rows: [] }]);
  assert.equal(await db.getMelhorEnvioTokens(execute), null);
});

test('saveMelhorEnvioTokens ensures its own schema then upserts the single row', async () => {
  const execute = fakeExecute([{ rows: [] }, { rows: [] }]);
  await db.saveMelhorEnvioTokens(execute, { accessToken: 'AT', refreshToken: 'RT', expiresAt: '2026-09-01T00:00:00.000Z' });
  assert.match(execute.calls[0].text, /CREATE TABLE IF NOT EXISTS melhor_envio_tokens/);
  assert.match(execute.calls[1].text, /INSERT INTO melhor_envio_tokens/);
  assert.match(execute.calls[1].text, /ON CONFLICT \(id\) DO UPDATE/);
  assert.deepEqual(execute.calls[1].params, ['AT', 'RT', '2026-09-01T00:00:00.000Z']);
});
