// test/pricing.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Pricing = require('../js/pricing.js');

test('calcSubtotal sums price * qty', () => {
  const items = [{ price: 10, qty: 2 }, { price: 5, qty: 3 }];
  assert.equal(Pricing.calcSubtotal(items), 35);
});

test('calcSubtotal returns 0 for empty cart', () => {
  assert.equal(Pricing.calcSubtotal([]), 0);
});

test('applyCoupon PRIMEIRA10 gives 10% off', () => {
  const result = Pricing.applyCoupon(100, 'PRIMEIRA10');
  assert.equal(result.valid, true);
  assert.equal(result.discount, 10);
});

test('applyCoupon is case-insensitive and trims whitespace', () => {
  const result = Pricing.applyCoupon(100, '  primeira10  ');
  assert.equal(result.valid, true);
  assert.equal(result.discount, 10);
});

test('applyCoupon rejects unknown codes with zero discount', () => {
  const result = Pricing.applyCoupon(100, 'NAOEXISTE');
  assert.equal(result.valid, false);
  assert.equal(result.discount, 0);
});

test('applyCoupon treats empty/null code as no coupon, not an error', () => {
  assert.deepEqual(Pricing.applyCoupon(100, ''), { valid: false, discount: 0, code: null });
  assert.deepEqual(Pricing.applyCoupon(100, null), { valid: false, discount: 0, code: null });
});

test('freeShippingProgress below threshold reports remaining amount', () => {
  const progress = Pricing.freeShippingProgress(100);
  assert.equal(progress.qualifies, false);
  assert.equal(progress.remaining, 50);
  assert.ok(Math.abs(progress.percent - (100 / 150) * 100) < 0.001);
});

test('freeShippingProgress at or above threshold qualifies with 100 percent', () => {
  const progress = Pricing.freeShippingProgress(150);
  assert.equal(progress.qualifies, true);
  assert.equal(progress.remaining, 0);
  assert.equal(progress.percent, 100);

  const progressAbove = Pricing.freeShippingProgress(200);
  assert.equal(progressAbove.qualifies, true);
  assert.equal(progressAbove.remaining, 0);
});

test('fallbackFreight is free at/above 150, flat R$15 below', () => {
  assert.deepEqual(Pricing.fallbackFreight(200), { cost: 0, free: true });
  assert.deepEqual(Pricing.fallbackFreight(150), { cost: 0, free: true });
  assert.deepEqual(Pricing.fallbackFreight(100), { cost: 15, free: false });
});

test('computeTotals combines subtotal, discount and freight', () => {
  const items = [{ price: 50, qty: 2 }]; // subtotal 100
  const totals = Pricing.computeTotals(items, 'PRIMEIRA10', 15);
  assert.equal(totals.subtotal, 100);
  assert.equal(totals.discount, 10);
  assert.equal(totals.freight, 15);
  assert.equal(totals.total, 105);
});

test('computeTotals never lets total go negative', () => {
  const items = [{ price: 1, qty: 1 }];
  const totals = Pricing.computeTotals(items, 'PRIMEIRA10', 0);
  assert.ok(totals.total >= 0);
});

// Frete grátis "a partir de R$ 150": o limite é inclusivo e vale para o
// subtotal ANTES do cupom (é o que o aviso da home promete ao cliente).
test('computeTotals charges freight at R$149.99 and waives it at exactly R$150.00', () => {
  const below = Pricing.computeTotals([{ price: 149.99, qty: 1 }], null, 22.5);
  assert.equal(below.freight, 22.5);
  assert.equal(below.total, 172.49);

  const at = Pricing.computeTotals([{ price: 150, qty: 1 }], null, 22.5);
  assert.equal(at.freight, 0);
  assert.equal(at.total, 150);
});

test('computeTotals keeps free shipping when a coupon drops the payable amount below R$150', () => {
  const totals = Pricing.computeTotals([{ price: 150, qty: 1 }], 'PRIMEIRA10', 22.5);
  assert.equal(totals.freight, 0);
  assert.equal(totals.discount, 15);
  assert.equal(totals.total, 135);
});

// --- Black Friday: desconto por forma de pagamento nos vinhos da promoção ---

const MONTE = { slug: 'vezzani-montepulciano', price: 91.32, qty: 1 }; // PIX 63,92 · cartão 68,49
const AUTORES = { slug: '3-autores', price: 57.64, qty: 1 }; // fora da promoção

test('without the promotion nothing changes: no discount line and the same totals as before', () => {
  const t = Pricing.computeTotals([{ ...MONTE, qty: 2 }], null, 12);
  assert.equal(t.promoDiscount, 0);
  assert.equal(t.total, 182.64); // já passa de R$ 150: sem frete
  const off = Pricing.computeTotals([{ ...MONTE, qty: 2 }], null, 12, { active: false, method: 'pix' });
  assert.deepEqual(off, t);
});

