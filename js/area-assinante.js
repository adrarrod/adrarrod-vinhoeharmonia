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
  }

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
        passwordForm.reset();
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
    passwordForm.reset();
    showError(passwordError, '');
    passwordOk.hidden = true;
    showLogin();
  }

  loginForm.addEventListener('submit', submitLogin);
  passwordForm.addEventListener('submit', submitPassword);
  $('area-logout').addEventListener('click', logout);

  init();
})();
