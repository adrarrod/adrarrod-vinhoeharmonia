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

test('every wine has required fields, a unique slug, and exactly 3 pairings', () => {
  const seen = new Set();
  for (const wine of Catalog.MENU) {
    for (const field of ['slug', 'name', 'category', 'price', 'country', 'grape', 'image', 'description']) {
      assert.ok(wine[field], `missing ${field} on ${wine.name}`);
    }
    assert.ok(typeof wine.price === 'number' && wine.price > 0);
    // abv não é confirmado para todo vinho na planilha da loja: null é um
    // valor válido, só não pode ser um número fora da faixa plausível.
    assert.ok(wine.abv === null || (typeof wine.abv === 'number' && wine.abv > 0 && wine.abv < 25), `implausible abv on ${wine.name}`);
    assert.ok(Array.isArray(wine.pairings) && wine.pairings.length === 3, `expected 3 pairings on ${wine.name}`);
    // initialStock é só a semente do estoque real (que vive no banco): inteiro >= 0.
    assert.ok(Number.isInteger(wine.initialStock) && wine.initialStock >= 0, `invalid initialStock on ${wine.name}`);
    assert.ok(!seen.has(wine.slug), `duplicate slug ${wine.slug}`);
    seen.add(wine.slug);
  }
});

test('pairingIcon returns an icon for every pairing used in the catalog, and a fallback for unknown categories', () => {
  const usedCategories = new Set();
  for (const wine of Catalog.MENU) {
    for (const p of wine.pairings) usedCategories.add(p);
  }
  for (const category of usedCategories) {
    const icon = Catalog.pairingIcon(category);
    assert.ok(icon && icon.length > 0, `no icon for ${category}`);
  }
  assert.equal(Catalog.pairingIcon('categoria-que-nao-existe'), Catalog.pairingIcon('outra-categoria-inexistente'));
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
  const results = Catalog.searchByName('VEZZANI');
  assert.ok(results.length >= 2);
  assert.ok(results.every((w) => /vezzani/i.test(w.name)));
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

// --- filtros por país e por uva ---

test('COUNTRIES lists each country once, sorted, with the number of wines, and covers the whole catalog', () => {
  const values = Catalog.COUNTRIES.map((c) => c.value);
  assert.equal(new Set(values).size, values.length);
  assert.deepEqual(values, [...values].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  assert.equal(Catalog.COUNTRIES.reduce((sum, c) => sum + c.count, 0), Catalog.MENU.length);
  for (const c of Catalog.COUNTRIES) {
    assert.equal(c.count, Catalog.MENU.filter((w) => w.country === c.value).length, c.value);
  }
});

test('every country in the catalog is a real country (Bridão Merlot is from Tejo, Portugal)', () => {
  // "Imperial" veio de um campo errado da planilha e aparecia como país.
  assert.ok(!Catalog.COUNTRIES.some((c) => c.value === 'Imperial'));
  assert.equal(Catalog.findBySlug('bridao-merlot').country, 'Portugal');
});

test('grapesOf splits blends written with a slash, and returns a single grape as is', () => {
  assert.deepEqual(Catalog.grapesOf({ grape: 'Malbec' }), ['Malbec']);
  assert.deepEqual(Catalog.grapesOf({ grape: 'Pinot Grigio / Riesling' }), ['Pinot Grigio', 'Riesling']);
});

test('GRAPES counts a mixed wine under each of its grapes and never lists a "/" option', () => {
  const values = Catalog.GRAPES.map((g) => g.value);
  assert.equal(new Set(values).size, values.length);
  assert.ok(values.every((v) => !v.includes('/')));
  assert.deepEqual(values, [...values].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  for (const g of Catalog.GRAPES) {
    assert.equal(g.count, Catalog.MENU.filter((w) => Catalog.grapesOf(w).includes(g.value)).length, g.value);
  }
  const grigio = Catalog.GRAPES.find((g) => g.value === 'Pinot Grigio');
  assert.ok(grigio.count >= 2, 'o corte Pinot Grigio / Riesling também conta como Pinot Grigio');
});

test('filterWines with no filters returns the whole catalog', () => {
  assert.equal(Catalog.filterWines().length, Catalog.MENU.length);
  assert.equal(Catalog.filterWines({ query: '', country: '', grape: '' }).length, Catalog.MENU.length);
});

test('filterWines by country returns only that country', () => {
  const chile = Catalog.filterWines({ country: 'Chile' });
  assert.ok(chile.length > 0);
  assert.ok(chile.every((w) => w.country === 'Chile'));
  assert.equal(chile.length, Catalog.COUNTRIES.find((c) => c.value === 'Chile').count);
});

test('filterWines by grape finds single-grape wines and the mixed wine that contains it', () => {
  const riesling = Catalog.filterWines({ grape: 'Riesling' });
  assert.ok(riesling.some((w) => w.grape === 'Riesling'));
  assert.ok(riesling.some((w) => w.grape === 'Pinot Grigio / Riesling'));
  assert.ok(riesling.every((w) => Catalog.grapesOf(w).includes('Riesling')));
});

test('filterWines combines country, grape and name with AND', () => {
  const malbecArgentina = Catalog.filterWines({ country: 'Argentina', grape: 'Malbec' });
  assert.ok(malbecArgentina.length > 0);
  assert.ok(malbecArgentina.every((w) => w.country === 'Argentina' && w.grape === 'Malbec'));

  const byName = Catalog.filterWines({ query: 'VIÑAS', country: 'Argentina', grape: 'Malbec' });
  assert.ok(byName.length > 0 && byName.length < malbecArgentina.length);
  assert.ok(byName.every((w) => /vi[nñ]as/i.test(w.name)));

  assert.deepEqual(Catalog.filterWines({ country: 'Chile', grape: 'Malbec' }), []);
});

test('filterWines ignores a blank or whitespace-only name, like searchByName does', () => {
  assert.equal(Catalog.filterWines({ query: '   ', country: 'Chile' }).length, Catalog.filterWines({ country: 'Chile' }).length);
});

test('every pairing used in the catalog has an icon of its own, not the generic glass', () => {
  const used = new Set();
  for (const wine of Catalog.MENU) wine.pairings.forEach((p) => used.add(p));
  const fallback = Catalog.pairingIcon('categoria-que-nao-existe');
  for (const pairing of used) assert.notEqual(Catalog.pairingIcon(pairing), fallback, `${pairing} is using the generic icon`);
});

test('the five wines added in October 2026 are in the catalog with the data from the spreadsheet', () => {
  const expected = [
    { slug: 'herdade-do-gamito-tinto-cabernet-sauvignon', name: 'Herdade do Gamito tinto CABERNET SAUVIGNON', category: 'Tinto', price: 104.98, country: 'Portugal', grape: 'Cabernet Sauvignon', abv: 13.5, stock: 6, pairings: ['Carnes', 'Pizza', 'Risotos'] },
    { slug: 'relatos-de-valpa-branco-sauvignon-blanc', name: 'Relatos de Valpa branco SAUVIGNON BLANC', category: 'Branco', price: 35.46, country: 'Chile', grape: 'Sauvignon Blanc', abv: 12, stock: 6, pairings: ['Peixes', 'Ceviche', 'Saladas'] },
    { slug: 'porta-6-brut-branco-metodo-charmat', name: 'Porta 6 BRUT branco Método Charmat', category: 'Espumante', price: 61.99, country: 'Portugal', grape: 'Blend', abv: 12, stock: 6, pairings: ['Frutos do Mar', 'Peixes', 'Saladas'] },
    { slug: 'martha-s-porto-rose', name: "Martha's Porto Rosé", category: 'Sobremesa', price: 106.18, country: 'Portugal', grape: 'Blend', abv: 17, stock: 6, pairings: ['Sobremesas', 'Queijos', 'Frutas'] },
    { slug: 'martha-s-porto-tawny', name: "Martha's Porto Tawny", category: 'Sobremesa', price: 85.45, country: 'Portugal', grape: 'Blend', abv: 17, stock: 6, pairings: ['Sobremesas', 'Queijos', 'Frutas'] }
  ];
  for (const e of expected) {
    const wine = Catalog.findBySlug(e.slug);
    assert.ok(wine, `missing ${e.slug}`);
    assert.deepEqual([wine.name, wine.category, wine.price, wine.country, wine.grape, wine.abv, wine.initialStock], [e.name, e.category, e.price, e.country, e.grape, e.abv, e.stock], e.slug);
    assert.deepEqual(wine.pairings, e.pairings, e.slug);
    assert.equal(wine.image, `img/${e.slug}.jpg`);
    assert.ok(wine.description.length > 80, `short description on ${e.slug}`);
  }
});
