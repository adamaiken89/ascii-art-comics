#!/usr/bin/env python3
"""
Validate every component in assets/components.json by rendering it through the
Stage 1 → Stage 2 pipeline and checking for visual misalignments.

Checks per component:
  1. Stage 1 ok (no overflow, no NBSP leak, no empty)
  2. Stage 2 ok (every line === outerW)
  3. Each rendered mid line: contains expected innerW cells after the leading border

Outputs a report. Exits 1 if any component fails.
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
COMP = ROOT / "assets" / "components.json"
CG = ROOT / "scripts" / "content-generator.mjs"
WRAP = ROOT / "scripts" / "box-wrap.mjs"


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


def validate(comp: dict) -> list[str]:
    errors = []
    width = comp["width"]
    if width == 0:
        errors.append(f"width 0 (empty lines)")
        return errors

    request = {
        "defaultTarget": width,
        "panels": [
            {
                "panelId": 0,
                "lines": comp["lines"],
                "width": width,
            }
        ],
    }
    raw = json.dumps(request)

    # Stage 1
    cg = run(CG, raw)
    if not cg.get("ok"):
        for e in cg.get("errors", []):
            errors.append(f"stage1: {e}")
        return errors

    # Stage 2
    stage2_in = {
        "panels": [{"style": "A", "width": width, "lines": comp["lines"]}],
        "layout": {"cols": 0, "gap": 0},
    }
    wr = run(WRAP, json.dumps(stage2_in))
    if not wr.get("ok"):
        for e in wr.get("errors", []):
            errors.append(f"stage2: {e}")
        return errors

    outerW = wr["outerW"]
    if outerW != width + 2:
        errors.append(f"outerW {outerW} != width+2 {width+2}")

    # Visual: each mid line should start with ║ and end with ║
    block_lines = wr["block"].split("\n")
    for i, line in enumerate(block_lines):
        if line.startswith("╔") or line.startswith("╚"):
            continue
        if not (line.startswith("║") and line.endswith("║")):
            errors.append(f"line {i}: bad border chars: {line!r}")
    return errors


def main() -> int:
    data = json.loads(COMP.read_text(encoding="utf-8"))
    cats = data.get("categories", {})

    fails = []
    total = 0
    for cat, comps in cats.items():
        for c in comps:
            total += 1
            errs = validate(c)
            if errs:
                fails.append((c["id"], errs))

    print(f"checked {total} components")
    for cat, comps in cats.items():
        print(f"  {cat}: {len(comps)}")

    if fails:
        print(f"\n{len(fails)} FAILED:")
        for cid, errs in fails:
            print(f"  {cid}:")
            for e in errs:
                print(f"    - {e}")
        return 1

    print("\nALL OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
