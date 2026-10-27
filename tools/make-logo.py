#!/usr/bin/env python3
"""Render the Honeycomb Puzzle emblem public/assets/honeycomb-logo.png.

Run: python3 tools/make-logo.py   (needs Pillow and numpy; run make-balls.py first)
Seven of the game's glass balls packed as one honeycomb cell (a centre and
its six neighbours) on a softly lit amber hexagon. The title itself is page
text, so the emblem holds no lettering. tools/make-icons.py builds the app
icons from this image.
"""
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "public/assets"
SIZE, SS = 640, 2
N = SIZE * SS
BALL = N * 0.25            # ball diameter
RING = ["red", "green", "blue", "purple", "green", "blue"]
CENTRE = "yellow"


def hexagon(cx, cy, r, rot=0.0):
    return [(cx + r * math.cos(rot + k * math.pi / 3), cy + r * math.sin(rot + k * math.pi / 3)) for k in range(6)]


def main():
    c = N / 2
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0))

    # Amber hexagon plate: outer glow, rim, then a darker inset face.
    glow = Image.new("L", (N, N), 0)
    ImageDraw.Draw(glow).polygon(hexagon(c, c, N * 0.47, math.pi / 6), fill=150)
    glow = glow.filter(ImageFilter.GaussianBlur(N * 0.03))
    amber = Image.new("RGBA", (N, N), (255, 176, 32, 0))
    amber.putalpha(glow)
    im.alpha_composite(amber)

    plate = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(plate)
    d.polygon(hexagon(c, c, N * 0.45, math.pi / 6), fill=(255, 196, 70, 255))
    d.polygon(hexagon(c, c, N * 0.425, math.pi / 6), fill=(122, 70, 8, 255))
    # vertical light falloff on the face
    y = np.linspace(0, 1, N)[:, None]
    shade = (1.15 - 0.45 * y) * np.ones((1, N))
    arr = np.asarray(plate).astype(np.float64)
    face = (arr[..., 0] < 200) & (arr[..., 3] > 0)
    for ch in range(3):
        arr[..., ch] = np.where(face, np.clip(arr[..., ch] * shade, 0, 255), arr[..., ch])
    plate = Image.fromarray(arr.astype(np.uint8), "RGBA")
    im.alpha_composite(plate)

    # Seven balls: centre + six neighbours, touching (centre distance = diameter).
    def ball(name):
        b = Image.open(ASSETS / f"ball-glass-{name}.png").convert("RGBA")
        return b.resize((int(BALL), int(BALL)), Image.LANCZOS)

    shadow = Image.new("L", (N, N), 0)
    sd = ImageDraw.Draw(shadow)
    spots = [(c, c, CENTRE)] + [(c + BALL * math.cos(-math.pi / 2 + k * math.pi / 3),
                                  c + BALL * math.sin(-math.pi / 2 + k * math.pi / 3), RING[k]) for k in range(6)]
    for x, yy, _ in spots:
        r = BALL * 0.48
        sd.ellipse([x - r, yy - r + BALL * 0.06, x + r, yy + r + BALL * 0.06], fill=140)
    shadow = shadow.filter(ImageFilter.GaussianBlur(BALL * 0.08))
    dark = Image.new("RGBA", (N, N), (20, 8, 0, 0))
    dark.putalpha(shadow)
    im.alpha_composite(dark)
    for x, yy, name in spots:
        b = ball(name)
        im.alpha_composite(b, (int(x - BALL / 2), int(yy - BALL / 2)))

    im.resize((SIZE, SIZE), Image.LANCZOS).save(ASSETS / "honeycomb-logo.png", optimize=True)
    print("wrote", ASSETS / "honeycomb-logo.png")


if __name__ == "__main__":
    main()
