// test/assets.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Catalog = require('../js/catalog.js');

test('every catalog image path exists on disk', () => {
  // Compara contra a listagem do diretório em vez de fs.existsSync: o filesystem
  // do Windows é case-insensitive, mas Array#includes não é — assim o teste pega
  // divergências de maiúscula/minúscula que quebrariam o deploy no Linux.
  const files = fs.readdirSync(path.join(__dirname, '..', 'img'));
  for (const wine of Catalog.MENU) {
    const basename = path.basename(wine.image);
    assert.ok(files.includes(basename), `missing image for ${wine.name}: ${wine.image}`);
  }
});

test('no stray source photos left behind in img/', () => {
  const files = fs.readdirSync(path.join(__dirname, '..', 'img'));
  const expected = new Set(Catalog.MENU.map((w) => path.basename(w.image)));
  for (const file of files) {
    assert.ok(expected.has(file), `unexpected file in img/: ${file}`);
  }
});

test('PWA icons exist', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'icons', 'icon-192.png')));
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'icons', 'icon-512.png')));
});
