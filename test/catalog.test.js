// test/catalog.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Catalog = require('../js/catalog.js');

const KNOWN_CATEGORIES = ['Tinto', 'Branco', 'Rosé', 'Espumante', 'Sobremesa'];

test('MENU has the full catalog, every wine in a known category', () => {
  assert.equal(Catalog.MENU.length, 119);
  for (const wine of Catalog.MENU) {
    assert.ok(KNOWN_CATEGORIES.includes(wine.category), `unexpected category ${wine.category} on ${wine.name}`);
  }
});

test('every wine has required fields and a unique slug', () => {
  const seen = new Set();
  for (const wine of Catalog.MENU) {
    for (const field of ['slug', 'name', 'category', 'price', 'country', 'grape', 'image', 'description']) {
      assert.ok(wine[field], `missing ${field} on ${wine.name}`);
    }
    assert.ok(typeof wine.price === 'number' && wine.price > 0);
    assert.ok(!seen.has(wine.slug), `duplicate slug ${wine.slug}`);
    seen.add(wine.slug);
  }
});

test('findBySlug returns the matching wine or undefined', () => {
  const first = Catalog.MENU[0];
  assert.equal(Catalog.findBySlug(first.slug).name, first.name);
  assert.equal(Catalog.findBySlug('nao-existe'), undefined);
});

test('suggestPairings excludes the wine itself and respects count', () => {
  const target = Catalog.findBySlug('coragem-reserva');
  const suggestions = Catalog.suggestPairings('coragem-reserva', 2);
  assert.equal(suggestions.length, 2);
  assert.ok(suggestions.every((w) => w.slug !== 'coragem-reserva'));
});

test('suggestPairings prefers same country or grape when available', () => {
  const suggestions = Catalog.suggestPairings('chateau-bel-enclos', 3);
  assert.ok(suggestions.some((w) => w.country === 'França' || w.grape === 'Blend'));
});

test('CATEGORIES lists each distinct category once, in order of first appearance', () => {
  const expected = [];
  for (const wine of Catalog.MENU) {
    if (!expected.includes(wine.category)) expected.push(wine.category);
  }
  assert.deepEqual(Catalog.CATEGORIES, expected);
  assert.equal(new Set(Catalog.CATEGORIES).size, Catalog.CATEGORIES.length);
});
