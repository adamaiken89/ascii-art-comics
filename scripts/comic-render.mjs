#!/usr/bin/env node
/**
 * comic-render.mjs — Compose panels + speech bubbles into one SVG.
 *
 * v2 — clean rect-only edges, bubble space per panel, one chibi per panel.
 *
 * Panel layout per cell:
 *
 *   ┌─ bubble space (height = bubbleHeight) ─┐
 *   │   [bubble 1]                           │
 *   │   [bubble 2]                           │
 *   ├──────────────────────────┬─────────────┤
 *   │                          │  panel      │
 *   │   content lines          │  border     │
 *   │                          │  (rect)     │
 *   │                          │             │
 *   └──────────────────────────┴─────────────┘
 *
 * Each panel:
 *   - bordered by a clean SVG <rect> (no box-drawing chars)
 *   - has optional bubble area above the border
 *   - content is plain <text> monospace, no leading/trailing ║
 *
 * Dialogue bubbles are positioned in the bubble area, with tails pointing
 * down to the panel below.
 *
 * Input:
 *   {
 *     "title": "Monday Morning",
 *     "cell": { "w": 10, "h": 18 },
 *     "panels": [
 *       {
 *         "panelId": 0,
 *         "width": 30,                 // inner width in cells
 *         "lines": ["...", "..."],     // content lines, no borders
 *         "bubbleHeight": 60           // optional, default 0
 *       }
 *     ],
 *     "layout": { "cols": 2, "gap": 12 },
 *     "dialogue": [
 *       {
 *         "panelId": 0,
 *         "x": 10, "y": 10,
 *         "w": 180, "h": 40,
 *         "text": "「hello」",
 *         "tail": { "side": "bottom-left", "size": 12 }
 *       }
 *     ]
 *   }
 *
 * Output: { svg, ok, width, height }
 */

import { readFileSync } from 'node:fs';

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
    `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${r}" ry="${r}" fill="${f}" stroke="${s}" stroke-width="1.5"/>`,
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
    `<text x="${cx}" y="${cy}" font-family="monospace" font-size="${fs}" text-anchor="middle" fill="#222">${escapeXml(b.text)}</text>`
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
  const pad = input.padding ?? 16;
  const gap = input.layout?.gap ?? 12;
  const cols = input.layout?.cols ?? 1;

  // Compute panel dimensions (no borders in content; panel rect added separately)
  const panelDims = panels.map((p) => {
    const lines = (p.lines ?? []).map((l) => l.replace(/\r/g, ''));
    const innerW = p.width;
    const innerH = lines.length;
    const bubbleH = p.bubbleHeight ?? 0;
    const contentW = innerW * cellW;
    const contentH = innerH * cellH;
    return {
      panelId: p.panelId,
      contentW,
      contentH,
      bubbleH,
      totalW: contentW,
      totalH: contentH + bubbleH,
    };
  });

  // Layout: rows × cols
  const positions = [];
  let totalW, totalH;
  if (cols > 1) {
    const rows = [];
    for (let i = 0; i < panelDims.length; i += cols) {
      rows.push(panelDims.slice(i, i + cols));
    }
    let y = pad;
    for (const row of rows) {
      let x = pad;
      const rowH = Math.max(...row.map((p) => p.totalH));
      for (let i = 0; i < row.length; i++) {
        positions.push({ x, y, w: row[i].totalW, h: row[i].totalH, bubbleH: row[i].bubbleH, contentH: row[i].contentH });
        x += row[i].totalW + gap;
      }
      y += rowH + gap;
    }
    totalW = Math.max(
      ...rows.map((row) =>
        row.reduce((s, r, i) => s + r.totalW + (i < row.length - 1 ? gap : 0), 0)
      )
    ) + 2 * pad;
    totalH = y - gap + pad;
  } else {
    let y = pad;
    for (const p of panelDims) {
      positions.push({ x: pad, y, w: p.totalW, h: p.totalH, bubbleH: p.bubbleH, contentH: p.contentH });
      y += p.totalH + gap;
    }
    totalW = Math.max(...panelDims.map((p) => p.totalW)) + 2 * pad;
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
      `<text x="${totalW / 2}" y="${titleH - 4}" font-family="sans-serif" font-size="${cellH * 0.9}" font-weight="bold" text-anchor="middle" fill="#222">${escapeXml(input.title)}</text>`
    );
  }

  // Render each panel: bubble area (above) + content area (with rect border)
  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    const pos = positions[i];
    const yTop = pos.y + titleH;
    const bubbleY = yTop;
    const contentY = yTop + pos.bubbleH;
    const lines = (panel.lines ?? []).map((l) => l.replace(/\r/g, ''));

    // Content: plain text lines, no leading/trailing ║
    for (let li = 0; li < lines.length; li++) {
      out.push(
        `<text x="${pos.x}" y="${contentY + (li + 1) * cellH - 2}" font-family="monospace" font-size="${cellH}" fill="#222">${escapeXml(lines[li])}</text>`
      );
    }

    // Panel rect border (only around the content area, not the bubble space)
    out.push(
      `<rect x="${pos.x}" y="${contentY}" width="${pos.w}" height="${pos.contentH}" fill="#fafafa" stroke="#333" stroke-width="1.5"/>`
    );

    // Optional separator line between bubble area and content
    if (pos.bubbleH > 0) {
      // No separator — bubble area is just empty space
    }
  }

  // Render bubbles (positioned in bubble area of each panel)
  const dialogue = input.dialogue ?? [];
  for (const d of dialogue) {
    const pos = positions[d.panelId];
    if (!pos) continue;
    const yTop = pos.y + titleH;
    const abs = {
      x: pos.x + d.x,
      y: yTop + d.y,
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

  process.stdout.write(JSON.stringify({ svg, ok: true, width: totalW, height: totalH }, null, 2) + '\n');
}

main();
