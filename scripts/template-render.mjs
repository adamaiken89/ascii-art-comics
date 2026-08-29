#!/usr/bin/env node
/**
 * template-render.mjs — Render a comic from a template + content JSON.
 *
 * Usage:
 *   node scripts/template-render.mjs <content.json> [<output.svg>]
 *   echo '<content.json>' | node scripts/template-render.mjs
 *
 * Inputs:
 *   - Template: assets/templates/<name>.json  (panel grid, bubble slots, character slots)
 *   - Content: { template, title?, panels: { <id>: { text, face, dir, ... } } }
 *
 * Output: SVG string on stdout (or file).
 *
 * Hand-designed layout — LLM only fills in text/face/dir, never computes geometry.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TEMPLATES_DIR = join(ROOT, 'assets', 'templates');

const DEFAULT_FONT = "'Courier New', Consolas, monospace";
const BUBBLE_FONT_SIZE = 14;
const BUBBLE_PAD = 8;
const BUBBLE_RADIUS = 8;
const BUBBLE_TAIL = 12;

const BORDERS = {
  A: { tl: '╔', t: '═', tr: '╗', bl: '╚', br: '╝', v: '║', h: '═' },
  B: { tl: '┌', t: '─', tr: '┐', bl: '└', br: '┘', v: '│', h: '─' },
  C: { tl: '+', t: '-', tr: '+', bl: '+', br: '+', v: '|', h: '-' },
};

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/* === Parametric chibi (port from comic-render.mjs) === */
function chibiSvg(mood, dir) {
  const EYE = {
    happy: ['◕', '◕'], sad: ['╥', '╥'], panic: ['⊙', '⊙'], angry: ['╬', '╬'],
    smug: ['◑', '◑'], dead: ['×', '×'], thinking: ['◐', '◐'], shocked: ['◎', '◎'],
    neutral: ['•', '•'],
  }[mood] ?? ['•', '•'];
  const MOUTH = {
    happy: '‿', sad: '﹏', panic: '○', angry: '︵',
    smug: '‿', dead: '_', thinking: '~', shocked: '○', neutral: '_',
  }[mood] ?? '_';
  const CLOSED = {
    happy: '◡', sad: '─', panic: '─', angry: '─',
    smug: '◡', dead: '─', thinking: '─', shocked: '─', neutral: '─',
  }[mood] ?? '─';
  let left, right;
  if (dir === 'left') { left = EYE[0]; right = CLOSED; }
  else if (dir === 'right') { left = CLOSED; right = EYE[1]; }
  else { left = EYE[0]; right = EYE[1]; }
  return [
    '<rect x="0" y="0" width="7" height="3" fill="none" stroke="#333" stroke-width="0.1"/>',
    `<text x="2" y="1.4" font-family="${DEFAULT_FONT}" font-size="1.2" text-anchor="middle" fill="#222">${escapeXml(left)}</text>`,
    `<text x="5" y="1.4" font-family="${DEFAULT_FONT}" font-size="1.2" text-anchor="middle" fill="#222">${escapeXml(right)}</text>`,
    `<text x="3.5" y="2.5" font-family="${DEFAULT_FONT}" font-size="1" text-anchor="middle" fill="#222">${escapeXml(MOUTH)}</text>`,
  ].join('');
}

/* === Text wrap (CJK + EN safe via simple word split) === */
function wrapText(text, maxChars) {
  if (maxChars <= 0) return [text];
  const words = String(text).split(/(\s+)/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + w).length <= maxChars) {
      cur += w;
    } else if (cur.trim()) {
      lines.push(cur.trimEnd());
      cur = w.trimStart();
    } else {
      // word itself too long: hard-break at maxChars
      for (let i = 0; i < w.length; i += maxChars) {
        lines.push(w.slice(i, i + maxChars));
      }
      cur = '';
    }
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  return lines.length ? lines : [''];
}

