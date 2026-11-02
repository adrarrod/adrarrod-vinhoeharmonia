// js/promocao.js — promoção de preço (Black Friday): quais vinhos entram e quanto
// de desconto cada forma de pagamento dá. Usado pela vitrine (para mostrar os
// preços) e pelo servidor (que é quem calcula o que é cobrado de verdade).
//
// O preço promocional é "preço atual × (1 − desconto)", arredondado em centavos,
// a mesma conta da planilha da Black Friday. Custo, fornecedor e lucro da planilha
// ficam fora do site: aqui só entra o que o cliente pode ver.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Promocao = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const BLACK_FRIDAY = {
    id: 'black-friday',
    rates: { pix: 0.3, card: 0.25 },
    wines: [
      'vezzani-montepulciano',
      'vezzani-nero-di-troia',
      'terramater-vineyard-pinot-noir-reserve',
      'nobili-d-italia-trebbiano-d-abruzzo',
      'la-treille-de-candale',
      'vezzani-nero-d-avola',
      'paso-de-los-andes-carmenere-preto',
      'pao-de-los-andes-cabernet-sauvignon',
      'romanica-pinot-grigio',
      'lacase-carmenere'
    ]
  };

  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  const toCents = (value) => Math.round(value * 100);

  function isPromoWine(slug) {
    return typeof slug === 'string' && BLACK_FRIDAY.wines.includes(slug);
  }

  // Preço promocional de uma garrafa em centavos, com a conta feita em números
  // inteiros e arredondada para cima na metade (como a planilha). Em ponto
  // flutuante, 89,85 × 0,7 dá 62,8949… e o centavo sairia errado.
  function promoCents(price, method) {
    const cents = toCents(price);
    if (typeof method !== 'string' || !has(BLACK_FRIDAY.rates, method)) return cents;
    const percent = Math.round(BLACK_FRIDAY.rates[method] * 100);
    return Math.floor((cents * (100 - percent) + 50) / 100);
  }

  // Preço de uma garrafa na forma de pagamento dada ('pix' ou 'card'); sem forma
  // reconhecida, não há desconto.
  function priceFor(price, method) {
    return promoCents(price, method) / 100;
  }

  function discountCents(price, method) {
    return toCents(price) - promoCents(price, method);
  }

  function discountFor(price, method) {
    return discountCents(price, method) / 100;
  }

  // Desconto total do carrinho: só os vinhos da promoção, garrafa a garrafa.
  function promoDiscount(items, method) {
    return items.reduce((sum, item) => (isPromoWine(item.slug) ? sum + discountCents(item.price, method) * item.qty : sum), 0) / 100;
  }

  // Quanto os vinhos da promoção custam no carrinho, ao preço atual.
  function promoSubtotal(items) {
    return round2(items.reduce((sum, item) => (isPromoWine(item.slug) ? sum + item.price * item.qty : sum), 0));
  }

  return { BLACK_FRIDAY, isPromoWine, priceFor, discountFor, promoDiscount, promoSubtotal };
});
