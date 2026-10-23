// test/club-wines-service.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../lib/club-wines-service.js');

const NOW = Date.parse('2026-10-22T15:00:00Z'); // outubro de 2026 em São Paulo

function fakeDb() {
  const subscribers = [{ id: 1, name: 'Maria Silva' }, { id: 2, name: 'João Souza' }];
  const wines = [];
  const calls = [];
  return {
    subscribers, wines, calls,
    async ensureSubscribersSchema() { calls.push('ensure-subscribers'); },
    async ensureClubWinesSchema() { calls.push('ensure-club'); },
    async getSubscriberBy(_e, field, value) { return subscribers.find((s) => s[field] === value) || null; },
    async insertClubWine(_e, subscriberId, slug, month) {
      if (wines.some((w) => w.subscriber_id === subscriberId && w.wine_slug === slug && w.month === month)) return null;
      const row = { id: wines.length + 1, subscriber_id: subscriberId, wine_slug: slug, month, rating: null, rated_at: null };
      wines.push(row);
      return row;
    },
    async listClubWines(_e, subscriberId, upTo) {
      return wines.filter((w) => w.subscriber_id === subscriberId && (upTo === undefined || w.month <= upTo))
        .sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : b.id - a.id));
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
      w.rating = rating; w.rated_at = new Date(NOW).toISOString();
      return w;
    }
  };
}
const deps = (db, now = NOW) => ({ execute: async () => ({ rows: [] }), db, now: () => now });
const subscriber = (db, id) => db.subscribers.find((s) => s.id === id);

// ------------------------------------------------------------------- admin --

test('the admin can register a catalog wine for a subscriber and a month, and it comes back with its name', async () => {
  const db = fakeDb();
  const r = await svc.adminAdd(deps(db), 1, { slug: 'amo-te-tinto', month: '2026-11' });
  assert.equal(r.status, 'ok');
  assert.equal(r.wine.slug, 'amo-te-tinto');
  assert.equal(r.wine.name, 'Amo-te tinto');
  assert.equal(r.wine.month, '2026-11');
  assert.equal(r.wine.rating, null);
  assert.equal(db.wines.length, 1);
  assert.ok(db.calls.includes('ensure-subscribers') && db.calls.includes('ensure-club'));
});

test('a wine that is not in the catalog, or a bad month, is refused and nothing is saved', async () => {
  const db = fakeDb();
  for (const [payload, field] of [
    [{ slug: 'vinho-inexistente', month: '2026-11' }, 'slug'],
    [{ slug: '', month: '2026-11' }, 'slug'],
    [{ month: '2026-11' }, 'slug'],
    [{ slug: 'amo-te-tinto', month: '2026-13' }, 'month'],
    [{ slug: 'amo-te-tinto', month: 'novembro' }, 'month'],
    [{ slug: 'amo-te-tinto' }, 'month']
  ]) {
    await assert.rejects(
      () => svc.adminAdd(deps(db), 1, payload),
      (err) => err instanceof svc.ClubWineError && err.errors.includes(field),
      JSON.stringify(payload)
    );
  }
  await assert.rejects(() => svc.adminAdd(deps(db), 1, null), (err) => err instanceof svc.ClubWineError);
  assert.equal(db.wines.length, 0);
});

test('the same wine cannot be registered twice for the same subscriber and month, but may repeat in another month', async () => {
  const db = fakeDb();
  await svc.adminAdd(deps(db), 1, { slug: 'amo-te-tinto', month: '2026-11' });
  assert.deepEqual(await svc.adminAdd(deps(db), 1, { slug: 'amo-te-tinto', month: '2026-11' }), { status: 'duplicate' });
  assert.equal((await svc.adminAdd(deps(db), 1, { slug: 'amo-te-tinto', month: '2026-12' })).status, 'ok');
  assert.equal((await svc.adminAdd(deps(db), 2, { slug: 'amo-te-tinto', month: '2026-11' })).status, 'ok');
});

test('registering for a subscriber that does not exist answers not_found', async () => {
  const db = fakeDb();
  assert.deepEqual(await svc.adminAdd(deps(db), 99, { slug: 'amo-te-tinto', month: '2026-11' }), { status: 'not_found' });
  assert.equal(db.wines.length, 0);
});

test('adminList shows every wine of the subscriber, future months included, newest month first, with the rating', async () => {
  const db = fakeDb();
  await svc.adminAdd(deps(db), 1, { slug: 'amo-te-tinto', month: '2026-09' });
  await svc.adminAdd(deps(db), 1, { slug: '3-autores', month: '2026-12' });
  await svc.adminAdd(deps(db), 2, { slug: '3-autores', month: '2026-10' });
  await svc.rate(deps(db), subscriber(db, 1), 1, 5);
  const list = await svc.adminList(deps(db), 1);
  assert.deepEqual(list.map((w) => [w.month, w.name, w.rating]), [['2026-12', '3 Autores', null], ['2026-09', 'Amo-te tinto', 5]]);
  assert.equal(await svc.adminList(deps(db), 99), null);
});

