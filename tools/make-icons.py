#!/usr/bin/env python3
"""Generate the app icons in public/icons/ from public/assets/6ball-logo-transparent.png.

Run: python3 tools/make-icons.py   (needs Pillow)
- icon-192.png / icon-512.png : purpose "any"  (logo fills ~78% of the height)
- icon-maskable-512.png       : purpose "maskable" (logo inside the 80% safe zone)
- apple-touch-icon.png        : 180x180, opaque (iOS fills transparency with black)
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public/assets/6ball-logo-transparent.png"
OUT = ROOT / "public/icons"
BG_TOP, BG_BOTTOM = (26, 18, 64), (6, 5, 18)


def background(size):
    im = Image.new("RGB", (size, size), BG_BOTTOM)
    d = ImageDraw.Draw(im)
    for y in range(size):
        t = y / max(1, size - 1)
        d.line([(0, y), (size, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)))
    return im


def icon(size, logo_height_ratio):
    logo = Image.open(SRC).convert("RGBA")
    h = round(size * logo_height_ratio)
    w = round(logo.width * h / logo.height)
    logo = logo.resize((w, h), Image.LANCZOS)
    im = background(size).convert("RGBA")
    im.alpha_composite(logo, ((size - w) // 2, (size - h) // 2))
    return im.convert("RGB")


OUT.mkdir(exist_ok=True)
icon(192, 0.78).save(OUT / "icon-192.png", optimize=True)
icon(512, 0.78).save(OUT / "icon-512.png", optimize=True)
icon(512, 0.62).save(OUT / "icon-maskable-512.png", optimize=True)
icon(180, 0.78).save(OUT / "apple-touch-icon.png", optimize=True)
print("icons written to", OUT)
