#!/usr/bin/env python3
"""Generate the app icons in public/icons/ from the game's ball sprites.

Run: python3 tools/make-icons.py   (needs Pillow; run make-balls.py first)
The icon is the game's falling piece: three glass balls (red, yellow, blue)
in a touching triangle on the dark gradient of the menus.
- icon-192.png / icon-512.png : purpose "any"  (piece fills ~80% of the side)
- icon-maskable-512.png       : purpose "maskable" (piece inside the 80% safe zone)
- apple-touch-icon.png        : 180x180, opaque (iOS fills transparency with black)
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "public/assets"
OUT = ROOT / "public/icons"
BG_TOP, BG_BOTTOM = (26, 18, 64), (6, 5, 18)
PIECE = ["red", "yellow", "blue"]   # top, bottom left, bottom right


def background(size):
    im = Image.new("RGB", (size, size), BG_BOTTOM)
    d = ImageDraw.Draw(im)
    for y in range(size):
        t = y / max(1, size - 1)
        d.line([(0, y), (size, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)))
    return im


def icon(size, fill):
    """`fill`: width of the piece (two ball diameters) as a share of the side."""
    ss = 4
    n = size * ss
    im = background(n).convert("RGBA")
    dia = n * fill / 2
    h = dia * math.sqrt(3) / 2          # row height of touching balls
    cx, cy = n / 2, n / 2 + h / 6       # centre the triangle's bounding box
    spots = [(cx, cy - h / 2), (cx - dia / 2, cy + h / 2), (cx + dia / 2, cy + h / 2)]
    shadow = Image.new("L", (n, n), 0)
    sd = ImageDraw.Draw(shadow)
    for x, y in spots:
        r = dia * 0.46
        sd.ellipse([x - r, y - r + dia * 0.07, x + r, y + r + dia * 0.07], fill=150)
    shadow = shadow.filter(ImageFilter.GaussianBlur(dia * 0.08))
    dark = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    dark.putalpha(shadow)
    im.alpha_composite(dark)
    for (x, y), name in zip(spots, PIECE):
        b = Image.open(ASSETS / f"ball-glass-{name}.png").convert("RGBA").resize((int(dia), int(dia)), Image.LANCZOS)
        im.alpha_composite(b, (int(x - dia / 2), int(y - dia / 2)))
    return im.resize((size, size), Image.LANCZOS).convert("RGB")


OUT.mkdir(exist_ok=True)
icon(192, 0.80).save(OUT / "icon-192.png", optimize=True)
icon(512, 0.80).save(OUT / "icon-512.png", optimize=True)
icon(512, 0.64).save(OUT / "icon-maskable-512.png", optimize=True)
icon(180, 0.80).save(OUT / "apple-touch-icon.png", optimize=True)
icon(32, 0.92).save(OUT / "favicon-32.png", optimize=True)
print("icons written to", OUT)
