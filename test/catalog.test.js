// test/catalog.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Catalog = require('../js/catalog.js');

const KNOWN_CATEGORIES = ['Tinto', 'Branco', 'Rosé', 'Espumante', 'Sobremesa'];

test('MENU has the full catalog, every wine in a known category', () => {
  assert.equal(Catalog.MENU.length, 121);
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

test('searchByName matches case-insensitively', () => {
  const results = Catalog.searchByName('CORAGEM');
  assert.ok(results.length >= 2);
  assert.ok(results.every((w) => /coragem/i.test(w.name)));
});

test('searchByName matches ignoring accents, in both directions', () => {
  // "torrontes" (sem acento) precisa achar "Bodega Torrontés" (com acento)
  const withoutAccent = Catalog.searchByName('torrontes');
  assert.ok(withoutAccent.some((w) => w.slug === 'bodega-torrontes'));

  // "château" (com acento) precisa achar "Château Bel Enclos"
  const withAccent = Catalog.searchByName('château');
  assert.ok(withAccent.some((w) => w.slug === 'chateau-bel-enclos'));
});

test('searchByName matches a substring anywhere in the name, not just the start', () => {
  const results = Catalog.searchByName('malbec');
  assert.ok(results.some((w) => w.slug === 'cavic-malbec'));
});

test('searchByName returns an empty array for no matches or an empty/blank query', () => {
  assert.deepEqual(Catalog.searchByName('xyz-nao-existe'), []);
  assert.deepEqual(Catalog.searchByName(''), []);
  assert.deepEqual(Catalog.searchByName('   '), []);
});

test('CATEGORIES lists each distinct category once, in order of first appearance', () => {
  const expected = [];
  for (const wine of Catalog.MENU) {
    if (!expected.includes(wine.category)) expected.push(wine.category);
  }
  assert.deepEqual(Catalog.CATEGORIES, expected);
  assert.equal(new Set(Catalog.CATEGORIES).size, Catalog.CATEGORIES.length);
});
