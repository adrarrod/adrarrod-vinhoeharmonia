// lib/handlers/order-cancel.js
const auth = require('../auth.js');
const stock = require('../stock-service.js');

function createCancelOrderHandler(deps) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    const cookies = auth.parseCookies(req.headers.cookie);
    if (!auth.verifySession(cookies[auth.SESSION_COOKIE_NAME], deps.adminPassword, deps.sessionSecret)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const { orderId } = req.body || {};
    if (!Number.isInteger(orderId) || orderId < 1) {
      res.status(400).json({ error: 'orderId is required' });
      return;
    }
    try {
      res.status(200).json(await stock.cancelOrder(deps, orderId));
    } catch (err) {
      console.error('failed to cancel order', err);
      res.status(500).json({ error: 'internal_error' });
    }
  };
}

module.exports = { createCancelOrderHandler };
