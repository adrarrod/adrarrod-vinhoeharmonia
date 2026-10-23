// test/subscriber-area-service.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const area = require('../lib/subscriber-area-service.js');
const pw = require('../lib/password.js');
const sess = require('../lib/subscriber-session.js');

const SECRET = 'test-secret';
const NOW = 1_800_000_000_000;

function fakeDb(extra = []) {
  const rows = [
    { id: 1, name: 'Maria Silva', phone: '11987654321', email: 'maria@x.com', password_hash: null, failed_attempts: 0, locked_until: null },
    { id: 2, name: 'João Souza', phone: '1133334444', email: null, password_hash: null, failed_attempts: 0, locked_until: null },
    ...extra
  ];
  const calls = [];
  const byId = (id) => rows.find((r) => r.id === id);
  return {
    rows,
    calls,
    async ensureSubscribersSchema() {},
    async getSubscriberBy(_e, field, value) {
      calls.push(['get', field]);
      const v = field === 'email' ? String(value).toLowerCase() : value;
      return rows.find((r) => (field === 'email' ? (r.email || '').toLowerCase() === v : r[field] === v)) || null;
    },
    async recordFailedLogin(_e, id, max, minutes) {
      calls.push(['fail', id]);
      const r = byId(id);
      if (r.failed_attempts + 1 >= max) { r.failed_attempts = 0; r.locked_until = new Date(NOW + minutes * 60000).toISOString(); }
      else r.failed_attempts += 1;
      return { failed_attempts: r.failed_attempts, locked_until: r.locked_until };
    },
    async clearLoginFailures(_e, id) { calls.push(['clear', id]); const r = byId(id); r.failed_attempts = 0; r.locked_until = null; },
    async setSubscriberPasswordHash(_e, id, hash) { calls.push(['password', id]); const r = byId(id); if (!r) return false; r.password_hash = hash; r.failed_attempts = 0; r.locked_until = null; return true; }
  };
}
const deps = (db, now = NOW) => ({ execute: async () => ({ rows: [] }), db, sessionSecret: SECRET, now: () => now });

test('login works with the phone (any mask) or the e-mail (any capitalisation) and the initial password 123mudar', async () => {
  const db = fakeDb();
  for (const login of ['(11) 98765-4321', '11987654321', 'maria@x.com', ' Maria@X.com ']) {
    const r = await area.login(deps(db), { login, password: '123mudar' });
    assert.equal(r.status, 'ok', login);
    assert.equal(r.subscriber.name, 'Maria Silva');
    assert.equal(sess.readTokenId(r.token), 1);
  }
});

test('the subscriber shape sent to the page has no hash, no counters and says whether the initial password is still in use', async () => {
  const db = fakeDb();
  const r = await area.login(deps(db), { login: '11987654321', password: '123mudar' });
  assert.deepEqual(r.subscriber, { name: 'Maria Silva', phone: '11987654321', email: 'maria@x.com', usingInitialPassword: true });
});

test('a wrong password, an unknown login or a malformed login all give the same neutral "invalid" answer', async () => {
  const db = fakeDb();
  for (const [login, password] of [['11987654321', 'errada'], ['11999999999', '123mudar'], ['ninguem@x.com', '123mudar'], ['abc', '123mudar'], ['', ''], [undefined, undefined], [12345, 123]]) {
    const r = await area.login(deps(db), { login, password });
    assert.deepEqual(r, { status: 'invalid' }, String(login));
  }
});

test('after 5 wrong passwords in a row the account is locked for 15 minutes, even for the right password', async () => {
  const db = fakeDb();
  for (let i = 1; i <= 4; i++) {
    assert.deepEqual(await area.login(deps(db), { login: '11987654321', password: 'errada' }), { status: 'invalid' });
  }
  const fifth = await area.login(deps(db), { login: '11987654321', password: 'errada' });
  assert.deepEqual(fifth, { status: 'locked', retryAfterMinutes: 15 });

  const rightButLocked = await area.login(deps(db, NOW + 5 * 60000), { login: '11987654321', password: '123mudar' });
  assert.deepEqual(rightButLocked, { status: 'locked', retryAfterMinutes: 10 });

  const later = await area.login(deps(db, NOW + 15 * 60000 + 1), { login: '11987654321', password: '123mudar' });
  assert.equal(later.status, 'ok');
});

test('the lock only affects the account that was guessed, not the others', async () => {
  const db = fakeDb();
  for (let i = 0; i < 5; i++) await area.login(deps(db), { login: '11987654321', password: 'errada' });
  const other = await area.login(deps(db), { login: '1133334444', password: '123mudar' });
  assert.equal(other.status, 'ok');
});

test('a successful login clears earlier wrong attempts', async () => {
  const db = fakeDb();
  await area.login(deps(db), { login: '11987654321', password: 'errada' });
  await area.login(deps(db), { login: '11987654321', password: 'errada' });
  assert.equal(db.rows[0].failed_attempts, 2);
  await area.login(deps(db), { login: '11987654321', password: '123mudar' });
  assert.equal(db.rows[0].failed_attempts, 0);
});

