// api/admin-login.js
const { createAdminLoginHandler } = require('../lib/handlers/admin-login.js');

module.exports = createAdminLoginHandler({
  adminPassword: process.env.ADMIN_PASSWORD,
  sessionSecret: process.env.ADMIN_SESSION_SECRET
});
