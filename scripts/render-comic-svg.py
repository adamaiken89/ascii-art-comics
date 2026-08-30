#!/usr/bin/env python3
"""
Render a comic fixture (panels + dialogue bubbles) to a single SVG file,
and rasterize to JPEG for embedding in markdown.

Usage:
  python3 scripts/render-comic-svg.py <input.json> [<output.svg>]

If output is omitted, writes to assets/examples/comics/<input-stem>.svg.
Also writes <stem>.jpg next to it (for README embedding).
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
SCRIPT = ROOT / "scripts" / "comic-render.ts"
DEFAULT_OUT = ROOT / "assets" / "examples" / "comics"


def rasterize_jpeg(svg_path: Path, jpeg_path: Path) -> None:
    """Convert SVG → PNG (via rsvg-convert) → JPEG (via PIL)."""
    rsvg = shutil.which("rsvg-convert")
    if not rsvg:
        print("WARN: rsvg-convert not found, skipping JPEG")
        return
    tmp_png = svg_path.with_suffix(".png.tmp")
    subprocess.run(
        [rsvg, "-o", str(tmp_png), str(svg_path)],
        check=True,
    )
    try:
        from PIL import Image
        img = Image.open(tmp_png).convert("RGB")
        img.save(jpeg_path, "JPEG", quality=90)
        print(f"wrote {jpeg_path} ({img.size[0]}x{img.size[1]})")
    except ImportError:
        print("WARN: PIL not available, skipping JPEG")
    finally:
        tmp_png.unlink(missing_ok=True)


def main():
    if len(sys.argv) < 2:
        print("usage: render-comic-svg.py <input.json> [<output.svg>]")
        sys.exit(1)
    inp = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT / f"{inp.stem}.svg"
    out.parent.mkdir(parents=True, exist_ok=True)

    p = subprocess.run(
        ["bun", str(SCRIPT)],
        input=inp.read_bytes(),
        capture_output=True,
        check=False,
    )
    if p.returncode not in (0, 1):
        sys.stderr.write(p.stderr.decode("utf-8"))
        sys.exit(2)

    result = json.loads(p.stdout)
    if not result.get("ok"):
        print(f"FAIL: {result.get('errors')}")
        sys.exit(1)

    out.write_text(result["svg"], encoding="utf-8")
    print(f"wrote {out} ({result['width']}x{result['height']})")

    jpeg_out = out.with_suffix(".jpg")
    rasterize_jpeg(out, jpeg_out)


if __name__ == "__main__":
    main()
