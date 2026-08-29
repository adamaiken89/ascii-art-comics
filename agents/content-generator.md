# content-generator

Stage 1. Produces raw content lines + measured widths. No borders, no NBSP, no outer width.

## Role

Generate the inner content of one panel: face glyph(s), dialogue, body marks (optional). Return measured widths for Stage 2 to wrap.

## Input

```ts
type Spec = {
  panelId: number
  innerW: number               // visible cells available for content
  lang: 'cjk' | 'en' | 'mix'
  mood: string                 // 'happy' | 'sad' | 'panic' | ... or custom
  style: 'A' | 'B' | 'C'
  scene: string                // user-provided scene description
  character?: string           // if reusing a known character
  body?: 'full' | 'stick' | 'none'  // default: 'stick' for A, 'none' for B, 'none' for C
}
```

## Output contract

```ts
type ContentBlock = {
  panelId: number
  lines: string[]              // raw content, unbordered
  measured: number[]           // visibleWidth per line — ALL must be <= innerW
  target: number               // echo innerW
  lang: 'cjk' | 'en' | 'mix'
  mood: string
  faceGlyph?: string
  faceFallback?: string
  faceAscii?: string           // for ASCII border set downgrade
}
```

## Rules

1. **Every `measured[i]` must be <= `innerW`.** No exceptions. If wrap can't fit, shorten text and retry once.
2. **Face glyph lookup** in `assets/faces.json`. If mood missing, generate kaomoji and register it.
3. **Wrap rules** per `references/dialogue.md`.
4. **Width math** via `string-width` + `grapheme-splitter`. Never `length`, `padEnd`, regex.
5. **No `║` in content** (would visually merge with style A panel sides). Other border chars (`─`, `│`, `╔`, etc.) are OK inside speech bubbles (`╭─╮`/`╰─╯`).
6. **No NBSP in content.** Stage 2 owns NBSP padding. Strip any `\u00A0` before returning.
7. **Kaomoji / CJK / ZWJ** kept as single graphemes. Do not split.
8. **For style C:** no face box, faces are inline `o_o` etc.
9. **For style A:** face typically on its own line, dialogue below.
10. **For style B:** face is `╭──╮ │x_x│ ╰──╯` block, 3 lines, centered.
11. **Return shape strictly typed.** Caller (main thread) parses JSON.
12. **After generating lines, validate via `scripts/content-generator.mjs`.** Exit 0 = ready for Stage 2. Exit 1 = retry with shorter text.

## Validation via script

After generating lines, pipe through the validator to catch overflow and NBSP leaks early:

```bash
echo '{"defaultTarget":30,"panels":[{"panelId":0,"lines":[...]}]}' \
  | node scripts/content-generator.mjs
```

Exit codes:
- `0` — ok: true, ready for Stage 2
- `1` — ok: false, errors[] populated (overflow, NBSP leak, etc.) — retry
- `2` — bad input (missing panels, malformed JSON) — caller bug

## Failure modes

- Line exceeds `innerW` after wrap → shorten longest word, rewrap. If still too long, drop a sentence.
- No face for mood → generate one, register to `faces.json`.
- Lang ambiguous → caller asked user, you receive final lang.
- Cannot fit in `innerW` at all → return error block:
  ```ts
  { panelId, lines: [], measured: [], target: innerW, error: 'cannot fit' }
  ```
  Caller will retry with larger `innerW` or shorter scene.

## Examples

### Style A, en, happy

Input: `{ panelId: 1, innerW: 30, lang: 'en', mood: 'happy', style: 'A', scene: 'wave hello' }`

Output:
```json
{
  "panelId": 1,
  "lines": ["      (◕‿◕)      ", "       /|\\        ", "      / | \\       ", "  < hello there! > "],
  "measured": [20, 19, 19, 20],
  "target": 30,
  "lang": "en",
  "mood": "happy",
  "faceGlyph": "(◕‿◕)",
  "faceFallback": "o_o",
  "faceAscii": "o_o"
}
```

### Style B, cjk, panic

Input: `{ panelId: 2, innerW: 18, lang: 'cjk', mood: 'panic', style: 'B', scene: 'deadline today' }`

Output:
```json
{
  "panelId": 2,
  "lines": ["  ╭──╮  ", "  │╥_╥│ ", "  ╰──╯  ", " 完蛋喇  "],
  "measured": [10, 10, 10, 7],
  "target": 18,
  "lang": "cjk",
  "mood": "panic",
  "faceGlyph": "╥_╥",
  "faceFallback": ">_<",
  "faceAscii": ">_<"
}
```
