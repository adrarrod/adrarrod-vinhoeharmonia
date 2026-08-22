// js/admin.js
// Lógica do painel administrativo (admin.html): protegido por senha via
// GET /api/orders (401 quando sem sessão) e POST /api/admin-login.
// Página somente leitura — sem edição de status nesta v1.
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
  }

  function showOrders() {
    loginSection.hidden = true;
    ordersSection.hidden = false;
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

  function renderOrderCard(order) {
    const deliveryLabel = DELIVERY_LABELS[order.delivery_type] || order.delivery_type || '—';
    const paymentLabel = PAYMENT_LABELS[order.payment_method] || order.payment_method || '—';

    return (
      '<article class="order-card">' +
        '<div class="order-card-head">' +
          '<h3>Pedido #' + escapeHtml(order.id) + '</h3>' +
          '<span class="order-badge">' + escapeHtml(order.status || 'novo') + '</span>' +
        '</div>' +
        '<p class="order-date">' + formatDate(order.created_at) + '</p>' +
        '<div class="order-meta-grid">' +
          '<div><span class="order-meta-label">Cliente</span><span>' + escapeHtml(order.full_name) + '</span></div>' +
          '<div><span class="order-meta-label">Telefone</span><span>' + escapeHtml(order.phone) + '</span></div>' +
          '<div><span class="order-meta-label">Entrega</span><span>' + escapeHtml(deliveryLabel) + '</span></div>' +
          '<div><span class="order-meta-label">Pagamento</span><span>' + escapeHtml(paymentLabel) + '</span></div>' +
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
    } catch (err) {
      showOrders();
      ordersList.innerHTML = '';
      setOrdersStatus('Falha de conexão ao buscar pedidos. Verifique sua internet e tente novamente.', true);
    }
  }

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
