// test/blog.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Blog = require('../js/blog.js');

const IMG_DIR = path.join(__dirname, '..', 'blog-img');

test('Mini Blog starts with the three planned themes, in order', () => {
  assert.deepEqual(
    Blog.POSTS.map((p) => p.slug),
    ['vinhos-do-brasil', 'harmonizacao-com-carnes', 'vinhos-de-portugal']
  );
});

test('every post has the required fields, a unique slug and a short text', () => {
  const seen = new Set();
  for (const post of Blog.POSTS) {
    for (const field of ['slug', 'tag', 'title', 'summary', 'image', 'imageAlt']) {
      assert.ok(post[field], `missing ${field} on ${post.slug}`);
    }
    assert.ok(!seen.has(post.slug), `duplicate slug ${post.slug}`);
    seen.add(post.slug);
    // "texto curto": cabe num card sem virar artigo
    assert.ok(post.summary.length <= 600, `summary too long on ${post.slug} (${post.summary.length})`);
  }
});

test('every post image exists in blog-img/ and nothing else is left there', () => {
  // Compara contra a listagem do diretório (não fs.existsSync) para pegar
  // diferença de maiúscula/minúscula, que quebraria no Linux da Vercel.
  const files = fs.readdirSync(IMG_DIR);
  const expected = new Set(Blog.POSTS.map((p) => path.basename(p.image)));
  for (const post of Blog.POSTS) {
    assert.ok(files.includes(path.basename(post.image)), `missing image for ${post.slug}: ${post.image}`);
  }
  for (const file of files) {
    assert.ok(expected.has(file), `unexpected file in blog-img/: ${file}`);
  }
});
