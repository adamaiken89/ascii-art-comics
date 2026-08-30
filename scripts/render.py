#!/usr/bin/env python3
"""
Stage 2 renderer. Pure mechanical border wrap + NBSP pad.
No LLM. No content knowledge. No language detection.

Usage:
    python3 render.py <panel_id> <border_set> < inner.json > outer.json
"""
import json
import sys
from wcwidth import wcswidth

NBSP = "\u00A0"

BORDERS = {
    "heavy": {
        "TL": "╔", "T": "═", "TR": "╗",
        "L": "║", "R": "║",
        "BL": "╚", "B": "═", "BR": "╝",
    },
    "ascii": {
        "TL": "+", "T": "-", "TR": "+",
        "L": "|", "R": "|",
        "BL": "+", "B": "-", "BR": "+",
    },
}


def visible_width(s: str) -> int:
    """Visible cell width. NBSP = 1, ASCII = 1, CJK = 2."""
    if not s:
        return 0
    s = s.replace(NBSP, " ")
    w = wcswidth(s)
    return max(0, w) if w >= 0 else len(s)


def wrap_panel(panel_id: int, lines: list[str], target: int, border_set: str) -> dict:
    if border_set not in BORDERS:
        return {
            "panel_id": panel_id,
            "block": [],
            "outer_w": 0,
            "border_set": border_set,
            "ok": False,
            "error": f"unknown border_set: {border_set}",
        }

    b = BORDERS[border_set]

    measured = [visible_width(line) for line in lines]
    overflow = [i for i, m in enumerate(measured) if m > target]
    if overflow:
        return {
            "panel_id": panel_id,
            "block": [],
            "outer_w": 0,
            "border_set": border_set,
            "ok": False,
            "error": f"lines exceed target: {overflow}",
            "measured": measured,
            "target": target,
        }

    outer_w = target + 2
    top = b["TL"] + b["T"] * (outer_w - 2) + b["TR"]
    bot = b["BL"] + b["T"] * (outer_w - 2) + b["BR"]

    block = [top]
    for line in lines:
        w = visible_width(line)
        pad = NBSP * (outer_w - 2 - w)
        block.append(b["L"] + line + pad + b["R"])
    block.append(bot)

    for i, line in enumerate(block):
        if visible_width(line) != outer_w:
            return {
                "panel_id": panel_id,
                "block": block,
                "outer_w": outer_w,
                "border_set": border_set,
                "ok": False,
                "error": f"line {i} width drift: {visible_width(line)} != {outer_w}",
            }

    return {
        "panel_id": panel_id,
        "block": block,
        "outer_w": outer_w,
        "border_set": border_set,
        "ok": True,
    }


def main():
    data = json.load(sys.stdin)
    panel_id = data.get("panel_id", 0)
    lines = data.get("lines", [])
    target = data.get("target", 22)
    border_set = sys.argv[1] if len(sys.argv) > 1 else data.get("border_set", "heavy")

    result = wrap_panel(panel_id, lines, target, border_set)
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
