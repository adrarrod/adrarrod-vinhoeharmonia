// lib/handlers/subscribers.js — API do cadastro de assinantes. Tudo exige a
// sessão do admin: não existe (ainda) nenhuma forma pública de ver ou cadastrar.
const auth = require('../auth.js');
const svc = require('../subscribers-service.js');

function createSubscribersHandler(deps) {
  function isAdmin(req) {
    const cookies = auth.parseCookies(req.headers && req.headers.cookie);
    return auth.verifySession(cookies[auth.SESSION_COOKIE_NAME], deps.adminPassword, deps.sessionSecret);
  }

  return async function handler(req, res) {
    if (!isAdmin(req)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    try {
      if (req.method === 'GET') {
        res.status(200).json({ subscribers: await svc.listSubscribers(deps) });
        return;
      }

      if (req.method === 'POST') {
        try {
          res.status(201).json({ subscriber: await svc.createSubscriber(deps, req.body) });
        } catch (err) {
          if (err instanceof svc.ValidationError) {
            res.status(400).json({ errors: err.errors });
            return;
          }
          throw err;
        }
        return;
      }

      if (req.method === 'DELETE') {
        const raw = req.query && req.query.id;
        const id = /^\d+$/.test(String(raw)) ? Number(raw) : NaN;
        if (!Number.isInteger(id) || id < 1) {
          res.status(400).json({ error: 'id is required' });
          return;
        }
        if (await svc.removeSubscriber(deps, id)) res.status(200).json({ deleted: true });
        else res.status(404).json({ error: 'not_found' });
        return;
      }

      res.status(405).json({ error: 'method_not_allowed' });
    } catch (err) {
      console.error('subscribers handler failed', err);
      res.status(500).json({ error: 'internal_error' });
    }
  };
}

module.exports = { createSubscribersHandler };
