---
name: ascii-art-comics
description: Generate ASCII art comics with monospace panels, dialogue bubbles, and CJK-safe alignment. Use when the user wants an ASCII comic, a text-based comic strip, kaomoji panel art, or asks to "draw a comic" / "make a comic about X" / "comic in ASCII". Triggers on requests involving comic panels, speech bubbles, character expressions, or sequential art rendered in plain text.
---

ASCII art comic generator. Three-stage pipeline with hard seam: content → box wrap → visual audit. CJK + English safe. Border alignment cannot break by construction.

## When to use

User asks for an ASCII comic, text comic, kaomoji comic, or any "draw X as a comic" request where monospace output is acceptable.

## Invocation flow

1. **Intake** — clarify if ambiguous:
   - style (A kaomoji / B manga / C noir; default A)
   - language (CJK / EN / mixed; auto-detect if unambiguous, else ask)
   - panel count and rough scene
2. **Layout** — compute per-panel `innerW` (visible cells of content area)
3. **Stage 1** → call `content-generator` subagent per panel
4. **Stage 2** → call `box-wrapper` subagent per panel
5. **Stage 3** → call `box-auditor` subagent per panel (visual check + manual fix)
6. **Grid assembly** — place panels with gutters
7. **Hardened emit** — plain code fence, NBSP preserved, no syntax highlight

## Pipeline seam

```
Stage 1                Stage 2                Stage 3
content-generator  →   box-wrapper        →   box-auditor
{lines, measured}      {block, outerW}        visual + manual fix
numbers only           numbers + borders      eye + hand-edit
```

Each stage is a pure subagent. No shared mutable state. See `references/validation.md` for the typed contracts.

## Recovery cascade

| Failure | Action |
|---|---|
| Stage 1: line wider than target | retry once with shrunken text |
| Stage 2: !ok | bug — retry Stage 1 |
| Stage 3: 1 issue | auditor fixes by hand |
| Stage 3: still broken after 2 rounds | downgrade to ASCII borders, emit with `⚠` |
| Grid: panels misaligned | recompute gutters, re-run Stage 2/3 |

## Output contract

- Plain ```` ``` ```` fence (no `text` lang tag)
- NBSP (U+00A0) inside `║ ║` for right-padding
- ASCII space outside borders
- One border set per panel; no mixing
- No trailing whitespace outside borders
- If `⚠` present, precedes the comic on its own line

## Pointer map

- Persona + 13 hard rules → `references/persona.md`
- Width math, NBSP, forbidden ops → `references/persona.md` § Width
- Border sets, gutter math → `references/panels.md`
- Seam contracts, audit checklist → `references/validation.md`
- Wrap rules per language → `references/dialogue.md`
- Face registry → `assets/faces.json`
- Subagent specs → `agents/`
- Style guides → `references/styles/`
