#!/usr/bin/env python3
"""Render the ball designs of the trophy road: public/assets/ball-<skin>-<colour>.png.

Run: python3 tools/make-ball-skins.py   (needs Pillow and numpy)

Same 192 px size and the same five colours as the glass balls
(tools/make-balls.py, COLORS in public/app-01.js), so a design changes the
material and never the colour a player matches:
  pastel  soft matte sphere, lighter tint, wide diffuse highlight
  neon    dark glass core with a glowing tube of the colour at the rim
  gem     faceted cut stone: flat facets lit from the upper left, sparkles
Unlocked on the trophy road (HexTrophies.ITEMS in public/app-trophies-v1.js).
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/assets"
SIZE, SS = 192, 4
N = SIZE * SS
COLOURS = [
    ("red", "#FF3B4D", "#FFC8CC", "#7E0E1B"),
    ("blue", "#2E86FF", "#BEDCFF", "#0C3781"),
    ("green", "#2FD36E", "#BCF8D2", "#0C6234"),
    ("yellow", "#FFB020", "#FFE9B8", "#8A5602"),
    ("purple", "#B255F0", "#E9CCFF", "#511D8C"),
]


def lin(h):
    h = h.lstrip("#")
    c = np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def grid():
    y, x = np.mgrid[0:N, 0:N].astype(np.float64)
    px = (x + 0.5) / N * 2 - 1
    py = (y + 0.5) / N * 2 - 1
    r = 0.94                                   # sphere radius in the frame
    d = np.sqrt(px * px + py * py) / r
    inside = d < 1
    nz = np.sqrt(np.clip(1 - d * d, 0, 1))
    nx, ny = px / r, py / r
    return px, py, d, inside, nx, ny, nz


LIGHT = np.array([-0.55, -0.62, 0.56])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


def finish(rgb, alpha):
    img = np.dstack([to_srgb(rgb), np.clip(alpha, 0, 1)])
    im = Image.fromarray((img * 255 + 0.5).astype(np.uint8), "RGBA")
    return im.resize((SIZE, SIZE), Image.LANCZOS)


def pastel(base, hi, deep):
    px, py, d, inside, nx, ny, nz = grid()
    tint = base * 0.8 + np.ones(3) * 0.2
    lam = np.clip(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2], 0, 1)
    shade = 0.55 + 0.45 * lam
    rgb = tint[None, None, :] * shade[..., None]
    rgb = rgb * (1 - 0.18 * smooth(0.75, 1.0, d))[..., None] + deep[None, None, :] * (0.10 * smooth(0.75, 1.0, d))[..., None]
    spot = np.exp(-(((px + 0.34) ** 2) / 0.05 + ((py + 0.38) ** 2) / 0.03))
    rgb = rgb + (np.ones(3) * 0.55)[None, None, :] * spot[..., None]
    alpha = smooth(1.0, 1.0 - 4.0 / N, d)
    return finish(rgb, alpha)


def neon(base, hi, deep):
    px, py, d, inside, nx, ny, nz = grid()
    core = np.array([0.012, 0.010, 0.030])
    rgb = core[None, None, :] + deep[None, None, :] * (0.25 * (1 - d))[..., None]
    tube = np.exp(-((d - 0.83) ** 2) / 0.0028)
    glow_in = np.exp(-((d - 0.83) ** 2) / 0.03) * 0.55
    rgb = rgb + base[None, None, :] * (glow_in + 1.6 * tube)[..., None]
    rgb = rgb + hi[None, None, :] * (0.9 * np.exp(-((d - 0.83) ** 2) / 0.0006))[..., None]
    ang = np.arctan2(py, px)
    arc = np.exp(-((ang + 2.25) ** 2) / 0.12) * np.exp(-((d - 0.55) ** 2) / 0.004)
    rgb = rgb + (np.ones(3) * 0.7)[None, None, :] * arc[..., None]
    alpha = smooth(1.0, 1.0 - 4.0 / N, d)
    return finish(rgb, alpha)


def gem(base, hi, deep):
    px, py, d, inside, nx, ny, nz = grid()
    ang = np.arctan2(py, px)
    k = 8
    sector = np.floor((ang + np.pi) / (2 * np.pi) * k)
    mid = (sector + 0.5) / k * 2 * np.pi - np.pi
    ring = np.where(d < 0.45, 0, np.where(d < 0.8, 1, 2))
    tilt = np.array([0.0, 0.55, 0.85])[ring]
    fx = np.cos(mid) * tilt
    fy = np.sin(mid) * tilt
    fz = np.sqrt(np.clip(1 - tilt * tilt, 0, 1))
    lam = np.clip(fx * LIGHT[0] + fy * LIGHT[1] + fz * LIGHT[2], 0, 1)
    rgb = deep[None, None, :] * (1 - lam)[..., None] + base[None, None, :] * lam[..., None]
    rgb = rgb + hi[None, None, :] * (np.clip(lam - 0.72, 0, 1) * 2.2)[..., None]
    edge_a = np.abs(((ang + np.pi) / (2 * np.pi) * k) % 1 - 0.5)
    seam = smooth(0.47, 0.5, edge_a) * (ring > 0)
    seam = np.maximum(seam, np.exp(-((d - 0.45) ** 2) / 0.00025) + np.exp(-((d - 0.8) ** 2) / 0.00025))
    rgb = rgb * (1 - 0.35 * np.clip(seam, 0, 1))[..., None] + hi[None, None, :] * (0.25 * np.clip(seam, 0, 1))[..., None]
    for sx, sy, s in ((-0.3, -0.42, 0.0035), (0.38, -0.12, 0.0018), (-0.05, 0.42, 0.0012)):
        g = np.exp(-(((px - sx) ** 2) + ((py - sy) ** 2)) / s)
        rgb = rgb + (np.ones(3) * 1.2)[None, None, :] * g[..., None]
    alpha = smooth(1.0, 1.0 - 4.0 / N, d)
    return finish(rgb, alpha)


SKINS = {"pastel": pastel, "neon": neon, "gem": gem}

if __name__ == "__main__":
    for skin, fn in SKINS.items():
        for name, base, hi, deep in COLOURS:
            path = OUT / f"ball-{skin}-{name}.png"
            fn(lin(base), lin(hi), lin(deep)).save(path, optimize=True)
            print(path.relative_to(ROOT))
