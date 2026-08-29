#!/usr/bin/env node
/**
 * comic-render.mjs — Single comic renderer (panels + components + bubbles).
 *
 * v5 — refactor:
 *   - Single content model: content[] = {type: "component"} | {type: "text"}
 *   - No `lines` legacy. Drop `textLength`. Constant font metrics.
 *   - Parametric chibi generator: chibi(mood, dir) → SVG (no 27 files).
 *   - Speaker refs component + anchor. Renderer snaps tail to bbox.
 *   - Dropped: box-wrap.mjs, content-generator.mjs, standalone svg/bubble
 *     renderers. This file is THE renderer.
 *
 * Input:
 *   {
 *     "title": "Monday Morning",
 *     "panels": [
 *       {
 *         "panelId": 0,
 *         "width": 220,                 // panel pixel width
 *         "bubbleHeight": 90,           // reserved bubble area
 *         "content": [
 *           { "type": "component", "id": "chibi-happy-center", "x": 10, "y": 10 }
 *         ],
 *         "speaker": { "component": "chibi-happy-center", "anchor": "bottom" }
 *       }
 *     ],
 *     "layout": { "cols": 2, "gap": 30, "padding": 24 },
 *     "dialogue": [
 *       { "panelId": 0, "text": "Monday again?", "align": "left" }
 *     ]
 *   }
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import GraphemeSplitter from 'grapheme-splitter';
import stringWidth from 'string-width';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LIB_PATH = join(ROOT, 'assets', 'components.json');

const splitter = new GraphemeSplitter();
const vw = (s) => stringWidth(s);
const vwGraphemes = (s) => splitter.splitGraphemes(s);

// === Font metrics (constant — no runtime textLength guessing) ===
// Monospace font: width ≈ 0.6 × font-size for typical Courier/Consolas
const CHAR_W_RATIO = 0.6;
const BUBBLE_FONT = 14;
const BUBBLE_LINE_H = 18; // line-height = 1.28× font
const BUBBLE_PAD_X = 12;
const BUBBLE_PAD_Y = 8;
const BUBBLE_TAIL = 14;
const DEFAULT_FONT = "'Courier New', Consolas, monospace";

function charW(fs = BUBBLE_FONT) {
  return fs * CHAR_W_RATIO;
}

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Wrap text to fit pixel width. Breaks on word boundary; falls back to
 *  grapheme-split for a single word that exceeds maxChars. */
function wrapText(text, maxChars) {
  if (vw(text) <= maxChars) return [text];
  const lines = [];
  for (const word of text.split(/(\s+)/)) {
    if (vw(word) <= maxChars) {
      appendWord(lines, word, maxChars);
    } else {
      // Grapheme-split the oversized word
      for (const g of vwGraphemes(word)) {
        appendWord(lines, g, maxChars);
      }
    }
  }
  return lines.length ? lines : [text];
}

function appendWord(lines, word, maxChars) {
  if (!word) return;
  if (lines.length === 0) {
    lines.push(word);
    return;
  }
  const last = lines[lines.length - 1];
  if (vw(last) + vw(word) <= maxChars) {
    lines[lines.length - 1] = last + word;
  } else if (/^\s+$/.test(word)) {
    return; // skip leading whitespace on new line
  } else {
    lines.push(word);
  }
}

/** === Parametric chibi generator (no 27 files) ===
 *  Returns SVG string for a 7×3 cell chibi face. dir ∈ {center,left,right}.
 *  mood ∈ {happy, sad, panic, angry, smug, dead, thinking, shocked, neutral}.
 *  Cell size = 1 (renderer scales). */
