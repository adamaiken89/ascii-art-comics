## Plan: Harness foundation — reference audit + fortune-style random-comic generator

**Research conclusions (already verified):**
- **PyKaomoji** doesn't exist; nearest live equivalent is [`kaomoji` PyPI](https://pypi.org/project/kaomoji/) (MIT, procedural generation from eyes/arms parts by emotion) — which validates our existing `chibiLines` architecture; no dependency needed.
- **Heiswayi/kaomoji** is defunct (GitHub page + API 404; user search empty). Superseded by kaomojiya (MIT JSON) + ekohrt 62k, already integrated.
- **Textik** — manual web canvas; design-time reference only.
- **Cowsay/Fortune** — the real prior art for the harness: template character files (= our `ascii-library`), auto-sized speech bubbles (= our bubble module), and random-text composition (= the feature we lack).

### Part 1 — Foundation doc update (`references/vocabulary-sources.md`)

New "Harness prior art" section recording the above (dead refs corrected so nobody chases them again; Cowsay/Fortune documented as the architectural blueprint; PyPI `kaomoji` noted as procedural-generation prior art).

### Part 2 — Random-comic generator (Bun/TypeScript)

**New `assets/lines/*.json`** — interchangeable line banks per story structure, keyed by beat:
- `daily4.json`: `ki`/`sho`/`ten`/`ketsu` arrays; each entry = `{ text, style, mood }` (e.g. ki: thought "…five more minutes…"/sleepy, "Morning already?"/shocked; ten: everyday-twist lines; ketsu: harmonizing punchlines). ~5–8 lines per beat so combinations stay fresh.
- `manzai.json`: `boke1`/`tsukkomi1`/`boke2`/`tsukkomi2` beat arrays (absurd → disbelief → escalation → shout retort), each entry carrying the role's mood.
- Also a small name pool (`Bo`, `Mo`, `Ai`, `Jo`, …) and a mood→fx mapping (panic→fx/em, sad→fx/sweat, dizzy→fx/q, love→fx/heart, angry→fx/anger, sleepy→fx/zzz).

**New `scripts/random-comic.ts`** (Bun, seeded so output is reproducible):
1. `--structure daily4|manzai|random` (default random), `--seed N`, `-o out/prefix`.
2. Picks the story template's beat order → samples one line per beat → picks two names + moods from the lines' mood hints → picks scene presets from a per-structure suggestion list → emits the semantic content JSON (4 panels, ground, two-shot cast with correct facing rules, fx at head height, per-dialogue `label` + `speaker` refs).
3. Invokes the existing pipeline (`python3 scripts/render-ascii-comic.py content.json -o …`) — validation, repair loop, and rasterization are reused unchanged; the generator only ever produces *input*.
4. Prints the same `{ok, issues, files}` summary the pipeline emits.
- `mulberry32` seeded RNG for deterministic output (same seed → byte-identical comic).

### Part 3 — Tests + docs

- `test.sh`: new section — generate with a fixed seed twice, assert both runs produce identical `.txt` (determinism) and `ok: true`.
- README: short "Random comic generator" section (`bun scripts/random-comic.ts --seed 7 -o out/lucky`).
- SKILL.md: pointer to the generator + line banks.

**No changes to `compose.ts` / `validate-grid.py` / `raster-cells.py`** — the generator is a pure producer of validated input, exactly the Cowsay+Fortune pattern.

Out of scope: PyPI harvesting pipeline (PyPI kaomoji data is Unicode-heavy and fails the safe-glyph rule); any pipeline-internal changes.