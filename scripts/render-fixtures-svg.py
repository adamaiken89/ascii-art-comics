#!/usr/bin/env python3
"""
Render every fixture as SVG (Stage 2 SVG variant).

Output: assets/examples/fixtures/renders-svg/<name>.svg
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
FIX = ROOT / "assets" / "examples" / "fixtures"
OUT = FIX / "renders-svg"
OUT.mkdir(parents=True, exist_ok=True)

SVG_SCRIPT = ROOT / "scripts" / "svg-render.mjs"


def run(stdin: str) -> dict:
    p = subprocess.run(
        ["node", str(SVG_SCRIPT)],
        input=stdin.encode("utf-8"),
        capture_output=True,
        check=False,
    )
    if p.returncode not in (0, 1):
        sys.stderr.write(p.stderr.decode("utf-8"))
        sys.exit(2)
    return json.loads(p.stdout)


def main() -> int:
    fails = 0
    for fx in sorted(FIX.glob("*.json")):
        name = fx.stem
        print(f"=== {name} ===")
        data = json.loads(fx.read_text(encoding="utf-8"))

        # Style C is borderless — skip SVG render
        styles = {p.get("style", "A") for p in data.get("panels", [])}
        if styles == {"C"}:
            print("  style C: borderless, skipping")
            continue

        # Build SVG request from fixture
        svg_req = {
            "panels": [],
            "layout": data.get("layout", {"cols": 0, "gap": 3}),
            "cell": {"w": 8, "h": 16},
            "padding": 8,
        }
        for p in data["panels"]:
            svg_req["panels"].append(
                {
                    "panelId": p["panelId"],
                    "style": p.get("style", "A"),
                    "width": data.get("defaultTarget", 28),
                    "lines": p["lines"],
                }
            )
        result = run(json.dumps(svg_req))
        if not result.get("ok"):
            print(f"  FAIL: {result.get('error')}")
            fails += 1
            continue
        (OUT / f"{name}.svg").write_text(result["svg"], encoding="utf-8")
        print(f"  wrote: {name}.svg ({result['width']}x{result['height']})")

    if fails:
        print(f"\n{fails} failed")
        return 1
    print("\nall rendered")
    return 0


if __name__ == "__main__":
    sys.exit(main())
