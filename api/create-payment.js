// api/create-payment.js
const { createPaymentHandler } = require('../lib/handlers/payment.js');
const db = require('../lib/db.js');

module.exports = createPaymentHandler({
  execute: db.getRealExecute(),
  env: { MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN, SITE_URL: process.env.SITE_URL },
  fetchImpl: fetch
});
