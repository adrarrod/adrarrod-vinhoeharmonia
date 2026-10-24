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

// --- assinantes ---

test('ensureSubscribersSchema creates the subscribers table with name and phone required', async () => {
  const execute = fakeExecute([{ rows: [] }, { rows: [] }]);
  await db.ensureSubscribersSchema(execute);
  assert.match(execute.calls[0].text, /CREATE TABLE IF NOT EXISTS subscribers/);
  assert.match(execute.calls[0].text, /name TEXT NOT NULL/);
  assert.match(execute.calls[0].text, /phone TEXT NOT NULL/);
});

test('ensureSubscribersSchema also adds the login columns to a table created before the subscriber area existed', async () => {
  const execute = fakeExecute([{ rows: [] }, { rows: [] }]);
  await db.ensureSubscribersSchema(execute);
  assert.equal(execute.calls.length, 2);
  const alter = execute.calls[1].text;
  assert.match(alter, /ALTER TABLE subscribers/);
  assert.match(alter, /ADD COLUMN IF NOT EXISTS password_hash TEXT\b(?! NOT NULL)/, 'null hash = still on the initial password');
  assert.match(alter, /ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0/);
  assert.match(alter, /ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ/);
});

test('insertSubscriber stores every field as a parameter and returns the new row', async () => {
  const value = {
    name: 'Maria', phone: '11987654321', email: 'm@x.com', street: 'Rua A', complement: 'Ap 4',
    number: '10', neighborhood: 'Centro', city: 'SP', state: 'SP', cep: '01310100'
  };
  const execute = fakeExecute([{ rows: [{ id: 5, name: 'Maria' }] }]);
  const row = await db.insertSubscriber(execute, value);
  assert.deepEqual(row, { id: 5, name: 'Maria' });
  assert.match(execute.calls[0].text, /INSERT INTO subscribers/);
  assert.match(execute.calls[0].text, /RETURNING \*/);
  assert.deepEqual(execute.calls[0].params, ['Maria', '11987654321', 'm@x.com', 'Rua A', 'Ap 4', '10', 'Centro', 'SP', 'SP', '01310100']);
});

test('insertSubscriber passes null for the optional fields left blank', async () => {
  const execute = fakeExecute([{ rows: [{ id: 1 }] }]);
  await db.insertSubscriber(execute, { name: 'A', phone: '1133334444', email: null, street: null, complement: null, number: null, neighborhood: null, city: null, state: null, cep: null });
  assert.deepEqual(execute.calls[0].params, ['A', '1133334444', null, null, null, null, null, null, null, null]);
});

test('listSubscribers returns the newest first', async () => {
  const execute = fakeExecute([{ rows: [{ id: 2 }, { id: 1 }] }]);
  assert.deepEqual(await db.listSubscribers(execute), [{ id: 2 }, { id: 1 }]);
  assert.match(execute.calls[0].text, /ORDER BY created_at DESC, id DESC/);
});

test('deleteSubscriber removes by id and reports whether a row was deleted', async () => {
  const done = fakeExecute([{ rows: [{ id: 3 }] }]);
  assert.equal(await db.deleteSubscriber(done, 3), true);
  assert.match(done.calls[0].text, /DELETE FROM subscribers WHERE id = \$1/);
  assert.deepEqual(done.calls[0].params, [3]);

  const none = fakeExecute([{ rows: [] }]);
  assert.equal(await db.deleteSubscriber(none, 999), false);
});

