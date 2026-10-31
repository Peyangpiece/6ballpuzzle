#!/usr/bin/env python3
"""Render the ball designs of the trophy road: public/assets/ball-<skin>-<colour>.png.

Run: python3 tools/make-ball-skins.py   (needs Pillow and numpy)

Same 192 px size and the same five colours as the glass balls
(tools/make-balls.py, COLORS in public/app-01.js), so a design changes the
material and never the colour a player matches. Each is shaded per pixel in
a small studio (a large softbox at the upper left, a fill light at the right,
a dark floor), like the glass balls:
  pastel  glazed ceramic: soft wrapped diffuse light, a clear glaze that
          reflects the softboxes, a little occlusion underneath
  neon    smoked glass with a glowing tube of the colour inside, tilted in
          depth (the far side dimmer, seen through the glass), with bloom
  gem     a round brilliant seen from above: table, star, bezel and girdle
          facets, each reflecting the studio, with fire and sparkles
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


def tonemap(c):
    """Soft shoulder so bright reflections roll off instead of clipping."""
    return c / (1 + 0.35 * np.maximum(c - 0.65, 0))


R = 0.94
y, x = np.mgrid[0:N, 0:N].astype(np.float64)
PX = (x + 0.5) / N * 2 - 1
PY = (y + 0.5) / N * 2 - 1
D = np.sqrt(PX * PX + PY * PY) / R
NX, NY = PX / R, PY / R
NZ = np.sqrt(np.clip(1 - D * D, 0, 1))
ALPHA = smooth(1.0, 1.0 - 3.0 / N * 2, D)
KEY = np.array([-0.52, -0.6, 0.6]); KEY /= np.linalg.norm(KEY)


def softbox(rx, ry, cx, cy, hw, hh, soft, p=4.0):
    d = (np.abs((rx - cx) / hw) ** p + np.abs((ry - cy) / hh) ** p) ** (1 / p)
    return smooth(1.0 + soft, 1.0 - soft, d)


def studio(rx, ry, rz):
    """Radiance seen along a reflected direction."""
    up = np.clip(-ry * 0.5 + 0.5, 0, 1)
    env = 0.025 + 0.06 * up ** 2                                   # dim room, lighter above
    env = env + 2.4 * softbox(rx, ry, -0.46, -0.52, 0.30, 0.20, 0.25) * (rz > -0.2)
    env = env + 0.55 * softbox(rx, ry, 0.62, -0.05, 0.10, 0.34, 0.4) * (rz > -0.2)
    env = env + 0.10 * smooth(0.55, 0.95, ry)                       # bounce from the floor
    return env


def reflect_dir(nx, ny, nz):
    return 2 * nz * nx, 2 * nz * ny, 2 * nz * nz - 1


def fresnel(nz, f0):
    return f0 + (1 - f0) * (1 - np.clip(nz, 0, 1)) ** 5


def save(rgb, path):
    img = np.dstack([to_srgb(tonemap(rgb)), ALPHA])
    im = Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")
    im.resize((SIZE, SIZE), Image.LANCZOS).save(path, optimize=True)


def pastel(base, hi, deep):
    albedo = base * 0.78 + 0.22 * np.ones(3)
    ndl = NX * KEY[0] + NY * KEY[1] + NZ * KEY[2]
    wrap = np.clip((ndl + 0.35) / 1.35, 0, 1)
    fill = np.clip(NX * 0.8 + NZ * 0.6, 0, 1) * 0.18
    ao = 1 - 0.35 * smooth(0.1, 1.0, NY) * smooth(0.3, 1.0, D)
    diffuse = albedo[None, None, :] * ((0.12 + 0.95 * wrap + fill) * ao)[..., None]
    sss = (deep * 0.5 + base * 0.5)[None, None, :] * (0.10 * smooth(0.6, 1.0, D) * (1 - wrap))[..., None]
    rx, ry, rz = reflect_dir(NX, NY, NZ)
    glaze = studio(rx, ry, rz) * fresnel(NZ, 0.045)
    rgb = diffuse + sss + glaze[..., None] * np.ones(3)
    return rgb


def neon(base, hi, deep):
    # Smoked glass body.
    rgb = (np.array([0.010, 0.010, 0.022]) + deep * 0.06)[None, None, :] * (0.6 + 0.4 * NZ)[..., None]
    # A tube on a circle tilted in depth: front half bright, back half dimmed.
    tilt = np.radians(28)
    a, b = 0.64, 0.64 * np.cos(tilt)
    u, v = NX, NY
    q = np.sqrt((u / a) ** 2 + (v / b) ** 2)
    dist = np.abs(q - 1) * min(a, b)
    front = 0.42 + 0.58 * smooth(-0.22, 0.22, v)
    core = np.exp(-(dist ** 2) / 0.00045)
    tube = np.exp(-(dist ** 2) / 0.0030)
    bloom = np.exp(-(dist ** 2) / 0.030)
    glow = base[None, None, :] * (2.2 * tube + 0.55 * bloom)[..., None] + hi[None, None, :] * (2.6 * core)[..., None]
    rgb = rgb + glow * (front * (0.55 + 0.45 * NZ))[..., None]
    # Light from the tube on the inside of the glass near the rim.
    rgb = rgb + base[None, None, :] * (0.10 * smooth(0.8, 1.0, D))[..., None]
    rx, ry, rz = reflect_dir(NX, NY, NZ)
    rgb = rgb + (studio(rx, ry, rz) * fresnel(NZ, 0.05))[..., None] * np.ones(3)
    return rgb


def gem(base, hi, deep):
    ang = np.arctan2(NY, NX)
    sector = np.mod(ang + np.pi / 8, np.pi / 4) - np.pi / 8        # -22.5..22.5 deg within a bezel
    octa = D * np.cos(sector) / np.cos(np.pi / 8)                   # octagon distance
    table = octa < 0.44
    girdle = D > 0.86
    k8 = np.floor((ang + np.pi + np.pi / 8) / (np.pi / 4))          # bezel index
    k16 = np.floor((ang + np.pi) / (np.pi / 8))                     # girdle index
    # Star facets: triangles on each table edge pointing out to 0.64.
    edge = np.mod(ang + np.pi, np.pi / 4) - np.pi / 8               # 0 at a table edge centre
    star = (~table) & (octa < 0.44 + (0.64 - 0.44) * (1 - np.abs(edge) / (np.pi / 8))) & (~girdle)
    kind = np.where(table, 0, np.where(star, 1, np.where(girdle, 3, 2)))
    mid = np.where(kind == 3, (k16 + 0.5) * np.pi / 8 - np.pi, np.where(kind == 1, np.floor((ang + np.pi) / (np.pi / 4)) * np.pi / 4 + np.pi / 8 - np.pi, k8 * np.pi / 4 - np.pi))
    slope = np.array([0.0, 0.32, 0.62, 0.78])[kind]
    fx, fy = np.cos(mid) * slope, np.sin(mid) * slope
    fz = np.sqrt(np.clip(1 - slope ** 2, 0, 1))
    rx, ry, rz = reflect_dir(fx, fy, fz)
    refl = studio(rx, ry, rz)
    # Light coming back out through the stone: alternating facets, like a cut.
    fid = kind * 100 + np.where(kind == 3, k16, np.where(kind == 1, np.floor((ang + np.pi) / (np.pi / 4)), k8))
    h = np.mod(np.sin(fid * 12.9898) * 43758.5453, 1.0)
    inner = 0.22 + 0.78 * h
    lam = np.clip(fx * KEY[0] + fy * KEY[1] + fz * KEY[2], 0, 1)
    body = deep[None, None, :] * (1 - inner)[..., None] + base[None, None, :] * inner[..., None]
    body = body * (0.55 + 0.6 * lam)[..., None] + hi[None, None, :] * (np.clip(inner - 0.8, 0, 1) * 1.6)[..., None]
    rgb = body + (refl * fresnel(fz, 0.17) * 0.9)[..., None] * (np.ones(3) * 0.85 + base * 0.15)[None, None, :]
    # Fire: a touch of spectral colour on bright facets.
    fire = np.clip(refl - 0.6, 0, 2) * 0.12
    rgb = rgb + np.dstack([fire * (1 + np.sin(ang * 3)), fire * (1 + np.sin(ang * 3 + 2.1)), fire * (1 + np.sin(ang * 3 + 4.2))])
    # Facet edges.
    e1 = np.exp(-((octa - 0.44) ** 2) / 0.00004) * (D < 0.9)
    e2 = np.exp(-((D - 0.86) ** 2) / 0.00004)
    rays = np.exp(-(sector ** 2) / 0.0006) * smooth(0.44, 0.5, octa) * (D < 0.86)
    gird = np.exp(-((np.mod(ang + np.pi, np.pi / 8) - np.pi / 16) ** 2) / 0.0002) * girdle
    edges = np.clip(e1 + e2 + rays * 0.8 + gird * 0.6, 0, 1)
    rgb = rgb * (1 - 0.25 * edges)[..., None] + hi[None, None, :] * (0.35 * edges)[..., None]
    for sx, sy, s, k in ((-0.28, -0.36, 0.0012, 3.0), (0.36, -0.14, 0.0006, 1.6), (-0.06, 0.40, 0.0005, 1.0)):
        g = np.exp(-(((PX - sx) ** 2) + ((PY - sy) ** 2)) / s)
        cross = np.exp(-((PX - sx) ** 2) / 0.00002) * np.exp(-((PY - sy) ** 2) / 0.006) + np.exp(-((PY - sy) ** 2) / 0.00002) * np.exp(-((PX - sx) ** 2) / 0.006)
        rgb = rgb + (np.ones(3) * k)[None, None, :] * (g + 0.5 * cross)[..., None]
    rgb = rgb * (1 - 0.18 * smooth(0.9, 1.0, D))[..., None]
    return rgb


SKINS = {"pastel": pastel, "neon": neon, "gem": gem}

if __name__ == "__main__":
    for skin, fn in SKINS.items():
        for name, base, hi, deep in COLOURS:
            path = OUT / f"ball-{skin}-{name}.png"
            save(fn(lin(base), lin(hi), lin(deep)), path)
            print(path.relative_to(ROOT))
