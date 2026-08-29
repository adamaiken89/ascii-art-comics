#!/usr/bin/env node
/**
 * render-components-svg.mjs
 *
 * Renders a curated showcase of components from assets/components.json as a
 * single SVG. Each component becomes a labeled card with its source drawn
 * in monospace and a caption below.
 *
 * No panel borders — just a grid of <text> elements with explicit coordinates.
 * SVG handles all width math, including CJK + emoji.
 *
 * Output: assets/components-renders/components-svg.svg
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'assets', 'components.json');
const OUT_DIR = join(ROOT, 'assets', 'components-renders');
const OUT = join(OUT_DIR, 'components-svg.svg');

const comps = JSON.parse(readFileSync(SRC, 'utf8'));
const lookup = {};
for (const arr of Object.values(comps.categories)) {
  for (const c of arr) lookup[c.name] = c;
}

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Curated subset per category
const SHOWCASE = {
  face: [
    'happy', 'sad', 'panic', 'angry', 'smug', 'thinking', 'shocked',
    'chibi-happy-center', 'chibi-sad-left', 'chibi-angry-right',
  ],
  body: ['shrug', 'stick-arms-up', 'stick-pointing'],
  gesture: ['thumbs-up', 'wave', 'peace'],
  prop: ['coffee', 'laptop', 'fire', 'gear', 'clock', 'money', 'bug'],
  scene: ['sun', 'moon', 'cloud', 'lightning', 'star', 'tree'],
  bubble: ['cjk-bracket', 'en-quote', 'thought', 'shout'],
  separator: ['line', 'double', 'dotted', 'wavy'],
  frame: ['heavy-top', 'light-top', 'ascii-top'],
};

const cellW = 8;   // px per monospace cell
const cellH = 14;  // px per line (smaller for more density)
const cellPadX = 16;
const colW = 260;
const colGap = 20;
const cardPadX = 10;
const cardPadY = 8;
const cardGap = 10;
const titleH = cellH + 4;

const PAGE_W = 1200;
const PAGE_H = 1800;
const COLS_PER_ROW = 4;
const MAX_Y = PAGE_H - 40;

const parts = [];
parts.push(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}" height="${PAGE_H}">`
);
parts.push(`<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#fafafa"/>`);
// Page title
parts.push(
  `<text x="${cellPadX}" y="${cellH + 8}" font-family="monospace" font-size="20" font-weight="bold" fill="#222">ascii-art-comics — SVG component showcase</text>`
);
parts.push(
  `<text x="${cellPadX}" y="${cellH + 28}" font-family="monospace" font-size="12" fill="#888">${comps.count} components · all rendered via &lt;text&gt; with monospace font, no width math</text>`
);

let x = cellPadX;
let y = cellH + 50;
let colIdx = 0;

for (const [category, names] of Object.entries(SHOWCASE)) {
  // Category header
  parts.push(
    `<text x="${x}" y="${y + cellH}" font-family="monospace" font-size="14" font-weight="bold" fill="#444">${escapeXml(category)}</text>`
  );
  parts.push(
    `<line x1="${x}" y1="${y + cellH + 4}" x2="${x + colW - 20}" y2="${y + cellH + 4}" stroke="#bbb" stroke-width="1"/>`
  );
  y += titleH + 6;

  for (const name of names) {
    const c = lookup[name];
    if (!c) continue;
    const w = c.width;
    const h = c.height;
    const drawW = w * cellW;
    const drawH = h * cellH;
    const cardW = Math.min(Math.max(drawW + cardPadX * 2 + 8, 140), colW - 20);
    const cardH = drawH + cardPadY * 2 + 14;

    if (y + cardH > MAX_Y) {
      colIdx++;
      if (colIdx >= COLS_PER_ROW) break; // overflow safety
      x = cellPadX + colIdx * (colW + colGap);
      y = cellH + 50;
    }

    parts.push(
      `<g transform="translate(${x},${y})">` +
      `<rect x="0" y="0" width="${cardW}" height="${cardH}" fill="white" stroke="#ddd" stroke-width="1" rx="4"/>`
    );
    // Component text lines
    for (let i = 0; i < c.lines.length; i++) {
      parts.push(
        `<text x="${cardPadX}" y="${cardPadY + (i + 1) * cellH}" font-family="monospace" font-size="${cellH}" fill="#000">${escapeXml(c.lines[i])}</text>`
      );
    }
    // Caption
    parts.push(
      `<text x="${cardPadX}" y="${cardH - 6}" font-family="monospace" font-size="10" fill="#888">${escapeXml(name)} · ${w}×${h}</text>`
    );
    parts.push(`</g>`);

    y += cardH + cardGap;
  }

  // Move to next column
  colIdx++;
  if (colIdx >= COLS_PER_ROW) break;
  x = cellPadX + colIdx * (colW + colGap);
  y = cellH + 50;
}

parts.push(`</svg>`);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, parts.join('\n'), 'utf8');
console.log(`wrote ${OUT}`);
