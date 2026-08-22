// lib/freight.js
const Pricing = require('../js/pricing.js');
const meService = require('./melhor-envio-service.js');

const APP_USER_AGENT = 'Vinho & Harmonia (contato@vinhoharmonia.com.br)';

async function quoteFreight(deps, { cep, subtotal }) {
  const { env, fetchImpl } = deps;

  if (env.MELHOR_ENVIO_CEP_ORIGEM) {
    try {
      const accessToken = await meService.getValidAccessToken(deps);
      if (accessToken) {
        const response = await fetchImpl('https://melhorenvio.com.br/api/v2/me/shipment/calculate', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': APP_USER_AGENT
          },
          body: JSON.stringify({
            from: { postal_code: env.MELHOR_ENVIO_CEP_ORIGEM },
            to: { postal_code: cep },
            products: [{ id: 'cart', width: 15, height: 15, length: 15, weight: 1, insurance_value: subtotal, quantity: 1 }]
          })
        });
        if (!response.ok) throw new Error(`melhor envio http ${response.status}`);
        const quotes = await response.json();
        const valid = quotes.filter((q) => !q.error && (q.custom_price || q.price));
        if (valid.length === 0) throw new Error('no valid melhor envio quotes');
        const cheapest = Math.min(...valid.map((q) => Number(q.custom_price || q.price)));
        if (subtotal >= Pricing.FREE_SHIPPING_THRESHOLD) {
          return { cost: 0, free: true, source: 'melhor-envio' };
        }
        return { cost: Math.round(cheapest * 100) / 100, free: false, source: 'melhor-envio' };
      }
    } catch {
      // cai no fallback abaixo
    }
  }

  const fallback = Pricing.fallbackFreight(subtotal);
  return { ...fallback, source: 'fallback' };
}

module.exports = { quoteFreight };
