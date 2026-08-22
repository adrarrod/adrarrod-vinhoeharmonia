async function createPreference(deps, order) {
  const { env, fetchImpl } = deps;
  if (!env.MP_ACCESS_TOKEN) return { configured: false };

  const response = await fetchImpl('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      // Um único item com o total do pedido, e não uma linha por vinho: a soma
      // dos itens é apenas o SUBTOTAL — frete e desconto de cupom ficariam de
      // fora da cobrança. order.total já vem do banco com frete somado e
      // desconto subtraído (Pricing.computeTotals), então cobrar exatamente
      // esse valor dispensa qualquer rateio por linha.
      items: [{
        title: `Pedido #${order.id} — Vinho & Harmonia`,
        quantity: 1,
        unit_price: order.total,
        currency_id: 'BRL'
      }],
      external_reference: String(order.id),
      back_urls: {
        success: `${env.SITE_URL}/?pedido=${order.id}&pagamento=sucesso`,
        failure: `${env.SITE_URL}/?pedido=${order.id}&pagamento=falha`,
        pending: `${env.SITE_URL}/?pedido=${order.id}&pagamento=pendente`
      },
      auto_return: 'approved'
    })
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(`Mercado Pago error ${response.status}: ${errBody.message || 'unknown'}`);
  }

  const data = await response.json();
  return { configured: true, initPoint: data.init_point, preferenceId: data.id };
}

async function fetchPaymentStatus(deps, paymentId) {
  const { env, fetchImpl } = deps;
  if (!env.MP_ACCESS_TOKEN) return { configured: false };

  const response = await fetchImpl(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` }
  });
  if (!response.ok) throw new Error(`Mercado Pago payment lookup failed: ${response.status}`);
  const data = await response.json();
  return { configured: true, status: data.status, orderId: data.external_reference };
}

module.exports = { createPreference, fetchPaymentStatus };
