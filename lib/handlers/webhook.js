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

    const result = await fetchPaymentStatus(deps, paymentId);
    if (result.configured && result.orderId && STATUS_MAP[result.status]) {
      await svc.setOrderStatus({ execute: deps.execute }, result.orderId, STATUS_MAP[result.status]);
    }
    res.status(200).json({ received: true });
  };
}

module.exports = { createWebhookHandler };
