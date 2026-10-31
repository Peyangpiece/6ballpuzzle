#!/usr/bin/env python3
"""Draw the player icons of the trophy road: public/assets/icon-<id>.png (192 px).

Run: python3 tools/make-avatar-icons.py   (needs Pillow and numpy)

Each icon is a round badge (original artwork): a lit background in the
icon's own colours with soft rays, a metal rim (silver for the early icons,
gold from the crown on), the emblem with a gradient fill, a dark keyline and
a drop shadow, and a gloss over the top. Shown in avatars everywhere
(HexAvatar in public/app-menu-ui.js, HexTrophies.ITEMS in
public/app-trophies-v1.js).
"""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/assets"
SIZE, SS = 192, 4
N = SIZE * SS


def rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float64) / 255.0


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


y, x = np.mgrid[0:N, 0:N].astype(np.float64)
U = (x + 0.5) / N * 2 - 1
V = (y + 0.5) / N * 2 - 1
D = np.sqrt(U * U + V * V)
A = np.arctan2(V, U)


def to_px(pts):
    return [((px + 1) / 2 * N, (py + 1) / 2 * N) for px, py in pts]


def mask(draw_fn):
    im = Image.new("L", (N, N), 0)
    draw_fn(ImageDraw.Draw(im))
    return np.asarray(im, dtype=np.float64) / 255.0


def poly(pts):
    return mask(lambda d: d.polygon(to_px(pts), fill=255))


def blur(m, r):
    im = Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), dtype=np.float64) / 255.0


def grow(m, r):
    im = Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.MaxFilter(r * 2 + 1)), dtype=np.float64) / 255.0


def star_pts(n, ro, ri, cx=0.0, cy=0.0, rot=-math.pi / 2):
    return [(cx + math.cos(rot + i * math.pi / n) * (ro if i % 2 == 0 else ri), cy + math.sin(rot + i * math.pi / n) * (ro if i % 2 == 0 else ri)) for i in range(2 * n)]


def teardrop(w, h, cx, cy, lean=0.0, m=1.6, steps=240):
    """A drop with its tip up; lean bends the tip sideways like a flame."""
    pts = []
    for i in range(steps):
        f = i / steps * 2 * math.pi
        px = math.sin(f) * math.sin(f / 2) ** m
        py = math.cos(f)                       # 1 at the tip
        up = (py + 1) / 2
        pts.append((cx + w * px + lean * up ** 2.2, cy - h * py))
    return pts


def merged(*masks, r=10):
    """Union of shapes with the joins rounded off."""
    return smooth(0.45, 0.55, blur(np.clip(sum(masks), 0, 1), r))


def emblem(kind):
    """Shapes of the emblem: (body mask, list of (mask, colour) details)."""
    if kind == "star":
        return poly(star_pts(5, 0.58, 0.25, 0, 0.04)), []
    if kind == "bolt":
        return poly([(0.14, -0.64), (-0.38, 0.08), (-0.05, 0.08), (-0.18, 0.64), (0.38, -0.12), (0.05, -0.12)]), []
    if kind == "flame":
        main = poly(teardrop(0.40, 0.56, 0.0, 0.10, lean=0.16))
        left = poly(teardrop(0.17, 0.30, -0.27, 0.22, lean=-0.10))
        right = poly(teardrop(0.15, 0.27, 0.28, 0.20, lean=0.12))
        outer = merged(main, left, right)
        inner = merged(poly(teardrop(0.20, 0.30, 0.02, 0.30, lean=0.08)), r=6)
        return outer, [(inner, "inner")]
    if kind == "crown":
        body = poly([(-0.54, -0.30), (-0.27, 0.02), (0, -0.46), (0.27, 0.02), (0.54, -0.30), (0.44, 0.30), (-0.44, 0.30)])
        band = poly([(-0.46, 0.34), (0.46, 0.34), (0.46, 0.50), (-0.46, 0.50)])
        jewels = mask(lambda d: [d.ellipse([(cx + 1) / 2 * N - r, (cy + 1) / 2 * N - r, (cx + 1) / 2 * N + r, (cy + 1) / 2 * N + r], fill=255) for cx, cy, r in ((-0.54, -0.33, N * 0.045), (0, -0.50, N * 0.05), (0.54, -0.33, N * 0.045))])
        gem = mask(lambda d: d.ellipse([N * 0.455, N * 0.68, N * 0.545, N * 0.77], fill=255))
        return np.clip(body + band + jewels, 0, 1), [(gem, "jewel")]
    if kind == "gem":
        body = poly([(-0.56, -0.20), (-0.32, -0.50), (0.32, -0.50), (0.56, -0.20), (0, 0.60)])
        facets = mask(lambda d: [d.line(to_px(seg), fill=255, width=int(N * 0.016)) for seg in (
            [(-0.56, -0.20), (0.56, -0.20)], [(-0.32, -0.50), (-0.18, -0.20), (0, -0.50), (0.18, -0.20), (0.32, -0.50)],
            [(-0.18, -0.20), (0, 0.60), (0.18, -0.20)])])
        left = poly([(-0.56, -0.20), (-0.18, -0.20), (0, 0.60)])
        return body, [(left, "shade"), (facets, "line")]
    if kind == "master":
        hexa = poly([(math.cos(-math.pi / 2 + i * math.pi / 3) * 0.60, math.sin(-math.pi / 2 + i * math.pi / 3) * 0.60 + 0.02) for i in range(6)])
        inner = poly([(math.cos(-math.pi / 2 + i * math.pi / 3) * 0.47, math.sin(-math.pi / 2 + i * math.pi / 3) * 0.47 + 0.02) for i in range(6)])
        star = poly(star_pts(5, 0.34, 0.15, 0, 0.05))
        return hexa, [(np.clip(inner - star, 0, 1), "inset")]
    raise ValueError(kind)


