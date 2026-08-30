#!/usr/bin/env python3
"""
Render template-based comics to SVG.

Usage:
  python3 scripts/render-template.py <content.json> [<output.svg>]

Default output: assets/examples/comics/<content-stem>.svg
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
SCRIPT = ROOT / "scripts" / "template-render.ts"
DEFAULT_OUT = ROOT / "assets" / "examples" / "comics"


def main():
    if len(sys.argv) < 2:
        print("usage: render-template.py <content.json> [<output.svg>]", file=sys.stderr)
        sys.exit(1)
    inp = Path(sys.argv[1])
    if not inp.exists():
        print(f"not found: {inp}", file=sys.stderr)
        sys.exit(1)
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT / f"{inp.stem}.svg"
    out.parent.mkdir(parents=True, exist_ok=True)

    p = subprocess.run(
        ["bun", str(SCRIPT), str(inp), str(out)],
        capture_output=True,
        check=False,
    )
    if p.returncode != 0:
        sys.stderr.write(p.stderr.decode("utf-8"))
        sys.exit(p.returncode)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
