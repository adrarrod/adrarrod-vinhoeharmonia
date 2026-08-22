// lib/handlers/payment.js
const { createPreference } = require('../payment.js');

function createPaymentHandler(deps) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    const { orderId, total, items } = req.body || {};
    if (!orderId || typeof total !== 'number' || !Array.isArray(items)) {
      res.status(400).json({ error: 'orderId, total and items are required' });
      return;
    }
    try {
      const result = await createPreference(deps, { id: orderId, total, items });
      res.status(200).json(result);
    } catch (err) {
      res.status(502).json({ error: 'mercado_pago_error', message: err.message });
    }
  };
}

module.exports = { createPaymentHandler };
