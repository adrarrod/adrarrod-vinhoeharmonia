// test/auth.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../lib/auth.js');

const SECRET = 'test-secret';
const PASSWORD = 'senha-correta';

test('signSession then verifySession succeeds with correct password', () => {
  const token = auth.signSession(PASSWORD, SECRET);
  assert.equal(auth.verifySession(token, PASSWORD, SECRET), true);
});

test('verifySession fails with wrong password used to sign', () => {
  const token = auth.signSession('outra-senha', SECRET);
  assert.equal(auth.verifySession(token, PASSWORD, SECRET), false);
});

test('verifySession fails with tampered token', () => {
  const token = auth.signSession(PASSWORD, SECRET);
  const tampered = token.slice(0, -2) + 'zz';
  assert.equal(auth.verifySession(tampered, PASSWORD, SECRET), false);
});

test('verifySession fails on garbage input without throwing', () => {
  assert.equal(auth.verifySession('not-a-token', PASSWORD, SECRET), false);
  assert.equal(auth.verifySession('', PASSWORD, SECRET), false);
  assert.equal(auth.verifySession(undefined, PASSWORD, SECRET), false);
});

test('parseCookies reads a Cookie header into an object', () => {
  const cookies = auth.parseCookies('foo=bar; admin_session=abc123; empty=');
  assert.deepEqual(cookies, { foo: 'bar', admin_session: 'abc123', empty: '' });
});

test('parseCookies handles missing header', () => {
  assert.deepEqual(auth.parseCookies(undefined), {});
});

test('buildSessionCookie sets HttpOnly, SameSite and the token', () => {
  const cookie = auth.buildSessionCookie('sometoken');
  assert.match(cookie, /^admin_session=sometoken;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
});
