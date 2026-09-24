// api/order-cancel.js
const { createCancelOrderHandler } = require('../lib/handlers/order-cancel.js');
const db = require('../lib/db.js');

module.exports = createCancelOrderHandler({
  execute: db.getRealExecute(),
  adminPassword: process.env.ADMIN_PASSWORD,
  sessionSecret: process.env.ADMIN_SESSION_SECRET
});
