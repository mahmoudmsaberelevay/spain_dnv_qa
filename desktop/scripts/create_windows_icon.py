from pathlib import Path
import sys

from PIL import Image


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: create_windows_icon.py <input.png> <output.ico>")

    input_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()
    if not input_path.is_file():
        raise SystemExit(f"Approved logo not found: {input_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.open(input_path).convert("RGBA")
    if image.width != image.height:
        side = max(image.width, image.height)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.alpha_composite(image, ((side - image.width) // 2, (side - image.height) // 2))
        image = canvas

    image.save(
        output_path,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


if __name__ == "__main__":
    main()
