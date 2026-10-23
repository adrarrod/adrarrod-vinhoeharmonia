// test/handlers-subscribers.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const auth = require('../lib/auth.js');
const { createSubscribersHandler } = require('../lib/handlers/subscribers.js');

const PASSWORD = 'admin-pass';
const SECRET = 'test-secret';

function adminHeaders() {
  return { cookie: `${auth.SESSION_COOKIE_NAME}=${auth.signSession(PASSWORD, SECRET)}` };
}

function fakeDb() {
  const calls = [];
  const rows = [];
  return {
    calls,
    rows,
    async ensureSubscribersSchema() {},
    async insertSubscriber(_e, value) {
      calls.push(['insert', value]);
      const row = { id: rows.length + 1, created_at: '2026-10-22T10:00:00.000Z', name: value.name, phone: value.phone, email: value.email, address_street: value.street, address_complement: value.complement, address_number: value.number, address_neighborhood: value.neighborhood, address_city: value.city, address_state: value.state, address_cep: value.cep };
      rows.push(row);
      return row;
    },
    async listSubscribers() { calls.push(['list']); return [...rows].reverse(); },
    async updateSubscriber(_e, id, value) {
      calls.push(['update', id, value]);
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      Object.assign(row, { name: value.name, phone: value.phone, email: value.email, address_street: value.street, address_complement: value.complement, address_number: value.number, address_neighborhood: value.neighborhood, address_city: value.city, address_state: value.state, address_cep: value.cep });
      return row;
    },
    async deleteSubscriber(_e, id) { calls.push(['delete', id]); const i = rows.findIndex((r) => r.id === id); if (i === -1) return false; rows.splice(i, 1); return true; }
  };
}
const make = (db) => createSubscribersHandler({ execute: async () => ({ rows: [] }), db, adminPassword: PASSWORD, sessionSecret: SECRET });

test('every method needs an admin session: nobody else can read, add or delete subscribers', async () => {
  const db = fakeDb();
  const handler = make(db);
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    const res = mockRes();
    await handler(mockReq({ method, headers: {}, body: { name: 'A', phone: '1133334444' }, query: { id: '1' } }), res);
    assert.equal(res.statusCode, 401, method);
  }
  const wrong = mockRes();
  await handler(mockReq({ method: 'GET', headers: { cookie: `${auth.SESSION_COOKIE_NAME}=deadbeef` } }), wrong);
  assert.equal(wrong.statusCode, 401);
  assert.equal(db.calls.length, 0);
});

