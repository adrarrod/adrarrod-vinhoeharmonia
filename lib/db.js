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

// Cadastro de assinantes (uso interno da loja, pelo painel admin). Só nome e
// telefone são obrigatórios; o resto do endereço e o e-mail podem ficar vazios.
const SUBSCRIBERS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS subscribers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address_street TEXT,
  address_complement TEXT,
  address_number TEXT,
  address_neighborhood TEXT,
  address_city TEXT,
  address_state TEXT,
  address_cep TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

// Área do assinante: login com celular ou e-mail. password_hash nulo = ainda
// está na senha inicial (nada é gravado para ela); failed_attempts/locked_until
// seguram quem erra a senha várias vezes seguidas.
const SUBSCRIBERS_LOGIN_COLUMNS_SQL = `
ALTER TABLE subscribers
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
`;

async function ensureSubscribersSchema(execute) {
  await execute(SUBSCRIBERS_SCHEMA_SQL, []);
  await execute(SUBSCRIBERS_LOGIN_COLUMNS_SQL, []);
}

// Busca um assinante por id, celular (só dígitos) ou e-mail (sem diferenciar
// maiúsculas). O nome da coluna vem de uma lista fechada, nunca do usuário.
async function getSubscriberBy(execute, field, value) {
  let where;
  let param = value;
  if (field === 'id') where = 'id = $1';
  else if (field === 'phone') where = 'phone = $1';
  else if (field === 'email') { where = 'LOWER(email) = $1'; param = String(value).toLowerCase(); }
  else throw new Error('unsupported field: ' + field);
  const result = await execute(`SELECT * FROM subscribers WHERE ${where} LIMIT 1;`, [param]);
  return result.rows.length ? result.rows[0] : null;
}

// Outros assinantes com o mesmo celular ou e-mail (excludeId = o que está sendo
// editado, para ele não conflitar consigo mesmo).
async function findSubscriberConflicts(execute, { phone, email, excludeId }) {
  const result = await execute(
    `SELECT id, phone, email FROM subscribers
     WHERE (phone = $1 OR ($2::text IS NOT NULL AND LOWER(email) = $2))
       AND ($3::int IS NULL OR id <> $3);`,
    [phone, email ? String(email).toLowerCase() : null, excludeId === undefined ? null : excludeId]
  );
  return result.rows;
}

// Soma uma senha errada; ao chegar em maxAttempts trava a conta por lockMinutes
// e recomeça a contagem. Tudo num UPDATE só, então dois erros ao mesmo tempo
// não se perdem.
async function recordFailedLogin(execute, id, maxAttempts, lockMinutes) {
  const result = await execute(
    `UPDATE subscribers SET
       failed_attempts = CASE WHEN failed_attempts + 1 >= $2 THEN 0 ELSE failed_attempts + 1 END,
       locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
     WHERE id = $1
     RETURNING failed_attempts, locked_until;`,
    [id, maxAttempts, lockMinutes]
  );
  return result.rows[0] || null;
}

async function clearLoginFailures(execute, id) {
  await execute('UPDATE subscribers SET failed_attempts = 0, locked_until = NULL WHERE id = $1;', [id]);
}

// hash nulo = volta para a senha inicial. Troca de senha também destrava a conta.
async function setSubscriberPasswordHash(execute, id, hash) {
  const result = await execute(
    'UPDATE subscribers SET password_hash = $2, failed_attempts = 0, locked_until = NULL WHERE id = $1 RETURNING id;',
    [id, hash]
  );
  return result.rows.length === 1;
}

async function insertSubscriber(execute, v) {
  const result = await execute(
    `INSERT INTO subscribers (
       name, phone, email, address_street, address_complement, address_number,
       address_neighborhood, address_city, address_state, address_cep
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *;`,
    [v.name, v.phone, v.email, v.street, v.complement, v.number, v.neighborhood, v.city, v.state, v.cep]
  );
  return result.rows[0];
}

