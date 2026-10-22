// api/subscribers.js
const { createSubscribersHandler } = require('../lib/handlers/subscribers.js');
const db = require('../lib/db.js');

module.exports = createSubscribersHandler({
  execute: db.getRealExecute(),
  adminPassword: process.env.ADMIN_PASSWORD,
  sessionSecret: process.env.ADMIN_SESSION_SECRET
});
