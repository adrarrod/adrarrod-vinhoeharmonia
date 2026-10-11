// js/harmonizacao.js — tipos de prato da faixa "Harmonizações" (home) e da
// página harmonizacao.html. Para acrescentar um prato: coloque a ilustração em
// harmonizacao-img/ e acrescente um objeto ao fim de TYPES.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Harmonizacao = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const TYPES = [
    {
      slug: 'pizza',
      title: 'Pizza',
      cardText: 'Pizza pede vinhos com boa acidez e fruta fresca, que limpam o queijo e acompanham o molho de tomate.',
      intro: 'O molho de tomate é ácido e o queijo é gorduroso, então a pizza combina com vinhos que tenham acidez e frescor para equilibrar. Tintos leves e frutados são a escolha clássica; para sabores mais delicados, como marguerita ou quatro queijos, rosés e espumantes secos refrescam muito bem.',
      tips: [
        'Pizzas apimentadas, como calabresa e pepperoni, pedem tintos frutados e com pouco tanino.',
        'Marguerita e quatro queijos vão bem com brancos frescos, rosés e espumantes.',
        'Evite vinhos muito tânicos ou pesados: eles competem com o sabor da massa.'
      ],
      grapes: ['Sangiovese', 'Barbera', 'Primitivo', 'Merlot jovem', 'Rosé seco', 'Espumante brut'],
      image: 'harmonizacao-img/pizza.jpg',
      imageAlt: 'Fatias de pizza de pepperoni com queijo derretido sobre uma tábua de madeira'
    },
    {
      slug: 'carnes-vermelhas',
      title: 'Carnes Vermelhas',
      cardText: 'Carnes vermelhas são intensas e gordurosas, por isso pedem tintos de médio a alto corpo, com taninos firmes.',
      intro: 'A gordura e a proteína da carne suavizam a sensação de aspereza dos taninos, e é por isso que tintos estruturados combinam tão bem com ela. Quanto mais intenso o corte e o preparo, mais corpo o vinho deve ter: grelhados e churrasco pedem tintos encorpados, enquanto cortes mais leves aceitam estilos mais macios.',
      tips: [
        'Churrasco e carnes grelhadas: Malbec, Cabernet Sauvignon ou Tannat.',
        'Cordeiro e ossobuco aceitam tintos mais complexos, com mais tempo de guarda.',
        'Carnes com molhos mais doces ou temperados combinam com tintos bem frutados, como o Syrah.'
      ],
      grapes: ['Malbec', 'Cabernet Sauvignon', 'Tannat', 'Syrah', 'Tempranillo', 'Carménère'],
      image: 'harmonizacao-img/carnes-vermelhas.jpg',
      imageAlt: 'Dois bifes grelhados com alecrim e pimenta sobre uma mesa de madeira, com chamas ao fundo'
    },
    {
      slug: 'carnes-brancas',
      title: 'Carnes Brancas',
      cardText: 'Frango, porco e aves são versáteis: aceitam brancos encorpados, rosés e tintos leves.',
      intro: 'As carnes brancas têm sabor mais suave, então o vinho não precisa ser potente. O que decide a escolha é o preparo: o assado e o grelhado aceitam tintos leves e macios, e os molhos cremosos pedem brancos com um pouco mais de corpo.',
      tips: [
        'Frango assado ou grelhado: Pinot Noir, Gamay ou um rosé seco.',
        'Molhos cremosos ou de queijo: Chardonnay de corpo médio.',
        'Porco com frutas ou temperos adocicados combina com brancos aromáticos e rosés.'
      ],
      grapes: ['Chardonnay', 'Pinot Noir', 'Gamay', 'Viognier', 'Rosé seco'],
      image: 'harmonizacao-img/carnes-brancas.jpg',
      imageAlt: 'Peito de frango grelhado fatiado ao lado de uma salada de rúcula e tomate'
    },
    {
      slug: 'peixes',
      title: 'Peixes',
      cardText: 'Peixes e frutos do mar combinam com brancos leves, frescos e de boa acidez.',
      intro: 'Peixes têm sabor delicado, e vinhos muito potentes escondem esse sabor. Os brancos secos, leves e de boa acidez funcionam como um toque de limão: realçam o prato sem pesar. Bacalhau e peixes mais gordos, como o salmão, aceitam brancos com mais corpo e até rosés.',
      tips: [
        'Peixes grelhados ou ao limão: Sauvignon Blanc, Vinho Verde ou Pinot Grigio.',
        'Frutos do mar e ceviche: espumantes e brancos bem gelados.',
        'Bacalhau e salmão aceitam brancos mais encorpados ou um tinto leve.'
      ],
      grapes: ['Sauvignon Blanc', 'Pinot Grigio', 'Vinho Verde', 'Riesling seco', 'Torrontés', 'Espumante brut'],
      image: 'harmonizacao-img/peixes.jpg',
      imageAlt: 'Filés de salmão grelhado com ramos de tomilho e fatias de laranja sobre uma tábua redonda'
    },
    {
      slug: 'massas',
      title: 'Massas',
      cardText: 'Na massa, quem manda é o molho: tomate pede acidez, creme e manteiga pedem brancos, carne pede tinto.',
      intro: 'A massa em si é neutra, então o vinho acompanha o molho. Molhos de tomate são ácidos e pedem tintos com acidez; molhos de manteiga, creme ou queijo vão melhor com brancos de corpo médio; e molhos de carne, como o ragu, pedem tintos mais estruturados.',
      tips: [
        'Molho de tomate: Sangiovese, como o Chianti, ou Barbera.',
        'Manteiga, creme ou queijo: Pinot Grigio ou Chardonnay.',
        'Ragu e molhos de carne: Merlot, Tempranillo ou Cabernet Franc.',
        'Pesto e molhos de ervas: Sauvignon Blanc.'
      ],
      grapes: ['Sangiovese', 'Barbera', 'Pinot Grigio', 'Chardonnay', 'Merlot', 'Sauvignon Blanc'],
      image: 'harmonizacao-img/massas.jpg',
      imageAlt: 'Fatia de lasanha gratinada com molho de carne e queijo, decorada com folhas de hortelã'
    }
  ];

  function pageUrl(type) {
    return 'harmonizacao.html#' + type.slug;
  }

  return { TYPES, pageUrl };
});
