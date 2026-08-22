// js/pricing.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Pricing = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
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

  function computeTotals(items, couponCode, freightCost) {
    const subtotal = calcSubtotal(items);
    const coupon = applyCoupon(subtotal, couponCode);
    const freight = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : freightCost;
    const total = Math.max(0, round2(subtotal - coupon.discount + freight));
    return { subtotal, discount: coupon.discount, couponCode: coupon.valid ? coupon.code : null, freight, total };
  }

  return {
    FREE_SHIPPING_THRESHOLD,
    FALLBACK_FLAT_FEE,
    calcSubtotal,
    applyCoupon,
    freeShippingProgress,
    fallbackFreight,
    computeTotals
  };
});
