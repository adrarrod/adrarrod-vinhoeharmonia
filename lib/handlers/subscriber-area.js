// lib/handlers/subscriber-area.js — API da área do assinante (um único endereço,
// /api/subscriber-area, para caber no limite de funções da Vercel):
//   GET                    -> quem está logado
//   POST ?action=login     -> entrar (celular ou e-mail + senha)
//   POST ?action=logout    -> sair
//   POST ?action=password  -> trocar a própria senha
const area = require('../subscriber-area-service.js');
const session = require('../subscriber-session.js');

function createSubscriberAreaHandler(deps) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (!deps.sessionSecret) {
      res.status(503).json({ error: 'not_configured' });
      return;
    }

    try {
      if (req.method === 'GET') {
        const subscriber = await area.currentSubscriber(deps, session.tokenFromRequest(req));
        if (subscriber) res.status(200).json({ subscriber });
        else res.status(401).json({ error: 'unauthorized' });
        return;
      }

      if (req.method !== 'POST') {
        res.status(405).json({ error: 'method_not_allowed' });
        return;
      }

      const action = req.query && req.query.action;
      const body = req.body && typeof req.body === 'object' ? req.body : {};

      if (action === 'login') {
        const result = await area.login(deps, { login: body.login, password: body.password });
        if (result.status === 'ok') {
          res.setHeader('Set-Cookie', session.buildCookie(result.token));
          res.status(200).json({ subscriber: result.subscriber });
        } else if (result.status === 'locked') {
          res.status(429).json({ error: 'locked', retryAfterMinutes: result.retryAfterMinutes });
        } else {
          res.status(401).json({ error: 'invalid_credentials' });
        }
        return;
      }

      if (action === 'logout') {
        res.setHeader('Set-Cookie', session.clearCookie());
        res.status(200).json({ ok: true });
        return;
      }

      if (action === 'password') {
        const result = await area.changePassword(deps, session.tokenFromRequest(req), {
          currentPassword: body.currentPassword,
          newPassword: body.newPassword
        });
        if (result.status === 'ok') {
          res.setHeader('Set-Cookie', session.buildCookie(result.token));
          res.status(200).json({ ok: true });
        } else if (result.status === 'unauthorized') {
          res.status(401).json({ error: 'unauthorized' });
        } else if (result.status === 'weak') {
          res.status(400).json({ error: 'weak_password' });
        } else if (result.status === 'locked') {
          res.status(429).json({ error: 'locked', retryAfterMinutes: result.retryAfterMinutes });
        } else {
          res.status(403).json({ error: 'wrong_password' });
        }
        return;
      }

      res.status(400).json({ error: 'unknown_action' });
    } catch (err) {
      console.error('subscriber area handler failed', err);
      res.status(500).json({ error: 'internal_error' });
    }
  };
}

module.exports = { createSubscriberAreaHandler };
