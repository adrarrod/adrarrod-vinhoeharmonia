// lib/stock-service.js — regra de estoque: o cliente nunca compra mais do que existe.
const Catalog = require('../js/catalog.js');
const defaultDb = require('./db.js');

// Teto de sanidade para o que o admin digita (evita 1000000 por engano).
const MAX_STOCK = 9999;

class OutOfStockError extends Error {
  // items: [{ slug, name, available }] — só os vinhos que não têm o suficiente.
  constructor(items) {
    super(`Out of stock: ${items.map((i) => `${i.slug} (${i.available})`).join(', ')}`);
    this.name = 'OutOfStockError';
    this.items = items;
  }
}

class InvalidStockError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidStockError';
  }
}

function dbOf(deps) {
  return deps.db || defaultDb;
}

// Idempotente e barato: cria a tabela em um banco novo e semeia só os vinhos
// que ainda não têm linha, com o initialStock do catálogo.
async function ensureStock(deps) {
  const seed = Catalog.MENU.map((w) => ({ slug: w.slug, quantity: w.initialStock }));
  await dbOf(deps).ensureStockSchema(deps.execute, seed);
}

// Roda a cada visita à loja, então o caminho normal é UMA leitura. Só cria a
// tabela / semeia quando ela não existe ou falta linha de algum vinho.
async function getStockMap(deps) {
  let all = null;
  try {
    all = await dbOf(deps).getStock(deps.execute);
  } catch (err) {
    all = null; // tabela ainda não existe: o ensureStock abaixo cria (e propaga um erro real)
  }
  if (!all || Catalog.MENU.some((w) => !(w.slug in all))) {
    await ensureStock(deps);
    all = await dbOf(deps).getStock(deps.execute);
  }
  const map = {};
  for (const wine of Catalog.MENU) map[wine.slug] = all[wine.slug] || 0;
  return map;
}

function aggregate(items) {
  const wanted = new Map();
  for (const item of items) wanted.set(item.slug, (wanted.get(item.slug) || 0) + item.qty);
  return wanted;
}

async function releaseItems(deps, items) {
  for (const item of items) await dbOf(deps).releaseStock(deps.execute, item.slug, item.qty);
}

// Tudo ou nada: cada baixa é atômica no banco (nunca passa de zero), e se algum
// item não tiver o suficiente devolvemos o que já tinha sido baixado.
async function reserveItems(deps, items) {
  await ensureStock(deps);
  const db = dbOf(deps);
  const wanted = aggregate(items);
  const reserved = [];
  let failed = null;

  for (const [slug, qty] of wanted) {
    if (await db.reserveStock(deps.execute, slug, qty)) {
      reserved.push({ slug, qty });
    } else {
      failed = slug;
      break;
    }
  }
  if (failed === null) return;

  await releaseItems(deps, reserved);
  const current = await db.getStock(deps.execute);
  const short = [];
  for (const [slug, qty] of wanted) {
    const available = current[slug] || 0;
    if (available < qty || slug === failed) {
      short.push({ slug, name: Catalog.findBySlug(slug).name, available });
    }
  }
  throw new OutOfStockError(short);
}

async function setStockQuantity(deps, slug, quantity) {
  if (!Catalog.findBySlug(slug)) throw new InvalidStockError('unknown_wine');
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_STOCK) throw new InvalidStockError('invalid_quantity');
  await ensureStock(deps);
  await dbOf(deps).setStock(deps.execute, slug, quantity);
}

// Cancelar devolve as garrafas ao estoque — mas só na primeira vez.
async function cancelOrder(deps, id) {
  const items = await dbOf(deps).cancelOrder(deps.execute, id);
  if (!items) return { cancelled: false };
  await ensureStock(deps);
  await releaseItems(deps, items);
  return { cancelled: true };
}

module.exports = {
  MAX_STOCK, OutOfStockError, InvalidStockError,
  ensureStock, getStockMap, reserveItems, releaseItems, setStockQuantity, cancelOrder
};
