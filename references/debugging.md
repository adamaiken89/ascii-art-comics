# Debugging width & box-alignment

When ASCII art components break alignment, the cause is almost always one of these. Run through them in order.

## Quick diagnostic

```bash
# Width of a string in cells (CJK = 2, emoji varies, ASCII = 1)
node --input-type=module -e "import sw from 'string-width'; console.log(sw('your string here'))"

# Width of every line in a component
node --input-type=module -e "
import fs from 'node:fs';
import sw from 'string-width';
const lines = fs.readFileSync('assets/components-src/face/sad.txt', 'utf8').split('\n').filter(l => l && !l.startsWith('@'));
for (const l of lines) console.log(sw(l), JSON.stringify(l));
"
```

## The 5 common bugs

### Bug 1: Fullwidth CJK chars in kaomoji

`╥﹏╥` is **6 cells**, not 5. `﹏` (U+FE4F) is fullwidth. `(╥﹏╥)` (with parens) is 8 cells.

```js
sw('(╥﹏╥)')  // 8, not 6
sw('╥﹏╥')   // 6, not 3
```

**Rule of thumb:** `╥`, `╬`, `╭`, `╮`, `╰`, `╯` are 1 cell. `﹏`, `‿`, `◡`, `◑`, `◕`, `◐`, `☉`, `╥` (in different context), `╬`, `═` (in CJK context) may be 2. Always verify with `string-width`.

**Known fullwidth in faces:**
- `╥﹏╥` (sad) — `﹏` is 2 cells
- `╬ Ò﹏Ó` (angry) — `╬`, `Ò`, `Ó` all 2 cells
- `゜-゜` (confused) — `゜` is 2 cells

**Fix:** pad the surrounding box one extra cell to accommodate.

### Bug 2: Box top/bottom ≠ box mid

`╭──╮` (4 cells) and `│◕‿◕│` (5 cells) do NOT have the same width. The face will look misaligned in any box.

**Rule:** `│x_y│` width = `╭─…─╮` width. Always count.

**Standard chibi 7-wide pattern:**
```
╭─────╮
│◕‿◕│  
╰─────╯
```
- top: 1+5+1 = 7
- mid: 1+3+1+2 spaces = 7 (padded to match top)
- bot: 1+5+1 = 7

### Bug 3: Emoji width surprise

Most emoji are **2 cells** in `string-width` (not 1). `(👊)` = 1+2+1 = 4. But `(👍)` = 1+2+1 = 4 too — predictable once you know.

**Surprise exception:** some "symbols" like `★`, `☆`, `☆` are 1 cell (they're not in the Emoji block). `☉` is 1 cell. `☀` is 1.

**Fix:** test every char with `string-width` before committing a face.

### Bug 4: Mixed-width lines in a multi-line component

If a coffee cup has:
```
  ( (
   ) )
  ( _)
  |   |
  ====
```
…and the lines have widths 4, 5, 5, 5, 5, the lines will render at different x-positions inside a box.

**Fix:** the build script (`scripts/build-library.ts`) right-pads all lines to the max width with ASCII space. Source files can have variable-width lines; the build normalizes them.

### Bug 6: Content hugs wrong side of box

For chibi faces where the mid line is narrower than the box, where you put the trailing space matters visually:

- `│╥﹏╥│ ` — gap on the OUTSIDE (after the right border). Looks like the face is floating LEFT, pushed to the left border.
- `│╥﹏╥ │` — gap on the INSIDE (before the right border). Looks like the face is floating RIGHT, away from the left border.

For chibi faces, the convention is **content hugs the LEFT bar** (gap before right bar). Use `│◕‿◕ │` (space before closing `│`).

**Exception:** for `│╥﹏╥│` (sad, wider content because `﹏` is fullwidth), the content is already wider, so put the extra space OUTSIDE: `│╥﹏╥│ ` (space after closing `│`).

**Verify by comparison:** render all chibi faces side-by-side. If they look like they're at different x-positions, the gap placement is inconsistent.

## Diagnostic checklist

When a component looks wrong, run through these:

1. [ ] Width of each line in the source — same?
2. [ ] Width of top/bot of any inner box — matches mid?
3. [ ] Any CJK fullwidth chars? (test with `string-width`)
4. [ ] Any emoji? (test with `string-width`)
5. [ ] Trailing whitespace preserved in source?
6. [ ] Does it render correctly centered in a 40-wide box? (use `render-components.py`)

## Tool: render-components.py

```bash
python3 scripts/render-components.py
```

Renders every component in `assets/components.json` centered in a 40-wide box. Output: `assets/components-renders/<name>.txt` + combined `REPORT.md`.

If a component looks misaligned in the report, the bug is in the source file (or the JSON metadata).

## Tool: validate-components.py

```bash
python3 scripts/validate-components.py
```

Runs every component through Stage 1 → Stage 2 of the pipeline. Catches:
- Width overflow (component wider than expected target)
- NBSP leaks in content
- Post-wrap width mismatch

Does NOT catch:
- Visual misalignment (top ≠ mid)
- CJK width miscount (the source file's width metadata might be wrong even if the cells are correct)

For those, use `render-components.py` and look.

## Common fixes

**Face with one fullwidth char (like sad):**
```
╭─────╮
│╥﹏╥│  ← note: 1 trailing space
╰─────╯
```
Total mid = 1+1+2+1+1+1 = 7. Match top/bot.

**Face with all 1-cell chars (like happy):**
```
╭─────╮
│◕‿◕│  ← note: 2 trailing spaces
╰─────╯
```
Total mid = 1+1+1+1+1+2 = 7. Match top/bot.

**Object with variable-width lines:**
Use the build script's auto-pad (right-pad shorter lines with ASCII space). Don't try to left-pad manually — the script handles it.

## What NEVER to do

- Never use `String.prototype.length` for width (counts UTF-16 code units, not cells).
- Never use `padEnd` (doesn't know about CJK).
- Never eyeball alignment — always `string-width` verify.
- Never assume a kaomoji is N cells without testing.
- Never mix emoji + CJK + ASCII in a face without explicit per-char width check.
