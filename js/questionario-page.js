// js/questionario-page.js — tela do questionário do Clube V&H Personnalité:
// introdução + dados, quatro etapas, revisão e envio. As regras (opção
// exclusiva, obrigatoriedade) vêm de js/questionario.js; o servidor confere tudo
// de novo antes de gravar.
(function () {
  'use strict';

  const Q = window.Questionario;
  const API = '/api/subscriber-area';
  const $ = (id) => document.getElementById(id);
  const STEP_COUNT = Q.STEPS.length;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Telas: 'intro' | 0..3 (etapas) | 'review' | 'done'
  let view = 'intro';
  let fromReview = false; // veio da revisão ao tocar em "Alterar": Continuar volta para lá
  let answers = {};

  const sections = { intro: $('quiz-intro'), step: $('quiz-step'), review: $('quiz-review'), done: $('quiz-done') };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function showBox(box, message) {
    box.hidden = !message;
    box.textContent = message || '';
  }

  function formatPhone(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return d;
  }

  function formatDay(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
  }

  // ------------------------------------------------------------- navegação --

  function setProgress(percent, label) {
    $('quiz-progress').hidden = label === null;
    if (label === null) return;
    $('quiz-progress-label').textContent = label;
    $('quiz-progress-fill').style.width = percent + '%';
    $('quiz-progress-bar').setAttribute('aria-valuenow', String(percent));
  }

  function go(next) {
    view = next;
    sections.intro.hidden = next !== 'intro';
    sections.step.hidden = typeof next !== 'number';
    sections.review.hidden = next !== 'review';
    sections.done.hidden = next !== 'done';

    if (next === 'intro') setProgress(0, 'Antes de começar');
    else if (typeof next === 'number') {
      setProgress(Math.round((next / STEP_COUNT) * 100), 'Etapa ' + (next + 1) + ' de ' + STEP_COUNT);
      renderStep(next);
    } else if (next === 'review') {
      setProgress(100, 'Revisão');
      renderReview();
    } else setProgress(100, null);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------------------------------------------------------------- etapas --

  function renderStep(index) {
    const step = Q.STEPS[index];
    $('quiz-step-title').textContent = step.titulo;
    $('quiz-step-desc').textContent = step.descricao;
    $('quiz-questions').innerHTML = step.perguntas.map((q) => window.QuestionarioUI.questionHtml(q, answers)).join('');
    showBox($('quiz-step-error'), '');
    $('quiz-back').textContent = fromReview ? 'Cancelar' : 'Voltar';
    $('quiz-next').textContent = fromReview ? 'Voltar à revisão' : (index === STEP_COUNT - 1 ? 'Revisar' : 'Continuar');
  }

  window.QuestionarioUI.bind($('quiz-questions'), () => answers);

  function nextFromStep() {
    const index = view;
    const missing = Q.missingRequired(index, answers);
    window.QuestionarioUI.markErrors(missing);
    if (missing.length) {
      showBox($('quiz-step-error'), missing.length === 1
        ? 'Falta responder uma pergunta (marcada com *).'
        : 'Faltam ' + missing.length + ' perguntas (marcadas com *).');
      const first = $('quiz-q-' + missing[0]);
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (fromReview) { fromReview = false; go('review'); return; }
    go(index === STEP_COUNT - 1 ? 'review' : index + 1);
  }

  function backFromStep() {
    if (fromReview) { fromReview = false; go('review'); return; }
    go(view === 0 ? 'intro' : view - 1);
  }

  // -------------------------------------------------------------- revisão --

  function answerText(q) {
    const a = answers[q.id];
    if (Array.isArray(a)) return a.join(', ');
    return typeof a === 'string' ? a.trim() : '';
  }

  function renderReview() {
    showBox($('quiz-review-error'), '');
    $('quiz-review-list').innerHTML = Q.STEPS.map((step, i) =>
      '<div class="fieldset-block quiz-review-step">' +
        '<div class="quiz-review-head"><div class="block-title">' + escapeHtml(step.titulo) + '</div>' +
        '<button class="btn btn-ghost quiz-review-edit" type="button" data-edit-step="' + i + '">Alterar</button></div>' +
        step.perguntas.map((q) => {
          const text = answerText(q);
          return '<div class="quiz-review-item"><div class="quiz-review-q">' + escapeHtml(q.texto) + '</div>' +
            '<div class="quiz-review-a' + (text ? '' : ' is-empty') + '">' + (text ? escapeHtml(text) : 'Sem resposta') + '</div></div>';
        }).join('') +
      '</div>'
    ).join('');
  }

  $('quiz-review-list').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-edit-step]');
    if (!btn) return;
    fromReview = true;
    go(Number(btn.dataset.editStep));
  });

  // ---------------------------------------------------------------- envio --

  function deniedView(message) {
    $('quiz-loading').hidden = true;
    $('quiz-app').hidden = true;
    $('quiz-denied').hidden = false;
    if (message) $('quiz-denied-text').textContent = message;
  }

  async function submit() {
    const button = $('quiz-submit');
    showBox($('quiz-review-error'), '');
    button.disabled = true;
    try {
      const res = await fetch(API + '?action=questionnaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: $('quiz-email').value.trim(), answers })
      });
      if (res.status === 401) { deniedView('Sua sessão terminou. Entre de novo na sua área para enviar as respostas.'); return; }
      if (res.status === 409) {
        go('intro');
        showBox($('quiz-intro-error'), 'Este e-mail já está cadastrado em outro assinante. Use outro e-mail.');
        return;
      }
      if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        const errors = data.errors || {};
        if (errors.email) {
          go('intro');
          showBox($('quiz-intro-error'), errors.email === 'invalid' ? 'Confira o e-mail: ele não parece válido.' : 'Informe o seu e-mail.');
          return;
        }
        const failing = Object.keys(errors.answers || {});
        if (failing.length) {
          go(Q.stepIndexOf(failing[0]));
          showBox($('quiz-step-error'), 'Alguma resposta precisa de ajuste. Confira as perguntas marcadas e continue.');
          failing.forEach((id) => { const el = $('quiz-q-' + id); if (el) el.classList.add('has-error'); });
          return;
        }
      }
      if (!res.ok) throw new Error('http ' + res.status);
      answers = {};
      go('done');
    } catch (err) {
      showBox($('quiz-review-error'), 'Não foi possível enviar agora. Suas respostas continuam aqui; tente de novo em instantes.');
    } finally {
      button.disabled = false;
    }
  }

  // --------------------------------------------------------------- início --

  function start() {
    const email = $('quiz-email').value.trim();
    if (!email) { showBox($('quiz-intro-error'), 'Informe o seu e-mail para continuar.'); return; }
    if (!EMAIL_RE.test(email)) { showBox($('quiz-intro-error'), 'Confira o e-mail: ele não parece válido.'); return; }
    showBox($('quiz-intro-error'), '');
    fromReview = false;
    go(0);
  }

  async function init() {
    $('quiz-title').textContent = Q.DEFINITION.titulo;
    $('quiz-lead').textContent = Q.DEFINITION.introducao;
    try {
      const [meRes, quizRes] = await Promise.all([
        fetch(API, { credentials: 'same-origin', cache: 'no-store' }),
        fetch(API + '?resource=questionnaire', { credentials: 'same-origin', cache: 'no-store' })
      ]);
      if (meRes.status === 401 || quizRes.status === 401) { deniedView(); return; }
      if (!meRes.ok || !quizRes.ok) throw new Error('http');
      const me = (await meRes.json()).subscriber;
      const quiz = await quizRes.json();

      $('quiz-phone').value = formatPhone(me.phone);
      $('quiz-name').value = me.name;
      $('quiz-email').value = quiz.email || '';

      if (quiz.response) {
        // Já respondeu: abre com as respostas atuais para ele rever e atualizar.
        answers = JSON.parse(JSON.stringify(quiz.response.answers || {}));
        $('quiz-redo').textContent = 'Você respondeu em ' + formatDay(quiz.response.submittedAt) + '. Pode rever e atualizar suas respostas quando quiser.';
        $('quiz-redo').hidden = false;
        $('quiz-start').textContent = 'Rever minhas respostas';
      }

      $('quiz-loading').hidden = true;
      $('quiz-app').hidden = false;
      go('intro');
    } catch (err) {
      deniedView('Não foi possível carregar o questionário agora. Tente de novo em instantes.');
    }
  }

  $('quiz-start').addEventListener('click', start);
  $('quiz-back').addEventListener('click', backFromStep);
  $('quiz-next').addEventListener('click', nextFromStep);
  $('quiz-review-back').addEventListener('click', () => go(STEP_COUNT - 1));
  $('quiz-submit').addEventListener('click', submit);

  init();
})();
