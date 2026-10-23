// test/questionnaire-csv.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCsv } = require('../lib/questionnaire-csv.js');
const Q = require('../js/questionario.js');

function row(overrides = {}) {
  return {
    subscriberId: 7,
    name: 'Maria Silva',
    phone: '11987654321',
    email: 'maria@x.com',
    version: '1.0',
    submissions: 2,
    firstSubmittedAt: '2026-10-20T13:05:00.000Z',
    submittedAt: '2026-10-22T23:30:00.000Z',
    answers: {
      q1: ['Tintos', 'Brancos'], q2: ['Quero experimentar todos os tipos'], q3: 'Gosto de todos',
      q4: 'Gosto dos dois', q5: 'Nunca reparei nisso', q6: 'Gosto dos dois', q7: 'Adoro conhecer novidades',
      q8: [], q9: ['Malbec', 'Merlot'], q10: 'Não gosto de vinho doce', q11: 'Um pouco de tudo', q12: ''
    },
    ...overrides
  };
}
const parse = (csv) => csv.replace(/^﻿/, '').split('\r\n').filter(Boolean);

test('the file starts with a UTF-8 BOM (so Excel shows accents) and uses ; and CRLF, the way Brazilian Excel expects', () => {
  const csv = buildCsv([row()]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.ok(csv.includes('\r\n'));
  assert.ok(parse(csv)[0].includes(';'));
});

test('the header has the subscriber columns and one column per question, with the question text', () => {
  const header = parse(buildCsv([row()]))[0];
  for (const label of ['ID', 'Nome', 'Celular', 'E-mail', 'Versão do questionário', 'Primeiro envio', 'Último envio', 'Nº de envios']) {
    assert.ok(header.includes(label), label);
  }
  for (const q of Q.QUESTIONS) assert.ok(header.includes(q.id + ' - ' + q.texto.replace(/"/g, '""')), q.id);
  assert.equal(header.split(';').length, 20, 'no stray separators in the header');
});

test('a row holds the data, a formatted phone (Excel would mangle the digits), dates in São Paulo time, and multiple choices joined by " | "', () => {
  const line = parse(buildCsv([row()]))[1];
  assert.ok(line.startsWith('7;Maria Silva;(11) 98765-4321;maria@x.com;v1.0;20/10/2026 10:05;22/10/2026 20:30;2;'));
  assert.ok(line.includes('Tintos | Brancos'));
  assert.ok(line.includes('Malbec | Merlot'));
  assert.ok(line.includes('Quero experimentar todos os tipos'));
});

test('unanswered optional questions come out as empty cells', () => {
  const cells = parse(buildCsv([row()]))[1].split(';');
  assert.equal(cells.length, 20);
  assert.equal(cells[8 + 7], '', 'q8 (empty list)');
  assert.equal(cells[8 + 11], '', 'q12 (empty text)');
});

test('values with ;, quotes or line breaks are quoted and escaped, so the columns never shift', () => {
  const csv = buildCsv([row({ name: 'Silva; "Maria"', answers: { ...row().answers, q10: 'linha 1\nlinha 2; fim' } })]);
  const body = csv.replace(/^﻿/, '');
  assert.ok(body.includes('"Silva; ""Maria"""'));
  assert.ok(body.includes('"linha 1\nlinha 2; fim"'));
});

test('text that Excel could run as a formula is defused with a leading apostrophe', () => {
  const csv = buildCsv([row({ name: '=HYPERLINK("http://x")', answers: { ...row().answers, q10: '+cmd|calc', q12: '@SUM(A1)' } })]);
  const body = csv.replace(/^﻿/, '');
  assert.ok(body.includes("'=HYPERLINK"));
  assert.ok(body.includes("'+cmd|calc"));
  assert.ok(body.includes("'@SUM(A1)"));
  assert.ok(!/(^|;)"?=HYPERLINK/.test(body));
});

test('with nobody having answered the file still has the header', () => {
  assert.equal(parse(buildCsv([])).length, 1);
});