test('POST creates a subscriber and answers 201 with it', async () => {
  const db = fakeDb();
  const res = mockRes();
  await make(db)(mockReq({ method: 'POST', headers: adminHeaders(), body: { name: 'Maria', phone: '(11) 98765-4321', cep: '01310-100', state: 'sp' } }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.subscriber.id, 1);
  assert.equal(res.body.subscriber.phone, '11987654321');
  assert.equal(res.body.subscriber.cep, '01310100');
  assert.equal(res.body.subscriber.state, 'SP');
  assert.equal(res.body.subscriber.email, null);
});

test('POST with an invalid form answers 400 with the bad fields and stores nothing', async () => {
  const db = fakeDb();
  const res = mockRes();
  await make(db)(mockReq({ method: 'POST', headers: adminHeaders(), body: { name: '', phone: '12', email: 'x' } }), res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body.errors.sort(), ['email', 'name', 'phone']);
  assert.equal(db.calls.length, 0);
});

test('GET lists the subscribers, newest first', async () => {
  const db = fakeDb();
  const handler = make(db);
  for (const name of ['Primeira', 'Segunda']) {
    await handler(mockReq({ method: 'POST', headers: adminHeaders(), body: { name, phone: '1133334444' } }), mockRes());
  }
  const res = mockRes();
  await handler(mockReq({ method: 'GET', headers: adminHeaders() }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.subscribers.map((s) => s.name), ['Segunda', 'Primeira']);
});

test('DELETE removes the subscriber with that id, and 404s when it does not exist', async () => {
  const db = fakeDb();
  const handler = make(db);
  await handler(mockReq({ method: 'POST', headers: adminHeaders(), body: { name: 'A', phone: '1133334444' } }), mockRes());

  const ok = mockRes();
  await handler(mockReq({ method: 'DELETE', headers: adminHeaders(), query: { id: '1' } }), ok);
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.body, { deleted: true });

  const again = mockRes();
  await handler(mockReq({ method: 'DELETE', headers: adminHeaders(), query: { id: '1' } }), again);
  assert.equal(again.statusCode, 404);
});

test('DELETE rejects a missing or non-numeric id without touching the database', async () => {
  const db = fakeDb();
  const handler = make(db);
  for (const query of [{}, { id: 'abc' }, { id: '-1' }, { id: '1.5' }, { id: '0' }]) {
    const res = mockRes();
    await handler(mockReq({ method: 'DELETE', headers: adminHeaders(), query }), res);
    assert.equal(res.statusCode, 400, JSON.stringify(query));
  }
  assert.equal(db.calls.length, 0);
});

test('other methods answer 405, and a database failure answers 500 instead of crashing', async () => {
  const handler = make(fakeDb());
  const res = mockRes();
  await handler(mockReq({ method: 'PATCH', headers: adminHeaders() }), res);
  assert.equal(res.statusCode, 405);

  const broken = fakeDb();
  broken.listSubscribers = async () => { throw new Error('down'); };
  const res2 = mockRes();
  await make(broken)(mockReq({ method: 'GET', headers: adminHeaders() }), res2);
  assert.equal(res2.statusCode, 500);
});

test('PUT updates the subscriber with that id and answers 200 with it', async () => {
  const db = fakeDb();
  const handler = make(db);
  await handler(mockReq({ method: 'POST', headers: adminHeaders(), body: { name: 'Maria', phone: '1133334444', city: 'SP' } }), mockRes());

  const res = mockRes();
  await handler(mockReq({ method: 'PUT', headers: adminHeaders(), query: { id: '1' }, body: { name: 'Maria Souza', phone: '(11) 98765-4321', city: '' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.subscriber.id, 1);
  assert.equal(res.body.subscriber.name, 'Maria Souza');
  assert.equal(res.body.subscriber.phone, '11987654321');
  assert.equal(res.body.subscriber.city, null);
});

test('PUT with an invalid form answers 400 with the bad fields and changes nothing', async () => {
  const db = fakeDb();
  const handler = make(db);
  await handler(mockReq({ method: 'POST', headers: adminHeaders(), body: { name: 'Maria', phone: '1133334444' } }), mockRes());
  db.calls.length = 0;

  const res = mockRes();
  await handler(mockReq({ method: 'PUT', headers: adminHeaders(), query: { id: '1' }, body: { name: '', phone: '1', cep: '12' } }), res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body.errors.sort(), ['cep', 'name', 'phone']);
  assert.equal(db.calls.length, 0);
});

test('PUT answers 404 for an id that does not exist and 400 for a missing or non-numeric id', async () => {
  const db = fakeDb();
  const handler = make(db);
  const missing = mockRes();
  await handler(mockReq({ method: 'PUT', headers: adminHeaders(), query: { id: '42' }, body: { name: 'A', phone: '1133334444' } }), missing);
  assert.equal(missing.statusCode, 404);

  db.calls.length = 0;
  for (const query of [{}, { id: 'abc' }, { id: '0' }, { id: '1.5' }]) {
    const res = mockRes();
    await handler(mockReq({ method: 'PUT', headers: adminHeaders(), query, body: { name: 'A', phone: '1133334444' } }), res);
    assert.equal(res.statusCode, 400, JSON.stringify(query));
  }
  assert.equal(db.calls.length, 0);
});
