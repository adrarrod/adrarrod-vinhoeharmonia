// test/promocao.test.js — regras de preço da Black Friday
const test = require('node:test');
const assert = require('node:assert/strict');
const Catalog = require('../js/catalog.js');
const Promocao = require('../js/promocao.js');

// Valores da planilha "Black Friday 2026 - 10 vinhos" (preço atual, cartão, PIX).
const SHEET = [
  ['vezzani-montepulciano', 91.32, 68.49, 63.92],
  ['vezzani-nero-di-troia', 91.71, 68.78, 64.2],
  ['terramater-vineyard-pinot-noir-reserve', 94.86, 71.15, 66.4],
  ['nobili-d-italia-trebbiano-d-abruzzo', 65.63, 49.22, 45.94],
  ['la-treille-de-candale', 57.59, 43.19, 40.31],
  ['vezzani-nero-d-avola', 89.85, 67.39, 62.9],
  ['paso-de-los-andes-carmenere-preto', 58.87, 44.15, 41.21],
  ['pao-de-los-andes-cabernet-sauvignon', 58.87, 44.15, 41.21],
  ['romanica-pinot-grigio', 65.78, 49.34, 46.05],
  ['lacase-carmenere', 49.76, 37.32, 34.83]
];

test('Black Friday gives 25% off on the card and 30% off on PIX', () => {
  assert.equal(Promocao.BLACK_FRIDAY.rates.card, 0.25);
  assert.equal(Promocao.BLACK_FRIDAY.rates.pix, 0.3);
});

test('the promotion has exactly the ten wines of the spreadsheet, all in the catalog', () => {
  assert.deepEqual([...Promocao.BLACK_FRIDAY.wines].sort(), SHEET.map((r) => r[0]).sort());
  for (const slug of Promocao.BLACK_FRIDAY.wines) assert.ok(Catalog.findBySlug(slug), `not in the catalog: ${slug}`);
});

test('the current price of each wine on the site is the "preço atual" of the spreadsheet', () => {
  for (const [slug, current] of SHEET) assert.equal(Catalog.findBySlug(slug).price, current, slug);
});

test('the promotional prices are exactly the card and PIX prices of the spreadsheet, to the cent', () => {
  for (const [slug, current, card, pix] of SHEET) {
    assert.equal(Promocao.priceFor(current, 'card'), card, `${slug} card`);
    assert.equal(Promocao.priceFor(current, 'pix'), pix, `${slug} pix`);
  }
});

test('discountFor is the difference between the current price and the promotional price', () => {
  assert.equal(Promocao.discountFor(91.32, 'pix'), 27.4);
  assert.equal(Promocao.discountFor(91.32, 'card'), 22.83);
  assert.equal(Promocao.discountFor(100, 'pix'), 30);
});

test('with an unknown or missing payment method there is no discount', () => {
  for (const method of [undefined, null, '', 'boleto', 'PIX']) {
    assert.equal(Promocao.priceFor(91.32, method), 91.32, String(method));
    assert.equal(Promocao.discountFor(91.32, method), 0, String(method));
  }
});

test('only the ten wines are in the promotion', () => {
  assert.equal(Promocao.isPromoWine('vezzani-montepulciano'), true);
  assert.equal(Promocao.isPromoWine('3-autores'), false);
  assert.equal(Promocao.isPromoWine(''), false);
  assert.equal(Promocao.isPromoWine(undefined), false);
});

test('promoDiscount sums the per-bottle discount over the promotional wines only, times the quantity', () => {
  const items = [
    { slug: 'vezzani-montepulciano', price: 91.32, qty: 2 },
    { slug: '3-autores', price: 57.64, qty: 5 },
    { slug: 'lacase-carmenere', price: 49.76, qty: 1 }
  ];
  // PIX: (91,32-63,92)*2 + (49,76-34,83)*1 = 54,80 + 14,93
  assert.equal(Promocao.promoDiscount(items, 'pix'), 69.73);
  // cartão: (91,32-68,49)*2 + (49,76-37,32)*1 = 45,66 + 12,44
  assert.equal(Promocao.promoDiscount(items, 'card'), 58.1);
  assert.equal(Promocao.promoDiscount([{ slug: '3-autores', price: 57.64, qty: 3 }], 'pix'), 0);
  assert.equal(Promocao.promoDiscount([], 'pix'), 0);
  assert.equal(Promocao.promoDiscount(items, 'boleto'), 0);
});

test('promoSubtotal is what the promotional wines cost at the current price', () => {
  const items = [
    { slug: 'vezzani-montepulciano', price: 91.32, qty: 2 },
    { slug: '3-autores', price: 57.64, qty: 5 }
  ];
  assert.equal(Promocao.promoSubtotal(items), 182.64);
});
