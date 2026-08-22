// api/orders.js
const { createOrdersHandler } = require('../lib/handlers/orders.js');
const db = require('../lib/db.js');

module.exports = createOrdersHandler({
  execute: db.getRealExecute(),
  adminPassword: process.env.ADMIN_PASSWORD,
  sessionSecret: process.env.ADMIN_SESSION_SECRET
});
