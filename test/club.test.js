// test/club.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Club = require('../js/club.js');

test('a month is "AAAA-MM" with a real month number', () => {
  for (const ok of ['2026-01', '2026-11', '2026-12', '1999-06']) assert.equal(Club.isValidMonth(ok), true, ok);
  for (const bad of ['2026-00', '2026-13', '2026-1', '26-11', '2026/11', '2026-11-01', '', ' 2026-11', null, undefined, 202611, {}]) {
    assert.equal(Club.isValidMonth(bad), false, String(bad));
  }
});

test('the current month follows São Paulo time, not UTC', () => {
  // 01:30 UTC de 1º de novembro ainda é 22:30 de 31 de outubro em São Paulo.
  assert.equal(Club.currentMonth(Date.parse('2026-11-01T01:30:00Z')), '2026-10');
  assert.equal(Club.currentMonth(Date.parse('2026-11-01T03:00:00Z')), '2026-11');
  assert.equal(Club.currentMonth(Date.parse('2026-12-31T23:59:00Z')), '2026-12');
  assert.equal(Club.currentMonth(Date.parse('2027-01-01T02:00:00Z')), '2026-12');
  assert.equal(Club.currentMonth(new Date('2026-06-15T12:00:00Z')), '2026-06');
});

test('a wine is visible (and can be rated) from the first day of its month on, never before', () => {
  assert.equal(Club.isVisible('2026-10', '2026-10'), true);
  assert.equal(Club.isVisible('2026-09', '2026-10'), true);
  assert.equal(Club.isVisible('2025-12', '2026-01'), true);
  assert.equal(Club.isVisible('2026-11', '2026-10'), false);
  assert.equal(Club.isVisible('2027-01', '2026-12'), false);
});

test('the month label is in Portuguese, capitalised', () => {
  assert.equal(Club.monthLabel('2026-01'), 'Janeiro de 2026');
  assert.equal(Club.monthLabel('2026-03'), 'Março de 2026');
  assert.equal(Club.monthLabel('2026-11'), 'Novembro de 2026');
  assert.equal(Club.monthLabel('2026-12'), 'Dezembro de 2026');
  assert.equal(Club.monthLabel('lixo'), 'lixo');
});

test('a rating is a whole number from 1 to 5', () => {
  for (const ok of [1, 2, 3, 4, 5]) assert.equal(Club.isValidRating(ok), true, String(ok));
  for (const bad of [0, 6, -1, 2.5, '3', null, undefined, NaN, Infinity, true]) assert.equal(Club.isValidRating(bad), false, String(bad));
});
