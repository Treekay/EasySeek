"""Rebuild the SVG source and Chrome PNG icons. Requires Pillow (development only)."""
from pathlib import Path
from PIL import Image, ImageDraw

OUTPUT = Path(__file__).resolve().parents[1] / "icons"
BLUE = "#2166CC"
WHITE = "#FFFFFF"
RADIUS = 28
CENTER = (54, 54)
RING_RADIUS = 27
RING_STROKE = 10
HANDLE = [(75, 75), (99, 99)]
CHECK = [(42, 54), (51, 63), (67, 46)]


def build():
    OUTPUT.mkdir(exist_ok=True)
    OUTPUT.joinpath("easyseek.svg").write_text(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="title">
  <title id="title">EasySeek — find the right job</title>
  <rect width="128" height="128" rx="{RADIUS}" fill="{BLUE}"/>
  <g fill="none" stroke="{WHITE}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M75 75 99 99" stroke-width="12"/>
    <circle cx="54" cy="54" r="{RING_RADIUS}" stroke-width="{RING_STROKE}"/>
    <path d="M42 54 51 63 67 46" stroke-width="7"/>
  </g>
</svg>
''', encoding="utf-8")
    scale = 8
    image = Image.new("RGBA", (128 * scale, 128 * scale))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, 128 * scale - 1, 128 * scale - 1), radius=RADIUS * scale, fill=BLUE)

    def line(points, width):
        draw.line([(x * scale, y * scale) for x, y in points], fill=WHITE, width=width * scale, joint="curve")
        radius = width * scale / 2
        for x, y in points:
            draw.ellipse((x * scale - radius, y * scale - radius, x * scale + radius, y * scale + radius), fill=WHITE)

    line(HANDLE, 12)
    x, y = CENTER
    outer, inner = RING_RADIUS + RING_STROKE / 2, RING_RADIUS - RING_STROKE / 2
    draw.ellipse(((x - outer) * scale, (y - outer) * scale, (x + outer) * scale, (y + outer) * scale), fill=WHITE)
    draw.ellipse(((x - inner) * scale, (y - inner) * scale, (x + inner) * scale, (y + inner) * scale), fill=BLUE)
    line(CHECK, 7)
    for size in (16, 32, 48, 128):
        image.resize((size, size), Image.Resampling.LANCZOS).save(OUTPUT / f"icon-{size}.png")


if __name__ == "__main__":
    build()
