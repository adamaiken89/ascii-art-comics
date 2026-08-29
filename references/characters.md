# Characters — Face Registry Usage

## Source of truth

Face glyphs live in `assets/faces.json`. This file documents how to use them, not the glyphs themselves.

## Mood → glyph mapping

| Mood | A. Kaomoji | B. Chibi-box | C. ASCII |
|---|---|---|---|
| happy | `(◕‿◕)` | `╭──╮ │◕‿◕│ ╰──╯` | `o_o` |
| sad | `(╥﹏╥)` | `╭──╮ │╥﹏╥│ ╰──╯` | `T_T` |
| panic | `(⊙_⊙)` | `╭──╮ │⊙_⊙│ ╰──╯` | `>_<` |
| angry | `(╬ Ò﹏Ó)` | `╭──╮ │╬_╬│  ╰──╯` | `>_<` |
| smug | `(¬‿¬)` | `╭──╮ │◑‿◑│ ╰──╯` | `^_^` |
| dead | `(×_×)` | `╭──╮ │×_×│  ╰──╯` | `x_x` |
| thinking | `(¬_¬)` | `╭──╮ │◐_◐│ ╰──╯` | `-_-` |
| shocked | `(°□°)` | `╭──╮ │◎_◎│ ╰──╯` | `O_O` |

## Fallback chain

Every face in `faces.json` has:
- `glyph` — primary
- `fallback` — used by Stage 3 if primary renders as tofu
- `ascii` — used if border set is downgraded to ASCII

## Multi-character scenes

For 2+ characters, each panel needs a per-character face. Stage 1 returns `faceGlyph` per panel; if multi-character, returns array. Stage 2 lays them out side-by-side inside content area.

## Custom characters

If user describes a character not in registry, generate a kaomoji by combining eyes + mouth + optional brows from the mood table. Document the new entry in `faces.json` so it can be reused.

## Register new face (when generating)

When Stage 1 invents a new kaomoji, append to `faces.json`:
```json
{
  "mood": "excited",
  "glyph": "\\(★▽★)/",
  "fallback": "^_^",
  "ascii": "*_*"
}
```

Keep kaomoji ≤ 7 graphemes for cell-grid sanity.
