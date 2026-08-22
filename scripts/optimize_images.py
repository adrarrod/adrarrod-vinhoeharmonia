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

# slug -> original filename in img/ (see docs/superpowers/specs/2026-08-21-vinho-harmonia-loja-design.md
# "Catálogo" section for how these were matched to Planilha_Produto.xlsx)
SOURCE_MAP = {
    "coragem-reserva": "CoragemReserva.jpg",
    "chianti-rifugio-del-vescovo": "Chianti.jpg",
    "sierra-batuco-reserva-cabernet-sauvignon": "Sierra Batuco Cabernet Sauvignon.jpg",
    "sierra-batuco-reserva-pinot-noir": "Sierra Batuco Reserva Pinot Noir.jpg",
    "sutter-home": "Sutter Home.jpg",
    "porta-6": "Porta6.jpg",
    "stormhoek-pinotage": "Stormhoek.jpg",
    "mythic-cellars-mountain-petit-verdot": "Mythic.jpg",
    "chateau-bel-enclos": "Château Bel Enclos.jpg",
    "chateau-jamin-bourdeaux": "CHÂTEAU JAMIN.jpg",
    "ca-montebello-barbera": "CaBarbera.jpg",
    "intimista": "Intimista.jpg",
    "lomas-del-marques-tempranillo": "Lomas Del Marques Tempranillo.jpg",
    "montana-de-chile-classic-merlot": "Montaña Merlot.jpg",
    "mr-rabbit-tinto-cabernet-sauvignon": "Mr. Rabbit Tinto Pays D’OC IGP Cabernet Sauvignon.jpg",
    "rosso-toscana-igt-rifugio-del-vescovo": "VESCOVO ROSSO.jpg",
    "miolo-single-vineyard-cabernet-franc": "Miolo Single Vineyard Cabernet Franc.jpg",
    "namaqua-merlot": "Namaqua.jpg",
    "single-vineyard-pinot-noir": "MioloPinotNoir.jpg",
    "vezzani-nero-di-troia": "NerodiTroia.jpg",
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
