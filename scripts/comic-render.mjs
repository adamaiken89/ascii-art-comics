#!/usr/bin/env node
/**
 * comic-render.mjs — Compose panels + speech bubbles into one SVG.
 *
 * v3 — auto-sized bubbles, centered content, dynamic tails, strict monospace.
 *
 * Per-panel structure (vertical stack, top → bottom):
 *
 *   ┌─ bubble area (height = bubbleHeight) ─┐
 *   │   [auto-sized speech bubble]         │
 *   ├──────────────────────────────────────┤
 *   │   character art (centered)           │  ← content rect (border)
 *   │                                      │
 *   └──────────────────────────────────────┘
 *
 * Key behaviors:
 *   - Speech bubble dims derived from text (string-width × cellW + padding)
 *   - Bubbles painted AFTER panel rect → bubble always above character
 *   - Tail x = speaker's chibi x position (or panel edge if speaker unspecified)
 *   - Strict monospace stack: Courier New / Consolas / Fira Code / monospace
 *   - Tabular numerals, line-height = font-size (no descender clipping)
 *   - Chibi lines auto-centered: measure each line with string-width, offset
 *   - Bubble text wrapped on width; multi-line bubble if needed
 *   - Dynamic frame: content rect size = max(lineWidth) × cellW
 *
 * Input:
 *   {
 *     "title": "Monday Morning",
 *     "cell": { "w": 10, "h": 18 },
 *     "panels": [
 *       {
 *         "panelId": 0,
 *         "width": 30,                 // inner width in cells (cap on content)
 *         "lines": ["...", "..."],     // content lines, no box-drawing borders
 *         "speaker": { "x": 6, "y": 3 },  // chibi x/y in cell coords
 *         "bubbleHeight": 80
 *       }
 *     ],
 *     "layout": { "cols": 2, "gap": 16 },
 *     "dialogue": [
 *       { "panelId": 0, "text": "「hi」", "padding": 12 }
 *     ]
 *   }
 *
 * Output: { svg, ok, width, height }
 */

import { readFileSync } from 'node:fs';
import GraphemeSplitter from 'grapheme-splitter';
import stringWidth from 'string-width';

const splitter = new GraphemeSplitter();
const vw = (s) => stringWidth(s);

