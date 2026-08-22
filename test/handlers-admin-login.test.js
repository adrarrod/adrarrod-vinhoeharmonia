// test/handlers-admin-login.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const { createAdminLoginHandler } = require('../lib/handlers/admin-login.js');

const deps = { adminPassword: 'senha-correta', sessionSecret: 'secret' };

test('correct password returns 200 and sets the session cookie', async () => {
  const handler = createAdminLoginHandler(deps);
  const req = mockReq({ method: 'POST', body: { password: 'senha-correta' } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Set-Cookie'], /^admin_session=/);
});

test('wrong password returns 401 and sets no cookie', async () => {
  const handler = createAdminLoginHandler(deps);
  const req = mockReq({ method: 'POST', body: { password: 'errada' } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['Set-Cookie'], undefined);
});

test('a password that is a prefix of the real one is still rejected', async () => {
  const handler = createAdminLoginHandler(deps);
  const req = mockReq({ method: 'POST', body: { password: 'senha' } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['Set-Cookie'], undefined);
});

test('a non-string password is rejected instead of throwing', async () => {
  const handler = createAdminLoginHandler(deps);
  const req = mockReq({ method: 'POST', body: { password: { toString: () => 'senha-correta' } } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['Set-Cookie'], undefined);
});

test('missing password/secret env returns 503 instead of an opaque 500', async () => {
  for (const partial of [{}, { adminPassword: 'senha-correta' }, { sessionSecret: 'secret' }]) {
    const handler = createAdminLoginHandler(partial);
    const req = mockReq({ method: 'POST', body: { password: 'senha-correta' } });
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { error: 'admin_not_configured' });
    assert.equal(res.headers['Set-Cookie'], undefined);
  }
});

test('non-POST returns 405', async () => {
  const handler = createAdminLoginHandler(deps);
  const req = mockReq({ method: 'GET' });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 405);
});
