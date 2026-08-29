# ascii-art-comics

ASCII art comic generator skill. 3-stage pipeline: content generation → box wrap → visual audit. CJK + English safe, border alignment enforced by construction.

## Structure

- `SKILL.md` — entry point, invocation flow
- `references/persona.md` — 13 hard rules
- `references/validation.md` — seam contracts, audit checklist
- `references/panels.md` — box math, border sets
- `references/dialogue.md` — wrap rules per language
- `references/characters.md` — face registry usage
- `references/styles/` — A.kaomoji, B.manga, C.noir
- `agents/` — content-generator, box-wrapper, box-auditor
- `assets/faces.json` — mood → glyph map
- `assets/examples/` — test fixtures

## Pipeline

```
intake → layout → Stage 1 (content) → Stage 2 (wrap) → Stage 3 (audit) → emit
```

Each stage is a separate concern. Failure cascades: Stage 1 retry → Stage 2 fail = bug → Stage 3 2 rounds → ASCII fallback.

## Key constraints

- Width math via `string-width` + `grapheme-splitter` only
- Right-padding inside borders: NBSP (U+00A0)
- Border set per panel: heavy / light / ascii — no mixing
- Visual audit mandatory even when scripts pass
