// test/questionario.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../js/questionario.js');

const REQUIRED = ['q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q11'];
const byId = (id) => Q.QUESTIONS.find((q) => q.id === id);

function minimal() {
  return {
    q2: ['Tintos'],
    q3: 'Médios — equilibrados, nem leves nem fortes',
    q4: 'Secos — sem gosto de açúcar',
    q5: 'Nunca reparei nisso',
    q6: 'Gosto dos dois',
    q7: 'Adoro conhecer novidades',
    q11: 'Um pouco de tudo'
  };
}

// ---------------------------------------------------------------- definição --

test('the questionnaire is "Clube V&H Personnalité" version 1.0, in 4 steps with 12 questions in order', () => {
  assert.equal(Q.DEFINITION.produto, 'Clube V&H Personnalité');
  assert.equal(Q.VERSION, '1.0');
  assert.deepEqual(Q.STEPS.map((s) => s.id), [1, 2, 3, 4]);
  assert.deepEqual(Q.QUESTIONS.map((q) => q.id), ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12']);
  assert.deepEqual(Q.STEPS.map((s) => s.perguntas.map((p) => p.id)), [['q1', 'q2', 'q3'], ['q4', 'q5', 'q6'], ['q7', 'q8', 'q9', 'q10'], ['q11', 'q12']]);
});

test('titles, texts and options are kept exactly as supplied', () => {
  assert.equal(Q.DEFINITION.titulo, 'Vamos descobrir seu paladar?');
  assert.equal(Q.DEFINITION.introducao, 'Cada pessoa tem um jeito único de apreciar vinho. Queremos conhecer o seu para escolher rótulos que combinem com seus gostos e apresentar novas descobertas. Não existem respostas certas ou erradas!');
  assert.deepEqual(Q.STEPS.map((s) => s.titulo), ['O que você gosta de beber?', 'Seu jeito de apreciar vinho', 'Suas experiências', 'Sua experiência no clube']);
  assert.equal(Q.STEPS[3].descricao, 'Estamos quase terminando!');
  assert.equal(byId('q2').texto, 'Quais tipos de vinho gostaria de receber no clube?');
  assert.deepEqual(byId('q3').opcoes, ['Leves — mais delicados e fáceis de beber', 'Médios — equilibrados, nem leves nem fortes', 'Fortes — com sabor mais intenso e marcante', 'Gosto de todos', 'Ainda não sei']);
  assert.equal(byId('q10').placeholder, 'Conte do seu jeito. Ex.: não gosto de vinhos muito fortes ou muito doces.');
  assert.equal(byId('q12').placeholder, 'Se lembrar do nome, pode escrever. Se não, tudo bem!');
});

test('required questions, types, exclusive options and the 500-character limit match the specification', () => {
  assert.deepEqual(Q.QUESTIONS.filter((q) => q.obrigatoria).map((q) => q.id), REQUIRED);
  assert.deepEqual(Q.QUESTIONS.map((q) => q.tipo), ['multipla', 'multipla', 'unica', 'unica', 'unica', 'unica', 'unica', 'multipla', 'multipla', 'texto_livre', 'unica', 'texto_livre']);
  assert.equal(byId('q1').opcao_exclusiva, 'Ainda estou descobrindo');
  assert.equal(byId('q2').opcao_exclusiva, 'Quero experimentar todos os tipos');
  assert.equal(byId('q9').opcao_exclusiva, 'Não conheço nenhuma');
  assert.deepEqual(Q.QUESTIONS.filter((q) => q.opcao_exclusiva).map((q) => q.id), ['q1', 'q2', 'q9']);
  assert.equal(byId('q10').limite_caracteres, 500);
  assert.equal(byId('q12').limite_caracteres, 500);
});

// ---------------------------------------------------------- opção exclusiva --

test('picking the exclusive option clears the others, and picking any other clears the exclusive one', () => {
  const q1 = byId('q1');
  let sel = Q.toggleOption(q1, [], 'Tintos');
  sel = Q.toggleOption(q1, sel, 'Brancos');
  assert.deepEqual(sel, ['Tintos', 'Brancos']);
  sel = Q.toggleOption(q1, sel, 'Ainda estou descobrindo');
  assert.deepEqual(sel, ['Ainda estou descobrindo']);
  sel = Q.toggleOption(q1, sel, 'Rosés');
  assert.deepEqual(sel, ['Rosés']);
});

test('toggling a selected option again unselects it; the original array is never changed', () => {
  const q8 = byId('q8');
  const start = ['Para relaxar em casa'];
  const added = Q.toggleOption(q8, start, 'Em comemorações');
  assert.deepEqual(start, ['Para relaxar em casa']);
  assert.deepEqual(added, ['Para relaxar em casa', 'Em comemorações']);
  assert.deepEqual(Q.toggleOption(q8, added, 'Para relaxar em casa'), ['Em comemorações']);
});

test('a multiple-choice question without an exclusive option lets everything be picked', () => {
  const q8 = byId('q8');
  let sel = [];
  for (const o of q8.opcoes) sel = Q.toggleOption(q8, sel, o);
  assert.deepEqual(sel, q8.opcoes);
});

test('q2 and q9 also behave as exclusive', () => {
  assert.deepEqual(Q.toggleOption(byId('q2'), ['Tintos', 'Brancos'], 'Quero experimentar todos os tipos'), ['Quero experimentar todos os tipos']);
  assert.deepEqual(Q.toggleOption(byId('q9'), ['Malbec'], 'Não conheço nenhuma'), ['Não conheço nenhuma']);
  assert.deepEqual(Q.toggleOption(byId('q9'), ['Não conheço nenhuma'], 'Merlot'), ['Merlot']);
});

// ---------------------------------------------------------------- validação --

test('an answer sheet with every required question answered is valid, and the optional ones may stay empty', () => {
  const r = Q.validateAnswers(minimal());
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, {});
  assert.deepEqual(Object.keys(r.value), Q.QUESTIONS.map((q) => q.id), 'normalised value has every question, in order');
  assert.deepEqual(r.value.q1, []);
  assert.equal(r.value.q10, '');
  assert.deepEqual(r.value.q2, ['Tintos']);
});

