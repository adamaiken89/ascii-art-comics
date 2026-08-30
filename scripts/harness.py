#!/usr/bin/env python3
"""
harness.py — orchestrator for v1.

Parses a free-form prompt, generates 4 panels via deterministic defaults
(since v1 has no LLM ideation), runs render + validate, emits comic.

Usage:
    python3 harness.py "alice and bob argue about pizza"

Output: rendered comic to stdout, issues to stderr.
"""
import json
import os
import re
import sys
import subprocess
from pathlib import Path
from wcwidth import wcswidth

NBSP = "\u00A0"
SCRIPT_DIR = Path(__file__).parent
SKILL_DIR = SCRIPT_DIR.parent

PANEL_W = 24
PANEL_H = 12
INNER_W = PANEL_W - 2
INNER_H = PANEL_H - 2
VISUAL_ROWS = 7
DIALOGUE_ROWS = 3
GUTTER_COL = 1
GUTTER_ROW = 1

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

TOFU = {"?", "□", "▯", "◇", "�"}

MOOD_DEFAULTS = ["happy", "thinking", "shocked", "happy"]


def visible_width(s: str) -> int:
    if not s:
        return 0
    s = s.replace(NBSP, " ")
    w = wcswidth(s)
    return max(0, w) if w >= 0 else len(s)


def load_faces() -> dict:
    with open(SKILL_DIR / "assets" / "faces.json") as f:
        return json.load(f)


def detect_lang(text: str) -> str:
    if not text:
        return "en"
    cjk_count = 0
    total = 0
    for ch in text:
        if ch.isspace():
            continue
        total += 1
        cp = ord(ch)
        if (
            0x4E00 <= cp <= 0x9FFF
            or 0x3040 <= cp <= 0x30FF
            or 0xAC00 <= cp <= 0xD7AF
        ):
            cjk_count += 1
    if total == 0:
        return "en"
    if cjk_count / total > 0.3:
        return "cjk"
    if cjk_count > 0:
        return "mix"
    return "en"


