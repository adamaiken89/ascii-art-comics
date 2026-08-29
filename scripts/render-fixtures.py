#!/usr/bin/env python3
"""
Render every fixture in assets/examples/fixtures/*.json through the full
Stage 1 → Stage 2 pipeline and write the rendered block to
assets/examples/fixtures/renders/<name>.txt.

Exits 1 if any fixture fails.
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
FIX = ROOT / "assets" / "examples" / "fixtures"
OUT = FIX / "renders"
OUT.mkdir(parents=True, exist_ok=True)

CG = ROOT / "scripts" / "content-generator.mjs"
WRAP = ROOT / "scripts" / "box-wrap.mjs"

STYLE_MAP = {"A": "A", "B": "B", "C": "C"}


def run(script: Path, stdin: str) -> dict:
    p = subprocess.run(
        ["node", str(script)],
        input=stdin.encode("utf-8"),
        capture_output=True,
        check=False,
    )
    if p.returncode not in (0, 1):
        sys.stderr.write(f"{script.name} exit {p.returncode}\n{p.stderr.decode('utf-8')}\n")
        sys.exit(2)
    return json.loads(p.stdout)


def main() -> int:
    fixtures = sorted(FIX.glob("*.json"))
    fixtures = [f for f in fixtures if not f.name.startswith("bubbles-")]
    if not fixtures:
        print("no panel fixtures found")
        return 1

    fails = 0
    for fx in fixtures:
        name = fx.stem
        print(f"=== {name} ===")
        raw = fx.read_text(encoding="utf-8")

        # Stage 1
        cg = run(CG, raw)
        cg_ok = cg.get("ok", False)
        print(f"  stage1: {cg_ok}")
        if not cg_ok:
            print(f"  errors: {cg.get('errors')}")
            fails += 1
            continue

        # Build Stage 2 input. Style comes from the ORIGINAL fixture, since
        # Stage 1 strips it (it is consumed by Stage 2, not validated).
        # Style C (stick-noir) has no borders — emit content directly.
        orig = json.loads(raw)
        wrap_in = {"panels": [], "layout": orig.get("layout", {"cols": 0, "gap": 3})}
        orig_panels = {p.get("panelId"): p for p in orig.get("panels", [])}
        styles_used = set()
        for p in cg["panels"]:
            src = orig_panels.get(p["panelId"], {})
            style = STYLE_MAP.get(src.get("style", "A"), "A")
            styles_used.add(style)
            wrap_in["panels"].append(
                {
                    "style": style,
                    "width": p["target"],
                    "lines": p["lines"],
                }
            )

        # All Style C → skip box, emit raw content
        if styles_used == {"C"}:
            block = "\n\n".join("\n".join(p["lines"]) for p in wrap_in["panels"])
            (OUT / f"{name}.txt").write_text(block, encoding="utf-8")
            print(f"  style C (no border) wrote: renders/{name}.txt")
            continue

        # Mixed styles: if any non-C, force style C content into style A box
        # (borderless style would break grid layout). For now, refuse.
        if "C" in styles_used:
            print("  WARN: mixed C with bordered styles — boxing all as A")
            for p in wrap_in["panels"]:
                p["style"] = "A"

        # Stage 2
        wr = run(WRAP, json.dumps(wrap_in))
        wr_ok = wr.get("ok", False)
        print(f"  stage2: {wr_ok}  outerW: {wr.get('outerW')}")
        if not wr_ok:
            print(f"  errors: {wr.get('errors')}")
            fails += 1
            continue

        # Write rendered block
        (OUT / f"{name}.txt").write_text(wr["block"], encoding="utf-8")
        print(f"  wrote: renders/{name}.txt")

    if fails:
        print(f"\n{fails} fixture(s) failed")
        return 1
    print("\nall fixtures rendered")
    return 0


if __name__ == "__main__":
    sys.exit(main())
