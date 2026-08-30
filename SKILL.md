---
name: ascii-art-comics
description: Generate comic panels with monospace layout, dialogue bubbles, and CJK-safe alignment. Use when the user wants a comic, a text-based comic strip, kaomoji panel art, or asks to "draw a comic" / "make a comic about X" / "comic in ASCII". Triggers on requests involving comic panels, speech bubbles, character expressions, or sequential art. Default output is PNG/JPEG rasterized from a validated ASCII cell grid (byte-stable, font-independent); raw ASCII artifact kept as intermediate.
---

Comic generator. **PNG/JPEG via the ASCII-intermediate pipeline is default** — the LLM emits semantic JSON (which components, where, what dialogue), a deterministic composer draws the raw ASCII cell grid, a validator checks it in cell space, and a rasterizer draws each character at exact cell origins with a pinned font. **SVG renderers are legacy.** Raw `.txt` artifact is kept for readability but is advisory — the PNG is the source of truth.

## Why this design

- LLMs have spatial blindness (see `references/llm-spatial-blindness.md`) — 30–50% of hand-drawn ASCII lines misalign. Here **the LLM never draws a box**: it picks component ids and coordinates, the composer owns every border.
- Font variability is eliminated: composition, validation, and rasterization all share one width table (`scripts/lib/cellwidth.ts`, generated from Python's `unicodedata`), and the rasterizer positions each glyph at its cell origin, so font advance widths never affect alignment.
- **Never judge output in a terminal** — terminal fonts render ambiguous-width kaomoji glyphs at different widths than the pinned font. The `.txt` artifact is a convenience; the PNG/JPEG is what ships.

## Invocation flow

1. **Intake** — clarify if ambiguous: story/scene, mood vocabulary, language (CJK/EN/mixed), panel count.
2. Author semantic content JSON (schema below). Pick component ids from the vocabulary — **by name, never invent**.
3. Run: `python3 scripts/render-ascii-comic.py content.json -o out/name`
4. If `ok: false`, read `issues[].fix` hints, patch the JSON, re-run (max 3 passes). The harness also self-repairs mechanically (grows panels, shifts colliders) before giving up.
5. Deliver `out/name.png` (or `.jpg`) + optionally the `.txt` artifact with a terminal-width caveat.

## Content JSON schema

```json
{
  "title": "Monday Morning",
  "panels": [
    {
      "panelId": 0,
      "width": 36, "height": 12,
      "border": "round" | "heavy" | "ascii",
      "content": [
        { "type": "component", "id": "chibi-sad-center", "x": 4, "y": 5 },
        { "type": "component", "id": "coffee", "x": 20, "y": 6 },
        { "type": "text", "text": "Zzz", "x": 26, "y": 5 }
      ],
      "speaker": { "component": "chibi-sad-center" }
    }
  ],
  "dialogue": [
    { "panelId": 0, "text": "…", "align": "left|center|right",
      "style": "round|shout|thought|whisper",
      "label": "Mo",                                  // speaker name in the bubble border
      "speaker": { "component": "chibi-happy-right" } // per-line tail target (falls back to panel.speaker)
    }
  ]
}
```

Coordinates are **cells** (0,0 = first interior cell; width/height include the border).

Panel-level conveniences:
- `y: "floor"` on any content item — stand on the interior floor.
- `ground: true` — draw a `▁` floor line across the panel.
- `layout: "two-shot"` + `cast: [{id, side?}]` — two characters facing each other on the floor (first defaults `left`, second `right`); classic staging for conversations.
- Bubble styles: `round` (default), `shout` (heavy border), `thought` (round + drifting `o ˙` tail — inner monologue), `whisper` (dashed — asides).
- Attribution: give every dialogue a `label` (rendered as `╭─ Mo ──╮` in the border) and a `speaker` ref so the tail points at the right character. Consistency rule: one bubble style per character per comic; `shout` only for the one big retort.

## Component vocabulary

- `chibi-<mood>-<dir>[-<pose>]` — parametric character: 3-row face box + simple body (arms `╱│╲`, torso, legs), 6 rows total. 16 moods (happy, sad, panic, angry, smug, dead, thinking, shocked, neutral, excited, confused, sleepy, love, dizzy, proud, embarrassed, suspicious) × 3 directions (center/left/right) × poses (`basic`, `up` = arms raised `╲│╱`, `point` = pointing, flips with direction). Faces are canonical ASCII kaomoji (`^_^`, `T_T`, `O_O`, `>#<`, `¬_¬`, `x_x`, `0_0`, `*_*`, `^o^`, `?_?`, `-.-`, `@_@`, `._.`, `^3^`, `<_<`, `^///^`) — always symmetric; direction shifts the face inside the box. Box width adapts to wider faces (`^///^`) instead of breaking. (happy, sad, panic, angry, smug, dead, thinking, shocked, neutral, excited, confused, sleepy, love, dizzy, proud, embarrassed, suspicious) × 3 directions (center/left/right). Faces are canonical ASCII kaomoji (`^_^`, `T_T`, `O_O`, `>#<`, `¬_¬`, `x_x`, `0_0`, `*_*`, `^o^`, `?_?`, `-.-`, `@_@`, `._.`, `^3^`, `<_<`, `^///^`) — always symmetric; direction shifts the face inside the box. Box width adapts to wider faces (`^///^`) instead of breaking.
- `face-<mood>` — kaomoji line from `assets/faces.json`.
- `fx/<name>` — reaction glyphs: `sweat` (`;;`), `zzz` (`z Z`), `anger` (3-row vein cross), `em` (`!!`), `q` (`??`), `heart`, `note`. Place at head height, touching the head box (one row above / one column beside it) — a floating fx reads as random noise. Use sparingly: at most one per panel.
- `prop/<name>` — daily-life props: bed, table, chair, tv, cat, bread, noodles, umbrella, bag, window, plant, laptop, coffee, book, phone, … (full list in `assets/ascii-library.json`).
- `preset-<name>` — scene backdrops: `bedroom`, `kitchen`, `cafe`, `living-room`, `home`, `street`, `office`, `night`, `storm`, `outdoors`.
- Library ids (`prop/coffee` or bare `coffee`, `scene/sun`, `gesture/thumbs-up`, `body/shrug`, …) — ASCII art in `assets/ascii-library.json`.
- `preset-<name>` — scene backdrop: `outdoors`, `night`, `storm`, `office`.

## Issue types (shared shape `{type, panel, row, col, severity, expected, got, fix}`)

| Type | Meaning | Harness self-repair |
|---|---|---|
| `component_out_of_bounds` / `text_overflow` | content exceeds panel interior | grows panel |
| `bubble_overflow` | bubble + tail exceed interior | grows panel |
| `component_overlap` / `bubble_overlap` | collision | shifts items / pushes content below bubble |
| `tail_truncated` | speaker far from bubble | warning only |
| `unknown_component` | id not resolvable | **unrepairable** — agent must fix the id |
| `width_drift` / `border_*` | grid invariant violated (composer bug) | report |
| `glyph_missing` / `cjk_font_missing` | rasterizer font coverage | warning; add `--cjk-font` |

`severity: "error"` blocks rasterization; warnings still render.

## Random comic generator

`bun scripts/random-comic.ts --seed N --structure daily4|manzai -o out/prefix` — samples
line banks (`assets/lines/*.json`) per story beat, casts two characters, and runs the
validated pipeline. Seeded = reproducible. Extend variety by adding lines to the banks —
never by inventing glyphs (see `references/vocabulary-sources.md`).

## Story structure (daily conversation comics)

Two proven 4-panel structures — beat guides in `assets/stories/`:

- **`daily4` (kishōtenketsu)** — intro → develop → twist → harmonize. Conflict-free, ideal for routines/meals/commutes/weather. Twist recontextualizes; the ketsu ties back to panel 1.
- **`manzai` (boke/tsukkomi)** — two roles: the *boke* says the silly thing, the *tsukkomi* retorts (shout bubble, reaction FX). Two-shot staging in every panel.

Write one dialogue line per beat; keep the twist everyday-scale.

## Pipeline internals

```
content.json ─→ scripts/compose.ts          (cell grid, borders, bubbles, collisions)
             ─→ scripts/validate-grid.py     (cell-space invariants)
             ─→ repair loop (≤3, deterministic)
             ─→ scripts/raster-cells.py      (char-by-char PIL draw, pinned font)
             ─→ out/name.{txt,png,jpg} + issues JSON
```

- Width rule everywhere: `2 if East Asian Width ∈ {W,F} else 1`, per codepoint. JS reads `scripts/lib/eaw-ranges.ts` (GENERATED from Python `unicodedata` — regenerate it, never hand-edit).
- Bundled font: `assets/fonts/JetBrainsMono-Regular.ttf` (OFL). CJK/missing glyphs fall back per-codepoint through platform fonts (cmap-checked; JIT-less, deterministic).
- Tests: `npm test` — includes render fixtures, repair-loop checks, PNG+TXT golden parity, and a JS↔Python width-table parity check.

## Legacy (kept, not default)

- `scripts/comic-render.ts` + `scripts/render-comic-svg.py` — SVG renderer path.
- `scripts/template-render.ts` — template path.
- `SPEC.md`, `agents/*.md`, `scripts/harness.py` — superseded v1 stages; see `references/llm-spatial-blindness.md` for why the LLM-draws-ASCII + LLM-audits design was abandoned.

## Pointer map

- **Vocabulary building reference (sources + canonical forms) → `references/vocabulary-sources.md`** — cite a source before adding/changing any glyph
- Width rule + EAW table → `scripts/lib/cellwidth.ts`, `scripts/lib/eaw-ranges.ts`
- Border sets, gutter math → `references/panels.md`
- Wrap rules per language → `references/dialogue.md`
- Debugging misaligned boxes → `references/debugging.md`
- Why the LLM is not in the render path → `references/llm-spatial-blindness.md`
- Faces → `assets/faces.json`; ASCII component library → `assets/ascii-library.json`
- Fixtures (runnable) → `assets/examples/fixtures/ascii/`; outputs + goldens → `assets/examples/comics/ascii/`
