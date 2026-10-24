// test/clube.test.js — regras da contratação do Clube V&H Personnalité
const test = require('node:test');
const assert = require('node:assert/strict');
const Clube = require('../js/clube.js');

// ------------------------------------------------------------------- plano --

test('the only plan is Clube V&H Personnalité, R$ 120,00 a month, two wines', () => {
  assert.equal(Clube.PLAN.id, 'personnalite');
  assert.equal(Clube.PLAN.name, 'Clube V&H Personnalité');
  assert.equal(Clube.PLAN.priceCents, 12000);
  assert.equal(Clube.PLAN.winesPerMonth, 2);
  assert.equal(Clube.SLOGAN, 'Seu paladar é único. Seus vinhos também.');
});

test('the out-of-area message is the one supplied', () => {
  assert.equal(Clube.OUT_OF_AREA_MESSAGE, 'Que bom ter seu interesse! Neste momento, o Clube V&H Personnalité atende somente endereços no estado de São Paulo. Esperamos chegar à sua região em breve.');
});

// --------------------------------------------------------------------- CPF --

test('a valid CPF passes, with or without punctuation', () => {
  for (const cpf of ['529.982.247-25', '52998224725', '111.444.777-35', ' 529.982.247-25 ']) assert.equal(Clube.isValidCpf(cpf), true, cpf);
});

test('a wrong check digit, repeated digits, wrong size and non-text are refused', () => {
  for (const cpf of ['529.982.247-24', '52998224726', '111.111.111-11', '00000000000', '12345678900', '5299822472', '529982247250', '', 'abc', null, undefined, 52998224725]) {
    assert.equal(Clube.isValidCpf(cpf), false, String(cpf));
  }
});

test('cleanDigits keeps only the numbers', () => {
  assert.equal(Clube.cleanDigits('529.982.247-25'), '52998224725');
  assert.equal(Clube.cleanDigits('(11) 98765-4321'), '11987654321');
  assert.equal(Clube.cleanDigits(null), '');
});

// ---------------------------------------------------------------- celular --

test('a mobile phone is DDD + 9 + eight digits (11 digits)', () => {
  assert.equal(Clube.isValidMobile('(11) 98765-4321'), true);
  assert.equal(Clube.isValidMobile('11987654321'), true);
  for (const bad of ['1133334444', '(11) 8765-4321', '01987654321', '1198765432', '119876543210', '', null, undefined]) {
    assert.equal(Clube.isValidMobile(bad), false, String(bad));
  }
});

// ----------------------------------------------------------- maioridade -----

test('only people 18 or older are accepted, counted from the birthday, in São Paulo time', () => {
  const now = Date.parse('2026-10-24T15:00:00Z');
  assert.equal(Clube.isAdult('2008-10-24', now), true, 'turns 18 today');
  assert.equal(Clube.isAdult('2008-10-25', now), false, 'turns 18 tomorrow');
  assert.equal(Clube.isAdult('1990-02-28', now), true);
  assert.equal(Clube.isAdult('2010-01-01', now), false);
  // 01:00 UTC de 25/10 ainda é 24/10 em São Paulo: quem faz 18 anos em 25/10 ainda não fez.
  assert.equal(Clube.isAdult('2008-10-25', Date.parse('2026-10-25T01:00:00Z')), false);
  assert.equal(Clube.isAdult('2008-10-25', Date.parse('2026-10-25T03:00:00Z')), true);
});

test('a birth date must be a real, past date in AAAA-MM-DD', () => {
  const now = Date.parse('2026-10-24T15:00:00Z');
  for (const ok of ['1990-05-17', '2000-02-29']) assert.equal(Clube.isValidBirthDate(ok, now), true, ok);
  for (const bad of ['1990-02-30', '1990-13-01', '2027-01-01', '1899-12-31', '17/05/1990', '1990-5-17', '', null, undefined, 19900517]) {
    assert.equal(Clube.isValidBirthDate(bad, now), false, String(bad));
  }
});

// ------------------------------------------------------------------- CEP ----

test('CEPs of São Paulo state (01000-000 to 19999-999) are served; other states are not', () => {
  for (const cep of ['01310-100', '01000000', '05508-010', '13010-000', '19999-999', '08090284']) assert.equal(Clube.isSaoPauloCep(cep), true, cep);
  for (const cep of ['20000-000', '30140-071', '40020-000', '70040-010', '80010-000', '00999-999', '0131010', '013101000', '', null, undefined]) {
    assert.equal(Clube.isSaoPauloCep(cep), false, String(cep));
  }
});

// ------------------------------------------------------------------ status --

test('each status has a label in Portuguese', () => {
  assert.deepEqual(Clube.STATUSES, ['awaiting_payment', 'active', 'payment_pending', 'cancelled', 'suspended']);
  assert.equal(Clube.statusLabel('awaiting_payment'), 'Aguardando pagamento');
  assert.equal(Clube.statusLabel('active'), 'Ativa');
  assert.equal(Clube.statusLabel('payment_pending'), 'Pagamento pendente');
  assert.equal(Clube.statusLabel('cancelled'), 'Cancelada');
  assert.equal(Clube.statusLabel('suspended'), 'Suspensa');
  assert.equal(Clube.statusLabel('xyz'), 'xyz');
});

test('a subscription only moves along the allowed paths, and a cancelled one is final', () => {
  assert.equal(Clube.canTransition('awaiting_payment', 'active'), true);
  assert.equal(Clube.canTransition('awaiting_payment', 'cancelled'), true);
  assert.equal(Clube.canTransition('active', 'payment_pending'), true);
  assert.equal(Clube.canTransition('payment_pending', 'active'), true);
  assert.equal(Clube.canTransition('active', 'cancelled'), true);
  assert.equal(Clube.canTransition('suspended', 'active'), true);
  assert.equal(Clube.canTransition('awaiting_payment', 'payment_pending'), false);
  assert.equal(Clube.canTransition('active', 'awaiting_payment'), false);
  assert.equal(Clube.canTransition('cancelled', 'active'), false);
  assert.equal(Clube.canTransition('active', 'active'), false);
  assert.equal(Clube.canTransition('active', 'nope'), false);
});

test('"open" statuses are the ones that block a second subscription of the same plan', () => {
  assert.deepEqual(Clube.OPEN_STATUSES, ['awaiting_payment', 'active', 'payment_pending', 'suspended']);
  assert.equal(Clube.isOpen('active'), true);
  assert.equal(Clube.isOpen('cancelled'), false);
});

// --------------------------------------------------- link de pagamento -----

test('a payment link must be an https address', () => {
  for (const ok of ['https://mpago.la/abc123', 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1-2']) assert.equal(Clube.isValidPaymentLink(ok), true, ok);
  for (const bad of ['http://x.com/pay', 'javascript:alert(1)', 'ftp://x.com', 'mpago.la/abc', 'https://', 'https:// x.com', '', null, undefined, 'https://' + 'a'.repeat(2100) + '.com']) {
    assert.equal(Clube.isValidPaymentLink(bad), false, String(bad).slice(0, 40));
  }
});
