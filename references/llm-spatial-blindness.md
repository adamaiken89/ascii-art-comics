# LLM Spatial Blindness — Why SVG Beats ASCII for Comic Generation

## The problem

LLMs cannot reliably interpret 2D ASCII art alignment. Empirically:
- **Production**: LLM-generated ASCII art has 30-50% misaligned lines on first pass.
- **Modification**: editing existing ASCII art (e.g. "widen this panel") breaks alignment in 60%+ of attempts.
- **Interpretation**: LLM-as-auditor cannot reliably detect misalignment in rendered output.

## Why

Three structural reasons (per Han, 2025):

1. **Tokenization breaks spatial relationships.** A line like `║  (◕‿◕)             ║` is one token chunk. The LLM sees the line as a sequence of sub-tokens but loses the 2D structure across lines. Tokenizer merges nearby lines into the same chunk, attention can't recover column position.

2. **Self-attention is sequential.** Spatial features (corner alignment, vertical columns) need position-aware attention. Standard self-attention treats all positions as a bag, with no built-in grid structure. Corners that should be related get uniform attention weights `[0.2, 0.2, 0.2, 0.2, 0.2]` — no clear pattern emerges.

3. **Spatial benchmarks fail.** VITC benchmark (8424 single chars + 8000 sequences): GPT-4 = 25% on single char, 3% on sequences. Fine-tuning on VITC improves to 71% but doesn't generalize.

## Implication for this skill

**The "Stage 3 visual auditor" subagent was a mistake.** We planned it as a deterministic-feeling LLM pass that "looks at" the rendered output and patches misalignment. In practice, the LLM cannot see misalignment better than it produced it. The auditor is guessing.

This was caught during testing: the auditor suggested "fixes" that introduced new misalignments. Recovery cascade (downgrade to ASCII borders after 2 rounds) was an admission of failure.

## The fix: SVG

SVG output solves this by moving alignment to the **rasterizer**, not the LLM:

```svg
<text x="40" y="32" textLength="280" lengthAdjust="spacingAndGlyphs">Hello</text>
```

- `textLength` declares the target width in pixels.
- `lengthAdjust="spacingAndGlyphs"` tells the rasterizer to stretch/compress glyphs to fit.
- Result: the text **always** fits exactly 280px wide, regardless of font metrics, CJK widths, or emoji variation.
- No string-width math in our code. No NBSP tricks. No `string-width` library.

The same approach scales to panels: each `<text>` element has explicit `x`, `y`, `textLength`, and `lengthAdjust`. Borders are `<rect>` or `<line>` elements with explicit coordinates. The rasterizer handles all alignment.

## What we kept from ASCII

- **Content generation** (Stage 1) is the same: lines + widths.
- **Component library** (faces, bodies, props) is the same: pre-built ASCII art pieces.
- **Border sets** (A/B/C) are the same: heavy/light/ASCII.
- **Language handling** (CJK/EN/mix) is the same.

The LLM's job: generate content + pick components. **NOT** render.

The renderer's job (deterministic script): place content in cells. No interpretation.

## When to use ASCII output

Despite SVG's advantages, ASCII output is still useful when:
- User wants to paste into markdown / terminal
- User explicitly asks for "plain text" or "ASCII art"
- Output needs to be diff-friendly (ASCII diffs well; SVG diffs badly)

For these cases, we keep the ASCII pipeline (`scripts/box-wrap.mjs`) with the same content from Stage 1. Just don't add an LLM auditor.

## Tradeoffs accepted

By going SVG-first, we lose:
- Terminal-renderable property (need a viewer)
- "ASCII art" identity as plain text
- Easy copy-paste into plain text contexts

We gain:
- Perfect alignment, always
- No LLM in render path
- No spatial blindness failure mode
- Scalable (zoom without losing fidelity)
- Easier to add colors, fonts, effects later

## References

- Han, J. (2025). "Why LLMs Suck at ASCII Art." Medium.
- Jiang et al. (2024). "ArtPrompt: ASCII Art-based Jailbreak Attacks against Aligned LLMs." ACL.
- VITC benchmark: visual instruction tuning with characters.
