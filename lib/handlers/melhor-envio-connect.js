// lib/handlers/melhor-envio-connect.js
const crypto = require('node:crypto');
const auth = require('../auth.js');
const meAuth = require('../melhor-envio-auth.js');

function createConnectHandler(deps) {
  const randomState = deps.randomState || (() => crypto.randomBytes(16).toString('hex'));

  return async function handler(req, res) {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    const cookies = auth.parseCookies(req.headers.cookie);
    if (!auth.verifySession(cookies[auth.SESSION_COOKIE_NAME], deps.adminPassword, deps.sessionSecret)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const state = randomState();
    const url = meAuth.buildAuthorizationUrl({
      clientId: deps.env.MELHOR_ENVIO_CLIENT_ID,
      redirectUri: deps.env.MELHOR_ENVIO_REDIRECT_URI,
      state
    });
    res.setHeader('Set-Cookie', `me_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
    res.status(302).setHeader('Location', url).end();
  };
}

module.exports = { createConnectHandler };
