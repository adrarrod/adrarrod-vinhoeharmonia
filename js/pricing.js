// js/pricing.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Pricing = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // No navegador, js/promocao.js é carregado antes deste arquivo.
  const Promocao = typeof module === 'object' && module.exports
    ? require('./promocao.js')
    : (typeof self !== 'undefined' ? self : globalThis).Promocao;

  const FREE_SHIPPING_THRESHOLD = 150;
  const FALLBACK_FLAT_FEE = 15;
  const COUPONS = { PRIMEIRA10: 0.1 };

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function calcSubtotal(items) {
    return round2(items.reduce((sum, item) => sum + item.price * item.qty, 0));
  }

  function applyCoupon(subtotal, code) {
    const trimmed = (code || '').trim().toUpperCase();
    if (!trimmed) return { valid: false, discount: 0, code: null };
    const rate = COUPONS[trimmed];
    if (!rate) return { valid: false, discount: 0, code: trimmed };
    return { valid: true, discount: round2(subtotal * rate), code: trimmed };
  }

  function freeShippingProgress(subtotal, threshold = FREE_SHIPPING_THRESHOLD) {
    const qualifies = subtotal >= threshold;
    return {
      qualifies,
      remaining: qualifies ? 0 : round2(threshold - subtotal),
      percent: qualifies ? 100 : (subtotal / threshold) * 100
    };
  }

  function fallbackFreight(subtotal, threshold = FREE_SHIPPING_THRESHOLD, flatFee = FALLBACK_FLAT_FEE) {
    if (subtotal >= threshold) return { cost: 0, free: true };
    return { cost: flatFee, free: false };
  }

  // Desconto da promoção (Black Friday) no carrinho. promo = { active, method }:
  // sem promoção ativa, ou sem forma de pagamento, não há desconto.
  function promoDiscountOf(items, promo) {
    return promo && promo.active ? Promocao.promoDiscount(items, promo.method) : 0;
  }

  // O que o cliente paga pelos vinhos, já com o desconto da promoção: é este
  // valor que conta para o frete grátis.
  function payableSubtotal(items, promo) {
    return round2(calcSubtotal(items) - promoDiscountOf(items, promo));
  }

  // O cupom não acumula com a promoção: com ela ligada, vale só para os vinhos que
  // não estão nela.
  function couponBase(items, promo) {
    const subtotal = calcSubtotal(items);
    return promo && promo.active ? round2(subtotal - Promocao.promoSubtotal(items)) : subtotal;
  }

  function computeTotals(items, couponCode, freightCost, promo) {
    const subtotal = calcSubtotal(items);
    const promoDiscount = promoDiscountOf(items, promo);
    const promoOn = !!(promo && promo.active);
    const base = couponBase(items, promo);
    const coupon = applyCoupon(base, couponCode);
    const couponBlocked = promoOn && coupon.valid && base === 0 && subtotal > 0;
    const freight = round2(subtotal - promoDiscount) >= FREE_SHIPPING_THRESHOLD ? 0 : freightCost;
    const total = Math.max(0, round2(subtotal - promoDiscount - coupon.discount + freight));
    return {
      subtotal,
      promoDiscount,
      discount: coupon.discount,
      couponCode: coupon.valid && !couponBlocked ? coupon.code : null,
      couponBlocked,
      freight,
      total
    };
  }

  return {
    FREE_SHIPPING_THRESHOLD,
    FALLBACK_FLAT_FEE,
    calcSubtotal,
    applyCoupon,
    freeShippingProgress,
    fallbackFreight,
    payableSubtotal,
    couponBase,
    computeTotals
  };
});
