from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "elevay.ico"
PNG_OUTPUT = ROOT / "assets" / "elevay-mac.png"
ICNS_OUTPUT = ROOT / "assets" / "elevay.icns"

CANVAS_SIZE = 1024
BACKGROUND = (7, 17, 31, 255)
BORDER = (91, 163, 184, 110)


def build_icon() -> Image.Image:
    source = Image.open(SOURCE).convert("RGBA")
    alpha_bounds = source.getchannel("A").getbbox()
    if alpha_bounds is None:
        raise RuntimeError("Source ELEVAY icon has no visible pixels")
    source = source.crop(alpha_bounds)
    scale = 620 / max(source.size)
    source = source.resize(
        (round(source.width * scale), round(source.height * scale)),
        Image.Resampling.LANCZOS,
    )

    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    bounds = (54, 54, CANVAS_SIZE - 54, CANVAS_SIZE - 54)
    draw.rounded_rectangle(bounds, radius=210, fill=BACKGROUND, outline=BORDER, width=8)

    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_source = Image.new("RGBA", source.size, (0, 0, 0, 0))
    alpha = source.getchannel("A")
    shadow_source.putalpha(alpha.point(lambda value: int(value * 0.38)))
    shadow_x = (CANVAS_SIZE - source.width) // 2 + 18
    shadow_y = (CANVAS_SIZE - source.height) // 2 + 26
    shadow.alpha_composite(shadow_source, (shadow_x, shadow_y))
    canvas.alpha_composite(shadow)

    x = (CANVAS_SIZE - source.width) // 2
    y = (CANVAS_SIZE - source.height) // 2 - 6
    canvas.alpha_composite(source, (x, y))
    return canvas


def main() -> None:
    icon = build_icon()
    icon.save(PNG_OUTPUT, format="PNG", optimize=True)
    icon.save(
        ICNS_OUTPUT,
        format="ICNS",
        sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)],
    )

    with Image.open(ICNS_OUTPUT) as generated:
        if generated.format != "ICNS" or generated.size != (1024, 1024):
            raise RuntimeError("Generated macOS icon is not a valid 1024px ICNS asset")

    print(f"png={PNG_OUTPUT} ({PNG_OUTPUT.stat().st_size} bytes)")
    print(f"icns={ICNS_OUTPUT} ({ICNS_OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