/* === Load template === */
function loadTemplate(name) {
  const path = join(TEMPLATES_DIR, `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

/* === Compute grid layout === */
function layoutPanels(template) {
  const { panelW, panelH, gutter, padding, layout } = template;
  const cols = layout.includes('2x2') ? 2 : layout.includes('1x2') ? 2 : layout.includes('3x1') ? 1 : 1;
  const rows = layout.includes('2x2') ? 2 : layout.includes('3x1') ? 3 : layout.includes('1x2') ? 1 : 1;
  const rtl = layout.endsWith('-rtl');
  const positions = new Map();
  for (const p of template.panels) {
    const c = rtl ? (cols - 1 - p.col) : p.col;
    positions.set(p.id, {
      x: padding + c * (panelW + gutter),
      y: padding + p.row * (panelH + gutter),
      w: panelW,
      h: panelH,
    });
  }
  const totalW = padding * 2 + cols * panelW + (cols - 1) * gutter;
  const totalH = padding * 2 + rows * panelH + (rows - 1) * gutter;
  return { positions, totalW, totalH };
}

/* === Render a bubble === */
function renderBubble(b, panel, tailTarget) {
  const { x, y, w, h, tail } = b;
  const cx = x + w / 2;
  const lineH = BUBBLE_FONT_SIZE + 4;
  const lines = wrapText(b.text ?? '', Math.max(4, Math.floor((w - BUBBLE_PAD * 2) / 8)));
  const actualH = Math.max(h, lines.length * lineH + BUBBLE_PAD * 2);
  const parts = [];
  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${actualH}" rx="${BUBBLE_RADIUS}" ry="${BUBBLE_RADIUS}" fill="#fffbe6" stroke="#333" stroke-width="1.5"/>`);
  if (tail) {
    const s = tail.size ?? BUBBLE_TAIL;
    const ax = tailTarget?.x ?? (x + w / 2);
    const ay = tailTarget?.y ?? (y + actualH + s);
    const atBottom = (tail.side ?? 'bottom').startsWith('bottom');
    const ty1 = atBottom ? y + actualH : y;
    const ty2 = ty1;
    const tip = atBottom ? ay : ay;
    const tipX = Math.max(x + s, Math.min(x + w - s, ax));
    const tipY = atBottom ? Math.max(y + actualH + s, tip) : Math.min(y - s, tip);
    const baseX1 = tipX - s / 2;
    const baseX2 = tipX + s / 2;
    parts.push(`<polygon points="${baseX1},${ty1} ${baseX2},${ty2} ${tipX},${tipY}" fill="#fffbe6" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>`);
  }
  const tspans = lines.map((ln, i) =>
    `<tspan x="${cx}" dy="${i === 0 ? 0 : lineH}">${escapeXml(ln)}</tspan>`
  ).join('');
  parts.push(`<text x="${cx}" y="${y + BUBBLE_PAD + BUBBLE_FONT_SIZE - 2}" font-family="${DEFAULT_FONT}" font-size="${BUBBLE_FONT_SIZE}" text-anchor="middle" fill="#222">${tspans}</text>`);
  return parts.join('\n');
}

/* === Render one panel === */
function renderPanel(panel, tplPanel, content, b) {
  const out = [`<rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}" fill="#fafafa" stroke="#333" stroke-width="1.5"/>`];
  // Chibi
  const face = content?.face ?? tplPanel.character?.face ?? 'neutral';
  const dir = content?.dir ?? tplPanel.character?.dir ?? 'center';
  const scale = tplPanel.character?.scale ?? 16;
  const cx = tplPanel.character?.x ?? (panel.w - 7 * scale) / 2;
  const cy = tplPanel.character?.y ?? (panel.h - 3 * scale) / 2;
  out.push(`<g transform="translate(${panel.x + cx},${panel.y + cy}) scale(${scale})">${chibiSvg(face, dir)}</g>`);
  // Bubble (top of panel by default)
  if (content?.text) {
    const bAbs = {
      x: panel.x + tplPanel.bubble.x,
      y: panel.y + tplPanel.bubble.y,
      w: tplPanel.bubble.w,
      h: tplPanel.bubble.h,
      text: content.text,
      tail: tplPanel.bubble.tail,
    };
    const tailTarget = { x: panel.x + cx + 3.5 * scale, y: panel.y + cy + 3 * scale };
    out.push(renderBubble(bAbs, panel, tailTarget));
  }
  return out.join('\n');
}

/* === Main === */
function main() {
  let input;
  const fileArg = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : null;
  if (fileArg) {
    input = JSON.parse(readFileSync(fileArg, 'utf8'));
  } else {
    try {
      const raw = readFileSync(0, 'utf8');
      if (raw.trim()) input = JSON.parse(raw);
    } catch (e) {
      console.error('template-render: stdin read failed:', e.message);
      process.exit(2);
    }
  }
  if (!input) {
    console.error('template-render: empty input (pass file arg or pipe JSON to stdin)');
    process.exit(2);
  }
  const tpl = loadTemplate(input.template);
  const { positions, totalW, totalH } = layoutPanels(tpl);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">`,
    `<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="white"/>`,
    `<style>text { font-family: ${DEFAULT_FONT}; font-variant-numeric: tabular-nums; }</style>`,
  ];
  if (input.title) {
    parts.push(`<text x="${totalW / 2}" y="22" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle" fill="#222">${escapeXml(input.title)}</text>`);
  }
  for (const tp of tpl.panels) {
    const pos = positions.get(tp.id);
    const content = input.panels?.[tp.id] ?? {};
    parts.push(renderPanel(pos, tp, content, BORDERS[tpl.border ?? 'A']));
  }
  // Extras (splash: additional bubbles outside main flow)
  for (const tp of tpl.panels) {
    for (const ex of tp.extras ?? []) {
      const pos = positions.get(tp.id);
      if (!pos) continue;
      const eAbs = { ...ex.bubble, x: pos.x + ex.bubble.x, y: pos.y + ex.bubble.y, text: input.extras?.[ex.id]?.text ?? '' };
      if (eAbs.text) parts.push(renderBubble(eAbs, pos, null));
    }
  }
  parts.push('</svg>');
  const svg = parts.join('\n');
  const outArg = process.argv[3];
  if (outArg) {
    writeFileSync(outArg, svg, 'utf8');
    console.error(`wrote ${outArg} (${totalW}x${totalH})`);
  } else {
    process.stdout.write(svg + '\n');
  }
}

main();
