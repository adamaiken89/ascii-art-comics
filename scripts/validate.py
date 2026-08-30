#!/usr/bin/env python3
"""
Stage 3 code auditor. No LLM. Checks borders, width, tofu, forbidden chars.

Usage:
    python3 validate.py < wrapped.json
"""
import json
import sys
from wcwidth import wcswidth

NBSP = "\u00A0"
TOFU = {"?", "▯", "◇", "�"}
FACE_ALLOWED = {"◕", "‿", "╥", "﹏", "╬", "Ò", "Ó", "°", "□", "¬", "•", "×"}

BORDER_CHARS = {
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
    if not s:
        return 0
    s = s.replace(NBSP, " ")
    w = wcswidth(s)
    return max(0, w) if w >= 0 else len(s)


def char_at_cell(s: str, cell: int) -> str:
    """Get the char at a given visual cell index. Returns '' if out of range."""
    if not s or cell < 0:
        return ""
    s = s.replace(NBSP, " ")
    w = 0
    for ch in s:
        ch_w = wcswidth(ch)
        if ch_w < 0:
            ch_w = 1
        if w + ch_w > cell:
            return ch
        w += ch_w
        if w > cell:
            return ch
    return ""


def check_corners(block: list[str], outer_w: int, bset: dict) -> list[dict]:
    issues = []
    last = len(block) - 1
    last_col = visible_width(block[0]) - 1 if block else 0
    if last >= 0:
        last_col = visible_width(block[last]) - 1
    corners = [
        (0, 0, bset["TL"], "TL"),
        (0, last_col, bset["TR"], "TR"),
        (last, 0, bset["BL"], "BL"),
        (last, last_col, bset["BR"], "BR"),
    ]
    for r, c, expected, name in corners:
        line = block[r] if r < len(block) else ""
        if visible_width(line) <= c:
            issues.append({"type": f"corner_{name}_missing", "line": r, "fix": "rebuild_border"})
            continue
        ch = char_at_cell(line, c)
        if ch != expected:
            issues.append({
                "type": f"corner_{name}_wrong",
                "line": r,
                "col": c,
                "expected": expected,
                "got": ch,
                "fix": "swap_corner",
            })
    return issues


def check_border_continuity(block: list[str], outer_w: int, bset: dict) -> list[dict]:
    issues = []
    last = len(block) - 1
    if last < 1:
        return [{"type": "block_too_short", "fix": "rebuild"}]

    top_line = block[0]
    top_actual_w = visible_width(top_line)
    for c in range(1, top_actual_w - 1):
        ch = char_at_cell(top_line, c)
        if ch != bset["T"]:
            issues.append({
                "type": "top_border_drift",
                "line": 0,
                "col": c,
                "expected": bset["T"],
                "got": ch,
                "fix": "rebuild_top",
            })
            break

    bot_line = block[last]
    bot_actual_w = visible_width(bot_line)
    for c in range(1, bot_actual_w - 1):
        ch = char_at_cell(bot_line, c)
        if ch != bset["B"]:
            issues.append({
                "type": "bot_border_drift",
                "line": last,
                "col": c,
                "expected": bset["B"],
                "got": ch,
                "fix": "rebuild_bot",
            })
            break

    for r in range(1, last):
        line = block[r]
        if visible_width(line) < 2:
            issues.append({"type": "mid_line_too_short", "line": r, "fix": "rebuild"})
            continue
        left = char_at_cell(line, 0)
        right_col = visible_width(line) - 1
        right = char_at_cell(line, right_col)
        if left != bset["L"]:
            issues.append({
                "type": "left_border_drift",
                "line": r,
                "col": 0,
                "expected": bset["L"],
                "got": left,
                "fix": "rebuild_left",
            })
            break
        if right != bset["R"]:
            issues.append({
                "type": "right_border_drift",
                "line": r,
                "col": right_col,
                "expected": bset["R"],
                "got": right,
                "fix": "rebuild_right",
            })
            break

    return issues


def check_width(block: list[str], outer_w: int) -> list[dict]:
    issues = []
    for r, line in enumerate(block):
        w = visible_width(line)
        if w != outer_w:
            issues.append({
                "type": "width_drift",
                "line": r,
                "measured": w,
                "expected": outer_w,
                "fix": "rebuild_or_downgrade",
            })
    return issues


def check_tofu(block: list[str]) -> list[dict]:
    issues = []
    for r in range(1, len(block) - 1):
        line = block[r]
        cell = 0
        for ch in line:
            if ch in TOFU and ch not in FACE_ALLOWED:
                issues.append({
                    "type": "tofu",
                    "line": r,
                    "col": cell,
                    "char": ch,
                    "fix": "swap_fallback",
                })
            cell += max(1, wcswidth(ch) if wcswidth(ch) >= 0 else 1)
    return issues


def check_forbidden(block: list[str]) -> list[dict]:
    issues = []
    for r in range(1, len(block) - 1):
        line = block[r]
        cell = 0
        for ch in line:
            cp = ord(ch)
            if cp > 0x259F and cp != 0x00A0:
                if 0x1F000 <= cp <= 0x1FFFF:
                    issues.append({
                        "type": "emoji_forbidden",
                        "line": r,
                        "col": cell,
                        "char": ch,
                        "fix": "remove",
                    })
            cell += max(1, wcswidth(ch) if wcswidth(ch) >= 0 else 1)
    return issues


def audit(wrapped: dict) -> dict:
    block = wrapped.get("block", [])
    outer_w = wrapped.get("outer_w", 0)
    bset_name = wrapped.get("border_set", "heavy")

    if bset_name not in BORDER_CHARS:
        return {
            "ok": False,
            "issues": [{"type": "unknown_border_set", "fix": "downgrade_ascii"}],
        }

    bset = BORDER_CHARS[bset_name]
    all_issues = []

    all_issues += check_width(block, outer_w)
    all_issues += check_corners(block, outer_w, bset)
    all_issues += check_border_continuity(block, outer_w, bset)
    all_issues += check_tofu(block)
    all_issues += check_forbidden(block)

    return {
        "ok": len(all_issues) == 0,
        "issues": all_issues,
        "border_set": bset_name,
    }


def main():
    wrapped = json.load(sys.stdin)
    result = audit(wrapped)
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
