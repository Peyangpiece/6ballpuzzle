#!/usr/bin/env python3
"""Build the Drop Ball brand: logo SVGs (brand/), the home-screen logo
(public/assets/drop-ball-logo.svg), the web app icons (public/icons/) and the
iOS app icon and launch image (ios/App/App/Assets.xcassets/).

Run: python3 tools/make-brand.py
Needs: fonttools, cairosvg (pip) and the Inter Display Black font
(/usr/share/fonts/opentype/inter/, SIL Open Font License). The letters are
converted to outlines, so the SVGs do not depend on the font.

The logo: the word DROP BALL in which the O is a glass ball that has just
dropped below the line, with three speed lines in the game's colours above
it. The symbol (app icon) is that ball and its speed lines alone.
Geometry is derived from the font's cap height so every size is consistent.
"""
import io
import math
import shutil
from pathlib import Path

import cairosvg
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"
ICONS = ROOT / "public/icons"
FONT = "/usr/share/fonts/opentype/inter/InterDisplay-Black.otf"

# Brand colours (the ball colours of the game, COLORS in public/app-01.js).
NAVY, WHITE = "#12102E", "#FFFFFF"
CYAN = ("#C8F8FF", "#2FE3F5", "#1257C9")      # ball: highlight, body, shade
TRAILS = ("#FFB020", "#FF3B4D", "#B255F0")    # yellow, red, purple

_font = TTFont(FONT)
_glyphs = _font.getGlyphSet()
_cmap = _font.getBestCmap()
UPM = _font["head"].unitsPerEm
CAP = _font["OS/2"].sCapHeight / UPM


def outline(text, size, tracking):
    """Text as one SVG path (baseline at y=0) and its advance width."""
    s, x, parts = size / UPM, 0.0, []
    for ch in text:
        name = _cmap[ord(ch)]
        pen = SVGPathPen(_glyphs)
        _glyphs[name].draw(TransformPen(pen, (s, 0, 0, -s, x, 0)))
        parts.append(pen.getCommands())
        x += _font["hmtx"][name][0] * s + tracking * size
    return " ".join(p for p in parts if p), x - tracking * size


def f(v):
    return f"{v:.2f}"


def ball_defs(uid):
    hi, body, shade = CYAN
    return (f'<radialGradient id="ball{uid}" cx="36%" cy="30%" r="78%">'
            f'<stop offset="0" stop-color="{hi}"/><stop offset=".45" stop-color="{body}"/><stop offset="1" stop-color="{shade}"/></radialGradient>'
            f'<linearGradient id="spec{uid}" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".08"/></linearGradient>'
            f'<radialGradient id="rim{uid}" cx="50%" cy="50%" r="50%">'
            f'<stop offset=".8" stop-color="#fff" stop-opacity="0"/><stop offset=".97" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>')


def ball(uid, cx, cy, r, flat=None):
    hx, hy = cx - r * .34, cy - r * .40
    if flat:
        # one flat colour; the highlight is cut out so it shows the background
        return (f'<mask id="cut{uid}" maskUnits="userSpaceOnUse" x="{f(cx - r)}" y="{f(cy - r)}" width="{f(2 * r)}" height="{f(2 * r)}">'
                f'<rect x="{f(cx - r)}" y="{f(cy - r)}" width="{f(2 * r)}" height="{f(2 * r)}" fill="#fff"/>'
                f'<ellipse cx="{f(hx)}" cy="{f(hy)}" rx="{f(r * .30)}" ry="{f(r * .17)}" transform="rotate(-38 {f(hx)} {f(hy)})" fill="#000"/></mask>'
                f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{flat}" mask="url(#cut{uid})"/>')
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="url(#ball{uid})"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="url(#rim{uid})"/>'
            f'<ellipse cx="{f(hx)}" cy="{f(hy)}" rx="{f(r * .36)}" ry="{f(r * .20)}" transform="rotate(-38 {f(hx)} {f(hy)})" fill="url(#spec{uid})"/>'
            f'<circle cx="{f(cx + r * .42)}" cy="{f(cy + r * .46)}" r="{f(r * .07)}" fill="#fff" fill-opacity=".35"/>')


def trails(uid, cx, ball_top, r, lens, width, gap, flat=False, cols=TRAILS):
    """Speed lines above the ball; their lower ends follow the ball's curve."""
    total = len(cols) * width + (len(cols) - 1) * gap
    defs, shapes = "", ""
    for i, (c, length) in enumerate(zip(cols, lens)):
        x = cx - total / 2 + i * (width + gap)
        dx = x + width / 2 - cx
        bottom = ball_top + (r - math.sqrt(max(0.0, r * r - dx * dx))) - width * .9
        top = bottom - length
        if flat:
            shapes += f'<rect x="{f(x)}" y="{f(top)}" width="{f(width)}" height="{f(length)}" rx="{f(width / 2)}" fill="{c}"/>'
            continue
        g = f"trail{uid}{i}"
        defs += (f'<linearGradient id="{g}" x1="0" y1="{f(top)}" x2="0" y2="{f(bottom)}" gradientUnits="userSpaceOnUse">'
                 f'<stop offset="0" stop-color="{c}" stop-opacity="0"/><stop offset=".6" stop-color="{c}" stop-opacity=".85"/><stop offset="1" stop-color="{c}"/></linearGradient>')
        shapes += f'<rect x="{f(x)}" y="{f(top)}" width="{f(width)}" height="{f(length)}" rx="{f(width / 2)}" fill="url(#{g})"/>'
    return defs, shapes


def wordmark(uid, ink, flat=None, trail_cols=TRAILS, size=100.0, track=-.012):
    cap = CAP * size
    left, w1 = outline("DR", size, track)
    right, w2 = outline("P BALL", size, track)
    gap = _font["hmtx"][_cmap[ord("O")]][0] / UPM * size + size * .07
    r = cap * .47
    cx, cy = w1 + track * size + gap / 2, -cap / 2 + cap * .36
    lens = (cap * .55, cap * .85, cap * .42)
    d, t = trails(uid, cx, cy - r, r, lens, cap * .10, cap * .075, flat is not None, trail_cols)
    width = w1 + gap + w2
    pad = size * .06
    top = min(-cap, cy - r - max(lens) - cap * .1) - pad
    bottom = cy + r + pad
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{f(-pad)} {f(top)} {f(width + 2 * pad)} {f(bottom - top)}" role="img" aria-label="Drop Ball">'
            f'<title>Drop Ball</title><defs>{ball_defs(uid)}{d}</defs>'
            f'<path d="{left}" fill="{ink}"/><path transform="translate({f(w1 + gap + track * size)},0)" d="{right}" fill="{ink}"/>'
            f'{t}{ball(uid, cx, cy, r, flat)}</svg>')


