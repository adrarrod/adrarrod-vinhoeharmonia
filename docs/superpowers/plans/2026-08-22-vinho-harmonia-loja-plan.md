# Vinho & Harmonia — Loja Online Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Vinho & Harmonia online store — a no-framework HTML/CSS/JS storefront backed by minimal Vercel Serverless Functions and Postgres, covering catalog, cart, checkout, PIX/Mercado Pago payment, Melhor Envio freight (with a working fallback), order storage, and a password-protected admin order panel.

**Architecture:** Static frontend (`index.html`, `admin.html`, no bundler) calls a handful of Vercel Node serverless functions under `/api`. Business logic (pricing, validation, freight, payment) lives in small dependency-injected modules under `/lib` so it can be unit-tested with `node:test` without a real database or network access; thin `/api/*.js` files wire those modules to real Postgres/fetch and are exercised manually through a local dev server. Catalog and pricing rules are shared, dependency-free modules loaded both by the browser (`<script>` tag) and by tests (`require`).

**Tech Stack:** Vanilla HTML/CSS/JS (frontend), Node.js 24 Vercel Serverless Functions (CommonJS), `@vercel/postgres`, built-in `node:test` + `node:assert/strict`, Node global `fetch` for Mercado Pago/Melhor Envio HTTP calls (no extra HTTP client dependency), Python 3 + Pillow for one-off image/icon optimization (build-time only, not a runtime dependency).

## Global Constraints

- Frontend must work with **no build step** — every `<script src>` in `index.html`/`admin.html` must be plain JS runnable directly by a browser.
- Every module under `/lib` and `/js` that contains logic (not DOM/HTTP wiring) must be dependency-injected so it is testable without a live database, Mercado Pago, or Melhor Envio.
- Free shipping threshold is **R$150** everywhere it's referenced (progress bar, fallback freight, real Melhor Envio override).
- Coupon `PRIMEIRA10` = 10% off subtotal. This is the only coupon in v1.
- PIX key is `contato@vinhoharmonia.com.br` (confirmed by user).
- No WhatsApp anywhere in the flow — confirmation is on-screen; store owner uses `/admin`.
- Age gate: 18+ modal on entry, and `birthDate` in checkout must compute to 18+ or the order is rejected.
- The system must run end-to-end with **no Mercado Pago / Melhor Envio credentials configured** (fallback freight, PIX-only payment) — this is the default state until the user adds real tokens later.
- Checkout bottom sheet CSS must follow the spec's critical layout rule exactly:
  ```css
  .sh-body { flex: 0 1 auto; min-height: 0; overflow-y: auto; max-height: 34vh; }
  .sh-foot { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
  .sh-foot .btn-enviar { position: sticky; bottom: 0; }
  ```
- Catalog source of truth for this v1 is the 20 wines from `Planilha_Produto.xlsx` (all category "Tinto"), matched to files in `/img`.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `test/helpers/noop.test.js`

**Interfaces:**
- Produces: `npm test` command that runs all `test/**/*.test.js` via `node:test`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "vinho-harmonia-loja",
  "version": "1.0.0",
  "private": true,
  "description": "Loja online da Vinho & Harmonia",
  "scripts": {
    "test": "node --test test/"
  },
  "dependencies": {
    "@vercel/postgres": "^0.10.0"
  }
}
```

- [ ] **Step 2: Create `.env.example`**

```
POSTGRES_URL=
MP_ACCESS_TOKEN=
MELHOR_ENVIO_TOKEN=
MELHOR_ENVIO_CEP_ORIGEM=
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
SITE_URL=https://vinhoeharmonia.vercel.app
# PIX_KEY is documentation only, not read by any code: index.html is a static
# file with no server-side templating, so the PIX key is hardcoded directly in
# js/store.js (see Task 16). Update it in both places if it ever changes.
# PIX_KEY=contato@vinhoharmonia.com.br
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
.env
.env.local
.vercel/
```

- [ ] **Step 4: Create a placeholder test so `npm test` has something to run**

```js
// test/helpers/noop.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

