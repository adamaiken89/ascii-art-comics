#!/usr/bin/env python3
"""
Render a bubble fixture to a standalone SVG file.
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
FIX = ROOT / "assets" / "examples" / "fixtures"
OUT = FIX / "renders-svg"
OUT.mkdir(parents=True, exist_ok=True)
BUBBLE = ROOT / "scripts" / "bubble-render.mjs"


def render_bubbles(request: dict, name: str):
    p = subprocess.run(
        ["node", str(BUBBLE)],
        input=json.dumps(request).encode("utf-8"),
        capture_output=True,
        check=False,
    )
    if p.returncode not in (0, 1):
        sys.stderr.write(p.stderr.decode("utf-8"))
        sys.exit(2)
    result = json.loads(p.stdout)
    if not result.get("ok"):
        return False

    # Wrap in standalone SVG with white background
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 540 220" width="540" height="220">'
        f'<rect x="0" y="0" width="540" height="220" fill="white"/>'
        f'{result["svg"]}'
        f'</svg>'
    )
    (OUT / f"{name}.svg").write_text(svg, encoding="utf-8")
    return True


def main():
    bubble_fixtures = sorted(FIX.glob("bubbles-*.json"))
    if not bubble_fixtures:
        print("no bubble fixtures found")
        return 1
    for fx in bubble_fixtures:
        request = json.loads(fx.read_text(encoding="utf-8"))
        ok = render_bubbles(request, fx.stem)
        print(f"{'PASS' if ok else 'FAIL'}  {fx.stem}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
