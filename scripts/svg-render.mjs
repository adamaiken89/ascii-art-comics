#!/usr/bin/env node
/**
 * svg-render.mjs — Stage 2 (SVG variant) of the ascii-art-comics pipeline.
 *
 * Renders panel content as SVG. SVG handles CJK width, alignment, and
 * monospace layout via <text> with font-family="monospace" and explicit
 * x/y coordinates. No string-width math needed at render time — the
 * browser/rasterizer handles it.
 *
 * Input (stdin or request.json):
 *   {
 *     "panels": [
 *       {
 *         "panelId": 0,
 *         "style": "A" | "B" | "C",   // border set
 *         "lines": ["line1", "line2", ...],
 *         "width": 30                  // inner width in cells
 *       }
 *     ],
 *     "layout": { "cols": 0 | n, "gap": 3 },
 *     "cell": { "w": 8, "h": 16 },    // pixel size per monospace cell
 *     "padding": 8
 *   }
 *
 * Output (stdout):
 *   { "svg": "<svg>...</svg>", "ok": true, "width": 240, "height": 120 }
 *
 * Border sets (same as box-wrap.mjs):
 *   A heavy: ╔ ═ ╗ ║ ╚ ╝
 *   B light: ┌ ─ ┐ │ └ ┘
 *   C ascii: + - |
 */

import { readFileSync } from 'node:fs';

const BORDERS = {
  A: { tl: '╔', t: '═', tr: '╗', l: '║', r: '║', bl: '╚', b: '═', br: '╝' },
  B: { tl: '┌', t: '─', tr: '┐', l: '│', r: '│', bl: '└', b: '─', br: '┘' },
  C: { tl: '+', t: '-', tr: '+', l: '|', r: '|', bl: '+', b: '-', br: '+' },
};

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Render one panel as a positioned group. Returns the group XML + dimensions. */
function renderPanel(panel, x, y, cellW, cellH) {
  const b = BORDERS[panel.style];
  if (!b) return { xml: '', width: 0, height: 0, error: `unknown style ${panel.style}` };

  const lines = panel.lines.map((l) => l.replace(/\r/g, ''));
  const innerW = panel.width;
  const outerW = innerW + 2;
  const totalLines = lines.length + 2; // top + mid + bottom
  const w = outerW * cellW;
  const h = totalLines * cellH;

  const parts = [`<g transform="translate(${x},${y})">`];

  // Panel background (light)
  parts.push(
    `<rect x="0" y="0" width="${w}" height="${h}" fill="#fafafa" stroke="none"/>`
  );

  // Top border
  parts.push(
    `<text x="0" y="${cellH}" font-family="monospace" font-size="${cellH}" ` +
    `textLength="${innerW * cellW}" lengthAdjust="spacingAndGlyphs">` +
    `${escapeXml(b.tl + b.t.repeat(innerW) + b.tr)}</text>`
  );

  // Mid lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    parts.push(
      `<text x="0" y="${(i + 2) * cellH}" font-family="monospace" font-size="${cellH}">` +
      `${escapeXml(b.l + line + b.r)}</text>`
    );
  }

  // Bottom border
  parts.push(
    `<text x="0" y="${totalLines * cellH}" font-family="monospace" font-size="${cellH}" ` +
    `textLength="${innerW * cellW}" lengthAdjust="spacingAndGlyphs">` +
    `${escapeXml(b.bl + b.b.repeat(innerW) + b.br)}</text>`
  );

  // Panel border (outer rect for visual separation)
  parts.push(
    `<rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#333" stroke-width="1"/>`
  );

  parts.push('</g>');
  return { xml: parts.join('\n'), width: w, height: h };
}

function main() {
  let input;
  try {
    const raw = readFileSync(0, 'utf8');
    if (raw.trim()) input = JSON.parse(raw);
  } catch (e) {
    console.error('svg-render: failed to read stdin:', e.message);
    process.exit(2);
  }
  if (!input) {
    try {
      input = JSON.parse(readFileSync('request.json', 'utf8'));
    } catch (e) {
      console.error('svg-render: no stdin and no request.json:', e.message);
      process.exit(2);
    }
  }

  const panels = input.panels ?? [];
  if (panels.length === 0) {
    console.error('svg-render: no panels in input');
    process.exit(2);
  }

  const cellW = input.cell?.w ?? 8;
  const cellH = input.cell?.h ?? 16;
  const pad = input.padding ?? 8;
  const gap = input.layout?.gap ?? 3;
  const cols = input.layout?.cols ?? 0;

  // Compute layout
  const rendered = panels.map((p) => renderPanel(p, 0, 0, cellW, cellH));
  const ok = rendered.every((r) => !r.error);

  let totalW, totalH;
  if (cols > 1) {
    // Grid: rows of `cols` panels
    const rows = [];
    for (let i = 0; i < rendered.length; i += cols) {
      rows.push(rendered.slice(i, i + cols));
    }
    totalW = rows[0].reduce((s, r) => s + r.width, 0) + gap * (rows[0].length - 1) + 2 * pad;
    totalH = rows.reduce(
      (s, r) => s + Math.max(...r.map((p) => p.height)) + gap,
      0
    ) - gap + 2 * pad;
  } else {
    // Stack
    totalW = Math.max(...rendered.map((r) => r.width)) + 2 * pad;
    totalH = rendered.reduce((s, r) => s + r.height + gap, 0) - gap + 2 * pad;
  }

  // Position panels
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" ` +
    `width="${totalW}" height="${totalH}">`,
    `<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="white"/>`,
  ];

  if (cols > 1) {
    const rows = [];
    for (let i = 0; i < rendered.length; i += cols) {
      rows.push(rendered.slice(i, i + cols));
    }
    let y = pad;
    for (const row of rows) {
      let x = pad;
      const rowH = Math.max(...row.map((p) => p.height));
      for (const panel of row) {
        parts.push(panel.xml.replace(/transform="translate\(0,0\)"/, `transform="translate(${x},${y})"`));
        x += panel.width + gap;
      }
      y += rowH + gap;
    }
  } else {
    let y = pad;
    for (const panel of rendered) {
      parts.push(panel.xml.replace(/transform="translate\(0,0\)"/, `transform="translate(${pad},${y})"`));
      y += panel.height + gap;
    }
  }

  parts.push('</svg>');
  const svg = parts.join('\n');

  process.stdout.write(JSON.stringify({ svg, ok, width: totalW, height: totalH }, null, 2) + '\n');
  if (!ok) process.exitCode = 1;
}

main();
