#!/usr/bin/env python3
"""Build the app's two web fonts (family "DropBall", see public/index.html).

  python3 tools/subset-fonts.py InterVariable.ttf "MPLUS1[wght].ttf"

- public/assets/fonts/dropball-latin.woff2: Inter 4 (variable weight and
  optical size, so large text uses Inter Display like the logo), Latin only.
- public/assets/fonts/dropball-jp.woff2: M PLUS 1 (variable weight), kana,
  CJK punctuation, full-width forms and every other character the UI uses
  (collected from public/*.js and public/index.html). Kanji outside the UI
  (for example in a nickname) fall back to the system font.

Sources: https://github.com/rsms/inter (v4.1) and
https://github.com/google/fonts/tree/main/ofl/mplus1; both SIL OFL 1.1
(licences in public/assets/fonts/). Run again after changing UI text.
"""
import glob, os, re, sys
from fontTools import subset

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "public", "assets", "fonts")
LATIN = list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x2190, 0x2191, 0x2192, 0x2193, 0x00D7]
KANA = list(range(0x3000, 0x3040)) + list(range(0x3041, 0x3097)) + list(range(0x309B, 0x30FF)) + list(range(0xFF01, 0xFF5F))


def ui_characters():
    chars = set()
    for path in glob.glob(os.path.join(ROOT, "public", "*.js")) + [os.path.join(ROOT, "public", "index.html")]:
        text = open(path, encoding="utf-8").read()
        chars.update(text)
        chars.update(chr(int(h, 16)) for h in re.findall(r"\\u([0-9a-fA-F]{4})", text))
    return {ord(c) for c in chars if ord(c) >= 0x2000}


def build(src, dst, unicodes):
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    font = subset.load_font(src, options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=sorted(unicodes))
    subsetter.subset(font)
    subset.save_font(font, dst, options)
    print(f"{os.path.relpath(dst, ROOT)}: {os.path.getsize(dst) // 1024} KB, {len(unicodes)} code points")


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    os.makedirs(OUT, exist_ok=True)
    build(sys.argv[1], os.path.join(OUT, "dropball-latin.woff2"), set(LATIN))
    build(sys.argv[2], os.path.join(OUT, "dropball-jp.woff2"), set(KANA) | ui_characters())


if __name__ == "__main__":
    main()
