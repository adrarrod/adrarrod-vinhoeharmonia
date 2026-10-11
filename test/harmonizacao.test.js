// test/harmonizacao.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Hz = require('../js/harmonizacao.js');

const IMG_DIR = path.join(__dirname, '..', 'harmonizacao-img');

test('Harmonizações lists the five dishes, in the order shown on the home', () => {
  assert.deepEqual(
    Hz.TYPES.map((t) => t.slug),
    ['pizza', 'carnes-vermelhas', 'carnes-brancas', 'peixes', 'massas']
  );
});

test('every type has all its fields, within the size the card and the page can hold', () => {
  const seen = new Set();
  for (const type of Hz.TYPES) {
    for (const field of ['slug', 'title', 'cardText', 'intro', 'image', 'imageAlt']) {
      assert.ok(type[field], `missing ${field} on ${type.slug}`);
    }
    assert.ok(/^[a-z0-9-]+$/.test(type.slug), `slug is also the page anchor, keep it url-safe: ${type.slug}`);
    assert.ok(!seen.has(type.slug), `duplicate slug ${type.slug}`);
    seen.add(type.slug);
    assert.ok(type.cardText.length <= 180, `cardText too long on ${type.slug} (${type.cardText.length})`);
    assert.ok(type.intro.length <= 600, `intro too long on ${type.slug} (${type.intro.length})`);
    assert.ok(Array.isArray(type.tips) && type.tips.length >= 3 && type.tips.length <= 4, `3-4 tips expected on ${type.slug}`);
    assert.ok(Array.isArray(type.grapes) && type.grapes.length >= 4, `grapes missing on ${type.slug}`);
    for (const line of [...type.tips, ...type.grapes]) assert.ok(line && line.trim(), `empty tip/grape on ${type.slug}`);
  }
});

test('every type links to its own section of the explanation page', () => {
  for (const type of Hz.TYPES) {
    assert.equal(Hz.pageUrl(type), `harmonizacao.html#${type.slug}`);
  }
});

test('every image exists in harmonizacao-img/ and nothing else is left there', () => {
  // Compara contra a listagem do diretório (não fs.existsSync) para pegar
  // diferença de maiúscula/minúscula, que quebraria no Linux da Vercel.
  const files = fs.readdirSync(IMG_DIR);
  const expected = new Set(Hz.TYPES.map((t) => path.basename(t.image)));
  for (const type of Hz.TYPES) {
    assert.ok(files.includes(path.basename(type.image)), `missing image for ${type.slug}: ${type.image}`);
  }
  for (const file of files) {
    assert.ok(expected.has(file), `unexpected file in harmonizacao-img/: ${file}`);
  }
});