// Reescreve todos os campos do assinante (o formulário sempre manda o cadastro
// inteiro); created_at não muda. Devolve a linha nova, ou null se o id não existe.
async function updateSubscriber(execute, id, v) {
  const result = await execute(
    `UPDATE subscribers SET
       name = $1, phone = $2, email = $3, address_street = $4, address_complement = $5,
       address_number = $6, address_neighborhood = $7, address_city = $8,
       address_state = $9, address_cep = $10
     WHERE id = $11
     RETURNING *;`,
    [v.name, v.phone, v.email, v.street, v.complement, v.number, v.neighborhood, v.city, v.state, v.cep, id]
  );
  return result.rows.length === 1 ? result.rows[0] : null;
}

async function listSubscribers(execute) {
  const result = await execute('SELECT * FROM subscribers ORDER BY created_at DESC, id DESC;', []);
  return result.rows;
}

async function deleteSubscriber(execute, id) {
  const result = await execute('DELETE FROM subscribers WHERE id = $1 RETURNING id;', [id]);
  return result.rows.length === 1;
}

// Questionário do clube: cada envio é uma linha nova (nunca se sobrescreve),
// então o histórico vem de graça e "as respostas atuais" são a linha mais nova.
// Apagar o assinante apaga as respostas dele junto.
const QUESTIONNAIRE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS questionnaire_responses (
  id SERIAL PRIMARY KEY,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  answers JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
const QUESTIONNAIRE_INDEX_SQL = 'CREATE INDEX IF NOT EXISTS questionnaire_responses_subscriber_idx ON questionnaire_responses (subscriber_id);';

// Precisa da tabela de assinantes já criada (chave estrangeira).
async function ensureQuestionnaireSchema(execute) {
  await execute(QUESTIONNAIRE_SCHEMA_SQL, []);
  await execute(QUESTIONNAIRE_INDEX_SQL, []);
}

async function insertQuestionnaireResponse(execute, subscriberId, version, answers) {
  const result = await execute(
    'INSERT INTO questionnaire_responses (subscriber_id, version, answers) VALUES ($1, $2, $3::jsonb) RETURNING *;',
    [subscriberId, version, JSON.stringify(answers)]
  );
  return result.rows[0];
}

async function getLatestQuestionnaireResponse(execute, subscriberId) {
  const result = await execute('SELECT * FROM questionnaire_responses WHERE subscriber_id = $1 ORDER BY id DESC LIMIT 1;', [subscriberId]);
  return result.rows.length ? result.rows[0] : null;
}

async function listQuestionnaireHistory(execute, subscriberId) {
  const result = await execute('SELECT * FROM questionnaire_responses WHERE subscriber_id = $1 ORDER BY id DESC;', [subscriberId]);
  return result.rows;
}

// Uma linha por assinante que já respondeu: o envio mais novo, mais nome,
// celular, e-mail, quantos envios ele já fez e a data do primeiro.
async function listLatestQuestionnaireResponses(execute) {
  const result = await execute(
    `SELECT r.id, r.subscriber_id, r.version, r.answers, r.created_at,
            (SELECT COUNT(*) FROM questionnaire_responses c WHERE c.subscriber_id = r.subscriber_id)::int AS submissions,
            (SELECT MIN(c.created_at) FROM questionnaire_responses c WHERE c.subscriber_id = r.subscriber_id) AS first_submitted_at,
            s.name, s.phone, s.email
     FROM (SELECT DISTINCT ON (subscriber_id) * FROM questionnaire_responses ORDER BY subscriber_id, id DESC) r
     JOIN subscribers s ON s.id = r.subscriber_id
     ORDER BY r.created_at DESC;`,
    []
  );
  return result.rows;
}

async function updateSubscriberEmail(execute, id, email) {
  const result = await execute('UPDATE subscribers SET email = $2 WHERE id = $1 RETURNING id;', [id, email]);
  return result.rows.length === 1;
}

// Vinhos do clube: o que o admin cadastra para cada assinante e o mês em que ele
// recebe ("AAAA-MM"), mais a nota (1 a 5 estrelas) que o assinante dá depois.
// Um vinho só pode estar uma vez em cada mês do mesmo assinante. Apagar o
// assinante apaga os vinhos dele junto. Precisa da tabela subscribers criada.
const CLUB_WINES_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS club_wines (
  id SERIAL PRIMARY KEY,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  wine_slug TEXT NOT NULL,
  month TEXT NOT NULL,
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  rated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subscriber_id, wine_slug, month)
);
`;

async function ensureClubWinesSchema(execute) {
  await execute(CLUB_WINES_SCHEMA_SQL, []);
}

// Devolve a linha criada, ou null se esse vinho já estava cadastrado nesse mês.
async function insertClubWine(execute, subscriberId, wineSlug, month) {
  const result = await execute(
    'INSERT INTO club_wines (subscriber_id, wine_slug, month) VALUES ($1, $2, $3) ON CONFLICT (subscriber_id, wine_slug, month) DO NOTHING RETURNING *;',
    [subscriberId, wineSlug, month]
  );
  return result.rows.length ? result.rows[0] : null;
}

// Vinhos de um assinante, do mês mais novo para o mais antigo. upToMonth
// ("AAAA-MM") corta os meses futuros: é o que o próprio assinante pode ver.
async function listClubWines(execute, subscriberId, upToMonth) {
  const result = upToMonth === undefined
    ? await execute('SELECT * FROM club_wines WHERE subscriber_id = $1 ORDER BY month DESC, id DESC;', [subscriberId])
    : await execute('SELECT * FROM club_wines WHERE subscriber_id = $1 AND month <= $2 ORDER BY month DESC, id DESC;', [subscriberId, upToMonth]);
  return result.rows;
}

async function deleteClubWine(execute, subscriberId, id) {
  const result = await execute('DELETE FROM club_wines WHERE id = $1 AND subscriber_id = $2 RETURNING id;', [id, subscriberId]);
  return result.rows.length === 1;
}

// Só vale para o vinho do próprio assinante e depois que o mês dele começou;
// qualquer outro caso não atualiza nada e devolve null.
async function rateClubWine(execute, subscriberId, id, rating, upToMonth) {
  const result = await execute(
    `UPDATE club_wines SET rating = $3, rated_at = now()
     WHERE id = $1 AND subscriber_id = $2 AND month <= $4
     RETURNING *;`,
    [id, subscriberId, rating, upToMonth]
  );
  return result.rows.length ? result.rows[0] : null;
}

// Assinatura do Clube V&H Personnalité: dados do cliente que a contratação pede
// (CPF, nascimento, referência de entrega), a assinatura em si (com um status
// que só o admin muda), o histórico de cada mudança de status e o registro dos
// consentimentos (o que foi aceito, em qual versão do texto e quando).
const SUBSCRIPTIONS_COLUMNS_SQL = `
ALTER TABLE subscribers
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS address_reference TEXT;
`;
const SUBSCRIPTIONS_CPF_INDEX_SQL = 'CREATE UNIQUE INDEX IF NOT EXISTS subscribers_cpf_unique ON subscribers (cpf) WHERE cpf IS NOT NULL;';
const SUBSCRIPTIONS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  payment_link TEXT,
  payment_link_sent_at TIMESTAMPTZ,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
// Um cliente não pode ter duas assinaturas "abertas" do mesmo plano.
const SUBSCRIPTIONS_OPEN_INDEX_SQL = "CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_open_per_plan ON subscriptions (subscriber_id, plan) WHERE status IN ('awaiting_payment', 'active', 'payment_pending', 'suspended');";
const SUBSCRIPTION_EVENTS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS subscription_events (
  id SERIAL PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
const CONSENTS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS consents (
  id SERIAL PRIMARY KEY,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  version TEXT NOT NULL,
  accepted BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

// Já verificado nesta conexão? Evita 6 consultas a mais em toda requisição.
const subscriptionsReady = new WeakSet();

// Precisa da tabela subscribers já criada.
async function ensureSubscriptionsSchema(execute) {
  if (subscriptionsReady.has(execute)) return;
  await execute(SUBSCRIPTIONS_COLUMNS_SQL, []);
  await execute(SUBSCRIPTIONS_CPF_INDEX_SQL, []);
  await execute(SUBSCRIPTIONS_SCHEMA_SQL, []);
  await execute(SUBSCRIPTIONS_OPEN_INDEX_SQL, []);
  await execute(SUBSCRIPTION_EVENTS_SCHEMA_SQL, []);
  await execute(CONSENTS_SCHEMA_SQL, []);
  subscriptionsReady.add(execute);
}

// Cadastro completo de um cliente novo (contratação pelo site).
async function insertSubscriberWithProfile(execute, v) {
  const result = await execute(
    `INSERT INTO subscribers (
       name, phone, email, address_street, address_complement, address_number,
       address_neighborhood, address_city, address_state, address_cep, address_reference,
       cpf, birth_date, password_hash
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *;`,
    [v.name, v.phone, v.email, v.street, v.complement, v.number, v.neighborhood, v.city, v.state, v.cep, v.reference, v.cpf, v.birthDate, v.passwordHash]
  );
  return result.rows[0];
}

// Completa um cliente que já existia (cadastrado pelo admin) para a contratação:
// só endereço de entrega, CPF e nascimento. Nome, celular, e-mail e senha ficam.
async function updateSubscriberProfile(execute, id, v) {
  const result = await execute(
    `UPDATE subscribers SET
       address_street = $2, address_complement = $3, address_number = $4, address_neighborhood = $5,
       address_city = $6, address_state = $7, address_cep = $8, address_reference = $9,
       cpf = $10, birth_date = $11
     WHERE id = $1
     RETURNING *;`,
    [id, v.street, v.complement, v.number, v.neighborhood, v.city, v.state, v.cep, v.reference, v.cpf, v.birthDate]
  );
  return result.rows.length ? result.rows[0] : null;
}

// Outros clientes com o mesmo celular, e-mail ou CPF (excludeId = o próprio).
async function findSignupConflicts(execute, { phone, email, cpf, excludeId }) {
  const result = await execute(
    `SELECT id, phone, email, cpf FROM subscribers
     WHERE (phone = $1 OR ($2::text IS NOT NULL AND LOWER(email) = $2) OR ($3::text IS NOT NULL AND cpf = $3))
       AND ($4::int IS NULL OR id <> $4);`,
    [phone, email ? String(email).toLowerCase() : null, cpf || null, excludeId === undefined ? null : excludeId]
  );
  return result.rows;
}

// Registra os aceites num comando só: [{ type, version, accepted }].
async function insertConsents(execute, subscriberId, entries) {
  if (!entries.length) return;
  const params = [subscriberId];
  const values = entries.map((e) => {
    const base = params.length + 1;
    params.push(e.type, e.version, e.accepted);
    return `($1, $${base}, $${base + 1}, $${base + 2})`;
  });
  await execute(`INSERT INTO consents (subscriber_id, type, version, accepted) VALUES ${values.join(', ')};`, params);
}

// Devolve a assinatura criada, ou null se o cliente já tem uma aberta nesse plano.
async function insertSubscription(execute, { subscriberId, plan, priceCents, status }) {
  const result = await execute(
    `INSERT INTO subscriptions (subscriber_id, plan, price_cents, status, activated_at)
     VALUES ($1, $2, $3, $4::text, CASE WHEN $4::text = 'active' THEN now() END)
     ON CONFLICT DO NOTHING
     RETURNING *;`,
    [subscriberId, plan, priceCents, status]
  );
  return result.rows.length ? result.rows[0] : null;
}

async function insertSubscriptionEvent(execute, { subscriptionId, from, to, actor, note }) {
  await execute(
    'INSERT INTO subscription_events (subscription_id, from_status, to_status, actor, note) VALUES ($1, $2, $3, $4, $5);',
    [subscriptionId, from, to, actor, note]
  );
}

// Muda o status só se ele ainda for o esperado (duas pessoas clicando ao mesmo
// tempo não atropelam uma à outra) e grava o histórico no mesmo comando.
async function transitionSubscription(execute, id, from, to, actor, note) {
  const result = await execute(
    `WITH upd AS (
       UPDATE subscriptions SET status = $3, updated_at = now(),
         activated_at = CASE WHEN $3::text = 'active' AND activated_at IS NULL THEN now() ELSE activated_at END,
         cancelled_at = CASE WHEN $3::text = 'cancelled' THEN now() ELSE cancelled_at END
       WHERE id = $1 AND status = $2
       RETURNING *
     ), ev AS (
       INSERT INTO subscription_events (subscription_id, from_status, to_status, actor, note)
       SELECT id, $2::text, $3::text, $4::text, $5::text FROM upd
     )
     SELECT * FROM upd;`,
    [id, from, to, actor, note]
  );
  return result.rows.length ? result.rows[0] : null;
}

async function getSubscription(execute, id) {
  const result = await execute('SELECT * FROM subscriptions WHERE id = $1;', [id]);
  return result.rows.length ? result.rows[0] : null;
}

async function getLatestSubscription(execute, subscriberId) {
  const result = await execute('SELECT * FROM subscriptions WHERE subscriber_id = $1 ORDER BY id DESC LIMIT 1;', [subscriberId]);
  return result.rows.length ? result.rows[0] : null;
}

// Todas as solicitações, da mais nova para a mais antiga, já com os dados do
// cliente (sem a senha) e se ele respondeu ao questionário.
async function listSubscriptions(execute) {
  const result = await execute(
    `SELECT s.*,
            sub.name, sub.phone, sub.email, sub.cpf,
            sub.address_street, sub.address_number, sub.address_complement, sub.address_neighborhood,
            sub.address_city, sub.address_state, sub.address_cep, sub.address_reference,
            to_char(sub.birth_date, 'YYYY-MM-DD') AS birth_date,
            EXISTS (SELECT 1 FROM questionnaire_responses q WHERE q.subscriber_id = s.subscriber_id) AS questionnaire_answered
     FROM subscriptions s JOIN subscribers sub ON sub.id = s.subscriber_id
     ORDER BY s.requested_at DESC, s.id DESC;`,
    []
  );
  return result.rows;
}

// Quantas solicitações chegaram nos últimos minutos (freio contra cadastros em massa).
async function countRecentSubscriptions(execute, minutes) {
  const result = await execute('SELECT COUNT(*)::int AS total FROM subscriptions WHERE requested_at > now() - make_interval(mins => $1);', [minutes]);
  return result.rows[0].total;
}

async function listSubscriptionEvents(execute, subscriptionId) {
  const result = await execute('SELECT * FROM subscription_events WHERE subscription_id = $1 ORDER BY id DESC;', [subscriptionId]);
  return result.rows;
}

async function setSubscriptionPaymentLink(execute, id, link) {
  const result = await execute(
    'UPDATE subscriptions SET payment_link = $2, payment_link_sent_at = NULL, updated_at = now() WHERE id = $1 RETURNING *;',
    [id, link]
  );
  return result.rows.length ? result.rows[0] : null;
}

async function markPaymentLinkSent(execute, id) {
  const result = await execute(
    'UPDATE subscriptions SET payment_link_sent_at = now(), updated_at = now() WHERE id = $1 AND payment_link IS NOT NULL RETURNING *;',
    [id]
  );
  return result.rows.length ? result.rows[0] : null;
}

function getRealExecute() {
  const { sql } = require('@vercel/postgres');
  return (text, params) => sql.query(text, params);
}

module.exports = {
  SCHEMA_SQL, ensureSchema, insertOrder, listOrders, getOrderById, updateOrderStatus,
  getMelhorEnvioTokens, saveMelhorEnvioTokens,
  ensureStockSchema, getStock, reserveStock, releaseStock, setStock, cancelOrder,
  ensureSubscribersSchema, insertSubscriber, updateSubscriber, listSubscribers, deleteSubscriber,
  getSubscriberBy, findSubscriberConflicts, recordFailedLogin, clearLoginFailures, setSubscriberPasswordHash,
  ensureQuestionnaireSchema, insertQuestionnaireResponse, getLatestQuestionnaireResponse, listQuestionnaireHistory,
  listLatestQuestionnaireResponses, updateSubscriberEmail,
  ensureClubWinesSchema, insertClubWine, listClubWines, deleteClubWine, rateClubWine,
  ensureSubscriptionsSchema, insertSubscriberWithProfile, updateSubscriberProfile, findSignupConflicts, insertConsents,
  insertSubscription, insertSubscriptionEvent, transitionSubscription, getSubscription, getLatestSubscription,
  listSubscriptions, countRecentSubscriptions, listSubscriptionEvents, setSubscriptionPaymentLink, markPaymentLinkSent, getRealExecute
};
