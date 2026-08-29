# Panels — Box Math, Border Sets, Layout

## Border sets (3 only)

| Set | Chars | Use case |
|---|---|---|
| Heavy | `╔ ═ ╗ ║ ╚ ╝` | A. kaomoji-cinematic default |
| Light | `┌ ─ ┐ │ └ ┘` | B. panel-manga default |
| ASCII | `+ - \|` (corners: `+`) | C. noir / fallback / post-audit downgrade |

**One set per panel. No mixing within a panel.**

## Border char map

| Set | TL | T | TR | L | R | BL | B | BR |
|---|---|---|---|---|---|---|---|---|
| Heavy | `╔` | `═` | `╗` | `║` | `║` | `╚` | `═` | `╝` |
| Light | `┌` | `─` | `┐` | `│` | `│` | `└` | `─` | `┘` |
| ASCII | `+` | `-` | `+` | `\|` | `\|` | `+` | `-` | `+` |

## Inner / outer width math

```
innerW   = max(visibleWidth(line) for line in contentLines)
outerW   = innerW + 2                            // +1 left border, +1 right border
top/bot  = corner_TL + horiz*(outerW-2) + corner_TR
mid      = vert + contentLine + vert             // contentLine padded to outerW-2 visible cells
```

Stage 1 only knows `innerW`. Stage 2 computes `outerW` from the content. Stage 3 verifies the math agrees with rendering.

## Padding

```ts
function padMid(line: string, outerW: number, vert: string): string {
  const w = visibleWidth(line)
  const contentW = outerW - 2
  if (w > contentW) {
    // Stage 1 lied. Auditor / caller must reject.
    throw new Error(`line exceeds content width: ${w} > ${contentW}`)
  }
  const pad = '\u00A0'.repeat(contentW - w)  // NBSP
  return vert + line + pad + vert
}
```

## Multi-panel layout

For a row of N panels with G-cell gutters:
```
totalW = sum(panel[i].outerW for i in panels) + (N-1) * G
```

For a grid of R rows × C cols:
```
rowW[r] = sum(panel[r][c].outerW for c) + (C-1) * G
gridW   = max(rowW[r] for r)
gridH   = sum(panel[r][0].block.length for r) + (R-1) * G_h
```

**Gutter chars:**
- Vertical gutter between side-by-side panels: ` ` (single space) or `│` (visual divider, must match set of adjacent panels)
- Horizontal gutter between stacked panels: blank line or `─`-spanning divider

## Bubble tail (for free-floating speech)

Tail column = `boxLeft + 2 + visibleWidth(contentLines[0].substring(0, breakAt))`

Where `breakAt` = index of first space-or-comma in first content line, OR end of line if no break.

Tail chars: `╲` (descending) or `╱` (ascending). Place on row below bubble, column = tail col.

## Example — Stage 1 output

```json
{
  "panelId": 1,
  "lines": ["  ╭──╮  ", "  │◕_◕│ ", "  ╰──╯  ", " 完蛋喇 "],
  "measured": [10, 10, 10, 7],
  "target": 20,
  "lang": "cjk",
  "mood": "panic",
  "faceGlyph": "◕_◕",
  "faceFallback": "o_o"
}
```

## Example — Stage 2 output

```
╔════════════╗
║  ╭──╮      ║
║  │◕_◕│     ║
║  ╰──╯      ║
║ 完蛋喇     ║
╚════════════╝
```

`outerW = 14`. Every line measures 14 cells. (NBSP not visible here in plain preview; in actual file, `║ 完蛋喇<NBSP×6>║`.)
