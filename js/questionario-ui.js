// js/questionario-ui.js — as perguntas do questionário na tela (a marcação HTML e
// o comportamento das respostas), compartilhado pela página do questionário e
// pela tela de contratação. As regras (opção exclusiva, obrigatoriedade) ficam em
// js/questionario.js.
(function () {
  'use strict';

  const Q = window.Questionario;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Uma pergunta, com as respostas já dadas (answers) marcadas.
  function questionHtml(q, answers) {
    const current = answers[q.id];
    let body = '';

    if (q.tipo === 'texto_livre') {
      const text = typeof current === 'string' ? current : '';
      body =
        '<div class="field"><textarea class="quiz-text" data-q="' + q.id + '" rows="4" maxlength="' + q.limite_caracteres + '" placeholder="' + escapeHtml(q.placeholder || '') + '" aria-label="' + escapeHtml(q.texto) + '">' + escapeHtml(text) + '</textarea></div>' +
        '<span class="field-hint quiz-counter" data-counter="' + q.id + '">' + text.length + ' / ' + q.limite_caracteres + '</span>';
    } else {
      const multi = q.tipo === 'multipla';
      const selected = multi ? (Array.isArray(current) ? current : []) : [current];
      body = '<div class="quiz-options">' + q.opcoes.map((option, i) =>
        '<label class="quiz-option">' +
          '<input type="' + (multi ? 'checkbox' : 'radio') + '" name="' + q.id + '" value="' + escapeHtml(option) + '" data-q="' + q.id + '" data-i="' + i + '"' + (selected.includes(option) ? ' checked' : '') + '>' +
          '<span>' + escapeHtml(option) + '</span>' +
        '</label>'
      ).join('') + '</div>';
    }

    return (
      '<fieldset class="quiz-question" id="quiz-q-' + q.id + '">' +
        '<legend>' + escapeHtml(q.texto) + (q.obrigatoria ? ' <span class="quiz-req" aria-hidden="true">*</span>' : '') + '</legend>' +
        (q.tipo === 'multipla' ? '<p class="field-hint">Pode marcar mais de uma opção.</p>' : '') +
        body +
      '</fieldset>'
    );
  }

  // Faz as perguntas dentro de `container` guardarem as respostas no objeto que
  // getAnswers() devolve. getAnswers é uma função porque a página pode trocar o
  // objeto inteiro (ao carregar respostas antigas, por exemplo).
  function bind(container, getAnswers) {
    container.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      const q = Q.findQuestion(input.dataset.q);
      if (!q) return;
      const answers = getAnswers();
      if (q.tipo === 'multipla') {
        answers[q.id] = Q.toggleOption(q, answers[q.id], input.value);
        // A opção exclusiva desmarca as outras (e vice-versa): a tela acompanha.
        container.querySelectorAll('input[data-q="' + q.id + '"]').forEach((el) => {
          el.checked = answers[q.id].includes(el.value);
        });
      } else {
        answers[q.id] = input.value;
      }
      const block = document.getElementById('quiz-q-' + q.id);
      if (block) block.classList.remove('has-error');
    });

    container.addEventListener('input', (event) => {
      const area = event.target;
      if (!(area instanceof HTMLTextAreaElement)) return;
      const q = Q.findQuestion(area.dataset.q);
      if (!q) return;
      getAnswers()[q.id] = area.value;
      const counter = container.querySelector('[data-counter="' + q.id + '"]');
      if (counter) counter.textContent = area.value.length + ' / ' + q.limite_caracteres;
    });
  }

  // Destaca as perguntas com problema (ids) e tira o destaque das outras.
  function markErrors(ids) {
    document.querySelectorAll('.quiz-question').forEach((el) => el.classList.remove('has-error'));
    ids.forEach((id) => {
      const el = document.getElementById('quiz-q-' + id);
      if (el) el.classList.add('has-error');
    });
  }

  window.QuestionarioUI = { questionHtml, bind, markErrors };
})();
