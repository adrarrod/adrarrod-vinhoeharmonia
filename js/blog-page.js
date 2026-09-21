// js/blog-page.js — monta os cards do Mini Blog (blog.html) a partir de js/blog.js.
(function () {
  'use strict';

  // A loja vende bebida alcoólica: quem chega direto no blog sem ter confirmado
  // a idade passa primeiro pela confirmação da home (mesma chave do js/store.js).
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

  function cardTemplate(post) {
    return '' +
      '<article class="blog-card" id="' + esc(post.slug) + '">' +
        '<img class="blog-card-img" src="' + esc(post.image) + '" alt="' + esc(post.imageAlt) + '" loading="lazy" width="800" height="500">' +
        '<div class="blog-card-body">' +
          '<span class="blog-tag">' + esc(post.tag) + '</span>' +
          '<h3>' + esc(post.title) + '</h3>' +
          '<p>' + esc(post.summary) + '</p>' +
        '</div>' +
      '</article>';
  }

  var list = document.getElementById('blog-list');
  if (list && window.Blog) {
    list.innerHTML = window.Blog.POSTS.map(cardTemplate).join('');
  }
})();
