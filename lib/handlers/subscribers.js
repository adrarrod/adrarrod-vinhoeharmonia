// lib/handlers/subscribers.js — API do cadastro de assinantes. Tudo exige a
// sessão do admin: não existe (ainda) nenhuma forma pública de ver ou cadastrar.
const auth = require('../auth.js');
const svc = require('../subscribers-service.js');

function createSubscribersHandler(deps) {
  function isAdmin(req) {
    const cookies = auth.parseCookies(req.headers && req.headers.cookie);
    return auth.verifySession(cookies[auth.SESSION_COOKIE_NAME], deps.adminPassword, deps.sessionSecret);
  }

  // ?id=... como número inteiro positivo, ou NaN.
  function idOf(req) {
    const raw = req.query && req.query.id;
    return /^\d+$/.test(String(raw)) ? Number(raw) : NaN;
  }

  // Erro de validação (400) ou de duplicidade (409) vira resposta; qualquer outro sobe.
  function answerKnownError(err, res) {
    if (err instanceof svc.ValidationError) { res.status(400).json({ errors: err.errors }); return true; }
    if (err instanceof svc.DuplicateError) { res.status(409).json({ error: 'duplicate', field: err.field }); return true; }
    return false;
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

      if (req.method === 'POST' && req.query && req.query.action === 'reset-password') {
        const id = idOf(req);
        if (!Number.isInteger(id) || id < 1) {
          res.status(400).json({ error: 'id is required' });
          return;
        }
        if (await svc.resetSubscriberPassword(deps, id)) res.status(200).json({ reset: true });
        else res.status(404).json({ error: 'not_found' });
        return;
      }

      if (req.method === 'POST') {
        try {
          res.status(201).json({ subscriber: await svc.createSubscriber(deps, req.body) });
        } catch (err) {
          if (answerKnownError(err, res)) return;
          throw err;
        }
        return;
      }

      if (req.method === 'PUT') {
        const id = idOf(req);
        if (!Number.isInteger(id) || id < 1) {
          res.status(400).json({ error: 'id is required' });
          return;
        }
        try {
          const subscriber = await svc.updateSubscriber(deps, id, req.body);
          if (subscriber) res.status(200).json({ subscriber });
          else res.status(404).json({ error: 'not_found' });
        } catch (err) {
          if (answerKnownError(err, res)) return;
          throw err;
        }
        return;
      }

      if (req.method === 'DELETE') {
        const id = idOf(req);
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