test('adminRemove deletes a registered wine of that subscriber only', async () => {
  const db = fakeDb();
  await svc.adminAdd(deps(db), 1, { slug: 'amo-te-tinto', month: '2026-11' });
  assert.equal(await svc.adminRemove(deps(db), 2, 1), false, 'another subscriber\'s id does not match');
  assert.equal(db.wines.length, 1);
  assert.equal(await svc.adminRemove(deps(db), 1, 1), true);
  assert.equal(db.wines.length, 0);
  assert.equal(await svc.adminRemove(deps(db), 1, 1), false);
});

// -------------------------------------------------------------- assinante --

test('the subscriber sees the wines of the current and past months, and not the future ones', async () => {
  const db = fakeDb();
  await svc.adminAdd(deps(db), 1, { slug: 'amo-te-tinto', month: '2026-09' });
  await svc.adminAdd(deps(db), 1, { slug: '3-autores', month: '2026-10' });
  await svc.adminAdd(deps(db), 1, { slug: 'adega-grande-rose', month: '2026-11' });

  const list = await svc.listForSubscriber(deps(db), subscriber(db, 1));
  assert.deepEqual(list.map((w) => w.month), ['2026-10', '2026-09']);
  assert.ok(!JSON.stringify(list).includes('adega-grande-rose'), 'the next month stays a surprise');
});

test('a future wine shows up on the first day of its month, by São Paulo time', async () => {
  const db = fakeDb();
  await svc.adminAdd(deps(db), 1, { slug: 'adega-grande-rose', month: '2026-11' });
  const lateOctober = Date.parse('2026-11-01T01:30:00Z'); // 22:30 de 31/10 em São Paulo
  assert.equal((await svc.listForSubscriber(deps(db, lateOctober), subscriber(db, 1))).length, 0);
  const firstDay = Date.parse('2026-11-01T03:00:00Z');
  assert.equal((await svc.listForSubscriber(deps(db, firstDay), subscriber(db, 1))).length, 1);
});

test('the subscriber only ever gets their own wines', async () => {
  const db = fakeDb();
  await svc.adminAdd(deps(db), 1, { slug: 'amo-te-tinto', month: '2026-10' });
  await svc.adminAdd(deps(db), 2, { slug: '3-autores', month: '2026-10' });
  assert.deepEqual((await svc.listForSubscriber(deps(db), subscriber(db, 2))).map((w) => w.slug), ['3-autores']);
});

test('the subscriber can rate a received wine from 1 to 5 stars, and change the rating later', async () => {
  const db = fakeDb();
  await svc.adminAdd(deps(db), 1, { slug: 'amo-te-tinto', month: '2026-10' });
  const first = await svc.rate(deps(db), subscriber(db, 1), 1, 4);
  assert.equal(first.status, 'ok');
  assert.equal(first.wine.rating, 4);
  assert.equal((await svc.rate(deps(db), subscriber(db, 1), 1, 2)).wine.rating, 2);
  assert.equal(db.wines[0].rating, 2);
});

test('only whole numbers from 1 to 5 are accepted as a rating, and nothing is changed otherwise', async () => {
  const db = fakeDb();
  await svc.adminAdd(deps(db), 1, { slug: 'amo-te-tinto', month: '2026-10' });
  for (const bad of [0, 6, -3, 2.5, '5', null, undefined, NaN]) {
    assert.deepEqual(await svc.rate(deps(db), subscriber(db, 1), 1, bad), { status: 'invalid' }, String(bad));
  }
  assert.equal(db.wines[0].rating, null);
});

test('a subscriber cannot rate another subscriber\'s wine, a wine of a month that has not started, or one that does not exist', async () => {
  const db = fakeDb();
  await svc.adminAdd(deps(db), 1, { slug: 'amo-te-tinto', month: '2026-10' });
  await svc.adminAdd(deps(db), 1, { slug: '3-autores', month: '2026-11' });
  assert.deepEqual(await svc.rate(deps(db), subscriber(db, 2), 1, 5), { status: 'not_found' }, 'someone else\'s wine');
  assert.deepEqual(await svc.rate(deps(db), subscriber(db, 1), 2, 5), { status: 'not_found' }, 'future month');
  assert.deepEqual(await svc.rate(deps(db), subscriber(db, 1), 99, 5), { status: 'not_found' });
  assert.deepEqual(db.wines.map((w) => w.rating), [null, null]);
});
