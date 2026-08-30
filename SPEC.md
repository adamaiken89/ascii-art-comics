# SPEC — ascii-art-comics v1

> **STATUS: SUPERSEDED (2026-08).** The v1 3-stage LLM-draws-ASCII pipeline described here
> was replaced by the ASCII-intermediate pipeline: LLM emits semantic JSON, the deterministic
> composer (`scripts/compose.ts`) draws the cell grid, and output is rasterized PNG/JPEG
> (`scripts/render-ascii-comic.py`). See README.md and SKILL.md. Kept for history.


## Scope (locked)

v1 = minimal 4-panel equal 2x2 kaomoji comic. No props, no FX, no gaze, no hands.

**In:**
- 4 panels, equal 2x2 grid
- Style A (kaomoji)
- Pure ASCII + box-drawing (no emoji)
- Top zone = visual (face + body marks)
- Bottom zone = dialogue (hybrid: speaker tag + text)
- Heavy border set (default) with ASCII fallback
- Single narrator OR 2 characters max per panel
- Free-form text input

**Out (deferred to v2+):**
- Gaze direction
- Hand gestures
- FX glyphs (sweat, anger marks, sparkles)
- Multi-shape templates (top-wide, left-tall, T-shape)
- Custom ratios
- Lazy registry expansion
- Backgrounds
- Props/environment

## Input

Free-form text. Parser extracts:
- `characters`: list of character names (default: ["Alice", "Bob"])
- `mood_per_panel`: array of 4 moods (default: derived from prompt)
- `dialogue_per_panel`: array of 4 (speaker, text) tuples
- `lang`: auto-detect CJK/EN/mix

**Defaults if user provides nothing:**
- 2 characters: Alice, Bob
- Moods: happy, thinking, shocked, happy (coda)
- Dialogue: 1 line per panel
- Lang: auto

## Output

Plain ```` ``` ```` code fence (no lang tag). 4 panels in 2x2 grid, separated by single-space gutter horizontally, blank-line gutter vertically.

**Footer (if issues):** Below code fence, on its own line, list issues with prefix `[!]`.

## Grid math

```
panelW = user-declared (default 24)
panelH = user-declared (default 12)
gutter_col = 1 space
gutter_row = 1 blank line

gridW = 2 * panelW + 1 * gutter_col        = 2*24 + 1 = 49
gridH = 2 * panelH + 1 * gutter_row        = 2*12 + 1 = 25
```

## Per-panel zone math

```
innerW = panelW - 2  (border)
innerH = panelH - 2  (border)

visual_zone_rows = 7  (top portion)
dialogue_zone_rows = innerH - visual_zone_rows - 1  (separator)
```

Visual zone = face + body. Dialogue zone = tag + text lines.

## Panel structure (inside border)

```
╔══════════════════╗
║                  ║  <- visual row 0
║     (◕‿◕)        ║  <- face line
║                  ║
║                  ║
║                  ║
║                  ║
║                  ║
║                  ║  <- separator (─ row)
║  Alice: hi!      ║  <- tag + text
║                  ║
║                  ║
╚══════════════════╝
```

## Face registry

Pre-built set of 8 moods. Stored in `assets/faces.json`. LLM picks by name, never invents.

| Mood | Glyph | Fallback | Use |
|---|---|---|---|
| happy | `(◕‿◕)` | `o_o` | default positive |
| sad | `(╥﹏╥)` | `T_T` | crying |
| angry | `(╬ Ò﹏Ó)` | `>_<` | rage |
| shocked | `(°□°)` | `O_O` | surprise |
| thinking | `(¬_¬)` | `-_-` | pondering |
| smug | `(¬‿¬)` | `^_^` | pleased |
| dead | `(×_×)` | `x_x` | defeated |
| neutral | `(•_•)` | `-_-` | resting |

## Pipeline

```
intake (parse prompt) → Stage 1 (face + dialogue) → Stage 2 (wrap) → Stage 3 (audit) → emit
```

### Stage 1: content (LLM)

Input: `{ panelId, innerW, mood, speaker, dialogue, lang }`
Output: `{ lines: [...], measured: [...], target, lang, mood, faceGlyph, faceFallback }`

LLM responsibility:
- Pick face from registry
- Generate visual content lines (face, body marks, spacing)
- Wrap dialogue to fit `innerW`
- Measure every line

### Stage 2: wrap (code, no LLM)

Pure mechanical. Add borders, NBSP-pad to `outerW`. Verify.

### Stage 3: audit (code + LLM)

Code checks: borders, alignment, no tofu, no forbidden chars.
LLM check: visual coherence, mood matches face, dialogue makes sense.

### Failure handling

| Failure | Action |
|---|---|
| Stage 1: line > innerW | retry with shorter text (max 1) |
| Stage 2: invariant fail | bug, retry Stage 1 |
| Stage 3: code check fail | downgrade to ASCII border, emit |
| Stage 3: LLM check fail | emit + add issue to footer |
| Total > 5 retries | emit partial comic + error |

## Constraints (hard)

1. **Width = visible cells, not chars.** Use `wcwidth` for CJK, len for ASCII.
2. **NBSP (U+00A0)** for right-padding inside `║ ║`.
3. **Pure ASCII + box-drawing only.** No emoji. No Unicode outside U+0020-U+007E and box-drawing range.
4. **One border set per panel.** No mixing.
5. **No trailing whitespace** outside borders.
6. **Plain ```` ``` ```` fence**, no language tag.

## Versioning

- v1.x = bugfix, no scope change
- v2 = add gaze/hand/FX
- v3 = multi-template

## File map

```
ascii-art-comics/
├── SKILL.md                    # entry point
├── SPEC.md                     # this file
├── assets/
│   ├── faces.json              # face registry (8 moods)
│   ├── templates.json          # grid templates (1: equal 2x2)
│   └── examples/
│       └── blank4panel.md      # worked example
├── references/
│   ├── grid.md                 # panel/grid math
│   ├── dialogue.md             # wrap rules
│   └── validation.md           # pass/fail criteria
├── agents/
│   └── renderer.md             # agent spec
└── scripts/
    ├── render.py               # Stage 2 (no LLM)
    ├── validate.py             # Stage 3 (no LLM)
    └── harness.py              # orchestrator
```

## Opencode integration

- Slash command: `/comic <prompt>`
- Auto-trigger: natural language ("make a comic about X")
- Harness script: `python3 scripts/harness.py "<prompt>"`
- Output: rendered comic to stdout, issues to stderr
