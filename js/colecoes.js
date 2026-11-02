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
//
// `showWhen` amarra o banner ao interruptor da promoção (painel admin): 'promo-on'
// só aparece com a promoção ligada e 'promo-off' só com ela desligada. É assim que
// o aviso "Black Friday em breve" dá lugar às ofertas, sem novo deploy.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Colecoes = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // No navegador, js/promocao.js é carregado antes deste arquivo.
  const Promocao = typeof module === 'object' && module.exports
    ? require('./promocao.js')
    : (typeof self !== 'undefined' ? self : globalThis).Promocao;
  const pct = (rate) => Math.round(rate * 100) + '%';

  const COLLECTIONS = [
    {
      slug: 'black-friday-aviso',
      teaser: true,
      showWhen: 'promo-off',
      title: 'Estamos preparando a Black Friday. Em breve vamos lançar!',
      bannerAlt: 'Banner com o texto Black Friday em letras cinza sobre fundo escuro',
      bannerDesktop: 'colecoes-img/black-friday-desktop.jpg',
      bannerMobile: 'colecoes-img/black-friday-mobile.jpg'
    },
    {
      slug: 'black-friday',
      showWhen: 'promo-on',
      title: 'Black Friday',
      intro: 'Dez vinhos com desconto de ' + pct(Promocao.BLACK_FRIDAY.rates.pix) + ' no PIX ou ' + pct(Promocao.BLACK_FRIDAY.rates.card) + ' no cartão de crédito. O desconto aparece no resumo do seu pedido, conforme a forma de pagamento que você escolher.',
      ctaText: 'Ver as ofertas',
      bannerAlt: 'Banner da Black Friday: toque para ver os vinhos em oferta',
      bannerDesktop: 'colecoes-img/black-friday-desktop.jpg',
      bannerMobile: 'colecoes-img/black-friday-mobile.jpg',
      wines: Promocao.BLACK_FRIDAY.wines.slice()
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

  // Aparece neste momento? `showWhen` olha o interruptor da promoção
  // (options.promo); sem opção informada, a promoção conta como desligada.
  function isShown(collection, options) {
    const promoOn = !!(options && options.promo === true);
    if (collection.showWhen === 'promo-on') return promoOn;
    if (collection.showWhen === 'promo-off') return !promoOn;
    return true;
  }

  // Banners a mostrar na home no dia dado (coleções e avisos).
  function activeCollections(date, list, options) {
    return (list || COLLECTIONS).filter((c) => isActive(c, date) && isShown(c, options));
  }

  // Coleção que pode ser aberta por index.html#slug. Aviso não tem página.
  function findActive(slug, date, list, options) {
    if (!slug) return undefined;
    return (list || COLLECTIONS).find((c) => c.slug === slug && !c.teaser && isActive(c, date) && isShown(c, options));
  }

  return { COLLECTIONS, todayISO, isActive, activeCollections, findActive };
});
