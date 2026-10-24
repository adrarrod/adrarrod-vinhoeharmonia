// test/helpers/club-fake-db.js — banco em memória com tudo o que a contratação,
// o login do assinante e o painel de assinaturas usam. Só para os testes.
const Clube = require('../../js/clube.js');

const NOW = Date.parse('2026-10-24T15:00:00Z');

function fakeClubDb(existing = []) {
  const subscribers = existing.map((s, i) => ({ id: i + 1, password_hash: null, failed_attempts: 0, locked_until: null, ...s }));
  let nextId = subscribers.length + 1;
  const state = { subscribers, consents: [], subscriptions: [], events: [], responses: [], deleted: [] };
  const iso = (offset = 0) => new Date(NOW + offset).toISOString();

  return Object.assign(state, {
    async ensureSubscribersSchema() {},
    async ensureQuestionnaireSchema() {},
    async ensureSubscriptionsSchema() {},

    // login
    async getSubscriberBy(_e, field, value) {
      return subscribers.find((s) => (field === 'email' ? (s.email || '').toLowerCase() === value : s[field] === value)) || null;
    },
    async recordFailedLogin(_e, id) { const s = subscribers.find((x) => x.id === id); s.failed_attempts += 1; return { failed_attempts: s.failed_attempts, locked_until: null }; },
    async clearLoginFailures() {},
    async getLatestQuestionnaireResponse(_e, id) { const mine = state.responses.filter((r) => r.subscriber_id === id); return mine.length ? mine[mine.length - 1] : null; },

    // cadastro / contratação
    async findSignupConflicts(_e, { phone, email, cpf, excludeId }) {
      return subscribers.filter((s) => s.id !== excludeId && (s.phone === phone || (email && s.email && s.email.toLowerCase() === email) || (cpf && s.cpf === cpf)))
        .map((s) => ({ id: s.id, phone: s.phone, email: s.email, cpf: s.cpf }));
    },
    async countRecentSubscriptions() { return state.subscriptions.length; },
    async insertSubscriberWithProfile(_e, v) {
      const row = { id: nextId++, name: v.name, phone: v.phone, email: v.email, address_street: v.street, address_complement: v.complement, address_number: v.number, address_neighborhood: v.neighborhood, address_city: v.city, address_state: v.state, address_cep: v.cep, address_reference: v.reference, cpf: v.cpf, birth_date: v.birthDate, password_hash: v.passwordHash, failed_attempts: 0, locked_until: null };
      subscribers.push(row);
      return row;
    },
    async updateSubscriberProfile(_e, id, v) {
      const row = subscribers.find((s) => s.id === id);
      if (!row) return null;
      Object.assign(row, { address_street: v.street, address_complement: v.complement, address_number: v.number, address_neighborhood: v.neighborhood, address_city: v.city, address_state: v.state, address_cep: v.cep, address_reference: v.reference, cpf: v.cpf, birth_date: v.birthDate });
      return row;
    },
    async insertConsents(_e, subscriberId, entries) { entries.forEach((e) => state.consents.push({ subscriber_id: subscriberId, ...e })); },
    async insertQuestionnaireResponse(_e, subscriberId, version, answers) {
      const row = { id: state.responses.length + 1, subscriber_id: subscriberId, version, answers, created_at: iso() };
      state.responses.push(row);
      return row;
    },
    async deleteSubscriber(_e, id) { const i = subscribers.findIndex((s) => s.id === id); if (i === -1) return false; state.deleted.push(id); subscribers.splice(i, 1); return true; },

    // assinaturas
    async insertSubscription(_e, { subscriberId, plan, priceCents, status }) {
      if (state.subscriptions.some((s) => s.subscriber_id === subscriberId && s.plan === plan && Clube.isOpen(s.status))) return null;
      const row = { id: state.subscriptions.length + 1, subscriber_id: subscriberId, plan, price_cents: priceCents, status, payment_link: null, payment_link_sent_at: null, requested_at: iso(), activated_at: status === 'active' ? iso() : null, cancelled_at: null };
      state.subscriptions.push(row);
      return row;
    },
    async insertSubscriptionEvent(_e, ev) { state.events.push({ id: state.events.length + 1, created_at: iso(state.events.length), ...ev }); },
    async getSubscription(_e, id) { return state.subscriptions.find((s) => s.id === id) || null; },
    async getLatestSubscription(_e, subscriberId) { const mine = state.subscriptions.filter((s) => s.subscriber_id === subscriberId); return mine.length ? mine[mine.length - 1] : null; },
    async transitionSubscription(_e, id, from, to, actor, note) {
      const s = state.subscriptions.find((x) => x.id === id && x.status === from);
      if (!s) return null;
      s.status = to;
      if (to === 'active' && !s.activated_at) s.activated_at = iso();
      if (to === 'cancelled') s.cancelled_at = iso();
      state.events.push({ id: state.events.length + 1, created_at: iso(state.events.length), subscriptionId: id, from, to, actor, note });
      return s;
    },
    async setSubscriptionPaymentLink(_e, id, link) { const s = state.subscriptions.find((x) => x.id === id); if (!s) return null; s.payment_link = link; s.payment_link_sent_at = null; return s; },
    async markPaymentLinkSent(_e, id) { const s = state.subscriptions.find((x) => x.id === id && x.payment_link); if (!s) return null; s.payment_link_sent_at = iso(); return s; },
    async listSubscriptions() {
      return state.subscriptions.map((s) => ({ ...subscribers.find((x) => x.id === s.subscriber_id), ...s, questionnaire_answered: state.responses.some((r) => r.subscriber_id === s.subscriber_id) })).reverse();
    },
    async listSubscriptionEvents(_e, id) {
      return state.events.filter((e) => e.subscriptionId === id).reverse().map((e) => ({ id: e.id, from_status: e.from, to_status: e.to, actor: e.actor, note: e.note, created_at: e.created_at }));
    }
  });
}

module.exports = { fakeClubDb, NOW };
