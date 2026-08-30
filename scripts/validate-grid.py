#!/usr/bin/env python3
"""
validate-grid.py — Structural validator for composed ASCII cell grids.

Input: compose.ts output JSON (stdin or file arg).
Output: same JSON with `validated: true` and validator issues merged into
`issues` (they keep the shared {type, panel, row, col, expected, got, fix,
severity} shape and are marked validator: true).

Cell width rule (must match scripts/lib/cellwidth.ts):
    width(ch) = 2 if unicodedata.east_asian_width(ch) in ('W', 'F') else 1
"""

import json
import sys
import unicodedata

BORDER_SETS = [
    {"tl": "╭", "t": "─", "tr": "╮", "bl": "╰", "br": "╯", "v": "│"},
    {"tl": "┏", "t": "━", "tr": "┓", "bl": "┗", "br": "┛", "v": "┃"},
    {"tl": "+", "t": "-", "tr": "+", "bl": "+", "br": "+", "v": "|"},
]

TOFU_CHARS = set("□▯◇�⍰")


def cell_width(ch: str) -> int:
    if len(ch) != 1:
        return sum(cell_width(c) for c in ch)
    return 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1


def line_cells(line: str) -> int:
    return sum(cell_width(ch) for ch in line)


def issue(typ, panel, row, col, expected, got, fix, severity="error"):
    return {
        "type": typ, "panel": panel, "row": row, "col": col,
        "expected": expected, "got": got, "fix": fix, "severity": severity,
        "validator": True,
    }


def detect_border_set(rows):
    for bs in BORDER_SETS:
        if rows and rows[0].find(bs["tl"]) == 0 and rows[0].endswith(bs["tr"]):
            return bs
    return None


def validate_panel(p):
    issues = []
    pid = p.get("panelId")
    rows = p.get("ascii", [])
    declared_w = p.get("width")
    declared_h = p.get("height")

    if not rows:
        return [issue("empty_panel", pid, 0, 0, ">=1 row", 0, "check compose input")]

    # 1. Uniform visible width per row — the ground-truth invariant.
    widths = {r: line_cells(row) for r, row in enumerate(rows)}
    w0 = widths[0]
    for r, w in widths.items():
        if w != w0:
            issues.append(issue("width_drift", pid, r + 1, w,
                                f"{w0} cells", f"{w} cells", "recompose panel"))
    if declared_w is not None and w0 != declared_w:
        issues.append(issue("declared_width_mismatch", pid, 1, w0,
                            declared_w, w0, "recompose panel"))
    if declared_h is not None and len(rows) != declared_h:
        issues.append(issue("declared_height_mismatch", pid, len(rows), 0,
                            declared_h, len(rows), "recompose panel"))

    # 2. Border integrity: corners + continuity (composer-owned; a miss here
    #    means a composer bug, but check anyway — trust and verify).
    bs = detect_border_set(rows)
    if bs is None:
        issues.append(issue("border_set_unknown", pid, 1, 0,
                            "one of ╭/┏/+ corner sets", rows[0][:1],
                            "recompose panel"))
    else:
        h = len(rows)
        for name, ch, r, c in (
            ("tl", bs["tl"], 0, 0), ("tr", bs["tr"], 0, len(rows[0]) - 1),
            ("bl", bs["bl"], h - 1, 0), ("br", bs["br"], h - 1, len(rows[-1]) - 1),
        ):
            got = rows[r][c]
            if got != ch:
                issues.append(issue(f"corner_{name}_wrong", pid, r + 1, c + 1,
                                    ch, got, "recompose panel"))
        # side continuity: every interior row starts/ends with the vertical
        for r in range(1, h - 1):
            if rows[r][:1] != bs["v"]:
                issues.append(issue("left_border_drift", pid, r + 1, 1,
                                    bs["v"], rows[r][:1], "recompose panel"))
            if rows[r][-1:] != bs["v"]:
                issues.append(issue("right_border_drift", pid, r + 1, len(rows[r]),
                                    bs["v"], rows[r][-1:], "recompose panel"))
        for r, label in ((0, "top"), (h - 1, "bottom")):
            expect = bs["tl"] + bs["t"] * (w0 - 2) + bs["tr"] if label == "top" \
                else bs["bl"] + bs["t"] * (w0 - 2) + bs["br"]
            if rows[r] != expect:
                issues.append(issue(f"{label}_border_drift", pid, r + 1, 0,
                                    "continuous border", rows[r], "recompose panel"))

    # 3. Tofu + forbidden emoji (would raster as garbage).
    for r, row in enumerate(rows):
        for c, ch in enumerate(row):
            if ch in TOFU_CHARS:
                issues.append(issue("tofu", pid, r + 1, c + 1,
                                    "printable glyph", ch, "swap component or mood", "warning"))
            if 0x1F000 <= ord(ch) <= 0x1FFFF:
                issues.append(issue("emoji_forbidden", pid, r + 1, c + 1,
                                    "text-safe glyph", ch, "swap component or mood", "error"))

    return issues


def validate(compose_result):
    all_issues = []
    for p in compose_result.get("panels", []):
        all_issues.extend(validate_panel(p))
    return all_issues


def main():
    raw = sys.stdin.read() if len(sys.argv) < 2 else open(sys.argv[1], encoding="utf-8").read()
    data = json.loads(raw)
    extra = validate(data)
    data["issues"] = data.get("issues", []) + extra
    data["validated"] = True
    data["ok"] = not any(i["severity"] == "error" for i in data["issues"])
    json.dump(data, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
