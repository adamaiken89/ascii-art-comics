#!/usr/bin/env node
/**
 * comic-render.mjs — Compose panels + speech bubbles into one SVG.
 *
 * Renders a multi-panel comic where each panel may have a speech bubble
 * attached. Combines `svg-render.mjs` (panels) and `bubble-render.mjs`
 * (bubbles) output, then merges them into a single <svg>.
 *
 * Input (stdin or request.json):
 *   {
 *     "panels":  [ {panelId, style, width, lines} ],
 *     "layout":  { "cols": 2, "gap": 4 },
 *     "cell":    { "w": 10, "h": 18 },
 *     "padding": 8,
 *     "dialogue":[ {panelId, x, y, w, h, text, tail} ]
 *   }
 *
 * Output (stdout):
 *   { svg: "<svg>...</svg>", ok: true, width, height }
 *
 * Bubble positioning:
 *   x, y, w, h are in SVG units relative to the panel's top-left corner.
 *   For grid layouts, the script translates bubbles into absolute coords
 *   based on panel position in the grid.
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

function renderPanel(panel, cellW, cellH) {
  const b = BORDERS[panel.style];
  if (!b) return { xml: '', width: 0, height: 0, error: `unknown style ${panel.style}` };
  const lines = panel.lines.map((l) => l.replace(/\r/g, ''));
  const innerW = panel.width;
  const outerW = innerW + 2;
  const totalLines = lines.length + 2;
  const w = outerW * cellW;
  const h = totalLines * cellH;
  const parts = [];
  parts.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="#fafafa"/>`);
  parts.push(
    `<text x="0" y="${cellH}" font-family="monospace" font-size="${cellH}" ` +
    `textLength="${innerW * cellW}" lengthAdjust="spacingAndGlyphs">` +
    `${escapeXml(b.tl + b.t.repeat(innerW) + b.tr)}</text>`
  );
  for (let i = 0; i < lines.length; i++) {
    parts.push(
      `<text x="0" y="${(i + 2) * cellH}" font-family="monospace" font-size="${cellH}">` +
      `${escapeXml(b.l + lines[i] + b.r)}</text>`
    );
  }
  parts.push(
    `<text x="0" y="${totalLines * cellH}" font-family="monospace" font-size="${cellH}" ` +
    `textLength="${innerW * cellW}" lengthAdjust="spacingAndGlyphs">` +
    `${escapeXml(b.bl + b.b.repeat(innerW) + b.br)}</text>`
  );
  parts.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#333" stroke-width="1"/>`);
  return { xml: parts.join('\n'), width: w, height: h };
}

function tailPoints(x, y, w, h, tail) {
  const s = tail.size ?? 10;
  switch (tail.side) {
    case 'bottom-left':
      return [[x + w * 0.2, y + h], [x + w * 0.2 + s, y + h], [x + w * 0.15, y + h + s]];
    case 'bottom-right':
      return [[x + w * 0.8, y + h], [x + w * 0.8 - s, y + h], [x + w * 0.85, y + h + s]];
    case 'bottom-center':
      return [[x + w * 0.45, y + h], [x + w * 0.55, y + h], [x + w * 0.5, y + h + s]];
    case 'top-left':
      return [[x + w * 0.2, y], [x + w * 0.2 + s, y], [x + w * 0.15, y - s]];
    case 'top-right':
      return [[x + w * 0.8, y], [x + w * 0.8 - s, y], [x + w * 0.85, y - s]];
    case 'left':
      return [[x, y + h * 0.4], [x, y + h * 0.6], [x - s, y + h * 0.5]];
    case 'right':
      return [[x + w, y + h * 0.4], [x + w, y + h * 0.6], [x + w + s, y + h * 0.5]];
    default:
      return null;
  }
}

function renderBubble(b) {
  const fs = b.fontSize ?? 14;
  const f = b.fill ?? '#fffbe6';
  const s = b.stroke ?? '#333';
  const r = b.radius ?? 8;
  const parts = [
    `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${r}" ry="${r}" ` +
    `fill="${f}" stroke="${s}" stroke-width="1.5"/>`,
  ];
  if (b.tail) {
    const pts = tailPoints(b.x, b.y, b.w, b.h, b.tail);
    if (pts) {
      const ptStr = pts.map((p) => p.join(',')).join(' ');
      parts.push(
        `<polygon points="${ptStr}" fill="${f}" stroke="${s}" stroke-width="1.5" stroke-linejoin="round"/>`
      );
    }
  }
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2 + fs / 3;
  parts.push(
    `<text x="${cx}" y="${cy}" font-family="monospace" font-size="${fs}" ` +
    `text-anchor="middle" fill="#222">${escapeXml(b.text)}</text>`
  );
  return parts.join('\n');
}

function main() {
  let input;
  try {
    const raw = readFileSync(0, 'utf8');
    if (raw.trim()) input = JSON.parse(raw);
  } catch (e) {
    console.error('comic-render: failed to read stdin:', e.message);
    process.exit(2);
  }
  if (!input) {
    try {
      input = JSON.parse(readFileSync('request.json', 'utf8'));
    } catch (e) {
      console.error('comic-render: no stdin and no request.json:', e.message);
      process.exit(2);
    }
  }

  const panels = input.panels ?? [];
  if (panels.length === 0) {
    console.error('comic-render: no panels in input');
    process.exit(2);
  }

  const cellW = input.cell?.w ?? 10;
  const cellH = input.cell?.h ?? 18;
  const pad = input.padding ?? 12;
  const gap = input.layout?.gap ?? 4;
  const cols = input.layout?.cols ?? 1;

  const rendered = panels.map((p) => renderPanel(p, cellW, cellH));
  const ok = rendered.every((r) => !r.error);

  // Compute panel positions
  const positions = [];
  let totalW, totalH;
  if (cols > 1) {
    const rows = [];
    for (let i = 0; i < rendered.length; i += cols) {
      rows.push(rendered.slice(i, i + cols));
    }
    let y = pad;
    for (const row of rows) {
      let x = pad;
      const rowH = Math.max(...row.map((p) => p.height));
      for (let i = 0; i < row.length; i++) {
        positions.push({ x, y, w: row[i].width, h: row[i].height });
        x += row[i].width + gap;
      }
      y += rowH + gap;
    }
    totalW = Math.max(
      ...rows.map((row) =>
        row.reduce((s, r, i) => s + r.width + (i < row.length - 1 ? gap : 0), 0)
      )
    ) + 2 * pad;
    totalH = y - gap + pad;
  } else {
    let y = pad;
    for (const p of rendered) {
      positions.push({ x: pad, y, w: p.width, h: p.height });
      y += p.height + gap;
    }
    totalW = Math.max(...rendered.map((r) => r.width)) + 2 * pad;
    totalH = y - gap + pad;
  }

  // Title space
  const titleH = input.title ? cellH * 1.5 : 0;
  totalH += titleH;

  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">`,
    `<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="white"/>`,
  ];

  if (input.title) {
    out.push(
      `<text x="${totalW / 2}" y="${titleH}" font-family="sans-serif" font-size="${cellH * 0.9}" ` +
      `font-weight="bold" text-anchor="middle" fill="#222">${escapeXml(input.title)}</text>`
    );
  }

  // Render panels at positions
  for (let i = 0; i < rendered.length; i++) {
    const pos = positions[i];
    const group = rendered[i].xml;
    // Move all x="0" y="..." in panel to pos.x + 0, pos.y + ...
    out.push(`<g transform="translate(${pos.x},${pos.y + titleH})">`);
    out.push(group);
    out.push('</g>');
  }

  // Render bubbles, translating to absolute coords
  const dialogue = input.dialogue ?? [];
  for (const d of dialogue) {
    const pos = positions[d.panelId];
    if (!pos) continue;
    const abs = {
      x: pos.x + d.x,
      y: pos.y + titleH + d.y,
      w: d.w,
      h: d.h,
      text: d.text,
      tail: d.tail,
      fontSize: d.fontSize,
    };
    out.push(renderBubble(abs));
  }

  out.push('</svg>');
  const svg = out.join('\n');

  process.stdout.write(JSON.stringify({ svg, ok, width: totalW, height: totalH }, null, 2) + '\n');
  if (!ok) process.exitCode = 1;
}

main();
