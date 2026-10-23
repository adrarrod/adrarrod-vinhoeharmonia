// test/subscriber-session.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const sess = require('../lib/subscriber-session.js');

const SECRET = 'test-secret';
const NOW = 1_800_000_000_000;

test('a signed token carries the subscriber id and verifies with the same secret and fingerprint', () => {
  const token = sess.signToken(7, SECRET, 'fp1', NOW);
  assert.equal(sess.readTokenId(token), 7);
  assert.equal(sess.verifyToken(token, SECRET, 'fp1', NOW + 1000), true);
});

test('a token is rejected with the wrong secret, a different fingerprint (password changed) or after it expires', () => {
  const token = sess.signToken(7, SECRET, 'fp1', NOW);
  assert.equal(sess.verifyToken(token, 'other-secret', 'fp1', NOW), false);
  assert.equal(sess.verifyToken(token, SECRET, 'fp2', NOW), false);
  assert.equal(sess.verifyToken(token, SECRET, 'fp1', NOW + sess.MAX_AGE_SECONDS * 1000 + 1), false);
});

test('a token for one subscriber cannot be edited to open another one', () => {
  const token = sess.signToken(7, SECRET, 'fp1', NOW);
  const [, exp, sig] = token.split('.');
  assert.equal(sess.verifyToken(`8.${exp}.${sig}`, SECRET, 'fp1', NOW), false);
});

test('garbage, empty and non-string tokens are rejected and never throw', () => {
  for (const bad of [undefined, null, '', 'abc', 'a.b.c', '1.2', '1.2.3.4', 42, '7.9999999999999.zz']) {
    assert.equal(sess.verifyToken(bad, SECRET, 'fp1', NOW), false, String(bad));
    assert.equal(sess.readTokenId(bad), null, String(bad));
  }
});

test('the admin session token can never be used as a subscriber token', () => {
  const auth = require('../lib/auth.js');
  const adminToken = auth.signSession('admin-pass', SECRET);
  assert.equal(sess.verifyToken(adminToken, SECRET, 'fp1', NOW), false);
});

test('cookies: login sets an HttpOnly Secure cookie, logout expires it, and it reads back from a header', () => {
  const set = sess.buildCookie('tok');
  assert.match(set, /^subscriber_session=tok;/);
  assert.match(set, /HttpOnly/);
  assert.match(set, /Secure/);
  assert.match(set, /SameSite=Strict/);
  assert.match(set, /Max-Age=604800/);
  assert.match(sess.clearCookie(), /^subscriber_session=;.*Max-Age=0/);
  assert.equal(sess.tokenFromRequest({ headers: { cookie: 'a=1; subscriber_session=abc; b=2' } }), 'abc');
  assert.equal(sess.tokenFromRequest({ headers: {} }), undefined);
});
