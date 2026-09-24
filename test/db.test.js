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

// --- estoque ---

test('ensureStockSchema creates the table, then seeds only slugs that are still missing', async () => {
  const execute = fakeExecute([{ rows: [] }, { rows: [] }]);
  await db.ensureStockSchema(execute, [{ slug: 'a', quantity: 1 }, { slug: 'b', quantity: 3 }]);
  assert.match(execute.calls[0].text, /CREATE TABLE IF NOT EXISTS stock/);
  assert.match(execute.calls[0].text, /CHECK \(quantity >= 0\)/);
  assert.match(execute.calls[1].text, /INSERT INTO stock \(slug, quantity\) VALUES \(\$1, \$2\), \(\$3, \$4\)/);
  assert.match(execute.calls[1].text, /ON CONFLICT \(slug\) DO NOTHING/);
  assert.deepEqual(execute.calls[1].params, ['a', 1, 'b', 3]);
});

test('ensureStockSchema skips the seed insert when there is nothing to seed', async () => {
  const execute = fakeExecute([{ rows: [] }]);
  await db.ensureStockSchema(execute, []);
  assert.equal(execute.calls.length, 1);
});

test('getStock returns a slug -> quantity map', async () => {
  const execute = fakeExecute([{ rows: [{ slug: 'a', quantity: 2 }, { slug: 'b', quantity: 0 }] }]);
  assert.deepEqual(await db.getStock(execute), { a: 2, b: 0 });
  assert.match(execute.calls[0].text, /SELECT slug, quantity FROM stock/);
});

test('reserveStock decrements atomically and only when enough stock is left', async () => {
  const ok = fakeExecute([{ rows: [{ quantity: 0 }] }]);
  assert.equal(await db.reserveStock(ok, 'a', 1), true);
  assert.match(ok.calls[0].text, /UPDATE stock SET quantity = quantity - \$2 WHERE slug = \$1 AND quantity >= \$2/);
  assert.deepEqual(ok.calls[0].params, ['a', 1]);

  const notEnough = fakeExecute([{ rows: [] }]);
  assert.equal(await db.reserveStock(notEnough, 'a', 5), false);
});

test('releaseStock adds the quantity back', async () => {
  const execute = fakeExecute([{ rows: [] }]);
  await db.releaseStock(execute, 'a', 2);
  assert.match(execute.calls[0].text, /UPDATE stock SET quantity = quantity \+ \$2 WHERE slug = \$1/);
  assert.deepEqual(execute.calls[0].params, ['a', 2]);
});

test('setStock upserts an absolute quantity', async () => {
  const execute = fakeExecute([{ rows: [] }]);
  await db.setStock(execute, 'a', 7);
  assert.match(execute.calls[0].text, /INSERT INTO stock \(slug, quantity\) VALUES \(\$1, \$2\) ON CONFLICT \(slug\) DO UPDATE SET quantity = \$2/);
  assert.deepEqual(execute.calls[0].params, ['a', 7]);
});

test('cancelOrder marks the order cancelled once and returns its items; null if already cancelled or unknown', async () => {
  const items = [{ slug: 'a', qty: 2 }];
  const first = fakeExecute([{ rows: [{ items }] }]);
  assert.deepEqual(await db.cancelOrder(first, 4), items);
  assert.match(first.calls[0].text, /UPDATE orders SET status = 'cancelado' WHERE id = \$1 AND status <> 'cancelado' RETURNING items/);
  assert.deepEqual(first.calls[0].params, [4]);

  const again = fakeExecute([{ rows: [] }]);
  assert.equal(await db.cancelOrder(again, 4), null);
});
