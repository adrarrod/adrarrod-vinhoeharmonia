// test/catalog-stock.test.js — vinho sem estoque não aparece na loja
const test = require('node:test');
const assert = require('node:assert/strict');
const Catalog = require('../js/catalog.js');

const A = '3-autores';
const B = 'vezzani-montepulciano';

function slugs(wines) {
  return wines.map((w) => w.slug);
}

test('without a stock map (not loaded yet, or the call failed) the whole catalog is shown', () => {
  assert.equal(Catalog.inStock(null).length, Catalog.MENU.length);
  assert.equal(Catalog.inStock(undefined).length, Catalog.MENU.length);
  assert.equal(Catalog.inStock({}).length, Catalog.MENU.length);
});

test('a wine with zero stock is left out, with one bottle or more it stays', () => {
  const visible = slugs(Catalog.inStock({ [A]: 0, [B]: 1 }));
  assert.ok(!visible.includes(A));
  assert.ok(visible.includes(B));
  assert.equal(visible.length, Catalog.MENU.length - 1);
});

test('when the stock comes back, the wine is shown again', () => {
  assert.ok(!slugs(Catalog.inStock({ [A]: 0 })).includes(A));
  assert.ok(slugs(Catalog.inStock({ [A]: 5 })).includes(A));
});

test('a wine the stock map does not mention, or with a non-numeric value, is not hidden', () => {
  const visible = slugs(Catalog.inStock({ [A]: undefined, [B]: null, 'outro-vinho': 0 }));
  assert.ok(visible.includes(A));
  assert.ok(visible.includes(B));
  assert.equal(visible.length, Catalog.MENU.length);
});

test('a negative number is treated as no stock', () => {
  assert.ok(!slugs(Catalog.inStock({ [A]: -1 })).includes(A));
});

test('inStock keeps the catalog order', () => {
  const all = slugs(Catalog.MENU);
  const visible = slugs(Catalog.inStock({ [A]: 0 }));
  assert.deepEqual(visible, all.filter((s) => s !== A));
});

test('filterWines hides sold-out wines when given the stock map, and finds them again when it is not', () => {
  const name = Catalog.findBySlug(A).name;
  assert.ok(slugs(Catalog.filterWines({ query: name })).includes(A));
  assert.ok(!slugs(Catalog.filterWines({ query: name }, { [A]: 0 })).includes(A));
  assert.ok(slugs(Catalog.filterWines({ query: name }, { [A]: 3 })).includes(A));
});

test('filterWines with no filters and a stock map returns the catalog without the sold-out wines', () => {
  assert.equal(Catalog.filterWines({}, { [A]: 0, [B]: 0 }).length, Catalog.MENU.length - 2);
});

test('facets without a stock map are the same options the filters always had', () => {
  assert.deepEqual(Catalog.facets(null).countries, Catalog.COUNTRIES);
  assert.deepEqual(Catalog.facets(null).grapes, Catalog.GRAPES);
});

test('facet counts ignore sold-out wines, and an option with no wine left disappears', () => {
  const wine = Catalog.findBySlug(A);
  const sameCountry = Catalog.MENU.filter((w) => w.country === wine.country);
  const before = Catalog.COUNTRIES.find((c) => c.value === wine.country).count;
  assert.equal(before, sameCountry.length);

  const after = Catalog.facets({ [A]: 0 }).countries.find((c) => c.value === wine.country);
  assert.equal(after ? after.count : 0, before - 1);

  // zera todos os vinhos de um país: a opção some do filtro
  const stock = {};
  for (const w of sameCountry) stock[w.slug] = 0;
  assert.equal(Catalog.facets(stock).countries.find((c) => c.value === wine.country), undefined);
});

test('facets for grapes count a blend under each of its grapes, using only the wines in stock', () => {
  const blend = Catalog.MENU.find((w) => Catalog.grapesOf(w).length > 1);
  assert.ok(blend, 'there is a blend in the catalog');
  const stock = { [blend.slug]: 0 };
  const total = (grapes, g) => (grapes.find((x) => x.value === g) || { count: 0 }).count;
  for (const grape of Catalog.grapesOf(blend)) {
    assert.equal(total(Catalog.facets(stock).grapes, grape), total(Catalog.GRAPES, grape) - 1, grape);
  }
});
