## Plan: ASCII-intermediate comic pipeline — harness draws, raster output is the stable artifact

**Architecture (final):**
```
LLM → semantic JSON (components, cell coordinates, dialogue text, speaker refs)
    → composer: builds raw ASCII cell grid (borders, bubbles, kaomoji/chibi, props)
    → raw ASCII stored as intermediate artifact (.txt alongside output)
    → validator: exact cell-space checks (visible widths are ground truth here)
    → rasterizer: PIL draws each grapheme at exact (col×cellW, row×cellH) with a
      bundled font → PNG + JPEG
```

**Why this solves your three problems:**
- **Broken boxes:** the LLM never draws a box — the composer owns all borders/bubbles. Alignment is guaranteed by construction, and unlike the old Stage-2/3 repair loop, there is nothing to repair because freehand drawing is gone.
- **Validation vs font:** validation happens in **cell space**, where the composer itself sets every cell — visible-width per line (string-width/grapheme-aware) is exact ground truth, not a font-dependent fiction. The rasterizer then draws character-by-character at fixed cell origins, so **font advance widths never participate in alignment** — a wider glyph can overhang its cell but cannot shift the next character. Output is byte-stable across platforms.
- **Misleading terminal:** the raw `.txt` remains readable/advisory, but the PNG/JPEG is the source of truth, rendered with a pinned font. Docs will state: never judge output in a terminal.
- **Richer settings:** the vocabulary lives in the component library the LLM picks from.

Existing SVG renderers are left untouched as legacy; the new pipeline runs in parallel until it replaces them.

---

### Phase A — Cell-space composer (`scripts/compose.mjs`)

1. **Content model** (extends the existing semantic-JSON shape, but in cell units): `panels[]` with `{width, height}` in cells, `content[]` of `{type: "component"|"text", id, x, y}` where `id` resolves to ASCII art (parametric chibi from `assets/faces.json` `chibi_boxes`, ASCII prop/scene glyphs, kaomoji), plus `dialogue[]` with `{panelId, text, align, speaker}`.
2. Composer places components into a 2D cell array, draws panel borders (reuse the `BORDERS` styles), sizes and draws speech bubbles (wrap via `string-width`, grapheme-safe — the good wrap from `comic-render.mjs`, not the CJK-unsafe one), with tails pointing at speaker-ref cells.
3. **Collision + bounds detection at compose time:** overlapping components or out-of-panel placement produce issues (see Phase B) instead of silent overwrites — this is the harness equivalent of the old box-wrapper agent, but deterministic.
4. Output: `{panels: [{ascii, width, height}], issues, meta}`; CLI writes the raw ASCII artifact `<name>.txt`.

### Phase B — Validation + retry harness

1. Validator (extend `scripts/validate.py` patterns, applied to the composed grid): uniform visible width per panel, border continuity/corners, bubble text fits bubble box, no tofu/forbidden emoji, fullwidth-char sanity (`﹏` etc. counted as 2 cells — the `debugging.md` traps).
2. Issues shape `{type, panel, row, col, expected, got, fix}` — same convention as `validate.py`. `severity: error` blocks rasterization.
3. `scripts/render-ascii-comic.py <content.json> -o out` — full pipeline (compose → validate → self-repair up to N times: grow panel, re-wrap, nudge colliding components → raster). Returns issues JSON either way; SKILL.md documents the agent loop: render → read `fix` hints → patch JSON → re-render (max 3).

### Phase C — Char-by-char rasterizer (`scripts/raster-cells.py`)

1. PIL draws each grapheme at its exact cell origin. Latin glyphs from a **bundled OFL monospace font** in `assets/fonts/` (e.g. JetBrains Mono, ~200KB); CJK/fullwidth glyphs from a per-glyph fallback font (auto-detected system CJK font, configurable via flag) drawn at 2-cell width.
2. Cell size derived from the bundled font's max Latin advance; fullwidth = 2× cell. White background, panel-optional shading, JPEG quality 90 alongside PNG.
3. Golden tests: PNG hash parity for fixtures (deterministic because font is bundled and placement is exact).

### Phase D — Richer vocabulary

1. Moods 10 → ~15 (sleepy, love, dizzy, proud, embarrassed, suspicious) — extend the parametric chibi `chibi_boxes` generator + `faces.json`.
2. Hand-authored small ASCII props/scene glyphs (coffee, laptop, tree, house, rain, moon, …) registered in `components.json` with both ASCII and SVG variants (SVG stays in sync via existing `build-library.mjs`).
3. Scene presets: composite backdrops (`desk`, `park`, `night`, …) = named sets of scene glyphs placed by the composer.

### Phase E — Test & doc hardening

1. Replace `ok:true`-only tests: cell-grid invariant assertions on composed output, issue-type regression fixtures (collision, overflow, dangling speaker, CJK wrap), golden PNG hashes, raw `.txt` artifact parity.
2. Docs: rewrite SKILL.md + README around the new pipeline (semantic JSON schema, retry loop, "PNG/JPEG is the source of truth — don't judge in terminal"); mark SPEC.md + legacy `agents/*.md` superseded; note in `references/validation.md` why validation moved to cell space.

**Order:** A → B → C → D → E (compose/validate before raster so the rasterizer consumes already-validated grids; vocabulary last, landing in the hardened pipeline).

**Out of scope:** changes to the existing SVG renderers (legacy, untouched), image models, web UI, freehand-LLM-ASCII mode.