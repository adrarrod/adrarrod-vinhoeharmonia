const { createWebhookHandler } = require('../lib/handlers/webhook.js');
const db = require('../lib/db.js');

module.exports = createWebhookHandler({
  env: { MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET: process.env.MP_WEBHOOK_SECRET },
  fetchImpl: fetch,
  execute: db.getRealExecute()
});
