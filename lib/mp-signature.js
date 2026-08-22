// lib/mp-signature.js
// Validação da assinatura x-signature das notificações webhook do Mercado
// Pago, conforme a especificação oficial:
// https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications
const crypto = require('node:crypto');

function parseSignatureHeader(xSignature) {
  const parts = {};
  String(xSignature || '')
    .split(',')
    .forEach((piece) => {
      const eq = piece.indexOf('=');
      if (eq === -1) return;
      const key = piece.slice(0, eq).trim();
      const value = piece.slice(eq + 1).trim();
      if (key) parts[key] = value;
    });
  return parts;
}

function buildManifest({ dataId, requestId, ts }) {
  const segments = [];
  if (dataId) segments.push(`id:${dataId}`);
  if (requestId) segments.push(`request-id:${requestId}`);
  segments.push(`ts:${ts}`);
  return segments.join(';') + ';';
}

function verifyWebhookSignature({ headers, query }, secret) {
  if (!secret) return false;

  const { ts, v1 } = parseSignatureHeader(headers && headers['x-signature']);
  if (!ts || !v1) return false;

  const requestId = (headers && headers['x-request-id']) || '';
  const rawDataId = (query && query['data.id']) || '';
  const dataId = String(rawDataId).toLowerCase();

  const manifest = buildManifest({ dataId, requestId, ts });
  const computed = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  const computedBuf = Buffer.from(computed, 'hex');
  const providedBuf = Buffer.from(v1, 'hex');
  if (providedBuf.length !== computedBuf.length) return false;

  return crypto.timingSafeEqual(computedBuf, providedBuf);
}

module.exports = { verifyWebhookSignature, buildManifest, parseSignatureHeader };
