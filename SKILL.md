---
name: ascii-art-comics
description: Generate comic panels with monospace layout, dialogue bubbles, and CJK-safe alignment. Use when the user wants a comic, a text-based comic strip, kaomoji panel art, or asks to "draw a comic" / "make a comic about X" / "comic in ASCII". Triggers on requests involving comic panels, speech bubbles, character expressions, or sequential art. Default output is SVG (deterministic, perfect alignment); ASCII output available for terminal paste.
---

Comic generator with two output modes. **SVG is default** — cell-precise text placement via `textLength` + `lengthAdjust`, no LLM in the render path, no spatial blindness. **ASCII is legacy** — for users who want to paste into markdown/terminal.

## When to use

User asks for a comic, text comic, kaomoji comic, or any "draw X as a comic" request where monospace output is acceptable. SVG output is preferred unless the user explicitly asks for ASCII / plain text.

## Invocation flow

1. **Intake** — clarify if ambiguous:
   - style (A kaomoji / B manga / C noir; default A)
   - language (CJK / EN / mixed; auto-detect if unambiguous, else ask)
   - panel count and rough scene
   - output mode: SVG (default) or ASCII
2. **Layout** — compute per-panel `innerW` (visible cells of content area)
3. **Stage 1** → call `content-generator` subagent per panel (or run `scripts/content-generator.mjs` to validate)
4. **Stage 2** → render via `scripts/svg-render.mjs` (SVG) or `scripts/box-wrap.mjs` (ASCII)
5. **Grid assembly** — place panels with gutters
6. **Emit** — SVG via `code` fence, ASCII via plain fence (no `text` lang tag)

## Pipeline seam

```
Stage 1                            Stage 2 (output)
content-generator  →  ──────────→  svg-render       (default)
{lines, measured}                  box-wrap         (legacy ASCII)
                                   pure content     (style C, no border)
```

Stage 1 = content lines + widths. Pure data, no rendering.
Stage 2 = render. Deterministic script, no LLM. SVG handles all alignment at the rasterizer.

**No Stage 3 auditor.** The "visual audit" idea was dropped because LLMs have spatial blindness (see `references/llm-spatial-blindness.md`). SVG output cannot be misaligned by construction.

## Recovery cascade

| Failure | Action |
|---|---|
| Stage 1: line wider than target | retry once with shrunken text |
| Stage 1: NBSP leak | reject (NBSP forbidden in content) |
| Stage 2: structural error | bug in script — report, do not retry |
| Output: wrong width after render | adjust Stage 1 target, re-render |

## Output contracts

### SVG (default)

```html
<svg width="W" height="H" viewBox="0 0 W H" xmlns="http://www.w3.org/2000/svg">
  <style>text { font-family: ui-monospace, ...; font-size: ... }</style>
  <rect ... borders ... />
  <text x="..." y="..." textLength="..." lengthAdjust="spacingAndGlyphs">...</text>
  ...
</svg>
```

Emit in a ```` ```svg ```` fence. Inline CSS. No external assets.

### ASCII (legacy)

- Plain ```` ``` ```` fence (no `text` lang tag)
- NBSP (U+00A0) inside `║ ║` for right-padding
- ASCII space outside borders
- One border set per panel; no mixing
- No trailing whitespace outside borders

### Style C (noir, borderless)

Either format: emit raw content lines, no border.

## Pointer map

- Persona + hard rules → `references/persona.md`
- Width math, NBSP, forbidden ops → `references/persona.md` § Width
- Border sets, gutter math → `references/panels.md`
- Seam contracts → `references/validation.md`
- Wrap rules per language → `references/dialogue.md`
- **Debugging misaligned boxes / wrong widths → `references/debugging.md`** (CJK + emoji gotchas, 6 common bugs)
- **Why SVG over ASCII (LLM spatial blindness) → `references/llm-spatial-blindness.md`**
- Face registry (center/left/right × mood) → `assets/faces.json`
- Component library (80 components: faces, bodies, gestures, props, scene, frames, bubbles, separators) → `assets/components.json`, source in `assets/components-src/`
- Subagent specs → `agents/`
- Style guides → `references/styles/`
- Example comics + runnable fixtures → `assets/examples/`

## Component library

`assets/components.json` (built from `assets/components-src/<category>/*.txt`) is a registry of reusable comic pieces — faces, bodies, gestures, props, scene elements, frames, separators, speech bubbles. Each component has pre-computed `width` and `height` for layout planning.

**Chibi faces**: 9 moods × 3 directions (center / left / right) = 27 variants. All 7 cells wide.

Build: `node scripts/build-library.mjs`
Render report: `python3 scripts/render-components.py` → `assets/components-renders/REPORT.md`
