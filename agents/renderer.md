# renderer (v1)

Stage 1 + Stage 3 visual audit. Pure renderer: takes structured input, outputs comic + metadata.

## Role

Read a comic spec (panels, faces, dialogue), produce the bordered block, then audit visually.

## Input

```python
spec = {
    "panels": [
        {
            "panel_id": 1,
            "mood": "happy",
            "characters": ["Alice"],
            "dialogue": [
                {"speaker": "Alice", "text": "hi there!"}
            ]
        },
        ...
    ],
    "lang": "en" | "cjk" | "mix"
}
```

## Process

1. **Load registries:** `assets/faces.json`, `assets/templates.json`.
2. **Stage 1 (content):** For each panel:
   - Pick face glyph from `mood` lookup.
   - Build visual zone: face + body marks + spacing rows.
   - Build dialogue zone: separator + tag lines.
   - Measure all lines, verify `len <= innerW`.
3. **Stage 2 (wrap):** Call `scripts/render.py` for each panel.
4. **Stage 3 (audit):** Call `scripts/validate.py` for code checks. Then visual checks.
5. **Grid assembly:** 2x2 with gutters.
6. **Emit:** comic string + metadata + issues.

## Output

```python
{
    "ok": bool,
    "comic": str,             # rendered, fenced
    "issues": list[str],
    "metadata": {
        "panels": [1, 2, 3, 4],
        "characters": ["Alice", "Bob"],
        "moods": ["happy", "thinking", "shocked", "happy"],
        "lang": "en",
        "word_count": int,
        "border_set": "heavy"
    }
}
```

## Rules

1. Use only registries — never invent faces.
2. Every line in visual/dialogue must be `len <= innerW` (visible cells).
3. Pure ASCII + box-drawing. No emoji.
4. Tag format: `Name: text` with single space.
5. Default template = `equal_2x2`. Override requires user explicit.
6. On any code check fail, downgrade to ASCII and re-verify.
7. On visual check fail, emit comic + append issue to `issues`.

## Visual zone construction

Per panel, 7 rows:

```
row 0:  blank (or 1-2 spaces)
row 1:  face (centered or left-aligned)
row 2:  body line 1 (e.g. arms)
row 3:  body line 2 (e.g. legs)
row 4:  blank
row 5:  blank
row 6:  blank
```

If 1 character, face is centered (padded with spaces). If 2 characters, side-by-side.

## Dialogue zone construction

3 rows reserved, but typically 1-2 used:

```
row 0:  separator (─ row)
row 1:  tag + text
row 2:  empty (padding)
```

If 2 speakers, split row 1-2:

```
row 1:  Alice: hi!
row 2:  Bob:   hello!
```

Both must fit `innerW`.

## Multi-character panels

If `len(characters) == 2`:
- Two faces in row 1, side-by-side.
- Speaker tag identifies which one speaks.
- Default: Alice left, Bob right.
