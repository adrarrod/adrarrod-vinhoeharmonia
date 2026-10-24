// api/subscriber-area.js
const { createSubscriberAreaHandler } = require('../lib/handlers/subscriber-area.js');
const db = require('../lib/db.js');

module.exports = createSubscriberAreaHandler({
  execute: db.getRealExecute(),
  sessionSecret: process.env.ADMIN_SESSION_SECRET,
  // Interruptor: só aceita novas contratações com CLUBE_ABERTO=true na Vercel.
  clubOpen: process.env.CLUBE_ABERTO === 'true'
});