THEMES = {
    #        bg centre, bg edge,  rim,      emblem top, emblem bottom, keyline, detail
    "star":   ("#FFB347", "#B8460E", "silver", "#FFFDF2", "#FFD45C", "#6B2A06", None),
    "bolt":   ("#5C6BFF", "#1B1C7A", "silver", "#FFFBD6", "#FFC92E", "#2A1D05", None),
    "flame":  ("#FF5A4A", "#7A0F1C", "silver", "#FFE07A", "#FF7A1F", "#4A0A06", "#FFF6C4"),
    "crown":  ("#9C5BFF", "#2E1170", "gold",   "#FFF3B0", "#E9A41F", "#3A2004", "#FF4F7B"),
    "gem":    ("#2FE3D5", "#0B4E63", "gold",   "#F4FFFF", "#7FE8FF", "#073241", "#46BEE0"),
    "master": ("#3B2C8F", "#0A0A24", "gold",   "#FFFFFF", "#C9A8FF", "#140A33", "#FFD36A"),
}
RIMS = {"silver": ("#FFFFFF", "#9EA7B8", "#4B5263"), "gold": ("#FFF6C8", "#E6B13A", "#7A4F0C")}


def render(kind):
    c0, c1, rim, e0, e1, key, detail = THEMES[kind]
    disk = smooth(0.965, 0.955, D)
    # Background: lit from the upper left, with soft rays.
    lit = np.sqrt((U + 0.32) ** 2 + (V + 0.38) ** 2)
    t = np.clip(lit / 1.35, 0, 1)
    bg = rgb(c0)[None, None, :] * (1 - t)[..., None] + rgb(c1)[None, None, :] * t[..., None]
    rays = 0.5 + 0.5 * np.cos(A * 12)
    bg = bg * (1 + 0.07 * (rays - 0.5) * smooth(0.0, 0.8, D))[..., None]
    bg = bg * (1 - 0.25 * smooth(0.55, 0.88, D))[..., None]
    # Metal rim with a dark inner line.
    hl, mid, dk = (rgb(c) for c in RIMS[rim])
    light = 0.5 + 0.5 * np.cos(A - math.radians(-130))
    rimc = dk[None, None, :] * (1 - light)[..., None] + mid[None, None, :] * light[..., None]
    rimc = rimc + hl[None, None, :] * (np.clip(light - 0.75, 0, 1) * 2.4)[..., None]
    ring = smooth(0.835, 0.845, D) * disk
    img = bg * (1 - ring)[..., None] + rimc * ring[..., None]
    inner_line = np.exp(-((D - 0.84) ** 2) / 0.00006)
    img = img * (1 - 0.55 * inner_line)[..., None]
    # Emblem: drop shadow, keyline, gradient fill, highlight, details.
    body, details = emblem(kind)
    body = np.clip(body, 0, 1)
    shadow = blur(np.roll(np.roll(grow(body, 10), 22, axis=0), 6, axis=1), 18)
    img = img * (1 - 0.45 * shadow * (1 - ring))[..., None]
    outline = grow(body, 12)
    img = img * (1 - outline)[..., None] + rgb(key)[None, None, :] * outline[..., None]
    gy = np.clip((V + 0.65) / 1.3, 0, 1)
    fill = rgb(e0)[None, None, :] * (1 - gy)[..., None] + rgb(e1)[None, None, :] * gy[..., None]
    shine = blur(body * smooth(0.1, -0.35, V + 0.4 * U), 12) * 0.35
    fill = fill + shine[..., None]
    img = img * (1 - body)[..., None] + fill * body[..., None]
    inner_edge = np.clip(body - blur(body, 14), 0, 1)
    img = img * (1 - 0.25 * inner_edge)[..., None]
    for m, role in details:
        if role == "inner":
            g = np.clip((V + 0.1) / 0.6, 0, 1)
            col = rgb(detail)[None, None, :] * (1 - g)[..., None] + rgb("#FFC24A")[None, None, :] * g[..., None]
            img = img * (1 - m)[..., None] + col * m[..., None]
        elif role == "jewel":
            img = img * (1 - m)[..., None] + rgb(detail)[None, None, :] * m[..., None]
            img = img + (blur(m * smooth(0.0, -0.1, V - 0.72), 3) * 0.6)[..., None]
        elif role == "shade":
            img = img * (1 - 0.22 * m * body)[..., None]
        elif role == "line":
            img = img * (1 - 0.5 * m * body)[..., None] + rgb(detail)[None, None, :] * (0.5 * m * body)[..., None]
        elif role == "inset":
            g = np.clip((V + 0.5) / 1.0, 0, 1)
            col = rgb("#6E4BFF")[None, None, :] * (1 - g)[..., None] + rgb("#22105E")[None, None, :] * g[..., None]
            prism = 0.5 + 0.5 * np.cos(A * 3 + V * 4)
            col = col + rgb(detail)[None, None, :] * (0.15 * prism)[..., None]
            img = img * (1 - m)[..., None] + col * m[..., None]
    # Gloss over the top half.
    gloss = smooth(0.02, -0.25, V + 0.18 * U * U) * smooth(0.83, 0.78, D) * 0.16
    img = img + gloss[..., None]
    out = np.dstack([np.clip(img, 0, 1), disk])
    im = Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA")
    return im.resize((SIZE, SIZE), Image.LANCZOS)


if __name__ == "__main__":
    for kind in THEMES:
        path = OUT / f"icon-{kind}.png"
        render(kind).save(path, optimize=True)
        print(path.relative_to(ROOT))
