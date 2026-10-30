#!/usr/bin/env python3
"""Draw the Game Center achievement images (1024x1024 PNG, see docs/IOS.md).

  python3 tools/make-achievement-images.py /path/to/InterDisplay-Black.otf

Writes brand/achievements/<achievement ID>.png from the game's glass balls
(public/assets/ball-glass-*.png) on the app's dark background. The only text
is Latin (Inter Display Black, SIL OFL 1.1), so one image serves every language.
"""
import math, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "brand", "achievements")
S = 1024
BG = (6, 5, 18)
GLOW = {"blue": (47, 227, 245), "green": (80, 230, 140), "yellow": (255, 211, 106),
        "purple": (173, 134, 255), "red": (255, 90, 130)}


def ball(color, size):
    im = Image.open(os.path.join(ROOT, "public", "assets", f"ball-glass-{color}.png")).convert("RGBA")
    return im.resize((size, size), Image.LANCZOS)


def canvas(glow):
    im = Image.new("RGBA", (S, S), BG + (255,))
    halo = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(halo).ellipse((S * .14, S * .14, S * .86, S * .86), fill=glow + (70,))
    im.alpha_composite(halo.filter(ImageFilter.GaussianBlur(130)))
    ring = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(ring).ellipse((40, 40, S - 40, S - 40), outline=glow + (150,), width=10)
    im.alpha_composite(ring.filter(ImageFilter.GaussianBlur(3)))
    return im


def put(im, color, size, cx, cy):
    im.alpha_composite(ball(color, size), (round(cx - size / 2), round(cy - size / 2)))


def text(im, font_path, s, size, cy, fill=(255, 255, 255)):
    font = ImageFont.truetype(font_path, size)
    d = ImageDraw.Draw(im)
    w = d.textlength(s, font=font)
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).text(((S - w) / 2, cy), s, font=font, fill=(0, 0, 0, 200), anchor="lm")
    im.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(12)))
    d.text(((S - w) / 2, cy), s, font=font, fill=fill, anchor="lm")


def ring_of(im, colors, radius, size, cx=S / 2, cy=S / 2, start=-90):
    for i, c in enumerate(colors):
        a = math.radians(start + 360 * i / len(colors))
        put(im, c, size, cx + radius * math.cos(a), cy + radius * math.sin(a))


def first_win(f):
    im = canvas(GLOW["yellow"])
    put(im, "yellow", 420, S / 2, 420)
    text(im, f, "WIN", 190, 800)
    return im


def ai(level):
    colors = ["green", "blue", "yellow", "purple", "red"]
    def draw(f):
        im = canvas(GLOW[colors[level - 1]])
        text(im, f, "AI", 330, 400)
        size, gap = 120, 14
        x0 = S / 2 - (5 * size + 4 * gap) / 2 + size / 2
        for i in range(5):
            if i < level:
                put(im, colors[level - 1], size, x0 + i * (size + gap), 740)
            else:
                d = ImageDraw.Draw(im)
                cx = x0 + i * (size + gap)
                d.ellipse((cx - size * .38, 740 - size * .38, cx + size * .38, 740 + size * .38),
                          outline=(255, 255, 255, 70), width=6)
        return im
    return draw


def waza_first(f):
    im = canvas(GLOW["blue"])
    size = 128
    for i in range(6):
        put(im, "blue", size, S / 2 + (i - 2.5) * (size * .95), 470)
    text(im, f, "WAZA", 150, 760)
    return im


def hexagon(f):
    im = canvas(GLOW["purple"])
    ring_of(im, ["purple"] * 6, 250, 230, start=-90)
    return im


def chain(n, color):
    def draw(f):
        im = canvas(GLOW[color])
        text(im, f, str(n), 520, 430)
        text(im, f, "CHAIN", 140, 800)
        return im
    return draw


def online_win(f):
    im = canvas(GLOW["blue"])
    put(im, "blue", 330, 340, 420)
    put(im, "red", 330, 684, 420)
    text(im, f, "ONLINE", 140, 790)
    return im


def rating_1200(f):
    im = canvas(GLOW["yellow"])
    ring_of(im, ["yellow", "blue", "green", "purple", "red", "yellow"], 380, 130, start=-90)
    text(im, f, "1200", 260, 520)
    return im


IMAGES = {
    "dropball.first_win": first_win,
    **{f"dropball.ai_{n}": ai(n) for n in range(1, 6)},
    "dropball.waza_first": waza_first,
    "dropball.hexagon": hexagon,
    "dropball.chain_3": chain(3, "green"),
    "dropball.chain_5": chain(5, "red"),
    "dropball.online_win": online_win,
    "dropball.rating_1200": rating_1200,
}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    os.makedirs(OUT, exist_ok=True)
    for name, draw in IMAGES.items():
        path = os.path.join(OUT, name + ".png")
        draw(sys.argv[1]).convert("RGB").save(path, optimize=True)
        print(os.path.relpath(path, ROOT))


if __name__ == "__main__":
    main()
