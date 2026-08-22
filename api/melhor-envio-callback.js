// api/melhor-envio-callback.js
const { createCallbackHandler } = require('../lib/handlers/melhor-envio-callback.js');
const db = require('../lib/db.js');

module.exports = createCallbackHandler({
  env: {
    MELHOR_ENVIO_CLIENT_ID: process.env.MELHOR_ENVIO_CLIENT_ID,
    MELHOR_ENVIO_CLIENT_SECRET: process.env.MELHOR_ENVIO_CLIENT_SECRET,
    MELHOR_ENVIO_REDIRECT_URI: process.env.MELHOR_ENVIO_REDIRECT_URI
  },
  fetchImpl: fetch,
  execute: db.getRealExecute()
});
