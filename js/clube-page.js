// js/clube-page.js — contratação do Clube V&H Personnalité: apresentação e
// formulário em etapas (atendimento por CEP, dados, endereço, paladar, revisão).
// As regras vêm de js/clube.js e js/questionario.js; o servidor confere tudo de
// novo antes de gravar. Nenhum dado pessoal vai na URL: tudo segue no corpo de
// um POST.
(function () {
  'use strict';

  const Clube = window.Clube;
  const Q = window.Questionario;
  const UI = window.QuestionarioUI;
  const API = '/api/subscriber-area';
  const LAST_STEP = 4;
  const $ = (id) => document.getElementById(id);

  let me = null;          // quem já está logado: { subscriber, subscription }
  let step = 0;           // 0..4, ou 'done'
  let answers = {};
  let answerNow = null;   // null = ainda não escolheu · true = responde agora · false = depois
  let cepDigits = '';

  const REQUIRED_FIELDS = {
    street: 'c-street', number: 'c-number', neighborhood: 'c-neighborhood', city: 'c-city'
  };

  // ----------------------------------------------------------------- textos --
  const MESSAGES = {
    name: { required: 'Informe seu nome completo.', invalid: 'Informe nome e sobrenome.' },
    email: { required: 'Informe seu e-mail.', invalid: 'Confira o e-mail: ele não parece válido.' },
    phone: { required: 'Informe seu celular com DDD.', invalid: 'Informe um celular válido, com DDD. Ex.: (11) 98765-4321.' },
    cpf: { required: 'Informe seu CPF.', invalid: 'CPF inválido. Confira os números.' },
    birthDate: { required: 'Informe sua data de nascimento.', invalid: 'Data de nascimento inválida.', underage: 'Só podemos aceitar maiores de 18 anos.' },
    password: { weak: 'A senha precisa ter de 6 a 100 caracteres e ser diferente da senha inicial.' },
    passwordConfirm: { mismatch: 'As senhas não são iguais.' },
    street: { required: 'Informe o logradouro.', invalid: 'Confira o logradouro.' },
    number: { required: 'Informe o número.', invalid: 'Confira o número.' },
    neighborhood: { required: 'Informe o bairro.', invalid: 'Confira o bairro.' },
    city: { required: 'Informe a cidade.', invalid: 'Confira a cidade.' }
  };
  const FIELD_STEP = {
    name: 1, email: 1, phone: 1, cpf: 1, birthDate: 1, password: 1, passwordConfirm: 1,
    cep: 0, state: 0, street: 2, number: 2, neighborhood: 2, city: 2, complement: 2, reference: 2, answers: 3
  };
  const EXISTS_TEXT = { email: 'e-mail', phone: 'celular', cpf: 'CPF' };

  // --------------------------------------------------------------- utilidades --
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(cents) {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function maskCpf(value) {
    const d = value.replace(/\D/g, '').slice(0, 11);
    return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
  }

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

  function showBox(id, message) {
    const box = $(id);
    box.hidden = !message;
    box.textContent = message || '';
  }

  function clearFieldErrors() {
    document.querySelectorAll('#club-flow [data-err]').forEach((el) => { el.hidden = true; el.textContent = ''; });
    document.querySelectorAll('#club-flow .field.has-error').forEach((el) => el.classList.remove('has-error'));
  }

  function setFieldError(key, reason) {
    const el = document.querySelector('#club-flow [data-err="' + key + '"]');
    if (!el) return false;
    el.textContent = (MESSAGES[key] && MESSAGES[key][reason]) || 'Confira este campo.';
    el.hidden = false;
    if (el.closest('.field')) el.closest('.field').classList.add('has-error');
    return true;
  }

  function firstErrorIntoView() {
    const el = document.querySelector('#club-flow [data-err]:not([hidden])');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // -------------------------------------------------------------- navegação --
  function showStep(next) {
    step = next;
    document.querySelectorAll('#club-flow .flow-step').forEach((el) => { el.hidden = String(el.dataset.step) !== String(next); });
    const numeric = typeof next === 'number';
    document.querySelector('#club-flow .quiz-progress').hidden = !numeric;
    if (numeric) {
      $('flow-label').textContent = 'Etapa ' + (next + 1) + ' de ' + (LAST_STEP + 1);
      const percent = Math.round((next / (LAST_STEP + 1)) * 100);
      $('flow-fill').style.width = percent + '%';
      $('flow-bar').setAttribute('aria-valuenow', String(percent));
    }
    if (next === 3) prepareQuizStep();
    if (next === 4) renderSummary();
    $('club-flow').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openFlow() {
    $('club-flow').hidden = false;
    $('club-cta').hidden = true;
    showStep(0);
  }

  // ----------------------------------------------------- etapa 0: atendimento --
  // Consulta o endereço do CEP (ViaCEP) só para preencher a tela; se não responder,
  // o cliente digita. A regra "só SP" vale pelo CEP e é conferida de novo no servidor.
  async function lookupCep(digits) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch('https://viacep.com.br/ws/' + digits + '/json/', { signal: controller.signal });
      if (!res.ok) return null;
      const data = await res.json();
      return data && !data.erro ? data : null;
    } catch (err) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function showOutside() {
    const box = $('flow-outside');
    box.textContent = Clube.OUT_OF_AREA_MESSAGE;
    box.hidden = false;
  }

  async function checkCep() {
    showBox('flow-err0', '');
    $('flow-outside').hidden = true;
    const digits = $('c-cep0').value.replace(/\D/g, '');
    if (!/^\d{8}$/.test(digits)) { showBox('flow-err0', 'Informe um CEP válido, com 8 números.'); return; }
    if (!Clube.isSaoPauloCep(digits)) { showOutside(); return; }

    const button = $('flow-next0');
    button.disabled = true;
    try {
      const found = await lookupCep(digits);
      if (found && found.uf && found.uf !== 'SP') { showOutside(); return; }
      cepDigits = digits;
      $('c-cep').value = maskCep(digits);
      if (found) {
        if (!$('c-street').value) $('c-street').value = found.logradouro || '';
        if (!$('c-neighborhood').value) $('c-neighborhood').value = found.bairro || '';
        if (!$('c-city').value) $('c-city').value = found.localidade || '';
      }
      showStep(1);
    } finally {
      button.disabled = false;
    }
  }

  // ------------------------------------------------------------ etapa 1: dados --
  function readPerson() {
    return {
      name: $('c-name').value.trim(),
      email: $('c-email').value.trim(),
      phone: $('c-phone').value.trim(),
      cpf: $('c-cpf').value.trim(),
      birthDate: $('c-birth').value,
      password: $('c-password').value,
      passwordConfirm: $('c-password2').value
    };
  }

  function validatePersonStep() {
    clearFieldErrors();
    const p = readPerson();
    let ok = true;
    const fail = (key, reason) => { setFieldError(key, reason); ok = false; };

    if (!me) {
      if (!p.name) fail('name', 'required'); else if (!/\S+\s+\S+/.test(p.name)) fail('name', 'invalid');
      if (!p.email) fail('email', 'required'); else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) fail('email', 'invalid');
      if (!p.phone) fail('phone', 'required'); else if (!Clube.isValidMobile(p.phone)) fail('phone', 'invalid');
    }
    if (!p.cpf) fail('cpf', 'required'); else if (!Clube.isValidCpf(p.cpf)) fail('cpf', 'invalid');
    if (!p.birthDate) fail('birthDate', 'required');
    else if (!Clube.isValidBirthDate(p.birthDate)) fail('birthDate', 'invalid');
    else if (!Clube.isAdult(p.birthDate)) fail('birthDate', 'underage');
    if (!me) {
      if (p.password.length < 6 || p.password.length > 100 || p.password === '123mudar') fail('password', 'weak');
      if (p.password !== p.passwordConfirm) fail('passwordConfirm', 'mismatch');
    }
    if (!ok) firstErrorIntoView();
    return ok;
  }

  // ---------------------------------------------------------- etapa 2: endereço --
  function readAddress() {
    return {
      cep: cepDigits,
      street: $('c-street').value.trim(),
      number: $('c-number').value.trim(),
      complement: $('c-complement').value.trim(),
      neighborhood: $('c-neighborhood').value.trim(),
      city: $('c-city').value.trim(),
      state: 'SP',
      reference: $('c-reference').value.trim()
    };
  }

  function validateAddressStep() {
    clearFieldErrors();
    const a = readAddress();
    let ok = true;
    Object.keys(REQUIRED_FIELDS).forEach((key) => { if (!a[key]) { setFieldError(key, 'required'); ok = false; } });
    if (!ok) firstErrorIntoView();
    return ok;
  }

  // ----------------------------------------------------------- etapa 3: paladar --
  function prepareQuizStep() {
    $('flow-quiz-title').textContent = Q.DEFINITION.titulo;
    $('flow-quiz-lead').textContent = Q.DEFINITION.introducao;
    $('flow-quiz-choice').hidden = answerNow !== null;
    $('flow-quiz').hidden = answerNow !== true;
    $('flow-next3').hidden = answerNow === null;
    showBox('flow-err3', '');
  }

  function renderQuiz() {
    $('flow-quiz-questions').innerHTML = Q.STEPS.map((s) =>
      '<h4 class="club-quiz-step">' + esc(s.titulo) + '</h4><p class="field-hint">' + esc(s.descricao) + '</p>' +
      s.perguntas.map((q) => UI.questionHtml(q, answers)).join('')
    ).join('');
  }

  function chooseQuiz(now) {
    answerNow = now;
    if (now) renderQuiz();
    prepareQuizStep();
  }

  function validateQuizStep() {
    showBox('flow-err3', '');
    if (answerNow === null) { showBox('flow-err3', 'Escolha se quer responder agora ou depois.'); return false; }
    if (answerNow === false) return true;
    const checked = Q.validateAnswers(answers);
    UI.markErrors(Object.keys(checked.errors));
    if (!checked.valid) {
      showBox('flow-err3', 'Faltam respostas nas perguntas marcadas com *. Se preferir, volte e escolha responder depois.');
      const first = document.getElementById('quiz-q-' + Object.keys(checked.errors)[0]);
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  // ----------------------------------------------------------- etapa 4: revisão --
  function summaryRow(label, value) {
    return '<div class="club-summary-row"><span>' + esc(label) + '</span><strong>' + value + '</strong></div>';
  }

  function renderSummary() {
    showBox('flow-err4', '');
    $('flow-exists').hidden = true;
    const a = readAddress();
    const p = readPerson();
    const person = me ? { name: me.subscriber.name, email: me.subscriber.email, phone: me.subscriber.phone } : p;
    const address = a.street + ', ' + a.number + (a.complement ? ' — ' + a.complement : '') + ' · ' + a.neighborhood + ' · ' + a.city + '/SP · CEP ' + maskCep(cepDigits) + (a.reference ? ' (' + a.reference + ')' : '');
    $('flow-summary').innerHTML =
      '<div class="block-title">Resumo da sua assinatura</div>' +
      summaryRow('Plano', esc(Clube.PLAN.name)) +
      summaryRow('Valor mensal', money(Clube.PLAN.priceCents)) +
      summaryRow('Vinhos', Clube.PLAN.winesPerMonth + ' por mês') +
      summaryRow('Frete', 'Incluso no valor') +
      summaryRow('Cobrança', 'Mensal. Você recebe o link de pagamento por e-mail.') +
      summaryRow('Cancelamento', 'Por solicitação ao nosso atendimento') +
      summaryRow('Entrega em', esc(address)) +
      summaryRow('Titular', esc(person.name) + '<br>' + esc(person.email || '') + '<br>' + esc(maskPhone(String(person.phone || '')))) +
      summaryRow('Questionário de paladar', answerNow ? 'Respondido agora' : 'Para responder depois, na sua área');
  }

  async function submit() {
    showBox('flow-err4', '');
    $('flow-exists').hidden = true;
    const consents = {
      age18: $('k-age18').checked, terms: $('k-terms').checked, privacy: $('k-privacy').checked,
      subscription: $('k-subscription').checked, marketing: $('k-marketing').checked
    };
    if (!consents.age18 || !consents.terms || !consents.privacy || !consents.subscription) {
      showBox('flow-err4', 'Para continuar, marque as confirmações obrigatórias (com *).');
      return;
    }

    const p = readPerson();
    const common = { cpf: p.cpf, birthDate: p.birthDate, address: readAddress(), consents, answers: answerNow ? answers : null };
    const action = me ? 'contract' : 'signup';
    const payload = me ? common : Object.assign({}, common, {
      name: p.name, email: p.email, phone: p.phone, password: p.password, passwordConfirm: p.passwordConfirm,
      website: $('c-website').value
    });

    const button = $('flow-submit');
    button.disabled = true;
    try {
      const res = await fetch(API + '?action=' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      if (res.status === 201 || res.status === 200) {
        $('c-password').value = ''; $('c-password2').value = '';
        showStep('done');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 400) { backToFirstProblem(data.errors || {}); return; }
      if (res.status === 409 && data.error === 'exists') {
        $('flow-exists-text').textContent = 'Já existe um cadastro com este ' + (EXISTS_TEXT[data.field] || 'dado') + '. Entre na sua área para continuar: não criamos um segundo cadastro.';
        $('flow-exists').hidden = false;
        return;
      }
      if (res.status === 409 && data.error === 'already_subscribed') { showBox('flow-err4', 'Você já tem uma assinatura em andamento. Acompanhe na sua área.'); return; }
      if (res.status === 403) { showBox('flow-err4', 'As contratações do clube ainda não estão abertas.'); return; }
      if (res.status === 429) { showBox('flow-err4', 'Estamos com muitas solicitações agora. Tente novamente em alguns minutos.'); return; }
      if (res.status === 401) { showBox('flow-err4', 'Sua sessão terminou. Entre na sua área e tente de novo.'); return; }
      throw new Error('http ' + res.status);
    } catch (err) {
      showBox('flow-err4', 'Não foi possível enviar agora. Seus dados continuam aqui; tente de novo em instantes.');
    } finally {
      button.disabled = false;
    }
  }

  // O servidor achou problema: leva o cliente à primeira etapa com erro e mostra onde.
  function backToFirstProblem(errors) {
    const keys = Object.keys(errors);
    if (!keys.length) { showBox('flow-err4', 'Confira os dados informados.'); return; }
    const target = Math.min.apply(null, keys.map((k) => (k in FIELD_STEP ? FIELD_STEP[k] : LAST_STEP)));
    if (target === 4) { showBox('flow-err4', 'Confira os dados e as confirmações.'); return; }
    showStep(target);
    clearFieldErrors();
    keys.forEach((key) => { if (FIELD_STEP[key] === target && key !== 'answers') setFieldError(key, errors[key]); });
    if (target === 0) { showOutside(); }
    if (target === 3) showBox('flow-err3', 'Alguma resposta do questionário precisa de ajuste.');
    firstErrorIntoView();
  }

  // ----------------------------------------------------------------- partida --
  async function init() {
    $('club-slogan').textContent = Clube.SLOGAN;
    $('club-price').textContent = money(Clube.PLAN.priceCents);
    $('flow-quiz-title').textContent = Q.DEFINITION.titulo;

    let open = false;
    try {
      const [clubRes, meRes] = await Promise.all([
        fetch(API + '?resource=club', { credentials: 'same-origin', cache: 'no-store' }),
        fetch(API, { credentials: 'same-origin', cache: 'no-store' })
      ]);
      open = clubRes.ok ? !!(await clubRes.json()).open : false;
      if (meRes.ok) me = await meRes.json();
    } catch (err) { /* sem rede: a apresentação continua; o cadastro fica fechado */ }

    if (me) {
      $('c-name').value = me.subscriber.name; $('c-name').readOnly = true;
      $('c-email').value = me.subscriber.email || ''; $('c-email').readOnly = !!me.subscriber.email;
      $('c-phone').value = maskPhone(me.subscriber.phone); $('c-phone').readOnly = true;
      $('flow-password-fields').hidden = true;
      $('flow-account-note').hidden = false;
    }

    const current = me && me.subscription;
    if (current && Clube.isOpen(current.status)) {
      $('club-cta').hidden = true;
      $('club-already-text').textContent = 'Você já tem uma assinatura: ' + current.statusLabel + '. Acompanhe a situação na sua área.';
      $('club-already').hidden = false;
    } else if (!open) {
      $('club-cta').hidden = true;
      $('club-closed').hidden = false;
    }
  }

  // ---------------------------------------------------------------- eventos --
  $('club-start').addEventListener('click', openFlow);
  $('flow-next0').addEventListener('click', checkCep);
  $('flow-next1').addEventListener('click', () => { if (validatePersonStep()) showStep(2); });
  $('flow-next2').addEventListener('click', () => { if (validateAddressStep()) showStep(3); });
  $('flow-next3').addEventListener('click', () => { if (validateQuizStep()) showStep(4); });
  $('flow-submit').addEventListener('click', submit);
  $('flow-quiz-now').addEventListener('click', () => chooseQuiz(true));
  $('flow-quiz-later').addEventListener('click', () => chooseQuiz(false));
  document.querySelectorAll('[data-flow-back]').forEach((btn) => btn.addEventListener('click', () => {
    clearFieldErrors();
    if (step === 3 && answerNow !== null) { answerNow = null; prepareQuizStep(); return; }
    showStep(step - 1);
  }));

  $('c-cep0').addEventListener('input', function () { this.value = maskCep(this.value); });
  $('c-cpf').addEventListener('input', function () { this.value = maskCpf(this.value); });
  $('c-phone').addEventListener('input', function () { this.value = maskPhone(this.value); });
  $('c-birth').max = Clube.today();
  UI.bind($('flow-quiz-questions'), () => answers);

  init();
})();
