// test/handlers-club-wines.test.js — "Vinhos do clube" pela API do painel
// administrativo e pela API da área do assinante.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const auth = require('../lib/auth.js');
const sess = require('../lib/subscriber-session.js');
const { createSubscriberAreaHandler } = require('../lib/handlers/subscriber-area.js');
const { createSubscribersHandler } = require('../lib/handlers/subscribers.js');

const SECRET = 'test-secret';
const PASSWORD = 'admin-pass';
const NOW = Date.parse('2026-10-22T15:00:00Z');

function fakeDb() {
  const subscribers = [
    { id: 1, name: 'Maria Silva', phone: '11987654321', email: 'maria@x.com', password_hash: null, failed_attempts: 0, locked_until: null },
    { id: 2, name: 'João Souza', phone: '1133334444', email: 'joao@x.com', password_hash: null, failed_attempts: 0, locked_until: null }
  ];
  const wines = [];
  return {
    subscribers, wines,
    async ensureSubscribersSchema() {},
    async ensureQuestionnaireSchema() {},
    async ensureClubWinesSchema() {},
    async getSubscriberBy(_e, field, value) {
      return subscribers.find((s) => (field === 'email' ? (s.email || '').toLowerCase() === value : s[field] === value)) || null;
    },
    async recordFailedLogin() { return { failed_attempts: 1, locked_until: null }; },
    async clearLoginFailures() {},
    async getLatestQuestionnaireResponse() { return null; },
    async insertClubWine(_e, subscriberId, slug, month) {
      if (wines.some((w) => w.subscriber_id === subscriberId && w.wine_slug === slug && w.month === month)) return null;
      const row = { id: wines.length + 1, subscriber_id: subscriberId, wine_slug: slug, month, rating: null, rated_at: null };
      wines.push(row);
      return row;
    },
    async listClubWines(_e, subscriberId, upTo) {
      return wines.filter((w) => w.subscriber_id === subscriberId && (upTo === undefined || w.month <= upTo)).reverse();
    },
    async deleteClubWine(_e, subscriberId, id) {
      const i = wines.findIndex((w) => w.id === id && w.subscriber_id === subscriberId);
      if (i === -1) return false;
      wines.splice(i, 1);
      return true;
    },
    async rateClubWine(_e, subscriberId, id, rating, upTo) {
      const w = wines.find((x) => x.id === id && x.subscriber_id === subscriberId && x.month <= upTo);
      if (!w) return null;
      w.rating = rating;
      return w;
    }
  };
}

const base = (db) => ({ execute: async () => ({ rows: [] }), db, sessionSecret: SECRET, now: () => NOW });
const area = (db) => createSubscriberAreaHandler(base(db));
const admin = (db) => createSubscribersHandler({ ...base(db), adminPassword: PASSWORD });
const adminHeaders = () => ({ cookie: `${auth.SESSION_COOKIE_NAME}=${auth.signSession(PASSWORD, SECRET)}` });
const cookieHeader = (token) => ({ cookie: `${sess.COOKIE_NAME}=${token}` });

async function loginAs(handler, login) {
  const res = mockRes();
  await handler(mockReq({ method: 'POST', query: { action: 'login' }, body: { login, password: '123mudar' } }), res);
  return /subscriber_session=([^;]+)/.exec(res.headers['Set-Cookie'])[1];
}

async function adminAdd(db, id, slug, month) {
  const res = mockRes();
  await admin(db)(mockReq({ method: 'POST', query: { action: 'add-wine', id: String(id) }, headers: adminHeaders(), body: { slug, month } }), res);
  return res;
}

// ------------------------------------------------------------------- admin --

test('admin: every club wine route needs the admin session', async () => {
  const db = fakeDb();
  const routes = [
    { method: 'GET', query: { view: 'wines', id: '1' } },
    { method: 'POST', query: { action: 'add-wine', id: '1' }, body: { slug: 'amo-te-tinto', month: '2026-11' } },
    { method: 'POST', query: { action: 'remove-wine', id: '1', wine: '1' } }
  ];
  for (const route of routes) {
    for (const headers of [{}, cookieHeader('lixo')]) {
      const res = mockRes();
      await admin(db)(mockReq({ ...route, headers }), res);
      assert.equal(res.statusCode, 401, JSON.stringify(route));
    }
  }
  assert.equal(db.wines.length, 0);
});