def parse_prompt(prompt: str) -> dict:
    """v1: extract 2 characters + 4 dialogues deterministically.

    Heuristic:
    - Characters: capitalized name pairs in prompt, or default [Alice, Bob].
    - Dialogue per panel: split prompt by 'then' / 'and' / ',;' / sentence break.
      Strip speaker name prefix if present.
    - Mood per panel: from dialogue keyword, else default.
    """
    name_pattern = re.compile(r"\b([A-Z][a-z]+)\b")
    names = list(dict.fromkeys(name_pattern.findall(prompt)))[:2]
    if len(names) < 1:
        names = ["Alice", "Bob"]
    if len(names) == 1:
        names.append("Bob")

    body = prompt
    for n in names:
        body = re.sub(rf"\b{n}\b", "", body, flags=re.IGNORECASE)
    body = re.sub(r"\b(says?|said|tells?|replies|shouts?|whispers?)\b", "", body, flags=re.IGNORECASE)

    segments = re.split(r"\bthen\b|\bfinally\b|[,;.]", body, flags=re.IGNORECASE)
    segments = [s.strip() for s in segments if s.strip()]

    if len(segments) >= 4:
        dialogues = segments[:4]
    elif len(segments) >= 2:
        dialogues = segments + ["..."] * (4 - len(segments))
    elif len(segments) == 1:
        words = segments[0].split()
        if len(words) >= 4:
            dialogues = [" ".join(words[i:i + max(1, len(words) // 4)]) for i in range(0, len(words), max(1, len(words) // 4))][:4]
        else:
            dialogues = words + ["..."] * (4 - len(words))
    else:
        dialogues = [
            "hi there!",
            "what's up?",
            "really?!",
            "haha yes",
        ]

    if len(dialogues) > 4:
        dialogues = dialogues[:4]
    while len(dialogues) < 4:
        dialogues.append("...")

    mood_keywords = {
        "happy": ["happy", "yes", "great", "awesome", "haha", "笑", "好", "wonderful", "love"],
        "sad": ["sad", "cry", "no", "miss", "悲", "哭", "lost", "alone"],
        "angry": ["angry", "mad", "hate", "argue", "氣", "嬲", "fight", "furious"],
        "shocked": ["shock", "wow", "really", "what", "驚", "嘩", "omg", "unbelievable"],
        "thinking": ["think", "hmm", "maybe", "wonder", "諗", "唔知", "ponder", "consider"],
        "smug": ["smug", "told you", "得意", "knew it", "obviously"],
        "dead": ["dead", "tired", "exhausted", "死", "defeat", "sigh"],
    }

    moods = []
    for d in dialogues:
        d_lower = d.lower()
        matched = None
        for mood, kws in mood_keywords.items():
            for kw in kws:
                if kw in d_lower:
                    matched = mood
                    break
            if matched:
                break
        moods.append(matched or "happy")

    return {
        "characters": names,
        "dialogues": dialogues,
        "moods": moods,
    }


def wrap_text(text: str, max_w: int) -> list[str]:
    """Word-boundary wrap. Falls back to char wrap if word > max_w."""
    if visible_width(text) <= max_w:
        return [text]
    words = text.split()
    lines = []
    current = ""
    for w in words:
        if not current:
            current = w
        elif visible_width(current + " " + w) <= max_w:
            current += " " + w
        else:
            lines.append(current)
            current = w
    if current:
        lines.append(current)
    if not lines:
        lines = [text[:max_w]]
    return lines


def cjk_wrap(text: str, max_w: int) -> list[str]:
    if visible_width(text) <= max_w:
        return [text]
    lines = []
    current = ""
    current_w = 0
    for ch in text:
        ch_w = 2 if ord(ch) > 0x7F else 1
        if current_w + ch_w > max_w:
            lines.append(current)
            current, current_w = ch, ch_w
        else:
            current += ch
            current_w += ch_w
    if current:
        lines.append(current)
    return lines


def build_visual(mood: str, characters: list, inner_w: int) -> list[str]:
    """Build visual zone rows: face + body + spacing."""
    faces = load_faces()["faces"]
    fallback_mood = "neutral" if "neutral" in faces else next(iter(faces))
    face_data = faces.get(mood, faces[fallback_mood])
    glyph = face_data["glyph"]

    rows = []

    if len(characters) >= 2:
        face2 = faces.get(fallback_mood, faces[fallback_mood])["glyph"]
        face_line = glyph + "  " + face2
    else:
        face_line = glyph

    face_w = visible_width(face_line)
    pad_total = inner_w - face_w
    pad_left = pad_total // 2
    pad_right = pad_total - pad_left
    face_centered = " " * pad_left + face_line + " " * pad_right

    rows.append(face_centered)

    body1 = " " * (inner_w // 2 - 2) + " /|\\ " + " " * (inner_w // 2 - 3)
    body2 = " " * (inner_w // 2 - 2) + " / \\ " + " " * (inner_w // 2 - 3)
    rows.append(body1)
    rows.append(body2)

    while len(rows) < VISUAL_ROWS:
        rows.append(" " * inner_w)

    return rows[:VISUAL_ROWS]


def build_dialogue(speaker: str, text: str, lang: str, inner_w: int) -> list[str]:
    """Build dialogue zone: separator + tag lines."""
    rows = []

    if not text:
        text = "..."

    tag_text = f"{speaker}: {text}"
    if visible_width(tag_text) <= inner_w:
        rows.append(tag_text)
    else:
        tag_only = f"{speaker}:"
        tag_w = visible_width(tag_only) + 1
        if lang == "cjk":
            wrapped = cjk_wrap(text, inner_w - tag_w)
        else:
            wrapped = wrap_text(text, inner_w - tag_w)
        if wrapped:
            rows.append(tag_only + " " + wrapped[0])
            for w in wrapped[1:]:
                rows.append(" " * tag_w + w)
        else:
            rows.append(tag_text)

    sep = "─" * inner_w
    result = [sep] + rows
    while len(result) < DIALOGUE_ROWS + 1:
        result.append(" " * inner_w)
    return result[: DIALOGUE_ROWS + 1]


def build_panel_content(panel_id: int, mood: str, characters: list,
                        speaker: str, text: str, lang: str) -> dict:
    visual = build_visual(mood, characters, INNER_W)
    dialogue = build_dialogue(speaker, text, lang, INNER_W)
    lines = visual + dialogue
    measured = [visible_width(l) for l in lines]
    overflow = [i for i, m in enumerate(measured) if m > INNER_W]
    if overflow:
        for i in overflow:
            lines[i] = lines[i][:INNER_W]
            measured[i] = INNER_W
    return {
        "panel_id": panel_id,
        "lines": lines,
        "measured": measured,
        "target": INNER_W,
        "lang": lang,
        "mood": mood,
    }


def call_render(panel_data: dict, border_set: str) -> dict:
    """Call render.py as subprocess."""
    proc = subprocess.run(
        ["python3", str(SCRIPT_DIR / "render.py"), border_set],
        input=json.dumps(panel_data),
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return {"ok": False, "error": proc.stderr, "block": [], "outer_w": 0, "border_set": border_set}
    return json.loads(proc.stdout)


def call_validate(wrapped: dict) -> dict:
    proc = subprocess.run(
        ["python3", str(SCRIPT_DIR / "validate.py")],
        input=json.dumps(wrapped),
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return {"ok": False, "issues": [{"type": "validate_crash", "fix": "downgrade"}]}
    return json.loads(proc.stdout)


def downgrade_to_ascii(wrapped: dict) -> dict:
    """Re-render same content with ASCII borders."""
    pass


def build_panel_lines(panel_data: dict, border_set: str) -> dict:
    """Single pipeline: render + validate, downgrade if needed."""
    wrapped = call_render(panel_data, border_set)
    if not wrapped.get("ok"):
        return wrapped

    audit = call_validate(wrapped)
    if not audit.get("ok"):
        if border_set == "heavy":
            wrapped = call_render(panel_data, "ascii")
            audit = call_validate(wrapped)
            if audit.get("ok"):
                wrapped["downgraded"] = True
                return wrapped
        return {
            "ok": False,
            "block": wrapped.get("block", []),
            "issues": audit.get("issues", []),
            "outer_w": wrapped.get("outer_w", 0),
            "border_set": border_set,
        }

    return wrapped


def assemble_grid(panels: list[dict]) -> str:
    """2x2 grid: row1 = [p1, p2], row2 = [p3, p4]. 1-space col gutter, 1-blank-line row gutter."""
    rows_text = []
    for row_idx in range(2):
        left = panels[row_idx * 2]["block"]
        right = panels[row_idx * 2 + 1]["block"]
        max_h = max(len(left), len(right))
        while len(left) < max_h:
            left.append(" " * len(left[0]))
        while len(right) < max_h:
            right.append(" " * len(right[0]))
        row_lines = [
            l + " " * GUTTER_COL + r for l, r in zip(left, right)
        ]
        rows_text.append("\n".join(row_lines))
    return ("\n" * (GUTTER_ROW + 1)).join(rows_text)


def main():
    if len(sys.argv) < 2:
        print("usage: harness.py <prompt>", file=sys.stderr)
        sys.exit(1)

    prompt = " ".join(sys.argv[1:])
    parsed = parse_prompt(prompt)
    lang = detect_lang(prompt)

    chars = parsed["characters"]
    moods = parsed["moods"]
    dialogues = parsed["dialogues"]

    speakers = [chars[0], chars[1], chars[1], chars[0]]

    panels = []
    issues = []
    word_count = 0
    used_border = "heavy"
    downgraded = False

    for i in range(4):
        spk = speakers[i]
        dlg = dialogues[i]
        word_count += len(dlg.split())

        content = build_panel_content(
            panel_id=i + 1,
            mood=moods[i],
            characters=chars,
            speaker=spk,
            text=dlg,
            lang=lang,
        )
        wrapped = build_panel_lines(content, used_border)
        if wrapped.get("downgraded"):
            downgraded = True
            used_border = "ascii"
        if not wrapped.get("ok"):
            err = wrapped.get("error", "")
            panel_issues = wrapped.get("issues", [])
            if err:
                issues.append(f"Panel {i + 1}: {err}")
            elif panel_issues:
                issues.append(f"Panel {i + 1}: " + "; ".join(str(x) for x in panel_issues))
            else:
                issues.append(f"Panel {i + 1}: render failed")
        panels.append(wrapped)

    grid = assemble_grid(panels)

    meta = {
        "panels": [1, 2, 3, 4],
        "characters": chars,
        "moods": moods,
        "lang": lang,
        "word_count": word_count,
        "border_set": "ascii" if downgraded else "heavy",
    }

    if downgraded:
        issues.append("border downgraded to ASCII due to render/validate issues")

    print("```")
    print(grid)
    print("```")
    if issues:
        print("\n".join(f"[!] {i}" for i in issues), file=sys.stderr)

    meta_json = json.dumps({"ok": len(issues) == 0, "metadata": meta, "issues": issues}, ensure_ascii=False)
    print(f"\n<!-- {meta_json} -->")


if __name__ == "__main__":
    main()
