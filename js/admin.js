// js/admin.js
// Lógica do painel administrativo (admin.html): protegido por senha via
// GET /api/orders (401 quando sem sessão) e POST /api/admin-login.
// Além dos pedidos, edita o estoque (/api/stock) e cancela pedidos devolvendo
// as garrafas ao estoque (/api/order-cancel).
(function () {
  'use strict';

  const loginSection = document.getElementById('admin-login');
  const loginForm = document.getElementById('admin-login-form');
  const loginErrorBox = document.getElementById('admin-login-error');
  const loginSubmit = document.getElementById('admin-login-submit');
  const passwordInput = document.getElementById('admin-password');

  const ordersSection = document.getElementById('admin-orders');
  const ordersStatus = document.getElementById('orders-status');
  const ordersList = document.getElementById('orders-list');

  const subscribersSection = document.getElementById('admin-subscribers');
  const subForm = document.getElementById('sub-form');
  const subErrors = document.getElementById('sub-errors');
  const subStatus = document.getElementById('sub-status');
  const subSubmit = document.getElementById('sub-submit');
  const subCancel = document.getElementById('sub-cancel');
  const subFormTitle = document.getElementById('sub-form-title');
  const subList = document.getElementById('sub-list');
  const subCount = document.getElementById('sub-count');
  const subFilter = document.getElementById('sub-filter');

  const stockSection = document.getElementById('admin-stock');

  const subsSection = document.getElementById('admin-subscriptions');
  const subsStatus = document.getElementById('subs-status');
  const subsList = document.getElementById('subs-list');
  const subsFilters = document.getElementById('subs-filters');
  const subsBadge = document.getElementById('subs-badge');
  const stockStatus = document.getElementById('stock-status');
  const stockList = document.getElementById('stock-list');
  const stockFilter = document.getElementById('stock-filter');

  const shippingSection = document.getElementById('admin-shipping');
  const shippingStatus = document.getElementById('melhor-envio-status');
  const shippingConnectLink = document.getElementById('melhor-envio-connect-link');

  const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  const DELIVERY_LABELS = { delivery: 'Entrega', pickup: 'Retirada' };
  const PAYMENT_LABELS = { pix: 'PIX', card: 'Cartão' };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMoney(value) {
    const n = Number(value);
    return currencyFormatter.format(Number.isFinite(n) ? n : 0);
  }

  function formatDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return escapeHtml(value) || '—';
    return dateFormatter.format(d);
  }

  function showLogin() {
    loginSection.hidden = false;
    ordersSection.hidden = true;
    shippingSection.hidden = true;
    subscribersSection.hidden = true;
    subsSection.hidden = true;
    stockSection.hidden = true;
  }

  function showOrders() {
    loginSection.hidden = true;
    ordersSection.hidden = false;
    shippingSection.hidden = false;
    subscribersSection.hidden = false;
    subsSection.hidden = false;
    stockSection.hidden = false;
  }

  function showMelhorEnvioNotice() {
    const params = new URLSearchParams(window.location.search);
    const notice = params.get('melhor_envio');
    if (!notice) return false;
    if (notice === 'conectado') {
      shippingStatus.textContent = 'Melhor Envio conectado com sucesso!';
      shippingConnectLink.hidden = true;
    } else {
      shippingStatus.textContent = 'Não foi possível conectar ao Melhor Envio. Tente novamente.';
      shippingStatus.classList.add('card-msg');
      shippingConnectLink.hidden = false;
    }
    params.delete('melhor_envio');
    const newSearch = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (newSearch ? '?' + newSearch : ''));
    return true;
  }

  async function loadMelhorEnvioStatus() {
    try {
      const res = await fetch('/api/melhor-envio-status', { credentials: 'same-origin' });
      if (!res.ok) {
        shippingStatus.textContent = 'Não foi possível verificar a conexão com o Melhor Envio.';
        shippingConnectLink.hidden = false;
        return;
      }
      const data = await res.json();
      if (data.connected) {
        shippingStatus.textContent = 'Conectado ✅';
        shippingConnectLink.hidden = true;
      } else {
        shippingStatus.textContent = 'Não conectado — o frete usa o cálculo padrão até você conectar.';
        shippingConnectLink.hidden = false;
      }
    } catch (err) {
      shippingStatus.textContent = 'Falha de conexão ao verificar o Melhor Envio.';
      shippingConnectLink.hidden = false;
    }
  }

  function setOrdersStatus(message, isError) {
    if (!message) {
      ordersStatus.hidden = true;
      ordersStatus.textContent = '';
      ordersStatus.classList.remove('card-msg');
      return;
    }
    ordersStatus.hidden = false;
    ordersStatus.textContent = message;
    ordersStatus.classList.toggle('card-msg', !!isError);
  }

  function renderItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return '<li>Nenhum item registrado</li>';
    }
    return items.map((item) => {
      const name = escapeHtml(item && item.name ? item.name : 'Item');
      const qty = item && item.qty ? item.qty : 1;
      const note = item && item.note
        ? ' <span class="order-item-note">(' + escapeHtml(item.note) + ')</span>'
        : '';
      return '<li>' + name + ' × ' + escapeHtml(qty) + note + '</li>';
    }).join('');
  }

  function formatAddress(order) {
    var line1 = order.address_street || '';
    if (order.address_number) line1 += ', ' + order.address_number;
    if (order.address_complement) line1 += ' — ' + order.address_complement;

    var parts = [];
    if (line1) parts.push(line1);
    if (order.address_neighborhood) parts.push(order.address_neighborhood);
    var cityState = [order.address_city, order.address_state].filter(Boolean).join('/');
    if (cityState) parts.push(cityState);
    if (order.address_cep) parts.push('CEP ' + order.address_cep);

    return parts.length ? parts.join(' · ') : '—';
  }

  function renderOrderCard(order) {
    const deliveryLabel = DELIVERY_LABELS[order.delivery_type] || order.delivery_type || '—';
    const paymentLabel = PAYMENT_LABELS[order.payment_method] || order.payment_method || '—';

    return (
      '<article class="order-card">' +
        '<div class="order-card-head">' +
          '<h3>Pedido #' + escapeHtml(order.id) + '</h3>' +
          '<span class="order-badge">' + escapeHtml(order.status || 'novo') + '</span>' +
        '</div>' +
        (order.status === 'cancelado' ? '' :
          '<button class="btn btn-ghost order-cancel" type="button" data-cancel-order="' + escapeHtml(order.id) + '">Cancelar pedido</button>') +
        '<p class="order-date">' + formatDate(order.created_at) + '</p>' +
        '<div class="order-meta-grid">' +
          '<div><span class="order-meta-label">Cliente</span><span>' + escapeHtml(order.full_name) + '</span></div>' +
          '<div><span class="order-meta-label">Telefone</span><span>' + escapeHtml(order.phone) + '</span></div>' +
          '<div><span class="order-meta-label">Entrega</span><span>' + escapeHtml(deliveryLabel) + '</span></div>' +
          '<div><span class="order-meta-label">Pagamento</span><span>' + escapeHtml(paymentLabel) + '</span></div>' +
          '<div class="order-address-full"><span class="order-meta-label">Endereço de entrega</span><span>' + escapeHtml(formatAddress(order)) + '</span></div>' +
        '</div>' +
        '<ul class="order-items">' + renderItems(order.items) + '</ul>' +
        '<div class="order-totals">' +
          '<div class="totals-line"><span>Subtotal</span><span>' + formatMoney(order.subtotal) + '</span></div>' +
          '<div class="totals-line"><span>Desconto</span><span>-' + formatMoney(order.discount) + '</span></div>' +
          '<div class="totals-line"><span>Frete</span><span>' + formatMoney(order.freight) + '</span></div>' +
          '<div class="totals-line total"><span>Total</span><span>' + formatMoney(order.total) + '</span></div>' +
        '</div>' +
      '</article>'
    );
  }

  function renderOrders(orders) {
    if (!Array.isArray(orders) || orders.length === 0) {
      ordersList.innerHTML = '<p class="orders-empty">Nenhum pedido registrado ainda.</p>';
      return;
    }

    // mais recentes primeiro (a API já retorna nessa ordem, mas ordenamos
    // de novo aqui para não depender disso)
    const sorted = orders.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    ordersList.innerHTML = sorted.map(renderOrderCard).join('');
  }

  async function loadOrders() {
    setOrdersStatus('Carregando pedidos…', false);
    try {
      const res = await fetch('/api/orders', { credentials: 'same-origin' });

      if (res.status === 401) {
        ordersList.innerHTML = '';
        setOrdersStatus('', false);
        showLogin();
        return;
      }

      if (!res.ok) {
        showOrders();
        ordersList.innerHTML = '';
        setOrdersStatus('Não foi possível carregar os pedidos agora (erro do servidor). Tente novamente em instantes.', true);
        return;
      }

      const orders = await res.json();
      showOrders();
      setOrdersStatus('', false);
      renderOrders(orders);
      loadStock();
      loadSubscribers();
      loadSubscriptions();
      if (!showMelhorEnvioNotice()) {
        loadMelhorEnvioStatus();
      }
    } catch (err) {
      showOrders();
      ordersList.innerHTML = '';
      setOrdersStatus('Falha de conexão ao buscar pedidos. Verifique sua internet e tente novamente.', true);
    }
  }

  // ------------------------------------------------- assinaturas do clube ---
  let subscriptions = [];
  let subscriptionCounts = {};
  let subscriptionBySubscriber = {}; // id do assinante -> assinatura mais recente
  let subsFilterStatus = 'awaiting_payment';
  const SUBS_FILTERS = [
    ['awaiting_payment', 'Aguardando pagamento'], ['active', 'Ativas'], ['payment_pending', 'Pendentes'],
    ['cancelled', 'Canceladas'], ['all', 'Todas']
  ];

  function setSubsStatus(message, isError) {
    subsStatus.hidden = !message;
    subsStatus.textContent = message || '';
    subsStatus.classList.toggle('card-msg', !!isError);
  }

  function cpfLabel(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    return d.length === 11 ? d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9) : (d || '—');
  }

  function birthLabel(iso) {
    return /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.slice(8) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—';
  }

  function subsAddress(a) {
    const line = [a.street, a.number].filter(Boolean).join(', ') + (a.complement ? ' — ' + a.complement : '');
    return [line, a.neighborhood, [a.city, a.state].filter(Boolean).join('/'), a.cep ? 'CEP ' + formatCep(a.cep) : '', a.reference ? 'Ref.: ' + a.reference : ''].filter(Boolean).join(' · ');
  }

  // Mensagem pronta com o link de pagamento. Nunca leva CPF, senha ou outro dado sensível.
  function paymentMessage(s) {
    const first = String(s.name || '').split(' ')[0];
    return 'Olá, ' + first + '!\n\n' +
      'Recebemos sua solicitação de assinatura do ' + window.Clube.PLAN.name + ' (R$ 120,00 por mês).\n\n' +
      'Para ativar a sua assinatura, faça o pagamento por este link:\n' + s.paymentLink + '\n\n' +
      'Assim que o pagamento for confirmado, sua assinatura será ativada.\n\n' +
      'Qualquer dúvida, é só falar com a gente.\nVinho & Harmonia';
  }

  function subscriptionCardHtml(s) {
    const id = escapeHtml(s.id);
    const due = s.status === 'awaiting_payment' || s.status === 'payment_pending';
    let pay = '';
    if (due) {
      pay = '<div class="subs-pay">' +
        '<input type="url" class="subs-link" placeholder="Cole aqui o link de pagamento (https://…)" value="' + escapeHtml(s.paymentLink || '') + '" aria-label="Link de pagamento de ' + escapeHtml(s.name) + '">' +
        '<div class="subs-row"><button class="btn btn-gold" type="button" data-subs-link="' + id + '">Salvar link</button>';
      if (s.paymentLink) {
        const subject = encodeURIComponent('Clube V&H Personnalité — link de pagamento');
        const body = encodeURIComponent(paymentMessage(s));
        pay += (s.email ? '<a class="btn btn-ghost" href="mailto:' + escapeHtml(s.email) + '?subject=' + subject + '&body=' + body + '">Enviar por e-mail</a>' : '') +
          '<a class="btn btn-ghost" target="_blank" rel="noopener noreferrer" href="https://wa.me/55' + escapeHtml(String(s.phone).replace(/\D/g, '')) + '?text=' + body + '">Enviar por WhatsApp</a>' +
          '<button class="btn btn-ghost" type="button" data-subs-sent="' + id + '">Marcar como enviado</button>';
      }
      pay += '</div>' + (s.paymentLinkSentAt ? '<span class="subs-sent">Link enviado em ' + formatDate(s.paymentLinkSentAt) + '</span>' : '') + '</div>';
    }

    const actions = [];
    if (s.status === 'awaiting_payment' || s.status === 'payment_pending' || s.status === 'suspended') actions.push(['active', 'Confirmar pagamento', 'btn-gold']);
    if (s.status === 'active') actions.push(['payment_pending', 'Marcar pagamento pendente', 'btn-ghost']);
    if (s.status !== 'cancelled') actions.push(['cancelled', 'Cancelar assinatura', 'btn-ghost']);

    return (
      '<article class="subs-card" data-subs-card="' + id + '">' +
        '<div class="subs-head"><span class="subs-name">' + escapeHtml(s.name) + '</span><span class="subs-chip is-' + escapeHtml(s.status) + '">' + escapeHtml(s.statusLabel) + '</span></div>' +
        '<p class="subs-line">' + escapeHtml(formatPhone(s.phone)) + ' · ' + escapeHtml(s.email || 'sem e-mail') + '</p>' +
        '<p class="subs-line">CPF ' + escapeHtml(cpfLabel(s.cpf)) + ' · Nascimento ' + escapeHtml(birthLabel(s.birthDate)) + '</p>' +
        '<p class="subs-line">' + escapeHtml(subsAddress(s.address) || 'Endereço não informado') + (s.outsideSaoPaulo ? ' <span class="subs-warn">· fora de São Paulo</span>' : '') + '</p>' +
        '<p class="subs-line">' + escapeHtml(window.Clube.PLAN.name) + ' · R$ 120,00/mês · Solicitada em ' + formatDate(s.requestedAt) +
          (s.activatedAt ? ' · Ativada em ' + formatDate(s.activatedAt) : '') +
          ' · Questionário: ' + (s.questionnaireAnswered ? 'respondido' : 'pendente') + '</p>' +
        pay +
        '<div class="subs-row" style="margin-top:10px">' +
          actions.map((a) => '<button class="btn ' + a[2] + '" type="button" data-subs-status="' + id + '" data-to="' + a[0] + '">' + a[1] + '</button>').join('') +
          '<button class="btn btn-ghost" type="button" data-subs-history="' + id + '">Histórico</button>' +
        '</div>' +
        '<div class="subs-history" data-history-for="' + id + '" hidden></div>' +
      '</article>'
    );
  }

  function renderSubscriptions() {
    const counts = subscriptionCounts;
    subsFilters.innerHTML = SUBS_FILTERS.map(([key, label]) => {
      const n = key === 'all' ? counts.total : counts[key];
      return '<button class="btn btn-ghost subs-filter' + (subsFilterStatus === key ? ' is-on' : '') + '" type="button" data-subs-filter="' + key + '">' + label + ' (' + (n || 0) + ')</button>';
    }).join('');
    const waiting = counts.awaiting_payment || 0;
    subsBadge.hidden = !waiting;
    subsBadge.textContent = waiting + (waiting === 1 ? ' nova' : ' novas');

    const shown = subscriptions.filter((s) => subsFilterStatus === 'all' || s.status === subsFilterStatus);
    subsList.innerHTML = shown.length
      ? shown.map(subscriptionCardHtml).join('')
      : '<p class="orders-empty">Nenhuma solicitação nesta situação.</p>';
  }

  async function loadSubscriptions() {
    try {
      const res = await fetch('/api/subscribers?view=subscriptions', { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) { showLogin(); return; }
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      subscriptions = data.subscriptions || [];
      subscriptionCounts = data.counts || {};
      subscriptionBySubscriber = {};
      subscriptions.forEach((s) => { if (!subscriptionBySubscriber[s.subscriberId]) subscriptionBySubscriber[s.subscriberId] = s; });
      setSubsStatus('', false);
      renderSubscriptions();
      renderSubscribers();
    } catch (err) {
      setSubsStatus('Não foi possível carregar as assinaturas agora.', true);
    }
  }

  // Chamada ao servidor para uma ação sobre uma assinatura; devolve true se deu certo.
  async function subscriptionAction(query, body, failureMessage) {
    try {
      const res = await fetch('/api/subscribers?' + query, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body || {})
      });
      if (res.status === 401) { showLogin(); return false; }
      if (res.status === 400) { setSubsStatus(failureMessage.invalid || 'Confira os dados informados.', true); return false; }
      if (res.status === 409) { setSubsStatus(failureMessage.conflict || 'Esta assinatura mudou de situação. A lista foi atualizada.', true); await loadSubscriptions(); return false; }
      if (res.status === 404) { setSubsStatus('Esta assinatura não existe mais.', true); await loadSubscriptions(); return false; }
      if (!res.ok) throw new Error('http ' + res.status);
      setSubsStatus('', false);
      return true;
    } catch (err) {
      setSubsStatus(failureMessage.generic || 'Não foi possível concluir agora. Tente de novo.', true);
      return false;
    }
  }

  async function saveSubscriptionLink(id, card) {
    const link = card.querySelector('.subs-link').value.trim();
    if (!window.Clube.isValidPaymentLink(link)) { setSubsStatus('Informe um link de pagamento válido, começando com https://', true); return; }
    if (await subscriptionAction('action=sub-link&subscription=' + encodeURIComponent(id), { link }, { invalid: 'O link precisa começar com https:// e ser um endereço válido.', conflict: 'Esta assinatura já foi encerrada.' })) await loadSubscriptions();
  }

  async function markSubscriptionSent(id) {
    if (await subscriptionAction('action=sub-link-sent&subscription=' + encodeURIComponent(id), null, { invalid: 'Salve o link antes de marcar como enviado.' })) await loadSubscriptions();
  }

  async function changeSubscriptionStatus(id, to) {
    const sub = subscriptions.find((s) => String(s.id) === String(id));
    const who = sub ? sub.name : 'este assinante';
    const questions = {
      active: 'Confirmar que o pagamento de ' + who + ' foi recebido? A assinatura passará a Ativa.',
      payment_pending: 'Marcar a assinatura de ' + who + ' como Pagamento pendente?',
      cancelled: 'Cancelar a assinatura de ' + who + '? Isso não pode ser desfeito (uma nova solicitação teria de ser feita).'
    };
    if (!window.confirm(questions[to] || 'Confirmar a mudança?')) return;
    if (await subscriptionAction('action=sub-status&subscription=' + encodeURIComponent(id), { to }, {})) await loadSubscriptions();
  }

  async function toggleSubscriptionHistory(id) {
    const box = subsList.querySelector('[data-history-for="' + id + '"]');
    if (!box) return;
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false;
    box.textContent = 'Carregando…';
    try {
      const res = await fetch('/api/subscribers?view=subscription-events&subscription=' + encodeURIComponent(id), { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) { showLogin(); return; }
      if (!res.ok) throw new Error('http ' + res.status);
      const events = (await res.json()).events || [];
      const actors = { cliente: 'cliente', admin: 'administrador', sistema: 'sistema' };
      box.innerHTML = '<ul>' + events.map((e) =>
        '<li>' + formatDate(e.createdAt) + ' — ' + (e.from && e.from !== e.to ? escapeHtml(window.Clube.statusLabel(e.from)) + ' → ' : '') + escapeHtml(window.Clube.statusLabel(e.to)) +
        (e.note ? ' · ' + escapeHtml(e.note) : '') + ' <em>(' + escapeHtml(actors[e.actor] || e.actor) + ')</em></li>'
      ).join('') + '</ul>';
    } catch (err) {
      box.textContent = 'Não foi possível carregar o histórico agora.';
    }
  }

  // Cliente que já era assinante antes do site: o admin registra a assinatura dele.
  async function createLegacySubscription(id) {
    const sub = subscribers.find((s) => String(s.id) === String(id));
    if (!window.confirm('Registrar a assinatura de ' + (sub ? sub.name : 'este assinante') + ' como ATIVA? Use para quem já era assinante antes do site.')) return;
    try {
      const res = await fetch('/api/subscribers?action=sub-create&id=' + encodeURIComponent(id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status: 'active' })
      });
      if (res.status === 401) { showLogin(); return; }
      if (res.status === 409) { setSubStatus('Este assinante já tem uma assinatura em andamento.', true); await loadSubscriptions(); return; }
      if (!res.ok && res.status !== 404) throw new Error('http ' + res.status);
      setSubStatus('', false);
      await loadSubscriptions();
    } catch (err) {
      setSubStatus('Não foi possível registrar a assinatura agora. Tente de novo.', true);
    }
  }

  subsFilters.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-subs-filter]');
    if (!btn) return;
    subsFilterStatus = btn.dataset.subsFilter;
    renderSubscriptions();
  });

  subsList.addEventListener('click', (event) => {
    const link = event.target.closest('[data-subs-link]');
    if (link) { saveSubscriptionLink(link.dataset.subsLink, link.closest('[data-subs-card]')); return; }
    const sent = event.target.closest('[data-subs-sent]');
    if (sent) { markSubscriptionSent(sent.dataset.subsSent); return; }
    const status = event.target.closest('[data-subs-status]');
    if (status) { changeSubscriptionStatus(status.dataset.subsStatus, status.dataset.to); return; }
    const history = event.target.closest('[data-subs-history]');
    if (history) toggleSubscriptionHistory(history.dataset.subsHistory);
  });

  // ---------------------------------------------------------- assinantes ---
  const SUB_FIELD_LABELS = {
    name: 'Nome', phone: 'Telefone (DDD + número)', email: 'E-mail', street: 'Endereço',
    complement: 'Complemento', number: 'Número', neighborhood: 'Bairro', city: 'Cidade',
    state: 'Estado (2 letras, ex.: SP)', cep: 'CEP (8 números)'
  };
  const SUB_FIELD_IDS = {
    name: 'sub-name', phone: 'sub-phone', email: 'sub-email', street: 'sub-street',
    complement: 'sub-complement', number: 'sub-number', neighborhood: 'sub-neighborhood',
    city: 'sub-city', state: 'sub-state', cep: 'sub-cep'
  };
  let subscribers = [];
  let editingId = null; // id do assinante em edição; null = cadastrando um novo
  let quizBySubscriber = {}; // id do assinante -> resumo do questionário (quem já respondeu)

  function formatPhone(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return d;
  }

  function formatCep(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    return d.length === 8 ? d.slice(0, 5) + '-' + d.slice(5) : d;
  }

  // Máscaras enquanto digita (mesma ideia do checkout da loja).
  function maskPhone(value) {
    const d = value.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }

  function maskCep(value) {
    const d = value.replace(/\D/g, '').slice(0, 8);
    return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d;
  }

  function setSubStatus(message, isError) {
    subStatus.hidden = !message;
    subStatus.textContent = message || '';
    subStatus.classList.toggle('card-msg', !!isError);
  }

  function showSubErrors(fields) {
    subForm.querySelectorAll('.field').forEach((f) => f.classList.remove('has-error'));
    if (!fields || !fields.length) { subErrors.hidden = true; subErrors.innerHTML = ''; return; }
    subErrors.innerHTML = '<strong>Confira estes campos antes de ' + (editingId === null ? 'cadastrar' : 'salvar') + ':</strong><ul>' +
      fields.map((f) => '<li>' + escapeHtml(SUB_FIELD_LABELS[f] || f) + '</li>').join('') + '</ul>';
    subErrors.hidden = false;
    fields.forEach((f) => {
      const input = document.getElementById(SUB_FIELD_IDS[f]);
      if (input && input.closest('.field')) input.closest('.field').classList.add('has-error');
    });
  }

  // Celular e e-mail são o login do assinante: não podem se repetir.
  function showSubDuplicate(field) {
    showSubErrors([]);
    const isEmail = field === 'email';
    subErrors.textContent = isEmail
      ? 'Este e-mail já está cadastrado em outro assinante.'
      : 'Este celular já está cadastrado em outro assinante.';
    subErrors.hidden = false;
    const input = document.getElementById(isEmail ? 'sub-email' : 'sub-phone');
    if (input && input.closest('.field')) input.closest('.field').classList.add('has-error');
  }

  function subscriberAddress(s) {
    const line1 = [s.street, s.number].filter(Boolean).join(', ') + (s.complement ? ' — ' + s.complement : '');
    const cityState = [s.city, s.state].filter(Boolean).join('/');
    const parts = [line1.trim(), s.neighborhood, cityState, s.cep ? 'CEP ' + formatCep(s.cep) : ''].filter(Boolean);
    return parts.join(' · ');
  }

  // Telefone e CEP vêm do banco só com números; no formulário voltam com máscara.
  function startEditing(id) {
    const sub = subscribers.find((s) => String(s.id) === String(id));
    if (!sub) return;
    editingId = sub.id;
    Object.keys(SUB_FIELD_IDS).forEach((field) => {
      let value = sub[field] || '';
      if (field === 'phone') value = formatPhone(value);
      if (field === 'cep') value = formatCep(value);
      document.getElementById(SUB_FIELD_IDS[field]).value = value;
    });
    setSubStatus('', false);
    showSubErrors([]);
    subSubmit.textContent = 'Salvar alterações';
    subCancel.hidden = false;
    subFormTitle.textContent = 'Editando: ' + sub.name;
    renderSubscribers();
    subForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('sub-name').focus();
  }

  function stopEditing() {
    editingId = null;
    subForm.reset();
    showSubErrors([]);
    subSubmit.textContent = 'Cadastrar assinante';
    subCancel.hidden = true;
    subFormTitle.textContent = 'Assinantes';
    renderSubscribers();
  }

  // Resposta do questionário em texto (listas viram "a, b"; sem resposta = "—").
  function quizAnswerHtml(value) {
    const text = Array.isArray(value) ? value.join(', ') : (typeof value === 'string' ? value.trim() : '');
    return text ? '<div class="sub-ans-a">' + escapeHtml(text) + '</div>' : '<div class="sub-ans-a is-empty">Sem resposta</div>';
  }

  // Um envio do questionário, agrupado por etapa.
  function quizSubmissionHtml(submission) {
    return Questionario.STEPS.map((step) =>
      '<div class="sub-ans-step"><strong>' + escapeHtml(step.titulo) + '</strong>' +
        step.perguntas.map((q) => '<div class="sub-ans-q">' + escapeHtml(q.texto) + '</div>' + quizAnswerHtml(submission.answers[q.id])).join('') +
      '</div>'
    ).join('');
  }

  function quizDetailHtml(detail) {
    if (!detail.submissions.length) return '<p class="sub-line">Ainda não respondeu.</p>';
    return detail.submissions.map((sub, i) =>
      '<details' + (i === 0 ? ' open' : '') + '><summary>' + (i === 0 ? 'Resposta atual' : 'Resposta anterior') +
        ' — ' + formatDate(sub.submittedAt) + ' · v' + escapeHtml(sub.version) + '</summary>' + quizSubmissionHtml(sub) + '</details>'
    ).join('');
  }

  async function toggleSubscriberAnswers(id, button) {
    const box = subList.querySelector('[data-answers-for="' + id + '"]');
    if (!box) return;
    if (!box.hidden) { box.hidden = true; button.textContent = 'Ver respostas'; return; }
    box.hidden = false;
    button.textContent = 'Ocultar respostas';
    if (box.dataset.loaded) return;
    box.textContent = 'Carregando…';
    try {
      const res = await fetch('/api/subscribers?view=questionnaire&id=' + encodeURIComponent(id), { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) { showLogin(); return; }
      if (!res.ok) throw new Error('http ' + res.status);
      box.innerHTML = quizDetailHtml(await res.json());
      box.dataset.loaded = '1';
    } catch (err) {
      box.textContent = 'Não foi possível carregar as respostas agora.';
    }
  }

  function subscriptionLineHtml(s) {
    const sub = subscriptionBySubscriber[s.id];
    if (sub) return '<p class="sub-line sub-subscription">Assinatura do clube: ' + escapeHtml(sub.statusLabel) + '</p>';
    return '<p class="sub-line sub-subscription">Assinatura do clube: nenhuma ' +
      '<button class="btn btn-ghost sub-answers-btn" type="button" data-sub-create="' + escapeHtml(s.id) + '">Registrar como ativa</button></p>';
  }

  function quizLineHtml(s) {
    const q = quizBySubscriber[s.id];
    if (!q) return '<p class="sub-line sub-quiz is-pending">Questionário: pendente</p>';
    return '<p class="sub-line sub-quiz">Questionário: respondido em ' + formatDate(q.submittedAt) +
      (q.submissions > 1 ? ' (' + q.submissions + ' envios)' : '') +
      ' <button class="btn btn-ghost sub-answers-btn" type="button" data-answers-sub="' + escapeHtml(s.id) + '">Ver respostas</button></p>';
  }

  // ---- vinhos do clube (escolhidos do estoque, com o mês de entrega) --------
  const clubBySubscriber = {}; // id do assinante -> lista de vinhos já cadastrados

  function stockLabel(wine) {
    const qty = stockMap[wine.slug];
    if (typeof qty !== 'number') return wine.name;
    return wine.name + ' — ' + (qty > 0 ? qty + ' em estoque' : 'sem estoque');
  }

  function clubOptionsHtml(query) {
    const wines = (query ? window.Catalog.searchByName(query) : window.Catalog.MENU.slice())
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    if (!wines.length) return '<option value="" disabled>Nenhum vinho encontrado</option>';
    return wines.map((w) => '<option value="' + escapeHtml(w.slug) + '">' + escapeHtml(stockLabel(w)) + '</option>').join('');
  }

  function clubItemHtml(w) {
    const rating = w.rating
      ? '<span class="club-item-stars">' + '★'.repeat(w.rating) + '☆'.repeat(5 - w.rating) + '</span> ' + w.rating + ' de 5'
      : 'Sem avaliação';
    const future = w.month > window.Club.currentMonth() ? '<span class="club-item-future">ainda não liberado para o assinante</span>' : '';
    return (
      '<div class="club-item">' +
        '<div class="club-item-main">' +
          '<span class="club-item-month">' + escapeHtml(window.Club.monthLabel(w.month)) + '</span>' +
          '<span class="club-item-name">' + escapeHtml(w.name) + '</span>' +
          '<span class="club-item-rating">' + rating + '</span>' + future +
        '</div>' +
        '<button class="btn btn-ghost club-remove" type="button" data-club-remove="' + escapeHtml(w.id) + '">Remover</button>' +
      '</div>'
    );
  }

  function renderClubPanel(box, id) {
    const wines = clubBySubscriber[id] || [];
    const list = wines.length
      ? wines.map(clubItemHtml).join('')
      : '<p class="sub-line">Nenhum vinho cadastrado para este assinante ainda.</p>';
    const prev = box.querySelector('.club-form');
    if (prev) {
      // Só atualiza a lista: mantém o que já foi digitado/escolhido no formulário.
      box.querySelector('.club-list').innerHTML = list;
      return;
    }
    box.innerHTML =
      '<div class="club-form">' +
        '<div class="field"><label>Mês de entrega</label>' +
          '<input type="month" class="club-month" value="' + escapeHtml(window.Club.currentMonth()) + '" aria-label="Mês de entrega"></div>' +
        '<div class="field"><label>Vinho (lista do estoque)</label>' +
          '<input type="search" class="club-search" placeholder="Buscar vinho pelo nome…" aria-label="Buscar vinho pelo nome" autocomplete="off">' +
          '<select class="club-select" size="6" aria-label="Vinho do estoque">' + clubOptionsHtml('') + '</select></div>' +
        '<button class="btn btn-gold club-add" type="button">Adicionar</button>' +
        '<p class="orders-status club-msg" hidden></p>' +
      '</div>' +
      '<div class="club-list">' + list + '</div>';
  }

  function setClubMessage(box, message, isError) {
    const el = box.querySelector('.club-msg');
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || '';
    el.classList.toggle('card-msg', !!isError);
  }

  async function toggleClubPanel(id, button) {
    const box = subList.querySelector('[data-club-for="' + id + '"]');
    if (!box) return;
    if (!box.hidden) { box.hidden = true; button.textContent = 'Vinhos do clube'; return; }
    box.hidden = false;
    button.textContent = 'Fechar vinhos do clube';
    if (clubBySubscriber[id]) { renderClubPanel(box, id); return; }
    box.textContent = 'Carregando…';
    try {
      const res = await fetch('/api/subscribers?view=wines&id=' + encodeURIComponent(id), { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) { showLogin(); return; }
      if (!res.ok) throw new Error('http ' + res.status);
      clubBySubscriber[id] = (await res.json()).wines || [];
      box.innerHTML = '';
      renderClubPanel(box, id);
    } catch (err) {
      box.textContent = 'Não foi possível carregar os vinhos agora.';
    }
  }

  async function addClubWine(id, box) {
    const slug = box.querySelector('.club-select').value;
    const month = box.querySelector('.club-month').value;
    if (!slug) { setClubMessage(box, 'Escolha um vinho da lista.', true); return; }
    if (!window.Club.isValidMonth(month)) { setClubMessage(box, 'Informe o mês de entrega.', true); return; }
    const button = box.querySelector('.club-add');
    button.disabled = true;
    try {
      const res = await fetch('/api/subscribers?action=add-wine&id=' + encodeURIComponent(id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ slug, month })
      });
      if (res.status === 401) { showLogin(); return; }
      if (res.status === 409) { setClubMessage(box, 'Este vinho já está cadastrado neste mês para este assinante.', true); return; }
      if (res.status === 404) { setClubMessage(box, 'Este assinante não existe mais.', true); return; }
      if (res.status === 400) { setClubMessage(box, 'Confira o vinho e o mês escolhidos.', true); return; }
      if (!res.ok) throw new Error('http ' + res.status);
      const wine = (await res.json()).wine;
      clubBySubscriber[id] = (clubBySubscriber[id] || []).concat(wine).sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : b.id - a.id));
      setClubMessage(box, wine.name + ' cadastrado para ' + window.Club.monthLabel(wine.month) + '.', false);
      renderClubPanel(box, id);
    } catch (err) {
      setClubMessage(box, 'Não foi possível cadastrar agora. Tente de novo.', true);
    } finally {
      button.disabled = false;
    }
  }

  async function removeClubWine(id, wineId, box) {
    const wine = (clubBySubscriber[id] || []).find((w) => String(w.id) === String(wineId));
    if (!window.confirm('Remover ' + (wine ? wine.name + ' (' + window.Club.monthLabel(wine.month) + ')' : 'este vinho') + ' do assinante?')) return;
    try {
      const res = await fetch('/api/subscribers?action=remove-wine&id=' + encodeURIComponent(id) + '&wine=' + encodeURIComponent(wineId), { method: 'POST', credentials: 'same-origin' });
      if (res.status === 401) { showLogin(); return; }
      if (!res.ok && res.status !== 404) throw new Error('http ' + res.status);
      clubBySubscriber[id] = (clubBySubscriber[id] || []).filter((w) => String(w.id) !== String(wineId));
      setClubMessage(box, '', false);
      renderClubPanel(box, id);
    } catch (err) {
      setClubMessage(box, 'Não foi possível remover agora. Tente de novo.', true);
    }
  }

  function renderSubscriber(s) {
    const contact = [formatPhone(s.phone), s.email].filter(Boolean).map(escapeHtml).join(' · ');
    const address = subscriberAddress(s);
    return (
      '<article class="sub-card' + (s.id === editingId ? ' is-editing' : '') + '">' +
        '<div class="sub-card-head">' +
          '<span class="sub-name">' + escapeHtml(s.name) + '</span>' +
          '<span class="sub-actions">' +
            '<button class="btn btn-ghost sub-edit" type="button" data-edit-sub="' + escapeHtml(s.id) + '">Editar</button>' +
            '<button class="btn btn-ghost sub-reset" type="button" data-reset-sub="' + escapeHtml(s.id) + '">Redefinir senha</button>' +
            '<button class="btn btn-ghost sub-delete" type="button" data-delete-sub="' + escapeHtml(s.id) + '">Excluir</button>' +
          '</span>' +
        '</div>' +
        '<p class="sub-line">' + contact + '</p>' +
        quizLineHtml(s) +
        subscriptionLineHtml(s) +
        (address ? '<p class="sub-line">' + escapeHtml(address) + '</p>' : '') +
        '<p class="sub-date">Cadastrado em ' + formatDate(s.createdAt) + '</p>' +
        '<div class="sub-answers" data-answers-for="' + escapeHtml(s.id) + '" hidden></div>' +
        '<p class="sub-line"><button class="btn btn-ghost sub-answers-btn" type="button" data-club-sub="' + escapeHtml(s.id) + '">Vinhos do clube</button></p>' +
        '<div class="sub-club" data-club-for="' + escapeHtml(s.id) + '" hidden></div>' +
      '</article>'
    );
  }

  function renderSubscribers() {
    const q = subFilter.value.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const shown = !q ? subscribers : subscribers.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q) ||
      (digits && s.phone.includes(digits)));
    subCount.textContent = '(' + (q ? shown.length + ' de ' + subscribers.length : subscribers.length) + ')';
    subList.innerHTML = shown.length
      ? shown.map(renderSubscriber).join('')
      : '<p class="orders-empty">' + (subscribers.length ? 'Nenhum assinante encontrado.' : 'Nenhum assinante cadastrado ainda.') + '</p>';
  }

  // Quem já respondeu ao questionário. Se falhar, a lista abre mesmo assim.
  async function loadQuestionnaireSummary() {
    quizBySubscriber = {};
    try {
      const res = await fetch('/api/subscribers?view=questionnaire', { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) return;
      ((await res.json()).responses || []).forEach((r) => { quizBySubscriber[r.subscriberId] = r; });
    } catch (err) { /* sem resumo: todos aparecem como pendentes */ }
  }

  async function loadSubscribers() {
    try {
      const res = await fetch('/api/subscribers', { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) { showLogin(); return; }
      if (!res.ok) throw new Error('http ' + res.status);
      subscribers = (await res.json()).subscribers || [];
      await loadQuestionnaireSummary();
      renderSubscribers();
    } catch (err) {
      subCount.textContent = '';
      subList.innerHTML = '<p class="orders-empty">Não foi possível carregar os assinantes agora.</p>';
    }
  }

  async function submitSubscriber(event) {
    event.preventDefault();
    setSubStatus('', false);
    showSubErrors([]);
    const payload = {};
    Object.keys(SUB_FIELD_IDS).forEach((field) => { payload[field] = document.getElementById(SUB_FIELD_IDS[field]).value; });

    subSubmit.disabled = true;
    try {
      const wasEditing = editingId !== null;
      const res = await fetch('/api/subscribers' + (wasEditing ? '?id=' + encodeURIComponent(editingId) : ''), {
        method: wasEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      if (res.status === 401) { showLogin(); return; }
      if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        showSubErrors(Array.isArray(data.errors) ? data.errors : []);
        return;
      }
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        showSubDuplicate(data.field);
        return;
      }
      if (res.status === 404 && wasEditing) {
        stopEditing();
        setSubStatus('Este assinante não existe mais (foi excluído). Nada foi alterado.', true);
        await loadSubscribers();
        return;
      }
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      stopEditing();
      setSubStatus('Assinante ' + data.subscriber.name + (wasEditing ? ' atualizado.' : ' cadastrado.'), false);
      await loadSubscribers();
      await loadSubscriptions(); // quem é cadastrado já entra com a assinatura ativa
      if (!wasEditing) document.getElementById('sub-name').focus();
    } catch (err) {
      setSubStatus('Não foi possível ' + (editingId === null ? 'cadastrar' : 'salvar') + ' agora. Tente de novo.', true);
    } finally {
      subSubmit.disabled = false;
    }
  }

  async function deleteSubscriber(id) {
    const sub = subscribers.find((s) => String(s.id) === String(id));
    if (!window.confirm('Excluir o cadastro de ' + (sub ? sub.name : 'este assinante') + '? Isso não pode ser desfeito.')) return;
    try {
      const res = await fetch('/api/subscribers?id=' + encodeURIComponent(id), { method: 'DELETE', credentials: 'same-origin' });
      if (res.status === 401) { showLogin(); return; }
      if (!res.ok && res.status !== 404) throw new Error('http ' + res.status);
      if (String(editingId) === String(id)) stopEditing();
      setSubStatus('', false);
      await loadSubscribers();
      await loadSubscriptions();
    } catch (err) {
      setSubStatus('Não foi possível excluir agora. Tente de novo.', true);
    }
  }

  // "Esqueci minha senha": volta o assinante para a senha inicial.
  async function resetSubscriberPassword(id) {
    const sub = subscribers.find((s) => String(s.id) === String(id));
    const who = sub ? sub.name : 'este assinante';
    if (!window.confirm('Redefinir a senha de ' + who + ' para a senha inicial (123mudar)? Se a pessoa estiver conectada, será desconectada.')) return;
    try {
      const res = await fetch('/api/subscribers?action=reset-password&id=' + encodeURIComponent(id), { method: 'POST', credentials: 'same-origin' });
      if (res.status === 401) { showLogin(); return; }
      if (res.status === 404) { setSubStatus('Este assinante não existe mais.', true); await loadSubscribers(); return; }
      if (!res.ok) throw new Error('http ' + res.status);
      setSubStatus('Senha de ' + who + ' redefinida para a senha inicial (123mudar).', false);
    } catch (err) {
      setSubStatus('Não foi possível redefinir a senha agora. Tente de novo.', true);
    }
  }

  subForm.addEventListener('submit', submitSubscriber);
  document.getElementById('sub-phone').addEventListener('input', function () { this.value = maskPhone(this.value); });
  document.getElementById('sub-cep').addEventListener('input', function () { this.value = maskCep(this.value); });
  document.getElementById('sub-state').addEventListener('input', function () { this.value = this.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2); });
  subFilter.addEventListener('input', renderSubscribers);
  subList.addEventListener('input', (event) => {
    if (!event.target.classList.contains('club-search')) return;
    const select = event.target.closest('.club-form').querySelector('.club-select');
    select.innerHTML = clubOptionsHtml(event.target.value.trim());
  });
  subCancel.addEventListener('click', () => { setSubStatus('', false); stopEditing(); });
  subList.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit-sub]');
    if (edit) { startEditing(edit.dataset.editSub); return; }
    const create = event.target.closest('[data-sub-create]');
    if (create) { createLegacySubscription(create.dataset.subCreate); return; }
    const club = event.target.closest('[data-club-sub]');
    if (club) { toggleClubPanel(club.dataset.clubSub, club); return; }
    const clubAdd = event.target.closest('.club-add');
    if (clubAdd) {
      const box = clubAdd.closest('[data-club-for]');
      addClubWine(box.dataset.clubFor, box);
      return;
    }
    const clubRemove = event.target.closest('[data-club-remove]');
    if (clubRemove) {
      const box = clubRemove.closest('[data-club-for]');
      removeClubWine(box.dataset.clubFor, clubRemove.dataset.clubRemove, box);
      return;
    }
    const answers = event.target.closest('[data-answers-sub]');
    if (answers) { toggleSubscriberAnswers(answers.dataset.answersSub, answers); return; }
    const reset = event.target.closest('[data-reset-sub]');
    if (reset) { resetSubscriberPassword(reset.dataset.resetSub); return; }
    const del = event.target.closest('[data-delete-sub]');
    if (del) deleteSubscriber(del.dataset.deleteSub);
  });

  // ------------------------------------------------------------- estoque ---
  let stockMap = {};

  function setStockStatus(message, isError) {
    stockStatus.hidden = !message;
    stockStatus.textContent = message || '';
    stockStatus.classList.toggle('card-msg', !!isError);
  }

  function renderStock() {
    const query = stockFilter.value.trim();
    const wines = (query ? window.Catalog.searchByName(query) : window.Catalog.MENU.slice())
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    if (!wines.length) {
      stockList.innerHTML = '<p class="orders-empty">Nenhum vinho encontrado.</p>';
      return;
    }
    stockList.innerHTML = wines.map((wine) => {
      const qty = typeof stockMap[wine.slug] === 'number' ? stockMap[wine.slug] : '';
      const empty = qty === 0;
      return (
        '<div class="stock-row' + (empty ? ' is-empty' : '') + '" data-slug="' + escapeHtml(wine.slug) + '">' +
          '<span class="stock-name">' + escapeHtml(wine.name) + (empty ? ' <em>esgotado</em>' : '') + '</span>' +
          '<input class="stock-qty" type="number" min="0" max="9999" step="1" inputmode="numeric" value="' + escapeHtml(qty) + '" aria-label="Estoque de ' + escapeHtml(wine.name) + '">' +
          '<button class="btn btn-gold stock-save" type="button" data-stock-save>Salvar</button>' +
        '</div>'
      );
    }).join('');
  }

  async function loadStock() {
    try {
      const res = await fetch('/api/stock', { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error('http ' + res.status);
      stockMap = await res.json();
      setStockStatus('', false);
      renderStock();
    } catch (err) {
      setStockStatus('Não foi possível carregar o estoque agora.', true);
    }
  }

  async function saveStock(row) {
    const slug = row.dataset.slug;
    const input = row.querySelector('.stock-qty');
    const quantity = Number(input.value);
    if (input.value.trim() === '' || !Number.isInteger(quantity) || quantity < 0) {
      setStockStatus('Informe um número inteiro, zero ou maior.', true);
      return;
    }
    const button = row.querySelector('[data-stock-save]');
    button.disabled = true;
    try {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ slug, quantity })
      });
      if (res.status === 401) { showLogin(); return; }
      if (!res.ok) throw new Error('http ' + res.status);
      stockMap[slug] = quantity;
      const wine = window.Catalog.findBySlug(slug);
      setStockStatus('Estoque de ' + (wine ? wine.name : slug) + ' atualizado para ' + quantity + '.', false);
      row.classList.toggle('is-empty', quantity === 0);
    } catch (err) {
      setStockStatus('Não foi possível salvar o estoque. Tente de novo.', true);
    } finally {
      button.disabled = false;
    }
  }

  async function cancelOrder(orderId) {
    if (!window.confirm('Cancelar o pedido #' + orderId + '? As garrafas voltam para o estoque.')) return;
    try {
      const res = await fetch('/api/order-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ orderId: Number(orderId) })
      });
      if (res.status === 401) { showLogin(); return; }
      if (!res.ok) throw new Error('http ' + res.status);
      await loadOrders();
      await loadStock();
    } catch (err) {
      setOrdersStatus('Não foi possível cancelar o pedido agora. Tente de novo.', true);
    }
  }

  stockFilter.addEventListener('input', renderStock);
  stockList.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-stock-save]');
    if (btn) saveStock(btn.closest('.stock-row'));
  });
  ordersList.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-cancel-order]');
    if (btn) cancelOrder(btn.dataset.cancelOrder);
  });

  async function handleLoginSubmit(event) {
    event.preventDefault();
    loginErrorBox.hidden = true;
    loginErrorBox.textContent = '';
    loginSubmit.disabled = true;

    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password: passwordInput.value })
      });

      if (!res.ok) {
        // 503 = ADMIN_PASSWORD/ADMIN_SESSION_SECRET não configuradas no ambiente.
        // Sem essa distinção o dono da loja fica tentando senhas à toa.
        loginErrorBox.textContent = res.status === 503
          ? 'Painel administrativo ainda não configurado — defina ADMIN_PASSWORD e ADMIN_SESSION_SECRET no ambiente (veja PUBLICAR.md).'
          : 'Senha incorreta. Tente novamente.';
        loginErrorBox.hidden = false;
        return;
      }

      loginForm.reset();
      await loadOrders();
    } catch (err) {
      loginErrorBox.textContent = 'Falha de conexão. Tente novamente.';
      loginErrorBox.hidden = false;
    } finally {
      loginSubmit.disabled = false;
    }
  }

  loginForm.addEventListener('submit', handleLoginSubmit);

  loadOrders();
})();
