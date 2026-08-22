const { quoteFreight } = require('../freight.js');

function createFreightHandler(deps) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    const { cep, subtotal } = req.body || {};
    if (!cep || typeof subtotal !== 'number') {
      res.status(400).json({ error: 'cep and subtotal are required' });
      return;
    }
    const quote = await quoteFreight(deps, { cep, subtotal });
    res.status(200).json(quote);
  };
}

module.exports = { createFreightHandler };
