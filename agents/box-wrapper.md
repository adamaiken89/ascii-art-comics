# box-wrapper

Stage 2. Pure mechanical wrap of content lines with borders. No content knowledge, no lang detection.

## Role

Take measured content lines, compute `outerW`, pad with NBSP, build top/bottom borders, return bordered block.

## Input

```ts
type Input = {
  panelId: number
  lines: string[]              // from Stage 1
  measured: number[]           // from Stage 1
  target: number               // innerW
  borderSet: 'heavy' | 'light' | 'ascii'
  faceGlyph?: string
  faceFallback?: string
}
```

## Output contract

```ts
type WrappedBlock = {
  panelId: number
  block: string[]              // bordered, NBSP-padded
  outerW: number
  borderSet: 'heavy' | 'light' | 'ascii'
  ok: boolean
  diff?: Array<{ line: number; measured: number; expected: number }>
}
```

## Rules

1. **Compute `outerW = max(measured) + 2`.** Never less, never more. (Re-verify Stage 1's `measured`.)
2. **Pad every content line to `outerW - 2` visible cells using NBSP.** Not ASCII space.
3. **Build top:** `corner_TL + horiz.repeat(outerW-2) + corner_TR`
4. **Build bottom:** `corner_BL + horiz.repeat(outerW-2) + corner_BR`
5. **Build each mid line:** `vert + paddedLine + vert`
6. **Verify every line of `block` measures exactly `outerW` visible cells.**
7. **Use exact border chars per set** (see `references/panels.md`).
8. **No content modification.** No rewrap, no char changes, no word changes.
9. **If any `measured[i] > target`:** set `ok: false`, populate `diff`, do not build block.
10. **Return shape strictly typed.** Caller parses JSON.

## Border char map (in this agent's memory)

| Set | TL | T | TR | L | R | BL | B | BR |
|---|---|---|---|---|---|---|---|---|
| Heavy | `╔` | `═` | `╗` | `║` | `║` | `╚` | `═` | `╝` |
| Light | `┌` | `─` | `┐` | `│` | `│` | `└` | `─` | `┘` |
| ASCII | `+` | `-` | `+` | `\|` | `\|` | `+` | `-` | `+` |

## Reference implementation

The wrapper is a pure deterministic script, **not** an LLM call. Invoke:

```bash
node scripts/box-wrap.mjs < request.json
```

Exit codes:
- `0` — every panel OK
- `1` — width/overflow failure (retry Stage 1)
- `2` — bad input (missing panels, malformed JSON)

### Border set mapping

Spec vocabulary → script vocabulary:

| Spec (`borderSet`) | Script (`style`) | Chars |
|---|---|---|
| `heavy` | `A` | ╔ ═ ╗ ║ ╚ ╝ |
| `light` | `B` | ┌ ─ ┐ │ └ ┘ |
| `ascii` | `C` | + - \| |

### request.json shape

```json
{
  "panels": [
    {
      "style": "A",
      "lines": ["line1", "line2", "..."],
      "width": 28,
      "target": 30
    }
  ],
  "layout": { "cols": 0, "gap": 3, "align": "center" }
}
```

- `style` — required, one of A/B/C
- `lines` — required, content from Stage 1 (no trailing whitespace)
- `width` — optional fixed innerW; if set, content MUST fit
- `target` — optional outerW target; script derives innerW = target - 2
- `layout.cols` — 0/1 = vertical stack, >1 = grid with N columns
- `layout.gap` — cells between panels (default 3)

### Stage 1 → script translation

Before calling `box-wrap.mjs`, translate the Stage 1 contract to the script's:

```ts
// Stage 1 returns
type Stage1Output = {
  panels: Array<{
    panelId: number
    lines: string[]
    measured: number[]
    target: number
    borderSet: 'heavy' | 'light' | 'ascii'
  }>
}

// Translate to script input
const request = {
  panels: Stage1Output.panels.map(p => ({
    style: { heavy: 'A', light: 'B', ascii: 'C' }[p.borderSet],
    lines: p.lines,
    width: p.target,
  }))
}
```

### Output parsing

```ts
const result = JSON.parse(scriptStdout)
if (!result.ok) {
  // result.errors[] has details
  // retry Stage 1
}
// result.block is the final rendered comic
// result.outerW is the widest outer line
// result.panels[] has per-panel diagnostics
```

## Failure handling

- Script exits `1` with `ok: false`: width overflow, padding failure, or post-wrap mismatch. Caller retries Stage 1 (treat as bug).
- Script exits `2`: malformed input. Caller fixes request shape.
- Script exits `0` with `ok: true`: pass to Stage 3 (auditor) regardless of `outerW`.
