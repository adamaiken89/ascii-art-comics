# Dialogue — Wrap Rules per Language

## Language detection

1. Count CJK chars (Unicode range U+4E00–U+9FFF, U+3400–U+4DBF, U+3040–U+30FF, U+AC00–U+D7AF)
2. If CJK ratio > 30% of total content chars → `cjk`
3. Else if any CJK present → `mix`
4. Else → `en`

If user explicitly states language, override detection.

## Wrap by language

### English (`en`)

- Word boundary wrap. Break at last space before `innerW`.
- If single word > `innerW` → char-wrap (last resort).
- Contraction counts as one word (`don't` not `don` + `'t`).

### CJK (`cjk`)

- Char wrap. No word boundary in CJK.
- Each CJK char = 2 cells.
- After CJK run, if next char is space + Latin word, attempt word-boundary break at the space.

### Mixed (`mix`)

- Walk graphemes left-to-right.
- At each position, check if breaking here keeps remainder ≤ `innerW`.
- Prefer breaks at: space, Latin word boundary, CJK char boundary (in that order).

## Padding

After wrap, every line of content must be ≤ `innerW` visible cells. Stage 1 verifies and returns `measured[]` for Stage 2 to use.

## Punctuation

### English
Standard ASCII: `, . ! ? ' " : ; -`

### CJK
- `，` `。` `！` `？` `「` `」` `『` `』` `（` `）` `【` `】`
- These chars are fullwidth (2 cells) and follow CJK char-wrap.
- True centering impossible in monospace — left-align, accept it.

## Tail position for speech bubbles (mixed lang)

If bubble content starts with a CJK char, tail = `boxLeft + 2` (just inside the left border).
If content starts with a Latin word, tail = `boxLeft + 2 + visibleWidth(firstLatinWord)`.

For multi-bubble scenes, alternate tail sides for visual flow.

## Kaomoji preservation

Kaomoji are fullwidth CJK. Stage 1 must keep them as single graphemes (do NOT split `(◕‿◕)` into individual chars). `grapheme-splitter` handles this.

## Examples

### EN wrap at `innerW=20`
```
Input:  "the deadline is today and i haven't slept"
Output:
  "the deadline is"
  "today and i"
  "haven't slept"
```

### CJK wrap at `innerW=20`
```
Input:  "完蛋喇今日係死線我無瞓過"
Output (10 cells per CJK char):
  "完蛋喇今日係死線"  (10 cells, 10 CJK)
  "我無瞓過"          (4 cells, 4 CJK)
```

### Mixed wrap at `innerW=20`
```
Input:  "完蛋 deadline moved up"
Output:
  "完蛋 deadline"      (2 + 1 + 1 + 8 = 12 cells)
  "moved up"           (8 cells)
```
