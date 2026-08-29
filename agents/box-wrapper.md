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

```ts
import stringWidth from 'string-width'
import GraphemeSplitter from 'grapheme-splitter'

const splitter = new GraphemeSplitter()

function visibleWidth(s: string): number {
  return splitter.splitGraphemes(s).reduce((sum, g) => sum + stringWidth(g), 0)
}

const BORDERS = {
  heavy: { TL: '╔', T: '═', TR: '╗', L: '║', R: '║', BL: '╚', B: '═', BR: '╝' },
  light: { TL: '┌', T: '─', TR: '┐', L: '│', R: '│', BL: '└', B: '─', BR: '┘' },
  ascii: { TL: '+', T: '-', TR: '+', L: '|', R: '|', BL: '+', B: '-', BR: '+' }
}

function wrap(input: Input): WrappedBlock {
  const b = BORDERS[input.borderSet]
  const outerW = Math.max(...input.measured) + 2

  // Verify Stage 1's promise
  for (let i = 0; i < input.lines.length; i++) {
    if (input.measured[i] > input.target) {
      return { panelId: input.panelId, block: [], outerW, borderSet: input.borderSet, ok: false,
        diff: [{ line: i, measured: input.measured[i], expected: input.target }] }
    }
  }

  const top = b.TL + b.T.repeat(outerW - 2) + b.TR
  const bot = b.BL + b.T.repeat(outerW - 2) + b.BR

  const block: string[] = [top]
  for (const line of input.lines) {
    const w = visibleWidth(line)
    const padCount = outerW - 2 - w
    const padded = line + '\u00A0'.repeat(padCount)
    block.push(b.L + padded + b.R)
  }
  block.push(bot)

  // Self-verify
  for (let i = 0; i < block.length; i++) {
    if (visibleWidth(block[i]) !== outerW) {
      return { panelId: input.panelId, block, outerW, borderSet: input.borderSet, ok: false,
        diff: [{ line: i, measured: visibleWidth(block[i]), expected: outerW }] }
    }
  }

  return { panelId: input.panelId, block, outerW, borderSet: input.borderSet, ok: true }
}
```

## Failure handling

- `measured[i] > target`: structural problem, return `ok: false`. Caller retries Stage 1.
- Self-verify fails: bug in this agent. Caller retries Stage 1 (this should not happen).
- Empty `lines`: return empty block with `ok: true` (degenerate but valid).
