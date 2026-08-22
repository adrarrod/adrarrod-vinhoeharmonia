// lib/handlers/admin-login.js
const auth = require('../auth.js');

function createAdminLoginHandler(deps) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    const { password } = req.body || {};
    if (password !== deps.adminPassword) {
      res.status(401).json({ error: 'invalid_password' });
      return;
    }
    const token = auth.signSession(deps.adminPassword, deps.sessionSecret);
    res.setHeader('Set-Cookie', auth.buildSessionCookie(token));
    res.status(200).json({ ok: true });
  };
}

module.exports = { createAdminLoginHandler };
