// js/colecoes.js — coleções temporárias de vinhos (ex.: Halloween), com banner
// na home. Clicar no banner abre index.html#slug: a própria home mostra só os
// vinhos da coleção, com carrinho, estoque e popup iguais aos da vitrine.
//
// Para criar uma coleção nova: coloque os banners em colecoes-img/ e acrescente
// um objeto a COLLECTIONS. `until` (YYYY-MM-DD) é o primeiro dia em que a coleção
// já NÃO aparece mais; sem `until`, ela fica no ar até ser removida daqui.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Colecoes = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const COLLECTIONS = [
    {
      slug: 'halloween',
      title: 'Sugestões para o Halloween',
      intro: 'Seis vinhos escolhidos para a noite de Halloween: tintos macios e frutados, um branco fresco e um rosé, para acompanhar petiscos, massas e pizzas.',
      ctaText: 'Ver sugestões de vinhos',
      bannerAlt: 'Banner de Halloween com abóboras, morcegos e lua cheia: toque para ver sugestões de vinhos para o Halloween',
      bannerDesktop: 'colecoes-img/halloween-desktop.jpg',
      bannerMobile: 'colecoes-img/halloween-mobile.jpg',
      until: '2026-11-01',
      wines: [
        'baron-philippe-de-rothschild-reserva-especial-merlot',
        'ca-montebello-barbera',
        'gretus-tempranillo',
        'single-vineyard-pinot-noir',
        'pescada-blend-verde',
        'mon-bouquet-de-provence'
      ]
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

  function activeCollections(date) {
    return COLLECTIONS.filter((c) => isActive(c, date));
  }

  function findActive(slug, date) {
    if (!slug) return undefined;
    return COLLECTIONS.find((c) => c.slug === slug && isActive(c, date));
  }

  return { COLLECTIONS, todayISO, isActive, activeCollections, findActive };
});
