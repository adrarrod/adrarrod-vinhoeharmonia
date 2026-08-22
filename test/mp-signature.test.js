// test/mp-signature.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifyWebhookSignature, buildManifest } = require('../lib/mp-signature.js');

const SECRET = 'test-webhook-secret';

function sign({ dataId, requestId, ts }, secret = SECRET) {
  const manifest = buildManifest({ dataId, requestId, ts });
  return crypto.createHmac('sha256', secret).update(manifest).digest('hex');
}

test('buildManifest matches the exact Mercado Pago template', () => {
  const manifest = buildManifest({ dataId: 'abc123', requestId: 'req-1', ts: '1704908010' });
  assert.equal(manifest, 'id:abc123;request-id:req-1;ts:1704908010;');
});

test('buildManifest omits id/request-id segments when absent, keeps trailing ts', () => {
  assert.equal(buildManifest({ dataId: '', requestId: '', ts: '123' }), 'ts:123;');
  assert.equal(buildManifest({ dataId: 'x', requestId: '', ts: '123' }), 'id:x;ts:123;');
});

test('verifyWebhookSignature accepts a correctly signed request', () => {
  const ts = '1704908010';
  const requestId = 'req-1';
  const dataId = 'ord01jq4s4ky8hwq6na5pxb65b3d3';
  const v1 = sign({ dataId, requestId, ts });
  const result = verifyWebhookSignature({
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
    query: { 'data.id': dataId }
  }, SECRET);
  assert.equal(result, true);
});

test('verifyWebhookSignature lowercases data.id before hashing, matching Mercado Pago spec', () => {
  const ts = '1704908010';
  const requestId = 'req-1';
  const lowered = 'ord01jq4s4ky8hwq6na5pxb65b3d3';
  const v1 = sign({ dataId: lowered, requestId, ts });
  const result = verifyWebhookSignature({
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
    // a URL manda o id em maiúsculas — a verificação precisa baixar a caixa antes de assinar
    query: { 'data.id': 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3' }
  }, SECRET);
  assert.equal(result, true);
});

test('verifyWebhookSignature rejects a tampered v1', () => {
  const ts = '1704908010';
  const requestId = 'req-1';
  const dataId = 'pay123';
  const v1 = sign({ dataId, requestId, ts });
  const tampered = v1.slice(0, -2) + (v1.slice(-2) === 'aa' ? 'bb' : 'aa');
  const result = verifyWebhookSignature({
    headers: { 'x-signature': `ts=${ts},v1=${tampered}`, 'x-request-id': requestId },
    query: { 'data.id': dataId }
  }, SECRET);
  assert.equal(result, false);
});

test('verifyWebhookSignature rejects when signed with the wrong secret', () => {
  const ts = '1704908010';
  const requestId = 'req-1';
  const dataId = 'pay123';
  const v1 = sign({ dataId, requestId, ts }, 'a-different-secret');
  const result = verifyWebhookSignature({
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
    query: { 'data.id': dataId }
  }, SECRET);
  assert.equal(result, false);
});

test('verifyWebhookSignature rejects a request signed for a different data.id', () => {
  const ts = '1704908010';
  const requestId = 'req-1';
  const v1 = sign({ dataId: 'pay123', requestId, ts });
  const result = verifyWebhookSignature({
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
    query: { 'data.id': 'pay999' }
  }, SECRET);
  assert.equal(result, false);
});

test('verifyWebhookSignature rejects missing or malformed x-signature header without throwing', () => {
  assert.equal(verifyWebhookSignature({ headers: {}, query: {} }, SECRET), false);
  assert.equal(verifyWebhookSignature({ headers: { 'x-signature': 'garbage' }, query: {} }, SECRET), false);
  assert.equal(verifyWebhookSignature({ headers: { 'x-signature': 'ts=123' }, query: {} }, SECRET), false);
  assert.equal(verifyWebhookSignature({ headers: undefined, query: undefined }, SECRET), false);
});

test('verifyWebhookSignature rejects a v1 of the wrong length without throwing', () => {
  const result = verifyWebhookSignature({
    headers: { 'x-signature': 'ts=123,v1=deadbeef', 'x-request-id': 'r' },
    query: { 'data.id': 'pay123' }
  }, SECRET);
  assert.equal(result, false);
});

test('verifyWebhookSignature returns false when no secret is configured', () => {
  const ts = '1704908010';
  const v1 = sign({ dataId: 'pay123', requestId: 'r', ts });
  const result = verifyWebhookSignature({
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'r' },
    query: { 'data.id': 'pay123' }
  }, undefined);
  assert.equal(result, false);
});
