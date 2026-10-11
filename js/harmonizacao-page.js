// js/harmonizacao-page.js — monta harmonizacao.html a partir de js/harmonizacao.js.
(function () {
  'use strict';

  // A loja vende bebida alcoólica: quem chega direto aqui sem ter confirmado a
  // idade passa primeiro pela confirmação da home (mesma chave do js/store.js).
  try {
    if (localStorage.getItem('idade_confirmada') !== '1') {
      window.location.replace('index.html');
      return;
    }
  } catch (e) { /* sem localStorage: não bloqueia a leitura */ }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function sectionTemplate(type) {
    return '' +
      '<article class="hz-section" id="' + esc(type.slug) + '">' +
        '<img src="' + esc(type.image) + '" alt="' + esc(type.imageAlt) + '" loading="lazy" width="960" height="600">' +
        '<div class="hz-section-body">' +
          '<h3>' + esc(type.title) + '</h3>' +
          '<p>' + esc(type.intro) + '</p>' +
          '<h4>Dicas rápidas</h4>' +
          '<ul class="hz-tips">' + type.tips.map(function (tip) { return '<li>' + esc(tip) + '</li>'; }).join('') + '</ul>' +
          '<h4>Uvas e estilos que combinam</h4>' +
          '<div class="hz-chips">' + type.grapes.map(function (g) { return '<span class="hz-chip">' + esc(g) + '</span>'; }).join('') + '</div>' +
        '</div>' +
      '</article>';
  }

  var Hz = window.Harmonizacao;
  var list = document.getElementById('hz-list');
  var jump = document.getElementById('hz-jump');
  if (!Hz || !list) return;

  list.innerHTML = Hz.TYPES.map(sectionTemplate).join('');
  if (jump) {
    jump.innerHTML = Hz.TYPES.map(function (t) {
      return '<a href="#' + esc(t.slug) + '">' + esc(t.title) + '</a>';
    }).join('');
  }

  // O navegador tenta rolar até o #ancora antes de as seções existirem; refaz
  // a rolagem agora que elas foram montadas.
  if (window.location.hash) {
    var target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (target) target.scrollIntoView();
  }
})();
