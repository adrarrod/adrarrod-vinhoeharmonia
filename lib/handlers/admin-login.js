// lib/handlers/admin-login.js
const crypto = require('node:crypto');
const auth = require('../auth.js');

// Compara em tempo constante: os digests têm sempre 32 bytes, então nem o
// tamanho nem o conteúdo da senha vazam pelo tempo de resposta.
function matchesPassword(provided, expected) {
  const a = crypto.createHash('sha256').update(String(provided)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function createAdminLoginHandler(deps) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    if (!deps.adminPassword || !deps.sessionSecret) {
      res.status(503).json({ error: 'admin_not_configured' });
      return;
    }
    const { password } = req.body || {};
    if (typeof password !== 'string' || !matchesPassword(password, deps.adminPassword)) {
      res.status(401).json({ error: 'invalid_password' });
      return;
    }
    const token = auth.signSession(deps.adminPassword, deps.sessionSecret);
    res.setHeader('Set-Cookie', auth.buildSessionCookie(token));
    res.status(200).json({ ok: true });
  };
}

module.exports = { createAdminLoginHandler };
