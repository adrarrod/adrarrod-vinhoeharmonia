// lib/handlers/stock.js
const auth = require('../auth.js');
const stock = require('../stock-service.js');

function createStockHandler(deps) {
  function isAdmin(req) {
    const cookies = auth.parseCookies(req.headers.cookie);
    return auth.verifySession(cookies[auth.SESSION_COOKIE_NAME], deps.adminPassword, deps.sessionSecret);
  }

  return async function handler(req, res) {
    // Público: a loja precisa saber o que ainda está disponível. Nunca em cache,
    // senão o cliente veria um estoque que já acabou.
    if (req.method === 'GET') {
      try {
        const map = await stock.getStockMap(deps);
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json(map);
      } catch (err) {
        console.error('failed to read stock', err);
        res.status(500).json({ error: 'internal_error' });
      }
      return;
    }

    // Só o admin ajusta o estoque (reposição, garrafa quebrada, contagem).
    if (req.method === 'POST') {
      if (!isAdmin(req)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const { slug, quantity } = req.body || {};
      try {
        await stock.setStockQuantity(deps, slug, quantity);
        res.status(200).json({ ok: true });
      } catch (err) {
        if (err instanceof stock.InvalidStockError) {
          res.status(400).json({ error: err.message });
        } else {
          console.error('failed to set stock', err);
          res.status(500).json({ error: 'internal_error' });
        }
      }
      return;
    }

    res.status(405).json({ error: 'method_not_allowed' });
  };
}

module.exports = { createStockHandler };
