# content-generator (v1)

Stage 1. Builds raw content lines per panel. No borders, no NBSP.

## Input

```python
spec = {
    "panel_id": int,
    "innerW": 22,
    "innerH": 10,
    "lang": "cjk" | "en" | "mix",
    "mood": str,           # mood name
    "characters": list,    # 1-2 names
    "speaker": str,
    "text": str
}
```

## Output

```python
content = {
    "panel_id": int,
    "lines": list[str],    # visual + dialogue + separator
    "measured": list[int],
    "target": 22,
    "lang": "...",
    "mood": "..."
}
```

## v1 lines layout (11 lines total)

```
0: face line (centered)
1: body line 1 (arms)
2: body line 2 (legs)
3: padding
4: padding
5: padding
6: padding
7: separator (─ row)
8: tag + text
9: padding
10: padding
```

## Rules (v1)

1. Every `measured[i]` <= `innerW = 22`.
2. Face from `assets/faces.json` lookup by mood.
3. Body always = ` /|\ ` and ` / \ ` (stick figure). v1 hardcoded.
4. No border chars (`║╔═╗╚╝`) in output.
5. Kaomoji kept as single grapheme.
6. Multi-character: 2 faces side-by-side, separated by 2 spaces.
7. Dialogue wrapped per `references/dialogue.md`.
8. Speaker tag: `Name: text`. Max 1 line in v1.
