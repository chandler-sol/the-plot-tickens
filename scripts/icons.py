"""Render the app icon set from one drawing. Usage: python3 scripts/icons.py  (requires Pillow)."""
import math
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
PAPER = (244, 239, 230)
INK = (43, 41, 38)
ACCENT = (138, 106, 62)


def draw(size: int, content_scale: float = 1.0, transparent: bool = False) -> Image.Image:
    ss = 4
    S = size * ss
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0) if transparent else PAPER + (255,))
    d = ImageDraw.Draw(img)
    c = S / 2
    k = content_scale
    r = S * 0.34 * k
    w = max(2, int(S * 0.024 * k))
    d.ellipse([c - r, c - r, c + r, c + r], outline=INK, width=w)
    # twelve small ticks, like a printer's ornament
    for i in range(12):
        a = math.radians(i * 30)
        r1, r2 = r * (0.84 if i % 3 else 0.78), r * 0.92
        d.line([c + r1 * math.sin(a), c - r1 * math.cos(a), c + r2 * math.sin(a), c - r2 * math.cos(a)], fill=INK, width=max(1, int(w * (0.8 if i % 3 else 1.0))))

    def hand(deg: float, length: float, width: int, color):
        a = math.radians(deg)
        x, y = c + length * math.sin(a), c - length * math.cos(a)
        d.line([c, c, x, y], fill=color, width=width)
        d.ellipse([x - width / 2, y - width / 2, x + width / 2, y + width / 2], fill=color)

    hand(-60, r * 0.5, int(w * 1.6), INK)  # hour hand toward ten
    hand(58, r * 0.72, int(w * 1.1), ACCENT)  # minute hand toward two
    cr = w * 1.4
    d.ellipse([c - cr, c - cr, c + cr, c + cr], fill=INK)
    return img.resize((size, size), Image.LANCZOS)


def save(img: Image.Image, name: str, flatten: bool = True):
    if flatten:
        bg = Image.new("RGB", img.size, PAPER)
        bg.paste(img, mask=img.split()[3])
        img = bg
    img.save(OUT / name, optimize=True)


OUT.mkdir(parents=True, exist_ok=True)
for s in (192, 512):
    save(draw(s), f"icon-{s}.png")
    save(draw(s, content_scale=0.78), f"maskable-{s}.png")
for s, n in ((180, "apple-touch-icon.png"), (152, "apple-touch-icon-152.png"), (167, "apple-touch-icon-167.png")):
    save(draw(s, content_scale=0.92), n)
save(draw(32, content_scale=1.3), "favicon-32.png")
save(draw(64, content_scale=1.3), "favicon-64.png")

svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="12" fill="rgb{PAPER}"/>
<circle cx="32" cy="32" r="25" fill="none" stroke="rgb{INK}" stroke-width="2.6"/>
<line x1="32" y1="32" x2="{32 + 12.5 * math.sin(math.radians(-60)):.2f}" y2="{32 - 12.5 * math.cos(math.radians(-60)):.2f}" stroke="rgb{INK}" stroke-width="4" stroke-linecap="round"/>
<line x1="32" y1="32" x2="{32 + 18 * math.sin(math.radians(58)):.2f}" y2="{32 - 18 * math.cos(math.radians(58)):.2f}" stroke="rgb{ACCENT}" stroke-width="2.8" stroke-linecap="round"/>
<circle cx="32" cy="32" r="3" fill="rgb{INK}"/>
</svg>
"""
(OUT / "favicon.svg").write_text(svg)
print("icons written to", OUT)
