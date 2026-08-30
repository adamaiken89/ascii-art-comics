#!/usr/bin/env bun
/**
 * render-components-svg.ts
 *
 * Renders a curated showcase of components from assets/components.json as a
 * single SVG. Each component becomes a labeled card with the component's
 * own SVG content drawn at a scaled size.
 *
 * No text rendering, no width math. The component SVG IS the visual.
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

const SCALE = 16;            // px per SVG unit
const colW = 260;
const colGap = 20;
const cardPadX = 14;
const cardPadY = 12;
const cardGap = 12;
const titleH = 22;

const PAGE_W = 1200;
const PAGE_H = 2200;
const COLS_PER_ROW = 4;

const parts = [];
parts.push(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}" height="${PAGE_H}">`
);
parts.push(`<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#fafafa"/>`);
parts.push(
  `<text x="20" y="28" font-family="sans-serif" font-size="20" font-weight="bold" fill="#222">ascii-art-comics — SVG component showcase</text>`
);
parts.push(
  `<text x="20" y="50" font-family="sans-serif" font-size="12" fill="#888">${comps.count} components · pure SVG primitives, no font rendering</text>`
);

let x = 20;
let y = 70;
let colIdx = 0;

for (const [category, names] of Object.entries(SHOWCASE)) {
  parts.push(
    `<text x="${x}" y="${y + 14}" font-family="sans-serif" font-size="13" font-weight="bold" fill="#444">${category}</text>`
  );
  parts.push(
    `<line x1="${x}" y1="${y + 18}" x2="${x + colW - 20}" y2="${y + 18}" stroke="#bbb" stroke-width="1"/>`
  );
  y += titleH + 4;

  for (const name of names) {
    const c = lookup[name];
    if (!c) continue;
    const drawW = c.width * SCALE;
    const drawH = c.height * SCALE;
    const cardW = Math.max(140, Math.min(drawW + cardPadX * 2 + 16, colW - 20));
    const cardH = drawH + cardPadY * 2 + 18;

    if (y + cardH > PAGE_H - 30) {
      colIdx++;
      if (colIdx >= COLS_PER_ROW) break;
      x = 20 + colIdx * (colW + colGap);
      y = 70;
    }

    parts.push(
      `<g transform="translate(${x},${y})">` +
      `<rect x="0" y="0" width="${cardW}" height="${cardH}" fill="white" stroke="#ddd" stroke-width="1" rx="4"/>`
    );
    // Embed component SVG at its natural size, scaled
    parts.push(
      `<g transform="translate(${cardPadX},${cardPadY}) scale(${SCALE})">${c.svg}</g>`
    );
    parts.push(
      `<text x="${cardPadX}" y="${cardH - 6}" font-family="sans-serif" font-size="10" fill="#888">${name} · ${c.width}×${c.height}</text>`
    );
    parts.push(`</g>`);

    y += cardH + cardGap;
  }

  colIdx++;
  if (colIdx >= COLS_PER_ROW) break;
  x = 20 + colIdx * (colW + colGap);
  y = 70;
}

parts.push(`</svg>`);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, parts.join('\n'), 'utf8');
console.log(`wrote ${OUT}`);
