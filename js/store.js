// js/store.js — toda a interação da loja Vinho & Harmonia.
// Depende de window.Catalog (js/catalog.js) e window.Pricing (js/pricing.js),
// carregados antes deste arquivo.
(function () {
  'use strict';

  var Catalog = window.Catalog;
  var Pricing = window.Pricing;

  // ---------------------------------------------------------------- consts --
  // Chave PIX da loja. O frontend é 100% estático (sem templating no servidor),
  // então a chave fica hardcoded aqui. Ver comentário em .env.example.
  var PIX_KEY = 'contato@vinhoharmonia.com.br';

  var AGE_KEY = 'idade_confirmada';
  var CART_KEY = 'vh_cart';
  var LAST_ORDER_KEY = 'vh_last_order';
  // Guarda o pedido enquanto o cliente está no checkout do Mercado Pago: o
  // redirect é uma navegação completa, então o estado em memória se perde.
  var PENDING_MP_KEY = 'vh_pending_mp';

  var BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  function money(value) { return BRL.format(Number(value) || 0); }

  function formatAbv(abv) {
    var str = Number.isInteger(abv) ? String(abv) : abv.toFixed(1).replace('.', ',');
    return str + '% vol.';
  }

  var FIELD_LABELS = {
    fullName: 'Nome completo',
    birthDate: 'Data de nascimento (é preciso ter 18 anos ou mais)',
    cpf: 'CPF',
    phone: 'Celular',
    email: 'E-mail',
    street: 'Rua',
    number: 'Número',
    cep: 'CEP',
    neighborhood: 'Bairro',
    city: 'Cidade',
    state: 'Estado',
    items: 'Carrinho vazio',
    paymentMethod: 'Forma de pagamento',
    deliveryType: 'Tipo de entrega'
  };

  // ----------------------------------------------------------------- utils --
  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function $$(sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* modo privado */ }
  }

  var toastTimer = null;
  function toast(message) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2000);
  }

  function lockScroll() {
    var anyOpen = $$('.overlay').some(function (o) { return !o.hidden; }) || !$('#confirmation').hidden;
    document.body.classList.toggle('no-scroll', anyOpen);
  }

  function openOverlay(el) { el.hidden = false; lockScroll(); }
  function closeOverlay(el) { el.hidden = true; lockScroll(); }

  // ----------------------------------------------------------------- state --
  var state = {
    cart: sanitizeCart(readJSON(CART_KEY, [])),
    deliveryType: 'delivery',
    freight: { cost: null, free: false, quoted: false },
    coupon: { code: null, valid: false },
    paymentMethod: 'pix',
    modalSlug: null,
    pendingDeepLink: null,
    deferredInstallPrompt: null,
    pwaDismissed: false,
    stock: null
  };

  function sanitizeCart(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    raw.forEach(function (item) {
      if (!item || typeof item.slug !== 'string') return;
      var wine = Catalog.findBySlug(item.slug);
      if (!wine) return; // item saiu do catálogo
      var qty = Math.max(1, Math.min(99, parseInt(item.qty, 10) || 1));
      out.push({ slug: wine.slug, name: wine.name, price: wine.price, qty: qty, note: typeof item.note === 'string' ? item.note : '' });
    });
    return out;
  }

  function persistCart() { writeJSON(CART_KEY, state.cart); }

  function subtotal() { return Pricing.calcSubtotal(state.cart); }

  function cartCount() {
    return state.cart.reduce(function (sum, item) { return sum + item.qty; }, 0);
  }

  function findCartItem(slug) {
    return state.cart.filter(function (i) { return i.slug === slug; })[0];
  }

  // ---------------------------------------------------------------- estoque --
  // state.stock é o estoque ao vivo de /api/stock (slug -> quantidade). null =
  // ainda não carregou (ou a chamada falhou): sem limite local, mas o servidor
  // continua barrando o que não existe — quem decide é sempre ele.
  function stockOf(slug) {
    return state.stock && typeof state.stock[slug] === 'number' ? state.stock[slug] : null;
  }

  function maxQty(slug) {
    var s = stockOf(slug);
    return s === null ? 99 : Math.min(99, s);
  }

  function stockMessage(name, available) {
    if (available <= 0) return name + ' está esgotado';
    return 'Só temos ' + available + (available === 1 ? ' unidade' : ' unidades') + ' de ' + name;
  }

  function addToCart(slug, qty, note) {
    var wine = Catalog.findBySlug(slug);
    if (!wine) return;
    var requested = Math.max(1, parseInt(qty, 10) || 1);
    var existing = findCartItem(slug);
    var room = maxQty(slug) - (existing ? existing.qty : 0);
    if (room <= 0) { toast(stockMessage(wine.name, maxQty(slug))); return; }
    var amount = Math.min(requested, room);
    if (existing) {
      existing.qty = Math.min(99, existing.qty + amount);
      if (note) existing.note = note;
    } else {
      state.cart.push({ slug: wine.slug, name: wine.name, price: wine.price, qty: amount, note: note || '' });
    }
    afterCartChange();
    toast(amount < requested ? stockMessage(wine.name, maxQty(slug)) : wine.name + ' adicionado');
  }

  function setCartQty(slug, qty) {
    var item = findCartItem(slug);
    if (!item) return;
    var next = parseInt(qty, 10) || 0;
    var limit = maxQty(slug);
    if (next > limit) { toast(stockMessage(item.name, limit)); next = limit; }
    if (next <= 0) {
      state.cart = state.cart.filter(function (i) { return i.slug !== slug; });
    } else {
      item.qty = next;
    }
    afterCartChange();
  }

  function afterCartChange() {
    persistCart();
    // Uma cotação de frete antiga não vale para outro subtotal: zera o estado
    // e também a dica ao lado do CEP, que senão continuaria mostrando o valor
    // antigo enquanto o resumo já exibe o novo.
    state.freight = { cost: null, free: false, quoted: false };
    var freightHint = $('#freight-hint');
    if (freightHint) {
      freightHint.className = 'field-hint';
      freightHint.textContent = '';
    }
    renderFab();
    renderCart();
    renderCheckoutSummary();
  }

  // -------------------------------------------------------------- age gate --
  var ageConfirmed = false;

  function initAgeGate() {
    var gate = $('#age-gate');
    var confirmed = false;
    try { confirmed = localStorage.getItem(AGE_KEY) === '1'; } catch (e) { confirmed = false; }

    if (confirmed) {
      ageConfirmed = true;
      gate.hidden = true;
      lockScroll();
      flushDeepLink();
      return;
    }

    openOverlay(gate);

    $('#age-yes').addEventListener('click', function () {
      try { localStorage.setItem(AGE_KEY, '1'); } catch (e) { /* ignore */ }
      ageConfirmed = true;
      closeOverlay(gate);
      flushDeepLink();
    });

    $('#age-no').addEventListener('click', function () {
      window.location.href = 'https://www.google.com';
    });
  }

  // ------------------------------------------------------------- catálogo ---
  function cardTemplate(wine) {
    return '' +
      '<article class="card" data-slug="' + esc(wine.slug) + '">' +
        '<div class="card-photo">' +
          '<img src="' + esc(wine.image) + '" alt="Garrafa de ' + esc(wine.name) + '" loading="lazy" width="400" height="400">' +
          '<button class="card-view" type="button" data-open="' + esc(wine.slug) + '" aria-label="Ver detalhes de ' + esc(wine.name) + '">👁</button>' +
        '</div>' +
        '<div class="card-body">' +
          '<button class="card-name" type="button" data-open="' + esc(wine.slug) + '">' + esc(wine.name) + '</button>' +
          '<p class="card-meta">' + esc(wine.country) + ' &middot; ' + esc(wine.grape) + '</p>' +
          '<p class="card-price">' + money(wine.price) + '</p>' +
          '<p class="soldout-label">Esgotado</p>' +
          '<div class="card-actions">' +
            '<div class="stepper" data-card-qty>' +
              '<button type="button" data-step="-1" aria-label="Diminuir quantidade">&minus;</button>' +
              '<span class="qty" data-qty>1</span>' +
              '<button type="button" data-step="1" aria-label="Aumentar quantidade">+</button>' +
            '</div>' +
            '<button class="btn btn-add" type="button" data-add="' + esc(wine.slug) + '">Adicionar</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function renderCatalog() {
    var tabs = $('#tabs');
    var catalog = $('#catalog');
    var tabsHtml = '';
    var sectionsHtml = '';

    Catalog.CATEGORIES.forEach(function (category, index) {
      var id = 'cat-' + index;
      var wines = Catalog.MENU.filter(function (w) { return w.category === category; });
      tabsHtml += '<button class="tab' + (index === 0 ? ' active' : '') + '" type="button" data-target="' + id + '">' + esc(category) + '</button>';
      sectionsHtml += '' +
        '<section class="category" id="' + id + '" data-category="' + esc(category) + '">' +
          '<div class="category-head">' +
            '<h2>' + esc(category) + '</h2>' +
            '<span class="category-count">' + wines.length + ' rótulos</span>' +
          '</div>' +
          '<div class="grid">' + wines.map(cardTemplate).join('') + '</div>' +
        '</section>';
    });

    tabs.innerHTML = tabsHtml;
    catalog.innerHTML = sectionsHtml;

    tabs.addEventListener('click', function (event) {
      var tab = event.target.closest('.tab');
      if (!tab) return;
      var section = document.getElementById(tab.dataset.target);
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    catalog.addEventListener('click', handleCatalogClick);

    initScrollSpy();
  }

  // Compartilhado entre #catalog e #search-results-grid: abrir modal, stepper
  // de quantidade e adicionar ao carrinho funcionam igual nos dois.
  function handleCatalogClick(event) {
    var opener = event.target.closest('[data-open]');
    if (opener) { openProductModal(opener.dataset.open); return; }

    var stepBtn = event.target.closest('[data-step]');
    if (stepBtn) {
      var box = stepBtn.closest('[data-card-qty]');
      var label = $('[data-qty]', box);
      var cardSlug = stepBtn.closest('.card').dataset.slug;
      var limit = Math.max(1, maxQty(cardSlug));
      var wanted = (parseInt(label.textContent, 10) || 1) + parseInt(stepBtn.dataset.step, 10);
      if (wanted > limit) toast(stockMessage(Catalog.findBySlug(cardSlug).name, limit));
      label.textContent = String(Math.max(1, Math.min(limit, wanted)));
      return;
    }

    var addBtn = event.target.closest('[data-add]');
    if (addBtn) {
      var card = addBtn.closest('.card');
      var qtyLabel = $('[data-qty]', card);
      addToCart(addBtn.dataset.add, parseInt(qtyLabel.textContent, 10) || 1, '');
      qtyLabel.textContent = '1';
    }
  }

  // ------------------------------------------------------------- pesquisa ---
  function renderSearchResults(query) {
    var matches = Catalog.searchByName(query);
    var grid = $('#search-results-grid');
    var count = $('#search-results-count');
    var empty = $('#search-empty');

    $('#tabs').hidden = true;
    $('#catalog').hidden = true;
    $('#search-results').hidden = false;

    empty.hidden = matches.length > 0;
    count.textContent = matches.length ? matches.length + ' rótulo(s) encontrado(s)' : '';
    grid.innerHTML = matches.map(cardTemplate).join('');
    applyStockToCards();
  }

  function clearSearch() {
    $('#wine-search').value = '';
    $('#search-clear').hidden = true;
    $('#tabs').hidden = false;
    $('#catalog').hidden = false;
    $('#search-results').hidden = true;
  }

  function initSearch() {
    var input = $('#wine-search');
    var clearBtn = $('#search-clear');
    var results = $('#search-results');

    input.addEventListener('input', function () {
      var query = input.value.trim();
      clearBtn.hidden = query.length === 0;
      if (!query) { clearSearch(); return; }
      renderSearchResults(query);
    });

    clearBtn.addEventListener('click', function () {
      clearSearch();
      input.focus();
    });

    results.addEventListener('click', function (event) {
      if (event.target.closest('#search-clear-inline')) {
        clearSearch();
        input.focus();
        return;
      }
      handleCatalogClick(event);
    });
  }

  function initScrollSpy() {
    var sections = $$('.category');
    if (!sections.length || typeof IntersectionObserver === 'undefined') return;

    function activate(id) {
      $$('.tab').forEach(function (tab) { tab.classList.toggle('active', tab.dataset.target === id); });
    }

    var observer = new IntersectionObserver(function (entries) {
      var visible = entries
        .filter(function (e) { return e.isIntersecting; })
        .sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; })[0];
      if (visible) activate(visible.target.id);
    }, { rootMargin: '-130px 0px -55% 0px', threshold: [0, 0.15, 0.4, 0.75] });

    sections.forEach(function (section) { observer.observe(section); });
  }

  // -------------------------------------------------------- modal produto ---
  function pairingTemplate(wine) {
    return '' +
      '<div class="pairing">' +
        '<img src="' + esc(wine.image) + '" alt="' + esc(wine.name) + '" loading="lazy" width="46" height="46">' +
        '<div class="pairing-info">' +
          '<div class="pairing-name">' + esc(wine.name) + '</div>' +
          '<div class="pairing-price">' + money(wine.price) + '</div>' +
        '</div>' +
        '<button class="btn btn-gold" type="button" data-quick-add="' + esc(wine.slug) + '">Adicionar</button>' +
      '</div>';
  }

  function openProductModal(slug) {
    var wine = Catalog.findBySlug(slug);
    if (!wine) return;
    state.modalSlug = slug;

    var img = $('#pm-img');
    img.src = wine.image;
    img.alt = 'Garrafa de ' + wine.name;
    $('#pm-name').textContent = wine.name;
    $('#pm-meta').textContent = wine.category + ' · ' + wine.country + ' · ' + wine.grape;
    $('#pm-desc').textContent = wine.description;
    $('#pm-price').textContent = money(wine.price);
    $('#pm-qty').textContent = '1';

    var abvEl = $('#pm-abv');
    if (typeof wine.abv === 'number') {
      abvEl.hidden = false;
      abvEl.textContent = 'Teor alcoólico: ' + formatAbv(wine.abv);
    } else {
      abvEl.hidden = true;
    }

    var foodPairings = Array.isArray(wine.pairings) ? wine.pairings : [];
    $('#pm-food-pairings').hidden = foodPairings.length === 0;
    $('#pm-food-pairing-icons').innerHTML = foodPairings.map(function (p) {
      return '<span class="food-pairing-icon" title="' + esc(p) + '">' +
        '<span aria-hidden="true">' + Catalog.pairingIcon(p) + '</span>' +
        '<span class="food-pairing-label">' + esc(p) + '</span>' +
      '</span>';
    }).join('');

    var soldOut = stockOf(slug) === 0;
    $('#pm-soldout').hidden = !soldOut;
    $('#pm-note-field').hidden = soldOut;
    $('#pm-actions').hidden = soldOut;

    var existing = findCartItem(slug);
    $('#pm-note').value = existing && existing.note ? existing.note : '';

    var pairings = Catalog.suggestPairings(slug, 3)
      .filter(function (w) { return w.slug !== slug && stockOf(w.slug) !== 0; })
      .slice(0, 2);
    $('#pm-pairings').hidden = pairings.length === 0;
    $('#pm-pairing-list').innerHTML = pairings.map(pairingTemplate).join('');

    openOverlay($('#product-modal'));
  }

  function initProductModal() {
    var modal = $('#product-modal');

    $('#pm-close').addEventListener('click', function () { closeOverlay(modal); });
    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeOverlay(modal);
    });

    $('#pm-stepper').addEventListener('click', function (event) {
      var btn = event.target.closest('[data-step]');
      if (!btn) return;
      var label = $('#pm-qty');
      var limit = Math.max(1, maxQty(state.modalSlug));
      var wanted = (parseInt(label.textContent, 10) || 1) + parseInt(btn.dataset.step, 10);
      if (wanted > limit) toast(stockMessage(Catalog.findBySlug(state.modalSlug).name, limit));
      label.textContent = String(Math.max(1, Math.min(limit, wanted)));
    });

    $('#pm-add').addEventListener('click', function () {
      addToCart(state.modalSlug, parseInt($('#pm-qty').textContent, 10) || 1, $('#pm-note').value.trim());
      closeOverlay(modal);
    });

    $('#pm-pairing-list').addEventListener('click', function (event) {
      var btn = event.target.closest('[data-quick-add]');
      if (!btn) return;
      addToCart(btn.dataset.quickAdd, 1, '');
    });
  }

  // ----------------------------------------------------- estoque na vitrine ---
  function applyStockToCards() {
    $$('.card[data-slug]').forEach(function (card) {
      var soldOut = stockOf(card.dataset.slug) === 0;
      card.classList.toggle('is-soldout', soldOut);
      $$('[data-add], [data-step]', card).forEach(function (btn) { btn.disabled = soldOut; });
    });
  }

  // Aplica o estoque atual: marca esgotados na vitrine e ajusta o carrinho
  // (tira o que esgotou, reduz o que passou do estoque) avisando o cliente.
  function refreshStockUI() {
    applyStockToCards();
    var notes = [];
    state.cart = state.cart.filter(function (item) {
      var limit = maxQty(item.slug);
      if (limit <= 0) { notes.push(stockMessage(item.name, 0)); return false; }
      if (item.qty > limit) { notes.push(stockMessage(item.name, limit)); item.qty = limit; }
      return true;
    });
    if (notes.length) {
      afterCartChange();
      toast('Ajustamos seu carrinho: ' + notes[0] + (notes.length > 1 ? ' (e mais ' + (notes.length - 1) + ')' : ''));
    }
  }

  function loadStock() {
    return fetch('/api/stock', { cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('http ' + res.status)); })
      .then(function (map) { state.stock = map; refreshStockUI(); })
      .catch(function () { /* sem estoque local: o servidor ainda barra o pedido */ });
  }

  // O servidor recusou o pedido por falta de estoque (409): mostra o que mudou,
  // ajusta o carrinho e deixa o cliente revisar antes de enviar de novo.
  function handleOutOfStock(items) {
    if (!state.stock) state.stock = {};
    items.forEach(function (i) { state.stock[i.slug] = i.available; });
    var lines = items.map(function (i) {
      return i.available > 0 ? i.name + ' (restam ' + i.available + ')' : i.name + ' (esgotado)';
    });
    showFormErrors([], 'Ops! Alguém levou antes de você: ' + lines.join('; ') + '. Ajustamos seu carrinho — confira e envie de novo.');
    refreshStockUI();
    if (!state.cart.length) closeOverlay($('#checkout-sheet'));
    loadStock();
  }

  function initStock() {
    loadStock();
    // Voltou para a aba depois de um tempo: o estoque pode ter mudado.
    document.addEventListener('visibilitychange', function () { if (!document.hidden) loadStock(); });
  }

  // ------------------------------------------------------- carrinho / fab ---
  function renderFab() {
    var count = cartCount();
    $('#fab-count').textContent = String(count);
    $('#fab-total').textContent = money(subtotal());
    $('#cart-fab').setAttribute('aria-label', 'Abrir carrinho: ' + count + ' item(s), ' + money(subtotal()));
  }

  function cartItemTemplate(item) {
    var wine = Catalog.findBySlug(item.slug) || {};
    return '' +
      '<div class="cart-item" data-slug="' + esc(item.slug) + '">' +
        '<img src="' + esc(wine.image || '') + '" alt="' + esc(item.name) + '" loading="lazy" width="56" height="56">' +
        '<div class="cart-item-info">' +
          '<div class="cart-item-name">' + esc(item.name) + '</div>' +
          (item.note ? '<div class="cart-item-note">Obs.: ' + esc(item.note) + '</div>' : '') +
          '<div class="cart-item-row">' +
            '<div class="stepper">' +
              '<button type="button" data-cart-step="-1" aria-label="Diminuir">&minus;</button>' +
              '<span class="qty">' + item.qty + '</span>' +
              '<button type="button" data-cart-step="1" aria-label="Aumentar">+</button>' +
            '</div>' +
            '<span class="cart-item-sub">' + money(item.price * item.qty) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function crossSellWines() {
    if (!state.cart.length) return [];
    var top = state.cart.slice().sort(function (a, b) { return (b.price * b.qty) - (a.price * a.qty); })[0];
    var inCart = state.cart.map(function (i) { return i.slug; });
    return Catalog.suggestPairings(top.slug, 6)
      .filter(function (w) { return inCart.indexOf(w.slug) === -1 && stockOf(w.slug) !== 0; })
      .slice(0, 2);
  }

  function renderFreeShipping() {
    var progress = Pricing.freeShippingProgress(subtotal());
    var box = $('#freeship');
    box.classList.toggle('is-free', progress.qualifies);
    $('#freeship-text').innerHTML = progress.qualifies
      ? '🎉 Você ganhou entrega grátis!'
      : 'Faltam <strong>' + money(progress.remaining) + '</strong> para frete grátis';
    $('#freeship-fill').style.width = Math.min(100, Math.max(0, progress.percent)) + '%';
  }

  function renderCart() {
    var list = $('#cart-items');
    if (!state.cart.length) {
      list.innerHTML = '<div class="cart-empty"><div class="big">🍷</div><p>Seu carrinho está vazio.</p><p>Escolha um rótulo para começar.</p></div>';
    } else {
      list.innerHTML = state.cart.map(cartItemTemplate).join('');
    }

    renderFreeShipping();

    var suggestions = crossSellWines();
    $('#cross-sell').hidden = suggestions.length === 0;
    $('#cross-sell-list').innerHTML = suggestions.map(pairingTemplate).join('');

    $('#cart-subtotal').textContent = money(subtotal());
    $('#btn-checkout').disabled = state.cart.length === 0;
  }

  function initCart() {
    var drawer = $('#cart-drawer');

    $('#cart-fab').addEventListener('click', function () {
      renderCart();
      openOverlay(drawer);
    });
    $('#cart-close').addEventListener('click', function () { closeOverlay(drawer); });
    drawer.addEventListener('click', function (event) { if (event.target === drawer) closeOverlay(drawer); });

    $('#cart-items').addEventListener('click', function (event) {
      var btn = event.target.closest('[data-cart-step]');
      if (!btn) return;
      var row = btn.closest('.cart-item');
      var item = findCartItem(row.dataset.slug);
      if (!item) return;
      setCartQty(item.slug, item.qty + parseInt(btn.dataset.cartStep, 10));
    });

    $('#cross-sell-list').addEventListener('click', function (event) {
      var btn = event.target.closest('[data-quick-add]');
      if (btn) addToCart(btn.dataset.quickAdd, 1, '');
    });

    $('#btn-checkout').addEventListener('click', function () {
      closeOverlay(drawer);
      openCheckout();
    });
  }

  // ------------------------------------------------------------- checkout ---
  function currentFreightCost() {
    if (state.freight.quoted) return state.freight.cost || 0;
    // Prévia local até o CEP ser informado; a API é a fonte de verdade.
    return Pricing.fallbackFreight(subtotal()).cost;
  }

  function currentTotals() {
    return Pricing.computeTotals(state.cart, state.coupon.valid ? state.coupon.code : null, currentFreightCost());
  }

  function totalsLinesHtml(totals) {
    var html = '<div class="totals-line"><span>Subtotal</span><span>' + money(totals.subtotal) + '</span></div>';
    if (totals.discount > 0) {
      html += '<div class="totals-line discount"><span>Desconto (' + esc(totals.couponCode) + ')</span><span>− ' + money(totals.discount) + '</span></div>';
    }
    var freightLabel = totals.freight === 0 ? '<span class="free-tag">Grátis!</span>' : money(totals.freight);
    html += '<div class="totals-line"><span>Frete</span><span>' + freightLabel + '</span></div>';
    html += '<div class="totals-line total"><span>Total</span><span>' + money(totals.total) + '</span></div>';
    return html;
  }

  function renderCheckoutSummary() {
    var body = $('#co-summary');
    if (!body) return;
    body.innerHTML = state.cart.map(function (item) {
      return '<div class="sh-summary-line"><span>' + item.qty + '× ' + esc(item.name) +
        (item.note ? ' <em>(' + esc(item.note) + ')</em>' : '') +
        '</span><span>' + money(item.price * item.qty) + '</span></div>';
    }).join('');
    $('#co-totals').innerHTML = totalsLinesHtml(currentTotals());
  }

  function prefillFromLastOrder() {
    var last = readJSON(LAST_ORDER_KEY, null);
    if (!last) return;
    if (last.fullName && !$('#f-name').value) $('#f-name').value = last.fullName;
    // O telefone é guardado só com dígitos; reaplica a máscara ao preencher.
    if (last.phone && !$('#f-phone').value) $('#f-phone').value = maskPhone(String(last.phone));
    if (last.address) {
      ['cep', 'street', 'number', 'complement', 'neighborhood', 'city', 'state'].forEach(function (field) {
        var input = $('#f-' + field);
        if (input && last.address[field] && !input.value) input.value = last.address[field];
      });
    }
  }

  function openCheckout() {
    if (!state.cart.length) { toast('Seu carrinho está vazio'); return; }
    prefillFromLastOrder();
    renderCheckoutSummary();
    openOverlay($('#checkout-sheet'));
  }

  function maskCPF(value) {
    var d = value.replace(/\D/g, '').slice(0, 11);
    if (d.length > 9) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
    if (d.length > 6) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6);
    if (d.length > 3) return d.slice(0, 3) + '.' + d.slice(3);
    return d;
  }

  function maskPhone(value) {
    var d = value.replace(/\D/g, '').slice(0, 11);
    if (d.length > 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length > 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    if (d.length > 2) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    return d;
  }

  function maskCEP(value) {
    var d = value.replace(/\D/g, '').slice(0, 8);
    return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d;
  }

  function quoteFreight() {
    var cepInput = $('#f-cep');
    var hint = $('#freight-hint');
    var cep = cepInput.value.replace(/\D/g, '');
    if (cep.length !== 8) {
      state.freight = { cost: null, free: false, quoted: false };
      hint.className = 'field-hint';
      hint.textContent = cep.length ? 'CEP incompleto.' : '';
      renderCheckoutSummary();
      return;
    }

    hint.className = 'field-hint';
    hint.textContent = 'Calculando frete…';

    fetch('/api/freight-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cep: cepInput.value, subtotal: subtotal() })
    })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('http ' + res.status)); })
      .then(function (quote) {
        state.freight = { cost: quote.cost, free: !!quote.free, quoted: true };
        hint.className = 'field-hint ' + (quote.free ? 'ok' : '');
        hint.textContent = quote.free ? 'Frete: Grátis!' : 'Frete: ' + money(quote.cost);
        renderCheckoutSummary();
      })
      .catch(function () {
        var fallback = Pricing.fallbackFreight(subtotal());
        state.freight = { cost: fallback.cost, free: fallback.free, quoted: true };
        hint.className = 'field-hint';
        hint.textContent = 'Não foi possível cotar agora. Frete estimado: ' + (fallback.free ? 'Grátis!' : money(fallback.cost));
        renderCheckoutSummary();
      });
  }

  function applyCouponFromInput() {
    var code = $('#f-coupon').value;
    var hint = $('#coupon-hint');
    if (!code.trim()) {
      state.coupon = { code: null, valid: false };
      hint.className = 'field-hint';
      hint.textContent = '';
      renderCheckoutSummary();
      return;
    }
    var result = Pricing.applyCoupon(subtotal(), code);
    state.coupon = { code: result.code, valid: result.valid };
    hint.className = 'field-hint ' + (result.valid ? 'ok' : 'err');
    hint.textContent = result.valid
      ? 'Cupom aplicado: −' + money(result.discount)
      : 'Cupom inválido.';
    renderCheckoutSummary();
  }

  function setPaymentMethod(method) {
    state.paymentMethod = method;
    $('#pix-box').hidden = method !== 'pix';
  }

  function readCustomer() {
    return {
      fullName: $('#f-name').value.trim(),
      birthDate: $('#f-birth').value,
      cpf: $('#f-cpf').value.trim(),
      phone: $('#f-phone').value.replace(/\D/g, ''),
      email: $('#f-email').value.trim()
    };
  }

  function readAddress() {
    return {
      street: $('#f-street').value.trim(),
      number: $('#f-number').value.trim(),
      complement: $('#f-complement').value.trim(),
      cep: $('#f-cep').value.trim(),
      neighborhood: $('#f-neighborhood').value.trim(),
      city: $('#f-city').value.trim(),
      state: $('#f-state').value.trim()
    };
  }

  // Espelha lib/orders-service.js#validateOrderPayload (o backend continua
  // sendo a fonte de verdade; isto é só para orientar o cliente antes do POST).
  function isAdult(birthDateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDateStr)) return false;
    var birth = new Date(birthDateStr);
    if (isNaN(birth.getTime())) return false;
    var today = new Date();
    var age = today.getUTCFullYear() - birth.getUTCFullYear();
    var monthDiff = today.getUTCMonth() - birth.getUTCMonth();
    var dayDiff = today.getUTCDate() - birth.getUTCDate();
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
    return age >= 18;
  }

  function validateLocally(payload) {
    var errors = [];
    var c = payload.customer;
    if (!c.fullName) errors.push('fullName');
    if (!isAdult(c.birthDate)) errors.push('birthDate');
    if (!/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(c.cpf)) errors.push('cpf');
    if (!/^\d{10,11}$/.test(c.phone)) errors.push('phone');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) errors.push('email');

    if (payload.delivery.type === 'delivery') {
      var a = payload.delivery.address || {};
      ['street', 'number', 'neighborhood', 'city', 'state'].forEach(function (field) {
        if (!a[field]) errors.push(field);
      });
      if (!/^\d{5}-?\d{3}$/.test(a.cep || '')) errors.push('cep');
    }

    if (!payload.items.length) errors.push('items');
    if (['pix', 'card'].indexOf(payload.paymentMethod) === -1) errors.push('paymentMethod');
    return errors;
  }

  function showFormErrors(fields, headline) {
    var box = $('#form-errors');
    var unique = fields.filter(function (f, i) { return fields.indexOf(f) === i; });
    if (!unique.length && !headline) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = '<strong>' + esc(headline || 'Confira estes campos antes de enviar:') + '</strong>' +
      (unique.length ? '<ul>' + unique.map(function (f) { return '<li>' + esc(FIELD_LABELS[f] || f) + '</li>'; }).join('') + '</ul>' : '');
    box.hidden = false;

    $$('.field').forEach(function (field) { field.classList.remove('has-error'); });
    unique.forEach(function (f) {
      var input = $('#f-' + f) || $('#f-' + ({ fullName: 'name', birthDate: 'birth' }[f] || f));
      if (input && input.closest('.field')) input.closest('.field').classList.add('has-error');
    });
    box.scrollIntoView({ block: 'nearest' });
  }

  function buildPayload() {
    return {
      customer: readCustomer(),
      delivery: {
        type: 'delivery',
        address: readAddress(),
        freightCost: currentFreightCost()
      },
      items: state.cart.map(function (item) {
        return { slug: item.slug, name: item.name, price: item.price, qty: item.qty, note: item.note || '' };
      }),
      couponCode: state.coupon.valid ? state.coupon.code : null,
      paymentMethod: state.paymentMethod
    };
  }

  function submitOrder(event) {
    event.preventDefault();
    var button = $('#btn-enviar');
    var payload = buildPayload();

    var localErrors = validateLocally(payload);
    if (localErrors.length) { showFormErrors(localErrors); return; }
    showFormErrors([]);

    button.disabled = true;
    button.textContent = 'Enviando…';

    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          if (result.status === 400 && Array.isArray(result.data.errors)) {
            showFormErrors(result.data.errors);
          } else if (result.status === 409 && result.data.error === 'out_of_stock') {
            handleOutOfStock(result.data.items || []);
          } else {
            showFormErrors([], 'Não foi possível registrar seu pedido agora. Tente novamente em instantes.');
          }
          return null;
        }
        return finishOrder(payload, result.data);
      })
      .catch(function () {
        showFormErrors([], 'Falha de conexão ao enviar o pedido. Verifique sua internet e tente de novo.');
      })
      .then(function () {
        button.disabled = false;
        button.textContent = 'Enviar pedido';
      });
  }

  function finishOrder(payload, order) {
    writeJSON(LAST_ORDER_KEY, {
      fullName: payload.customer.fullName,
      phone: payload.customer.phone,
      cart: state.cart.slice(),
      deliveryType: payload.delivery.type,
      address: payload.delivery.address
    });

    var snapshot = { payload: payload, order: order, items: state.cart.slice() };

    if (payload.paymentMethod !== 'card') {
      completeOrderUI(snapshot, null);
      return null;
    }

    return fetch('/api/create-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Só o id: total e itens vêm do banco no servidor, para que nada aqui
      // possa alterar o valor cobrado.
      body: JSON.stringify({ orderId: order.id })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        var data = result.data;
        if (result.ok && data && data.configured && data.initPoint) {
          // Salvo antes de sair da página: initMercadoPagoReturn() reconstrói
          // a confirmação com isso quando o cliente voltar do Mercado Pago.
          writeJSON(PENDING_MP_KEY, snapshot);
          window.location.href = data.initPoint;
          return null;
        }
        // result.ok + configured:false => cartão realmente ainda não configurado.
        // !result.ok (ex: 502 do Mercado Pago) => falha real e temporária, não "não configurado".
        var cardWarning = result.ok
          ? 'Pagamento por cartão em configuração, escolha PIX por enquanto.'
          : 'Não foi possível iniciar o pagamento por cartão agora. Use o PIX abaixo, ou tente novamente mais tarde.';
        completeOrderUI(snapshot, cardWarning);
        return null;
      })
      .catch(function () {
        completeOrderUI(snapshot, 'Não foi possível iniciar o pagamento por cartão agora. Use o PIX abaixo, ou tente novamente mais tarde.');
        return null;
      });
  }

  function completeOrderUI(snapshot, cardWarning) {
    var order = snapshot.order;
    var payload = snapshot.payload;

    $('#cf-number').textContent = '#' + order.id;

    var itemsHtml = snapshot.items.map(function (item) {
      return '<div class="sh-summary-line"><span>' + item.qty + '× ' + esc(item.name) +
        (item.note ? ' <em>(' + esc(item.note) + ')</em>' : '') +
        '</span><span>' + money(item.price * item.qty) + '</span></div>';
    }).join('');

    var a = payload.delivery.address;
    var deliveryHtml = esc(a.street + ', ' + a.number + (a.complement ? ' — ' + a.complement : '')) +
      '<br>' + esc(a.neighborhood + ' · ' + a.city + '/' + a.state) + '<br>CEP ' + esc(a.cep);

    $('#cf-summary').innerHTML =
      '<h3>Itens</h3>' + itemsHtml +
      '<h3 style="margin-top:14px">Valores</h3>' +
      '<div class="sh-summary-line"><span>Subtotal</span><span>' + money(order.subtotal) + '</span></div>' +
      (order.discount > 0 ? '<div class="sh-summary-line"><span>Desconto (' + esc(order.couponCode) + ')</span><span>− ' + money(order.discount) + '</span></div>' : '') +
      '<div class="sh-summary-line"><span>Frete</span><span>' + (order.freight === 0 ? 'Grátis' : money(order.freight)) + '</span></div>' +
      '<div class="sh-summary-line"><span><strong>Total</strong></span><span><strong>' + money(order.total) + '</strong></span></div>' +
      '<h3 style="margin-top:14px">Entrega</h3>' +
      '<div class="sh-summary-line"><span>' + deliveryHtml + '</span></div>' +
      '<h3 style="margin-top:14px">Cliente</h3>' +
      '<div class="sh-summary-line"><span>' + esc(payload.customer.fullName) + '</span><span>' + esc(payload.customer.phone) + '</span></div>';

    var pixBox = $('#cf-pix');
    // Mostra a chave PIX também quando o pedido foi feito com Cartão mas o
    // pagamento por cartão não pôde ser iniciado (cardWarning) — nesse caso
    // o PIX é a única forma de pagamento que realmente funciona agora.
    if (payload.paymentMethod === 'pix' || cardWarning) {
      pixBox.hidden = false;
      $('#cf-pix-key').textContent = PIX_KEY;
      $('#cf-pix-amount').textContent = money(order.total);
    } else {
      pixBox.hidden = true;
    }

    var warn = $('#cf-card-warning');
    warn.hidden = !cardWarning;
    warn.textContent = cardWarning || '';

    state.cart = [];
    state.coupon = { code: null, valid: false };
    state.freight = { cost: null, free: false, quoted: false };
    persistCart();
    renderFab();
    renderCart();
    renderCheckoutSummary();

    closeOverlay($('#checkout-sheet'));
    $('#checkout-form').reset();
    showFormErrors([]);
    $('#coupon-hint').textContent = '';
    $('#freight-hint').textContent = '';
    setPaymentMethod('pix');

    $('#confirmation').hidden = false;
    refreshRepeatButton();
    lockScroll();
    window.scrollTo(0, 0);
  }

  function initCheckout() {
    var sheet = $('#checkout-sheet');

    $('#co-close').addEventListener('click', function () { closeOverlay(sheet); });
    sheet.addEventListener('click', function (event) { if (event.target === sheet) closeOverlay(sheet); });

    $('#f-cpf').addEventListener('input', function () { this.value = maskCPF(this.value); });
    $('#f-phone').addEventListener('input', function () { this.value = maskPhone(this.value); });
    $('#f-cep').addEventListener('input', function () { this.value = maskCEP(this.value); });
    $('#f-cep').addEventListener('blur', quoteFreight);
    $('#f-state').addEventListener('input', function () { this.value = this.value.toUpperCase().slice(0, 2); });

    $('#btn-coupon').addEventListener('click', applyCouponFromInput);
    $('#f-coupon').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); applyCouponFromInput(); }
    });

    $$('input[name="pay"]').forEach(function (radio) {
      radio.addEventListener('change', function () { setPaymentMethod(this.value); });
    });

    $$('[data-copy-pix]').forEach(function (btn) {
      btn.addEventListener('click', function () { copyPix(btn); });
    });

    $('#checkout-form').addEventListener('submit', submitOrder);

    $('#btn-back-store').addEventListener('click', function () {
      $('#confirmation').hidden = true;
      lockScroll();
    });

    setPaymentMethod('pix');
  }

  function copyPix(button) {
    var original = button.textContent;
    function done() {
      button.textContent = 'Copiado!';
      toast('Chave PIX copiada');
      setTimeout(function () { button.textContent = original; }, 1800);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(PIX_KEY).then(done).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
    function fallbackCopy() {
      var temp = document.createElement('textarea');
      temp.value = PIX_KEY;
      temp.setAttribute('readonly', '');
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      temp.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Copie a chave manualmente'); }
      document.body.removeChild(temp);
    }
  }

  // ------------------------------------------------- repetir último pedido --
  function refreshRepeatButton() {
    var last = readJSON(LAST_ORDER_KEY, null);
    var bar = $('#repeat-bar');
    bar.hidden = !(last && Array.isArray(last.cart) && last.cart.length);
  }

  function initRepeatOrder() {
    refreshRepeatButton();
    $('#btn-repeat').addEventListener('click', function () {
      var last = readJSON(LAST_ORDER_KEY, null);
      if (!last || !Array.isArray(last.cart)) return;
      var added = 0;
      // Passa por addToCart para respeitar o estoque de cada vinho.
      sanitizeCart(last.cart).forEach(function (item) {
        var before = cartCount();
        addToCart(item.slug, item.qty, item.note || '');
        added += cartCount() - before;
      });
      if (!added) { toast('Nada para repetir (sem estoque)'); return; }
      toast('Último pedido adicionado ao carrinho');
      renderCart();
      openOverlay($('#cart-drawer'));
    });
  }

  // ------------------------------------------------------------ deep link --
  function initDeepLink() {
    var slug = null;
    try { slug = new URLSearchParams(window.location.search).get('item'); } catch (e) { slug = null; }
    if (slug && Catalog.findBySlug(slug)) state.pendingDeepLink = slug;
  }

  function flushDeepLink() {
    if (!ageConfirmed || !state.pendingDeepLink) return;
    var slug = state.pendingDeepLink;
    state.pendingDeepLink = null;
    openProductModal(slug);
  }

  // ------------------------------------------ retorno do Mercado Pago -------
  // O Mercado Pago devolve o cliente em /?pedido=X&pagamento=sucesso|falha|pendente
  // (back_urls montadas em lib/payment.js). Como o redirect recarrega a página,
  // o pedido é lido do snapshot salvo em finishOrder antes de sair daqui.
  var MP_WARNINGS = {
    falha: 'Pagamento não aprovado. Use o PIX abaixo, ou tente novamente mais tarde.',
    pendente: 'Pagamento em análise. Assim que for aprovado, seu pedido segue normalmente — guarde o número acima.'
  };

  // Sem o snapshot não há nada além da própria URL, e a URL não prova nada:
  // qualquer pessoa pode montar ?pedido=999&pagamento=sucesso e mandar para
  // outra. Por isso este caminho NUNCA afirma que o pagamento foi aprovado —
  // só o caminho com snapshot (gravado pelo finishOrder desta sessão) pode.
  var MP_STANDALONE_MESSAGE = 'Não conseguimos confirmar os detalhes deste pedido neste dispositivo. ' +
    'Se você acabou de pagar, guarde o número do pedido e entre em contato com a loja para confirmar.';

  function initMercadoPagoReturn() {
    var pedido = null;
    var pagamento = null;
    try {
      var params = new URLSearchParams(window.location.search);
      pedido = params.get('pedido');
      pagamento = params.get('pagamento');
    } catch (e) {
      return;
    }
    // Os dois parâmetros são obrigatórios: só o Mercado Pago devolve o cliente
    // com o par completo, e ?pedido=1 sozinho não deve abrir confirmação.
    if (!pedido || !pagamento) return;

    var snapshot = readJSON(PENDING_MP_KEY, null);
    // Usado uma vez só: recarregar a página não deve repetir a confirmação.
    try { localStorage.removeItem(PENDING_MP_KEY); } catch (e) { /* modo privado */ }

    var matches = snapshot && snapshot.order && snapshot.payload &&
      Array.isArray(snapshot.items) && pedido &&
      String(snapshot.order.id) === String(pedido);

    if (matches) {
      // Qualquer status fora de falha/pendente (inclusive 'sucesso') segue o
      // mesmo caminho do PIX aprovado: confirmação limpa, sem aviso.
      completeOrderUI(snapshot, MP_WARNINGS[pagamento] || null);
    } else {
      // Cliente voltou em outro navegador/dispositivo, limpou o localStorage —
      // ou a URL simplesmente não veio de um pedido feito aqui.
      showStandaloneConfirmation(pedido);
    }

    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
  }

  function showStandaloneConfirmation(pedido) {
    $('#cf-number').textContent = pedido ? '#' + pedido : '#—';

    var warn = $('#cf-card-warning');
    // Mensagem neutra independente do valor de pagamento na URL, inclusive
    // 'sucesso': aqui não há nada que confirme o pagamento de fato.
    warn.textContent = MP_STANDALONE_MESSAGE;
    warn.hidden = false;

    // Sem snapshot não há valor a cobrar por PIX nem itens para listar.
    $('#cf-pix').hidden = true;
    $('#cf-summary').innerHTML =
      '<p style="opacity:.75">O resumo deste pedido não está disponível neste dispositivo. ' +
      'O número acima identifica seu pedido na loja.</p>';

    $('#confirmation').hidden = false;
    refreshRepeatButton();
    lockScroll();
    window.scrollTo(0, 0);
  }

  // ----------------------------------------------------------- PWA banner --
  function initPwaBanner() {
    var banner = $('#pwa-banner');
    var mq = window.matchMedia('(max-width: 768px)');

    function sync() {
      banner.hidden = !(state.deferredInstallPrompt && mq.matches && !state.pwaDismissed);
    }

    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      state.deferredInstallPrompt = event;
      sync();
    });

    if (mq.addEventListener) mq.addEventListener('change', sync);
    else if (mq.addListener) mq.addListener(sync);

    $('#pwa-install').addEventListener('click', function () {
      var prompt = state.deferredInstallPrompt;
      if (!prompt || typeof prompt.prompt !== 'function') { banner.hidden = true; return; }
      prompt.prompt();
      state.deferredInstallPrompt = null;
      banner.hidden = true;
    });

    $('#pwa-dismiss').addEventListener('click', function () {
      state.pwaDismissed = true;
      banner.hidden = true;
    });
  }

  // ----------------------------------------------------------------- init --
  function init() {
    if (!Catalog || !Pricing) {
      console.error('Catalog/Pricing não carregados — verifique a ordem dos <script>.');
      return;
    }
    $('#pix-key').textContent = PIX_KEY;
    // O valor do aviso do topo vem da mesma constante usada no cálculo do pedido.
    $('#promo-threshold').textContent = money(Pricing.FREE_SHIPPING_THRESHOLD);
    renderCatalog();
    initSearch();
    initProductModal();
    initCart();
    initCheckout();
    initRepeatOrder();
    initPwaBanner();
    initDeepLink();
    // O gate de idade vem ANTES do retorno do Mercado Pago: assim ele nunca
    // abre por cima de uma confirmação já na tela (initDeepLink continua antes
    // dele, que é quem consome o pendingDeepLink).
    initAgeGate();
    initMercadoPagoReturn();
    renderFab();
    renderCart();
    initStock();

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      [$('#product-modal'), $('#cart-drawer'), $('#checkout-sheet')].forEach(function (el) {
        if (el && !el.hidden) closeOverlay(el);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.error('SW registration failed', err));
  });
}
