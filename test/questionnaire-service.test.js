// test/questionnaire-service.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const qs = require('../lib/questionnaire-service.js');
const Q = require('../js/questionario.js');

function valid(overrides = {}) {
  return {
    q2: ['Tintos', 'Brancos'],
    q3: 'Médios — equilibrados, nem leves nem fortes',
    q4: 'Secos — sem gosto de açúcar',
    q5: 'Nunca reparei nisso',
    q6: 'Gosto dos dois',
    q7: 'Adoro conhecer novidades',
    q11: 'Um pouco de tudo',
    q10: 'Não gosto de vinhos doces',
    ...overrides
  };
}

function fakeDb() {
  const subscribers = [
    { id: 1, name: 'Maria Silva', phone: '11987654321', email: null },
    { id: 2, name: 'João Souza', phone: '1133334444', email: 'joao@x.com' },
    { id: 3, name: 'Ana Lima', phone: '11955554444', email: 'ana@x.com' }
  ];
  const responses = [];
  let tick = 0;
  const calls = [];
  return {
    subscribers, responses, calls,
    async ensureSubscribersSchema() { calls.push('ensure-subscribers'); },
    async ensureQuestionnaireSchema() { calls.push('ensure-questionnaire'); },
    async getSubscriberBy(_e, field, value) { return subscribers.find((s) => s[field] === value) || null; },
    async findSubscriberConflicts(_e, { email, excludeId }) {
      return subscribers.filter((s) => s.id !== excludeId && email && s.email && s.email.toLowerCase() === email.toLowerCase()).map((s) => ({ id: s.id, phone: s.phone, email: s.email }));
    },
    async updateSubscriberEmail(_e, id, email) { calls.push(['email', id, email]); const s = subscribers.find((x) => x.id === id); if (!s) return false; s.email = email; return true; },
    async insertQuestionnaireResponse(_e, subscriberId, version, answers) {
      const row = { id: responses.length + 1, subscriber_id: subscriberId, version, answers, created_at: new Date(Date.UTC(2026, 9, 22, 12, 0, tick++)).toISOString() };
      responses.push(row);
      return row;
    },
    async getLatestQuestionnaireResponse(_e, subscriberId) {
      const mine = responses.filter((r) => r.subscriber_id === subscriberId);
      return mine.length ? mine[mine.length - 1] : null;
    },
    async listQuestionnaireHistory(_e, subscriberId) { return responses.filter((r) => r.subscriber_id === subscriberId).reverse(); },
    async listLatestQuestionnaireResponses() {
      const ids = [...new Set(responses.map((r) => r.subscriber_id))];
      return ids.map((id) => {
        const mine = responses.filter((r) => r.subscriber_id === id);
        const s = subscribers.find((x) => x.id === id);
        const last = mine[mine.length - 1];
        return { ...last, submissions: mine.length, first_submitted_at: mine[0].created_at, name: s.name, phone: s.phone, email: s.email };
      }).reverse();
    }
  };
}
const deps = (db) => ({ execute: async () => ({ rows: [] }), db });
const rowOf = (db, id) => db.subscribers.find((s) => s.id === id);

// ------------------------------------------------------------------ envio --

test('a valid submission is saved for the logged-in subscriber, with the questionnaire version, and returns the date', async () => {
  const db = fakeDb();
  const result = await qs.submit(deps(db), rowOf(db, 2), { email: 'joao@x.com', answers: valid() });
  assert.equal(db.responses.length, 1);
  assert.equal(db.responses[0].subscriber_id, 2);
  assert.equal(db.responses[0].version, '1.0');
  assert.deepEqual(Object.keys(db.responses[0].answers), Q.QUESTIONS.map((q) => q.id));
  assert.equal(db.responses[0].answers.q10, 'Não gosto de vinhos doces');
  assert.ok(result.submittedAt);
  assert.ok(db.calls.includes('ensure-subscribers') && db.calls.includes('ensure-questionnaire'));
});

test('the e-mail is required, must look like an e-mail and may not be absurdly long', async () => {
  const db = fakeDb();
  for (const [email, reason] of [['', 'required'], [undefined, 'required'], ['   ', 'required'], ['sem-arroba', 'invalid'], ['a@b', 'invalid'], [`${'a'.repeat(250)}@x.com`, 'invalid'], [42, 'required']]) {
    await assert.rejects(
      () => qs.submit(deps(db), rowOf(db, 2), { email, answers: valid() }),
      (err) => err instanceof qs.QuestionnaireError && err.errors.email === reason,
      String(email)
    );
  }
  assert.equal(db.responses.length, 0);
});

test('missing required answers are reported by question, together with a bad e-mail, and nothing is saved', async () => {
  const db = fakeDb();
  await assert.rejects(
    () => qs.submit(deps(db), rowOf(db, 2), { email: 'x', answers: { q3: 'Gosto de todos' } }),
    (err) => {
      assert.ok(err instanceof qs.QuestionnaireError);
      assert.equal(err.errors.email, 'invalid');
      assert.deepEqual(Object.keys(err.errors.answers).sort(), ['q11', 'q2', 'q4', 'q5', 'q6', 'q7']);
      return true;
    }
  );
  assert.equal(db.responses.length, 0);
  assert.equal(db.calls.length, 0, 'no database access for a form that is invalid');
});

test('a subscriber without e-mail gets the e-mail added to the registration (lower case)', async () => {
  const db = fakeDb();
  await qs.submit(deps(db), rowOf(db, 1), { email: ' Maria@Example.COM ', answers: valid() });
  assert.equal(rowOf(db, 1).email, 'maria@example.com');
});

