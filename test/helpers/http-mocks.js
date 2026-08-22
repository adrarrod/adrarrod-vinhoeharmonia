// test/helpers/http-mocks.js
function mockReq({ method = 'GET', body = null, query = {}, headers = {}, cookies = {} } = {}) {
  return { method, body, query, headers, cookies };
}

function mockRes() {
  const res = { statusCode: 200, body: undefined, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  res.setHeader = (key, value) => { res.headers[key] = value; return res; };
  res.end = (payload) => { res.body = payload; return res; };
  return res;
}

module.exports = { mockReq, mockRes };
