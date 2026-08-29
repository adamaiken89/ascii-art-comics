#!/usr/bin/env node
/**
 * comic-render.mjs — Compose panels + speech bubbles into one SVG.
 *
 * v4 — supports both text lines and SVG component primitives per panel.
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
 *   - Content is an array of items: { type: "text" } or { type: "component" }
 *   - Components are embedded as inline SVG (no font, no text rendering)
 *
 * Input:
 *   {
 *     "title": "Monday Morning",
 *     "cell": { "w": 10, "h": 18 },
 *     "panels": [
 *       {
 *         "panelId": 0,
 *         "width": 30,                 // inner width in cells (cap on content)
 *         "content": [                  // array of items (text or component)
 *           { "type": "text", "text": "Alice" },
 *           { "type": "component", "id": "chibi-happy-center", "x": 2, "y": 1, "scale": 18 }
 *         ],
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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import GraphemeSplitter from 'grapheme-splitter';
import stringWidth from 'string-width';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

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

/** Wrap text to fit maxCells, returning array of lines.
 *  Breaks on word boundaries; only falls back to grapheme splitting if a
 *  single grapheme cluster exceeds maxCells.
 */
function wrapText(text, maxCells) {
  if (vw(text) <= maxCells) return [text];
  const lines = [];
  const words = text.split(/(\s+)/); // keep separators
  let cur = '';
  let curW = 0;
  const pushCur = () => {
    if (cur) lines.push(cur);
    cur = '';
    curW = 0;
  };
  for (const word of words) {
    const wW = vw(word);
    if (wW > maxCells) {
      // Word itself too long: push current, then grapheme-split this word
      pushCur();
      let gline = '';
      let gW = 0;
      for (const g of splitter.splitGraphemes(word)) {
        const gwc = vw(g);
        if (gW + gwc > maxCells && gline) {
          lines.push(gline);
          gline = g;
          gW = gwc;
        } else {
          gline += g;
          gW += gwc;
        }
      }
      cur = gline;
      curW = gW;
      continue;
    }
    if (curW + wW > maxCells && cur.trim()) {
      pushCur();
      // Don't start a new line with whitespace
      if (/^\s+$/.test(word)) continue;
    }
    cur += word;
    curW += wW;
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

  // Center text (multi-line via <tspan>)
  const cx = bubble.x + bubble.w / 2;
  const lineH = fs;
  const lines = bubble.text.split('\n');
  const totalTextH = lines.length * lineH;
  const startY = bubble.y + (bubble.h - totalTextH) / 2 + lineH - 2;
  const tspans = lines.map((ln, i) => {
    const dy = i === 0 ? 0 : lineH;
    return `<tspan x="${cx}" dy="${dy}">${escapeXml(ln)}</tspan>`;
  }).join('');
  parts.push(
    `<text x="${cx}" y="${startY}" font-family="${MONO_STACK}" ` +
    `font-size="${fs}" font-variant-numeric="tabular-nums" ` +
    `text-anchor="middle" fill="#222">${tspans}</text>`
  );

  return parts.join('\n');
}

/**
 * Load component library from assets/components.json.
 * Returns Map<id, component> for fast lookup.
 */
function loadLibrary() {
  const path = join(ROOT, 'assets', 'components.json');
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    const map = new Map();
    for (const arr of Object.values(data.categories)) {
      for (const c of arr) {
        // Index by full id, category/name, and bare name — fixture refs may use any
        map.set(c.id, c);
        map.set(`${c.category}/${c.name}`, c);
        map.set(c.name, c);
      }
    }
    return map;
  } catch (e) {
    return new Map();
  }
}

/**
 * Measure panel content: returns { widthCells, heightCells, lines }.
 * Accepts either legacy `lines` (string array) or new `content` (item array).
 */
function measureContent(panel) {
  // Legacy: lines = string[]
  if (panel.lines) {
    const lines = panel.lines.map((l) => l.replace(/\r/g, ''));
    let end = lines.length;
    while (end > 0 && lines[end - 1].trim() === '') end--;
    const trimmed = lines.slice(0, end);
    let maxW = 0;
    for (const l of trimmed) maxW = Math.max(maxW, vw(l));
    return { widthCells: maxW, heightCells: trimmed.length, lines: trimmed, content: null };
  }
  // New: content = item[]
  if (panel.content) {
    let maxW = 0;
    let maxH = 0;
    for (const item of panel.content) {
      if (item.type === 'text') {
        maxW = Math.max(maxW, vw(item.text));
        maxH = Math.max(maxH, (item.y ?? maxH) + 1);
      }
      // components contribute to size via their viewBox + position
    }
    return { widthCells: maxW, heightCells: maxH, lines: [], content: panel.content };
  }
  return { widthCells: 0, heightCells: 0, lines: [], content: null };
}

/**
 * Render panel content (text + components) at panel position.
 * Components are placed via <g transform> with scale.
 */
function renderContent(panel, contentArr, maxW, cellW, cellH) {
  const parts = [];
  for (const item of contentArr ?? []) {
    if (item.type === 'text') {
      const y = panel.y + (item.y ?? 0) * cellH + cellH - 2;
      const x = panel.x + (item.x ?? 0) * cellW;
      parts.push(
        `<text x="${x}" y="${y}" font-family="${MONO_STACK}" ` +
        `font-size="${cellH}" font-variant-numeric="tabular-nums" ` +
        `fill="#222">${escapeXml(item.text)}</text>`
      );
    } else if (item.type === 'component') {
      const c = panel._lib?.get(item.id);
      if (!c) continue;
      const scale = item.scale ?? cellH;
      const x = panel.x + (item.x ?? 0) * cellW;
      const y = panel.y + (item.y ?? 0) * cellH;
      parts.push(
        `<g transform="translate(${x},${y}) scale(${scale})">${c.svg}</g>`
      );
    }
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

  const lib = loadLibrary();

  // Pre-measure each panel's content
  const panelInfo = panels.map((p) => {
    const measured = measureContent(p);
    const innerCap = p.width ?? measured.widthCells;
    // For content arrays, expand width to include component extents
    let contentCells = measured.widthCells;
    if (p.content) {
      for (const item of p.content) {
        if (item.type === 'component' && item.scale) {
          const c = lib.get(item.id);
          if (c) {
            const compCells = (c.width * item.scale) / cellW + (item.x ?? 0);
            contentCells = Math.max(contentCells, compCells);
          }
        }
      }
    }
    const widthCells = Math.max(1, Math.min(contentCells, innerCap));
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
      content: measured.content,
      maxW: widthCells,
      speaker: p.speaker ?? null,
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

    // Content (text + components)
    if (info.content) {
      const renderArea = {
        x: pos.x,
        y: contentY,
        contentW: pos.w,
        cellW,
        cellH,
        _lib: lib,
      };
      out.push(renderContent(renderArea, info.content, info.maxW, cellW, cellH));
    } else {
      // Legacy: centered text lines
      const renderArea = { x: pos.x, y: contentY, contentW: pos.w, cellW, cellH };
      out.push(renderContent(renderArea, info.lines, info.maxW, cellW, cellH));
    }
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
