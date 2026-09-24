// lib/handlers/orders.js
const svc = require('../orders-service.js');
const auth = require('../auth.js');
const stock = require('../stock-service.js');

function createOrdersHandler(deps) {
  const serviceDeps = { execute: deps.execute };

  function isAdmin(req) {
    const cookies = auth.parseCookies(req.headers.cookie);
    return auth.verifySession(cookies[auth.SESSION_COOKIE_NAME], deps.adminPassword, deps.sessionSecret);
  }

  return async function handler(req, res) {
    if (req.method === 'POST') {
      try {
        const result = await svc.createOrder(serviceDeps, req.body);
        res.status(201).json(result);
      } catch (err) {
        if (err instanceof svc.ValidationError) {
          res.status(400).json({ errors: err.errors });
        } else if (err instanceof stock.OutOfStockError) {
          // 409: o pedido era válido, mas o estoque mudou (alguém levou antes,
          // ou o carrinho estava desatualizado). O navegador ajusta o carrinho.
          res.status(409).json({ error: 'out_of_stock', items: err.items });
        } else {
          res.status(500).json({ error: 'internal_error' });
        }
      }
      return;
    }

    if (req.method === 'GET') {
      if (!isAdmin(req)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      try {
        const orders = await svc.listOrdersForAdmin(serviceDeps);
        res.status(200).json(orders);
      } catch (err) {
        console.error('failed to list orders', err);
        res.status(500).json({ error: 'internal_error' });
      }
      return;
    }

    res.status(405).json({ error: 'method_not_allowed' });
  };
}

module.exports = { createOrdersHandler };
