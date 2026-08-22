// lib/handlers/melhor-envio-callback.js
const auth = require('../auth.js');
const meService = require('../melhor-envio-service.js');

function createCallbackHandler(deps) {
  return async function handler(req, res) {
    const cookies = auth.parseCookies(req.headers.cookie);
    const expectedState = cookies['me_oauth_state'];
    const { code, state, error } = req.query || {};

    res.setHeader('Set-Cookie', 'me_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');

    if (error || !code || !state || !expectedState || state !== expectedState) {
      res.status(302).setHeader('Location', '/admin.html?melhor_envio=erro').end();
      return;
    }

    try {
      await meService.saveAuthorizationCode(deps, code);
      res.status(302).setHeader('Location', '/admin.html?melhor_envio=conectado').end();
    } catch (err) {
      console.error('melhor envio oauth callback failed', err);
      res.status(302).setHeader('Location', '/admin.html?melhor_envio=erro').end();
    }
  };
}

module.exports = { createCallbackHandler };
