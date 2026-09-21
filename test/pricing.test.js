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
