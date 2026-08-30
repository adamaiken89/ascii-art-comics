# Vocabulary sources — the building reference

The component vocabulary (faces, fx, props) is **grounded in external references, not
invented**. This file records the sources, the canonical forms they establish, and the
audit status of everything in `assets/ascii-library.json` and `CHIBI_FACE` in
`scripts/compose.ts`. When adding or changing a glyph, cite the source here first.

## Sources

| Source | What it grounds |
|---|---|
| [Wikipedia — Kaomoji](https://en.wikipedia.org/wiki/Kaomoji) | History + character-class conventions: `;` = sweat drop (`(-_-;)` = nervous), `///` = blushing, `T` = tears, eyes-over-mouth emphasis, `(^_^)` (ASCII NET, 1986) as the founding form |
| [japaneseemoticons.me](https://japaneseemoticons.me/) | Category taxonomy (happy/sad/angry/…); confirms tears drawn with `T` or `;` |
| [kaomojiya-collection](https://github.com/kaomojiya-collection/kaomoji-collection) (MIT) | 41.6k modern kaomoji per category — almost entirely Unicode; validates upright forms like `(^3^)/Chu!!` for love |
| [ekohrt/emoticon_kaomoji_dataset](https://github.com/ekohrt/emoticon_kaomoji_dataset) (62k, tagged) | Frequency-ranked **pure-ASCII** faces per mood — the primary canon for our chibi faces |
| [asciiart.eu](https://www.asciiart.eu/) | Small prop drawings; e.g. the canonical 3-row cat `/\_/\ ( o.o ) > ^ <` (which our `prop/cat` reproduces verbatim) |
| [Wikipedia — Box-drawing characters](https://en.wikipedia.org/wiki/Box-drawing_character) | Border/bubble glyph sets (`╭─╮│╰╯`, `┏━┓┃┗┛`, `┄ ┆`) |

## Harness prior art (tools evaluated 2026-08)

| Tool | Status | Lesson for this repo |
|---|---|---|
| "PyKaomoji" | doesn't exist; nearest live: [`kaomoji` PyPI](https://pypi.org/project/kaomoji/) (MIT, procedural kaomoji from eyes/arms parts by emotion) | Procedural generation from parts is exactly what `chibiLines` does — architecture validated, no dependency adopted (PyPI data is Unicode-heavy, fails the safe-glyph rule) |
| Heiswayi/kaomoji (categorized txt: joy/shocked/flip) | **defunct** — GitHub page + API 404 (verified 2026-08) | Superseded by kaomojiya + ekohrt datasets above |
| [Textik](https://textik.com/) | live, manual web canvas | Design-time hand-tuning only; nothing to integrate |
| **Cowsay / Fortune** | live, classic | **Architectural blueprint**: template character files (`.cow` ≈ `ascii-library.json`), auto-sized speech bubbles (≈ bubble module), pipeable CLI + random-text composition (≈ random generator). `scripts/random-comic.ts` follows this pattern |

## The safe-glyph rule

Vocabulary glyphs must either be **pure ASCII** or, exceptionally, a box-drawing /
kaomoji-canonical character **verified present in the bundled font**
(`assets/fonts/JetBrainsMono-Regular.ttf` — checked via cmap at raster time, see
`raster-cells.py`). Geometric/typographic Unicode that merely *resembles* a feature
(◕ ╥ ⊙ ◎ ◑ ◡) is banned — it was the original "random symbols" failure.

## Chibi faces — canonical forms (data-ranked)

From the ekohrt 62k dataset (pure-ASCII, frequency-ranked) + kaomojiya + Wikipedia:

| Mood | Face | Canon evidence |
|---|---|---|
| happy | `^_^` | core of `=^_^=`, `#^_^#` (dataset blush/happy); Wikipedia founding form |
| sad | `T_T` | `T` = tears (Wikipedia, japaneseemoticons); `QQ` variant in dataset |
| panic | `O_O` | `:O`/`=0` surprise canon, upright form |
| angry | `>#<` | scrunched-eye anger, `>_` family |
| smug | `¬_¬` | classic side-eye (long-standing emoticon canon) |
| dead | `x_x` | **verbatim** in dataset (`x_x`, `X_X`); Wikipedia stress `(x_x)` |
| thinking | `-_-` | **verbatim** in dataset (sleeping/dismissal) |
| shocked | `0_0` | wide-eye surprise variant |
| neutral | `._.` | flat-affect minimal face |
| excited | `*_*` | star-struck eyes (classic) |
| confused | `?_?` | **verbatim** in dataset (confused) |
| sleepy | `-.-` | closed-eye variant of `-_-` |
| love | `^3^` | kaomojiya love: `(^3^)/Chu!!` |
| dizzy | `@_@` | classic daze |
| proud | `^o^` | open-mouth joy (kaomoji `(^o^)`) |
| embarrassed | `^///^` | `///` = blush (Wikipedia); dataset `://)` family |
| suspicious | `<_<` | classic side-glance |

Direction (`left`/`right`) never changes glyphs — it shifts the symmetric face inside
the box (`faceOffset` in `compose.ts`, tested).

## FX conventions

| FX | Glyph | Canon |
|---|---|---|
| sweat | `;;` | `;` = sweat drop (Wikipedia `(-_-;)`, dataset `^^;`, `-_-;`) |
| sleep | `z Z` | `zzz` suffix canon (dataset `(-_-)zzz`) |
| anger | 3-row vein `\ /` `#` `/ \` | manga vein-cross drawn literally |
| emphasis / puzzlement | `!!` / `??` | plain punctuation, legible only **at head height, touching the head** |
| love / note | `♥` / `♪` | CJK-fallback glyphs (cmap-verified) |

**Placement rule:** fx sits at head height, touching the head box (one row above or one
column beside). A floating fx reads as random noise — this was user-confirmed failure
mode; see the `!!` / `;` review.

## Props

- Authored as 2–4-row small drawings in `assets/ascii-library.json`, uniform cell width
  per row, composed/validated by the harness.
- Canonical-form check against asciiart.eu smallest sizes: `prop/cat` is the archive's
  canonical 3-row cat verbatim. `prop/laptop` is screen + keyboard deck
  (`.---. / |:::| /====\`), not an anonymous box.
- Boxes/containers use box-drawing sets; organic shapes use `/\_(`-style ASCII strokes.

## Adding vocabulary

1. Find the canonical form in the sources above (or a better archive) — cite it in this file.
2. Verify every glyph is pure ASCII **or** in the bundled font / CJK fallback
   (the rasterizer warns `glyph_missing`).
3. Add to `CHIBI_FACE` (faces) or `ascii-library.json` (props/fx/scenes); run `npm test`.
