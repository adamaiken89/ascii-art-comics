#!/usr/bin/env python3
"""
Render every component centered in a 40-wide panel (style A) and emit a visual
report. Use this to spot misalignments, trailing whitespace, broken borders.

Output: assets/components-renders/<category>_<name>.txt
"""

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent.parent
COMP = ROOT / "assets" / "components.json"
OUT = ROOT / "assets" / "components-renders"
CG = ROOT / "scripts" / "content-generator.mjs"
WRAP = ROOT / "scripts" / "box-wrap.mjs"

PANEL_W = 40


def run(script: Path, stdin: str) -> dict:
    p = subprocess.run(
        ["node", str(script)],
        input=stdin.encode("utf-8"),
        capture_output=True,
        check=False,
    )
    return json.loads(p.stdout)


def render(comp: dict) -> str:
    # Center lines in PANEL_W
    width = comp["width"]
    if width == 0:
        return ""
    pad = max(0, (PANEL_W - width) // 2)
    padded_lines = [(" " * pad) + line for line in comp["lines"]]

    request = {
        "panels": [{"style": "A", "width": PANEL_W, "lines": padded_lines}],
        "layout": {"cols": 0, "gap": 0},
    }
    wr = run(WRAP, json.dumps(request))
    if not wr.get("ok"):
        return f"FAIL: {wr.get('errors')}"
    return wr["block"]


def main():
    data = json.loads(COMP.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)

    for cat, comps in data["categories"].items():
        for c in comps:
            block = render(c)
            (OUT / f"{c['name']}.txt").write_text(block, encoding="utf-8")

    # Also write a combined report
    report = ["# Component render report", ""]
    for cat, comps in data["categories"].items():
        report.append(f"## {cat}")
        report.append("")
        for c in comps:
            report.append(f"### {c['name']} (w={c['width']}, h={c['height']})")
            report.append("```")
            report.append((OUT / f"{c['name']}.txt").read_text(encoding="utf-8").rstrip())
            report.append("```")
            report.append("")
    (ROOT / "assets" / "components-renders" / "REPORT.md").write_text(
        "\n".join(report), encoding="utf-8"
    )
    print(f"wrote {len(data['categories'])} category reports")


if __name__ == "__main__":
    main()