def symbol(uid, size=1024, background=True, scale=1.0, flat=None):
    s = size
    r = s * .205 * scale
    lens = (r * .85, r * 1.3, r * .65)
    # centre the ball and its speed lines as one figure (lines end ~0.15r above the ball)
    height = 2 * r + max(lens) + r * .12
    cx, cy = s / 2, (s - height) / 2 + max(lens) + r * .12 + r
    d, t = trails(uid, cx, cy - r, r, lens, r * .24, r * .17, flat is not None)
    bg = ""
    if background:
        d += (f'<linearGradient id="bg{uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1D1650"/><stop offset="1" stop-color="#07061A"/></linearGradient>'
              f'<radialGradient id="glow{uid}" cx="50%" cy="{f((cy / s) * 100)}%" r="48%"><stop offset="0" stop-color="#2FE3F5" stop-opacity=".24"/><stop offset="1" stop-color="#2FE3F5" stop-opacity="0"/></radialGradient>')
        bg = f'<rect width="{s}" height="{s}" fill="url(#bg{uid})"/><rect width="{s}" height="{s}" fill="url(#glow{uid})"/>'
    # a soft landing shadow just under the ball
    d += (f'<radialGradient id="shadow{uid}"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>')
    shadow = f'<ellipse cx="{f(cx)}" cy="{f(cy + r * 1.08)}" rx="{f(r * .8)}" ry="{f(r * .16)}" fill="url(#shadow{uid})"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {s} {s}" role="img" aria-label="Drop Ball">'
            f'<defs>{ball_defs(uid)}{d}</defs>{bg}{shadow}{t}{ball(uid, cx, cy, r, flat)}</svg>')


def main():
    BRAND.mkdir(exist_ok=True)
    files = {
        "drop-ball-logo-on-dark.svg": wordmark("d", WHITE),
        "drop-ball-logo-on-light.svg": wordmark("l", NAVY),
        "drop-ball-logo-flat-on-dark.svg": wordmark("fd", WHITE, flat=CYAN[1]),
        "drop-ball-logo-flat-on-light.svg": wordmark("fl", NAVY, flat=CYAN[1]),
        "drop-ball-logo-mono-white.svg": wordmark("mw", WHITE, flat=WHITE, trail_cols=(WHITE,) * 3),
        "drop-ball-logo-mono-navy.svg": wordmark("mn", NAVY, flat=NAVY, trail_cols=(NAVY,) * 3),
        "drop-ball-symbol.svg": symbol("s"),
        "drop-ball-symbol-transparent.svg": symbol("t", background=False),
    }
    for name, svg in files.items():
        (BRAND / name).write_text(svg + "\n")
    shutil.copy(BRAND / "drop-ball-logo-on-dark.svg", ROOT / "public/assets/drop-ball-logo.svg")

    ICONS.mkdir(exist_ok=True)
    icon = symbol("i").encode()
    maskable = symbol("m", scale=.82).encode()   # mark inside the 80% safe zone
    for name, png, px in [("icon-192.png", icon, 192), ("icon-512.png", icon, 512),
                          ("icon-maskable-512.png", maskable, 512), ("apple-touch-icon.png", icon, 180),
                          ("favicon-32.png", symbol("f", scale=1.12).encode(), 32)]:
        cairosvg.svg2png(bytestring=png, write_to=str(ICONS / name), output_width=px, output_height=px)
    cairosvg.svg2png(bytestring=icon, write_to=str(BRAND / "drop-ball-app-icon-1024.png"), output_width=1024, output_height=1024)
    # App Store icons must be opaque.
    Image.open(BRAND / "drop-ball-app-icon-1024.png").convert("RGB").save(BRAND / "drop-ball-app-icon-1024.png", optimize=True)

    # iOS app (Capacitor): the app icon and the launch image.
    assets = ROOT / "ios/App/App/Assets.xcassets"
    if assets.exists():
        shutil.copy(BRAND / "drop-ball-app-icon-1024.png", assets / "AppIcon.appiconset/AppIcon-512@2x.png")
        side = 2732
        splash = Image.new("RGB", (side, side), (6, 5, 18))
        logo_png = io.BytesIO(cairosvg.svg2png(bytestring=wordmark("sp", WHITE).encode(), output_width=1100))
        logo = Image.open(logo_png).convert("RGBA")
        splash.paste(logo, ((side - logo.width) // 2, (side - logo.height) // 2), logo)
        for name in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
            splash.save(assets / "Splash.imageset" / name, optimize=True)
    print("brand files written to", BRAND, "and", ICONS)


if __name__ == "__main__":
    main()
