// lib/handlers/subscriber-area.js — API da área do assinante (um único endereço,
// /api/subscriber-area, para caber no limite de funções da Vercel):
//   GET                    -> quem está logado
//   POST ?action=login     -> entrar (celular ou e-mail + senha)
//   POST ?action=logout    -> sair
//   POST ?action=password  -> trocar a própria senha
//   GET  ?resource=questionnaire    -> e-mail e respostas atuais do questionário
//   POST ?action=questionnaire      -> enviar/atualizar as respostas do questionário
//   GET  ?resource=wines            -> vinhos do clube já liberados para o assinante
//   POST ?action=rate               -> dar a nota (1 a 5 estrelas) a um vinho recebido
//   GET  ?resource=club             -> (público) se o clube está aberto para novas contratações
//   POST ?action=signup             -> (público) contratar: cria a conta e a solicitação
//   POST ?action=contract           -> quem já tem conta pede a assinatura
const area = require('../subscriber-area-service.js');
const session = require('../subscriber-session.js');
const questionnaire = require('../questionnaire-service.js');
const clubWines = require('../club-wines-service.js');
const clubSignup = require('../club-signup-service.js');
const subscriptions = require('../subscription-service.js');

function createSubscriberAreaHandler(deps) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (!deps.sessionSecret) {
      res.status(503).json({ error: 'not_configured' });
      return;
    }

    try {
      if (req.method === 'GET' && req.query && req.query.resource === 'club') {
        res.status(200).json({ open: !!deps.clubOpen });
        return;
      }

      if (req.method === 'GET') {
        const row = await area.currentRow(deps, session.tokenFromRequest(req));
        if (!row) {
          res.status(401).json({ error: 'unauthorized' });
          return;
        }
        if (req.query && req.query.resource === 'questionnaire') {
          res.status(200).json(await questionnaire.load(deps, row));
          return;
        }
        if (req.query && req.query.resource === 'wines') {
          res.status(200).json({ wines: await clubWines.listForSubscriber(deps, row) });
          return;
        }
        // O resumo do questionário é um extra: se falhar, a área continua abrindo.
        let status = null;
        try {
          status = await questionnaire.statusFor(deps, row);
        } catch (err) {
          console.error('questionnaire status failed', err);
        }
        // A situação da assinatura também é um extra: se falhar, a área abre sem ela.
        let subscription = null;
        try {
          subscription = await subscriptions.mine(deps, row);
        } catch (err) {
          console.error('subscription status failed', err);
        }
        res.status(200).json({ subscriber: area.toArea(row), profile: area.toProfile(row), questionnaire: status, subscription });
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

      // A resposta de uma contratação (cadastro novo ou cliente existente).
      const answerRequest = (result) => {
        if (result.status === 'closed') res.status(403).json({ error: 'club_closed' });
        else if (result.status === 'invalid') res.status(400).json({ errors: result.errors });
        else if (result.status === 'exists') res.status(409).json({ error: 'exists', field: result.field });
        else if (result.status === 'already_subscribed') res.status(409).json({ error: 'already_subscribed' });
        else if (result.status === 'busy') res.status(429).json({ error: 'busy' });
        else return false;
        return true;
      };

      if (action === 'signup') {
        const result = await clubSignup.signup(deps, body);
        if (answerRequest(result)) return;
        res.setHeader('Set-Cookie', session.buildCookie(result.token));
        res.status(201).json({ subscriber: result.subscriber, subscription: result.subscription });
        return;
      }

      if (action === 'contract') {
        const row = await area.currentRow(deps, session.tokenFromRequest(req));
        if (!row) {
          res.status(401).json({ error: 'unauthorized' });
          return;
        }
        const result = await clubSignup.contract(deps, row, body);
        if (answerRequest(result)) return;
        res.status(200).json({ subscription: result.subscription });
        return;
      }

      if (action === 'questionnaire') {
        const row = await area.currentRow(deps, session.tokenFromRequest(req));
        if (!row) {
          res.status(401).json({ error: 'unauthorized' });
          return;
        }
        try {
          const saved = await questionnaire.submit(deps, row, body);
          res.status(200).json({ ok: true, submittedAt: saved.submittedAt });
        } catch (err) {
          if (!(err instanceof questionnaire.QuestionnaireError)) throw err;
          if (err.errors.email === 'duplicate') res.status(409).json({ error: 'duplicate', field: 'email' });
          else res.status(400).json({ errors: err.errors });
        }
        return;
      }

      if (action === 'rate') {
        const row = await area.currentRow(deps, session.tokenFromRequest(req));
        if (!row) {
          res.status(401).json({ error: 'unauthorized' });
          return;
        }
        const wineId = body.id;
        if (!Number.isInteger(wineId) || wineId < 1) {
          res.status(404).json({ error: 'not_found' });
          return;
        }
        const result = await clubWines.rate(deps, row, wineId, body.rating);
        if (result.status === 'ok') res.status(200).json({ wine: result.wine });
        else if (result.status === 'invalid') res.status(400).json({ error: 'invalid_rating' });
        else res.status(404).json({ error: 'not_found' });
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