test('an unchanged e-mail is not rewritten, and a changed one replaces the old', async () => {
  const db = fakeDb();
  await qs.submit(deps(db), rowOf(db, 2), { email: 'JOAO@x.com', answers: valid() });
  assert.equal(db.calls.filter((c) => Array.isArray(c) && c[0] === 'email').length, 0);
  await qs.submit(deps(db), rowOf(db, 2), { email: 'joao.novo@x.com', answers: valid() });
  assert.equal(rowOf(db, 2).email, 'joao.novo@x.com');
});

test('an e-mail that belongs to another subscriber is refused and nothing is changed or saved', async () => {
  const db = fakeDb();
  await assert.rejects(
    () => qs.submit(deps(db), rowOf(db, 1), { email: 'ANA@x.com', answers: valid() }),
    (err) => err instanceof qs.QuestionnaireError && err.errors.email === 'duplicate'
  );
  assert.equal(rowOf(db, 1).email, null);
  assert.equal(db.responses.length, 0);
});

test('answering again adds a new version: the newest is the current one and the old one stays in the history', async () => {
  const db = fakeDb();
  const row = rowOf(db, 2);
  await qs.submit(deps(db), row, { email: 'joao@x.com', answers: valid({ q3: 'Gosto de todos' }) });
  await qs.submit(deps(db), row, { email: 'joao@x.com', answers: valid({ q3: 'Ainda não sei' }) });
  assert.equal(db.responses.length, 2);
  const current = await qs.load(deps(db), row);
  assert.equal(current.response.answers.q3, 'Ainda não sei');
  const detail = await qs.adminDetail(deps(db), 2);
  assert.deepEqual(detail.submissions.map((s) => s.answers.q3), ['Ainda não sei', 'Gosto de todos']);
});

test('the subscriber id comes only from the session row: an id sent in the payload is ignored', async () => {
  const db = fakeDb();
  await qs.submit(deps(db), rowOf(db, 2), { email: 'joao@x.com', answers: valid(), subscriberId: 3, subscriber_id: 3, id: 3 });
  assert.deepEqual(db.responses.map((r) => r.subscriber_id), [2]);
});

// ------------------------------------------------------- leitura / isolamento --

test('load gives a subscriber their own answers and e-mail, and nobody else\'s', async () => {
  const db = fakeDb();
  await qs.submit(deps(db), rowOf(db, 2), { email: 'joao@x.com', answers: valid({ q10: 'segredo do João' }) });

  const joao = await qs.load(deps(db), rowOf(db, 2));
  assert.equal(joao.email, 'joao@x.com');
  assert.equal(joao.response.answers.q10, 'segredo do João');
  assert.equal(joao.response.version, '1.0');
  assert.ok(joao.response.submittedAt);

  const ana = await qs.load(deps(db), rowOf(db, 3));
  assert.equal(ana.email, 'ana@x.com');
  assert.equal(ana.response, null);
  assert.ok(!JSON.stringify(ana).includes('segredo do João'));
});

test('statusFor says whether the subscriber has answered and when', async () => {
  const db = fakeDb();
  assert.deepEqual(await qs.statusFor(deps(db), rowOf(db, 2)), { answered: false, submittedAt: null });
  await qs.submit(deps(db), rowOf(db, 2), { email: 'joao@x.com', answers: valid() });
  const status = await qs.statusFor(deps(db), rowOf(db, 2));
  assert.equal(status.answered, true);
  assert.ok(status.submittedAt);
  assert.equal((await qs.statusFor(deps(db), rowOf(db, 3))).answered, false);
});

// ------------------------------------------------------------------- admin --

test('adminList shows who answered, when, how many times and the answers', async () => {
  const db = fakeDb();
  await qs.submit(deps(db), rowOf(db, 2), { email: 'joao@x.com', answers: valid() });
  await qs.submit(deps(db), rowOf(db, 3), { email: 'ana@x.com', answers: valid() });
  await qs.submit(deps(db), rowOf(db, 2), { email: 'joao@x.com', answers: valid({ q3: 'Gosto de todos' }) });
  const list = await qs.adminList(deps(db));
  assert.equal(list.length, 2);
  const joao = list.find((r) => r.subscriberId === 2);
  assert.equal(joao.name, 'João Souza');
  assert.equal(joao.phone, '1133334444');
  assert.equal(joao.email, 'joao@x.com');
  assert.equal(joao.version, '1.0');
  assert.equal(joao.submissions, 2);
  assert.ok(joao.submittedAt && joao.firstSubmittedAt);
  assert.equal(joao.answers.q3, 'Gosto de todos');
});

test('adminDetail returns the subscriber and every submission, or null when there is no such subscriber', async () => {
  const db = fakeDb();
  await qs.submit(deps(db), rowOf(db, 3), { email: 'ana@x.com', answers: valid() });
  const detail = await qs.adminDetail(deps(db), 3);
  assert.equal(detail.subscriber.name, 'Ana Lima');
  assert.equal(detail.submissions.length, 1);
  assert.equal(detail.submissions[0].version, '1.0');
  assert.equal(detail.submissions[0].answers.q2.length, 2);
  assert.equal((await qs.adminDetail(deps(db), 1)).submissions.length, 0, 'subscriber who has not answered yet');
  assert.equal(await qs.adminDetail(deps(db), 99), null);
});

test('exportCsv has one line per subscriber that answered, with the latest answers', async () => {
  const db = fakeDb();
  await qs.submit(deps(db), rowOf(db, 2), { email: 'joao@x.com', answers: valid() });
  const csv = await qs.exportCsv(deps(db));
  const lines = csv.replace(/^﻿/, '').split('\r\n').filter(Boolean);
  assert.equal(lines.length, 2, 'header + 1 subscriber');
  assert.ok(lines[1].includes('João Souza'));
  assert.ok(lines[1].includes('Tintos | Brancos'));
});
