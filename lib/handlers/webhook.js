const { fetchPaymentStatus } = require('../payment.js');
const svc = require('../orders-service.js');

const STATUS_MAP = { approved: 'pago', rejected: 'pagamento_recusado' };

function createWebhookHandler(deps) {
  return async function handler(req, res) {
    const paymentId = req.body && req.body.data && req.body.data.id;
    if (!paymentId) {
      res.status(200).json({ ignored: true });
      return;
    }

    // O handler sempre responde 200: um 500 faria o Mercado Pago reentregar o
    // webhook indefinidamente por causa de uma falha nossa de consulta.
    let result;
    try {
      result = await fetchPaymentStatus(deps, paymentId);
    } catch (err) {
      console.error('failed to fetch payment status', err);
      res.status(200).json({ received: true, warning: 'status_check_failed' });
      return;
    }

    if (result.configured && result.orderId && STATUS_MAP[result.status]) {
      await svc.setOrderStatus({ execute: deps.execute }, result.orderId, STATUS_MAP[result.status]);
    }
    res.status(200).json({ received: true });
  };
}

module.exports = { createWebhookHandler };