function chibiSvg(mood, dir) {
  const EYE = {
    happy: ['◕', '◕'],
    sad: ['╥', '╥'],
    panic: ['⊙', '⊙'],
    angry: ['╬', '╬'],
    smug: ['◑', '◑'],
    dead: ['×', '×'],
    thinking: ['◐', '◐'],
    shocked: ['◎', '◎'],
    neutral: ['•', '•'],
  }[mood] ?? ['•', '•'];
  const MOUTH = {
    happy: '‿', sad: '﹏', panic: '○', angry: '︵',
    smug: '‿', dead: '_', thinking: '~', shocked: '○', neutral: '_',
  }[mood] ?? '_';
  // Closed-eye marks per mood (for left/right directional variants)
  const CLOSED = {
    happy: '◡', sad: '─', panic: '─', angry: '─',
    smug: '◡', dead: '─', thinking: '─', shocked: '─', neutral: '─',
  }[mood] ?? '─';
  // Map eyes for direction
  let left, right;
  if (dir === 'left') { left = EYE[0]; right = CLOSED; }
  else if (dir === 'right') { left = CLOSED; right = EYE[1]; }
  else { left = EYE[0]; right = EYE[1]; }
  // 7×3 grid (width=7, height=3). Box drawn as <rect>, eyes/mouth as <text>.
  // viewBox 0 0 7 3.
  return [
    '<rect x="0" y="0" width="7" height="3" fill="none" stroke="#333" stroke-width="0.1"/>',
    `<text x="2" y="1.4" font-family="${DEFAULT_FONT}" font-size="1.2" text-anchor="middle" fill="#222">${escapeXml(left)}</text>`,
    `<text x="5" y="1.4" font-family="${DEFAULT_FONT}" font-size="1.2" text-anchor="middle" fill="#222">${escapeXml(right)}</text>`,
    `<text x="3.5" y="2.5" font-family="${DEFAULT_FONT}" font-size="1" text-anchor="middle" fill="#222">${escapeXml(MOUTH)}</text>`,
  ].join('');
}

/** Resolve a component id: either a library entry, or a parametric chibi
 *  using `chibi:<mood>-<dir>` syntax. Returns {svg, width, height} or null. */
function resolveComponent(id, lib) {
  if (id.startsWith('chibi:')) {
    const [, spec] = id.split(':');
    const [mood, dir = 'center'] = spec.split('-');
    return { svg: chibiSvg(mood, dir), width: 7, height: 3 };
  }
  // Also support bare "chibi-mood-dir" pattern for fixture ergonomics
  const m = id.match(/^chibi-(\w+)-(center|left|right)$/);
  if (m) {
    return { svg: chibiSvg(m[1], m[2]), width: 7, height: 3 };
  }
  return lib.get(id) ?? null;
}

/** Compute pixel bounding box of a component at (x, y) in panel space. */
function componentBBox(item, comp) {
  return {
    x: item.x ?? 0,
    y: item.y ?? 0,
    w: comp.width,
    h: comp.height,
    cx: (item.x ?? 0) + comp.width / 2,
    cy: (item.y ?? 0) + comp.height / 2,
  };
}

/** Anchor point on a bbox: top/bottom/left/right. */
function anchorPoint(bbox, anchor) {
  switch (anchor) {
    case 'top': return { x: bbox.cx, y: bbox.y };
    case 'bottom': return { x: bbox.cx, y: bbox.y + bbox.h };
    case 'left': return { x: bbox.x, y: bbox.cy };
    case 'right': return { x: bbox.x + bbox.w, y: bbox.cy };
    case 'top-left': return { x: bbox.x, y: bbox.y };
    case 'top-right': return { x: bbox.x + bbox.w, y: bbox.y };
    case 'bottom-left': return { x: bbox.x, y: bbox.y + bbox.h };
    case 'bottom-right': return { x: bbox.x + bbox.w, y: bbox.y + bbox.h };
    default: return { x: bbox.cx, y: bbox.y + bbox.h };
  }
}

