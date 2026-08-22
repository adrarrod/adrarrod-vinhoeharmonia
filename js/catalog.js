// js/catalog.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Catalog = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const MENU = [
    { slug: 'coragem-reserva', name: 'Coragem Reserva', category: 'Tinto', price: 74.25, country: 'Portugal', grape: 'Blend', image: 'img/coragem-reserva.jpg', description: 'Blend português encorpado, taninos macios e final persistente.' },
    { slug: 'chianti-rifugio-del-vescovo', name: 'Chianti Rifugio Del Vescovo', category: 'Tinto', price: 86.65, country: 'Itália', grape: 'Sangiovese', image: 'img/chianti-rifugio-del-vescovo.jpg', description: 'Sangiovese clássico da Toscana, acidez viva e notas de cereja.' },
    { slug: 'sierra-batuco-reserva-cabernet-sauvignon', name: 'Sierra Batuco Reserva Cabernet Sauvignon', category: 'Tinto', price: 42.87, country: 'Chile', grape: 'Cabernet Sauvignon', image: 'img/sierra-batuco-reserva-cabernet-sauvignon.jpg', description: 'Cabernet chileno estruturado, com notas de frutas negras e especiarias.' },
    { slug: 'sierra-batuco-reserva-pinot-noir', name: 'Sierra Batuco Reserva Pinot Noir', category: 'Tinto', price: 42.87, country: 'Chile', grape: 'Pinot Noir', image: 'img/sierra-batuco-reserva-pinot-noir.jpg', description: 'Pinot Noir leve e aromático, ótimo com pratos delicados.' },
    { slug: 'sutter-home', name: 'Sutter Home', category: 'Tinto', price: 89.09, country: 'EUA', grape: 'Cabernet Sauvignon', image: 'img/sutter-home.jpg', description: 'Cabernet californiano macio, fácil de beber, frutado.' },
    { slug: 'porta-6', name: 'Porta 6', category: 'Tinto', price: 57.1, country: 'Portugal', grape: 'Blend', image: 'img/porta-6.jpg', description: 'Blend português vibrante, um dos mais queridos do Brasil.' },
    { slug: 'stormhoek-pinotage', name: 'Stormhoek Pinotage', category: 'Tinto', price: 60.86, country: 'África do Sul', grape: 'Pinotage', image: 'img/stormhoek-pinotage.jpg', description: 'Pinotage sul-africano defumado, com toque de frutas vermelhas maduras.' },
    { slug: 'mythic-cellars-mountain-petit-verdot', name: 'Mythic Cellars - Mountain - Petit Verdot', category: 'Tinto', price: 93.17, country: 'Argentina', grape: 'Petit Verdot', image: 'img/mythic-cellars-mountain-petit-verdot.jpg', description: 'Petit Verdot argentino intenso, taninos firmes e boa guarda.' },
    { slug: 'chateau-bel-enclos', name: 'Château Bel Enclos', category: 'Tinto', price: 59.63, country: 'França', grape: 'Blend', image: 'img/chateau-bel-enclos.jpg', description: 'Bordeaux clássico, elegante e equilibrado.' },
    { slug: 'chateau-jamin-bourdeaux', name: 'Château Jamin Bourdeaux', category: 'Tinto', price: 58.74, country: 'França', grape: 'Blend', image: 'img/chateau-jamin-bourdeaux.jpg', description: 'Bordeaux acessível, macio e frutado.' },
    { slug: 'ca-montebello-barbera', name: 'Cà Montebello BARBERA', category: 'Tinto', price: 87.03, country: 'Itália', grape: 'Barbera', image: 'img/ca-montebello-barbera.jpg', description: 'Barbera italiana de acidez marcante, ótima com massas.' },
    { slug: 'intimista', name: 'Intimista', category: 'Tinto', price: 39.27, country: 'Portugal', grape: 'Blend', image: 'img/intimista.jpg', description: 'Blend português leve e frutado, para o dia a dia.' },
    { slug: 'lomas-del-marques-tempranillo', name: 'Lomas Del Marques Tempranillo', category: 'Tinto', price: 51.37, country: 'Espanhas', grape: 'Tempranillo', image: 'img/lomas-del-marques-tempranillo.jpg', description: 'Tempranillo espanhol redondo, com notas de baunilha.' },
    { slug: 'montana-de-chile-classic-merlot', name: 'Montaña De Chile Classic Merlot', category: 'Tinto', price: 44.1, country: 'Chile', grape: 'Merlot', image: 'img/montana-de-chile-classic-merlot.jpg', description: 'Merlot chileno macio e frutado, fácil de harmonizar.' },
    { slug: 'mr-rabbit-tinto-cabernet-sauvignon', name: "Mr. Rabbit Tinto Pays D'OC IGP Cabernet Sauvignon", category: 'Tinto', price: 69.02, country: 'França', grape: 'Cabernet Sauvignon', image: 'img/mr-rabbit-tinto-cabernet-sauvignon.jpg', description: 'Cabernet francês moderno e frutado, rótulo divertido.' },
    { slug: 'rosso-toscana-igt-rifugio-del-vescovo', name: 'Rosso Toscana Igt Rifugio Del Vescovo', category: 'Tinto', price: 95.65, country: 'Itália', grape: 'Blend', image: 'img/rosso-toscana-igt-rifugio-del-vescovo.jpg', description: 'Blend toscano encorpado, ótimo com carnes vermelhas.' },
    { slug: 'miolo-single-vineyard-cabernet-franc', name: 'Miolo Single Vineyard Cabernet Franc', category: 'Tinto', price: 77.43, country: 'Brasil', grape: 'Cabernet Franc', image: 'img/miolo-single-vineyard-cabernet-franc.jpg', description: 'Cabernet Franc brasileiro de vinhedo único, herbáceo e elegante.' },
    { slug: 'namaqua-merlot', name: 'Namaqua - Merlot', category: 'Tinto', price: 61.79, country: 'África do Sul', grape: 'Merlot', image: 'img/namaqua-merlot.jpg', description: 'Merlot sul-africano macio, frutas vermelhas maduras.' },
    { slug: 'single-vineyard-pinot-noir', name: 'SINGLE VINEYARD Pinot Noir', category: 'Tinto', price: 67.17, country: 'Brasil', grape: 'Pinot Noir', image: 'img/single-vineyard-pinot-noir.jpg', description: 'Pinot Noir brasileiro de vinhedo único, leve e aromático.' },
    { slug: 'vezzani-nero-di-troia', name: 'Vezzani Nero di Troia', category: 'Tinto', price: 91.71, country: 'Itália', grape: 'Nero Di Troia', image: 'img/vezzani-nero-di-troia.jpg', description: 'Nero di Troia apuliano rústico, taninos presentes e boa acidez.' }
  ];

  const CATEGORIES = [...new Set(MENU.map((w) => w.category))];

  function findBySlug(slug) {
    return MENU.find((w) => w.slug === slug);
  }

  function suggestPairings(slug, count) {
    const target = findBySlug(slug);
    if (!target) return [];
    const others = MENU.filter((w) => w.slug !== slug);
    const scored = others.map((w) => {
      let score = 0;
      if (w.country === target.country) score += 2;
      if (w.grape === target.grape) score += 1;
      return { wine: w, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, count).map((s) => s.wine);
  }

  return { MENU, CATEGORIES, findBySlug, suggestPairings };
});