const MONO_STACK =
  "'Courier New', 'Consolas', 'Fira Code', 'DejaVu Sans Mono', monospace";

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Wrap text to fit maxCells, returning array of lines. */
function wrapText(text, maxCells) {
  if (vw(text) <= maxCells) return [text];
  const lines = [];
  const g = splitter.splitGraphemes(text);
  let cur = '';
  let curW = 0;
  for (const ch of g) {
    const w = vw(ch);
    if (curW + w > maxCells && cur) {
      lines.push(cur);
      cur = ch;
      curW = w;
    } else {
      cur += ch;
      curW += w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Compute tail polygon for a bubble.
 *   bubble: { x, y, w, h }
 *   tailAnchor: { x, y } absolute (where the tail points AT, e.g. speaker chibi)
 *   tail: { size, side } side in ['auto', 'top', 'bottom']
 *           auto = choose nearest vertical edge
 */
function tailPoints(bubble, tailAnchor, tail) {
  const { x, y, w, h } = bubble;
  const s = tail.size ?? 14;
  // Pick side: if anchor is above bubble → top, else → bottom
  let side = tail.side;
  if (side === 'auto' || !side) {
    side = tailAnchor.y < y ? 'top' : 'bottom';
  }
  // Clamp anchor x to bubble width range
  const ax = Math.max(x + s / 2, Math.min(x + w - s / 2, tailAnchor.x));
  // Tail base width = s, tip at anchor
  const baseHalf = s * 0.5;
  if (side === 'top') {
    // Triangle: base on top edge, tip pointing up at anchor
    return [
      [ax - baseHalf, y],
      [ax + baseHalf, y],
      [ax, Math.max(y - s, tailAnchor.y + 2)],
    ];
  } else {
    // Bottom: base on bottom edge, tip pointing down at anchor
    return [
      [ax - baseHalf, y + h],
      [ax + baseHalf, y + h],
      [ax, Math.min(y + h + s, tailAnchor.y - 2)],
    ];
  }
}

/**
 * Render a speech bubble.
 *   bubble: { x, y, w, h, text, fontSize, tail, fill, stroke, radius }
 *   tailAnchor: { x, y } absolute (where tail points)
 */
function renderBubble(bubble, tailAnchor) {
  const fs = bubble.fontSize ?? 14;
  const f = bubble.fill ?? '#fffbe6';
  const s = bubble.stroke ?? '#333';
  const r = bubble.radius ?? 8;
  const parts = [];

  parts.push(
    `<rect x="${bubble.x}" y="${bubble.y}" width="${bubble.w}" height="${bubble.h}" ` +
    `rx="${r}" ry="${r}" fill="${f}" stroke="${s}" stroke-width="1.5"/>`
  );

  if (bubble.tail && tailAnchor) {
    const pts = tailPoints(bubble, tailAnchor, bubble.tail);
    if (pts) {
      const ptStr = pts.map((p) => p.join(',')).join(' ');
      parts.push(
        `<polygon points="${ptStr}" fill="${f}" stroke="${s}" ` +
        `stroke-width="1.5" stroke-linejoin="round"/>`
      );
    }
  }

  // Center text
  const cx = bubble.x + bubble.w / 2;
  const cy = bubble.y + bubble.h / 2 + fs / 3;
  parts.push(
    `<text x="${cx}" y="${cy}" font-family="${MONO_STACK}" ` +
    `font-size="${fs}" font-variant-numeric="tabular-nums" ` +
    `text-anchor="middle" fill="#222">${escapeXml(bubble.text)}</text>`
  );

  return parts.join('\n');
}

/**
 * Measure panel content: returns { widthCells, heightCells, lines }.
 * Trims trailing empty lines, computes max line width in cells.
 */
function measureContent(lines) {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end--;
  const trimmed = lines.slice(0, end);
  let maxW = 0;
  for (const l of trimmed) {
    const w = vw(l);
    if (w > maxW) maxW = w;
  }
  return { widthCells: maxW, heightCells: trimmed.length, lines: trimmed };
}

/**
 * Render panel content lines, centered horizontally.
 *   panel: { x, y, contentW, contentH, cellW, cellH }
 *   lines: array of strings (already measured)
 *   maxW: max line width in cells (from measureContent)
 */
function renderContent(panel, lines, maxW) {
  const parts = [];
  const { x, y, cellW, cellH } = panel;
  const innerWpx = maxW * cellW;
  const offsetX = (panel.contentW - innerWpx) / 2; // center
  for (let i = 0; i < lines.length; i++) {
    const lineY = y + (i + 1) * cellH - 2;
    parts.push(
      `<text x="${x + offsetX}" y="${lineY}" font-family="${MONO_STACK}" ` +
      `font-size="${cellH}" font-variant-numeric="tabular-nums" ` +
      `fill="#222">${escapeXml(lines[i])}</text>`
    );
  }
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
  const pad = input.padding ?? 20;
  const gap = input.layout?.gap ?? 16;
  const cols = input.layout?.cols ?? 1;
  const bubblePadX = 14; // text padding inside bubble
  const bubblePadY = 10;
  const bubbleFontSize = 14;
  const bubbleLineH = bubbleFontSize + 4;

  // Pre-measure each panel's content
  const panelInfo = panels.map((p) => {
    const lines = (p.lines ?? []).map((l) => l.replace(/\r/g, ''));
    const measured = measureContent(lines);
    const innerCap = p.width ?? measured.widthCells;
    // Use min(measured, cap) for dynamic frame: don't exceed cap
    const widthCells = Math.max(1, Math.min(measured.widthCells, innerCap));
    const heightCells = measured.heightCells;
    const bubbleH = p.bubbleHeight ?? 0;
    const contentH = heightCells * cellH;
    const contentW = widthCells * cellW;
    return {
      panelId: p.panelId,
      widthCells,
      heightCells,
      contentW,
      contentH,
      bubbleH,
      totalW: contentW,
      totalH: contentH + bubbleH,
      lines: measured.lines,
      maxW: widthCells,
      speaker: p.speaker ?? null, // {x, y} in cell coords
    };
  });

  // Layout
  const positions = [];
  let totalW, totalH;
  if (cols > 1) {
    const rows = [];
    for (let i = 0; i < panelInfo.length; i += cols) {
      rows.push(panelInfo.slice(i, i + cols));
    }
    let y = pad;
    for (const row of rows) {
      let x = pad;
      const rowH = Math.max(...row.map((p) => p.totalH));
      for (let i = 0; i < row.length; i++) {
        positions.push({ x, y, w: row[i].totalW, h: row[i].totalH, bubbleH: row[i].bubbleH });
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
    for (const p of panelInfo) {
      positions.push({ x: pad, y, w: p.totalW, h: p.totalH, bubbleH: p.bubbleH });
      y += p.totalH + gap;
    }
    totalW = Math.max(...panelInfo.map((p) => p.totalW)) + 2 * pad;
    totalH = y - gap + pad;
  }

  const titleH = input.title ? cellH * 1.5 : 0;
  totalH += titleH;

  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" ` +
    `width="${totalW}" height="${totalH}">`,
    `<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="white"/>`,
  ];

  // CSS style block: ensure monospace + tabular-nums for all text
  out.push(
    `<style>text { font-family: ${MONO_STACK}; font-variant-numeric: tabular-nums; }</style>`
  );

  if (input.title) {
    out.push(
      `<text x="${totalW / 2}" y="${titleH - 4}" font-family="sans-serif" ` +
      `font-size="${cellH * 0.9}" font-weight="bold" text-anchor="middle" ` +
      `fill="#222">${escapeXml(input.title)}</text>`
    );
  }

  // ---- Layer 1: panel rects + content (below bubbles) ----
  for (let i = 0; i < panels.length; i++) {
    const info = panelInfo[i];
    const pos = positions[i];
    const yTop = pos.y + titleH;
    const contentY = yTop + pos.bubbleH;

    // Panel rect (content area)
    out.push(
      `<rect x="${pos.x}" y="${contentY}" width="${pos.w}" height="${info.contentH}" ` +
      `fill="#fafafa" stroke="#333" stroke-width="1.5"/>`
    );

    // Content text (centered horizontally)
    const renderArea = { x: pos.x, y: contentY, contentW: pos.w, cellW, cellH };
    out.push(renderContent(renderArea, info.lines, info.maxW));
  }

  // ---- Layer 2: speech bubbles (above content) ----
  // Auto-size bubbles from text, position above their panel, tail at speaker
  const dialogue = input.dialogue ?? [];
  for (let i = 0; i < dialogue.length; i++) {
    const d = dialogue[i];
    const pos = positions[d.panelId];
    const info = panelInfo[d.panelId];
    if (!pos || !info) continue;

    const text = d.text ?? '';
    // Auto-width: text cells + padding, capped to panel width
    const textCells = vw(text);
    const maxBubbleCells = info.widthCells; // cap to panel inner width
    const lines = wrapText(text, maxBubbleCells);
    const maxLineCells = lines.reduce((m, l) => Math.max(m, vw(l)), 0);
    const bubbleW = Math.min(
      maxBubbleCells * cellW,
      (maxLineCells * cellW) + bubblePadX * 2
    );
    const bubbleH = lines.length * bubbleLineH + bubblePadY * 2;

    // Position: top of bubble area, with margin
    const margin = 6;
    const yTop = pos.y + titleH;
    let bx = pos.x + margin;
    if (d.align === 'right') bx = pos.x + pos.w - bubbleW - margin;
    if (d.align === 'center') bx = pos.x + (pos.w - bubbleW) / 2;
    const by = yTop + margin;

    // Tail anchor: speaker position in panel (cell coords → px)
    let tailAnchor = { x: bx + bubbleW / 2, y: yTop + pos.bubbleH }; // default: top of content
    if (info.speaker) {
      const sx = pos.x + info.speaker.x * cellW + cellW / 2;
      const sy = yTop + pos.bubbleH + info.speaker.y * cellH + cellH / 2;
      tailAnchor = { x: sx, y: sy };
    }

    const bubble = {
      x: bx,
      y: by,
      w: bubbleW,
      h: bubbleH,
      text: lines.join('\n'),
      fontSize: bubbleFontSize,
      tail: d.tail ?? { size: 14, side: 'auto' },
      fill: d.fill,
      stroke: d.stroke,
    };
    out.push(renderBubble(bubble, tailAnchor));
  }

  out.push('</svg>');
  const svg = out.join('\n');

  process.stdout.write(JSON.stringify({ svg, ok: true, width: totalW, height: totalH }, null, 2) + '\n');
}

main();
