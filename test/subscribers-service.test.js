// test/subscribers-service.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../lib/subscribers-service.js');

const full = {
  name: '  Maria Silva ',
  phone: '(11) 98765-4321',
  email: ' maria@example.com ',
  street: 'Rua das Flores',
  complement: 'Apto 4',
  number: '120',
  neighborhood: 'Centro',
  city: 'São Paulo',
  state: 'sp',
  cep: '01310-100'
};

test('only name and phone are required: everything else may be left blank', () => {
  const { valid, errors, value } = svc.validateSubscriber({ name: 'Ana', phone: '11987654321' });
  assert.equal(valid, true);
  assert.deepEqual(errors, []);
  assert.deepEqual(value, {
    name: 'Ana', phone: '11987654321', email: null, street: null, complement: null,
    number: null, neighborhood: null, city: null, state: null, cep: null
  });
});

test('a complete form is accepted and normalised (trimmed, digits-only phone/CEP, UF in capitals)', () => {
  const { valid, value } = svc.validateSubscriber(full);
  assert.equal(valid, true);
  assert.deepEqual(value, {
    name: 'Maria Silva', phone: '11987654321', email: 'maria@example.com', street: 'Rua das Flores',
    complement: 'Apto 4', number: '120', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', cep: '01310100'
  });
});

test('name and phone are reported when missing, blank or not text', () => {
  for (const payload of [{}, { name: '', phone: '' }, { name: '   ', phone: '   ' }, { name: 42, phone: 11987654321 }, null, undefined]) {
    const { valid, errors } = svc.validateSubscriber(payload);
    assert.equal(valid, false, JSON.stringify(payload));
    assert.ok(errors.includes('name'), JSON.stringify(payload));
    assert.ok(errors.includes('phone'), JSON.stringify(payload));
  }
});

test('a phone needs a DDD plus 8 or 9 digits; formatting characters are ignored', () => {
  for (const ok of ['1133334444', '11987654321', '(11) 3333-4444', '11 98765-4321']) {
    assert.equal(svc.validateSubscriber({ name: 'A', phone: ok }).valid, true, ok);
  }
  for (const bad of ['98765432', '123', '119876543210', 'abcdefghij']) {
    const r = svc.validateSubscriber({ name: 'A', phone: bad });
    assert.equal(r.valid, false, bad);
    assert.ok(r.errors.includes('phone'), bad);
  }
});

test('e-mail is optional, but when filled it must look like an e-mail', () => {
  assert.equal(svc.validateSubscriber({ name: 'A', phone: '1133334444', email: '' }).valid, true);
  for (const bad of ['maria', 'maria@', '@example.com', 'maria@example', 'ma ria@example.com']) {
    const r = svc.validateSubscriber({ name: 'A', phone: '1133334444', email: bad });
    assert.ok(r.errors.includes('email'), bad);
  }
});

test('CEP is optional, but when filled it must have 8 digits (with or without the hyphen)', () => {
  for (const ok of ['01310-100', '01310100']) {
    assert.equal(svc.validateSubscriber({ name: 'A', phone: '1133334444', cep: ok }).value.cep, '01310100', ok);
  }
  for (const bad of ['0131', '01310-10', '013101000', 'abcdefgh']) {
    assert.ok(svc.validateSubscriber({ name: 'A', phone: '1133334444', cep: bad }).errors.includes('cep'), bad);
  }
});

test('state is optional, but when filled it must be a 2-letter UF', () => {
  assert.equal(svc.validateSubscriber({ name: 'A', phone: '1133334444', state: 'rj' }).value.state, 'RJ');
  for (const bad of ['S', 'SPP', '12', 'S1']) {
    assert.ok(svc.validateSubscriber({ name: 'A', phone: '1133334444', state: bad }).errors.includes('state'), bad);
  }
});

test('every field has a size limit, so a pasted wall of text cannot fill the database', () => {
  const long = 'x'.repeat(300);
  const r = svc.validateSubscriber({ name: long, phone: '1133334444', street: long, complement: long, number: long, neighborhood: long, city: long, email: long + '@example.com' });
  for (const field of ['name', 'street', 'complement', 'number', 'neighborhood', 'city', 'email']) {
    assert.ok(r.errors.includes(field), field);
  }
});

test('unknown fields in the payload are ignored, never stored', () => {
  const { value } = svc.validateSubscriber({ name: 'A', phone: '1133334444', isAdmin: true, id: 99, created_at: 'x' });
  assert.deepEqual(Object.keys(value).sort(), ['cep', 'city', 'complement', 'email', 'name', 'neighborhood', 'number', 'phone', 'state', 'street']);
});

// --- operações com o banco (db falso) ---

