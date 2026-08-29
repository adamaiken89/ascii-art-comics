# Test fixtures

JSON request files that exercise the full Stage 1 → Stage 2 pipeline. Each fixture has a matching render in `renders/<name>.txt`.

## Files

| Fixture | Style | Layout | What it tests |
|---|---|---|---|
| `deploy-styleA.json` | A heavy | 2-panel stack | Multi-panel + speech bubble (style A inside style A) |
| `deploy-styleA-3panel.json` | A heavy | 3-panel grid (cols=3, gap=2) | Horizontal grid layout, alignment across panels |
| `approved-styleA-cjk.json` | A heavy | 1-panel CJK | CJK width math (`好,approve了` = 13 cells) |
| `monday-styleB-4koma.json` | B light | 4-panel grid (cols=4, gap=1) | 4-koma grid, light borders, chibi faces |
| `dns-styleC.json` | C ASCII | 2-panel stack | Style C = borderless, raw content only |

## Run

```bash
# Render all fixtures (writes to renders/<name>.txt)
python3 scripts/render-fixtures.py

# Run full test suite (unit + fixtures)
npm test
```

Exit codes:
- `0` — all fixtures rendered
- `1` — one or more fixtures failed (Stage 1 overflow, Stage 2 width mismatch, etc.)

## How to add a fixture

1. Create `assets/examples/fixtures/<name>.json` with shape:
   ```json
   {
     "defaultTarget": 28,
     "panels": [
       {
         "panelId": 0,
         "lang": "en",
         "mood": "happy",
         "style": "A",
         "lines": ["  (◕‿◕)  ", "  /|     ", "  ..."  ]
       }
     ],
     "layout": { "cols": 0, "gap": 3, "align": "center" }
   }
   ```
2. Run `python3 scripts/render-fixtures.py`
3. Inspect `renders/<name>.txt` for visual correctness
4. Commit both files

## Style constraints

- **Style A**: heavy borders. Lines may contain `─` and `│` inside speech bubbles (`╭─╮`, `╰─╯`).
- **Style B**: light borders. Same bubble rules.
- **Style C**: NO borders. The pipeline detects all-C and emits raw content. Mixing C with bordered styles is rejected (would break grid alignment).
