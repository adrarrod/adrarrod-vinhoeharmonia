// js/colecoes.js — banners da home: coleções temporárias de vinhos e avisos.
//
// Coleção (ex.: Halloween): tem banner na home; clicar nele abre index.html#slug,
// e a própria home mostra só os vinhos da coleção, com carrinho, estoque e popup
// iguais aos da vitrine.
// Aviso (`teaser: true`, ex.: "Black Friday em breve"): o título aparece em cima
// do banner e não há link nem página, porque ainda não há vinhos para mostrar.
//
// Para criar um banner novo: coloque as imagens em colecoes-img/ e acrescente um
// objeto a COLLECTIONS. `until` (YYYY-MM-DD) é o primeiro dia em que ele já NÃO
// aparece mais; sem `until`, fica no ar até ser removido daqui.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Colecoes = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const COLLECTIONS = [
    {
      slug: 'black-friday',
      teaser: true,
      title: 'Estamos preparando a Black Friday. Em breve vamos lançar!',
      bannerAlt: 'Banner com o texto Black Friday em letras cinza sobre fundo escuro',
      bannerDesktop: 'colecoes-img/black-friday-desktop.jpg',
      bannerMobile: 'colecoes-img/black-friday-mobile.jpg'
    }
  ];

  // Data local (do navegador) no formato YYYY-MM-DD, para comparar com `until`.
  function todayISO(date) {
    const d = date || new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function isActive(collection, date) {
    return !collection.until || todayISO(date) < collection.until;
  }

  // Banners a mostrar na home no dia dado (coleções e avisos).
  function activeCollections(date, list) {
    return (list || COLLECTIONS).filter((c) => isActive(c, date));
  }

  // Coleção que pode ser aberta por index.html#slug. Aviso não tem página.
  function findActive(slug, date, list) {
    if (!slug) return undefined;
    return (list || COLLECTIONS).find((c) => c.slug === slug && !c.teaser && isActive(c, date));
  }

  return { COLLECTIONS, todayISO, isActive, activeCollections, findActive };
});
