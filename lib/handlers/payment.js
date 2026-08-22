// lib/handlers/payment.js
const { createPreference } = require('../payment.js');
const svc = require('../orders-service.js');

// O Postgres devolve colunas NUMERIC como STRING (via @vercel/postgres/pg, para
// não perder precisão). Passar essas strings adiante faria o Mercado Pago
// receber "129.20" onde espera 129.2 — então tudo que vira preço/quantidade
// passa por aqui antes de sair.
function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// items é JSONB: o driver normalmente já entrega um array de objetos, mas se
// vier como texto (driver/versão diferente) ainda assim conseguimos ler.
function parseItems(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return [];
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

    // Total e itens vêm do banco (gravados com preço de catálogo por
    // createOrder), nunca do corpo da requisição: o navegador não pode
    // forjar um total menor do que o pedido realmente vale.
    const items = parseItems(order.items).map((item) => ({
      name: item.name,
      qty: toNumber(item.qty),
      price: toNumber(item.price)
    }));

    try {
      const result = await createPreference(deps, {
        id: order.id,
        total: toNumber(order.total),
        items
      });
      res.status(200).json(result);
    } catch (err) {
      res.status(502).json({ error: 'mercado_pago_error', message: err.message });
    }
  };
}

module.exports = { createPaymentHandler };