test('updateSubscriber rewrites every field of that id and returns the updated row, or null when it does not exist', async () => {
  const value = {
    name: 'Maria', phone: '11987654321', email: null, street: 'Rua A', complement: null,
    number: '10', neighborhood: 'Centro', city: 'SP', state: 'SP', cep: '01310100'
  };
  const done = fakeExecute([{ rows: [{ id: 7, name: 'Maria' }] }]);
  assert.deepEqual(await db.updateSubscriber(done, 7, value), { id: 7, name: 'Maria' });
  assert.match(done.calls[0].text, /UPDATE subscribers SET/);
  assert.match(done.calls[0].text, /WHERE id = \$11/);
  assert.match(done.calls[0].text, /RETURNING \*/);
  assert.doesNotMatch(done.calls[0].text, /created_at/);
  assert.deepEqual(done.calls[0].params, ['Maria', '11987654321', null, 'Rua A', null, '10', 'Centro', 'SP', 'SP', '01310100', 7]);

  const none = fakeExecute([{ rows: [] }]);
  assert.equal(await db.updateSubscriber(none, 999, value), null);
});

test('getSubscriberBy finds one subscriber by id, phone or email (email ignoring upper/lower case), or returns null', async () => {
  const byId = fakeExecute([{ rows: [{ id: 4 }] }]);
  assert.deepEqual(await db.getSubscriberBy(byId, 'id', 4), { id: 4 });
  assert.match(byId.calls[0].text, /WHERE id = \$1/);
  assert.deepEqual(byId.calls[0].params, [4]);

  const byPhone = fakeExecute([{ rows: [{ id: 4 }] }]);
  await db.getSubscriberBy(byPhone, 'phone', '11987654321');
  assert.match(byPhone.calls[0].text, /WHERE phone = \$1/);

  const byEmail = fakeExecute([{ rows: [] }]);
  assert.equal(await db.getSubscriberBy(byEmail, 'email', 'Maria@X.com'), null);
  assert.match(byEmail.calls[0].text, /WHERE LOWER\(email\) = \$1/);
  assert.deepEqual(byEmail.calls[0].params, ['maria@x.com']);
});

test('getSubscriberBy refuses any other column, so a field name can never be turned into SQL', async () => {
  await assert.rejects(() => db.getSubscriberBy(fakeExecute([]), 'password_hash; DROP TABLE subscribers', 'x'), /unsupported/);
});

test('findSubscriberConflicts lists other subscribers using the same phone or email, skipping the one being edited', async () => {
  const execute = fakeExecute([{ rows: [{ id: 2, phone: '1133334444', email: null }] }]);
  const rows = await db.findSubscriberConflicts(execute, { phone: '1133334444', email: 'A@x.com', excludeId: 9 });
  assert.deepEqual(rows, [{ id: 2, phone: '1133334444', email: null }]);
  assert.match(execute.calls[0].text, /phone = \$1/);
  assert.match(execute.calls[0].text, /LOWER\(email\) = \$2/);
  assert.match(execute.calls[0].text, /id <> \$3/);
  assert.deepEqual(execute.calls[0].params, ['1133334444', 'a@x.com', 9]);
});

test('findSubscriberConflicts passes null for an email left blank and for a new registration (no id to skip)', async () => {
  const execute = fakeExecute([{ rows: [] }]);
  await db.findSubscriberConflicts(execute, { phone: '1133334444', email: null, excludeId: null });
  assert.deepEqual(execute.calls[0].params, ['1133334444', null, null]);
});

test('recordFailedLogin counts the miss and, at the limit, locks the account and restarts the count', async () => {
  const execute = fakeExecute([{ rows: [{ failed_attempts: 1, locked_until: null }] }]);
  const row = await db.recordFailedLogin(execute, 5, 5, 15);
  assert.deepEqual(row, { failed_attempts: 1, locked_until: null });
  const text = execute.calls[0].text;
  assert.match(text, /UPDATE subscribers/);
  assert.match(text, /failed_attempts \+ 1 >= \$2/);
  assert.match(text, /locked_until = CASE/);
  assert.match(text, /WHERE id = \$1/);
  assert.deepEqual(execute.calls[0].params, [5, 5, 15]);
});

test('clearLoginFailures zeroes the count and removes the lock', async () => {
  const execute = fakeExecute([{ rows: [] }]);
  await db.clearLoginFailures(execute, 5);
  assert.match(execute.calls[0].text, /failed_attempts = 0, locked_until = NULL WHERE id = \$1/);
  assert.deepEqual(execute.calls[0].params, [5]);
});