test('currentSubscriber returns the logged-in subscriber for a valid token and null for anything else', async () => {
  const db = fakeDb();
  const { token } = await area.login(deps(db), { login: '11987654321', password: '123mudar' });
  const me = await area.currentSubscriber(deps(db), token);
  assert.equal(me.name, 'Maria Silva');
  assert.equal(await area.currentSubscriber(deps(db), undefined), null);
  assert.equal(await area.currentSubscriber(deps(db), 'lixo'), null);
  assert.equal(await area.currentSubscriber(deps(db, NOW + sess.MAX_AGE_SECONDS * 1000 + 1), token), null, 'expired');
  assert.equal(await area.currentSubscriber({ ...deps(db), sessionSecret: 'other' }, token), null, 'wrong secret');
  const forged = token.replace(/^1\./, '2.');
  assert.equal(await area.currentSubscriber(deps(db), forged), null, 'token of another subscriber id');
});

test('changing the password: the new one works, the old one stops, and the page is told it is no longer the initial password', async () => {
  const db = fakeDb();
  const { token } = await area.login(deps(db), { login: '11987654321', password: '123mudar' });
  const r = await area.changePassword(deps(db), token, { currentPassword: '123mudar', newPassword: 'nova-senha-1' });
  assert.equal(r.status, 'ok');
  assert.ok(db.rows[0].password_hash.startsWith('scrypt$'));
  assert.ok(!db.rows[0].password_hash.includes('nova-senha-1'));

  assert.deepEqual(await area.login(deps(db), { login: '11987654321', password: '123mudar' }), { status: 'invalid' });
  const again = await area.login(deps(db), { login: 'maria@x.com', password: 'nova-senha-1' });
  assert.equal(again.status, 'ok');
  assert.equal(again.subscriber.usingInitialPassword, false);
});

test('changing the password ends the other open sessions but gives the current one a fresh token', async () => {
  const db = fakeDb();
  const { token: old } = await area.login(deps(db), { login: '11987654321', password: '123mudar' });
  const r = await area.changePassword(deps(db), old, { currentPassword: '123mudar', newPassword: 'nova-senha-1' });
  assert.equal(await area.currentSubscriber(deps(db), old), null);
  assert.equal((await area.currentSubscriber(deps(db), r.token)).name, 'Maria Silva');
});

test('changePassword refuses a wrong current password (counting it as a failed attempt), a weak new one, and a missing session', async () => {
  const db = fakeDb();
  const { token } = await area.login(deps(db), { login: '11987654321', password: '123mudar' });

  assert.deepEqual(await area.changePassword(deps(db), token, { currentPassword: 'errada', newPassword: 'nova-senha-1' }), { status: 'wrong_password' });
  assert.equal(db.rows[0].failed_attempts, 1);
  assert.equal(db.rows[0].password_hash, null);

  for (const newPassword of ['123', '123mudar', '', undefined]) {
    assert.deepEqual(await area.changePassword(deps(db), token, { currentPassword: '123mudar', newPassword }), { status: 'weak' }, String(newPassword));
  }
  assert.equal(db.rows[0].password_hash, null);

  assert.deepEqual(await area.changePassword(deps(db), undefined, { currentPassword: '123mudar', newPassword: 'nova-senha-1' }), { status: 'unauthorized' });
});

test('guessing the current password through "change password" also locks the account', async () => {
  const db = fakeDb();
  const { token } = await area.login(deps(db), { login: '11987654321', password: '123mudar' });
  let last;
  for (let i = 0; i < 5; i++) last = await area.changePassword(deps(db), token, { currentPassword: 'errada', newPassword: 'nova-senha-1' });
  assert.equal(last.status, 'locked');
  const stillLocked = await area.changePassword(deps(db), token, { currentPassword: '123mudar', newPassword: 'nova-senha-1' });
  assert.equal(stillLocked.status, 'locked');
});

test('after the admin resets the password, old sessions die and 123mudar works again', async () => {
  const db = fakeDb();
  const { token } = await area.login(deps(db), { login: '11987654321', password: '123mudar' });
  const changed = await area.changePassword(deps(db), token, { currentPassword: '123mudar', newPassword: 'nova-senha-1' });
  await db.setSubscriberPasswordHash(null, 1, null);
  assert.equal(await area.currentSubscriber(deps(db), changed.token), null);
  assert.equal((await area.login(deps(db), { login: '11987654321', password: '123mudar' })).status, 'ok');
});

test('a hash from another password never verifies against the fingerprint of the initial one (sanity check on pw)', async () => {
  const h = await pw.hashPassword('abc12345');
  assert.notEqual(pw.fingerprint(h), pw.fingerprint(null));
});
