// api/stock.js
const { createStockHandler } = require('../lib/handlers/stock.js');
const db = require('../lib/db.js');

module.exports = createStockHandler({
  execute: db.getRealExecute(),
  adminPassword: process.env.ADMIN_PASSWORD,
  sessionSecret: process.env.ADMIN_SESSION_SECRET
});
