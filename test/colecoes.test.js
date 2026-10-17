// test/colecoes.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Catalog = require('../js/catalog.js');
const Colecoes = require('../js/colecoes.js');

const IMG_DIR = path.join(__dirname, '..', 'colecoes-img');

test('Halloween suggests the six wines chosen by the shop, in that order', () => {
  const halloween = Colecoes.COLLECTIONS.find((c) => c.slug === 'halloween');
  assert.ok(halloween);
  assert.deepEqual(halloween.wines, [
    'baron-philippe-de-rothschild-reserva-especial-merlot',
    'ca-montebello-barbera',
    'gretus-tempranillo',
    'single-vineyard-pinot-noir',
    'pescada-blend-verde',
    'mon-bouquet-de-provence'
  ]);
});

test('every collection has its texts, unique slug, and only wines that exist in the catalog', () => {
  const seen = new Set();
  for (const c of Colecoes.COLLECTIONS) {
    for (const field of ['slug', 'title', 'intro', 'bannerAlt', 'bannerDesktop', 'bannerMobile', 'ctaText']) {
      assert.ok(c[field], `missing ${field} on ${c.slug}`);
    }
    // o slug é a âncora da URL (index.html#slug): precisa ser seguro
    assert.ok(/^[a-z0-9-]+$/.test(c.slug), `url-unsafe slug ${c.slug}`);
    assert.ok(!seen.has(c.slug), `duplicate slug ${c.slug}`);
    seen.add(c.slug);
    assert.ok(Array.isArray(c.wines) && c.wines.length > 0, `no wines on ${c.slug}`);
    assert.equal(new Set(c.wines).size, c.wines.length, `repeated wine on ${c.slug}`);
    for (const slug of c.wines) assert.ok(Catalog.findBySlug(slug), `${c.slug}: wine not in catalog: ${slug}`);
  }
});

test('collection slugs never collide with the ids the home already uses', () => {
  // index.html#catalog, #harmonizacoes, #sobre... já são âncoras da página.
  const taken = ['catalog', 'harmonizacoes', 'sobre', 'tabs', 'search-results', 'colecao-view', 'colecao-banners'];
  for (const c of Colecoes.COLLECTIONS) assert.ok(!taken.includes(c.slug), c.slug);
});

test('every banner image exists in colecoes-img/ and nothing else is left there', () => {
  // Compara contra a listagem do diretório (não fs.existsSync) para pegar
  // diferença de maiúscula/minúscula, que quebraria no Linux da Vercel.
  const files = fs.readdirSync(IMG_DIR);
  const expected = new Set();
  for (const c of Colecoes.COLLECTIONS) {
    for (const image of [c.bannerDesktop, c.bannerMobile]) {
      expected.add(path.basename(image));
      assert.ok(files.includes(path.basename(image)), `missing banner for ${c.slug}: ${image}`);
    }
  }
  for (const file of files) assert.ok(expected.has(file), `unexpected file in colecoes-img/: ${file}`);
});

test('todayISO uses the local calendar date, zero-padded', () => {
  assert.equal(Colecoes.todayISO(new Date(2026, 9, 5, 23, 59)), '2026-10-05');
  assert.equal(Colecoes.todayISO(new Date(2026, 10, 1, 0, 0)), '2026-11-01');
});

test('a collection with "until" is active up to the day before it, and expires on that day', () => {
  const c = { slug: 'x', until: '2026-11-01' };
  assert.equal(Colecoes.isActive(c, new Date(2026, 9, 16)), true);
  assert.equal(Colecoes.isActive(c, new Date(2026, 9, 31, 23, 59)), true);
  assert.equal(Colecoes.isActive(c, new Date(2026, 10, 1, 0, 0)), false);
  assert.equal(Colecoes.isActive(c, new Date(2027, 0, 1)), false);
});

test('a collection without "until" is always active', () => {
  assert.equal(Colecoes.isActive({ slug: 'y' }, new Date(2030, 0, 1)), true);
});

test('findActive returns the collection while active and undefined once expired or unknown', () => {
  assert.equal(Colecoes.findActive('halloween', new Date(2026, 9, 20)).slug, 'halloween');
  assert.equal(Colecoes.findActive('halloween', new Date(2026, 10, 2)), undefined);
  assert.equal(Colecoes.findActive('nao-existe', new Date(2026, 9, 20)), undefined);
  assert.equal(Colecoes.findActive('', new Date(2026, 9, 20)), undefined);
});

test('activeCollections lists only what is active on the given day', () => {
  assert.deepEqual(Colecoes.activeCollections(new Date(2026, 9, 20)).map((c) => c.slug), ['halloween']);
  assert.deepEqual(Colecoes.activeCollections(new Date(2026, 10, 2)), []);
});