test('every missing required question is reported, however it was left empty', () => {
  const r = Q.validateAnswers({ q2: [], q3: '', q4: null, q5: undefined, q6: '   ' });
  assert.equal(r.valid, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['q11', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']);
  assert.ok(Object.values(r.errors).every((e) => e === 'required'));
  assert.equal(Q.validateAnswers(undefined).valid, false);
  assert.equal(Q.validateAnswers('texto').valid, false);
  assert.equal(Q.validateAnswers(null).valid, false);
});

test('an option that is not on the list is refused, for single and multiple choice', () => {
  const a = minimal(); a.q3 = 'Muito forte';
  assert.deepEqual(Q.validateAnswers(a).errors, { q3: 'invalid' });
  const b = minimal(); b.q2 = ['Tintos', 'Vinho de laranja'];
  assert.deepEqual(Q.validateAnswers(b).errors, { q2: 'invalid' });
  const c = minimal(); c.q8 = ['Em comemorações', 'Na lua'];
  assert.deepEqual(Q.validateAnswers(c).errors, { q8: 'invalid' });
});

test('the wrong shape is refused: a list for single choice, text for multiple choice', () => {
  const a = minimal(); a.q3 = ['Gosto de todos'];
  assert.deepEqual(Q.validateAnswers(a).errors, { q3: 'invalid' });
  const b = minimal(); b.q2 = 'Tintos';
  assert.deepEqual(Q.validateAnswers(b).errors, { q2: 'invalid' });
  const c = minimal(); c.q10 = ['a'];
  assert.deepEqual(Q.validateAnswers(c).errors, { q10: 'invalid' });
});

test('the server also refuses an exclusive option sent together with other options', () => {
  const a = minimal(); a.q2 = ['Tintos', 'Quero experimentar todos os tipos'];
  assert.deepEqual(Q.validateAnswers(a).errors, { q2: 'invalid' });
  const b = minimal(); b.q9 = ['Malbec', 'Não conheço nenhuma'];
  assert.deepEqual(Q.validateAnswers(b).errors, { q9: 'invalid' });
  const ok = minimal(); ok.q9 = ['Não conheço nenhuma'];
  assert.equal(Q.validateAnswers(ok).valid, true);
});

test('free text is trimmed, may be empty, and is limited to 500 characters', () => {
  const a = minimal(); a.q10 = '  não gosto de vinhos doces  '; a.q12 = '';
  const r = Q.validateAnswers(a);
  assert.equal(r.valid, true);
  assert.equal(r.value.q10, 'não gosto de vinhos doces');
  assert.equal(r.value.q12, '');

  const edge = minimal(); edge.q10 = 'x'.repeat(500);
  assert.equal(Q.validateAnswers(edge).valid, true);
  const tooLong = minimal(); tooLong.q10 = 'x'.repeat(501);
  assert.deepEqual(Q.validateAnswers(tooLong).errors, { q10: 'too_long' });
});

test('repeated options are collapsed and unknown question ids are dropped, never stored', () => {
  const a = minimal(); a.q8 = ['Em comemorações', 'Em comemorações']; a.q99 = 'hack'; a.__proto__x = 'y';
  const r = Q.validateAnswers(a);
  assert.equal(r.valid, true);
  assert.deepEqual(r.value.q8, ['Em comemorações']);
  assert.ok(!('q99' in r.value));
});

test('missingRequired lists, for one step, the required questions still without an answer', () => {
  assert.deepEqual(Q.missingRequired(0, {}), ['q2', 'q3']);
  assert.deepEqual(Q.missingRequired(0, { q2: ['Tintos'] }), ['q3']);
  assert.deepEqual(Q.missingRequired(0, { q2: ['Tintos'], q3: 'Gosto de todos' }), []);
  assert.deepEqual(Q.missingRequired(2, {}), ['q7'], 'optional questions never block');
  assert.deepEqual(Q.missingRequired(3, { q12: 'x' }), ['q11']);
});

test('stepIndexOf tells which step a question belongs to', () => {
  assert.equal(Q.stepIndexOf('q1'), 0);
  assert.equal(Q.stepIndexOf('q6'), 1);
  assert.equal(Q.stepIndexOf('q10'), 2);
  assert.equal(Q.stepIndexOf('q12'), 3);
  assert.equal(Q.stepIndexOf('nope'), -1);
});