test('project scaffold is wired', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: creates `node_modules/` and `package-lock.json`, exits 0.

- [ ] **Step 6: Run the test suite**

Run: `npm test`
Expected: `# pass 1`, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .env.example .gitignore test/helpers/noop.test.js
git commit -m "chore: scaffold project and test runner"
```

---

## Task 2: Catalog data module

**Files:**
- Create: `js/catalog.js`
- Test: `test/catalog.test.js`

**Interfaces:**
- Produces: `Catalog.MENU` (array of 20 wine objects), `Catalog.findBySlug(slug)`, `Catalog.suggestPairings(slug, count)`, `Catalog.CATEGORIES` (array of category names present in `MENU`). Exposed as `module.exports` in Node and `window.Catalog` in the browser.
- Each wine object shape: `{ slug, name, category, price, country, grape, image, description }`.

- [ ] **Step 1: Write the failing test**

```js
// test/catalog.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Catalog = require('../js/catalog.js');

test('MENU has 20 wines, all category Tinto', () => {
  assert.equal(Catalog.MENU.length, 20);
  for (const wine of Catalog.MENU) {
    assert.equal(wine.category, 'Tinto');
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

test('CATEGORIES lists each distinct category once', () => {
  assert.deepEqual(Catalog.CATEGORIES, ['Tinto']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/catalog.js'`.

- [ ] **Step 3: Write the catalog module**

```js
// js/catalog.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Catalog = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const MENU = [
    { slug: 'coragem-reserva', name: 'Coragem Reserva', category: 'Tinto', price: 74.25, country: 'Portugal', grape: 'Blend', image: 'img/coragem-reserva.jpg', description: 'Blend português encorpado, taninos macios e final persistente.' },
    { slug: 'chianti-rifugio-del-vescovo', name: 'Chianti Rifugio Del Vescovo', category: 'Tinto', price: 86.65, country: 'Itália', grape: 'Sangiovese', image: 'img/chianti-rifugio-del-vescovo.jpg', description: 'Sangiovese clássico da Toscana, acidez viva e notas de cereja.' },
    { slug: 'sierra-batuco-reserva-cabernet-sauvignon', name: 'Sierra Batuco Reserva Cabernet Sauvignon', category: 'Tinto', price: 42.87, country: 'Chile', grape: 'Cabernet Sauvignon', image: 'img/sierra-batuco-reserva-cabernet-sauvignon.jpg', description: 'Cabernet chileno estruturado, com notas de frutas negras e especiarias.' },
    { slug: 'sierra-batuco-reserva-pinot-noir', name: 'Sierra Batuco Reserva Pinot Noir', category: 'Tinto', price: 42.87, country: 'Chile', grape: 'Pinot Noir', image: 'img/sierra-batuco-reserva-pinot-noir.jpg', description: 'Pinot Noir leve e aromático, ótimo com pratos delicados.' },
    { slug: 'sutter-home', name: 'Sutter Home', category: 'Tinto', price: 89.09, country: 'EUA', grape: 'Cabernet Sauvignon', image: 'img/sutter-home.jpg', description: 'Cabernet californiano macio, fácil de beber, frutado.' },
    { slug: 'porta-6', name: 'Porta 6', category: 'Tinto', price: 57.1, country: 'Portugal', grape: 'Blend', image: 'img/porta-6.jpg', description: 'Blend português vibrante, um dos mais queridos do Brasil.' },
    { slug: 'stormhoek-pinotage', name: 'Stormhoek Pinotage', category: 'Tinto', price: 60.86, country: 'África do Sul', grape: 'Pinotage', image: 'img/stormhoek-pinotage.jpg', description: 'Pinotage sul-africano defumado, com toque de frutas vermelhas maduras.' },
    { slug: 'mythic-cellars-mountain-petit-verdot', name: 'Mythic Cellars - Mountain - Petit Verdot', category: 'Tinto', price: 93.17, country: 'Argentina', grape: 'Petit Verdot', image: 'img/mythic-cellars-mountain-petit-verdot.jpg', description: 'Petit Verdot argentino intenso, taninos firmes e boa guarda.' },
    { slug: 'chateau-bel-enclos', name: 'Château Bel Enclos', category: 'Tinto', price: 59.63, country: 'França', grape: 'Blend', image: 'img/chateau-bel-enclos.jpg', description: 'Bordeaux clássico, elegante e equilibrado.' },
    { slug: 'chateau-jamin-bourdeaux', name: 'Château Jamin Bourdeaux', category: 'Tinto', price: 58.74, country: 'França', grape: 'Blend', image: 'img/chateau-jamin-bourdeaux.jpg', description: 'Bordeaux acessível, macio e frutado.' },
    { slug: 'ca-montebello-barbera', name: 'Cà Montebello BARBERA', category: 'Tinto', price: 87.03, country: 'Itália', grape: 'Barbera', image: 'img/ca-montebello-barbera.jpg', description: 'Barbera italiana de acidez marcante, ótima com massas.' },
    { slug: 'intimista', name: 'Intimista', category: 'Tinto', price: 39.27, country: 'Portugal', grape: 'Blend', image: 'img/intimista.jpg', description: 'Blend português leve e frutado, para o dia a dia.' },
    { slug: 'lomas-del-marques-tempranillo', name: 'Lomas Del Marques Tempranillo', category: 'Tinto', price: 51.37, country: 'Espanhas', grape: 'Tempranillo', image: 'img/lomas-del-marques-tempranillo.jpg', description: 'Tempranillo espanhol redondo, com notas de baunilha.' },
    { slug: 'montana-de-chile-classic-merlot', name: 'Montaña De Chile Classic Merlot', category: 'Tinto', price: 44.1, country: 'Chile', grape: 'Merlot', image: 'img/montana-de-chile-classic-merlot.jpg', description: 'Merlot chileno macio e frutado, fácil de harmonizar.' },
    { slug: 'mr-rabbit-tinto-cabernet-sauvignon', name: "Mr. Rabbit Tinto Pays D'OC IGP Cabernet Sauvignon", category: 'Tinto', price: 69.02, country: 'França', grape: 'Cabernet Sauvignon', image: 'img/mr-rabbit-tinto-cabernet-sauvignon.jpg', description: 'Cabernet francês moderno e frutado, rótulo divertido.' },
    { slug: 'rosso-toscana-igt-rifugio-del-vescovo', name: 'Rosso Toscana Igt Rifugio Del Vescovo', category: 'Tinto', price: 95.65, country: 'Itália', grape: 'Blend', image: 'img/rosso-toscana-igt-rifugio-del-vescovo.jpg', description: 'Blend toscano encorpado, ótimo com carnes vermelhas.' },
    { slug: 'miolo-single-vineyard-cabernet-franc', name: 'Miolo Single Vineyard Cabernet Franc', category: 'Tinto', price: 77.43, country: 'Brasil', grape: 'Cabernet Franc', image: 'img/miolo-single-vineyard-cabernet-franc.jpg', description: 'Cabernet Franc brasileiro de vinhedo único, herbáceo e elegante.' },
    { slug: 'namaqua-merlot', name: 'Namaqua - Merlot', category: 'Tinto', price: 61.79, country: 'África do Sul', grape: 'Merlot', image: 'img/namaqua-merlot.jpg', description: 'Merlot sul-africano macio, frutas vermelhas maduras.' },
    { slug: 'single-vineyard-pinot-noir', name: 'SINGLE VINEYARD Pinot Noir', category: 'Tinto', price: 67.17, country: 'Brasil', grape: 'Pinot Noir', image: 'img/single-vineyard-pinot-noir.jpg', description: 'Pinot Noir brasileiro de vinhedo único, leve e aromático.' },
    { slug: 'vezzani-nero-di-troia', name: 'Vezzani Nero di Troia', category: 'Tinto', price: 91.71, country: 'Itália', grape: 'Nero Di Troia', image: 'img/vezzani-nero-di-troia.jpg', description: 'Nero di Troia apuliano rústico, taninos presentes e boa acidez.' }
  ];

  const CATEGORIES = [...new Set(MENU.map((w) => w.category))];

  function findBySlug(slug) {
    return MENU.find((w) => w.slug === slug);
  }

  function suggestPairings(slug, count) {
    const target = findBySlug(slug);
    if (!target) return [];
    const others = MENU.filter((w) => w.slug !== slug);
    const scored = others.map((w) => {
      let score = 0;
      if (w.country === target.country) score += 2;
      if (w.grape === target.grape) score += 1;
      return { wine: w, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, count).map((s) => s.wine);
  }

  return { MENU, CATEGORIES, findBySlug, suggestPairings };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all `catalog.test.js` assertions pass, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add js/catalog.js test/catalog.test.js
git commit -m "feat: add wine catalog data module"
```

---

## Task 3: Pricing module

**Files:**
- Create: `js/pricing.js`
- Test: `test/pricing.test.js`

**Interfaces:**
- Consumes: nothing (pure functions).
- Produces: `Pricing.FREE_SHIPPING_THRESHOLD` (150), `Pricing.calcSubtotal(items)`, `Pricing.applyCoupon(subtotal, code)`, `Pricing.freeShippingProgress(subtotal)`, `Pricing.fallbackFreight(subtotal)`, `Pricing.computeTotals(items, couponCode, freightCost)`. Exposed as `module.exports` in Node and `window.Pricing` in the browser.
- `items` shape used throughout: `[{ price: number, qty: number }]`.

- [ ] **Step 1: Write the failing test**

```js
// test/pricing.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Pricing = require('../js/pricing.js');

test('calcSubtotal sums price * qty', () => {
  const items = [{ price: 10, qty: 2 }, { price: 5, qty: 3 }];
  assert.equal(Pricing.calcSubtotal(items), 35);
});

test('calcSubtotal returns 0 for empty cart', () => {
  assert.equal(Pricing.calcSubtotal([]), 0);
});

test('applyCoupon PRIMEIRA10 gives 10% off', () => {
  const result = Pricing.applyCoupon(100, 'PRIMEIRA10');
  assert.equal(result.valid, true);
  assert.equal(result.discount, 10);
});

test('applyCoupon is case-insensitive and trims whitespace', () => {
  const result = Pricing.applyCoupon(100, '  primeira10  ');
  assert.equal(result.valid, true);
  assert.equal(result.discount, 10);
});

test('applyCoupon rejects unknown codes with zero discount', () => {
  const result = Pricing.applyCoupon(100, 'NAOEXISTE');
  assert.equal(result.valid, false);
  assert.equal(result.discount, 0);
});

test('applyCoupon treats empty/null code as no coupon, not an error', () => {
  assert.deepEqual(Pricing.applyCoupon(100, ''), { valid: false, discount: 0, code: null });
  assert.deepEqual(Pricing.applyCoupon(100, null), { valid: false, discount: 0, code: null });
});

test('freeShippingProgress below threshold reports remaining amount', () => {
  const progress = Pricing.freeShippingProgress(100);
  assert.equal(progress.qualifies, false);
  assert.equal(progress.remaining, 50);
  assert.ok(Math.abs(progress.percent - (100 / 150) * 100) < 0.001);
});

test('freeShippingProgress at or above threshold qualifies with 100 percent', () => {
  const progress = Pricing.freeShippingProgress(150);
  assert.equal(progress.qualifies, true);
  assert.equal(progress.remaining, 0);
  assert.equal(progress.percent, 100);

  const progressAbove = Pricing.freeShippingProgress(200);
  assert.equal(progressAbove.qualifies, true);
  assert.equal(progressAbove.remaining, 0);
});

test('fallbackFreight is free at/above 150, flat R$15 below', () => {
  assert.deepEqual(Pricing.fallbackFreight(200), { cost: 0, free: true });
  assert.deepEqual(Pricing.fallbackFreight(150), { cost: 0, free: true });
  assert.deepEqual(Pricing.fallbackFreight(100), { cost: 15, free: false });
});

test('computeTotals combines subtotal, discount and freight', () => {
  const items = [{ price: 50, qty: 2 }]; // subtotal 100
  const totals = Pricing.computeTotals(items, 'PRIMEIRA10', 15);
  assert.equal(totals.subtotal, 100);
  assert.equal(totals.discount, 10);
  assert.equal(totals.freight, 15);
  assert.equal(totals.total, 105);
});

test('computeTotals never lets total go negative', () => {
  const items = [{ price: 1, qty: 1 }];
  const totals = Pricing.computeTotals(items, 'PRIMEIRA10', 0);
  assert.ok(totals.total >= 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/pricing.js'`.

- [ ] **Step 3: Write the pricing module**

```js
// js/pricing.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Pricing = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const FREE_SHIPPING_THRESHOLD = 150;
  const FALLBACK_FLAT_FEE = 15;
  const COUPONS = { PRIMEIRA10: 0.1 };

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function calcSubtotal(items) {
    return round2(items.reduce((sum, item) => sum + item.price * item.qty, 0));
  }

  function applyCoupon(subtotal, code) {
    const trimmed = (code || '').trim().toUpperCase();
    if (!trimmed) return { valid: false, discount: 0, code: null };
    const rate = COUPONS[trimmed];
    if (!rate) return { valid: false, discount: 0, code: trimmed };
    return { valid: true, discount: round2(subtotal * rate), code: trimmed };
  }

  function freeShippingProgress(subtotal, threshold = FREE_SHIPPING_THRESHOLD) {
    const qualifies = subtotal >= threshold;
    return {
      qualifies,
      remaining: qualifies ? 0 : round2(threshold - subtotal),
      percent: qualifies ? 100 : round2((subtotal / threshold) * 100)
    };
  }

  function fallbackFreight(subtotal, threshold = FREE_SHIPPING_THRESHOLD, flatFee = FALLBACK_FLAT_FEE) {
    if (subtotal >= threshold) return { cost: 0, free: true };
    return { cost: flatFee, free: false };
  }

  function computeTotals(items, couponCode, freightCost) {
    const subtotal = calcSubtotal(items);
    const coupon = applyCoupon(subtotal, couponCode);
    const freight = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : freightCost;
    const total = Math.max(0, round2(subtotal - coupon.discount + freight));
    return { subtotal, discount: coupon.discount, couponCode: coupon.valid ? coupon.code : null, freight, total };
  }

  return {
    FREE_SHIPPING_THRESHOLD,
    FALLBACK_FLAT_FEE,
    calcSubtotal,
    applyCoupon,
    freeShippingProgress,
    fallbackFreight,
    computeTotals
  };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all `pricing.test.js` assertions pass.

- [ ] **Step 5: Commit**

```bash
git add js/pricing.js test/pricing.test.js
git commit -m "feat: add pricing, coupon and freight-fallback logic"
```

---

## Task 4: Image and icon optimization

**Files:**
- Create: `scripts/optimize_images.py`
- Create: `img/*.jpg` (20 optimized, slug-named files — overwrites the raw originals with web-ready versions)
- Create: `icons/icon-192.png`, `icons/icon-512.png`
- Test: `test/assets.test.js`

**Interfaces:**
- Produces: files at the exact paths referenced by `Catalog.MENU[*].image` (Task 2) and by `manifest.json` (Task 18).

- [ ] **Step 1: Write the optimization script**

```python
# scripts/optimize_images.py
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
IMG_DIR = ROOT / "img"
ICONS_DIR = ROOT / "icons"
MAX_WIDTH = 900
JPEG_QUALITY = 82

# slug -> original filename in img/ (see docs/superpowers/specs/2026-08-21-vinho-harmonia-loja-design.md
# "Catálogo" section for how these were matched to Planilha_Produto.xlsx)
SOURCE_MAP = {
    "coragem-reserva": "CoragemReserva.jpg",
    "chianti-rifugio-del-vescovo": "Chianti.jpg",
    "sierra-batuco-reserva-cabernet-sauvignon": "Sierra Batuco Cabernet Sauvignon.jpg",
    "sierra-batuco-reserva-pinot-noir": "Sierra Batuco Reserva Pinot Noir.jpg",
    "sutter-home": "Sutter Home.jpg",
    "porta-6": "Porta6.jpg",
    "stormhoek-pinotage": "Stormhoek.jpg",
    "mythic-cellars-mountain-petit-verdot": "Mythic.jpg",
    "chateau-bel-enclos": "Château Bel Enclos.jpg",
    "chateau-jamin-bourdeaux": "CHÂTEAU JAMIN.jpg",
    "ca-montebello-barbera": "CaBarbera.jpg",
    "intimista": "Intimista.jpg",
    "lomas-del-marques-tempranillo": "Lomas Del Marques Tempranillo.jpg",
    "montana-de-chile-classic-merlot": "Montaña Merlot.jpg",
    "mr-rabbit-tinto-cabernet-sauvignon": "Mr. Rabbit Tinto Pays D’OC IGP Cabernet Sauvignon.jpg",
    "rosso-toscana-igt-rifugio-del-vescovo": "VESCOVO ROSSO.jpg",
    "miolo-single-vineyard-cabernet-franc": "Miolo Single Vineyard Cabernet Franc.jpg",
    "namaqua-merlot": "Namaqua.jpg",
    "single-vineyard-pinot-noir": "MioloPinotNoir.jpg",
    "vezzani-nero-di-troia": "NerodiTroia.jpg",
}


def optimize_photos():
    tmp_dir = IMG_DIR / "_optimized"
    tmp_dir.mkdir(exist_ok=True)
    for slug, filename in SOURCE_MAP.items():
        src = IMG_DIR / filename
        if not src.exists():
            raise FileNotFoundError(f"missing source photo for {slug}: {src}")
        img = Image.open(src).convert("RGB")
        if img.width > MAX_WIDTH:
            ratio = MAX_WIDTH / img.width
            img = img.resize((MAX_WIDTH, int(img.height * ratio)), Image.LANCZOS)
        out_path = tmp_dir / f"{slug}.jpg"
        img.save(out_path, "JPEG", quality=JPEG_QUALITY, optimize=True)
        print(f"optimized {filename} -> img/{slug}.jpg ({out_path.stat().st_size // 1024} KB)")

    # replace originals: remove old raw files, move optimized ones up, drop temp dir
    for filename in set(SOURCE_MAP.values()):
        raw = IMG_DIR / filename
        if raw.exists():
            raw.unlink()
    for f in tmp_dir.iterdir():
        f.rename(IMG_DIR / f.name)
    tmp_dir.rmdir()


def make_icon(size, out_path):
    bg = (86, 15, 30)  # dark bordô
    gold = (196, 154, 61)
    img = Image.new("RGB", (size, size), bg)
    draw = ImageDraw.Draw(img)
    margin = size // 8
    draw.ellipse([margin, margin, size - margin, size - margin], outline=gold, width=max(2, size // 40))
    text = "V&H"
    try:
        font = ImageFont.truetype("arialbd.ttf", size // 4)
    except OSError:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1]), text, fill=gold, font=font)
    img.save(out_path, "PNG")
    print(f"wrote {out_path}")


def make_icons():
    ICONS_DIR.mkdir(exist_ok=True)
    make_icon(192, ICONS_DIR / "icon-192.png")
    make_icon(512, ICONS_DIR / "icon-512.png")


if __name__ == "__main__":
    optimize_photos()
    make_icons()
```

- [ ] **Step 2: Install Pillow locally (build-time only, not a project dependency) and run the script**

Run:
```bash
python3 -m pip install --quiet Pillow
python3 scripts/optimize_images.py
```
Expected: 20 lines like `optimized CoragemReserva.jpg -> img/coragem-reserva.jpg (NN KB)`, then two `wrote .../icons/icon-*.png` lines. `img/` now contains only the 20 slug-named `.jpg` files, and `icons/icon-192.png` + `icons/icon-512.png` exist.

- [ ] **Step 3: Write a test that checks the produced assets against the catalog**

```js
// test/assets.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Catalog = require('../js/catalog.js');

test('every catalog image path exists on disk', () => {
  for (const wine of Catalog.MENU) {
    const full = path.join(__dirname, '..', wine.image);
    assert.ok(fs.existsSync(full), `missing image for ${wine.name}: ${wine.image}`);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: `assets.test.js` passes (0 fail). If a filename mismatch shows up, fix `SOURCE_MAP` in the script (not the test) and rerun Step 2.

- [ ] **Step 5: Commit**

```bash
git add scripts/optimize_images.py img/ icons/ test/assets.test.js
git commit -m "feat: optimize wine photos and generate PWA icons"
```

---

## Task 5: Admin auth module

**Files:**
- Create: `lib/auth.js`
- Test: `test/auth.test.js`

**Interfaces:**
- Produces: `signSession(password, secret)`, `verifySession(token, password, secret)`, `parseCookies(cookieHeader)`, `buildSessionCookie(token)`, `SESSION_COOKIE_NAME`.
- Consumes: nothing external (pure `node:crypto` HMAC).

- [ ] **Step 1: Write the failing test**

```js
// test/auth.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../lib/auth.js');

const SECRET = 'test-secret';
const PASSWORD = 'senha-correta';

test('signSession then verifySession succeeds with correct password', () => {
  const token = auth.signSession(PASSWORD, SECRET);
  assert.equal(auth.verifySession(token, PASSWORD, SECRET), true);
});

test('verifySession fails with wrong password used to sign', () => {
  const token = auth.signSession('outra-senha', SECRET);
  assert.equal(auth.verifySession(token, PASSWORD, SECRET), false);
});

test('verifySession fails with tampered token', () => {
  const token = auth.signSession(PASSWORD, SECRET);
  const tampered = token.slice(0, -2) + 'zz';
  assert.equal(auth.verifySession(tampered, PASSWORD, SECRET), false);
});

test('verifySession fails on garbage input without throwing', () => {
  assert.equal(auth.verifySession('not-a-token', PASSWORD, SECRET), false);
  assert.equal(auth.verifySession('', PASSWORD, SECRET), false);
  assert.equal(auth.verifySession(undefined, PASSWORD, SECRET), false);
});

test('parseCookies reads a Cookie header into an object', () => {
  const cookies = auth.parseCookies('foo=bar; admin_session=abc123; empty=');
  assert.deepEqual(cookies, { foo: 'bar', admin_session: 'abc123', empty: '' });
});

test('parseCookies handles missing header', () => {
  assert.deepEqual(auth.parseCookies(undefined), {});
});

test('buildSessionCookie sets HttpOnly, SameSite and the token', () => {
  const cookie = auth.buildSessionCookie('sometoken');
  assert.match(cookie, /^admin_session=sometoken;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/auth.js'`.

- [ ] **Step 3: Write the auth module**

```js
// lib/auth.js
const crypto = require('node:crypto');

const SESSION_COOKIE_NAME = 'admin_session';

function signSession(password, secret) {
  const hmac = crypto.createHmac('sha256', secret).update(password).digest('hex');
  return Buffer.from(hmac).toString('hex');
}

function verifySession(token, password, secret) {
  if (!token || typeof token !== 'string') return false;
  let provided;
  try {
    provided = Buffer.from(token, 'hex');
  } catch {
    return false;
  }
  const expectedHex = crypto.createHmac('sha256', secret).update(password).digest('hex');
  const expected = Buffer.from(expectedHex, 'hex');
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return acc;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) acc[key] = value;
    return acc;
  }, {});
}

function buildSessionCookie(token) {
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`;
}

module.exports = { SESSION_COOKIE_NAME, signSession, verifySession, parseCookies, buildSessionCookie };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all `auth.test.js` assertions pass.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.js test/auth.test.js
git commit -m "feat: add admin session signing and cookie helpers"
```

---

## Task 6: Database layer

**Files:**
- Create: `lib/db.js`
- Test: `test/db.test.js`

**Interfaces:**
- Consumes: an injected `execute(text, params)` function (real one wraps `@vercel/postgres`'s `sql.query`).
- Produces: `SCHEMA_SQL`, `ensureSchema(execute)`, `insertOrder(execute, row)`, `listOrders(execute)`, `updateOrderStatus(execute, id, status)`, `getRealExecute()` (only function that touches `@vercel/postgres`, used by `/api` files, not by tests).

- [ ] **Step 1: Write the failing test using a fake executor**

```js
// test/db.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../lib/db.js');

function fakeExecute(responses) {
  const calls = [];
  const execute = async (text, params) => {
    calls.push({ text, params });
    return responses.shift() || { rows: [] };
  };
  execute.calls = calls;
  return execute;
}

test('ensureSchema runs the CREATE TABLE statement', async () => {
  const execute = fakeExecute([{ rows: [] }]);
  await db.ensureSchema(execute);
  assert.equal(execute.calls.length, 1);
  assert.match(execute.calls[0].text, /CREATE TABLE IF NOT EXISTS orders/);
});

test('insertOrder inserts all row fields and returns the new id', async () => {
  const row = {
    fullName: 'Maria Silva', birthDate: '1990-01-01', cpf: '11122233344',
    phone: '11987654321', email: 'maria@example.com', deliveryType: 'delivery',
    address: { street: 'Rua A', number: '10', complement: '', cep: '01000-000', neighborhood: 'Centro', city: 'São Paulo', state: 'SP' },
    items: [{ slug: 'porta-6', name: 'Porta 6', price: 57.1, qty: 1 }],
    couponCode: null, subtotal: 57.1, discount: 0, freight: 15, total: 72.1,
    paymentMethod: 'pix'
  };
  const execute = fakeExecute([{ rows: [{ id: 42 }] }]);
  const result = await db.insertOrder(execute, row);
  assert.equal(result.id, 42);
  assert.equal(execute.calls.length, 1);
  assert.match(execute.calls[0].text, /INSERT INTO orders/);
  assert.equal(execute.calls[0].params[0], row.fullName);
  assert.equal(JSON.parse(execute.calls[0].params[9]).length, 1);
});

test('listOrders returns rows most-recent-first via ORDER BY', async () => {
  const execute = fakeExecute([{ rows: [{ id: 2 }, { id: 1 }] }]);
  const orders = await db.listOrders(execute);
  assert.deepEqual(orders, [{ id: 2 }, { id: 1 }]);
  assert.match(execute.calls[0].text, /ORDER BY created_at DESC/);
});

test('updateOrderStatus updates the status column for the given id', async () => {
  const execute = fakeExecute([{ rows: [] }]);
  await db.updateOrderStatus(execute, 42, 'pago');
  assert.match(execute.calls[0].text, /UPDATE orders SET status/);
  assert.deepEqual(execute.calls[0].params, ['pago', 42]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/db.js'`.

- [ ] **Step 3: Write the db module**

```js
// lib/db.js
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  birth_date DATE NOT NULL,
  cpf TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  delivery_type TEXT NOT NULL,
  address_street TEXT,
  address_number TEXT,
  address_complement TEXT,
  address_cep TEXT,
  address_neighborhood TEXT,
  address_city TEXT,
  address_state TEXT,
  items JSONB NOT NULL,
  coupon_code TEXT,
  subtotal NUMERIC NOT NULL,
  discount NUMERIC NOT NULL DEFAULT 0,
  freight NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pendente',
  status TEXT NOT NULL DEFAULT 'novo',
  mp_payment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function ensureSchema(execute) {
  await execute(SCHEMA_SQL, []);
}

async function insertOrder(execute, row) {
  const text = `
    INSERT INTO orders (
      full_name, birth_date, cpf, phone, email, delivery_type,
      address_street, address_number, address_complement, items,
      address_cep, address_neighborhood, address_city, address_state,
      coupon_code, subtotal, discount, freight, total, payment_method
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    RETURNING id;
  `;
  const params = [
    row.fullName, row.birthDate, row.cpf, row.phone, row.email, row.deliveryType,
    row.address.street, row.address.number, row.address.complement, JSON.stringify(row.items),
    row.address.cep, row.address.neighborhood, row.address.city, row.address.state,
    row.couponCode, row.subtotal, row.discount, row.freight, row.total, row.paymentMethod
  ];
  const result = await execute(text, params);
  return { id: result.rows[0].id };
}

async function listOrders(execute) {
  const result = await execute('SELECT * FROM orders ORDER BY created_at DESC;', []);
  return result.rows;
}

async function updateOrderStatus(execute, id, status) {
  await execute('UPDATE orders SET status = $1 WHERE id = $2;', [status, id]);
}

function getRealExecute() {
  const { sql } = require('@vercel/postgres');
  return (text, params) => sql.query(text, params);
}

module.exports = { SCHEMA_SQL, ensureSchema, insertOrder, listOrders, updateOrderStatus, getRealExecute };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all `db.test.js` assertions pass. Note: `INSERT INTO orders` column list is `..., items, address_cep, ...` (items placed before the remaining address fields) — the test checks `params[9]` is the items JSON, matching `$10` in that column order; keep column list and `params` array in the same order if you edit this file.

- [ ] **Step 5: Commit**

```bash
git add lib/db.js test/db.test.js
git commit -m "feat: add Postgres data layer with injectable executor"
```

---

## Task 7: Orders service (validation + totals + orchestration)

**Files:**
- Create: `lib/orders-service.js`
- Test: `test/orders-service.test.js`

**Interfaces:**
- Consumes: `Pricing.computeTotals` (Task 3, via `require('../js/pricing.js')`), `db.ensureSchema/insertOrder/listOrders/updateOrderStatus` (Task 6, via injected `deps.execute`).
- Produces: `validateOrderPayload(payload)` → `{ valid, errors }`, `isAdult(birthDateStr, today)`, `createOrder(deps, payload)` → `{ id, subtotal, discount, freight, total }` or throws `ValidationError`, `listOrdersForAdmin(deps)`, `setOrderStatus(deps, id, status)`. `deps` shape: `{ execute }`.

- [ ] **Step 1: Write the failing test**

```js
// test/orders-service.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../lib/orders-service.js');

function validPayload(overrides = {}) {
  return {
    customer: { fullName: 'Maria Silva', birthDate: '1990-05-20', cpf: '111.222.333-44', phone: '11987654321', email: 'maria@example.com' },
    delivery: { type: 'delivery', address: { street: 'Rua A', number: '10', complement: '', cep: '01000-000', neighborhood: 'Centro', city: 'São Paulo', state: 'SP' }, freightCost: 15 },
    items: [{ slug: 'porta-6', name: 'Porta 6', price: 57.1, qty: 2 }],
    couponCode: null,
    paymentMethod: 'pix',
    ...overrides
  };
}

test('isAdult is true at exactly 18 and false the day before', () => {
  assert.equal(svc.isAdult('2008-08-22', new Date('2026-08-22')), true);
  assert.equal(svc.isAdult('2008-08-23', new Date('2026-08-22')), false);
});

test('validateOrderPayload accepts a well-formed payload', () => {
  const { valid, errors } = svc.validateOrderPayload(validPayload());
  assert.equal(valid, true);
  assert.deepEqual(errors, []);
});

test('validateOrderPayload rejects missing required customer fields', () => {
  const payload = validPayload({ customer: { fullName: '', birthDate: '1990-05-20', cpf: '', phone: '11987654321', email: 'maria@example.com' } });
  const { valid, errors } = svc.validateOrderPayload(payload);
  assert.equal(valid, false);
  assert.ok(errors.includes('fullName'));
  assert.ok(errors.includes('cpf'));
});

test('validateOrderPayload rejects underage birth dates', () => {
  const payload = validPayload({ customer: { ...validPayload().customer, birthDate: '2015-01-01' } });
  const { valid, errors } = svc.validateOrderPayload(payload);
  assert.equal(valid, false);
  assert.ok(errors.includes('birthDate'));
});

test('validateOrderPayload requires address fields only when delivery type is delivery', () => {
  const pickup = validPayload({ delivery: { type: 'pickup', address: null, freightCost: 0 } });
  assert.equal(svc.validateOrderPayload(pickup).valid, true);

  const missingAddress = validPayload({ delivery: { type: 'delivery', address: { street: '', number: '', complement: '', cep: '', neighborhood: '', city: '', state: '' }, freightCost: 15 } });
  assert.equal(svc.validateOrderPayload(missingAddress).valid, false);
});

test('validateOrderPayload rejects an empty cart', () => {
  const payload = validPayload({ items: [] });
  const { valid, errors } = svc.validateOrderPayload(payload);
  assert.equal(valid, false);
  assert.ok(errors.includes('items'));
});

test('createOrder validates, computes totals, persists via deps.execute, returns totals + id', async () => {
  const calls = [];
  const execute = async (text, params) => {
    calls.push({ text, params });
    if (text.startsWith('INSERT')) return { rows: [{ id: 7 }] };
    return { rows: [] };
  };
  const result = await svc.createOrder({ execute }, validPayload());
  assert.equal(result.id, 7);
  assert.equal(result.subtotal, 114.2);
  assert.equal(result.freight, 15);
  assert.equal(result.total, 129.2);
  assert.ok(calls.some((c) => c.text.startsWith('INSERT')));
});

test('createOrder throws ValidationError and never calls execute for an invalid payload', async () => {
  let called = false;
  const execute = async () => { called = true; return { rows: [] }; };
  await assert.rejects(() => svc.createOrder({ execute }, validPayload({ items: [] })), svc.ValidationError);
  assert.equal(called, false);
});

test('createOrder applies free shipping once subtotal crosses R$150', async () => {
  const execute = async (text) => (text.startsWith('INSERT') ? { rows: [{ id: 1 }] } : { rows: [] });
  const payload = validPayload({ items: [{ slug: 'porta-6', name: 'Porta 6', price: 80, qty: 2 }] }); // subtotal 160
  const result = await svc.createOrder({ execute }, payload);
  assert.equal(result.freight, 0);
});

test('listOrdersForAdmin delegates to db.listOrders', async () => {
  const execute = async (text) => {
    assert.match(text, /SELECT \* FROM orders/);
    return { rows: [{ id: 1 }] };
  };
  const orders = await svc.listOrdersForAdmin({ execute });
  assert.deepEqual(orders, [{ id: 1 }]);
});

test('setOrderStatus delegates to db.updateOrderStatus', async () => {
  const execute = async (text, params) => {
    assert.match(text, /UPDATE orders SET status/);
    assert.deepEqual(params, ['pago', 5]);
    return { rows: [] };
  };
  await svc.setOrderStatus({ execute }, 5, 'pago');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/orders-service.js'`.

- [ ] **Step 3: Write the orders service**

```js
// lib/orders-service.js
const Pricing = require('../js/pricing.js');
const db = require('./db.js');

class ValidationError extends Error {
  constructor(errors) {
    super(`Invalid order payload: ${errors.join(', ')}`);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

const CPF_RE = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;
const CEP_RE = /^\d{5}-?\d{3}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\d{10,11}$/;

function isAdult(birthDateStr, today = new Date()) {
  const birth = new Date(birthDateStr);
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birth.getUTCMonth();
  const dayDiff = today.getUTCDate() - birth.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age >= 18;
}

function validateOrderPayload(payload) {
  const errors = [];
  const c = payload.customer || {};
  if (!c.fullName || !c.fullName.trim()) errors.push('fullName');
  if (!c.birthDate || !isAdult(c.birthDate)) errors.push('birthDate');
  if (!c.cpf || !CPF_RE.test(c.cpf)) errors.push('cpf');
  if (!c.phone || !PHONE_RE.test(c.phone.replace(/\D/g, ''))) errors.push('phone');
  if (!c.email || !EMAIL_RE.test(c.email)) errors.push('email');

  const d = payload.delivery || {};
  if (d.type === 'delivery') {
    const a = d.address || {};
    for (const field of ['street', 'number', 'cep', 'neighborhood', 'city', 'state']) {
      if (!a[field] || !String(a[field]).trim()) errors.push(field);
    }
    if (a.cep && !CEP_RE.test(a.cep)) errors.push('cep');
  } else if (d.type !== 'pickup') {
    errors.push('deliveryType');
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) errors.push('items');
  if (!['pix', 'card'].includes(payload.paymentMethod)) errors.push('paymentMethod');

  return { valid: errors.length === 0, errors };
}

async function createOrder(deps, payload) {
  const { valid, errors } = validateOrderPayload(payload);
  if (!valid) throw new ValidationError(errors);

  const totals = Pricing.computeTotals(payload.items, payload.couponCode, payload.delivery.freightCost || 0);

  const row = {
    fullName: payload.customer.fullName.trim(),
    birthDate: payload.customer.birthDate,
    cpf: payload.customer.cpf,
    phone: payload.customer.phone,
    email: payload.customer.email,
    deliveryType: payload.delivery.type,
    address: payload.delivery.type === 'delivery'
      ? payload.delivery.address
      : { street: '', number: '', complement: '', cep: '', neighborhood: '', city: '', state: '' },
    items: payload.items,
    couponCode: totals.couponCode,
    subtotal: totals.subtotal,
    discount: totals.discount,
    freight: totals.freight,
    total: totals.total,
    paymentMethod: payload.paymentMethod
  };

  const { id } = await db.insertOrder(deps.execute, row);
  return { id, ...totals };
}

async function listOrdersForAdmin(deps) {
  return db.listOrders(deps.execute);
}

async function setOrderStatus(deps, id, status) {
  return db.updateOrderStatus(deps.execute, id, status);
}

module.exports = { ValidationError, isAdult, validateOrderPayload, createOrder, listOrdersForAdmin, setOrderStatus };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all `orders-service.test.js` assertions pass.

- [ ] **Step 5: Commit**

```bash
git add lib/orders-service.js test/orders-service.test.js
git commit -m "feat: add order validation, totals and orchestration service"
```

---

## Task 8: Freight module (Melhor Envio + fallback)

**Files:**
- Create: `lib/freight.js`
- Test: `test/freight.test.js`

**Interfaces:**
- Consumes: `Pricing.fallbackFreight` (Task 3), an injected `deps.fetchImpl` and `deps.env` (`{ MELHOR_ENVIO_TOKEN, MELHOR_ENVIO_CEP_ORIGEM }`).
- Produces: `quoteFreight(deps, { cep, subtotal })` → `{ cost, free, source }` where `source` is `'melhor-envio'` or `'fallback'`.

- [ ] **Step 1: Write the failing test**

```js
// test/freight.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { quoteFreight } = require('../lib/freight.js');

test('falls back to flat-rate rule when Melhor Envio env vars are missing', async () => {
  const deps = { fetchImpl: async () => { throw new Error('should not be called'); }, env: {} };
  const result = await quoteFreight(deps, { cep: '01000-000', subtotal: 100 });
  assert.deepEqual(result, { cost: 15, free: false, source: 'fallback' });
});

test('fallback is free above the R$150 threshold', async () => {
  const deps = { fetchImpl: async () => { throw new Error('should not be called'); }, env: {} };
  const result = await quoteFreight(deps, { cep: '01000-000', subtotal: 200 });
  assert.deepEqual(result, { cost: 0, free: true, source: 'fallback' });
});

test('calls Melhor Envio when configured and returns the cheapest quoted service', async () => {
  const calls = [];
  const deps = {
    env: { MELHOR_ENVIO_TOKEN: 'tok', MELHOR_ENVIO_CEP_ORIGEM: '01000-000' },
    fetchImpl: async (url, opts) => {
      calls.push({ url, opts });
      return {
        ok: true,
        json: async () => ([{ price: '22.50', error: null }, { price: '18.00', error: null }])
      };
    }
  };
  const result = await quoteFreight(deps, { cep: '20000-000', subtotal: 100 });
  assert.equal(result.cost, 18);
  assert.equal(result.free, false);
  assert.equal(result.source, 'melhor-envio');
  assert.match(calls[0].url, /melhorenvio\.com\.br/);
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
});

test('overrides Melhor Envio price with free shipping above R$150', async () => {
  const deps = {
    env: { MELHOR_ENVIO_TOKEN: 'tok', MELHOR_ENVIO_CEP_ORIGEM: '01000-000' },
    fetchImpl: async () => ({ ok: true, json: async () => ([{ price: '22.50', error: null }]) })
  };
  const result = await quoteFreight(deps, { cep: '20000-000', subtotal: 200 });
  assert.deepEqual(result, { cost: 0, free: true, source: 'melhor-envio' });
});

test('falls back gracefully if the Melhor Envio call fails', async () => {
  const deps = {
    env: { MELHOR_ENVIO_TOKEN: 'tok', MELHOR_ENVIO_CEP_ORIGEM: '01000-000' },
    fetchImpl: async () => { throw new Error('network down'); }
  };
  const result = await quoteFreight(deps, { cep: '20000-000', subtotal: 100 });
  assert.deepEqual(result, { cost: 15, free: false, source: 'fallback' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/freight.js'`.

- [ ] **Step 3: Write the freight module**

```js
// lib/freight.js
const Pricing = require('../js/pricing.js');

async function quoteFreight(deps, { cep, subtotal }) {
  const { env, fetchImpl } = deps;
  const configured = Boolean(env.MELHOR_ENVIO_TOKEN && env.MELHOR_ENVIO_CEP_ORIGEM);

  if (configured) {
    try {
      const response = await fetchImpl('https://www.melhorenvio.com.br/api/v2/me/shipment/calculate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.MELHOR_ENVIO_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          from: { postal_code: env.MELHOR_ENVIO_CEP_ORIGEM },
          to: { postal_code: cep },
          products: [{ id: 'cart', width: 15, height: 15, length: 15, weight: 1, insurance_value: subtotal, quantity: 1 }]
        })
      });
      if (!response.ok) throw new Error(`melhor envio http ${response.status}`);
      const quotes = await response.json();
      const valid = quotes.filter((q) => !q.error && q.price);
      if (valid.length === 0) throw new Error('no valid melhor envio quotes');
      const cheapest = Math.min(...valid.map((q) => Number(q.price)));
      if (subtotal >= Pricing.FREE_SHIPPING_THRESHOLD) {
        return { cost: 0, free: true, source: 'melhor-envio' };
      }
      return { cost: Math.round(cheapest * 100) / 100, free: false, source: 'melhor-envio' };
    } catch {
      // fall through to fallback below
    }
  }

  const fallback = Pricing.fallbackFreight(subtotal);
  return { ...fallback, source: 'fallback' };
}

module.exports = { quoteFreight };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all `freight.test.js` assertions pass.

- [ ] **Step 5: Commit**

```bash
git add lib/freight.js test/freight.test.js
git commit -m "feat: add Melhor Envio freight quoting with local fallback"
```

---

## Task 9: Payment module (Mercado Pago)

**Files:**
- Create: `lib/payment.js`
- Test: `test/payment.test.js`

**Interfaces:**
- Consumes: injected `deps.fetchImpl` and `deps.env` (`{ MP_ACCESS_TOKEN, SITE_URL }`).
- Produces: `createPreference(deps, order)` → `{ configured: false }` or `{ configured: true, initPoint, preferenceId }`; `fetchPaymentStatus(deps, paymentId)` → `{ status }`.

- [ ] **Step 1: Write the failing test**

```js
// test/payment.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPreference, fetchPaymentStatus } = require('../lib/payment.js');

test('createPreference reports not configured when MP_ACCESS_TOKEN is missing', async () => {
  const deps = { env: {}, fetchImpl: async () => { throw new Error('should not be called'); } };
  const result = await createPreference(deps, { id: 1, total: 100, items: [{ name: 'Porta 6', qty: 1, price: 57.1 }] });
  assert.deepEqual(result, { configured: false });
});

test('createPreference calls Mercado Pago and returns the checkout URL', async () => {
  const calls = [];
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok', SITE_URL: 'https://example.com' },
    fetchImpl: async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, json: async () => ({ id: 'pref123', init_point: 'https://mp.example/checkout/pref123' }) };
    }
  };
  const order = { id: 9, total: 129.2, items: [{ name: 'Porta 6', qty: 2, price: 57.1 }] };
  const result = await createPreference(deps, order);
  assert.deepEqual(result, { configured: true, initPoint: 'https://mp.example/checkout/pref123', preferenceId: 'pref123' });
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.items[0].title, 'Porta 6');
  assert.equal(body.external_reference, '9');
});

test('createPreference throws if Mercado Pago responds with an error', async () => {
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok', SITE_URL: 'https://example.com' },
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ message: 'invalid token' }) })
  };
  await assert.rejects(() => createPreference(deps, { id: 1, total: 10, items: [] }));
});

test('fetchPaymentStatus returns not-configured when token missing', async () => {
  const deps = { env: {}, fetchImpl: async () => { throw new Error('should not be called'); } };
  const result = await fetchPaymentStatus(deps, 'pay123');
  assert.deepEqual(result, { configured: false });
});

test('fetchPaymentStatus queries Mercado Pago payment status', async () => {
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok' },
    fetchImpl: async (url, opts) => {
      assert.match(url, /\/v1\/payments\/pay123/);
      assert.equal(opts.headers.Authorization, 'Bearer tok');
      return { ok: true, json: async () => ({ status: 'approved', external_reference: '9' }) };
    }
  };
  const result = await fetchPaymentStatus(deps, 'pay123');
  assert.deepEqual(result, { configured: true, status: 'approved', orderId: '9' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/payment.js'`.

- [ ] **Step 3: Write the payment module**

```js
// lib/payment.js
async function createPreference(deps, order) {
  const { env, fetchImpl } = deps;
  if (!env.MP_ACCESS_TOKEN) return { configured: false };

  const response = await fetchImpl('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      items: order.items.map((item) => ({
        title: item.name,
        quantity: item.qty,
        unit_price: item.price,
        currency_id: 'BRL'
      })),
      external_reference: String(order.id),
      back_urls: {
        success: `${env.SITE_URL}/?pedido=${order.id}&pagamento=sucesso`,
        failure: `${env.SITE_URL}/?pedido=${order.id}&pagamento=falha`,
        pending: `${env.SITE_URL}/?pedido=${order.id}&pagamento=pendente`
      },
      auto_return: 'approved'
    })
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(`Mercado Pago error ${response.status}: ${errBody.message || 'unknown'}`);
  }

  const data = await response.json();
  return { configured: true, initPoint: data.init_point, preferenceId: data.id };
}

async function fetchPaymentStatus(deps, paymentId) {
  const { env, fetchImpl } = deps;
  if (!env.MP_ACCESS_TOKEN) return { configured: false };

  const response = await fetchImpl(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` }
  });
  if (!response.ok) throw new Error(`Mercado Pago payment lookup failed: ${response.status}`);
  const data = await response.json();
  return { configured: true, status: data.status, orderId: data.external_reference };
}

module.exports = { createPreference, fetchPaymentStatus };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all `payment.test.js` assertions pass.

- [ ] **Step 5: Commit**

```bash
git add lib/payment.js test/payment.test.js
git commit -m "feat: add Mercado Pago preference and payment-status lookup"
```

---

## Task 10: HTTP mocks + orders API handler

**Files:**
- Create: `test/helpers/http-mocks.js`
- Create: `lib/handlers/orders.js`
- Create: `api/orders.js`
- Test: `test/handlers-orders.test.js`

**Interfaces:**
- Consumes: `orders-service.js` (Task 7) functions, `auth.js` (Task 5) for `requireAdmin` checks.
- Produces: `mockReq({ method, body, query, headers, cookies })`, `mockRes()` (shared by all remaining handler tests); `createOrdersHandler(deps)` → Vercel-style `(req, res) => Promise<void>` handling `POST /api/orders` (public, creates order) and `GET /api/orders` (requires `admin_session` cookie).

- [ ] **Step 1: Write the shared HTTP mock helper (no test needed — it's test infrastructure, exercised by every test that uses it)**

```js
// test/helpers/http-mocks.js
function mockReq({ method = 'GET', body = null, query = {}, headers = {}, cookies = {} } = {}) {
  return { method, body, query, headers, cookies };
}

function mockRes() {
  const res = { statusCode: 200, body: undefined, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  res.setHeader = (key, value) => { res.headers[key] = value; return res; };
  res.end = (payload) => { res.body = payload; return res; };
  return res;
}

module.exports = { mockReq, mockRes };
```

- [ ] **Step 2: Write the failing test for the orders handler**

```js
// test/handlers-orders.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const { createOrdersHandler } = require('../lib/handlers/orders.js');
const auth = require('../lib/auth.js');

const SECRET = 'test-secret';
const PASSWORD = 'admin-pass';

function makeDeps(overrides = {}) {
  return {
    execute: async (text) => (text.startsWith('INSERT') ? { rows: [{ id: 1 }] } : { rows: [] }),
    adminPassword: PASSWORD,
    sessionSecret: SECRET,
    ...overrides
  };
}

function validBody() {
  return {
    customer: { fullName: 'Maria Silva', birthDate: '1990-05-20', cpf: '111.222.333-44', phone: '11987654321', email: 'maria@example.com' },
    delivery: { type: 'pickup', address: null, freightCost: 0 },
    items: [{ slug: 'porta-6', name: 'Porta 6', price: 57.1, qty: 1 }],
    couponCode: null,
    paymentMethod: 'pix'
  };
}

test('POST creates an order and returns 201 with totals', async () => {
  const handler = createOrdersHandler(makeDeps());
  const req = mockReq({ method: 'POST', body: validBody() });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.id, 1);
  assert.equal(res.body.total, 57.1);
});

test('POST with invalid payload returns 400 with error list', async () => {
  const handler = createOrdersHandler(makeDeps());
  const req = mockReq({ method: 'POST', body: { ...validBody(), items: [] } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.errors.includes('items'));
});

test('GET without a valid admin session returns 401', async () => {
  const handler = createOrdersHandler(makeDeps());
  const req = mockReq({ method: 'GET', headers: {} });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
});

test('GET with a valid admin session returns the order list', async () => {
  const token = auth.signSession(PASSWORD, SECRET);
  const deps = makeDeps({ execute: async () => ({ rows: [{ id: 1 }, { id: 2 }] }) });
  const handler = createOrdersHandler(deps);
  const req = mockReq({ method: 'GET', headers: { cookie: `admin_session=${token}` } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 2);
});

test('unsupported method returns 405', async () => {
  const handler = createOrdersHandler(makeDeps());
  const req = mockReq({ method: 'DELETE' });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 405);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/handlers/orders.js'`.

- [ ] **Step 4: Write the orders handler factory**

```js
// lib/handlers/orders.js
const svc = require('../orders-service.js');
const auth = require('../auth.js');

function createOrdersHandler(deps) {
  const serviceDeps = { execute: deps.execute };

  function isAdmin(req) {
    const cookies = auth.parseCookies(req.headers.cookie);
    return auth.verifySession(cookies[auth.SESSION_COOKIE_NAME], deps.adminPassword, deps.sessionSecret);
  }

  return async function handler(req, res) {
    if (req.method === 'POST') {
      try {
        const result = await svc.createOrder(serviceDeps, req.body);
        res.status(201).json(result);
      } catch (err) {
        if (err instanceof svc.ValidationError) {
          res.status(400).json({ errors: err.errors });
        } else {
          res.status(500).json({ error: 'internal_error' });
        }
      }
      return;
    }

    if (req.method === 'GET') {
      if (!isAdmin(req)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const orders = await svc.listOrdersForAdmin(serviceDeps);
      res.status(200).json(orders);
      return;
    }

    res.status(405).json({ error: 'method_not_allowed' });
  };
}

module.exports = { createOrdersHandler };
```

- [ ] **Step 5: Write the thin Vercel route file**

```js
// api/orders.js
const { createOrdersHandler } = require('../lib/handlers/orders.js');
const db = require('../lib/db.js');

module.exports = createOrdersHandler({
  execute: db.getRealExecute(),
  adminPassword: process.env.ADMIN_PASSWORD,
  sessionSecret: process.env.ADMIN_SESSION_SECRET
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: all `handlers-orders.test.js` assertions pass. (`api/orders.js` itself isn't imported by tests — it calls `db.getRealExecute()`, which requires `@vercel/postgres` and only needs to resolve, not connect, at import time.)

- [ ] **Step 7: Commit**

```bash
git add test/helpers/http-mocks.js lib/handlers/orders.js api/orders.js test/handlers-orders.test.js
git commit -m "feat: add orders API handler with admin-gated listing"
```

---

## Task 11: Freight-quote API handler

**Files:**
- Create: `lib/handlers/freight.js`
- Create: `api/freight-quote.js`
- Test: `test/handlers-freight.test.js`

**Interfaces:**
- Consumes: `quoteFreight` (Task 8).
- Produces: `createFreightHandler(deps)` → handles `POST /api/freight-quote` with body `{ cep, subtotal }`.

- [ ] **Step 1: Write the failing test**

```js
// test/handlers-freight.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const { createFreightHandler } = require('../lib/handlers/freight.js');

test('POST returns a freight quote', async () => {
  const handler = createFreightHandler({ env: {}, fetchImpl: async () => { throw new Error('unused'); } });
  const req = mockReq({ method: 'POST', body: { cep: '01000-000', subtotal: 100 } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { cost: 15, free: false, source: 'fallback' });
});

test('POST without cep returns 400', async () => {
  const handler = createFreightHandler({ env: {}, fetchImpl: async () => {} });
  const req = mockReq({ method: 'POST', body: { subtotal: 100 } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
});

test('non-POST returns 405', async () => {
  const handler = createFreightHandler({ env: {}, fetchImpl: async () => {} });
  const req = mockReq({ method: 'GET' });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 405);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/handlers/freight.js'`.

- [ ] **Step 3: Write the handler**

```js
// lib/handlers/freight.js
const { quoteFreight } = require('../freight.js');

function createFreightHandler(deps) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    const { cep, subtotal } = req.body || {};
    if (!cep || typeof subtotal !== 'number') {
      res.status(400).json({ error: 'cep and subtotal are required' });
      return;
    }
    const quote = await quoteFreight(deps, { cep, subtotal });
    res.status(200).json(quote);
  };
}

module.exports = { createFreightHandler };
```

- [ ] **Step 4: Write the thin route file**

```js
// api/freight-quote.js
const { createFreightHandler } = require('../lib/handlers/freight.js');

module.exports = createFreightHandler({
  env: {
    MELHOR_ENVIO_TOKEN: process.env.MELHOR_ENVIO_TOKEN,
    MELHOR_ENVIO_CEP_ORIGEM: process.env.MELHOR_ENVIO_CEP_ORIGEM
  },
  fetchImpl: fetch
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: all `handlers-freight.test.js` assertions pass.

- [ ] **Step 6: Commit**

```bash
git add lib/handlers/freight.js api/freight-quote.js test/handlers-freight.test.js
git commit -m "feat: add freight-quote API handler"
```

---

## Task 12: Create-payment API handler

**Files:**
- Create: `lib/handlers/payment.js`
- Create: `api/create-payment.js`
- Test: `test/handlers-payment.test.js`

**Interfaces:**
- Consumes: `createPreference` (Task 9), `listOrdersForAdmin`-adjacent single lookup — reuses `deps.execute` + a minimal inline lookup query (no new db function needed; order data for the preference comes from the request body, already computed by the client during checkout review, not re-fetched from the DB).
- Produces: `createPaymentHandler(deps)` → handles `POST /api/create-payment` with body `{ orderId, total, items }`.

- [ ] **Step 1: Write the failing test**

```js
// test/handlers-payment.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const { createPaymentHandler } = require('../lib/handlers/payment.js');

test('POST returns not-configured when Mercado Pago token is missing', async () => {
  const handler = createPaymentHandler({ env: {}, fetchImpl: async () => { throw new Error('unused'); } });
  const req = mockReq({ method: 'POST', body: { orderId: 1, total: 100, items: [{ name: 'Porta 6', qty: 1, price: 57.1 }] } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { configured: false });
});

test('POST returns the checkout URL when configured', async () => {
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok', SITE_URL: 'https://example.com' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ id: 'pref1', init_point: 'https://mp.example/pref1' }) })
  };
  const handler = createPaymentHandler(deps);
  const req = mockReq({ method: 'POST', body: { orderId: 9, total: 100, items: [{ name: 'Porta 6', qty: 1, price: 57.1 }] } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.initPoint, 'https://mp.example/pref1');
});

test('POST without orderId returns 400', async () => {
  const handler = createPaymentHandler({ env: {}, fetchImpl: async () => {} });
  const req = mockReq({ method: 'POST', body: { total: 100, items: [] } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
});

test('non-POST returns 405', async () => {
  const handler = createPaymentHandler({ env: {}, fetchImpl: async () => {} });
  const req = mockReq({ method: 'GET' });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 405);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/handlers/payment.js'`.

- [ ] **Step 3: Write the handler**

```js
// lib/handlers/payment.js
const { createPreference } = require('../payment.js');

function createPaymentHandler(deps) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    const { orderId, total, items } = req.body || {};
    if (!orderId || typeof total !== 'number' || !Array.isArray(items)) {
      res.status(400).json({ error: 'orderId, total and items are required' });
      return;
    }
    try {
      const result = await createPreference(deps, { id: orderId, total, items });
      res.status(200).json(result);
    } catch (err) {
      res.status(502).json({ error: 'mercado_pago_error', message: err.message });
    }
  };
}

module.exports = { createPaymentHandler };
```

- [ ] **Step 4: Write the thin route file**

```js
// api/create-payment.js
const { createPaymentHandler } = require('../lib/handlers/payment.js');

module.exports = createPaymentHandler({
  env: { MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN, SITE_URL: process.env.SITE_URL },
  fetchImpl: fetch
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: all `handlers-payment.test.js` assertions pass.

- [ ] **Step 6: Commit**

```bash
git add lib/handlers/payment.js api/create-payment.js test/handlers-payment.test.js
git commit -m "feat: add create-payment API handler"
```

---

## Task 13: Mercado Pago webhook handler

**Files:**
- Create: `lib/handlers/webhook.js`
- Create: `api/mp-webhook.js`
- Test: `test/handlers-webhook.test.js`

**Interfaces:**
- Consumes: `fetchPaymentStatus` (Task 9), `setOrderStatus` (Task 7).
- Produces: `createWebhookHandler(deps)` → handles `POST /api/mp-webhook` with Mercado Pago's notification body `{ data: { id } }`, maps `approved` → order status `pago`.

- [ ] **Step 1: Write the failing test**

```js
// test/handlers-webhook.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const { createWebhookHandler } = require('../lib/handlers/webhook.js');

test('approved payment sets order status to pago', async () => {
  const updates = [];
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'approved', external_reference: '9' }) }),
    execute: async (text, params) => { updates.push({ text, params }); return { rows: [] }; }
  };
  const handler = createWebhookHandler(deps);
  const req = mockReq({ method: 'POST', body: { data: { id: 'pay123' } } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(updates[0].params[0], 'pago');
  assert.equal(updates[0].params[1], '9');
});

test('rejected payment sets order status to pagamento_recusado', async () => {
  const updates = [];
  const deps = {
    env: { MP_ACCESS_TOKEN: 'tok' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'rejected', external_reference: '9' }) }),
    execute: async (text, params) => { updates.push({ text, params }); return { rows: [] }; }
  };
  const handler = createWebhookHandler(deps);
  const req = mockReq({ method: 'POST', body: { data: { id: 'pay123' } } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(updates[0].params[0], 'pagamento_recusado');
});

test('missing payment id returns 200 without touching the db (Mercado Pago retries on non-2xx)', async () => {
  let called = false;
  const deps = { env: {}, fetchImpl: async () => {}, execute: async () => { called = true; return { rows: [] }; } };
  const handler = createWebhookHandler(deps);
  const req = mockReq({ method: 'POST', body: {} });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(called, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/handlers/webhook.js'`.

- [ ] **Step 3: Write the handler**

```js
// lib/handlers/webhook.js
const { fetchPaymentStatus } = require('../payment.js');
const svc = require('../orders-service.js');

const STATUS_MAP = { approved: 'pago', rejected: 'pagamento_recusado' };

function createWebhookHandler(deps) {
  return async function handler(req, res) {
    const paymentId = req.body && req.body.data && req.body.data.id;
    if (!paymentId) {
      res.status(200).json({ ignored: true });
      return;
    }

    const result = await fetchPaymentStatus(deps, paymentId);
    if (result.configured && result.orderId && STATUS_MAP[result.status]) {
      await svc.setOrderStatus({ execute: deps.execute }, result.orderId, STATUS_MAP[result.status]);
    }
    res.status(200).json({ received: true });
  };
}

module.exports = { createWebhookHandler };
```

- [ ] **Step 4: Write the thin route file**

```js
// api/mp-webhook.js
const { createWebhookHandler } = require('../lib/handlers/webhook.js');
const db = require('../lib/db.js');

module.exports = createWebhookHandler({
  env: { MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN },
  fetchImpl: fetch,
  execute: db.getRealExecute()
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: all `handlers-webhook.test.js` assertions pass.

- [ ] **Step 6: Commit**

```bash
git add lib/handlers/webhook.js api/mp-webhook.js test/handlers-webhook.test.js
git commit -m "feat: add Mercado Pago webhook handler for payment status updates"
```

---

## Task 14: Admin login handler

**Files:**
- Create: `lib/handlers/admin-login.js`
- Create: `api/admin-login.js`
- Test: `test/handlers-admin-login.test.js`

**Interfaces:**
- Consumes: `auth.signSession/buildSessionCookie` (Task 5).
- Produces: `createAdminLoginHandler(deps)` → handles `POST /api/admin-login` with body `{ password }`, sets the session cookie on success.

- [ ] **Step 1: Write the failing test**

```js
// test/handlers-admin-login.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockReq, mockRes } = require('./helpers/http-mocks.js');
const { createAdminLoginHandler } = require('../lib/handlers/admin-login.js');

const deps = { adminPassword: 'senha-correta', sessionSecret: 'secret' };

test('correct password returns 200 and sets the session cookie', async () => {
  const handler = createAdminLoginHandler(deps);
  const req = mockReq({ method: 'POST', body: { password: 'senha-correta' } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Set-Cookie'], /^admin_session=/);
});

test('wrong password returns 401 and sets no cookie', async () => {
  const handler = createAdminLoginHandler(deps);
  const req = mockReq({ method: 'POST', body: { password: 'errada' } });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['Set-Cookie'], undefined);
});

test('non-POST returns 405', async () => {
  const handler = createAdminLoginHandler(deps);
  const req = mockReq({ method: 'GET' });
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 405);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/handlers/admin-login.js'`.

- [ ] **Step 3: Write the handler**

```js
// lib/handlers/admin-login.js
const auth = require('../auth.js');

function createAdminLoginHandler(deps) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    const { password } = req.body || {};
    if (password !== deps.adminPassword) {
      res.status(401).json({ error: 'invalid_password' });
      return;
    }
    const token = auth.signSession(deps.adminPassword, deps.sessionSecret);
    res.setHeader('Set-Cookie', auth.buildSessionCookie(token));
    res.status(200).json({ ok: true });
  };
}

module.exports = { createAdminLoginHandler };
```

- [ ] **Step 4: Write the thin route file**

```js
// api/admin-login.js
const { createAdminLoginHandler } = require('../lib/handlers/admin-login.js');

module.exports = createAdminLoginHandler({
  adminPassword: process.env.ADMIN_PASSWORD,
  sessionSecret: process.env.ADMIN_SESSION_SECRET
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: all `handlers-admin-login.test.js` assertions pass, and the full suite (`npm test`) is green end to end.

- [ ] **Step 6: Commit**

```bash
git add lib/handlers/admin-login.js api/admin-login.js test/handlers-admin-login.test.js
git commit -m "feat: add admin login handler"
```

---

## Task 15: Local dev server

**Files:**
- Create: `dev-server.js`

**Interfaces:**
- Consumes: every file under `/api` (Tasks 10-14), serves static files from the project root.
- Produces: a local HTTP server for manual browser verification of Tasks 16-19 (not used in production — Vercel supplies its own routing there).

- [ ] **Step 1: Write the dev server**

```js
// dev-server.js
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};

function parseCookies(header) {
  if (!header) return {};
  return header.split(';').reduce((acc, pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return acc;
    acc[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    return acc;
  }, {});
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return null;
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function wrapRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
    return res;
  };
  return res;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith('/api/')) {
    const routeFile = path.join(ROOT, 'api', `${url.pathname.slice('/api/'.length)}.js`);
    if (!fs.existsSync(routeFile)) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    delete require.cache[require.resolve(routeFile)];
    const handler = require(routeFile);
    const query = Object.fromEntries(url.searchParams.entries());
    const body = req.method === 'POST' || req.method === 'PATCH' ? await readBody(req) : null;
    const fakeReq = { method: req.method, headers: req.headers, query, body, cookies: parseCookies(req.headers.cookie) };
    wrapRes(res);
    await handler(fakeReq, res);
    return;
  }

  let filePath = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(ROOT)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Vinho & Harmonia dev server running at http://localhost:${PORT}`);
});
```

- [ ] **Step 2: Add a `dev` script to `package.json`**

Modify `package.json` `scripts` block to:

```json
"scripts": {
  "test": "node --test test/",
  "dev": "node dev-server.js"
}
```

- [ ] **Step 3: Verify it starts and serves the API**

Run: `npm run dev` (leave running), then in a second terminal:
```bash
curl -s -X POST http://localhost:3000/api/freight-quote -H "Content-Type: application/json" -d '{"cep":"01000-000","subtotal":100}'
```
Expected: `{"cost":15,"free":false,"source":"fallback"}`. Stop the server (Ctrl+C) once confirmed.

- [ ] **Step 4: Commit**

```bash
git add dev-server.js package.json
git commit -m "feat: add zero-dependency local dev server for static files and API routes"
```

---

## Task 16: Storefront markup (`index.html`)

**Files:**
- Create: `css/styles.css`
- Create: `js/store.js`
- Create: `index.html`

**Interfaces:**
- Consumes: `Catalog` (Task 2), `Pricing` (Task 3), `POST /api/orders`, `POST /api/freight-quote`, `POST /api/create-payment` (Tasks 10-12).
- Produces: the customer-facing storefront. No automated test — verified manually in the browser (Step 4).

- [ ] **Step 1: Write `css/styles.css`**

Implement the visual system approved in the spec: dark bordô/graphite background (`--bg: #1a0f13`), card surface one tone up (`--surface: #2a1620`), bordô accent (`--accent: #7a1f3d`), gold accent (`--gold: #c49a3d`), silver detail (`--silver: #b8b8c0`), light text (`--text: #f3ece6`). Load "Anton" for display headings and "Inter" for body text from Google Fonts. Include, at minimum, styles for: header/category tabs (sticky, scrollspy-highlighted `.tab.active`), product grid/cards, product modal, floating cart button, cart drawer with free-shipping progress bar, age-gate modal, and the checkout bottom sheet. The checkout bottom sheet **must** include this exact rule set from the spec (copy verbatim, do not approximate):

```css
.sh-body { flex: 0 1 auto; min-height: 0; overflow-y: auto; max-height: 34vh; }
.sh-foot { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.sh-foot .btn-enviar { position: sticky; bottom: 0; }
```
Both `.sh-body`'s parent and `.sh-foot`'s parent (the bottom-sheet container) need `display: flex; flex-direction: column; max-height: 90vh;` for the sticky/scroll rules above to take effect.

- [ ] **Step 2: Write `js/store.js`**

Implement, using `Catalog` and `Pricing` from `window.Catalog`/`window.Pricing` (loaded via `<script>` tags before this file) and `fetch` for the three API calls:
- Age gate: on load, check `localStorage.getItem('idade_confirmada')`; if absent, show the modal; "Sim" sets it to `'1'` and hides the modal, "Não" redirects to `https://www.google.com`.
- Category tabs: render `Catalog.CATEGORIES`, highlight the active one on scroll (`IntersectionObserver` on each category section).
- Product grid: render `Catalog.MENU` as cards with +/- qty and an "Adicionar" button; clicking the photo/name opens the product modal with description, note field, qty, and `Catalog.suggestPairings(slug, 2)` rendered as "Harmoniza bem com" cards with their own quick-add button.
- Cart state kept in a single in-memory array `cart = [{ slug, name, price, qty, note }]`, persisted to `localStorage['vh_cart']` on every change so a refresh doesn't lose it.
- Floating cart button shows `cart.reduce(sum qty)` and `Pricing.calcSubtotal(cart)` formatted as `R$ 0,00` (use `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`).
- Cart drawer: free-shipping progress bar driven by `Pricing.freeShippingProgress(subtotal)`; "Harmoniza bem com" cross-sell block computed from the wines already in the cart (`Catalog.suggestPairings` on the highest-value cart item, filtered to exclude wines already in the cart).
- Checkout bottom sheet: delivery-vs-pickup toggle; on delivery, a CEP field that on blur calls `POST /api/freight-quote` with `{ cep, subtotal }` and shows the returned cost (or "Grátis!" if `free`); required fields matching `orders-service.js`'s `validateOrderPayload` (fullName, birthDate, cpf, phone, email, and address fields when delivery); coupon input calling `Pricing.applyCoupon` client-side for instant feedback; payment method radio (PIX shows the key `contato@vinhoharmonia.com.br` with a copy-to-clipboard button; Cartão calls `POST /api/create-payment` after the order is created and, if `configured: true`, redirects to `initPoint` — if `configured: false`, shows "Pagamento por cartão em configuração, escolha PIX por enquanto" and does not block PIX orders).
- The checkout bottom sheet must repeat, above the submit button, the fixed text "Venda proibida para menores de 18 anos" (same wording as the footer).
- On submit: `POST /api/orders` with the assembled payload; on success, hide the sheet and show a confirmation view with the order id and full summary; save `{ fullName, phone, cart, deliveryType, address }` to `localStorage['vh_last_order']`.
- "🔁 Repetir último pedido" button: shown at the top of the page only when `localStorage['vh_last_order']` exists; clicking it re-adds that order's `cart` items to the current cart. Separately, whenever the checkout sheet opens, if `localStorage['vh_last_order']` exists, pre-fill the `fullName`, `phone` and (when `deliveryType` was `delivery`) `address` fields from it — the customer can still edit them before submitting.
- Deep link: on load, read `?item=<slug>` from the URL and open that product's modal if the slug exists in `Catalog.MENU`.
- PWA install banner: only when `matchMedia('(max-width: 768px)').matches`, listen for the `beforeinstallprompt` event, show a bottom banner "Instale no seu celular", and trigger the captured prompt on click.

- [ ] **Step 3: Write `index.html`**

Assemble the page: `<head>` with `<title>Vinho & Harmonia — o vinho certo para cada momento (entrega em [sua cidade])</title>`, meta description, favicon link, Open Graph tags (`og:title`, `og:description`, `og:image` as an absolute URL built from `SITE_URL`), and a `<script type="application/ld+json">` block with `LiquorStore` schema (`name: "Vinho & Harmonia"`, placeholder `address`/`telephone` clearly commented as "trocar depois", `openingHoursSpecification` set to every day since the store is always open). Link `manifest.json` and set `<meta name="theme-color" content="#7a1f3d">`. Body structure: age-gate modal, header with logo/slogan and sticky category tabs, "Repetir último pedido" button (hidden unless `localStorage['vh_last_order']` exists), product grid sections per category, "Sobre" section, footer with address placeholder, hours, and the 18+ warning, floating cart button, cart drawer, product modal, checkout bottom sheet, confirmation view (hidden by default). Load scripts in order: `js/catalog.js`, `js/pricing.js`, `js/store.js`.

- [ ] **Step 4: Manual browser verification**

Run: `npm run dev`, then open the site in the Browser tool at `http://localhost:3000`.
Verify and fix any issue found before moving on:
1. Age gate blocks the catalog until "Sim" is clicked; reload — it doesn't ask again.
2. All 20 wines render with photos, prices in `R$ 0,00` format, and category tab scrollspy highlights correctly while scrolling.
3. Adding items updates the floating cart button count/total live.
4. Opening a product shows "Harmoniza bem com" suggestions that are never the product itself.
5. Cart drawer shows the free-shipping bar moving as subtotal changes, and flips to "Você ganhou entrega grátis!" at/above R$150.
6. Open the checkout sheet, select "Entrega", and **confirm the submit button stays visible on screen without needing to scroll the whole sheet** (the exact bug the spec's critical CSS section exists to prevent) — resize the browser pane shorter if needed to stress-test this. Also confirm the "Venda proibida para menores de 18 anos" text is visible in the sheet above the submit button.
7. Entering a CEP fetches and displays a freight cost (fallback R$15, or free above R$150).
8. Submitting a valid order shows the confirmation screen with an order number; reloading the page shows a "🔁 Repetir último pedido" button.
9. `?item=porta-6` in the URL opens that product's modal directly.
10. At a mobile viewport width, the "Instale no seu celular" banner appears; at desktop width, it doesn't.

- [ ] **Step 5: Commit**

```bash
git add css/styles.css js/store.js index.html
git commit -m "feat: build storefront UI with cart, checkout and cross-sell"
```

---

## Task 17: Admin panel (`admin.html`)

**Files:**
- Create: `js/admin.js`
- Create: `admin.html`

**Interfaces:**
- Consumes: `POST /api/admin-login` (Task 14), `GET /api/orders` (Task 10).
- Produces: the password-gated order list. No automated test — verified manually (Step 3).

- [ ] **Step 1: Write `js/admin.js`**

Implement: on load, call `GET /api/orders`; if it returns 401, show a password form; on submit, `POST /api/admin-login` with `{ password }` and, on success, retry `GET /api/orders`. Render orders most-recent-first as a table/card list: id, customer name, phone, delivery type, items (name × qty), subtotal/discount/freight/total, payment method, status, created-at formatted with `Intl.DateTimeFormat('pt-BR')`. No status-editing UI in this v1 (explicitly out of scope per the spec) — read-only list is sufficient.

- [ ] **Step 2: Write `admin.html`**

Minimal page reusing `css/styles.css` for visual consistency: password form (hidden once authenticated), order list container, loads `js/admin.js`. Add `<meta name="robots" content="noindex, nofollow">` since this page must never be indexed.

- [ ] **Step 3: Manual browser verification**

With `npm run dev` still running (or restarted), open `http://localhost:3000/admin.html` in the Browser tool.
Verify:
1. Without `ADMIN_PASSWORD` set in the environment, the login form appears and any password fails with a visible error (expected, since there's no real password configured yet in local dev — confirms the 401 path works).
2. Set `ADMIN_PASSWORD=teste123` and `ADMIN_SESSION_SECRET=devsecret` as environment variables, restart `npm run dev`, submit `teste123` in the login form, and confirm it then lists the orders created during Task 16's manual testing.
3. Reloading the page keeps you logged in (cookie persists) until the cookie's 8-hour expiry.

- [ ] **Step 4: Commit**

```bash
git add js/admin.js admin.html
git commit -m "feat: add password-protected admin order panel"
```

---

## Task 18: PWA shell (manifest + service worker)

**Files:**
- Create: `manifest.json`
- Create: `sw.js`
- Modify: `index.html` (add `<link rel="manifest">` and service-worker registration — already linked in Task 16, this task adds the actual files it points to)

**Interfaces:**
- Consumes: `icons/icon-192.png`, `icons/icon-512.png` (Task 4).
- Produces: an installable PWA shell caching the static assets needed to load the storefront offline-first.

- [ ] **Step 1: Write `manifest.json`**

```json
{
  "name": "Vinho & Harmonia",
  "short_name": "Vinho & Harmonia",
  "description": "o vinho certo para cada momento",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a0f13",
  "theme_color": "#7a1f3d",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Write `sw.js`**

```js
const CACHE_NAME = 'vinho-harmonia-shell-v1';
const SHELL_ASSETS = [
  '/', '/index.html', '/css/styles.css',
  '/js/catalog.js', '/js/pricing.js', '/js/store.js',
  '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

- [ ] **Step 3: Register the service worker in `js/store.js`**

Add to the bottom of `js/store.js`:

```js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.error('SW registration failed', err));
  });
}
```

- [ ] **Step 4: Manual browser verification**

Run: `npm run dev`, open `http://localhost:3000` in the Browser tool.
Verify:
1. Browser dev tools (Application/Service Workers panel, or `navigator.serviceWorker.getRegistrations()` via the JS console tool) shows the service worker registered and activated.
2. Reloading with the network throttled/offline still renders the shell (catalog, styles) from cache.

- [ ] **Step 5: Commit**

```bash
git add manifest.json sw.js js/store.js
git commit -m "feat: add PWA manifest and offline app-shell service worker"
```

---

## Task 19: Deployment guide and end-to-end verification

**Files:**
- Create: `PUBLICAR.md`

**Interfaces:**
- Consumes: the whole project (final integration check).
- Produces: a Portuguese step-by-step publishing guide, and confirmation the full suite is green.

- [ ] **Step 1: Run the full automated test suite one more time**

Run: `npm test`
Expected: every test file from Tasks 1-14 passes, 0 failures.

- [ ] **Step 2: Write `PUBLICAR.md`**

```markdown
# Como publicar o Vinho & Harmonia

## 1. Suba o código para o GitHub

    git remote add origin <url-do-seu-repositorio-no-github>
    git push -u origin master

## 2. Importe na Vercel

Em vercel.com → "Add New Project" → selecione este repositório. A Vercel detecta
automaticamente as funções em `/api`. Antes do primeiro deploy, adicione a
integração **Vercel Postgres** ao projeto (aba Storage) — ela cria a variável
`POSTGRES_URL` sozinha.

## 3. Configure as variáveis de ambiente

Em Project Settings → Environment Variables, adicione (veja `.env.example`):

- `ADMIN_PASSWORD` — senha do painel `/admin`.
- `ADMIN_SESSION_SECRET` — qualquer texto longo e aleatório.
- `PIX_KEY` — já vem como `contato@vinhoharmonia.com.br`, troque se mudar.
- `MP_ACCESS_TOKEN` — token do Mercado Pago (Checkout Pro). Sem ele, o
  pagamento por cartão fica "em configuração" e só PIX funciona — o site
  continua operando normalmente.
- `MELHOR_ENVIO_TOKEN` e `MELHOR_ENVIO_CEP_ORIGEM` — token e CEP de origem da
  loja no Melhor Envio. Sem eles, o frete usa a regra local (grátis acima de
  R$150, R$15 fixo abaixo).
- `SITE_URL` — a URL final do site na Vercel (ex.: `https://vinho-harmonia.vercel.app`).

Depois de configurar, clique em "Redeploy".

## Trocar o catálogo (produtos, preços, fotos)

O catálogo é o array `MENU` no topo de `js/catalog.js`. Cada vinho é um objeto
`{ slug, name, category, price, country, grape, image, description }`. Para
adicionar categorias novas (Branco, Rosé, Espumante), basta usar esses nomes no
campo `category` de novos itens — a navegação por abas já lê `Catalog.CATEGORIES`
automaticamente.

Para trocar fotos: coloque o arquivo novo em `img/`, aponte `image` para ele no
`js/catalog.js`, e rode `python3 scripts/optimize_images.py` de novo se quiser
que o script também otimize as novas fotos (ajuste o `SOURCE_MAP` no script).

## Cupons

Editados em `COUPONS` dentro de `js/pricing.js` (hoje só `PRIMEIRA10` = 10%).

## Chave PIX

Como o site é um arquivo estático, a chave PIX fica escrita diretamente em
`js/store.js` (procure por `contato@vinhoharmonia.com.br`) em vez de vir de
uma variável de ambiente — troque direto lá se um dia mudar.
```

- [ ] **Step 3: Commit**

```bash
git add PUBLICAR.md
git commit -m "docs: add deployment and catalog-editing guide"
```

---

## Post-plan note

Endereço físico da loja e as credenciais reais do Mercado Pago/Melhor Envio
ficaram como placeholders (ver `.env.example` e the `LiquorStore` JSON-LD in
`index.html`) — trocar assim que o usuário fornecer esses dados, sem precisar
tocar em mais nada no código.
