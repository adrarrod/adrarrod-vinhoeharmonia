const { fetchPaymentStatus } = require('../payment.js');
const svc = require('../orders-service.js');
const { verifyWebhookSignature } = require('../mp-signature.js');

const STATUS_MAP = { approved: 'pago', rejected: 'pagamento_recusado' };

function createWebhookHandler(deps) {
  return async function handler(req, res) {
    const secret = deps.env && deps.env.MP_WEBHOOK_SECRET;
    if (!secret) {
      // Sem segredo configurado não há como confirmar que a notificação veio
      // mesmo do Mercado Pago — mesmo padrão do resto do projeto: sem
      // credencial, degrada com segurança em vez de processar sem checagem.
      console.error('MP_WEBHOOK_SECRET não configurado — notificação ignorada');
      res.status(200).json({ ignored: true, warning: 'webhook_secret_not_configured' });
      return;
    }

    if (!verifyWebhookSignature({ headers: req.headers, query: req.query }, secret)) {
      res.status(401).json({ error: 'invalid_signature' });
      return;
    }

    const paymentId = (req.body && req.body.data && req.body.data.id) || (req.query && req.query['data.id']);
    if (!paymentId) {
      res.status(200).json({ ignored: true });
      return;
    }

    // O handler sempre responde 200: um 500 faria o Mercado Pago reentregar o
    // webhook indefinidamente por causa de uma falha nossa — seja na consulta
    // do status, seja na gravação no banco.
    try {
      const result = await fetchPaymentStatus(deps, paymentId);
      if (result.configured && result.orderId && STATUS_MAP[result.status]) {
        await svc.setOrderStatus({ execute: deps.execute }, result.orderId, STATUS_MAP[result.status]);
      }
    } catch (err) {
      console.error('failed to process payment webhook', err);
      res.status(200).json({ received: true, warning: 'status_check_failed' });
      return;
    }

    res.status(200).json({ received: true });
  };
}

module.exports = { createWebhookHandler };
