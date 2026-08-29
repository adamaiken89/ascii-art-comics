#!/usr/bin/env node
/**
 * generate-component-svgs.mjs
 *
 * Generate SVG primitives for all 96 components in assets/components-svg/<category>/<name>.svg.
 * Replaces the ASCII-art `.txt` source files as the visual source of truth.
 *
 * Categories:
 *   - face: kaomoji as text (still works) + chibi as <rect> + circles
 *   - body: stick figures as <line>
 *   - gesture: simple <circle> hands
 *   - prop: simple shape outlines
 *   - scene: simple geometric shapes
 *   - frame: just border lines
 *   - separator: <line> elements
 *   - bubble: <rect> + tail
 *
 * Output: assets/components-svg/<category>/<name>.svg
 *
 * Each SVG is self-contained: <svg viewBox="0 0 W H" width="W" height="H">...</svg>
 * Build script will read these and store viewBox/width/height in components.json.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'assets', 'components-svg');

mkdirSync(OUT, { recursive: true });

// Cell size: 1 unit per monospace cell. The viewBox in user units matches the cell grid.
const C = 1;

function svgWrap(content, w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${content}</svg>`;
}

// =============================================================
// FACE — kaomoji kept as <text>, chibi as primitives
// =============================================================

const FACES = {
  // Kaomoji — render as <text> (SVG handles the chars)
  happy:        { w: 5, h: 1, kaomoji: '(◕‿◕)' },
  sad:          { w: 6, h: 1, kaomoji: '(╥﹏╥)' },
  panic:        { w: 5, h: 1, kaomoji: '(⊙_⊙)' },
  angry:        { w: 8, h: 1, kaomoji: '(╬ Ò﹏Ó)' },
  smug:         { w: 5, h: 1, kaomoji: '(¬‿¬)' },
  dead:         { w: 5, h: 1, kaomoji: '(×_×)' },
  thinking:     { w: 5, h: 1, kaomoji: '(¬_¬)' },
  shocked:      { w: 5, h: 1, kaomoji: '(°□°)' },
  excited:      { w: 7, h: 1, kaomoji: '\\(★▽★)/' },
  confused:     { w: 7, h: 1, kaomoji: '(゜-゜)' },
  'happy-left':   { w: 6, h: 1, kaomoji: '(◕ ‿ ◡)' },
  'happy-right':  { w: 6, h: 1, kaomoji: '(◡ ‿ ◕)' },
  'sad-left':     { w: 7, h: 1, kaomoji: '(╥﹏ ╥)' },
  'sad-right':    { w: 7, h: 1, kaomoji: '(╥ ╏╥)' },
  'panic-left':   { w: 7, h: 1, kaomoji: '(⊙_O)' },
  'panic-right':  { w: 7, h: 1, kaomoji: '(O_⊙)' },

  // Chibi box — 7 wide, 3 tall. Box + 2 eyes + mouth
  // Direction: 'center' (both eyes open), 'left' (right eye closed), 'right' (left eye closed)
};

const CHIBI = {
  happy:    { leftEye: '◕', rightEye: '◕', mouth: '‿' },
  sad:      { leftEye: '╥', rightEye: '╥', mouth: '﹏' },
  panic:    { leftEye: '⊙', rightEye: '⊙', mouth: '_' },
  angry:    { leftEye: '╬', rightEye: '╬', mouth: '_' },
  smug:     { leftEye: '◑', rightEye: '◑', mouth: '‿' },
  thinking: { leftEye: '◐', rightEye: '◐', mouth: '_' },
  shocked:  { leftEye: '◎', rightEye: '◎', mouth: '_' },
  dead:     { leftEye: '×', rightEye: '×', mouth: '_' },
  confused: { leftEye: '◑', rightEye: '◐', mouth: '‿' },
};

function chibiSvg(mood, dir) {
  const e = CHIBI[mood];
  if (!e) return null;
  // Closed eye variants: '─' (line) for default, '◡' for happy, 'x' for dead
  const closed = mood === 'happy' || mood === 'smug' ? '◡' : mood === 'dead' ? '_' : '─';
  let leftEye = e.leftEye, rightEye = e.rightEye, mouth = e.mouth;
  if (dir === 'left') rightEye = closed;
  if (dir === 'right') leftEye = closed;

  // 7 wide, 3 tall box. Render with: rect outline + 2 text lines for top/bot + 1 text line for mid
  // Use monospace <text> for the face chars themselves (these are individual symbol chars, not box-drawing)
  const top = '─'.repeat(5);
  const bot = '─'.repeat(5);
  return `<g>
    <text x="0" y="1" font-family="monospace" font-size="1" fill="none" stroke="currentColor" stroke-width="0.05">╭${top}╮</text>
    <text x="0" y="2" font-family="monospace" font-size="1" fill="none" stroke="currentColor" stroke-width="0.05">│${leftEye} ${mouth} ${rightEye}│</text>
    <text x="0" y="3" font-family="monospace" font-size="1" fill="none" stroke="currentColor" stroke-width="0.05">╰${bot}╯</text>
  </g>`;
}

// Use a cleaner approach: chibi as pure SVG primitives (rect + circle/text for eyes)
function chibiSvgClean(mood, dir) {
  const e = CHIBI[mood];
  if (!e) return null;
  const closed = mood === 'happy' || mood === 'smug' ? '◡' : mood === 'dead' ? '×' : '─';
  let leftEye = e.leftEye, rightEye = e.rightEye;
  if (dir === 'left') rightEye = closed;
  if (dir === 'right') leftEye = closed;
  // 7x3 grid. Box: rect with rounded corners. Eyes: <text> at cell coords. Mouth: <text>.
  return `<g font-family="monospace" font-size="1" text-anchor="middle">
    <rect x="0.1" y="0.1" width="6.8" height="2.8" rx="0.4" fill="none" stroke="black" stroke-width="0.1"/>
    <text x="2" y="2.1" fill="black">${leftEye}</text>
    <text x="5" y="2.1" fill="black">${rightEye}</text>
    <text x="3.5" y="2.1" fill="black">${e.mouth}</text>
  </g>`;
}

// =============================================================
// BODY — stick figures
// =============================================================

const BODY = {
  'stick-basic': { w: 3, h: 3, lines: [' o ', '/|\\', '   '] },
  'stick-with-legs': { w: 3, h: 4, lines: [' o ', '/|\\', '', '/ \\'] },
  'stick-arms-up': { w: 3, h: 4, lines: [' o ', '\\|/', ' | ', '/ \\'] },
  'stick-sitting': { w: 3, h: 4, lines: [' o ', '\\|\\', ' | ', '/ \\'] },
  'stick-walking': { w: 3, h: 4, lines: [' o ', '/|\\', ' | ', '   '] },
  'stick-running': { w: 3, h: 5, lines: [' o ', '/|\\', ' | ', '   ', '  >'] },
  'stick-pointing': { w: 8, h: 4, lines: [' o ', '/|\\', '  \\', '   >--->'] },
  'shrug': { w: 11, h: 1, lines: [' ¯\\\\_(ツ)_/¯'] },
};

function bodySvg(b) {
  // Use <text> for the actual content
  const parts = b.lines.map((l, i) =>
    `<text x="0" y="${i + 1}" font-family="monospace" font-size="1" fill="black">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`
  ).join('');
  return parts;
}

// =============================================================
// GESTURE
// =============================================================

const GESTURE = {
  'thumbs-up':   { w: 4, h: 2, content: ' _(👍)' },
  'thumbs-down': { w: 4, h: 2, content: ' _(👎)' },
  'wave':        { w: 6, h: 2, content: ' _( ゝ◡)' },
  'fist':        { w: 4, h: 2, content: ' _(👊)' },
  'ok':          { w: 4, h: 2, content: ' _(👌)' },
  'peace':       { w: 4, h: 2, content: ' _(✌)' },
};

function gestureSvg(g) {
  return `<text x="0" y="2" font-family="monospace" font-size="1" fill="black">${g.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`;
}

// =============================================================
// PROP — simple shapes
// =============================================================

const PROP = {
  'coffee': { w: 5, h: 5, fn: () =>
    `<g>
      <text x="0" y="1" font-family="monospace" font-size="1" fill="black">~ ~ ~</text>
      <text x="0" y="2" font-family="monospace" font-size="1" fill="black"> ) )</text>
      <text x="0" y="3" font-family="monospace" font-size="1" fill="black">( _ )</text>
      <text x="0" y="4" font-family="monospace" font-size="1" fill="black">|   |</text>
      <text x="0" y="5" font-family="monospace" font-size="1" fill="black"> ====</text>
    </g>` },
  'laptop': { w: 7, h: 4, fn: () =>
    `<g font-family="monospace" font-size="1" fill="none" stroke="black" stroke-width="0.1">
      <rect x="0.2" y="0.5" width="6.6" height="2.5" rx="0.1"/>
      <rect x="0.2" y="3" width="6.6" height="0.8" rx="0.1" fill="black"/>
    </g>` },
  'phone': { w: 3, h: 3, fn: () =>
    `<g font-family="monospace" font-size="1" fill="none" stroke="black" stroke-width="0.1">
      <rect x="0.3" y="0.2" width="2.4" height="2.6" rx="0.3"/>
      <line x1="1.2" y1="0.4" x2="1.8" y2="0.4"/>
    </g>` },
  'book': { w: 5, h: 4, fn: () =>
    `<g font-family="monospace" font-size="1" fill="none" stroke="black" stroke-width="0.1">
      <rect x="0.3" y="0.3" width="4.4" height="3.4"/>
      <line x1="2.5" y1="0.3" x2="2.5" y2="3.7"/>
    </g>` },
  'bug': { w: 5, h: 7, fn: () =>
    `<g fill="black">
      <circle cx="2.5" cy="0.7" r="0.3"/>
      <ellipse cx="2.5" cy="3.5" rx="1.3" ry="2.3"/>
      <line x1="1" y1="1.5" x2="0.3" y2="1" stroke="black" stroke-width="0.1"/>
      <line x1="4" y1="1.5" x2="4.7" y2="1" stroke="black" stroke-width="0.1"/>
      <line x1="1" y1="3" x2="0.3" y2="3" stroke="black" stroke-width="0.1"/>
      <line x1="4" y1="3" x2="4.7" y2="3" stroke="black" stroke-width="0.1"/>
      <line x1="1" y1="4.5" x2="0.3" y2="5" stroke="black" stroke-width="0.1"/>
      <line x1="4" y1="4.5" x2="4.7" y2="5" stroke="black" stroke-width="0.1"/>
    </g>` },
  'fire': { w: 4, h: 5, fn: () =>
    `<g fill="orange" stroke="red" stroke-width="0.1">
      <path d="M2 0.5 Q 0.5 2 1 3.5 Q 0.5 4 1 4.5 Q 2 4 2 3 Q 2 4 3 4.5 Q 3.5 4 3 3.5 Q 3.5 2 2 0.5 Z"/>
      <path d="M2 1.5 Q 1 3 1.5 4 Q 2 3.5 2 2.8 Q 2 3.5 2.5 4 Q 3 3 2 1.5 Z" fill="yellow"/>
    </g>` },
  'bomb': { w: 6, h: 9, fn: () =>
    `<g fill="black">
      <circle cx="3" cy="5" r="2.3"/>
      <rect x="2.3" y="2.2" width="1.4" height="1"/>
      <line x1="3" y1="2.2" x2="4.5" y2="0.7" stroke="red" stroke-width="0.2"/>
      <line x1="3" y1="2.2" x2="4" y2="0.3" stroke="red" stroke-width="0.2"/>
    </g>` },
  'gear': { w: 3, h: 3, fn: () =>
    `<g fill="none" stroke="black" stroke-width="0.15">
      <circle cx="1.5" cy="1.5" r="1"/>
      <circle cx="1.5" cy="1.5" r="0.4" fill="black"/>
      <line x1="1.5" y1="0.1" x2="1.5" y2="0.5"/>
      <line x1="1.5" y1="2.5" x2="1.5" y2="2.9"/>
      <line x1="0.1" y1="1.5" x2="0.5" y2="1.5"/>
      <line x1="2.5" y1="1.5" x2="2.9" y2="1.5"/>
    </g>` },
  'key': { w: 4, h: 5, fn: () =>
    `<g fill="none" stroke="black" stroke-width="0.15">
      <circle cx="1.5" cy="1.5" r="1"/>
      <line x1="2.3" y1="1.5" x2="3.8" y2="1.5"/>
      <line x1="3.2" y1="1.5" x2="3.2" y2="2"/>
      <line x1="3.6" y1="1.5" x2="3.6" y2="2.2"/>
    </g>` },
  'envelope': { w: 6, h: 4, fn: () =>
    `<g fill="none" stroke="black" stroke-width="0.1">
      <rect x="0.3" y="0.3" width="5.4" height="3.4"/>
      <polyline points="0.3,0.3 3,2.4 5.7,0.3"/>
    </g>` },
  'clock': { w: 5, h: 5, fn: () =>
    `<g fill="none" stroke="black" stroke-width="0.15">
      <circle cx="2.5" cy="2.5" r="2"/>
      <line x1="2.5" y1="2.5" x2="2.5" y2="1.3"/>
      <line x1="2.5" y1="2.5" x2="3.5" y2="2.5"/>
      <circle cx="2.5" cy="2.5" r="0.15" fill="black"/>
    </g>` },
  'money': { w: 4, h: 4, fn: () =>
    `<g font-family="monospace" font-size="1" fill="green">
      <text x="0" y="1">$</text>
      <text x="0" y="2">$$</text>
      <text x="0" y="3">$$$</text>
      <text x="0" y="4">$$$$</text>
    </g>` },
};

// =============================================================
// SCENE — simple geometric shapes
// =============================================================

const SCENE = {
  'sun': { w: 5, h: 5, fn: () =>
    `<g>
      <line x1="0" y1="2.5" x2="5" y2="2.5" stroke="orange" stroke-width="0.1"/>
      <line x1="2.5" y1="0" x2="2.5" y2="5" stroke="orange" stroke-width="0.1"/>
      <line x1="0.5" y1="0.5" x2="4.5" y2="4.5" stroke="orange" stroke-width="0.1"/>
      <line x1="4.5" y1="0.5" x2="0.5" y2="4.5" stroke="orange" stroke-width="0.1"/>
      <circle cx="2.5" cy="2.5" r="1" fill="yellow" stroke="orange" stroke-width="0.1"/>
    </g>` },
  'moon': { w: 4, h: 3, fn: () =>
    `<g fill="lightgray" stroke="gray" stroke-width="0.1">
      <path d="M 1 0.3 A 1.5 1.5 0 1 0 1 2.7 A 1.2 1.2 0 1 1 1 0.3 Z"/>
    </g>` },
  'cloud': { w: 6, h: 3, fn: () =>
    `<g fill="lightgray" stroke="gray" stroke-width="0.1">
      <ellipse cx="3" cy="2" rx="2.7" ry="1"/>
      <ellipse cx="2" cy="1.5" rx="1.3" ry="0.8"/>
      <ellipse cx="4" cy="1.5" rx="1.5" ry="0.9"/>
    </g>` },
  'rain': { w: 3, h: 6, fn: () =>
    `<g fill="blue">
      <text x="0" y="1" font-family="monospace" font-size="1">.</text>
      <text x="1" y="2" font-family="monospace" font-size="1">.</text>
      <text x="0" y="3" font-family="monospace" font-size="1">.</text>
      <text x="1" y="4" font-family="monospace" font-size="1">.</text>
      <text x="0" y="5" font-family="monospace" font-size="1">.</text>
      <text x="1" y="6" font-family="monospace" font-size="1">.</text>
    </g>` },
  'snow': { w: 2, h: 5, fn: () =>
    `<g fill="white" stroke="lightblue" stroke-width="0.05">
      <text x="0" y="1" font-family="monospace" font-size="1">*</text>
      <text x="1" y="2" font-family="monospace" font-size="1">*</text>
      <text x="0" y="3" font-family="monospace" font-size="1">*</text>
      <text x="1" y="4" font-family="monospace" font-size="1">*</text>
      <text x="0" y="5" font-family="monospace" font-size="1">*</text>
    </g>` },
  'lightning': { w: 4, h: 4, fn: () =>
    `<g fill="yellow" stroke="orange" stroke-width="0.1">
      <polygon points="2,0 0.5,2 1.5,2 1,4 3,1.5 2,1.5 2.5,0"/>
    </g>` },
  'house': { w: 7, h: 9, fn: () =>
    `<g fill="none" stroke="black" stroke-width="0.1">
      <polygon points="0,3 3.5,0 7,3"/>
      <rect x="0.5" y="3" width="6" height="6"/>
      <rect x="2.5" y="5" width="2" height="4"/>
      <rect x="1.2" y="4" width="1.5" height="1.5"/>
      <rect x="4.3" y="4" width="1.5" height="1.5"/>
    </g>` },
  'tree': { w: 5, h: 6, fn: () =>
    `<g>
      <polygon points="2.5,0 0.5,3 4.5,3" fill="green"/>
      <polygon points="2.5,1.5 0.5,4 4.5,4" fill="green"/>
      <polygon points="2.5,3 0.5,5.5 4.5,5.5" fill="green"/>
      <rect x="2" y="5" width="1" height="1" fill="brown"/>
    </g>` },
  'star': { w: 3, h: 3, fn: () =>
    `<g fill="gold">
      <polygon points="1.5,0 1.8,1.2 3,1.2 2.1,1.9 2.4,3 1.5,2.4 0.6,3 0.9,1.9 0,1.2 1.2,1.2"/>
    </g>` },
  'arrow-down': { w: 1, h: 3, fn: () =>
    `<g fill="black">
      <line x1="0.5" y1="0" x2="0.5" y2="2" stroke="black" stroke-width="0.15"/>
      <polygon points="0,2 1,2 0.5,3"/>
    </g>` },
  'arrow-up': { w: 1, h: 3, fn: () =>
    `<g fill="black">
      <line x1="0.5" y1="1" x2="0.5" y2="3" stroke="black" stroke-width="0.15"/>
      <polygon points="0,1 1,1 0.5,0"/>
    </g>` },
  'arrow-right': { w: 1, h: 1, fn: () =>
    `<g fill="black">
      <polygon points="0,0 1,0.5 0,1"/>
    </g>` },
};

// =============================================================
// FRAME
// =============================================================

const FRAME = {
  'heavy-top': { w: 20, h: 1, fn: () =>
    `<text x="0" y="1" font-family="monospace" font-size="1" fill="none" stroke="black" stroke-width="0.1">╔${'═'.repeat(18)}╗</text>` },
  'heavy-bottom': { w: 20, h: 1, fn: () =>
    `<text x="0" y="1" font-family="monospace" font-size="1" fill="none" stroke="black" stroke-width="0.1">╚${'═'.repeat(18)}╝</text>` },
  'light-top': { w: 10, h: 1, fn: () =>
    `<text x="0" y="1" font-family="monospace" font-size="1" fill="none" stroke="black" stroke-width="0.1">┌${'─'.repeat(8)}┐</text>` },
  'light-bottom': { w: 10, h: 1, fn: () =>
    `<text x="0" y="1" font-family="monospace" font-size="1" fill="none" stroke="black" stroke-width="0.1">└${'─'.repeat(8)}┘</text>` },
  'ascii-top': { w: 10, h: 1, fn: () =>
    `<text x="0" y="1" font-family="monospace" font-size="1" fill="none" stroke="black" stroke-width="0.1">+${'-'.repeat(8)}+</text>` },
  'ascii-bottom': { w: 10, h: 1, fn: () =>
    `<text x="0" y="1" font-family="monospace" font-size="1" fill="none" stroke="black" stroke-width="0.1">+${'-'.repeat(8)}+</text>` },
};

// =============================================================
// SEPARATOR
// =============================================================

const SEPARATOR = {
  'line':   { w: 20, h: 1, fn: () => `<line x1="0" y1="0.5" x2="20" y2="0.5" stroke="black" stroke-width="0.15"/>` },
  'double': { w: 20, h: 1, fn: () => `<line x1="0" y1="0.3" x2="20" y2="0.3" stroke="black" stroke-width="0.15"/><line x1="0" y1="0.7" x2="20" y2="0.7" stroke="black" stroke-width="0.15"/>` },
  'dotted': { w: 20, h: 1, fn: () => {
    let parts = '';
    for (let i = 0; i < 20; i += 2) parts += `<circle cx="${i + 0.5}" cy="0.5" r="0.08" fill="black"/>`;
    return parts;
  }},
  'ascii':  { w: 20, h: 1, fn: () => `<line x1="0" y1="0.5" x2="20" y2="0.5" stroke="black" stroke-width="0.1"/>` },
  'star':   { w: 19, h: 1, fn: () => {
    let parts = '';
    for (let i = 0; i < 20; i += 2) parts += `<text x="${i}" y="1" font-family="monospace" font-size="1" fill="black">*</text>`;
    return parts;
  }},
  'wavy':   { w: 20, h: 1, fn: () =>
    `<path d="M 0 0.5 Q 0.5 0 1 0.5 T 2 0.5 T 3 0.5 T 4 0.5 T 5 0.5 T 6 0.5 T 7 0.5 T 8 0.5 T 9 0.5 T 10 0.5 T 11 0.5 T 12 0.5 T 13 0.5 T 14 0.5 T 15 0.5 T 16 0.5 T 17 0.5 T 18 0.5 T 19 0.5 T 20 0.5" fill="none" stroke="black" stroke-width="0.1"/>` },
};

// =============================================================
// BUBBLE — empty containers
// =============================================================

const BUBBLE = {
  'cjk-bracket': { w: 4, h: 1, fn: () => `<text x="0" y="1" font-family="monospace" font-size="1" fill="black">「 」</text>` },
  'en-quote': { w: 3, h: 1, fn: () => `<text x="0" y="1" font-family="monospace" font-size="1" fill="black">" "</text>` },
  'rounded': { w: 12, h: 5, fn: () =>
    `<g fill="white" stroke="black" stroke-width="0.1">
      <path d="M 0.5 0.5 Q 0 0.5 0 1 L 0 3.5 Q 0 4 0.5 4 L 8 4 L 7.5 5 L 9 4 L 11.5 4 Q 12 4 12 3.5 L 12 1 Q 12 0.5 11.5 0.5 Z"/>
    </g>` },
  'thought': { w: 6, h: 6, fn: () =>
    `<g fill="white" stroke="black" stroke-width="0.1">
      <ellipse cx="3" cy="3" rx="2.7" ry="1.5"/>
      <ellipse cx="1.5" cy="5" rx="0.3" ry="0.3"/>
      <ellipse cx="0.7" cy="5.7" rx="0.15" ry="0.15"/>
    </g>` },
  'shout': { w: 9, h: 4, fn: () =>
    `<g fill="white" stroke="black" stroke-width="0.1">
      <polygon points="0.5,0.5 2,0 1.5,1.5 3,1 2.5,2.5 4,2 3.5,3.5 5,3 4.5,4 6,3.5 5.5,4.5 7,4 6.5,5 8,4.5 7.5,2 6,2.5 6.5,1 5,1.5 5.5,0 4,0.5 4.5,-0.5 3,0 3.5,-1 2,0 2.5,-1.5 1,0 1.5,-1 0,0.5"/>
    </g>` },
  'whisper': { w: 5, h: 1, fn: () =>
    `<g fill="none" stroke="black" stroke-width="0.1">
      <path d="M 0.5 0.5 Q 0 0.5 0 0.5 Q 0.5 0 0.5 0.5"/>
      <path d="M 4.5 0.5 Q 5 0.5 5 0.5 Q 4.5 0 4.5 0.5"/>
    </g>` },
};

// =============================================================
// WRITE ALL
// =============================================================

let count = 0;

function writeFile(category, name, content) {
  const dir = join(OUT, category);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.svg`), content, 'utf8');
  count++;
}

// Faces — kaomoji (as text)
for (const [name, f] of Object.entries(FACES)) {
  const safe = f.kaomoji.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const content = `<text x="0" y="1" font-family="monospace" font-size="1" fill="black">${safe}</text>`;
  writeFile('face', name, svgWrap(content, f.w, f.h));
}

// Faces — chibi (clean SVG primitives)
for (const mood of Object.keys(CHIBI)) {
  for (const dir of ['center', 'left', 'right']) {
    const name = `chibi-${mood}-${dir}`;
    writeFile('face', name, svgWrap(chibiSvgClean(mood, dir), 7, 3));
  }
}

// Body
for (const [name, b] of Object.entries(BODY)) {
  writeFile('body', name, svgWrap(bodySvg(b), b.w, b.h));
}

// Gesture
for (const [name, g] of Object.entries(GESTURE)) {
  writeFile('gesture', name, svgWrap(gestureSvg(g), g.w, g.h));
}

// Prop
for (const [name, p] of Object.entries(PROP)) {
  writeFile('prop', name, svgWrap(p.fn(), p.w, p.h));
}

// Scene
for (const [name, s] of Object.entries(SCENE)) {
  writeFile('scene', name, svgWrap(s.fn(), s.w, s.h));
}

// Frame
for (const [name, f] of Object.entries(FRAME)) {
  writeFile('frame', name, svgWrap(f.fn(), f.w, f.h));
}

// Separator
for (const [name, s] of Object.entries(SEPARATOR)) {
  writeFile('separator', name, svgWrap(s.fn(), s.w, s.h));
}

// Bubble
for (const [name, b] of Object.entries(BUBBLE)) {
  writeFile('bubble', name, svgWrap(b.fn(), b.w, b.h));
}

console.log(`wrote ${count} component SVGs to ${OUT}`);
