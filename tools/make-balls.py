#!/usr/bin/env python3
"""Render the five ball sprites public/assets/ball-glass-*.png from scratch (original artwork).

Run: python3 tools/make-balls.py   (needs Pillow and numpy)

Each ball is a polished glass sphere lit like a studio product shot, computed
per pixel here (nothing is traced or copied):
  - body colour from light absorbed along the path through the glass, so the
    centre is deeper and the thin edge clearer;
  - light focused through the sphere glowing on the side away from the key
    light (caustic);
  - the reflection of a rectangular softbox (upper left) taken along the
    reflected view direction and weighted by Fresnel reflectance, plus a fine
    specular point;
  - a Fresnel rim, tinted by the glass, that keeps the silhouette crisp on the
    dark board on the side away from the light.
Colours follow COLORS in public/app-01.js.
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/assets"
SIZE, SS = 192, 4          # output size, supersampling factor
N = SIZE * SS
BALLS = [                  # (file, base, highlight, deep, inner design) as in COLORS
    ("red", "#FF3B4D", "#FFC8CC", "#7E0E1B", "catseye"),
    ("blue", "#2E86FF", "#BEDCFF", "#0C3781", "ripple"),
    ("green", "#2FD36E", "#BCF8D2", "#0C6234", "crackle"),
    ("yellow", "#FFB020", "#FFE9B8", "#8A5602", "sunburst"),
    ("purple", "#B255F0", "#E9CCFF", "#511D8C", "nebula"),
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


def softbox(rx, ry, cx, cy, hw, hh, soft, p=4.0):
    """A rounded rectangle in reflection space: 1 inside, soft edge."""
    d = (np.abs((rx - cx) / hw) ** p + np.abs((ry - cy) / hh) ** p) ** (1 / p)
    return smooth(1.0 + soft, 1.0 - soft, d)


def blurred_noise(seed, cells):
    """Smooth random field in [0, 1] on the N x N canvas, `cells` across."""
    rng = np.random.default_rng(seed)
    small = max(3, int(cells))
    im = Image.fromarray((rng.random((small, small)) * 255).astype(np.uint8), "L").resize((N, N), Image.BICUBIC)
    a = np.asarray(im, dtype=np.float64) / 255.0
    return (a - a.min()) / (a.max() - a.min() + 1e-9)


def inner_design(kind, px, py, r):
    """The design suspended inside the glass, as (light, dark) masks.

    px, py are the inner coordinates (magnified by the glass); r the radius on
    the silhouette. Each colour has its own traditional marble motif."""
    t = np.arctan2(py, px)
    q = np.sqrt(px * px + py * py)
    fade = smooth(0.92, 0.55, r)
    zero = np.zeros_like(px)
    if kind == "catseye":       # three broad, softly twisted vanes from the core
        vane = np.cos(3 * (t + 1.6 * q - 0.35))
        body = smooth(0.35, 0.92, vane) * smooth(0.0, 0.1, q) * smooth(0.78, 0.3, q)
        edge = smooth(0.86, 0.99, vane) * smooth(0.05, 0.15, q) * smooth(0.8, 0.4, q)
        return np.clip(body * 0.7 + edge * 0.5, 0, 1) * fade, smooth(-0.1, -0.9, vane) * 0.35 * fade
    if kind == "ripple":        # light dancing on water: a soft caustic net
        n1 = blurred_noise(11, 5) * 4.0
        n2 = blurred_noise(12, 5) * 4.0
        net = np.abs(np.sin(px * 7.5 + n1)) * np.abs(np.sin(py * 7.5 + n2))
        caustic = smooth(0.7, 0.97, 1 - np.abs(np.sin(px * 6.0 + py * 2.0 + n1) * np.sin(py * 6.0 - px * 2.0 + n2)))
        light = np.clip(caustic * 0.8 + smooth(0.75, 1.0, net) * 0.25, 0, 1) * smooth(0.95, 0.25, q)
        return light * fade * 0.8, smooth(0.4, 0.0, net) * 0.18 * fade
    if kind == "crackle":       # fine internal fractures at different depths
        rng = np.random.default_rng(7)
        pts = rng.uniform(-1.1, 1.1, (60, 2))
        d = np.stack([np.hypot(px - x0, py - y0) for x0, y0 in pts])
        idx = d.argmin(axis=0)
        d.sort(axis=0)
        gap = d[1] - d[0]
        depth = (0.35 + 0.65 * rng.random(60))[idx]
        crack = smooth(0.016, 0.0, gap) * depth
        glint = smooth(0.006, 0.0, gap) * depth
        return np.clip(crack * 0.6 + glint * 0.5, 0, 1) * fade, smooth(0.0, 0.12, gap) * 0.1 * fade
    if kind == "sunburst":      # silky rays from a glowing core
        rng = np.random.default_rng(5)
        ray = np.zeros_like(px)
        for a0, ln, w0 in zip(np.linspace(0, 2 * np.pi, 28, endpoint=False) + rng.uniform(-0.08, 0.08, 28), rng.uniform(0.45, 0.85, 28), rng.uniform(0.018, 0.035, 28)):
            da = np.angle(np.exp(1j * (t - a0)))
            ray = np.maximum(ray, np.exp(-(da * q / w0) ** 2) * smooth(ln, ln * 0.4, q))
        light = ray * smooth(0.04, 0.18, q)
        core = np.exp(-(q / 0.2) ** 2)
        return np.clip(light * 0.75 + core * 0.75, 0, 1) * fade, zero
    if kind == "nebula":        # cloudy depth with a few sparkling stars
        cloud = blurred_noise(21, 5) * 0.55 + blurred_noise(22, 11) * 0.45
        light = smooth(0.45, 0.95, cloud) * 0.55
        rng = np.random.default_rng(9)
        sp = np.zeros_like(px)
        for x0, y0, s0 in zip(rng.uniform(-0.75, 0.75, 22), rng.uniform(-0.75, 0.75, 22), rng.uniform(0.012, 0.03, 22)):
            dx, dy = px - x0, py - y0
            star = np.exp(-(dx * dx + dy * dy) / (s0 * s0))
            star += 0.5 * np.exp(-(dx * dx) / (s0 * 0.12) ** 2 - (dy * dy) / (s0 * 3.5) ** 2)
            star += 0.5 * np.exp(-(dy * dy) / (s0 * 0.12) ** 2 - (dx * dx) / (s0 * 3.5) ** 2)
            sp = np.maximum(sp, star)
        return np.clip(light + sp, 0, 1) * fade, smooth(0.5, 0.15, cloud) * 0.35 * fade
    return zero, zero


def render(base, hi, deep, kind):
    base, hi, deep = lin(base), lin(hi), lin(deep)
    y, x = np.mgrid[0:N, 0:N]
    R = N / 2 - SS * 1.2
    nx, ny = (x + 0.5 - N / 2) / R, (y + 0.5 - N / 2) / R
    rr = nx * nx + ny * ny
    r = np.sqrt(rr)
    nz = np.sqrt(np.clip(1 - rr, 0, 1))
    L = np.array([-0.55, -0.6, 0.58]); L /= np.linalg.norm(L)
    ndl = nx * L[0] + ny * L[1] + nz * L[2]
    fres = 0.04 + 0.96 * np.power(1 - nz, 5)
    away = np.clip(nx * 0.62 + ny * 0.78, -1, 1)          # towards the lower right

    # Tinted glass: colour deepens with the path length through it.
    sigma = -np.log(np.clip(base, 1e-3, 1)) * 0.85
    tint = np.exp(-sigma[None, None, :] * (0.45 + 1.2 * nz)[..., None])
    col = tint * (0.5 + 0.35 * smooth(-0.4, 0.9, ndl))[..., None]
    # The inner design, seen through the glass (magnified towards the edge).
    mag = 0.78 + 0.22 * nz
    lightm, darkm = inner_design(kind, nx * mag, ny * mag, r)
    col = col + (deep - col) * darkm[..., None]
    col = col + (hi * 0.85 + 0.15 - col) * (lightm * (0.55 + 0.35 * smooth(-0.5, 0.8, ndl)))[..., None]
    # Light refracted through the ball gathers on the far side.
    glow = np.exp(-(((nx - 0.3) / 0.5) ** 2 + ((ny - 0.36) / 0.44) ** 2))
    cres = smooth(0.55, 0.86, r) * smooth(0.99, 0.9, r) * smooth(0.1, 0.75, away)
    col = col + (hi * 0.5 + base * 0.7)[None, None, :] * (glow * 0.4 + cres * 0.8)[..., None]
    # Edge: darker glass where it turns away from the light.
    edge = smooth(0.8, 1.0, r) * smooth(0.4, -0.5, away)
    col = col + (deep * 0.55 - col) * (edge * 0.7)[..., None]
    # Reflections: softbox window, its faint bounce, specular point, rim line.
    ang = np.deg2rad(-35)
    u = (nx + 0.33) * np.cos(ang) - (ny + 0.43) * np.sin(ang)
    v = (nx + 0.33) * np.sin(ang) + (ny + 0.43) * np.cos(ang)
    oval = (u / 0.21) ** 2 + (v / 0.12) ** 2
    key = smooth(1.0, 0.82, oval) * (0.35 + 0.65 * smooth(0.1, -0.1, v))
    u2 = (nx - 0.48) * np.cos(ang) - (ny - 0.52) * np.sin(ang)
    v2 = (nx - 0.48) * np.sin(ang) + (ny - 0.52) * np.cos(ang)
    bounce = softbox(u2, v2 - 0.6 * u2 * u2, 0.0, 0.0, 0.13, 0.035, 0.6) * 0.4
    H = L + np.array([0.0, 0.0, 1.0]); H /= np.linalg.norm(H)
    spec = np.power(np.clip(nx * H[0] + ny * H[1] + nz * H[2], 0, 1), 260) * 1.5
    rimline = smooth(0.93, 0.965, r) * smooth(0.995, 0.975, r) * (0.2 + 0.5 * smooth(-0.2, 0.7, away))
    refl = np.clip(key * 0.92 + bounce + spec + rimline * 0.45 + fres * 0.12, 0, 1.4)
    col = col + (1 - col) * np.clip(refl, 0, 1)[..., None]

    # Transparency: the board shows faintly through the middle; the edge
    # (Fresnel), the inner design, the glow and the reflections are opaque.
    lum = col @ np.array([0.2126, 0.7152, 0.0722])
    a = 0.8 + 0.2 * smooth(0.55, 0.98, r)
    a = np.maximum(a, np.clip(lum * 1.2 + lightm * 0.5, 0, 1))
    a = np.maximum(a, np.clip(refl, 0, 1))
    cover = np.clip((1 - r) * R / SS + 0.5, 0, 1)
    img = np.dstack([to_srgb(col), np.clip(a, 0, 1) * cover])
    big = Image.fromarray((np.clip(img, 0, 1) * 255).round().astype(np.uint8), "RGBA")
    return big.resize((SIZE, SIZE), Image.LANCZOS)


if __name__ == "__main__":
    import sys
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT
    for name, base, hi, deep, kind in BALLS:
        render(base, hi, deep, kind).save(out / f"ball-glass-{name}.png", optimize=True)
        print("wrote", out / f"ball-glass-{name}.png")
