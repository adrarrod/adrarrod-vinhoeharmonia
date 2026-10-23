// lib/club-wines-service.js — "Vinhos do clube": o admin cadastra, para cada
// assinante, os vinhos do catálogo e o mês em que ele recebe; o assinante vê os
// vinhos a partir do mês deles e dá a nota (1 a 5 estrelas).
const defaultDb = require('./db.js');
const Catalog = require('../js/catalog.js');
const Club = require('../js/club.js');

// errors = lista dos campos com problema: 'slug' e/ou 'month'.
class ClubWineError extends Error {
  constructor(errors) {
    super(`Invalid club wine: ${errors.join(', ')}`);
    this.name = 'ClubWineError';
    this.errors = errors;
  }
}

function dbOf(deps) {
  return deps.db || defaultDb;
}

function nowOf(deps) {
  return deps.now ? deps.now() : Date.now();
}

async function ensureSchemas(deps, db) {
  await db.ensureSubscribersSchema(deps.execute);
  await db.ensureClubWinesSchema(deps.execute);
}

function iso(value) {
  if (value === null || value === undefined) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Forma entregue às páginas. O nome vem do catálogo (se o vinho saiu do
// catálogo, o admin ainda o vê pelo código).
function toApi(row) {
  const wine = Catalog.findBySlug(row.wine_slug);
  return {
    id: row.id,
    slug: row.wine_slug,
    name: wine ? wine.name : row.wine_slug,
    month: row.month,
    rating: row.rating === null || row.rating === undefined ? null : row.rating,
    ratedAt: iso(row.rated_at)
  };
}

// ---- painel administrativo ------------------------------------------------

// Todos os vinhos do assinante (inclusive meses futuros), ou null se ele não existe.
async function adminList(deps, subscriberId) {
  const db = dbOf(deps);
  await ensureSchemas(deps, db);
  if (!(await db.getSubscriberBy(deps.execute, 'id', subscriberId))) return null;
  return (await db.listClubWines(deps.execute, subscriberId)).map(toApi);
}

// { status: 'ok', wine } | { status: 'duplicate' } | { status: 'not_found' };
// dados inválidos lançam ClubWineError. O estoque não é mexido: ele continua
// sendo ajustado pelo admin na seção Estoque.
async function adminAdd(deps, subscriberId, payload) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const errors = [];
  if (typeof body.slug !== 'string' || !Catalog.findBySlug(body.slug)) errors.push('slug');
  if (!Club.isValidMonth(body.month)) errors.push('month');
  if (errors.length) throw new ClubWineError(errors);

  const db = dbOf(deps);
  await ensureSchemas(deps, db);
  if (!(await db.getSubscriberBy(deps.execute, 'id', subscriberId))) return { status: 'not_found' };
  const row = await db.insertClubWine(deps.execute, subscriberId, body.slug, body.month);
  return row ? { status: 'ok', wine: toApi(row) } : { status: 'duplicate' };
}

async function adminRemove(deps, subscriberId, wineId) {
  const db = dbOf(deps);
  await ensureSchemas(deps, db);
  return db.deleteClubWine(deps.execute, subscriberId, wineId);
}

// ---- área do assinante ----------------------------------------------------

// Só os vinhos do mês atual e dos anteriores: os próximos continuam surpresa.
// Vinho que saiu do catálogo não tem o que mostrar e fica de fora.
async function listForSubscriber(deps, subscriber) {
  const db = dbOf(deps);
  await ensureSchemas(deps, db);
  const rows = await db.listClubWines(deps.execute, subscriber.id, Club.currentMonth(nowOf(deps)));
  return rows.filter((r) => Catalog.findBySlug(r.wine_slug)).map(toApi);
}

// { status: 'ok', wine } | { status: 'invalid' } (nota fora de 1..5) |
// { status: 'not_found' } (não é dele, o mês não começou ou não existe).
async function rate(deps, subscriber, wineId, rating) {
  if (!Club.isValidRating(rating)) return { status: 'invalid' };
  const db = dbOf(deps);
  await ensureSchemas(deps, db);
  const row = await db.rateClubWine(deps.execute, subscriber.id, wineId, rating, Club.currentMonth(nowOf(deps)));
  return row ? { status: 'ok', wine: toApi(row) } : { status: 'not_found' };
}

module.exports = { ClubWineError, adminList, adminAdd, adminRemove, listForSubscriber, rate };
