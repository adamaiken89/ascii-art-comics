# box-auditor

Stage 3. Visual + manual fix. Read the rendered block, check edges, fix what script can't see.

## Role

Inspect each panel block by eye. Verify corners, borders, content integrity, padding. Fix issues by hand using only allowed edit primitives. Downgrade to ASCII if unfixable after 2 rounds.

## Input

```ts
type Input = {
  panelId: number
  block: string[]
  outerW: number
  borderSet: 'heavy' | 'light' | 'ascii'
  faceGlyph?: string
  faceFallback?: string
  faceAscii?: string
  round: number                 // 1 or 2 — current audit round
}
```

## Output contract

```ts
type AuditResult = {
  panelId: number
  block: string[]               // possibly edited
  outerW: number
  borderSet: 'heavy' | 'light' | 'ascii'   // possibly downgraded
  ok: boolean
  issues: Array<{ type: string; line: number; col?: number; fix: string }>
  downgraded?: boolean
}
```

## Audit checklist (per panel)

### Corners
- `block[0][0]` is top-left corner of `borderSet`
- `block[0][outerW-1]` is top-right corner
- `block[last][0]` is bottom-left corner
- `block[last][outerW-1]` is bottom-right corner

### Borders
- `block[0][1..outerW-2]` all == horizontal char of set
- `block[last][1..outerW-2]` all == horizontal char of set
- Every `block[i][0]` for `1 <= i < last` == vertical char
- Every `block[i][outerW-1]` for `1 <= i < last` == vertical char

### Content
- No tofu: `?`, `□`, `▯`, `◇` in mid lines
- `faceGlyph` rendered correctly (or swap to `faceFallback`)
- All mid lines visually same length
- NBSP padding shows as gap before right border (not collapsed)

### Consistency
- Border set uniform within panel
- No mixed weights

## Allowed edit primitives

1. **Rebuild top border:** `block[0] = corner_TL + horiz.repeat(outerW-2) + corner_TR`
2. **Rebuild bottom border:** `block[last] = corner_BL + horiz.repeat(outerW-2) + corner_BR`
3. **Insert NBSP** at column N of a mid line
4. **Delete** a char at column N (only if NBSP)
5. **Swap glyph** at known position (face tofu → `faceFallback`)
6. **Downgrade** entire panel to ASCII border set (heavy/light → ascii)

## Forbidden edits

- Changing words
- Rewrapping content
- Moving content between lines
- Changing panel count
- Changing `innerW`

## Tofu detection

Tofu chars (render as missing glyph): `?`, `□`, `▯`, `◇`, `�`. If any found in mid lines:
- If `faceFallback` available: swap glyph at that position
- Else: replace with `faceAscii` (ASCII-only equivalent)

## Downgrade policy

After 2 audit rounds with unfixed issues, downgrade `borderSet` to `ascii`:
1. Set `borderSet: 'ascii'`
2. Rebuild all 4 borders in ASCII chars
3. Keep all content as-is
4. Set `downgraded: true` in output
5. Caller will prepend `⚠ alignment degraded` to comic

## Round counter

Caller tracks `round`. Pass 1: full audit, fix what found. Pass 2: re-audit after fixes, downgrade if still broken.

## Reference implementation sketch

```ts
function audit(input: Input): AuditResult {
  let { block, outerW, borderSet } = input
  const issues: AuditResult['issues'] = []

  // Corner check
  const b = BORDERS[borderSet]
  if (block[0][0] !== b.TL) {
    block[0] = b.TL + block[0].slice(1)
    issues.push({ type: 'corner_TL', line: 0, fix: 'rebuild' })
  }
  // ... similar for other corners

  // Border continuity
  // ... check block[0][1..outerW-2] are all b.T

  // Tofu check
  for (let i = 1; i < block.length - 1; i++) {
    for (let j = 0; j < block[i].length; j++) {
      if (TOFU.has(block[i][j])) {
        // swap to fallback
        const line = block[i]
        block[i] = line.slice(0, j) + (input.faceFallback || '?') + line.slice(j + 1)
        issues.push({ type: 'tofu', line: i, col: j, fix: 'fallback' })
      }
    }
  }

  return { panelId: input.panelId, block, outerW, borderSet, ok: issues.length === 0, issues }
}
```

## Failure → Caller action

| Result | Caller does |
|---|---|
| `ok: true, issues: []` | accept, proceed to grid assembly |
| `ok: false, issues: [...]`, round 1 | re-audit with `round: 2` |
| `ok: false, issues: [...]`, round 2, still issues | downgrade to ASCII, emit with `⚠` |
| `downgraded: true` | caller adds `⚠ alignment degraded` to output |
