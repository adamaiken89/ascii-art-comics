#!/usr/bin/env python3
"""
Render a comic fixture (panels + dialogue bubbles) to a single SVG file.

Usage:
  python3 scripts/render-comic-svg.py <input.json> [<output.svg>]

If output is omitted, writes to assets/examples/comics/<input-stem>.svg.
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
SCRIPT = ROOT / "scripts" / "comic-render.mjs"
DEFAULT_OUT = ROOT / "assets" / "examples" / "comics"


def main():
    if len(sys.argv) < 2:
        print("usage: render-comic-svg.py <input.json> [<output.svg>]")
        sys.exit(1)
    inp = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT / f"{inp.stem}.svg"
    out.parent.mkdir(parents=True, exist_ok=True)

    p = subprocess.run(
        ["node", str(SCRIPT)],
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


if __name__ == "__main__":
    main()