function fakeDb() {
  const calls = [];
  const rows = [];
  return {
    calls,
    rows,
    async ensureSubscribersSchema() { calls.push(['ensure']); },
    async insertSubscriber(_execute, value) {
      calls.push(['insert', value]);
      const row = { id: rows.length + 1, created_at: '2026-10-22T10:00:00.000Z', ...Object.fromEntries(Object.entries(value).map(([k, v]) => ['address_' + k, v])), name: value.name, phone: value.phone, email: value.email };
      rows.push(row);
      return row;
    },
    async listSubscribers() { calls.push(['list']); return [...rows].reverse(); },
    async updateSubscriber(_execute, id, value) {
      calls.push(['update', id, value]);
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      Object.assign(row, { name: value.name, phone: value.phone, email: value.email, address_street: value.street, address_complement: value.complement, address_number: value.number, address_neighborhood: value.neighborhood, address_city: value.city, address_state: value.state, address_cep: value.cep });
      return row;
    },
    async deleteSubscriber(_execute, id) { calls.push(['delete', id]); const i = rows.findIndex((r) => r.id === id); if (i === -1) return false; rows.splice(i, 1); return true; }
  };
}
const deps = (db) => ({ execute: async () => ({ rows: [] }), db });

test('createSubscriber makes sure the table exists, stores the normalised data and returns the API shape', async () => {
  const db = fakeDb();
  const created = await svc.createSubscriber(deps(db), full);
  assert.equal(db.calls[0][0], 'ensure');
  assert.equal(db.calls[1][0], 'insert');
  assert.equal(db.calls[1][1].phone, '11987654321');
  assert.equal(created.id, 1);
  assert.equal(created.name, 'Maria Silva');
  assert.equal(created.phone, '11987654321');
  assert.equal(created.cep, '01310100');
  assert.equal(created.state, 'SP');
  assert.equal(created.createdAt, '2026-10-22T10:00:00.000Z');
});

test('createSubscriber throws ValidationError listing the bad fields and never touches the database', async () => {
  const db = fakeDb();
  await assert.rejects(
    () => svc.createSubscriber(deps(db), { name: '', phone: '123', email: 'x' }),
    (err) => {
      assert.ok(err instanceof svc.ValidationError);
      assert.deepEqual(err.errors.sort(), ['email', 'name', 'phone']);
      return true;
    }
  );
  assert.equal(db.calls.length, 0);
});

test('listSubscribers returns them newest first, in the API shape', async () => {
  const db = fakeDb();
  await svc.createSubscriber(deps(db), { name: 'Primeira', phone: '1133334444' });
  await svc.createSubscriber(deps(db), { name: 'Segunda', phone: '1133335555' });
  const list = await svc.listSubscribers(deps(db));
  assert.deepEqual(list.map((s) => s.name), ['Segunda', 'Primeira']);
  assert.equal(list[0].email, null);
  assert.ok('createdAt' in list[0]);
});

test('removeSubscriber deletes by id and tells whether something was removed', async () => {
  const db = fakeDb();
  await svc.createSubscriber(deps(db), { name: 'A', phone: '1133334444' });
  assert.equal(await svc.removeSubscriber(deps(db), 1), true);
  assert.equal(await svc.removeSubscriber(deps(db), 1), false);
});

test('updateSubscriber validates like a new registration, replaces the data and returns the API shape', async () => {
  const db = fakeDb();
  await svc.createSubscriber(deps(db), full);
  db.calls.length = 0;
  const updated = await svc.updateSubscriber(deps(db), 1, { name: ' Maria Souza ', phone: '(11) 3333-4444', email: '', street: '', complement: '', number: '', neighborhood: '', city: 'Campinas', state: 'sp', cep: '' });
  assert.equal(db.calls[0][0], 'ensure');
  assert.equal(db.calls[1][0], 'update');
  assert.equal(db.calls[1][1], 1);
  assert.equal(updated.id, 1);
  assert.equal(updated.name, 'Maria Souza');
  assert.equal(updated.phone, '1133334444');
  assert.equal(updated.email, null, 'a field cleared in the form is cleared in the database');
  assert.equal(updated.city, 'Campinas');
  assert.equal(updated.state, 'SP');
  assert.equal(updated.cep, null);
  assert.equal(updated.createdAt, '2026-10-22T10:00:00.000Z');
});

test('updateSubscriber throws ValidationError for a bad form and never touches the database', async () => {
  const db = fakeDb();
  await assert.rejects(
    () => svc.updateSubscriber(deps(db), 1, { name: '', phone: '123' }),
    (err) => err instanceof svc.ValidationError && err.errors.sort().join() === 'name,phone'
  );
  assert.equal(db.calls.length, 0);
});

test('updateSubscriber returns null when the subscriber does not exist', async () => {
  const db = fakeDb();
  assert.equal(await svc.updateSubscriber(deps(db), 99, { name: 'A', phone: '1133334444' }), null);
});
