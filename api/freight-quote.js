const { createFreightHandler } = require('../lib/handlers/freight.js');

module.exports = createFreightHandler({
  env: {
    MELHOR_ENVIO_TOKEN: process.env.MELHOR_ENVIO_TOKEN,
    MELHOR_ENVIO_CEP_ORIGEM: process.env.MELHOR_ENVIO_CEP_ORIGEM
  },
  fetchImpl: fetch
});