function loadLibrary() {
  try {
    const data = JSON.parse(readFileSync(LIB_PATH, 'utf8'));
    const map = new Map();
    for (const arr of Object.values(data.categories)) {
      for (const c of arr) {
        map.set(c.id, c);
        map.set(`${c.category}/${c.name}`, c);
        map.set(c.name, c);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

function measureContent(contentArr) {
  let maxW = 0, maxH = 0;
  for (const item of contentArr ?? []) {
    if (item.type === 'text') {
      maxW = Math.max(maxW, vw(item.text));
      maxH = Math.max(maxH, (item.y ?? 0) + 1);
    } else if (item.type === 'component') {
      const c = resolveComponent(item.id, new Map()); // no lib for measure
      if (c) {
        maxW = Math.max(maxW, (item.x ?? 0) + c.width);
        maxH = Math.max(maxH, (item.y ?? 0) + c.height);
      }
    }
  }
  return { width: maxW, height: maxH };
}

function renderContent(items, panelX, panelY, lib) {
  const out = [];
  for (const item of items ?? []) {
    if (item.type === 'text') {
      out.push(
        `<text x="${panelX + (item.x ?? 0) * charW(14)}" y="${panelY + (item.y ?? 0) * 16 + 14}" ` +
        `font-family="${DEFAULT_FONT}" font-size="14" fill="#222">${escapeXml(item.text)}</text>`
      );
    } else if (item.type === 'component') {
      const c = resolveComponent(item.id, lib);
      if (!c) continue;
      // Components use their natural pixel size (no magic scale).
      out.push(
        `<g transform="translate(${panelX + (item.x ?? 0)},${panelY + (item.y ?? 0)})">${c.svg}</g>`
      );
    }
  }
  return out.join('\n');
}

/** Bubble geometry: position + auto-size from text. */
function sizeBubble(text, panelW) {
  const cw = charW();
  const maxChars = Math.floor((panelW - BUBBLE_PAD_X * 2) / cw);
  const lines = wrapText(text, maxChars);
  const maxLineCells = lines.reduce((m, l) => Math.max(m, vw(l)), 0);
  const w = maxLineCells * cw + BUBBLE_PAD_X * 2;
  const h = lines.length * BUBBLE_LINE_H + BUBBLE_PAD_Y * 2;
  return { lines, w, h };
}

function tailPoints(bx, by, bw, bh, anchor, side = 'auto') {
  const s = BUBBLE_TAIL;
  const cx = Math.max(bx + s / 2, Math.min(bx + bw - s / 2, anchor.x));
  const t = side === 'top' || (side === 'auto' && anchor.y < by + bh / 2) ? 'top' : 'bottom';
  if (t === 'top') {
    return [[cx - s / 2, by], [cx + s / 2, by], [cx, Math.max(by - s, anchor.y + 1)]];
  }
  return [[cx - s / 2, by + bh], [cx + s / 2, by + bh], [cx, Math.min(by + bh + s, anchor.y - 1)]];
}

function renderBubble(bubble, anchor) {
  const { x, y, w, h, lines, fill = '#fffbe6', stroke = '#333' } = bubble;
  const parts = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" ry="8" ` +
    `fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`,
  ];
  const pts = tailPoints(x, y, w, h, anchor);
  parts.push(
    `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" ` +
    `fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/>`
  );
  // Text: centered, multi-line via <tspan>
  const cx = x + w / 2;
  const totalTextH = lines.length * BUBBLE_LINE_H;
  const startY = y + (h - totalTextH) / 2 + BUBBLE_LINE_H - 3;
  const tspans = lines.map((ln, i) =>
    `<tspan x="${cx}" dy="${i === 0 ? 0 : BUBBLE_LINE_H}">${escapeXml(ln)}</tspan>`
  ).join('');
  parts.push(
    `<text x="${cx}" y="${startY}" font-family="${DEFAULT_FONT}" font-size="${BUBBLE_FONT}" ` +
    `font-variant-numeric="tabular-nums" text-anchor="middle" fill="#222">${tspans}</text>`
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
    try { input = JSON.parse(readFileSync('request.json', 'utf8')); }
    catch (e) {
      console.error('comic-render: no stdin and no request.json:', e.message);
      process.exit(2);
    }
  }

  const panels = input.panels ?? [];
  if (panels.length === 0) {
    console.error('comic-render: no panels in input');
    process.exit(2);
  }

  const padding = input.layout?.padding ?? 24;
  const gap = input.layout?.gap ?? 24;
  const cols = input.layout?.cols ?? 1;
  const lib = loadLibrary();

  // Pre-measure each panel.
  const panelInfo = panels.map((p) => {
    const m = measureContent(p.content ?? []);
    return {
      panelId: p.panelId,
      contentW: p.width ?? m.width,
      contentH: m.height,
      bubbleH: p.bubbleHeight ?? 0,
      speaker: p.speaker ?? null,
      content: p.content ?? [],
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
    let y = padding;
    for (const row of rows) {
      let x = padding;
      const rowH = Math.max(...row.map((p) => p.contentH + p.bubbleH));
      for (const p of row) {
        positions.push({ x, y, w: p.contentW, h: p.contentH + p.bubbleH, info: p });
        x += p.contentW + gap;
      }
      y += rowH + gap;
    }
    totalW = Math.max(...rows.map((r) =>
      r.reduce((s, p, i) => s + p.contentW + (i < r.length - 1 ? gap : 0), 0)
    )) + 2 * padding;
    totalH = y - gap + padding;
  } else {
    let y = padding;
    for (const p of panelInfo) {
      positions.push({ x: padding, y, w: p.contentW, h: p.contentH + p.bubbleH, info: p });
      y += p.contentH + p.bubbleH + gap;
    }
    totalW = Math.max(...panelInfo.map((p) => p.contentW)) + 2 * padding;
    totalH = y - gap + padding;
  }

  const titleH = input.title ? 28 : 0;
  totalH += titleH;

  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" ` +
    `width="${totalW}" height="${totalH}">`,
    `<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="white"/>`,
    `<style>text { font-family: ${DEFAULT_FONT}; font-variant-numeric: tabular-nums; }</style>`,
  ];

  if (input.title) {
    out.push(
      `<text x="${totalW / 2}" y="${titleH - 8}" font-family="sans-serif" ` +
      `font-size="20" font-weight="bold" text-anchor="middle" fill="#222">` +
      `${escapeXml(input.title)}</text>`
    );
  }

  // ---- Layer 1: panel rects + content ----
  for (const pos of positions) {
    const yTop = pos.y + titleH;
    const contentY = yTop + pos.info.bubbleH;
    out.push(
      `<rect x="${pos.x}" y="${contentY}" width="${pos.w}" height="${pos.info.contentH}" ` +
      `fill="#fafafa" stroke="#333" stroke-width="1.5"/>`
    );
    out.push(renderContent(pos.info.content, pos.x, contentY, lib));
  }

  // ---- Layer 2: bubbles (above content) ----
  for (const d of input.dialogue ?? []) {
    const pos = positions.find((p) => p.info.panelId === d.panelId);
    if (!pos) continue;
    const yTop = pos.y + titleH;
    const contentY = yTop + pos.info.bubbleH;

    const { lines, w: bw, h: bh } = sizeBubble(d.text ?? '', pos.w);
    const margin = 6;
    let bx = pos.x + margin;
    if (d.align === 'right') bx = pos.x + pos.w - bw - margin;
    else if (d.align === 'center') bx = pos.x + (pos.w - bw) / 2;
    const by = yTop + margin;

    // Tail anchor: speaker component bbox anchor, or content rect top
    let anchor = { x: bx + bw / 2, y: contentY };
    if (pos.info.speaker?.component) {
      const comp = resolveComponent(pos.info.speaker.component, lib);
      const item = pos.info.content.find(
        (c) => c.type === 'component' && c.id === pos.info.speaker.component
      );
      if (comp && item) {
        const bbox = componentBBox(item, comp);
        const local = anchorPoint(bbox, pos.info.speaker.anchor ?? 'bottom');
        anchor = { x: pos.x + local.x, y: contentY + local.y };
      }
    }

    out.push(renderBubble({ x: bx, y: by, w: bw, h: bh, lines }, anchor));
  }

  out.push('</svg>');
  process.stdout.write(
    JSON.stringify({ svg: out.join('\n'), ok: true, width: totalW, height: totalH }, null, 2) + '\n'
  );
}

main();
