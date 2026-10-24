// lib/handlers/subscribers.js — API do cadastro de assinantes. Tudo exige a
// sessão do admin: não existe (ainda) nenhuma forma pública de ver ou cadastrar.
const auth = require('../auth.js');
const svc = require('../subscribers-service.js');
const questionnaire = require('../questionnaire-service.js');
const clubWines = require('../club-wines-service.js');
const subscriptions = require('../subscription-service.js');

function createSubscribersHandler(deps) {
  function isAdmin(req) {
    const cookies = auth.parseCookies(req.headers && req.headers.cookie);
    return auth.verifySession(cookies[auth.SESSION_COOKIE_NAME], deps.adminPassword, deps.sessionSecret);
  }

  // ?id=... (ou outro parâmetro) como número inteiro positivo, ou NaN.
  function queryInt(req, key) {
    const raw = req.query && req.query[key];
    return /^\d+$/.test(String(raw)) ? Number(raw) : NaN;
  }
  const idOf = (req) => queryInt(req, 'id');
  const isId = (n) => Number.isInteger(n) && n >= 1;

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
      if (req.method === 'GET' && req.query && req.query.export === 'csv') {
        const day = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="respostas-questionario-${day}.csv"`);
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).end(await questionnaire.exportCsv(deps));
        return;
      }

      if (req.method === 'GET' && req.query && req.query.view === 'subscriptions') {
        res.status(200).json(await subscriptions.adminList(deps));
        return;
      }

      if (req.method === 'GET' && req.query && req.query.view === 'subscription-events') {
        const subscription = queryInt(req, 'subscription');
        if (!isId(subscription)) {
          res.status(400).json({ error: 'subscription is required' });
          return;
        }
        const events = await subscriptions.adminEvents(deps, subscription);
        if (events) res.status(200).json({ events });
        else res.status(404).json({ error: 'not_found' });
        return;
      }

      if (req.method === 'GET' && req.query && req.query.view === 'wines') {
        const id = idOf(req);
        if (!isId(id)) {
          res.status(400).json({ error: 'id is required' });
          return;
        }
        const wines = await clubWines.adminList(deps, id);
        if (wines) res.status(200).json({ wines });
        else res.status(404).json({ error: 'not_found' });
        return;
      }

      if (req.method === 'GET' && req.query && req.query.view === 'questionnaire') {
        if (req.query.id === undefined) {
          res.status(200).json({ responses: await questionnaire.adminList(deps) });
          return;
        }
        const id = idOf(req);
        if (!Number.isInteger(id) || id < 1) {
          res.status(400).json({ error: 'id is required' });
          return;
        }
        const detail = await questionnaire.adminDetail(deps, id);
        if (detail) res.status(200).json(detail);
        else res.status(404).json({ error: 'not_found' });
        return;
      }

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

      if (req.method === 'POST' && req.query && /^sub-(link|link-sent|status|create)$/.test(req.query.action || '')) {
        const action = req.query.action;
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const subscription = queryInt(req, 'subscription');
        const subscriberId = idOf(req);
        const needsSubscriber = action === 'sub-create';
        if (!isId(needsSubscriber ? subscriberId : subscription)) {
          res.status(400).json({ error: needsSubscriber ? 'id is required' : 'subscription is required' });
          return;
        }

        let result;
        if (action === 'sub-link') result = await subscriptions.adminSetLink(deps, subscription, body.link);
        else if (action === 'sub-link-sent') result = await subscriptions.adminMarkSent(deps, subscription);
        else if (action === 'sub-status') result = await subscriptions.adminTransition(deps, subscription, body.to, body.note);
        else result = await subscriptions.adminCreate(deps, subscriberId, body.status);

        const failures = {
          not_found: [404, 'not_found'],
          invalid: [400, 'invalid'],
          no_link: [400, 'no_link'],
          closed: [409, 'closed'],
          exists: [409, 'exists'],
          invalid_transition: [409, 'invalid_transition'],
          conflict: [409, 'conflict']
        };
        if (failures[result.status]) {
          const [code, error] = failures[result.status];
          res.status(code).json({ error: action === 'sub-link' && result.status === 'invalid' ? 'invalid_link' : error });
          return;
        }
        res.status(action === 'sub-create' ? 201 : 200).json({ subscription: result.subscription });
        return;
      }

      if (req.method === 'POST' && req.query && req.query.action === 'add-wine') {
        const id = idOf(req);
        if (!isId(id)) {
          res.status(400).json({ error: 'id is required' });
          return;
        }
        try {
          const result = await clubWines.adminAdd(deps, id, req.body);
          if (result.status === 'ok') res.status(201).json({ wine: result.wine });
          else if (result.status === 'duplicate') res.status(409).json({ error: 'duplicate' });
          else res.status(404).json({ error: 'not_found' });
        } catch (err) {
          if (!(err instanceof clubWines.ClubWineError)) throw err;
          res.status(400).json({ errors: err.errors });
        }
        return;
      }

      if (req.method === 'POST' && req.query && req.query.action === 'remove-wine') {
        const id = idOf(req);
        const wine = queryInt(req, 'wine');
        if (!isId(id) || !isId(wine)) {
          res.status(400).json({ error: 'id and wine are required' });
          return;
        }
        if (await clubWines.adminRemove(deps, id, wine)) res.status(200).json({ removed: true });
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