test('admin: POST ?action=add-wine registers the wine for that subscriber and answers 201 with it', async () => {
  const db = fakeDb();
  const res = await adminAdd(db, 1, 'amo-te-tinto', '2026-11');
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.wine.name, 'Amo-te tinto');
  assert.equal(res.body.wine.month, '2026-11');
  assert.deepEqual(db.wines.map((w) => [w.subscriber_id, w.wine_slug, w.month]), [[1, 'amo-te-tinto', '2026-11']]);
});

test('admin: add-wine answers 400 for a wine outside the catalog or a bad month, 409 for a repeat and 404 for an unknown subscriber', async () => {
  const db = fakeDb();
  const bad = await adminAdd(db, 1, 'nao-existe', '2026-13');
  assert.equal(bad.statusCode, 400);
  assert.deepEqual(bad.body.errors.sort(), ['month', 'slug']);

  await adminAdd(db, 1, 'amo-te-tinto', '2026-11');
  const again = await adminAdd(db, 1, 'amo-te-tinto', '2026-11');
  assert.equal(again.statusCode, 409);
  assert.deepEqual(again.body, { error: 'duplicate' });

  assert.equal((await adminAdd(db, 99, 'amo-te-tinto', '2026-11')).statusCode, 404);
  assert.equal(db.wines.length, 1);
});

test('admin: add-wine and remove-wine reject a missing or non-numeric id', async () => {
  const db = fakeDb();
  for (const query of [{ action: 'add-wine' }, { action: 'add-wine', id: 'abc' }, { action: 'add-wine', id: '0' }]) {
    const res = mockRes();
    await admin(db)(mockReq({ method: 'POST', query, headers: adminHeaders(), body: { slug: 'amo-te-tinto', month: '2026-11' } }), res);
    assert.equal(res.statusCode, 400, JSON.stringify(query));
  }
  for (const query of [{ action: 'remove-wine', id: '1' }, { action: 'remove-wine', id: '1', wine: 'x' }, { action: 'remove-wine', wine: '1' }, { action: 'remove-wine', id: '1', wine: '0' }]) {
    const res = mockRes();
    await admin(db)(mockReq({ method: 'POST', query, headers: adminHeaders() }), res);
    assert.equal(res.statusCode, 400, JSON.stringify(query));
  }
  assert.equal(db.wines.length, 0);
});

test('admin: GET ?view=wines&id= lists the subscriber\'s wines with ratings, future months included, and 404s for an unknown subscriber', async () => {
  const db = fakeDb();
  await adminAdd(db, 1, 'amo-te-tinto', '2026-10');
  await adminAdd(db, 1, '3-autores', '2026-12');
  const maria = await loginAs(area(db), 'maria@x.com');
  await area(db)(mockReq({ method: 'POST', query: { action: 'rate' }, headers: cookieHeader(maria), body: { id: 1, rating: 5 } }), mockRes());

  const res = mockRes();
  await admin(db)(mockReq({ method: 'GET', query: { view: 'wines', id: '1' }, headers: adminHeaders() }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.wines.map((w) => [w.name, w.month, w.rating]), [['3 Autores', '2026-12', null], ['Amo-te tinto', '2026-10', 5]]);

  const none = mockRes();
  await admin(db)(mockReq({ method: 'GET', query: { view: 'wines', id: '99' }, headers: adminHeaders() }), none);
  assert.equal(none.statusCode, 404);
  const bad = mockRes();
  await admin(db)(mockReq({ method: 'GET', query: { view: 'wines' }, headers: adminHeaders() }), bad);
  assert.equal(bad.statusCode, 400);
});

test('admin: POST ?action=remove-wine deletes a wine of that subscriber, and 404s when it is not there', async () => {
  const db = fakeDb();
  await adminAdd(db, 1, 'amo-te-tinto', '2026-11');
  const wrongOwner = mockRes();
  await admin(db)(mockReq({ method: 'POST', query: { action: 'remove-wine', id: '2', wine: '1' }, headers: adminHeaders() }), wrongOwner);
  assert.equal(wrongOwner.statusCode, 404);
  assert.equal(db.wines.length, 1);

  const ok = mockRes();
  await admin(db)(mockReq({ method: 'POST', query: { action: 'remove-wine', id: '1', wine: '1' }, headers: adminHeaders() }), ok);
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.body, { removed: true });
  assert.equal(db.wines.length, 0);
});

