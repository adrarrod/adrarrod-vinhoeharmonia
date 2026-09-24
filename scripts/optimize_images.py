# scripts/optimize_images.py
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
IMG_DIR = ROOT / "img"
ICONS_DIR = ROOT / "icons"
MAX_WIDTH = 900
JPEG_QUALITY = 82

# slug -> original filename in img/, casado com os 119 produtos de
# Planilha_Produto_Todos_Vinhos.xlsx (catálogo completo: Tinto, Branco, Rosé,
# Espumante, Sobremesa). Casamento nome-produto -> arquivo feito por
# similaridade de texto e revisado manualmente para resolver colisões
# (ex: duas variantes da mesma marca disputando a mesma foto genérica).
SOURCE_MAP = {
    '3-autores': '3 Autores.jpg',
    'adega-grande-rose': 'GrandeAdega.jpg',
    'amo-te-tinto': 'Amote.jpg',
    'ancelotta-giaretta': 'Ancellotta Giaretta.jpg',
    'arinarmoa-giaretta': 'Arinarnoa Giaretta.jpg',
    'artolas-branco': 'Artolas Branco.jpg',
    'baron-philippe-de-rothschild-reserva-especial-merlot': 'Baron Philippe de Rothschild Reserva Especial Merlot.jpg',
    'bianco-toscana-igt-rifugio-del-vescovo': 'Bianco.jpg',
    'boa-noite-lisboa': 'BoaNoiteLisboa.jpg',
    'bodega-torrontes': 'Bodega Privada Torrontes.jpg',
    'bridao-merlot': 'Bridão.jpg',
    'buenardo-malbec-vinho-organico': 'Buenardo Malbec Vinho Orgânico.jpg',
    'ca-montebello-barbera': 'ca-montebello-barbera.jpg',
    'ca-montebello-pinot-nero': 'Cà Montebello Pinot Nero.jpg',
    'calvet-varietals-merlot': 'CalvetMerlot.jpg',
    'castas-diferenciadas-cabernet-franc': 'Castas Diferenciadas Cabernet Franc.jpg',
    'castas-diferenciadas-gewurztraminer': 'Gew.jpg',
    'cavic-malbec': 'Cavic.jpg',
    'chardonnay-giaretta': 'Chardonnay Giaretta.jpg',
    'chateau-bel-enclos': 'chateau-bel-enclos.jpg',
    'chateau-jamin-bourdeaux': 'chateau-jamin-bourdeaux.jpg',
    'chateau-maine-d-arman-cotes-de-bourg-aoc': 'ChateauMaine.jpg',
    'chavarri-larchago-rioja-doca': 'Chavarri Tempranillo - Larchago - Rioja DOC.jpg',
    'chianti-rifugio-del-vescovo': 'chianti-rifugio-del-vescovo.jpg',
    'coragem-reserva': 'coragem-reserva.jpg',
    'corinto-carmenere-2021': 'Corinto Carménère – 2021.jpg',
    'corinto-reserva-cabernet-sauvignon-2018': 'Cabernet Sauvignon Corinto Reserva  – 2018.jpg',
    'dedicato-blanc-de-blancs-brut': 'Dedicato Blanc de Blancs Brut.jpg',
    'deinhard-green-label-riesling': 'Deinhard.jpg',
    'dufouleur-monopole-rose': 'dufouleur.jpg',
    'emersao-merlot': 'EmersãoMerlot.jpg',
    'emersao-syrah': 'EmersaoSyrah.jpg',
    'emersao-blend': 'Emersão Blend.jpg',
    'excelso-reserva-cabernet-sauvignon': 'Excelso Reserva Cabernet Sauvignon.jpg',
    'fincas-privada-bornarda': 'Fincas Privadas Bonarda.jpg',
    'flor-d-penalva': 'FlorPenalva.jpg',
    'fonte-da-perdiz-branco-d-o-c': 'Perdiz.jpg',
    'frisante-almaden-moscatel-rose': 'EspumanteAlmadenRose.jpg',
    'gretus-tempranillo': 'Gretus.jpg',
    'herdade-do-gamito-tinto-alicante-bouschet': 'HerdadeGamito.jpg',
    'herdade-grande-origens': 'Herdade Grande Origens.jpg',
    'iciottoli-cabernet-sauvignon': 'Iciottoli Cabernet Sauvignon.jpg',
    'intimista': 'intimista.jpg',
    'ique-vegano': 'Ique.jpg',
    'julia-florista-reserva': 'Julia Florista.jpg',
    'la-treille-de-candale': 'La Treille De Candale.jpg',
    'lacase-carmenere': 'Lacaze.jpg',
    'lambrusco-d-emilia-amabile-bco-suave': 'LambruscoBranco.jpg',
    'lambrusco-d-emilia-amabile-tinto-suave': 'LambruscoTinto.jpg',
    'late-harverst-miolo': 'Miolo Late Harvest Licoroso Branco.jpg',
    'lomas-del-marques-tempranillo': 'lomas-del-marques-tempranillo.jpg',
    'marselan-giaretta': 'Marselan Giaretta.jpg',
    'martha-s-moscatel-do-douro': 'MoscatelDouro.jpg',
    'merlot-giaretta': 'MerlotGiaretta.jpg',
    'miolo-selecao-pinot-grigio-riesling': 'PinotGriggioRiesling.jpg',
    'single-vineyard-cabernet-franc': 'miolo-single-vineyard-cabernet-franc.jpg',
    'mon-bouquet-de-provence': 'Mon Bouquet de Provence.jpg',
    'montana-de-chile-classic-cabernet-sauvignon': 'Montaña De Chile Classic Cab Sauv.jpg',
    'montana-de-chile-classic-chardonnay': 'Montaña Chardonnay.jpg',
    'montana-de-chile-classic-merlot': 'montana-de-chile-classic-merlot.jpg',
    'moscato-giaretta': 'Moscato Giaretta.jpg',
    'mr-rabbit-pinot-noir': 'Mrs. Rabbit Tinto Pays D’OC IGP Pinot Noir.jpg',
    'mr-rabbit-tinto-pays-d-oc-igp-cabernet-sauvignon': 'Mr. Rabbit Tinto Pays D’OC IGP Cabernet Sauvignon.jpg',
    'mr-rabbit-tinto-pays-d-oc-igp-syrah': 'RabbitSyrah.jpg',
    'mythic-cellars-mountain-petit-verdot': 'mythic-cellars-mountain-petit-verdot.jpg',
    'namaqua-merlot': 'namaqua-merlot.jpg',
    'navalheiro-regional-trasmontano': 'Navalheiro Regional Trasmontano.jpg',
    'new-roads-blend': 'New Roads Blend.jpg',
    'no-branding-no-cry': 'No Branding No cry.jpg',
    'nobili-d-italia-montepulciano-d-abruzzo': 'Nobili DItalia Montepulciano.jpg',
    'nobili-d-italia-trebbiano-d-abruzzo': 'TrebbianoAbruzzo.jpg',
    'paso-de-los-andes-reserva-pinot-noir': 'PasoPinot.jpg',
    'pao-de-los-andes-cabernet-sauvignon': 'PasoLosAndesCabernetSauvignon.jpg',
    'passo-de-los-andes-carmenere': 'Paso de Los Andes Reserva Carménère.jpg',
    'passaro-da-lua-blend': 'PassaroBlend.jpg',
    'passaro-da-lua-tannat': 'PassaroTannat.jpg',
    'passo-de-los-andes-moskato': 'Paso de Los Andes Moskato Suave.jpg',
    'pescada-blend-verde': 'Pescada.jpg',
    'plexus-espumante-branco': 'PlexusBranco.jpg',
    'plexus-espumante-rose': 'PlexusR.jpg',
    'pode-ser': 'PodeSer.jpg',
    'porta-6': 'porta-6.jpg',
    'porta-6-reserva': 'Porta6Reserva.jpg',
    'profugo-malbec': 'ProfugoMalbec.jpg',
    'profugo-sauvignon-blanc': 'Profugo Frutos de Verão Sauvignon Blanc.jpg',
    'rosso-toscana-igt-rifugio-del-vescovo': 'rosso-toscana-igt-rifugio-del-vescovo.jpg',
    'sierra-batuco-reserva-cabernet-sauvignon': 'sierra-batuco-reserva-cabernet-sauvignon.jpg',
    'sierra-batuco-reserva-pinot-noir': 'sierra-batuco-reserva-pinot-noir.jpg',
    'single-vineyard-pinot-noir': 'single-vineyard-pinot-noir.jpg',
    'single-vineyard-touriga-nacional': 'TourigaNacional.jpg',
    'stormhoek-pinotage': 'stormhoek-pinotage.jpg',
    'sutter-home': 'sutter-home.jpg',
    'tannat-giaretta': 'Tannat Giaretta.jpg',
    'terramater-vineyard-pinot-noir-reserve': 'TerraMater.jpg',
    'torre-romanica-primitivo': 'RomanicaPrimitivo.jpg',
    'torre-romanica-sangiovese': 'RomanicaSangiovese.jpg',
    'vezzani-montepulciano': 'Vezzani Montepulciano DAbruzzo.jpg',
    'vezzani-negroamaro-rosato': 'Vezzani Negroamaro Rosato.jpg',
    'vezzani-nero-d-avola': 'VezzaniNero.jpg',
    'vezzani-nero-di-troia': 'vezzani-nero-di-troia.jpg',
    'vinas-del-tango-cabernet-sauvignon': 'Vinas.jpg',
    'vinas-del-tango-selection-cabernet-franc': 'Viñas Del Tango Selection Cabernet Franc.jpg',
    'vinas-del-tango-selection-malbec': 'Viñas Del Tango Selection Malbec.jpg',
    'miolo-wild-ganmay': 'Gamay.jpg',
    'winemaker-secret-branco': 'WinemakersBranco.jpg',
    'winemaker-secret-rose': 'Winemakers.jpg',
    'yali-wild-swan-sauvignon-blanc': 'Yali - Wild Swan Sauvignon Blanc.jpg',
    'romanica-pinot-grigio': 'RomanicaPinot.jpg',
    'stormhoek-shiraz-pure': 'Stormhoek Shiraz Pure.jpg',
    # Adicionados depois da primeira importação, com apoio do dono da loja:
    # 'paso-de-los-andes-reserva-tinto' reaproveita a mesma foto de
    # 'passo-de-los-andes-carmenere' (confirmado pelo dono, não tem foto
    # própria) — já processada, não precisa reprocessar via este script.
    'mon-basset-classique-aoc': 'Bourdeaux.jpg',
}


