// lib/handlers/melhor-envio-status.js
const auth = require('../auth.js');
const meService = require('../melhor-envio-service.js');

function createStatusHandler(deps) {
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
    const connected = await meService.isConnected(deps);
    res.status(200).json({ connected });
  };
}

module.exports = { createStatusHandler };