test('setSubscriberPasswordHash saves the new hash (null = back to the initial password), clears failures and reports whether the subscriber exists', async () => {
  const done = fakeExecute([{ rows: [{ id: 5 }] }]);
  assert.equal(await db.setSubscriberPasswordHash(done, 5, 'scrypt$aa$bb'), true);
  assert.match(done.calls[0].text, /SET password_hash = \$2, failed_attempts = 0, locked_until = NULL/);
  assert.deepEqual(done.calls[0].params, [5, 'scrypt$aa$bb']);

  const reset = fakeExecute([{ rows: [{ id: 5 }] }]);
  await db.setSubscriberPasswordHash(reset, 5, null);
  assert.deepEqual(reset.calls[0].params, [5, null]);

  const none = fakeExecute([{ rows: [] }]);
  assert.equal(await db.setSubscriberPasswordHash(none, 999, null), false);
});

// --- questionario do clube ---

test('ensureQuestionnaireSchema creates the responses table tied to the subscriber (deleted together) and an index', async () => {
  const execute = fakeExecute([{ rows: [] }, { rows: [] }]);
  await db.ensureQuestionnaireSchema(execute);
  const create = execute.calls[0].text;
  assert.match(create, /CREATE TABLE IF NOT EXISTS questionnaire_responses/);
  assert.match(create, /subscriber_id INTEGER NOT NULL REFERENCES subscribers\(id\) ON DELETE CASCADE/);
  assert.match(create, /version TEXT NOT NULL/);
  assert.match(create, /answers JSONB NOT NULL/);
  assert.match(create, /created_at TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
  assert.match(execute.calls[1].text, /CREATE INDEX IF NOT EXISTS .* ON questionnaire_responses \(subscriber_id\)/);
});

test('insertQuestionnaireResponse always adds a new row (history is kept) and sends the answers as JSON', async () => {
  const execute = fakeExecute([{ rows: [{ id: 3, subscriber_id: 7 }] }]);
  const row = await db.insertQuestionnaireResponse(execute, 7, '1.0', { q2: ['Tintos'] });
  assert.deepEqual(row, { id: 3, subscriber_id: 7 });
  assert.match(execute.calls[0].text, /INSERT INTO questionnaire_responses/);
  assert.match(execute.calls[0].text, /\$3::jsonb/);
  assert.match(execute.calls[0].text, /RETURNING \*/);
  assert.doesNotMatch(execute.calls[0].text, /UPDATE|DELETE/);
  assert.deepEqual(execute.calls[0].params, [7, '1.0', '{"q2":["Tintos"]}']);
});

test('getLatestQuestionnaireResponse returns the newest answers of that subscriber, or null', async () => {
  const found = fakeExecute([{ rows: [{ id: 9 }] }]);
  assert.deepEqual(await db.getLatestQuestionnaireResponse(found, 7), { id: 9 });
  assert.match(found.calls[0].text, /WHERE subscriber_id = \$1 ORDER BY id DESC LIMIT 1/);
  assert.deepEqual(found.calls[0].params, [7]);
  assert.equal(await db.getLatestQuestionnaireResponse(fakeExecute([{ rows: [] }]), 7), null);
});

test('listQuestionnaireHistory returns every submission of one subscriber, newest first', async () => {
  const execute = fakeExecute([{ rows: [{ id: 9 }, { id: 4 }] }]);
  assert.deepEqual(await db.listQuestionnaireHistory(execute, 7), [{ id: 9 }, { id: 4 }]);
  assert.match(execute.calls[0].text, /WHERE subscriber_id = \$1 ORDER BY id DESC/);
});

test('listLatestQuestionnaireResponses gives one row per subscriber (the newest) with name, phone, e-mail and submission counts', async () => {
  const execute = fakeExecute([{ rows: [{ subscriber_id: 7, name: 'Maria', submissions: 2 }] }]);
  const rows = await db.listLatestQuestionnaireResponses(execute);
  assert.deepEqual(rows, [{ subscriber_id: 7, name: 'Maria', submissions: 2 }]);
  const text = execute.calls[0].text;
  assert.match(text, /DISTINCT ON \(subscriber_id\)/);
  assert.match(text, /ORDER BY subscriber_id, id DESC/);
  assert.match(text, /JOIN subscribers s ON s\.id = r\.subscriber_id/);
  assert.match(text, /AS submissions/);
  assert.match(text, /AS first_submitted_at/);
});

test('updateSubscriberEmail saves the e-mail of one subscriber and says whether they exist', async () => {
  const done = fakeExecute([{ rows: [{ id: 7 }] }]);
  assert.equal(await db.updateSubscriberEmail(done, 7, 'maria@x.com'), true);
  assert.match(done.calls[0].text, /UPDATE subscribers SET email = \$2 WHERE id = \$1/);
  assert.deepEqual(done.calls[0].params, [7, 'maria@x.com']);
  assert.equal(await db.updateSubscriberEmail(fakeExecute([{ rows: [] }]), 99, 'a@b.co'), false);
});

// --- vinhos do clube ---

test('ensureClubWinesSchema creates the table tied to the subscriber (deleted together), with one row per wine and month and a 1-5 rating', async () => {
  const execute = fakeExecute([{ rows: [] }]);
  await db.ensureClubWinesSchema(execute);
  const sql = execute.calls[0].text;
  assert.match(sql, /CREATE TABLE IF NOT EXISTS club_wines/);
  assert.match(sql, /subscriber_id INTEGER NOT NULL REFERENCES subscribers\(id\) ON DELETE CASCADE/);
  assert.match(sql, /wine_slug TEXT NOT NULL/);
  assert.match(sql, /month TEXT NOT NULL/);
  assert.match(sql, /rating SMALLINT CHECK \(rating BETWEEN 1 AND 5\)/);
  assert.match(sql, /UNIQUE \(subscriber_id, wine_slug, month\)/);
});

test('insertClubWine adds the wine for that subscriber and month, and returns null when it was already registered', async () => {
  const added = fakeExecute([{ rows: [{ id: 4 }] }]);
  assert.deepEqual(await db.insertClubWine(added, 7, 'amo-te-tinto', '2026-11'), { id: 4 });
  assert.match(added.calls[0].text, /INSERT INTO club_wines/);
  assert.match(added.calls[0].text, /ON CONFLICT \(subscriber_id, wine_slug, month\) DO NOTHING/);
  assert.match(added.calls[0].text, /RETURNING \*/);
  assert.deepEqual(added.calls[0].params, [7, 'amo-te-tinto', '2026-11']);
  assert.equal(await db.insertClubWine(fakeExecute([{ rows: [] }]), 7, 'amo-te-tinto', '2026-11'), null);
});

test('listClubWines gives one subscriber\'s wines, newest month first, and can stop at a month (what the subscriber may see)', async () => {
  const all = fakeExecute([{ rows: [{ id: 2 }, { id: 1 }] }]);
  assert.deepEqual(await db.listClubWines(all, 7), [{ id: 2 }, { id: 1 }]);
  assert.match(all.calls[0].text, /WHERE subscriber_id = \$1 ORDER BY month DESC, id DESC/);
  assert.deepEqual(all.calls[0].params, [7]);

  const upTo = fakeExecute([{ rows: [{ id: 1 }] }]);
  await db.listClubWines(upTo, 7, '2026-10');
  assert.match(upTo.calls[0].text, /WHERE subscriber_id = \$1 AND month <= \$2 ORDER BY month DESC, id DESC/);
  assert.deepEqual(upTo.calls[0].params, [7, '2026-10']);
});

test('deleteClubWine removes a wine only if it belongs to that subscriber', async () => {
  const done = fakeExecute([{ rows: [{ id: 5 }] }]);
  assert.equal(await db.deleteClubWine(done, 7, 5), true);
  assert.match(done.calls[0].text, /DELETE FROM club_wines WHERE id = \$1 AND subscriber_id = \$2/);
  assert.deepEqual(done.calls[0].params, [5, 7]);
  assert.equal(await db.deleteClubWine(fakeExecute([{ rows: [] }]), 8, 5), false);
});

test('rateClubWine saves the rating only for the subscriber\'s own wine and only once its month has started', async () => {
  const done = fakeExecute([{ rows: [{ id: 5, rating: 4 }] }]);
  assert.deepEqual(await db.rateClubWine(done, 7, 5, 4, '2026-10'), { id: 5, rating: 4 });
  const sql = done.calls[0].text;
  assert.match(sql, /UPDATE club_wines SET rating = \$3, rated_at = now\(\)/);
  assert.match(sql, /WHERE id = \$1 AND subscriber_id = \$2 AND month <= \$4/);
  assert.match(sql, /RETURNING \*/);
  assert.deepEqual(done.calls[0].params, [5, 7, 4, '2026-10']);
  assert.equal(await db.rateClubWine(fakeExecute([{ rows: [] }]), 7, 5, 4, '2026-10'), null);
});

// --- assinaturas do clube ---

const empties = (n) => Array.from({ length: n }, () => ({ rows: [] }));

test('ensureSubscriptionsSchema adds CPF, birth date and delivery reference to subscribers, with a unique CPF', async () => {
  const execute = fakeExecute(empties(6));
  await db.ensureSubscriptionsSchema(execute);
  assert.equal(execute.calls.length, 6);
  const alter = execute.calls[0].text;
  assert.match(alter, /ALTER TABLE subscribers/);
  assert.match(alter, /ADD COLUMN IF NOT EXISTS cpf TEXT/);
  assert.match(alter, /ADD COLUMN IF NOT EXISTS birth_date DATE/);
  assert.match(alter, /ADD COLUMN IF NOT EXISTS address_reference TEXT/);
  assert.match(execute.calls[1].text, /CREATE UNIQUE INDEX IF NOT EXISTS subscribers_cpf_unique ON subscribers \(cpf\) WHERE cpf IS NOT NULL/);
});

test('ensureSubscriptionsSchema creates subscriptions (one open per subscriber and plan), the status history and the consents', async () => {
  const execute = fakeExecute(empties(6));
  await db.ensureSubscriptionsSchema(execute);
  const subs = execute.calls[2].text;
  assert.match(subs, /CREATE TABLE IF NOT EXISTS subscriptions/);
  assert.match(subs, /subscriber_id INTEGER NOT NULL REFERENCES subscribers\(id\) ON DELETE CASCADE/);
  for (const col of ['plan TEXT NOT NULL', 'price_cents INTEGER NOT NULL', 'status TEXT NOT NULL', 'payment_link TEXT', 'payment_link_sent_at TIMESTAMPTZ', 'requested_at TIMESTAMPTZ NOT NULL DEFAULT now()', 'activated_at TIMESTAMPTZ', 'cancelled_at TIMESTAMPTZ']) {
    assert.ok(subs.includes(col), col);
  }
  assert.match(execute.calls[3].text, /CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_open_per_plan ON subscriptions \(subscriber_id, plan\) WHERE status IN \('awaiting_payment', 'active', 'payment_pending', 'suspended'\)/);
  const events = execute.calls[4].text;
  assert.match(events, /CREATE TABLE IF NOT EXISTS subscription_events/);
  assert.match(events, /subscription_id INTEGER NOT NULL REFERENCES subscriptions\(id\) ON DELETE CASCADE/);
  assert.match(events, /to_status TEXT NOT NULL/);
  assert.match(events, /actor TEXT NOT NULL/);
  const consents = execute.calls[5].text;
  assert.match(consents, /CREATE TABLE IF NOT EXISTS consents/);
  assert.match(consents, /subscriber_id INTEGER NOT NULL REFERENCES subscribers\(id\) ON DELETE CASCADE/);
  assert.match(consents, /version TEXT NOT NULL/);
  assert.match(consents, /accepted BOOLEAN NOT NULL/);
});

test('ensureSubscriptionsSchema only runs once per connection, so the pages do not pay for it on every request', async () => {
  const execute = fakeExecute(empties(12));
  await db.ensureSubscriptionsSchema(execute);
  await db.ensureSubscriptionsSchema(execute);
  assert.equal(execute.calls.length, 6);
  const other = fakeExecute(empties(6));
  await db.ensureSubscriptionsSchema(other);
  assert.equal(other.calls.length, 6, 'another connection runs its own check');
});

test('insertSubscriberWithProfile stores the whole sign-up (address, CPF, birth date, password hash) in one row', async () => {
  const execute = fakeExecute([{ rows: [{ id: 9 }] }]);
  const row = await db.insertSubscriberWithProfile(execute, {
    name: 'Maria Silva', phone: '11987654321', email: 'm@x.com', street: 'Rua A', complement: 'Ap 4', number: '10',
    neighborhood: 'Centro', city: 'São Paulo', state: 'SP', cep: '01310100', reference: 'Portão azul',
    cpf: '52998224725', birthDate: '1990-05-17', passwordHash: 'scrypt$aa$bb'
  });
  assert.deepEqual(row, { id: 9 });
  assert.match(execute.calls[0].text, /INSERT INTO subscribers/);
  assert.match(execute.calls[0].text, /RETURNING \*/);
  assert.deepEqual(execute.calls[0].params, ['Maria Silva', '11987654321', 'm@x.com', 'Rua A', 'Ap 4', '10', 'Centro', 'São Paulo', 'SP', '01310100', 'Portão azul', '52998224725', '1990-05-17', 'scrypt$aa$bb']);
});

test('updateSubscriberProfile fills the delivery address, CPF and birth date of an existing subscriber', async () => {
  const execute = fakeExecute([{ rows: [{ id: 3 }] }]);
  const row = await db.updateSubscriberProfile(execute, 3, {
    street: 'Rua A', complement: null, number: '10', neighborhood: 'Centro', city: 'São Paulo', state: 'SP',
    cep: '01310100', reference: null, cpf: '52998224725', birthDate: '1990-05-17'
  });
  assert.deepEqual(row, { id: 3 });
  const sql = execute.calls[0].text;
  assert.match(sql, /UPDATE subscribers SET/);
  assert.match(sql, /WHERE id = \$1/);
  assert.doesNotMatch(sql, /password_hash|name =|phone =|email =/);
  assert.deepEqual(execute.calls[0].params, [3, 'Rua A', null, '10', 'Centro', 'São Paulo', 'SP', '01310100', null, '52998224725', '1990-05-17']);
  assert.equal(await db.updateSubscriberProfile(fakeExecute([{ rows: [] }]), 99, { street: 'x', complement: null, number: '1', neighborhood: 'x', city: 'x', state: 'SP', cep: '01310100', reference: null, cpf: 'x', birthDate: 'x' }), null);
});

test('findSignupConflicts looks for another subscriber with the same phone, e-mail (any case) or CPF, skipping the one given', async () => {
  const execute = fakeExecute([{ rows: [{ id: 2, phone: '11987654321', email: 'a@x.com', cpf: null }] }]);
  const rows = await db.findSignupConflicts(execute, { phone: '11987654321', email: 'A@x.com', cpf: '52998224725', excludeId: 7 });
  assert.equal(rows.length, 1);
  const sql = execute.calls[0].text;
  assert.match(sql, /phone = \$1/);
  assert.match(sql, /LOWER\(email\) = \$2/);
  assert.match(sql, /cpf = \$3/);
  assert.match(sql, /id <> \$4/);
  assert.deepEqual(execute.calls[0].params, ['11987654321', 'a@x.com', '52998224725', 7]);
  await db.findSignupConflicts(fakeExecute([{ rows: [] }]), { phone: '1', email: null, cpf: null });
});

test('findSignupConflicts passes null for what was not given', async () => {
  const execute = fakeExecute([{ rows: [] }]);
  await db.findSignupConflicts(execute, { phone: '11987654321', email: null, cpf: null });
  assert.deepEqual(execute.calls[0].params, ['11987654321', null, null, null]);
});

test('insertConsents records each acceptance (type, text version, yes/no) in one statement, and does nothing for an empty list', async () => {
  const execute = fakeExecute([{ rows: [] }]);
  await db.insertConsents(execute, 7, [
    { type: 'terms', version: 'v1', accepted: true },
    { type: 'marketing', version: 'v1', accepted: false }
  ]);
  assert.match(execute.calls[0].text, /INSERT INTO consents \(subscriber_id, type, version, accepted\) VALUES \(\$1, \$2, \$3, \$4\), \(\$1, \$5, \$6, \$7\)/);
  assert.deepEqual(execute.calls[0].params, [7, 'terms', 'v1', true, 'marketing', 'v1', false]);
  const none = fakeExecute([]);
  await db.insertConsents(none, 7, []);
  assert.equal(none.calls.length, 0);
});

test('insertSubscription creates the request, active already when the admin says so, and returns null if an open one exists', async () => {
  const execute = fakeExecute([{ rows: [{ id: 4, status: 'awaiting_payment' }] }]);
  const row = await db.insertSubscription(execute, { subscriberId: 7, plan: 'personnalite', priceCents: 12000, status: 'awaiting_payment' });
  assert.deepEqual(row, { id: 4, status: 'awaiting_payment' });
  const sql = execute.calls[0].text;
  assert.match(sql, /INSERT INTO subscriptions/);
  assert.match(sql, /ON CONFLICT DO NOTHING/);
  assert.match(sql, /CASE WHEN \$4::text = 'active' THEN now\(\) END/);
  assert.deepEqual(execute.calls[0].params, [7, 'personnalite', 12000, 'awaiting_payment']);
  assert.equal(await db.insertSubscription(fakeExecute([{ rows: [] }]), { subscriberId: 7, plan: 'personnalite', priceCents: 12000, status: 'awaiting_payment' }), null);
});

test('insertSubscriptionEvent adds a line to the status history', async () => {
  const execute = fakeExecute([{ rows: [] }]);
  await db.insertSubscriptionEvent(execute, { subscriptionId: 4, from: null, to: 'awaiting_payment', actor: 'cliente', note: 'Solicitação feita pelo site' });
  assert.match(execute.calls[0].text, /INSERT INTO subscription_events \(subscription_id, from_status, to_status, actor, note\) VALUES \(\$1, \$2, \$3, \$4, \$5\)/);
  assert.deepEqual(execute.calls[0].params, [4, null, 'awaiting_payment', 'cliente', 'Solicitação feita pelo site']);
});

test('transitionSubscription changes the status only from the expected one, in a single statement that also writes the history', async () => {
  const execute = fakeExecute([{ rows: [{ id: 4, status: 'active' }] }]);
  const row = await db.transitionSubscription(execute, 4, 'awaiting_payment', 'active', 'admin', 'Pix recebido');
  assert.deepEqual(row, { id: 4, status: 'active' });
  const sql = execute.calls[0].text;
  assert.match(sql, /UPDATE subscriptions SET status = \$3/);
  assert.match(sql, /WHERE id = \$1 AND status = \$2/);
  assert.match(sql, /activated_at = CASE WHEN \$3::text = 'active' AND activated_at IS NULL THEN now\(\) ELSE activated_at END/);
  assert.match(sql, /cancelled_at = CASE WHEN \$3::text = 'cancelled' THEN now\(\) ELSE cancelled_at END/);
  assert.match(sql, /INSERT INTO subscription_events/);
  assert.match(sql, /FROM upd/);
  assert.deepEqual(execute.calls[0].params, [4, 'awaiting_payment', 'active', 'admin', 'Pix recebido']);
  assert.equal(await db.transitionSubscription(fakeExecute([{ rows: [] }]), 4, 'awaiting_payment', 'active', 'admin', null), null, 'the status had already changed');
});

test('getSubscription and getLatestSubscription return one subscription, or null', async () => {
  const one = fakeExecute([{ rows: [{ id: 4 }] }]);
  assert.deepEqual(await db.getSubscription(one, 4), { id: 4 });
  assert.match(one.calls[0].text, /FROM subscriptions WHERE id = \$1/);
  const latest = fakeExecute([{ rows: [{ id: 8 }] }]);
  assert.deepEqual(await db.getLatestSubscription(latest, 7), { id: 8 });
  assert.match(latest.calls[0].text, /WHERE subscriber_id = \$1 ORDER BY id DESC LIMIT 1/);
  assert.equal(await db.getLatestSubscription(fakeExecute([{ rows: [] }]), 7), null);
});

test('listSubscriptions returns every request with the subscriber data and whether the questionnaire was answered, newest first', async () => {
  const execute = fakeExecute([{ rows: [{ id: 4, name: 'Maria' }] }]);
  assert.deepEqual(await db.listSubscriptions(execute), [{ id: 4, name: 'Maria' }]);
  const sql = execute.calls[0].text;
  assert.match(sql, /FROM subscriptions s JOIN subscribers sub ON sub\.id = s\.subscriber_id/);
  assert.match(sql, /to_char\(sub\.birth_date, 'YYYY-MM-DD'\) AS birth_date/);
  assert.match(sql, /FROM questionnaire_responses q WHERE q\.subscriber_id = s\.subscriber_id/);
  assert.match(sql, /AS questionnaire_answered/);
  assert.match(sql, /ORDER BY s\.requested_at DESC, s\.id DESC/);
  assert.doesNotMatch(sql, /password_hash/);
});

test('listSubscriptionEvents returns the status history of one subscription, newest first', async () => {
  const execute = fakeExecute([{ rows: [{ id: 2 }, { id: 1 }] }]);
  assert.deepEqual(await db.listSubscriptionEvents(execute, 4), [{ id: 2 }, { id: 1 }]);
  assert.match(execute.calls[0].text, /WHERE subscription_id = \$1 ORDER BY id DESC/);
});

test('setSubscriptionPaymentLink saves the link (and clears the "sent" mark); markPaymentLinkSent records that it was sent', async () => {
  const set = fakeExecute([{ rows: [{ id: 4 }] }]);
  assert.deepEqual(await db.setSubscriptionPaymentLink(set, 4, 'https://mpago.la/x'), { id: 4 });
  assert.match(set.calls[0].text, /SET payment_link = \$2, payment_link_sent_at = NULL/);
  assert.deepEqual(set.calls[0].params, [4, 'https://mpago.la/x']);
  assert.equal(await db.setSubscriptionPaymentLink(fakeExecute([{ rows: [] }]), 99, 'https://mpago.la/x'), null);

  const sent = fakeExecute([{ rows: [{ id: 4 }] }]);
  assert.deepEqual(await db.markPaymentLinkSent(sent, 4), { id: 4 });
  assert.match(sent.calls[0].text, /SET payment_link_sent_at = now\(\)/);
  assert.match(sent.calls[0].text, /WHERE id = \$1 AND payment_link IS NOT NULL/);
  assert.equal(await db.markPaymentLinkSent(fakeExecute([{ rows: [] }]), 4), null);
});

test('countRecentSubscriptions counts the requests made in the last minutes', async () => {
  const execute = fakeExecute([{ rows: [{ total: 7 }] }]);
  assert.equal(await db.countRecentSubscriptions(execute, 60), 7);
  assert.match(execute.calls[0].text, /SELECT COUNT\(\*\)::int AS total FROM subscriptions WHERE requested_at > now\(\) - make_interval\(mins => \$1\)/);
  assert.deepEqual(execute.calls[0].params, [60]);
});
