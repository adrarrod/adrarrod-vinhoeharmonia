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

const MELHOR_ENVIO_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS melhor_envio_tokens (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1)
);
`;

async function ensureSchema(execute) {
  await execute(SCHEMA_SQL, []);
}

async function ensureMelhorEnvioSchema(execute) {
  await execute(MELHOR_ENVIO_SCHEMA_SQL, []);
}

async function getMelhorEnvioTokens(execute) {
  await ensureMelhorEnvioSchema(execute);
  const result = await execute('SELECT access_token, refresh_token, expires_at FROM melhor_envio_tokens WHERE id = 1;', []);
  return result.rows[0] || null;
}

async function saveMelhorEnvioTokens(execute, { accessToken, refreshToken, expiresAt }) {
  await ensureMelhorEnvioSchema(execute);
  await execute(
    `INSERT INTO melhor_envio_tokens (id, access_token, refresh_token, expires_at, updated_at)
     VALUES (1, $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = now();`,
    [accessToken, refreshToken, expiresAt]
  );
}

async function insertOrder(execute, row) {
  const text = `INSERT INTO orders (
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

async function getOrderById(execute, id) {
  const result = await execute('SELECT * FROM orders WHERE id = $1;', [id]);
  return result.rows[0] || null;
}

async function updateOrderStatus(execute, id, status) {
  await execute('UPDATE orders SET status = $1 WHERE id = $2;', [status, id]);
}

// Estoque real de cada vinho. O catálogo (js/catalog.js) só traz a semente
// (initialStock); depois que a linha existe, o banco é a fonte de verdade.
const STOCK_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS stock (
  slug TEXT PRIMARY KEY,
  quantity INTEGER NOT NULL CHECK (quantity >= 0)
);
`;

// Cria a tabela e semeia só os vinhos que ainda não têm linha (ON CONFLICT DO
// NOTHING): não sobrescreve estoque já ajustado nem vendido.
async function ensureStockSchema(execute, seed) {
  await execute(STOCK_SCHEMA_SQL, []);
  if (!seed || seed.length === 0) return;
  const placeholders = seed.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
  const params = seed.flatMap((row) => [row.slug, row.quantity]);
  await execute(`INSERT INTO stock (slug, quantity) VALUES ${placeholders} ON CONFLICT (slug) DO NOTHING;`, params);
}

async function getStock(execute) {
  const result = await execute('SELECT slug, quantity FROM stock;', []);
  const map = {};
  for (const row of result.rows) map[row.slug] = row.quantity;
  return map;
}

// Baixa atômica: o WHERE quantity >= $2 garante que dois pedidos simultâneos
// nunca levem o estoque abaixo de zero (só um deles casa a linha).
async function reserveStock(execute, slug, qty) {
  const result = await execute(
    'UPDATE stock SET quantity = quantity - $2 WHERE slug = $1 AND quantity >= $2 RETURNING quantity;',
    [slug, qty]
  );
  return result.rows.length === 1;
}

async function releaseStock(execute, slug, qty) {
  await execute('UPDATE stock SET quantity = quantity + $2 WHERE slug = $1;', [slug, qty]);
}

async function setStock(execute, slug, quantity) {
  await execute(
    'INSERT INTO stock (slug, quantity) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET quantity = $2;',
    [slug, quantity]
  );
}

// Só devolve os itens na PRIMEIRA vez que o pedido é cancelado: cancelar de
// novo (duplo clique, requisição repetida) não pode devolver o estoque duas vezes.
async function cancelOrder(execute, id) {
  const result = await execute(
    "UPDATE orders SET status = 'cancelado' WHERE id = $1 AND status <> 'cancelado' RETURNING items;",
    [id]
  );
  return result.rows.length === 1 ? result.rows[0].items : null;
}

function getRealExecute() {
  const { sql } = require('@vercel/postgres');
  return (text, params) => sql.query(text, params);
}

module.exports = {
  SCHEMA_SQL, ensureSchema, insertOrder, listOrders, getOrderById, updateOrderStatus,
  getMelhorEnvioTokens, saveMelhorEnvioTokens,
  ensureStockSchema, getStock, reserveStock, releaseStock, setStock, cancelOrder, getRealExecute
};
