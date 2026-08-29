# Validation — Seam Contracts + Audit Checklist

The 3-stage pipeline is only as solid as its seams. This file pins the contracts and the audit checks.

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
}
```

**Invariants Stage 1 must satisfy:**
- `lines.length === measured.length`
- `measured.every(m => m <= target)`
- If `faceGlyph` present, `faceGlyph !== faceFallback`
- `lang` is set (no `unknown`)

**If invariants break:** Stage 2 rejects. Caller retries Stage 1 with shrunken input.

## Seam 2: Stage 2 → Stage 3

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

**Invariants Stage 2 must satisfy:**
- `block[0]` and `block[last]` are pure borders
- `block.length >= 3` (top + content + bottom)
- Every line measures `outerW` cells
- Border set is consistent within `block`
- If `!ok`, `diff` is populated

**If invariants break:** Stage 3 cannot fix structural issues (border char count wrong, set mixed). Caller retries Stage 1 — Stage 2 failure means Stage 1 lied.

## Stage 3 audit checklist

Per panel, the auditor verifies by eye:

### Corner check
- [ ] `block[0][0]` is top-left corner of `borderSet`
- [ ] `block[0][outerW-1]` is top-right corner
- [ ] `block[last][0]` is bottom-left corner
- [ ] `block[last][outerW-1]` is bottom-right corner

### Border check
- [ ] `block[0][1..outerW-2]` all == horizontal border char of set
- [ ] `block[last][1..outerW-2]` all == horizontal border char of set
- [ ] Every `block[i][0]` for `1 <= i < last` == vertical border char
- [ ] Every `block[i][outerW-1]` for `1 <= i < last` == vertical border char

### Content check
- [ ] No tofu (`?`, `□`, `▯`, `◇`) in mid lines
- [ ] No face glyph rendered as missing
- [ ] All mid lines visually same length (eye, not script)
- [ ] NBSP padding visible as gap before right border (not collapsed)

### Consistency check
- [ ] Border set uniform within panel
- [ ] No mixed weights (`╔` with `┌` would be a bug)

### Cross-panel check (during grid assembly)
- [ ] All panel blocks share gutter alignment
- [ ] Gutter char is single space (or `│` for vertical, `─` for horizontal, never mixed)
- [ ] No panel extends beyond gridW

## Stage 3 edit primitives

The auditor may perform ONLY these edits:

- **Rebuild top border:** `block[0] = corner_TL + horiz.repeat(outerW-2) + corner_TR`
- **Rebuild bottom border:** `block[last] = corner_BL + horiz.repeat(outerW-2) + corner_BR`
- **Insert NBSP** at column N of a mid line
- **Delete** a char at column N (only if it's NBSP)
- **Swap glyph** at known position (face tofu → `faceFallback`)
- **Downgrade** entire panel to ASCII border set

## Forbidden edits

- Changing words
- Rewrapping content
- Moving content between lines
- Changing panel count
- Adding/removing panels
- Changing `innerW` (that would require re-running Stage 1)

## Recovery cascade (final)

| Failure | Action |
|---|---|
| Stage 1: invariant broken | retry Stage 1 with shrunken text (max 1) |
| Stage 2: invariant broken | bug — retry Stage 1 |
| Stage 3: 1 issue | auditor fixes by hand, re-verify |
| Stage 3: same issue 2nd round | downgrade to ASCII, emit `⚠` |
| Stage 3: structural (wrong corner count) | bug — retry Stage 1 |
| Grid: gutter collapse | recompute, redo Stage 2/3 |
