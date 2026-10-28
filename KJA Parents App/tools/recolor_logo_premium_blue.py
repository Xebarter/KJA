"""Recolor Parents App crest to a premium blue palette and rebuild app-icon."""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SRC_LOGO = ASSETS / "kja-logo.png"
SRC_ICON = ASSETS / "app-icon.png"
# Prefer an untouched red original if we already recolored once.
BACKUP_LOGO = ASSETS / "kja-logo-original-red.png"
BACKUP_ICON = ASSETS / "app-icon-original.png"


def remap(r: int, g: int, b: int, a: int) -> tuple[int, int, int, int]:
    if a < 8:
        return (r, g, b, a)

    mx = max(r, g, b)
    mn = min(r, g, b)
    sat = 0.0 if mx == 0 else (mx - mn) / mx
    br = mx / 255.0

    # Keep whites / near-whites.
    if r > 230 and g > 230 and b > 230:
        return (r, g, b, a)
    if sat < 0.12 and br > 0.75:
        return (r, g, b, a)

    # Yellow / gold accents -> champagne gold #D4AF37
    if r > 140 and g > 100 and b < 120 and r >= g and (r - b) > 40:
        t = 0.55 + 0.45 * br
        return (int(212 * t), int(175 * t), int(55 * t), a)

    # Brown stool -> muted blue-gray wood
    if r > 80 and g > 40 and b < 80 and r > g > b and sat > 0.15 and br < 0.7:
        t = 0.4 + 0.5 * br
        return (int(55 * t + 30), int(70 * t + 35), int(95 * t + 40), a)

    # Red elephant body -> sapphire #1E5FA8
    if r > 100 and r > g * 1.15 and r > b * 1.15 and sat > 0.2:
        shade = 0.55 + 0.55 * br
        return (int(30 * shade), int(95 * shade), int(168 * shade), a)

    # Black / dark (ring, gown, cap, book, shoes) -> deep premium navy #0B3D6E
    if br < 0.28 or (sat < 0.25 and br < 0.45):
        shade = 0.35 + 0.9 * br
        return (int(11 * shade + 8), int(61 * shade + 12), int(110 * shade + 18), a)

    # Leftover warm tones -> cool blue
    if r > b and sat > 0.15:
        shade = 0.5 + 0.5 * br
        return (int(40 * shade), int(90 * shade), int(150 * shade), a)

    return (r, g, b, a)


def recolor(img: Image.Image) -> Image.Image:
    src = img.convert("RGBA")
    out = Image.new("RGBA", src.size)
    spx = src.load()
    opx = out.load()
    w, h = src.size
    for y in range(h):
        for x in range(w):
            opx[x, y] = remap(*spx[x, y])
    return out


def build_app_icon(crest: Image.Image, size: int = 1024) -> Image.Image:
    # Premium blue square + soft inner disc + crest.
    bg = Image.new("RGBA", (size, size), (10, 47, 92, 255))  # #0A2F5C
    draw = ImageDraw.Draw(bg)
    draw.ellipse([40, 40, size - 40, size - 40], fill=(22, 78, 140, 255))  # #164E8C
    pad = 72
    box = size - pad * 2
    crest_fit = crest.resize((box, box), Image.Resampling.LANCZOS)
    bg.paste(crest_fit, (pad, pad), crest_fit)
    return bg


def main() -> None:
    source = BACKUP_LOGO if BACKUP_LOGO.exists() else SRC_LOGO
    original = Image.open(source)

    if not BACKUP_LOGO.exists():
        original.save(BACKUP_LOGO)
    if SRC_ICON.exists() and not BACKUP_ICON.exists():
        Image.open(SRC_ICON).save(BACKUP_ICON)

    crest = recolor(original)
    crest.save(SRC_LOGO)

    icon = build_app_icon(crest)
    icon.save(SRC_ICON)
    print(f"Wrote {SRC_LOGO}")
    print(f"Wrote {SRC_ICON}")


if __name__ == "__main__":
    main()
