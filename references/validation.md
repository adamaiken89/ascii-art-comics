> **STATUS: SUPERSEDED (2026-08).** The v1 3-stage LLM-draws-ASCII pipeline described here
> was replaced by the ASCII-intermediate pipeline: LLM emits semantic JSON, the deterministic
> composer (`scripts/compose.ts`) draws the cell grid, and output is rasterized PNG/JPEG
> (`scripts/render-ascii-comic.py`). See README.md and SKILL.md. Kept for history.

# Validation — Seam Contracts

The pipeline is only as solid as its seams. This file pins the contracts.

## Seam 1: Stage 1 → Stage 2

```ts
type ContentBlock = {
  panelId: number
  lines: string[]                    // raw, unbordered
  measured: number[]                 // visibleWidth(line[i]) — must all be <= target
  target: number                     // innerW — what Stage 1 was asked to fit
  lang: 'cjk' | 'en' | 'mix'
  mood: string
  faceGlyph?: string                 // for kaomoji / chibi
  faceFallback?: string              // tofu swap target
  direction?: 'center' | 'left' | 'right'  // chibi orientation
}
```

**Invariants Stage 1 must satisfy:**
- `lines.length === measured.length`
- `measured.every(m => m <= target)`
- If `faceGlyph` present, `faceGlyph !== faceFallback`
- `lang` is set (no `unknown`)

**If invariants break:** Stage 2 rejects. Caller retries Stage 1 with shrunken input.

## Seam 2: Stage 2 → Output

### SVG (default)

```ts
type SVGOutput = {
  svg: string                        // complete <svg>...</svg>
  width: number                      // pixel width
  height: number                     // pixel height
  ok: boolean
  errors?: string[]
}
```

**Invariants SVG output must satisfy:**
- `svg` is a well-formed `<svg>` element with `xmlns="http://www.w3.org/2000/svg"`
- All `<text>` elements have explicit `x`, `y`, `textLength`, `lengthAdjust="spacingAndGlyphs"`
- All `<rect>` / `<line>` border elements have explicit coordinates
- Inline `<style>` block defines `font-family: monospace`
- `width` and `height` match the `viewBox`

### ASCII (legacy)

```ts
type WrappedBlock = {
  panelId: number
  block: string[]                    // bordered, NBSP-padded
  outerW: number                     // every line of block measures this
  borderSet: 'heavy' | 'light' | 'ascii'
  ok: boolean                        // Stage 2 self-check
  diff?: Array<{ line: number; measured: number; expected: number }>
}
```

**Invariants ASCII output must satisfy:**
- `block[0]` and `block[last]` are pure borders
- `block.length >= 3` (top + content + bottom)
- Every line measures `outerW` cells
- Border set is consistent within `block`
- If `!ok`, `diff` is populated

## No Stage 3

The "visual audit" stage was removed. LLMs cannot reliably detect ASCII alignment (see `references/llm-spatial-blindness.md`). SVG output cannot misalign by construction (cell-precise `textLength`). ASCII output's structural check (every line == outerW) is sufficient — no LLM needed.

If a comic looks wrong:
- **SVG**: it's a content problem (wrong components, wrong panel order), not an alignment problem. The user or LLM can edit content freely; alignment is preserved.
- **ASCII**: re-run `scripts/box-wrap.mjs` after fixing content. If `ok: false`, the content violates the contract — fix Stage 1.

## Recovery cascade (final)

| Failure | Action |
|---|---|
| Stage 1: invariant broken | retry Stage 1 with shrunken text (max 1) |
| Stage 2: structural error | bug in script — report, do not retry |
| SVG render: `ok: false` | bug in script — report |
| ASCII render: `ok: false` | content overflow — retry Stage 1 |
| Output: wrong width | adjust Stage 1 target, re-render |
| Output: wrong content | edit content, re-render (alignment preserved) |
