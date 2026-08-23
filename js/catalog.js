// js/catalog.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Catalog = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const MENU = [
    { slug: '3-autores', name: '3 Autores', category: 'Tinto', price: 57.64, country: 'Portugal', grape: 'Blend', image: 'img/3-autores.jpg', description: 'Blend de Portugal, encorpado e envolvente.' },
    { slug: 'adega-grande-rose', name: 'Adega Grande Rosé', category: 'Rosé', price: 45.35, country: 'Portugal', grape: 'Blend', image: 'img/adega-grande-rose.jpg', description: 'Blend rosé de Portugal, ótimo para dias quentes.' },
    { slug: 'amo-te-tinto', name: 'Amo-te tinto', category: 'Tinto', price: 60.65, country: 'Portugal', grape: 'Blend', image: 'img/amo-te-tinto.jpg', description: 'Blend de Portugal, ótimo para acompanhar a refeição.' },
    { slug: 'ancelotta-giaretta', name: 'Ancelotta Giaretta', category: 'Tinto', price: 38.4, country: 'Brasil', grape: 'Ancellotta', image: 'img/ancelotta-giaretta.jpg', description: 'Ancellotta do Brasil, encorpado e envolvente.' },
    { slug: 'arinarmoa-giaretta', name: 'Arinarmoa Giaretta', category: 'Tinto', price: 67.1, country: 'Brasil', grape: 'Arinarnoa', image: 'img/arinarmoa-giaretta.jpg', description: 'Tinto de Arinarnoa, produzido no Brasil, boa estrutura e final agradável.' },
    { slug: 'artola', name: 'Artola', category: 'Tinto', price: 43.25, country: 'Portugal', grape: 'Blend', image: 'img/artola.jpg', description: 'Blend de Portugal, ótimo para acompanhar a refeição.' },
    { slug: 'artolas-branco', name: 'Artolas Branco', category: 'Branco', price: 41.16, country: 'Portugal', grape: 'Blend', image: 'img/artolas-branco.jpg', description: 'Branco de Blend, fresco e leve, de Portugal.' },
    { slug: 'baron-philippe-de-rothschild-reserva-especial-merlot', name: 'Baron Philippe de Rothschild Reserva Especial Merlot', category: 'Tinto', price: 65.55, country: 'França', grape: 'Merlot', image: 'img/baron-philippe-de-rothschild-reserva-especial-merlot.jpg', description: 'Tinto de Merlot, produzido na França, boa estrutura e final agradável.' },
    { slug: 'bianco-toscana-igt-rifugio-del-vescovo', name: 'Bianco Toscana Igt Rifugio Del Vescovo', category: 'Branco', price: 95.65, country: 'Itália', grape: 'Blend', image: 'img/bianco-toscana-igt-rifugio-del-vescovo.jpg', description: 'Branco leve de Blend, produzido na Itália.' },
    { slug: 'boa-noite-lisboa', name: 'Boa Noite Lisboa', category: 'Tinto', price: 55.35, country: 'Portugal', grape: 'Blend', image: 'img/boa-noite-lisboa.jpg', description: 'Blend de Portugal, encorpado e envolvente.' },
    { slug: 'bodega-torrontes', name: 'Bodega Torrontés', category: 'Branco', price: 56.88, country: 'Argentina', grape: 'Torrontés', image: 'img/bodega-torrontes.jpg', description: 'Torrontés branco da Argentina, ideal para petiscos e frutos do mar.' },
    { slug: 'bridao-merlot', name: 'Bridão Merlot', category: 'Tinto', price: 103.56, country: 'Imperial', grape: 'Merlot', image: 'img/bridao-merlot.jpg', description: 'Merlot de Imperial, ótimo para acompanhar a refeição.' },
    { slug: 'buenardo-malbec-vinho-organico', name: 'Buenardo Malbec Vinho Orgânico', category: 'Tinto', price: 75.3, country: 'Argentina', grape: 'Malbec', image: 'img/buenardo-malbec-vinho-organico.jpg', description: 'Malbec da Argentina, encorpado e envolvente.' },
    { slug: 'ca-montebello-barbera', name: 'Cà Montebello BARBERA', category: 'Tinto', price: 87.03, country: 'Itália', grape: 'Barbera', image: 'img/ca-montebello-barbera.jpg', description: 'Tinto de Barbera, produzido na Itália, boa estrutura e final agradável.' },
    { slug: 'ca-montebello-pinot-nero', name: 'Cà Montebello Pinot Nero', category: 'Tinto', price: 80.24, country: 'Itália', grape: 'Pinot Noir', image: 'img/ca-montebello-pinot-nero.jpg', description: 'Pinot Noir da Itália, ótimo para acompanhar a refeição.' },
    { slug: 'calvet-varietals-merlot', name: 'Calvet Varietals Merlot', category: 'Tinto', price: 68.71, country: 'França', grape: 'Merlot', image: 'img/calvet-varietals-merlot.jpg', description: 'Merlot da França, encorpado e envolvente.' },
    { slug: 'castas-diferenciadas-cabernet-franc', name: 'Castas Diferenciadas Cabernet Franc', category: 'Tinto', price: 66.08, country: 'Brasil', grape: 'Cabernet Franc', image: 'img/castas-diferenciadas-cabernet-franc.jpg', description: 'Tinto de Cabernet Franc, produzido no Brasil, boa estrutura e final agradável.' },
    { slug: 'castas-diferenciadas-gewurztraminer', name: 'Castas Diferenciadas Gewurztraminer', category: 'Branco', price: 50.22, country: 'Brasil', grape: 'Gewurztraminer', image: 'img/castas-diferenciadas-gewurztraminer.jpg', description: 'Branco leve de Gewurztraminer, produzido no Brasil.' },
    { slug: 'cavic-malbec', name: 'Cavic Malbec', category: 'Tinto', price: 47.7, country: 'Argentina', grape: 'Malbec', image: 'img/cavic-malbec.jpg', description: 'Malbec da Argentina, encorpado e envolvente.' },
    { slug: 'chardonnay-giaretta', name: 'Chardonnay Giaretta', category: 'Branco', price: 40.07, country: 'Brasil', grape: 'Chardonnay', image: 'img/chardonnay-giaretta.jpg', description: 'Chardonnay branco do Brasil, ideal para petiscos e frutos do mar.' },
    { slug: 'chateau-bel-enclos', name: 'Château Bel Enclos', category: 'Tinto', price: 59.63, country: 'França', grape: 'Blend', image: 'img/chateau-bel-enclos.jpg', description: 'Blend da França, ótimo para acompanhar a refeição.' },
    { slug: 'chateau-jamin-bourdeaux', name: 'Château Jamin Bourdeaux', category: 'Tinto', price: 58.74, country: 'França', grape: 'Blend', image: 'img/chateau-jamin-bourdeaux.jpg', description: 'Blend da França, encorpado e envolvente.' },
    { slug: 'chateau-maine-d-arman-cotes-de-bourg-aoc', name: 'Château Maine D\'Arman - Côtes de Bourg AOC', category: 'Tinto', price: 123.35, country: 'França', grape: 'Blend', image: 'img/chateau-maine-d-arman-cotes-de-bourg-aoc.jpg', description: 'Tinto de Blend, produzido na França, boa estrutura e final agradável.' },
    { slug: 'chavarri-larchago-rioja-doca', name: 'Chavarri - Larchago - Rioja DOCa', category: 'Tinto', price: 113.86, country: 'Espanha', grape: 'Tempranillo', image: 'img/chavarri-larchago-rioja-doca.jpg', description: 'Tempranillo da Espanha, ótimo para acompanhar a refeição.' },
    { slug: 'chianti-rifugio-del-vescovo', name: 'Chianti Rifugio Del Vescovo', category: 'Tinto', price: 86.65, country: 'Itália', grape: 'Sangiovese', image: 'img/chianti-rifugio-del-vescovo.jpg', description: 'Sangiovese da Itália, encorpado e envolvente.' },
    { slug: 'coragem-reserva', name: 'Coragem Reserva', category: 'Tinto', price: 74.25, country: 'Portugal', grape: 'Blend', image: 'img/coragem-reserva.jpg', description: 'Tinto de Blend, produzido em Portugal, boa estrutura e final agradável.' },
    { slug: 'coragem-tinto', name: 'Coragem Tinto', category: 'Tinto', price: 44.45, country: 'Portugal', grape: 'Blend', image: 'img/coragem-tinto.jpg', description: 'Blend de Portugal, ótimo para acompanhar a refeição.' },
    { slug: 'corinto-carmenere-2021', name: 'Corinto Carmenere – 2021', category: 'Tinto', price: 53.06, country: 'Chile', grape: 'Carménère', image: 'img/corinto-carmenere-2021.jpg', description: 'Carménère do Chile, encorpado e envolvente.' },
    { slug: 'corinto-reserva-cabernet-sauvignon-2018', name: 'Corinto Reserva Cabernet Sauvignon – 2018', category: 'Tinto', price: 58.93, country: 'Chile', grape: 'Cabernet Sauvignon', image: 'img/corinto-reserva-cabernet-sauvignon-2018.jpg', description: 'Tinto de Cabernet Sauvignon, produzido no Chile, boa estrutura e final agradável.' },
    { slug: 'da-pipa-frisante-rose', name: 'Da Pipa Frisante Rosé', category: 'Rosé', price: 33.93, country: 'Portugal', grape: 'Blend', image: 'img/da-pipa-frisante-rose.jpg', description: 'Rosé de Blend, leve e refrescante, de Portugal.' },
    { slug: 'dedicato-blanc-de-blancs-brut', name: 'Dedicato Blanc de Blancs Brut', category: 'Espumante', price: 63.16, country: 'Itália', grape: 'Blend', image: 'img/dedicato-blanc-de-blancs-brut.jpg', description: 'Espumante de Blend, borbulhas finas, perfeito para brindar.' },
    { slug: 'deinhard-green-label-riesling', name: 'Deinhard Green Label Riesling', category: 'Branco', price: 83.35, country: 'Alemanha', grape: 'Riesling', image: 'img/deinhard-green-label-riesling.jpg', description: 'Riesling branco da Alemanha, ideal para petiscos e frutos do mar.' },
    { slug: 'dufouleur-monopole-rose', name: 'Dufouleur Monopole Rosé', category: 'Rosé', price: 58.85, country: 'França', grape: 'Blend', image: 'img/dufouleur-monopole-rose.jpg', description: 'Rosé de Blend, leve e refrescante, da França.' },
    { slug: 'emersao-merlot', name: 'Emersão - Merlot', category: 'Tinto', price: 113.79, country: 'Brasil', grape: 'Merlot', image: 'img/emersao-merlot.jpg', description: 'Merlot do Brasil, encorpado e envolvente.' },
    { slug: 'emersao-syrah', name: 'Emersão - Syrah', category: 'Tinto', price: 129.54, country: 'Brasil', grape: 'Syrah', image: 'img/emersao-syrah.jpg', description: 'Tinto de Syrah, produzido no Brasil, boa estrutura e final agradável.' },
    { slug: 'emersao-blend', name: 'Emersão Blend', category: 'Tinto', price: 129.94, country: 'Brasil', grape: 'Blend', image: 'img/emersao-blend.jpg', description: 'Blend do Brasil, ótimo para acompanhar a refeição.' },
    { slug: 'excelso-reserva-cabernet-sauvignon', name: 'Excelso Reserva Cabernet Sauvignon', category: 'Tinto', price: 83.55, country: 'Chile', grape: 'Cabernet Sauvignon', image: 'img/excelso-reserva-cabernet-sauvignon.jpg', description: 'Cabernet Sauvignon do Chile, encorpado e envolvente.' },
    { slug: 'fincas-privada-bornarda', name: 'Fincas Privada Bornarda', category: 'Tinto', price: 49.93, country: 'Argentina', grape: 'Bonarda', image: 'img/fincas-privada-bornarda.jpg', description: 'Tinto de Bonarda, produzido na Argentina, boa estrutura e final agradável.' },
    { slug: 'flor-de-lisboa-tinto', name: 'Flor de Lisboa Tinto', category: 'Tinto', price: 37.4, country: 'Portugal', grape: 'Blend', image: 'img/flor-de-lisboa-tinto.jpg', description: 'Blend de Portugal, ótimo para acompanhar a refeição.' },
    { slug: 'flor-d-penalva', name: 'Flor D\'Penalva', category: 'Tinto', price: 71.97, country: 'Portugal', grape: 'Blend', image: 'img/flor-d-penalva.jpg', description: 'Blend de Portugal, encorpado e envolvente.' },
    { slug: 'fonte-da-perdiz-branco-d-o-c', name: 'Fonte da Perdiz Branco D.O.C.', category: 'Tinto', price: 50.79, country: 'Portugal', grape: 'Blend', image: 'img/fonte-da-perdiz-branco-d-o-c.jpg', description: 'Tinto de Blend, produzido em Portugal, boa estrutura e final agradável.' },
    { slug: 'frisante-almaden-moscatel-rose', name: 'Frisante Almadén Moscatel Rosé', category: 'Rosé', price: 31.01, country: 'Brasil', grape: 'Moscatel', image: 'img/frisante-almaden-moscatel-rose.jpg', description: 'Moscatel rosé do Brasil, ótimo para dias quentes.' },
    { slug: 'gretus-tempranillo', name: 'Gretus Tempranillo', category: 'Tinto', price: 48.59, country: 'Espanha', grape: 'Tempranillo', image: 'img/gretus-tempranillo.jpg', description: 'Tempranillo da Espanha, encorpado e envolvente.' },
    { slug: 'herdade-do-gamito-tinto-alicante-bouschet', name: 'Herdade do Gamito tinto Alicante Bouschet', category: 'Tinto', price: 96.97, country: 'Portugal', grape: 'Alicante Bouschet', image: 'img/herdade-do-gamito-tinto-alicante-bouschet.jpg', description: 'Tinto de Alicante Bouschet, produzido em Portugal, boa estrutura e final agradável.' },
    { slug: 'herdade-grande-origens', name: 'Herdade Grande Origens', category: 'Tinto', price: 57.82, country: 'Portugal', grape: 'Não informado', image: 'img/herdade-grande-origens.jpg', description: 'uva selecionada de Portugal, ótimo para acompanhar a refeição.' },
    { slug: 'iciottoli-cabernet-sauvignon', name: 'Iciottoli Cabernet Sauvignon', category: 'Tinto', price: 92.91, country: 'Itália', grape: 'Cabernet Sauvignon', image: 'img/iciottoli-cabernet-sauvignon.jpg', description: 'Cabernet Sauvignon da Itália, encorpado e envolvente.' },
    { slug: 'intimista', name: 'Intimista', category: 'Tinto', price: 39.27, country: 'Portugal', grape: 'Blend', image: 'img/intimista.jpg', description: 'Tinto de Blend, produzido em Portugal, boa estrutura e final agradável.' },
    { slug: 'ique-vegano', name: 'Ique Vegano', category: 'Branco', price: 50.98, country: 'Argentina', grape: 'Malbec', image: 'img/ique-vegano.jpg', description: 'Branco leve de Malbec, produzido na Argentina.' },
    { slug: 'isla-negra-cabernet-sauvignon', name: 'Isla Negra Cabernet Sauvignon', category: 'Tinto', price: 34.99, country: 'Chile', grape: 'Cabernet Sauvignon', image: 'img/isla-negra-cabernet-sauvignon.jpg', description: 'Cabernet Sauvignon do Chile, encorpado e envolvente.' },
    { slug: 'isla-negra-merlot', name: 'Isla Negra Merlot', category: 'Tinto', price: 34.99, country: 'Chile', grape: 'Merlot', image: 'img/isla-negra-merlot.jpg', description: 'Tinto de Merlot, produzido no Chile, boa estrutura e final agradável.' },
    { slug: 'julia-florista-reserva', name: 'Júlia Florista Reserva', category: 'Tinto', price: 59.86, country: 'Portugal', grape: 'Blend', image: 'img/julia-florista-reserva.jpg', description: 'Blend de Portugal, ótimo para acompanhar a refeição.' },
    { slug: 'la-barbacoa-garnacha', name: 'La Barbacoa Garnacha', category: 'Tinto', price: 63.92, country: 'Espanha', grape: 'Garnacha', image: 'img/la-barbacoa-garnacha.jpg', description: 'Garnacha da Espanha, encorpado e envolvente.' },
    { slug: 'la-treille-de-candale', name: 'La Treille De Candale', category: 'Tinto', price: 57.59, country: 'França', grape: 'Blend', image: 'img/la-treille-de-candale.jpg', description: 'Tinto de Blend, produzido na França, boa estrutura e final agradável.' },
    { slug: 'lacase-carmenere', name: 'Lacase Carménére', category: 'Tinto', price: 49.76, country: 'França', grape: 'Carménère', image: 'img/lacase-carmenere.jpg', description: 'Carménère da França, ótimo para acompanhar a refeição.' },
    { slug: 'lambrusco-d-emilia-amabile-bco-suave', name: 'Lambrusco D\'Emilia – Amabile - Bco Suave', category: 'Branco', price: 42.42, country: 'Itália', grape: 'Lambrusco', image: 'img/lambrusco-d-emilia-amabile-bco-suave.jpg', description: 'Branco de Lambrusco, fresco e leve, da Itália.' },
    { slug: 'lambrusco-d-emilia-amabile-tinto-suave', name: 'Lambrusco D\'Emilia – Amabile - Tinto  Suave', category: 'Tinto', price: 42.42, country: 'Itália', grape: 'Lambrusco', image: 'img/lambrusco-d-emilia-amabile-tinto-suave.jpg', description: 'Tinto de Lambrusco, produzido na Itália, boa estrutura e final agradável.' },
    { slug: 'late-harverst-miolo', name: 'Late Harverst Miolo', category: 'Sobremesa', price: 62.1, country: 'Brasil', grape: 'Blend', image: 'img/late-harverst-miolo.jpg', description: 'Vinho de sobremesa Blend, doce e aromático, do Brasil.' },
    { slug: 'lomas-del-marques-tempranillo', name: 'Lomas Del Marques Tempranillo', category: 'Tinto', price: 51.37, country: 'Espanha', grape: 'Tempranillo', image: 'img/lomas-del-marques-tempranillo.jpg', description: 'Tempranillo da Espanha, encorpado e envolvente.' },
    { slug: 'marselan-giaretta', name: 'Marselan Giaretta', category: 'Tinto', price: 51.76, country: 'Brasil', grape: 'Marselan', image: 'img/marselan-giaretta.jpg', description: 'Tinto de Marselan, produzido no Brasil, boa estrutura e final agradável.' },
    { slug: 'martha-s-moscatel-do-douro', name: 'Martha\'s MOSCATEL do DOURO', category: 'Tinto', price: 70.8, country: 'Portugal', grape: 'Moscatel', image: 'img/martha-s-moscatel-do-douro.jpg', description: 'Moscatel de Portugal, ótimo para acompanhar a refeição.' },
    { slug: 'merlot-giaretta', name: 'Merlot Giaretta', category: 'Tinto', price: 36.44, country: 'Brasil', grape: 'Merlot', image: 'img/merlot-giaretta.jpg', description: 'Merlot do Brasil, encorpado e envolvente.' },
    { slug: 'miolo-selecao-pinot-grigio-riesling', name: 'Miolo Seleção Pinot Grigio & Riesling', category: 'Branco', price: 35.99, country: 'Brasil', grape: 'Pinot Grigio / Riesling', image: 'img/miolo-selecao-pinot-grigio-riesling.jpg', description: 'Pinot Grigio / Riesling branco do Brasil, ideal para petiscos e frutos do mar.' },
    { slug: 'single-vineyard-cabernet-franc', name: 'Single Vineyard Cabernet Franc', category: 'Tinto', price: 77.42, country: 'Brasil', grape: 'Cabernet Franc', image: 'img/single-vineyard-cabernet-franc.jpg', description: 'Cabernet Franc do Brasil, ótimo para acompanhar a refeição.' },
    { slug: 'mon-basset-classique-aoc', name: 'Mon Basset Classique Aoc', category: 'Tinto', price: 75.48, country: 'França', grape: 'Blend', image: 'img/mon-basset-classique-aoc.jpg', description: 'Blend da França, encorpado e envolvente.' },
    { slug: 'mon-bouquet-de-provence', name: 'Mon Bouquet de Provence', category: 'Rosé', price: 78.5, country: 'França', grape: 'Blend', image: 'img/mon-bouquet-de-provence.jpg', description: 'Blend rosé da França, ótimo para dias quentes.' },
    { slug: 'montana-de-chile-classic-cabernet-sauvignon', name: 'Montaña De Chile Classic Cabernet Sauvignon', category: 'Tinto', price: 44.1, country: 'Argentina', grape: 'Cabernet Sauvignon', image: 'img/montana-de-chile-classic-cabernet-sauvignon.jpg', description: 'Tinto de Cabernet Sauvignon, produzido na Argentina, boa estrutura e final agradável.' },
    { slug: 'montana-de-chile-classic-chardonnay', name: 'Montaña De Chile Classic Chardonnay', category: 'Branco', price: 44.1, country: 'Argentina', grape: 'Chardonnay', image: 'img/montana-de-chile-classic-chardonnay.jpg', description: 'Branco leve de Chardonnay, produzido na Argentina.' },
    { slug: 'montana-de-chile-classic-merlot', name: 'Montaña De Chile Classic Merlot', category: 'Tinto', price: 44.1, country: 'Argentina', grape: 'Merlot', image: 'img/montana-de-chile-classic-merlot.jpg', description: 'Merlot da Argentina, encorpado e envolvente.' },
    { slug: 'moscato-giaretta', name: 'Moscato Giaretta', category: 'Branco', price: 36.54, country: 'Brasil', grape: 'Moscatel', image: 'img/moscato-giaretta.jpg', description: 'Moscatel branco do Brasil, ideal para petiscos e frutos do mar.' },
    { slug: 'mr-rabbit-pinot-noir', name: 'Mr. Rabbit Pinot Noir', category: 'Tinto', price: 78.3, country: 'França', grape: 'Pinot Noir', image: 'img/mr-rabbit-pinot-noir.jpg', description: 'Pinot Noir da França, ótimo para acompanhar a refeição.' },
    { slug: 'mr-rabbit-tinto-pays-d-oc-igp-cabernet-sauvignon', name: 'Mr. Rabbit Tinto Pays D’OC IGP Cabernet Sauvignon', category: 'Tinto', price: 69.02, country: 'França', grape: 'Cabernet Sauvignon', image: 'img/mr-rabbit-tinto-pays-d-oc-igp-cabernet-sauvignon.jpg', description: 'Cabernet Sauvignon da França, encorpado e envolvente.' },
    { slug: 'mr-rabbit-tinto-pays-d-oc-igp-syrah', name: 'Mr. Rabbit Tinto Pays D’OC IGP Syrah', category: 'Tinto', price: 69.49, country: 'França', grape: 'Syrah', image: 'img/mr-rabbit-tinto-pays-d-oc-igp-syrah.jpg', description: 'Tinto de Syrah, produzido na França, boa estrutura e final agradável.' },
    { slug: 'mythic-cellars-mountain-petit-verdot', name: 'Mythic Cellars - Mountain - Petit Verdot', category: 'Tinto', price: 93.16, country: 'Argentina', grape: 'Petit Verdot', image: 'img/mythic-cellars-mountain-petit-verdot.jpg', description: 'Petit Verdot da Argentina, ótimo para acompanhar a refeição.' },
    { slug: 'namaqua-merlot', name: 'Namaqua - Merlot', category: 'Tinto', price: 61.79, country: 'África do Sul', grape: 'Merlot', image: 'img/namaqua-merlot.jpg', description: 'Merlot da África do Sul, encorpado e envolvente.' },
    { slug: 'navalheiro-regional-trasmontano', name: 'Navalheiro Regional Trasmontano', category: 'Tinto', price: 59.72, country: 'Portugal', grape: 'Blend', image: 'img/navalheiro-regional-trasmontano.jpg', description: 'Tinto de Blend, produzido em Portugal, boa estrutura e final agradável.' },
    { slug: 'new-roads-blend', name: 'New Roads Blend', category: 'Tinto', price: 33.31, country: 'Argentina', grape: 'Blend', image: 'img/new-roads-blend.jpg', description: 'Blend da Argentina, ótimo para acompanhar a refeição.' },
    { slug: 'no-branding-no-cry', name: 'No Branding No cry', category: 'Tinto', price: 71.75, country: 'Portugal', grape: 'Blend', image: 'img/no-branding-no-cry.jpg', description: 'Blend de Portugal, encorpado e envolvente.' },
    { slug: 'nobili-d-italia-montepulciano-d-abruzzo', name: 'Nobili D\'Italia Montepulciano D\' Abruzzo', category: 'Branco', price: 67.62, country: 'Itália', grape: 'Montepulciano', image: 'img/nobili-d-italia-montepulciano-d-abruzzo.jpg', description: 'Montepulciano branco da Itália, ideal para petiscos e frutos do mar.' },
    { slug: 'nobili-d-italia-trebbiano-d-abruzzo', name: 'Nobili D\'italia Trebbiano D\' Abruzzo', category: 'Branco', price: 65.63, country: 'Itália', grape: 'Trebbiano', image: 'img/nobili-d-italia-trebbiano-d-abruzzo.jpg', description: 'Branco leve de Trebbiano, produzido na Itália.' },
    { slug: 'paso-de-los-andes-reserva-pinot-noir', name: 'Paso de Los Andes Reserva Pinot Noir', category: 'Tinto', price: 51.8, country: 'Chile', grape: 'Pinot Noir', image: 'img/paso-de-los-andes-reserva-pinot-noir.jpg', description: 'Pinot Noir do Chile, encorpado e envolvente.' },
    { slug: 'pao-de-los-andes-cabernet-sauvignon', name: 'Pao de Los Andes Cabernet Sauvignon', category: 'Tinto', price: 58.87, country: 'Chile', grape: 'Cabernet Sauvignon', image: 'img/pao-de-los-andes-cabernet-sauvignon.jpg', description: 'Tinto de Cabernet Sauvignon, produzido no Chile, boa estrutura e final agradável.' },
    { slug: 'passo-de-los-andes-carmenere', name: 'Passo de Los Andes Carménère', category: 'Tinto', price: 58.87, country: 'Chile', grape: 'Carménère', image: 'img/passo-de-los-andes-carmenere.jpg', description: 'Carménère do Chile, ótimo para acompanhar a refeição.' },
    { slug: 'passaro-da-lua-blend', name: 'Pássaro da Lua Blend', category: 'Tinto', price: 159.5, country: 'Brasil', grape: 'Blend', image: 'img/passaro-da-lua-blend.jpg', description: 'Blend do Brasil, encorpado e envolvente.' },
    { slug: 'passaro-da-lua-tannat', name: 'Pássaro da Lua Tannat', category: 'Tinto', price: 159.5, country: 'Brasil', grape: 'Tannat', image: 'img/passaro-da-lua-tannat.jpg', description: 'Tinto de Tannat, produzido no Brasil, boa estrutura e final agradável.' },
    { slug: 'passo-de-los-andes-moskato', name: 'Passo de Los Andes Moskato', category: 'Tinto', price: 36.8, country: 'Chile', grape: 'Moscatel', image: 'img/passo-de-los-andes-moskato.jpg', description: 'Moscatel do Chile, ótimo para acompanhar a refeição.' },
    { slug: 'pescada-blend-verde', name: 'Pescada Blend Verde', category: 'Branco', price: 83.77, country: 'Portugal', grape: 'Blend', image: 'img/pescada-blend-verde.jpg', description: 'Branco de Blend, fresco e leve, de Portugal.' },
    { slug: 'plexus-espumante-branco', name: 'Plexus Espumante Branco', category: 'Branco', price: 43.93, country: 'Portugal', grape: 'Blend', image: 'img/plexus-espumante-branco.jpg', description: 'Blend branco de Portugal, ideal para petiscos e frutos do mar.' },
    { slug: 'plexus-espumante-rose', name: 'Plexus Espumante Rosé', category: 'Rosé', price: 43.93, country: 'Portugal', grape: 'Blend', image: 'img/plexus-espumante-rose.jpg', description: 'Rosé de Blend, leve e refrescante, de Portugal.' },
    { slug: 'pode-ser', name: 'Pode Ser', category: 'Tinto', price: 50.87, country: 'Portugal', grape: 'Blend', image: 'img/pode-ser.jpg', description: 'Blend de Portugal, encorpado e envolvente.' },
    { slug: 'porta-6', name: 'Porta 6', category: 'Tinto', price: 57.1, country: 'Portugal', grape: 'Blend', image: 'img/porta-6.jpg', description: 'Tinto de Blend, produzido em Portugal, boa estrutura e final agradável.' },
    { slug: 'porta-6-reserva', name: 'Porta 6 Reserva', category: 'Tinto', price: 86.42, country: 'Portugal', grape: 'Blend', image: 'img/porta-6-reserva.jpg', description: 'Blend de Portugal, ótimo para acompanhar a refeição.' },
    { slug: 'profugo-malbec', name: 'Profugo Malbec', category: 'Tinto', price: 50.98, country: 'Argentina', grape: 'Malbec', image: 'img/profugo-malbec.jpg', description: 'Tinto de Malbec, produzido na Argentina, boa estrutura e final agradável.' },
    { slug: 'profugo-sauvignon-blanc', name: 'Profugo Sauvignon Blanc', category: 'Branco', price: 50.98, country: 'Argentina', grape: 'Sauvignon Blanc', image: 'img/profugo-sauvignon-blanc.jpg', description: 'Sauvignon Blanc branco da Argentina, ideal para petiscos e frutos do mar.' },
    { slug: 'rola-colheita', name: 'Rola Colheita', category: 'Tinto', price: 122.08, country: 'Portugal', grape: 'Blend', image: 'img/rola-colheita.jpg', description: 'Blend de Portugal, ótimo para acompanhar a refeição.' },
    { slug: 'rosso-toscana-igt-rifugio-del-vescovo', name: 'Rosso Toscana Igt Rifugio Del Vescovo', category: 'Tinto', price: 95.65, country: 'Itália', grape: 'Blend', image: 'img/rosso-toscana-igt-rifugio-del-vescovo.jpg', description: 'Blend da Itália, encorpado e envolvente.' },
    { slug: 'sierra-batuco-reserva-cabernet-sauvignon', name: 'Sierra Batuco Reserva Cabernet Sauvignon', category: 'Tinto', price: 57.87, country: 'Chile', grape: 'Cabernet Sauvignon', image: 'img/sierra-batuco-reserva-cabernet-sauvignon.jpg', description: 'Tinto de Cabernet Sauvignon, produzido no Chile, boa estrutura e final agradável.' },
    { slug: 'sierra-batuco-reserva-pinot-noir', name: 'Sierra Batuco Reserva Pinot Noir', category: 'Tinto', price: 57.87, country: 'Chile', grape: 'Pinot Noir', image: 'img/sierra-batuco-reserva-pinot-noir.jpg', description: 'Pinot Noir do Chile, ótimo para acompanhar a refeição.' },
    { slug: 'single-vineyard-pinot-noir', name: 'Single Vineyard Pinot Noir', category: 'Tinto', price: 67.17, country: 'Brasil', grape: 'Pinot Noir', image: 'img/single-vineyard-pinot-noir.jpg', description: 'Pinot Noir do Brasil, encorpado e envolvente.' },
    { slug: 'single-vineyard-touriga-nacional', name: 'Single Vineyard Touriga Nacional', category: 'Tinto', price: 67.17, country: 'Brasil', grape: 'Touriga Nacional', image: 'img/single-vineyard-touriga-nacional.jpg', description: 'Tinto de Touriga Nacional, produzido no Brasil, boa estrutura e final agradável.' },
    { slug: 'stormhoek-pinotage', name: 'Stormhoek Pinotage', category: 'Tinto', price: 60.86, country: 'África do Sul', grape: 'Pinotage', image: 'img/stormhoek-pinotage.jpg', description: 'Pinotage da África do Sul, ótimo para acompanhar a refeição.' },
    { slug: 'sutter-home', name: 'Sutter Home', category: 'Tinto', price: 89.09, country: 'EUA', grape: 'Cabernet Sauvignon', image: 'img/sutter-home.jpg', description: 'Cabernet Sauvignon dos EUA, encorpado e envolvente.' },
    { slug: 'tannat-giaretta', name: 'Tannat Giaretta', category: 'Tinto', price: 57.74, country: 'Brasil', grape: 'Tannat', image: 'img/tannat-giaretta.jpg', description: 'Tinto de Tannat, produzido no Brasil, boa estrutura e final agradável.' },
    { slug: 'terramater-vineyard-pinot-noir-reserve', name: 'Terramater Vineyard Pinot Noir Reserve', category: 'Tinto', price: 94.86, country: 'Chile', grape: 'Pinot Noir', image: 'img/terramater-vineyard-pinot-noir-reserve.jpg', description: 'Pinot Noir do Chile, ótimo para acompanhar a refeição.' },
    { slug: 'torre-romanica-primitivo', name: 'Torre Romanica Primitivo', category: 'Tinto', price: 69.41, country: 'Itália', grape: 'Primitivo', image: 'img/torre-romanica-primitivo.jpg', description: 'Primitivo da Itália, encorpado e envolvente.' },
    { slug: 'torre-romanica-sangiovese', name: 'Torre Romanica Sangiovese', category: 'Tinto', price: 51.48, country: 'Itália', grape: 'Sangiovese', image: 'img/torre-romanica-sangiovese.jpg', description: 'Tinto de Sangiovese, produzido na Itália, boa estrutura e final agradável.' },
    { slug: 'vezzani-montepulciano', name: 'Vezzani Montepulciano', category: 'Rosé', price: 91.32, country: 'Itália', grape: 'Montepulciano', image: 'img/vezzani-montepulciano.jpg', description: 'Rosé de Montepulciano, leve e refrescante, da Itália.' },
    { slug: 'vezzani-negroamaro-rosato', name: 'Vezzani Negroamaro Rosato', category: 'Rosé', price: 88.55, country: 'Itália', grape: 'Negroamaro', image: 'img/vezzani-negroamaro-rosato.jpg', description: 'Negroamaro rosé da Itália, ótimo para dias quentes.' },
    { slug: 'vezzani-nero-d-avola', name: 'Vezzani Nero D\'Avola', category: 'Tinto', price: 89.85, country: 'Itália', grape: 'Nero D\'Avola', image: 'img/vezzani-nero-d-avola.jpg', description: 'Tinto de Nero D\'Avola, produzido na Itália, boa estrutura e final agradável.' },
    { slug: 'vezzani-nero-di-troia', name: 'Vezzani Nero di Troia', category: 'Tinto', price: 91.71, country: 'Itália', grape: 'Nero Di Troia', image: 'img/vezzani-nero-di-troia.jpg', description: 'Nero Di Troia da Itália, ótimo para acompanhar a refeição.' },
    { slug: 'vezzani-trebbiano', name: 'Vezzani Trebbiano', category: 'Branco', price: 66.12, country: 'Itália', grape: 'Trebbiano', image: 'img/vezzani-trebbiano.jpg', description: 'Branco de Trebbiano, fresco e leve, da Itália.' },
    { slug: 'vinas-del-tango-cabernet-sauvignon', name: 'Viñas Del Tango Cabernet Sauvignon', category: 'Tinto', price: 59.36, country: 'Argentina', grape: 'Cabernet Sauvignon', image: 'img/vinas-del-tango-cabernet-sauvignon.jpg', description: 'Tinto de Cabernet Sauvignon, produzido na Argentina, boa estrutura e final agradável.' },
    { slug: 'vinas-del-tango-selection-cabernet-franc', name: 'Viñas Del Tango Selection Cabernet Franc', category: 'Tinto', price: 47.49, country: 'Argentina', grape: 'Cabernet Franc', image: 'img/vinas-del-tango-selection-cabernet-franc.jpg', description: 'Cabernet Franc da Argentina, ótimo para acompanhar a refeição.' },
    { slug: 'vinas-del-tango-selection-malbec', name: 'Viñas Del Tango Selection Malbec', category: 'Tinto', price: 49.9, country: 'Argentina', grape: 'Malbec', image: 'img/vinas-del-tango-selection-malbec.jpg', description: 'Malbec da Argentina, encorpado e envolvente.' },
    { slug: 'miolo-wild-ganmay', name: 'Miolo Wild Ganmay', category: 'Tinto', price: 62.94, country: 'Brasil', grape: 'Gamay', image: 'img/miolo-wild-ganmay.jpg', description: 'Tinto de Gamay, produzido no Brasil, boa estrutura e final agradável.' },
    { slug: 'winemaker-secret-branco', name: 'Winemaker Secret Branco', category: 'Branco', price: 63.43, country: 'Chile', grape: 'Blend', image: 'img/winemaker-secret-branco.jpg', description: 'Branco leve de Blend, produzido no Chile.' },
    { slug: 'winemaker-secret-rose', name: 'Winemaker Secret Rosé', category: 'Rosé', price: 63.43, country: 'Chile', grape: 'Blend', image: 'img/winemaker-secret-rose.jpg', description: 'Rosé de Blend, leve e refrescante, do Chile.' },
    { slug: 'yali-wild-swan-sauvignon-blanc', name: 'Yali - Wild Swan Sauvignon Blanc', category: 'Branco', price: 69.88, country: 'Chile', grape: 'Sauvignon Blanc', image: 'img/yali-wild-swan-sauvignon-blanc.jpg', description: 'Sauvignon Blanc branco do Chile, ideal para petiscos e frutos do mar.' },
    { slug: 'romanica-pinot-grigio', name: 'Romanica Pinot Grigio', category: 'Branco', price: 65.78, country: 'Itália', grape: 'Pinot Grigio', image: 'img/romanica-pinot-grigio.jpg', description: 'Branco leve de Pinot Grigio, produzido na Itália.' },
    { slug: 'stormhoek-shiraz-pure', name: 'Stormhoek Shiraz Pure', category: 'Tinto', price: 69.7, country: 'África do Sul', grape: 'Syrah', image: 'img/stormhoek-shiraz-pure.jpg', description: 'Syrah da África do Sul, encorpado e envolvente.' },
    { slug: 'marthas-porto-rose', name: 'Marthas Porto Rosé', category: 'Rosé', price: 117.99, country: 'Portugal', grape: 'Blend', image: 'img/marthas-porto-rose.jpg', description: 'Rosé de Blend, leve e refrescante, de Portugal.' },
    { slug: 'paso-de-los-andes-reserva-tinto', name: 'Paso de Los Andes Reserva Tinto', category: 'Tinto', price: 50.62, country: 'Chile', grape: 'Blend', image: 'img/paso-de-los-andes-reserva-tinto.jpg', description: 'Blend do Chile, encorpado e envolvente.' },
  ];

  const CATEGORIES = [...new Set(MENU.map((w) => w.category))];

  function findBySlug(slug) {
    return MENU.find((w) => w.slug === slug);
  }

  // Remove acentos para a busca não depender de o cliente digitar exatamente
  // (ex.: "torrontes" precisa achar "Torrontés").
  function normalizeText(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  function searchByName(query) {
    const q = normalizeText(query).trim();
    if (!q) return [];
    return MENU.filter((w) => normalizeText(w.name).indexOf(q) !== -1);
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

  return { MENU, CATEGORIES, findBySlug, suggestPairings, searchByName };
});
