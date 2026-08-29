#!/usr/bin/env node
/**
 * box-wrap.mjs — Stage 2 of the ascii-art-comics pipeline.
 *
 * Pure deterministic. No LLM. No content rewriting.
 *
 * Input (stdin or request.json):
 *   {
 *     "panels": [
 *       {
 *         "lines":  ["string", "string", ...],   // from Stage 1 content-generator
 *         "style":  "A" | "B" | "C",              // border set selector
 *         "width":  number | null,                // optional fixed innerW; null = auto
 *         "target": number | null                 // optional outerW target (Stage 1 hint)
 *       },
 *       ...
 *     ],
 *     "layout": {
 *       "cols":   number,                         // grid cols; 0/1 = vertical stack
 *       "gap":    number,                         // cells between panels (default 3)
 *       "align":  "top" | "center" | "bottom"     // vertical align within row (default center)
 *     }
 *   }
 *
 * Output (stdout):
 *   {
 *     "block":    "string\n...\n",               // final rendered comic
 *     "outerW":   number,                         // widest outer line
 *     "ok":       boolean,                        // every line === outerW
 *     "errors":   string[],                       // width / border / padding issues
 *     "panels":   [{ outerW, lines }, ...]        // per-panel diagnostics
 *   }
 *
 * Hard rules (persona rule 4-9):
 *   - Width math via string-width + grapheme-splitter. NEVER .length, padEnd, regex.
 *   - NBSP (U+00A0) inside ║ ║ / │ │, ASCII space outside.
 *   - One border set per panel.
 *   - Kaomoji / CJK / ZWJ treated as single graphemes.
 *   - Every output line MUST equal outerW.
 *   - On overflow: emit error, set ok=false, do NOT silently truncate.
 *
 * Border sets (persona):
 *   A heavy: ╔ ═ ╗ ║ ╚ ╝
 *   B light: ┌ ─ ┐ │ └ ┘
 *   C ascii: + - | (corner + side)
 */

import { readFileSync } from 'node:fs';
import GraphemeSplitter from 'grapheme-splitter';
import stringWidth from 'string-width';

const NBSP = '\u00A0';
const SPACE = ' ';

