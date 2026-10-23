// test/password.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const pw = require('../lib/password.js');

test('the initial password every subscriber starts with is 123mudar', () => {
  assert.equal(pw.DEFAULT_PASSWORD, '123mudar');
});

test('a hashed password is never the plain text, and the same password hashes differently each time (salt)', async () => {
  const a = await pw.hashPassword('segredo123');
  const b = await pw.hashPassword('segredo123');
  assert.ok(!a.includes('segredo123'));
  assert.notEqual(a, b);
  assert.match(a, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
});

test('verifyPassword accepts the right password and rejects any other', async () => {
  const stored = await pw.hashPassword('segredo123');
  assert.equal(await pw.verifyPassword('segredo123', stored), true);
  assert.equal(await pw.verifyPassword('segredo124', stored), false);
  assert.equal(await pw.verifyPassword('', stored), false);
});

test('no stored hash means the subscriber is still on the initial password', async () => {
  assert.equal(await pw.verifyPassword('123mudar', null), true);
  assert.equal(await pw.verifyPassword('outra', null), false);
});

test('verifyPassword is false (never throws) for non-string input or a corrupted stored value', async () => {
  const stored = await pw.hashPassword('segredo123');
  assert.equal(await pw.verifyPassword(undefined, stored), false);
  assert.equal(await pw.verifyPassword(123, null), false);
  assert.equal(await pw.verifyPassword('segredo123', 'lixo'), false);
  assert.equal(await pw.verifyPassword('segredo123', 'scrypt$zz$zz'), false);
});

test('a new password needs 6 to 100 characters and cannot be the initial one', () => {
  assert.equal(pw.validateNewPassword('abc123'), true);
  assert.equal(pw.validateNewPassword('12345'), false, 'too short');
  assert.equal(pw.validateNewPassword('x'.repeat(101)), false, 'too long');
  assert.equal(pw.validateNewPassword('123mudar'), false, 'the initial password is not a new password');
  assert.equal(pw.validateNewPassword(''), false);
  assert.equal(pw.validateNewPassword(undefined), false);
  assert.equal(pw.validateNewPassword(123456), false);
});

test('fingerprint changes whenever the password changes, including a reset back to the initial one', async () => {
  const h1 = await pw.hashPassword('segredo123');
  const h2 = await pw.hashPassword('segredo123');
  assert.notEqual(pw.fingerprint(h1), pw.fingerprint(h2));
  assert.notEqual(pw.fingerprint(h1), pw.fingerprint(null));
  assert.equal(pw.fingerprint(null), pw.fingerprint(null));
});
