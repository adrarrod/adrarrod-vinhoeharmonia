// test/colecoes.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Catalog = require('../js/catalog.js');
const Colecoes = require('../js/colecoes.js');

const IMG_DIR = path.join(__dirname, '..', 'colecoes-img');

// Coleções de exemplo para testar as regras sem depender do que está no ar hoje.
const SAMPLE = [
  { slug: 'verao', title: 'Verão', wines: ['3-autores'], until: '2026-11-01' },
  { slug: 'sempre', title: 'Sempre no ar', wines: ['3-autores'] },
  { slug: 'aviso', title: 'Em breve', teaser: true }
];

test('the Halloween collection is gone from the site', () => {
  assert.equal(Colecoes.COLLECTIONS.find((c) => c.slug === 'halloween'), undefined);
});

test('Black Friday is announced as a notice: title above the banner, no wine list and no link', () => {
  const bf = Colecoes.COLLECTIONS.find((c) => c.slug === 'black-friday');
  assert.ok(bf, 'black-friday notice missing');
  assert.equal(bf.teaser, true);
  assert.equal(bf.title, 'Estamos preparando a Black Friday. Em breve vamos lançar!');
  assert.equal(bf.bannerDesktop, 'colecoes-img/black-friday-desktop.jpg');
  assert.equal(bf.bannerMobile, 'colecoes-img/black-friday-mobile.jpg');
  assert.ok(bf.bannerAlt);
  assert.equal(bf.until, undefined, 'stays up until it is replaced by the real launch');
  assert.equal(bf.wines, undefined);
});

test('every collection has a unique, url-safe slug and its banner texts; wine collections also have intro, button and real wines', () => {
  const seen = new Set();
  for (const c of Colecoes.COLLECTIONS) {
    for (const field of ['slug', 'title', 'bannerAlt', 'bannerDesktop', 'bannerMobile']) {
      assert.ok(c[field], `missing ${field} on ${c.slug}`);
    }
    // o slug é a âncora da URL (index.html#slug): precisa ser seguro
    assert.ok(/^[a-z0-9-]+$/.test(c.slug), `url-unsafe slug ${c.slug}`);
    assert.ok(!seen.has(c.slug), `duplicate slug ${c.slug}`);
    seen.add(c.slug);
    if (c.teaser) continue;
    for (const field of ['intro', 'ctaText']) assert.ok(c[field], `missing ${field} on ${c.slug}`);
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

test('findActive returns a wine collection while active, and undefined once expired, unknown or empty', () => {
  assert.equal(Colecoes.findActive('verao', new Date(2026, 9, 20), SAMPLE).slug, 'verao');
  assert.equal(Colecoes.findActive('verao', new Date(2026, 10, 2), SAMPLE), undefined);
  assert.equal(Colecoes.findActive('sempre', new Date(2030, 0, 1), SAMPLE).slug, 'sempre');
  assert.equal(Colecoes.findActive('nao-existe', new Date(2026, 9, 20), SAMPLE), undefined);
  assert.equal(Colecoes.findActive('', new Date(2026, 9, 20), SAMPLE), undefined);
});

test('a notice (teaser) has no page: its address never opens a collection view', () => {
  assert.equal(Colecoes.findActive('aviso', new Date(2026, 9, 20), SAMPLE), undefined);
  assert.equal(Colecoes.findActive('black-friday', new Date(2026, 10, 2)), undefined);
  assert.equal(Colecoes.findActive('halloween', new Date(2026, 9, 20)), undefined, 'old Halloween links just show the store');
});

test('activeCollections lists, for the given day, the banners to show: notices included, expired ones left out', () => {
  assert.deepEqual(Colecoes.activeCollections(new Date(2026, 9, 20), SAMPLE).map((c) => c.slug), ['verao', 'sempre', 'aviso']);
  assert.deepEqual(Colecoes.activeCollections(new Date(2026, 10, 2), SAMPLE).map((c) => c.slug), ['sempre', 'aviso']);
  assert.deepEqual(Colecoes.activeCollections(new Date(2026, 10, 2)).map((c) => c.slug), ['black-friday']);
});