def optimize_photos():
    tmp_dir = IMG_DIR / "_optimized"
    tmp_dir.mkdir(exist_ok=True)
    for slug, filename in SOURCE_MAP.items():
        src = IMG_DIR / filename
        if not src.exists():
            raise FileNotFoundError(f"missing source photo for {slug}: {src}")
        img = Image.open(src).convert("RGB")
        if img.width > MAX_WIDTH:
            ratio = MAX_WIDTH / img.width
            img = img.resize((MAX_WIDTH, int(img.height * ratio)), Image.LANCZOS)
        out_path = tmp_dir / f"{slug}.jpg"
        img.save(out_path, "JPEG", quality=JPEG_QUALITY, optimize=True)
        print(f"optimized {filename} -> img/{slug}.jpg ({out_path.stat().st_size // 1024} KB)")

    # replace originals: remove old raw files, move optimized ones up, drop temp dir
    for filename in set(SOURCE_MAP.values()):
        raw = IMG_DIR / filename
        if raw.exists():
            raw.unlink()
    for f in tmp_dir.iterdir():
        f.rename(IMG_DIR / f.name)
    tmp_dir.rmdir()


def make_icon(size, out_path):
    bg = (86, 15, 30)  # dark bordô
    gold = (196, 154, 61)
    img = Image.new("RGB", (size, size), bg)
    draw = ImageDraw.Draw(img)
    margin = size // 8
    draw.ellipse([margin, margin, size - margin, size - margin], outline=gold, width=max(2, size // 40))
    text = "V&H"
    try:
        font = ImageFont.truetype("arialbd.ttf", size // 4)
    except OSError:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1]), text, fill=gold, font=font)
    img.save(out_path, "PNG")
    print(f"wrote {out_path}")


def make_icons():
    ICONS_DIR.mkdir(exist_ok=True)
    make_icon(192, ICONS_DIR / "icon-192.png")
    make_icon(512, ICONS_DIR / "icon-512.png")


if __name__ == "__main__":
    optimize_photos()
    make_icons()
