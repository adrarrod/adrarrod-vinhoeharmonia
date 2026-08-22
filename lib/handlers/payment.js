// lib/handlers/payment.js
const { createPreference } = require('../payment.js');
const svc = require('../orders-service.js');

// O Postgres devolve colunas NUMERIC como STRING (via @vercel/postgres/pg, para
// não perder precisão). Passar essas strings adiante faria o Mercado Pago
// receber "149.20" onde espera 149.2 — então o total passa por aqui antes de
// sair.
function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function createPaymentHandler(deps) {
  const serviceDeps = { execute: deps.execute };

  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    const { orderId } = req.body || {};
    if (!orderId) {
      res.status(400).json({ error: 'orderId is required' });
      return;
    }

    let order;
    try {
      order = await svc.getOrderForPayment(serviceDeps, orderId);
    } catch (err) {
      console.error('failed to load order for payment', err);
      res.status(500).json({ error: 'internal_error' });
      return;
    }

    if (!order) {
      res.status(404).json({ error: 'order_not_found' });
      return;
    }

    // O total vem do banco (calculado por createOrder a partir do preço de
    // catálogo, com frete e cupom), nunca do corpo da requisição: o navegador
    // não pode forjar um total menor do que o pedido realmente vale.
    // A preferência é cobrada como um item único desse total, então a lista de
    // itens do pedido não precisa ser enviada.
    try {
      const result = await createPreference(deps, {
        id: order.id,
        total: toNumber(order.total)
      });
      res.status(200).json(result);
    } catch (err) {
      res.status(502).json({ error: 'mercado_pago_error', message: err.message });
    }
  };
}

module.exports = { createPaymentHandler };
