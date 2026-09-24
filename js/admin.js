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

  const stockSection = document.getElementById('admin-stock');
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
    stockSection.hidden = true;
  }

  function showOrders() {
    loginSection.hidden = true;
    ordersSection.hidden = false;
    shippingSection.hidden = false;
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
      if (!showMelhorEnvioNotice()) {
        loadMelhorEnvioStatus();
      }
    } catch (err) {
      showOrders();
      ordersList.innerHTML = '';
      setOrdersStatus('Falha de conexão ao buscar pedidos. Verifique sua internet e tente novamente.', true);
    }
  }

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