// -------------------------------------------------------------- assinante --

test('subscriber: GET ?resource=wines lists the wines of the current and past months only, and needs a session', async () => {
  const db = fakeDb();
  await adminAdd(db, 1, 'amo-te-tinto', '2026-09');
  await adminAdd(db, 1, '3-autores', '2026-10');
  await adminAdd(db, 1, 'adega-grande-rose', '2026-11');
  const handler = area(db);
  const token = await loginAs(handler, 'maria@x.com');

  const res = mockRes();
  await handler(mockReq({ method: 'GET', query: { resource: 'wines' }, headers: cookieHeader(token) }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.wines.map((w) => w.slug), ['3-autores', 'amo-te-tinto']);
  assert.ok(!JSON.stringify(res.body).includes('adega-grande-rose'));

  const anon = mockRes();
  await handler(mockReq({ method: 'GET', query: { resource: 'wines' }, headers: {} }), anon);
  assert.equal(anon.statusCode, 401);
});

test('subscriber: the wines of another subscriber never show up', async () => {
  const db = fakeDb();
  await adminAdd(db, 1, 'amo-te-tinto', '2026-10');
  await adminAdd(db, 2, '3-autores', '2026-10');
  const handler = area(db);
  const joao = await loginAs(handler, 'joao@x.com');
  const res = mockRes();
  await handler(mockReq({ method: 'GET', query: { resource: 'wines', id: '1', subscriberId: '1' }, headers: cookieHeader(joao) }), res);
  assert.deepEqual(res.body.wines.map((w) => w.slug), ['3-autores']);
});

test('subscriber: POST ?action=rate saves the stars and answers 200 with the wine', async () => {
  const db = fakeDb();
  await adminAdd(db, 1, 'amo-te-tinto', '2026-10');
  const handler = area(db);
  const token = await loginAs(handler, 'maria@x.com');
  const res = mockRes();
  await handler(mockReq({ method: 'POST', query: { action: 'rate' }, headers: cookieHeader(token), body: { id: 1, rating: 4 } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.wine.rating, 4);
  assert.equal(db.wines[0].rating, 4);

  await handler(mockReq({ method: 'POST', query: { action: 'rate' }, headers: cookieHeader(token), body: { id: 1, rating: 2 } }), res);
  assert.equal(db.wines[0].rating, 2, 'the rating can be changed');
});

test('subscriber: rate answers 401 without a session, 400 for a bad rating, 404 for a wine that is not theirs or not yet delivered', async () => {
  const db = fakeDb();
  await adminAdd(db, 1, 'amo-te-tinto', '2026-10');
  await adminAdd(db, 1, '3-autores', '2026-11');
  await adminAdd(db, 2, 'adega-grande-rose', '2026-10');
  const handler = area(db);
  const maria = await loginAs(handler, 'maria@x.com');

  for (const headers of [{}, cookieHeader('lixo'), adminHeaders()]) {
    const res = mockRes();
    await handler(mockReq({ method: 'POST', query: { action: 'rate' }, headers, body: { id: 1, rating: 5 } }), res);
    assert.equal(res.statusCode, 401);
  }
  for (const rating of [0, 6, 2.5, '5', null, undefined]) {
    const res = mockRes();
    await handler(mockReq({ method: 'POST', query: { action: 'rate' }, headers: cookieHeader(maria), body: { id: 1, rating } }), res);
    assert.equal(res.statusCode, 400, String(rating));
  }
  for (const id of [2, 3, 99, 'abc', null, undefined, 1.5]) {
    const res = mockRes();
    await handler(mockReq({ method: 'POST', query: { action: 'rate' }, headers: cookieHeader(maria), body: { id, rating: 5 } }), res);
    assert.equal(res.statusCode, 404, String(id));
  }
  assert.deepEqual(db.wines.map((w) => w.rating), [null, null, null]);
});
