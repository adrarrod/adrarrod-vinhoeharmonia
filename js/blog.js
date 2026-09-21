// js/blog.js — posts do Mini Blog (blog.html).
// Para publicar um tema novo: coloque a ilustração em blog-img/ e acrescente
// um objeto NO INÍCIO de POSTS (o primeiro aparece primeiro na página).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Blog = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const POSTS = [
    {
      slug: 'vinhos-do-brasil',
      tag: 'Vinhos do Brasil',
      title: 'Do Sul do Brasil para a sua mesa',
      summary: 'O Brasil faz vinho de qualidade há muito tempo, e a Serra Gaúcha e a Campanha Gaúcha são as regiões mais conhecidas. O clima e o solo do Sul favorecem vinhos frescos, de boa acidez, e os espumantes são um dos grandes orgulhos do país. Além das uvas clássicas, como Merlot, Cabernet Franc e Chardonnay, vale provar castas menos comuns, como Arinarnoa, Ancellotta e Gewürztraminer. Uma ótima forma de descobrir o vinho brasileiro sem susto no bolso.',
      image: 'blog-img/vinhos-do-brasil.svg',
      imageAlt: 'Ilustração de vinhedos em fileiras sobre colinas do Sul do Brasil, ao pôr do sol'
    },
    {
      slug: 'harmonizacao-com-carnes',
      tag: 'Harmonização',
      title: 'Carne e vinho: a conta dos taninos',
      summary: 'Tanino é aquela leve sensação de aspereza que alguns tintos deixam na boca, e a gordura e a proteína da carne ajudam a suavizá-la. Por isso carnes vermelhas grelhadas pedem tintos de mais corpo, como Malbec, Cabernet Sauvignon e Tannat. Carnes mais leves, como frango e porco, combinam melhor com tintos mais frescos, como Pinot Noir e Gamay. E uma dica simples: quanto mais temperado o prato, mais fruta o vinho deve ter.',
      image: 'blog-img/harmonizacao-com-carnes.svg',
      imageAlt: 'Ilustração de um prato com um bife grelhado ao lado de uma taça de vinho tinto'
    },
    {
      slug: 'vinhos-de-portugal',
      tag: 'Vinhos de Portugal',
      title: 'Portugal, muito além do Vinho do Porto',
      summary: 'Portugal tem uma das tradições de vinho mais antigas da Europa e uma diversidade enorme de uvas nativas, como Touriga Nacional, Tinta Roriz e Fernão Pires. O Douro é a região mais famosa, mas Alentejo, Vinho Verde, Tejo e Lisboa também entregam ótimos rótulos, quase sempre com bom custo-benefício. Os tintos combinam com carnes e bacalhau; os brancos, mais frescos, com peixes e frutos do mar.',
      image: 'blog-img/vinhos-de-portugal.svg',
      imageAlt: 'Ilustração de vinhedos em socalcos ao longo de um rio, como no Vale do Douro'
    }
  ];

  return { POSTS };
});