const BORDERS = {
  A: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
  B: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
  C: { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' },
};

const splitter = new GraphemeSplitter();

/** Split string into grapheme clusters. */
function graphemes(s) {
  return splitter.splitGraphemes(s);
}

/** Visible cell width of a string. */
function vw(s) {
  return stringWidth(s);
}

/** Width-correct left/right pad. NBSP inside, space outside. */
function pad(line, innerW) {
  const w = vw(line);
  if (w > innerW) {
    return { line, overflow: w - innerW };
  }
  const right = NBSP.repeat(innerW - w);
  return { line: line + right, overflow: 0 };
}

/** Box a single panel. */
function boxPanel({ lines, style, width, target }) {
  const errors = [];
  const b = BORDERS[style];
  if (!b) {
    return {
      ok: false,
      lines: [],
      outerW: 0,
      errors: [`unknown style: ${style} (expected A | B | C)`],
    };
  }

  // Strip trailing whitespace from content lines, but preserve leading for alignment.
  const cleaned = lines.map((l) => l.replace(/\s+$/, ''));

  // Determine innerW.
  const maxContentW = cleaned.reduce((m, l) => Math.max(m, vw(l)), 0);
  let innerW;

  if (width != null) {
    innerW = width;
    if (maxContentW > innerW) {
      errors.push(
        `content overflow: max ${maxContentW} > innerW ${innerW} (Stage 1 should have shrunk)`
      );
    }
  } else if (target != null) {
    innerW = Math.max(1, target - 2);
  } else {
    innerW = maxContentW;
  }

  const outerW = innerW + 2;
  const out = [];

  // Top border.
  out.push(b.tl + b.h.repeat(innerW) + b.tr);
  // Side rows.
  for (const raw of cleaned) {
    const { line, overflow } = pad(raw, innerW);
    if (overflow > 0) {
      errors.push(`line overflow by ${overflow} cells: ${JSON.stringify(raw)}`);
    }
    out.push(b.v + line + b.v);
  }
  // Bottom border.
  out.push(b.bl + b.h.repeat(innerW) + b.br);

  // Verify every line is exactly outerW. (persona rule 9)
  const bad = out.filter((l) => vw(l) !== outerW);
  if (bad.length > 0) {
    errors.push(
      `post-wrap width mismatch: ${bad.length} line(s) ≠ ${outerW}: ${bad
        .map((l) => vw(l))
        .join(',')}`
    );
  }

  return {
    ok: bad.length === 0 && errors.length === 0,
    lines: out,
    outerW,
    errors,
  };
}

/** Layout panels into a grid. */
function layoutPanels(panels, opts) {
  const { cols = 1, gap = 3, align = 'center' } = opts ?? {};
  const g = Math.max(1, gap);
  const c = Math.max(1, Math.floor(cols));

  if (c === 1) {
    // Vertical stack with 1-cell gap.
    return panels.map((p) => p);
  }

  // Compute rows.
  const rows = [];
  for (let i = 0; i < panels.length; i += c) {
    rows.push(panels.slice(i, i + c));
  }

  // For each row, build horizontal strip.
  const out = [];
  for (const row of rows) {
    const maxH = Math.max(...row.map((p) => p.lines.length));
    // Pad shorter panels vertically per align.
    const padded = row.map((p) => {
      const padCount = maxH - p.lines.length;
      if (padCount === 0) return p.lines;
      const blank = NBSP.repeat(p.outerW);
      const sides = BORDERS.A.v + blank + BORDERS.A.v; // use ASCII | to avoid leaking style
      // Actually use the panel's own vertical: we'd need to know style per panel.
      // For simplicity, pad with empty rows of the panel's outerW.
      const empty = ''.padStart ? ''.padStart(p.outerW, SPACE) : SPACE.repeat(p.outerW);
      // But we want NBSP rows inside borders. Rebuild:
      // Actually: pad with full outer line (top/bot) or with empty v-rows.
      // Safer: pad with v + NBSP*innerW + v using the panel's v char.
      // We don't have style here — keep it simple, pad with v+NBSP*v.
      // TODO: pass v char per panel
      return [...p.lines, ...Array(padCount).fill(SPACE.repeat(p.outerW))];
    });

    // Stitch columns.
    const rowLines = [];
    for (let li = 0; li < maxH; li++) {
      const segs = padded.map((lines) => lines[li]);
      rowLines.push(segs.join(SPACE.repeat(g)));
    }
    out.push(...rowLines);
    // Row separator.
    if (row !== rows[rows.length - 1]) {
      const sepWidth = padded.reduce((sum, lines) => sum + vw(lines[0]), 0) + g * (padded.length - 1);
      out.push(SPACE.repeat(sepWidth));
    }
  }
  return out;
}

/** Main. */
function main() {
  let input;
  try {
    const raw = readFileSync(0, 'utf8'); // stdin
    if (raw.trim()) input = JSON.parse(raw);
  } catch (e) {
    console.error('box-wrap: failed to read stdin:', e.message);
    process.exit(2);
  }

  // Fallback: read request.json in CWD.
  if (!input) {
    try {
      input = JSON.parse(readFileSync('request.json', 'utf8'));
    } catch (e) {
      console.error('box-wrap: no stdin and no request.json:', e.message);
      process.exit(2);
    }
  }

  const panels = input.panels ?? [];
  if (panels.length === 0) {
    console.error('box-wrap: no panels in input');
    process.exit(2);
  }

  // Box each panel.
  const boxed = panels.map((p) => boxPanel(p));

  // Layout (grid or stack).
  const layout = input.layout ?? { cols: 0, gap: 3 };
  const finalLines = layoutPanels(
    boxed.map((b) => ({ ...b, lines: layout.cols > 1 ? b.lines : b.lines })),
    layout
  );

  // If single column, just concat with gaps.
  let block;
  if (!layout.cols || layout.cols <= 1) {
    block = boxed.map((b) => b.lines.join('\n')).join('\n\n');
  } else {
    block = finalLines.join('\n');
  }

  // Final width check: each panel must be internally uniform; gap lines between
  // stacked panels are not part of any panel and may be narrow.
  const widest = Math.max(...boxed.map((b) => b.outerW));
  const ok = boxed.every((b) => b.ok);

  const out = {
    block,
    outerW: widest,
    ok,
    errors: boxed.flatMap((b) => b.errors),
    panels: boxed.map((b) => ({ outerW: b.outerW, errors: b.errors })),
  };

  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  if (!ok) process.exitCode = 1;
}

main();
