# comic-svg

Generate comics as **SVG**. Pixel-accurate bubbles, parametric chibis, 2-speaker dialogue, CJK + English safe.

## Sample comic

Rendered from `assets/examples/fixtures/monday-morning-comic.json` — 4 panels, 2 chibi speakers alternating left/right, mixed CJK+EN dialogue bubbles, pure SVG primitives.

![Monday Morning comic](assets/examples/comics/monday-morning-comic.svg)

Two chibis. Monday. A deadline. Coffee. One JSON → one SVG.

## Architecture (v0.2)

```
content (json) → comic-render.mjs → SVG
```

**One renderer.** No ASCII legacy. No parallel content models. No `textLength` guessing. The renderer uses constant monospace metrics (CHAR_W_RATIO = 0.6) and lets the rasterizer do what it does well.

**Parametric chibis.** No 27 separate SVG files. `chibi(mood, dir)` is a function that returns SVG inline. Adding a new mood is one map entry, not one file.

**Speaker by ref.** `speaker: {component: "chibi-happy-center", anchor: "bottom"}` — the renderer snaps the tail to the speaker's bbox. No magic cell coordinates.

## Input schema

```json
{
  "title": "Monday Morning",
  "panels": [
    {
      "panelId": 0,
      "width": 220,                    // panel pixel width
      "bubbleHeight": 80,              // reserved bubble area
      "speaker": { "component": "chibi-happy-center", "anchor": "bottom" },
      "content": [
        { "type": "component", "id": "chibi-happy-center", "x": 20, "y": 20 }
      ]
    }
  ],
  "layout": { "cols": 2, "gap": 30, "padding": 24 },
  "dialogue": [
    { "panelId": 0, "text": "Monday again?", "align": "left" }
  ]
}
```

- `panels[].content[]` — items: `{type: "component", id, x, y}` or `{type: "text", text, x, y}`
- `panels[].speaker.component` — id of a component in the panel; renderer uses its bbox for tail anchor
- `panels[].speaker.anchor` — `top | bottom | left | right | top-left | top-right | bottom-left | bottom-right`
- `dialogue[].align` — `left | right | center` (bubble position within panel)
- `dialogue[].text` — auto-sized, word-wrap with grapheme fallback

## Usage

```bash
# Render a comic fixture
python3 scripts/render-comic-svg.py assets/examples/fixtures/monday-morning-comic.json

# Or pipe JSON directly
node scripts/comic-render.mjs < request.json > out.svg

# Build component library (chibi variants etc.)
npm run build:library
node scripts/render-components-svg.mjs     # showcase
```

## Tests

```bash
npm test
```

11/11 pass:
- 7 comic render tests (chibi parametric, directional, 2×2 grid, word-wrap, CJK, tail-follows-speaker, empty rejection)
- 1 comic fixture (monday-morning)
- 1 component library validator (99 components)
- 1 component SVG showcase
- 1 golden parity check

## Why no `textLength`?

`textLength` + `lengthAdjust="spacingAndGlyphs"` is fragile when the rasterizer's actual monospace advance width doesn't match your measured cell width. The bubble auto-sizer used `string-width × CHAR_W_RATIO` to compute box width, but the `<text>` inside used `<tspan>` with `text-anchor="middle"` and the rasterizer's own advance. If they disagreed, text would overflow or have padding.

**Fix:** pick one source of truth. v0.2 uses constant font metrics (`fs * 0.6`) for both bubble sizing AND text positioning. The rasterizer always matches itself.

## Structure

```
scripts/
  comic-render.mjs                # THE renderer (panels + components + bubbles)
  generate-component-svgs.mjs     # generates 99 SVG primitives
  build-library.mjs               # builds assets/components.json
  render-comic-svg.py             # CLI: fixture → SVG file
  render-components-svg.mjs       # generates showcase SVG
  validate-components.py          # checks all 99 components valid
  test.sh                         # full test suite
assets/
  components-svg/                 # 99 SVG primitives (8 categories)
  components.json                 # registry (id → svg, viewBox, w, h)
  examples/
    fixtures/                     # request JSON files
    comics/                       # end-to-end comic SVGs
  components-renders/             # visual showcase
```

## Adding a new chibi mood

Edit the `EYE`/`MOUTH`/`CLOSED` maps in `chibiSvg()` inside `comic-render.mjs`. One entry per mood. Done.

## Key constraints

- Monospace font stack: `'Courier New', Consolas, monospace`
- `font-variant-numeric: tabular-nums` for digit alignment
- Bubble width = `chars × fs × 0.6 + 2× padding`
- Tail x clamped to bubble width, anchor y drives top/bottom auto-detection
- Components in `assets/components-svg/` are validated via `validate-components.py` (viewBox + non-empty body)
