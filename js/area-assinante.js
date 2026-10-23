// js/area-assinante.js — área do assinante: entrar, ver a página e trocar a senha.
(function () {
  'use strict';

  const API = '/api/subscriber-area';
  const $ = (id) => document.getElementById(id);

  const loading = $('area-loading');
  const loginSection = $('area-login');
  const loginForm = $('area-login-form');
  const loginError = $('area-login-error');
  const loginSubmit = $('area-login-submit');
  const home = $('area-home');
  const passwordForm = $('area-password-form');
  const passwordError = $('area-password-error');
  const passwordOk = $('area-password-ok');
  const passwordSubmit = $('area-password-submit');
  const passwordToggle = $('area-password-toggle');

  function showError(box, message) {
    box.hidden = !message;
    box.textContent = message || '';
  }

  function showLogin() {
    loading.hidden = true;
    home.hidden = true;
    loginSection.hidden = false;
  }

  function showHome(subscriber, questionnaire) {
    loading.hidden = true;
    loginSection.hidden = true;
    home.hidden = false;
    $('area-name').textContent = subscriber.name;
    $('area-initial-warning').hidden = !subscriber.usingInitialPassword;
    showQuestionnaireCard(questionnaire);
    loadWines();
  }

  // ------------------------------------------------------ vinhos do clube --
  let clubWines = [];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatAbv(abv) {
    const str = Number.isInteger(abv) ? String(abv) : abv.toFixed(1).replace('.', ',');
    return str + '%';
  }

  function starsHtml(wine) {
    let html = '';
    for (let n = 1; n <= 5; n++) {
      html += '<button class="club-star' + (wine.rating >= n ? ' is-on' : '') + '" type="button" data-rate="' + wine.id + '" data-value="' + n + '"' +
        ' aria-label="' + n + (n === 1 ? ' estrela' : ' estrelas') + '" aria-pressed="' + (wine.rating === n) + '">&#9733;</button>';
    }
    return html;
  }

  function ratingMessage(wine) {
    return wine.rating ? 'Sua nota: ' + wine.rating + ' de 5.' : 'Toque nas estrelas para avaliar.';
  }

  // Mesmo formato da vitrine (foto, nome, tipo, país, uva, teor, harmonizações,
  // descrição), sem preço nem compra: o assinante não está comprando.
  function wineCardHtml(item) {
    const wine = window.Catalog.findBySlug(item.slug);
    if (!wine) return '';
    const pairings = Array.isArray(wine.pairings) ? wine.pairings : [];
    return (
      '<article class="card club-card" data-club-wine="' + item.id + '">' +
        '<div class="card-photo"><img src="' + esc(wine.image) + '" alt="Garrafa de ' + esc(wine.name) + '" loading="lazy" width="400" height="400"></div>' +
        '<div class="card-body">' +
          '<p class="card-name">' + esc(wine.name) + '</p>' +
          '<p class="card-meta">' + esc(wine.category) + ' &middot; ' + esc(wine.country) + ' &middot; ' + esc(wine.grape) + '</p>' +
          (typeof wine.abv === 'number' ? '<p class="club-abv">Teor alcoólico: ' + formatAbv(wine.abv) + '</p>' : '') +
          (pairings.length
            ? '<div class="food-pairings"><span class="food-pairings-label">Harmoniza com</span><div class="food-pairing-icons">' +
              pairings.map((p) => '<span class="food-pairing-icon" title="' + esc(p) + '"><span aria-hidden="true">' + window.Catalog.pairingIcon(p) + '</span><span class="food-pairing-label">' + esc(p) + '</span></span>').join('') +
              '</div></div>'
            : '') +
          '<p class="club-desc">' + esc(wine.description) + '</p>' +
          '<div class="club-rating-wrap">' +
            '<span class="club-rating-label">Sua avaliação</span>' +
            '<div class="club-stars" role="group" aria-label="Sua nota para ' + esc(wine.name) + '">' + starsHtml(item) + '</div>' +
            '<p class="club-rating-msg" aria-live="polite">' + ratingMessage(item) + '</p>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function renderWines() {
    const list = $('area-wines-list');
    const shown = clubWines.filter((w) => window.Catalog.findBySlug(w.slug));
    if (!shown.length) {
      list.innerHTML = '<p class="area-soon">Os vinhos que escolhermos para você aparecem aqui a cada mês. Assim que o primeiro chegar, é só voltar para ver e avaliar.</p>';
      return;
    }
    let html = '';
    let month = null;
    shown.forEach((w) => {
      if (w.month !== month) {
        month = w.month;
        html += '<h3 class="club-month-title">' + esc(window.Club.monthLabel(month)) + '</h3>';
      }
      html += wineCardHtml(w);
    });
    list.innerHTML = html;
  }

  async function loadWines() {
    const status = $('area-wines-status');
    status.hidden = true;
    try {
      const res = await fetch(API + '?resource=wines', { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) { showLogin(); return; }
      if (!res.ok) throw new Error('http ' + res.status);
      clubWines = (await res.json()).wines || [];
      renderWines();
    } catch (err) {
      clubWines = [];
      $('area-wines-list').innerHTML = '';
      status.textContent = 'Não foi possível carregar seus vinhos agora. Tente de novo em instantes.';
      status.hidden = false;
    }
  }

  async function rateWine(id, value) {
    const card = document.querySelector('[data-club-wine="' + id + '"]');
    const msg = card ? card.querySelector('.club-rating-msg') : null;
    try {
      const res = await post('rate', { id: Number(id), rating: Number(value) });
      if (res.status === 401) { showLogin(); return; }
      if (!res.ok) throw new Error('http ' + res.status);
      const saved = (await res.json()).wine;
      const item = clubWines.find((w) => w.id === saved.id);
      if (item) item.rating = saved.rating;
      if (card && item) {
        card.querySelector('.club-stars').innerHTML = starsHtml(item);
        card.querySelector('.club-rating-msg').textContent = 'Obrigado! Sua nota: ' + item.rating + ' de 5.';
      }
    } catch (err) {
      if (msg) msg.textContent = 'Não foi possível salvar sua nota agora. Tente de novo.';
    }
  }

  $('area-wines-list').addEventListener('click', (event) => {
    const star = event.target.closest('[data-rate]');
    if (star) rateWine(star.dataset.rate, star.dataset.value);
  });

  // Cartão do questionário do clube (some se a API não trouxe o resumo).
  function showQuestionnaireCard(questionnaire) {
    const card = $('area-questionnaire');
    card.hidden = !questionnaire;
    if (!questionnaire) return;
    const when = questionnaire.submittedAt ? new Date(questionnaire.submittedAt).toLocaleDateString('pt-BR') : '';
    $('area-questionnaire-text').textContent = questionnaire.answered
      ? 'Você respondeu em ' + when + '. Se o seu gosto mudou, pode atualizar suas respostas quando quiser.'
      : 'Conte um pouco sobre o seu paladar para escolhermos vinhos que combinem com você. Leva poucos minutos.';
    $('area-questionnaire-link').textContent = questionnaire.answered ? 'Atualizar minhas respostas' : 'Responder o questionário';
  }

  function waitMessage(minutes) {
    const n = Number(minutes) || 15;
    return 'Muitas tentativas erradas. Por segurança, o acesso está bloqueado. Tente de novo em ' + n + (n === 1 ? ' minuto.' : ' minutos.');
  }

  async function post(action, body) {
    return fetch(API + '?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body || {})
    });
  }

  async function init() {
    try {
      const res = await fetch(API, { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) { showLogin(); return; }
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      showHome(data.subscriber, data.questionnaire);
    } catch (err) {
      showLogin();
      showError(loginError, 'Não foi possível carregar agora. Tente de novo em instantes.');
    }
  }

  async function submitLogin(event) {
    event.preventDefault();
    showError(loginError, '');
    const login = $('area-login-id').value.trim();
    const password = $('area-login-password').value;
    if (!login || !password) {
      showError(loginError, 'Informe seu celular ou e-mail e a senha.');
      return;
    }
    loginSubmit.disabled = true;
    try {
      const res = await post('login', { login, password });
      if (res.status === 200) {
        $('area-login-password').value = '';
        await init(); // carrega a área já com o resumo do questionário
        return;
      }
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        showError(loginError, waitMessage(data.retryAfterMinutes));
      } else if (res.status === 401) {
        showError(loginError, 'Celular/e-mail ou senha incorretos. Confira e tente de novo.');
      } else {
        throw new Error('http ' + res.status);
      }
      $('area-login-password').value = '';
    } catch (err) {
      showError(loginError, 'Não foi possível entrar agora. Tente de novo em instantes.');
    } finally {
      loginSubmit.disabled = false;
    }
  }

  // A troca de senha fica fechada: só um botão. Os campos abrem ao clicar.
  function setPasswordOpen(open) {
    passwordForm.hidden = !open;
    passwordToggle.hidden = open;
    passwordToggle.setAttribute('aria-expanded', String(open));
    if (open) {
      passwordOk.hidden = true;
      $('area-current-password').focus();
    } else {
      passwordForm.reset();
      showError(passwordError, '');
    }
  }

  async function submitPassword(event) {
    event.preventDefault();
    showError(passwordError, '');
    passwordOk.hidden = true;
    const currentPassword = $('area-current-password').value;
    const newPassword = $('area-new-password').value;
    const confirm = $('area-confirm-password').value;

    if (!currentPassword || !newPassword) { showError(passwordError, 'Preencha a senha atual e a nova senha.'); return; }
    if (newPassword !== confirm) { showError(passwordError, 'A nova senha e a repetição não são iguais.'); return; }
    if (newPassword.length < 6) { showError(passwordError, 'A nova senha precisa ter pelo menos 6 caracteres.'); return; }
    if (newPassword === '123mudar') { showError(passwordError, 'Escolha uma senha diferente da inicial.'); return; }

    passwordSubmit.disabled = true;
    try {
      const res = await post('password', { currentPassword, newPassword });
      if (res.status === 200) {
        setPasswordOpen(false);
        $('area-initial-warning').hidden = true;
        passwordOk.textContent = 'Senha alterada com sucesso. Use a nova senha no próximo acesso.';
        passwordOk.hidden = false;
        return;
      }
      if (res.status === 401) { showLogin(); return; }
      if (res.status === 403) showError(passwordError, 'A senha atual não confere.');
      else if (res.status === 400) showError(passwordError, 'A nova senha precisa ter de 6 a 100 caracteres e ser diferente da senha inicial.');
      else if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        showError(passwordError, waitMessage(data.retryAfterMinutes));
      } else throw new Error('http ' + res.status);
    } catch (err) {
      showError(passwordError, 'Não foi possível alterar a senha agora. Tente de novo em instantes.');
    } finally {
      passwordSubmit.disabled = false;
    }
  }

  async function logout() {
    try { await post('logout'); } catch (err) { /* o cookie vence sozinho */ }
    setPasswordOpen(false);
    passwordOk.hidden = true;
    clubWines = [];
    showLogin();
  }

  loginForm.addEventListener('submit', submitLogin);
  passwordForm.addEventListener('submit', submitPassword);
  passwordToggle.addEventListener('click', () => setPasswordOpen(true));
  $('area-password-cancel').addEventListener('click', () => setPasswordOpen(false));
  $('area-logout').addEventListener('click', logout);

  init();
})();
