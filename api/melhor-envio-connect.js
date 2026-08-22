// api/melhor-envio-connect.js
const { createConnectHandler } = require('../lib/handlers/melhor-envio-connect.js');

module.exports = createConnectHandler({
  adminPassword: process.env.ADMIN_PASSWORD,
  sessionSecret: process.env.ADMIN_SESSION_SECRET,
  env: {
    MELHOR_ENVIO_CLIENT_ID: process.env.MELHOR_ENVIO_CLIENT_ID,
    MELHOR_ENVIO_REDIRECT_URI: process.env.MELHOR_ENVIO_REDIRECT_URI
  }
});
