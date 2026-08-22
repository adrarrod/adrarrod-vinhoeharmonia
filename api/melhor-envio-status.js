// api/melhor-envio-status.js
const { createStatusHandler } = require('../lib/handlers/melhor-envio-status.js');
const db = require('../lib/db.js');

module.exports = createStatusHandler({
  adminPassword: process.env.ADMIN_PASSWORD,
  sessionSecret: process.env.ADMIN_SESSION_SECRET,
  execute: db.getRealExecute()
});
