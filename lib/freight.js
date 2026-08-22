// lib/freight.js
const Pricing = require('../js/pricing.js');

async function quoteFreight(deps, { cep, subtotal }) {
  const { env, fetchImpl } = deps;
  const configured = Boolean(env.MELHOR_ENVIO_TOKEN && env.MELHOR_ENVIO_CEP_ORIGEM);

  if (configured) {
    try {
      const response = await fetchImpl('https://www.melhorenvio.com.br/api/v2/me/shipment/calculate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.MELHOR_ENVIO_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          from: { postal_code: env.MELHOR_ENVIO_CEP_ORIGEM },
          to: { postal_code: cep },
          products: [{ id: 'cart', width: 15, height: 15, length: 15, weight: 1, insurance_value: subtotal, quantity: 1 }]
        })
      });
      if (!response.ok) throw new Error(`melhor envio http ${response.status}`);
      const quotes = await response.json();
      const valid = quotes.filter((q) => !q.error && q.price);
      if (valid.length === 0) throw new Error('no valid melhor envio quotes');
      const cheapest = Math.min(...valid.map((q) => Number(q.price)));
      if (subtotal >= Pricing.FREE_SHIPPING_THRESHOLD) {
        return { cost: 0, free: true, source: 'melhor-envio' };
      }
      return { cost: Math.round(cheapest * 100) / 100, free: false, source: 'melhor-envio' };
    } catch {
      // fall through to fallback below
    }
  }

  const fallback = Pricing.fallbackFreight(subtotal);
  return { ...fallback, source: 'fallback' };
}

module.exports = { quoteFreight };
