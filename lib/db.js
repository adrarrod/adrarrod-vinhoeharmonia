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

function getRealExecute() {
  const { sql } = require('@vercel/postgres');
  return (text, params) => sql.query(text, params);
}

module.exports = { SCHEMA_SQL, ensureSchema, insertOrder, listOrders, getOrderById, updateOrderStatus, getRealExecute };