test('with the promotion on, PIX takes 30% and the card 25% off the promotional wines', () => {
  const items = [{ ...MONTE, qty: 3 }];
  const pix = Pricing.computeTotals(items, null, 12, { active: true, method: 'pix' });
  assert.equal(pix.subtotal, 273.96);
  assert.equal(pix.promoDiscount, 82.2);
  assert.equal(pix.total, 191.76);
  const card = Pricing.computeTotals(items, null, 12, { active: true, method: 'card' });
  assert.equal(card.promoDiscount, 68.49);
  assert.equal(card.total, 205.47);
});

test('the discount only touches the ten promotional wines', () => {
  const t = Pricing.computeTotals([MONTE, AUTORES], null, 20, { active: true, method: 'pix' });
  assert.equal(t.subtotal, 148.96);
  assert.equal(t.promoDiscount, 27.4);
  assert.equal(t.total, 141.56); // 148,96 - 27,40 + frete 20
});

test('the coupon does not stack: it only applies to the wines that are not in the promotion', () => {
  const t = Pricing.computeTotals([MONTE, AUTORES], 'PRIMEIRA10', 20, { active: true, method: 'pix' });
  assert.equal(t.discount, 5.76); // 10% de 57,64, e não de 148,96
  assert.equal(t.couponCode, 'PRIMEIRA10');
  assert.equal(t.total, 135.8); // 148,96 - 27,40 - 5,76 + 20
});

test('a cart with only promotional wines gets no coupon discount, and says the coupon was set aside', () => {
  const t = Pricing.computeTotals([{ ...MONTE, qty: 2 }], 'PRIMEIRA10', 20, { active: true, method: 'card' });
  assert.equal(t.discount, 0);
  assert.equal(t.couponCode, null);
  assert.equal(t.couponBlocked, true);
});

test('the coupon keeps working as before when the promotion is off', () => {
  const t = Pricing.computeTotals([{ ...MONTE, qty: 2 }], 'PRIMEIRA10', 20, { active: false, method: 'pix' });
  assert.equal(t.discount, 18.26);
  assert.equal(t.couponCode, 'PRIMEIRA10');
  assert.equal(t.couponBlocked, false);
});

test('free shipping counts what the customer pays for the wines, after the promotional discount', () => {
  // 2 garrafas: 182,64 a preço atual, mas 127,84 no PIX — abaixo de R$ 150: paga frete.
  const below = Pricing.computeTotals([{ ...MONTE, qty: 2 }], null, 20, { active: true, method: 'pix' });
  assert.equal(below.freight, 20);
  assert.equal(below.total, 147.84);
  // 3 garrafas: 191,76 no PIX — passa de R$ 150: frete grátis.
  const above = Pricing.computeTotals([{ ...MONTE, qty: 3 }], null, 20, { active: true, method: 'pix' });
  assert.equal(above.freight, 0);
  // Sem promoção, 2 garrafas (182,64) já tinham frete grátis.
  assert.equal(Pricing.computeTotals([{ ...MONTE, qty: 2 }], null, 20).freight, 0);
});

test('payableSubtotal is the subtotal minus the promotional discount, and the subtotal itself when there is none', () => {
  const items = [{ ...MONTE, qty: 3 }];
  assert.equal(Pricing.payableSubtotal(items, { active: true, method: 'pix' }), 191.76);
  assert.equal(Pricing.payableSubtotal(items, { active: true, method: 'card' }), 205.47);
  assert.equal(Pricing.payableSubtotal(items, { active: false, method: 'pix' }), 273.96);
  assert.equal(Pricing.payableSubtotal(items), 273.96);
});

test('the total is never negative, whatever the discounts', () => {
  const t = Pricing.computeTotals([{ slug: 'lacase-carmenere', price: 0.01, qty: 1 }], null, 0, { active: true, method: 'pix' });
  assert.ok(t.total >= 0);
});

test('couponBase is what the coupon may discount: the whole cart, or only the non-promotional wines while the promotion is on', () => {
  const items = [{ slug: 'vezzani-montepulciano', price: 91.32, qty: 2 }, { slug: '3-autores', price: 57.64, qty: 1 }];
  assert.equal(Pricing.couponBase(items), 240.28);
  assert.equal(Pricing.couponBase(items, { active: false, method: 'pix' }), 240.28);
  assert.equal(Pricing.couponBase(items, { active: true, method: 'pix' }), 57.64);
  assert.equal(Pricing.couponBase([items[0]], { active: true, method: 'card' }), 0);
});
