#!/usr/bin/env node
/**
 * bubble-render.mjs — Render speech bubbles as SVG primitives.
 *
 * A bubble is a rounded rectangle with a triangular tail pointing at the
 * speaker. Pure path geometry — no string-width math, no LLM interpretation.
 *
 * Input (stdin or request.json):
 *   {
 *     "bubbles": [
 *       {
 *         "x": 100, "y": 50,        // top-left in SVG units (px)
 *         "w": 200, "h": 60,         // bubble body size
 *         "text": "「today 星期二」",
 *         "fontSize": 14,
 *         "tail": { "side": "bottom-left", "size": 12 }
 *       }
 *     ],
 *     "cell": { "w": 8, "h": 16 }    // used for lineHeight if no fontSize
 *   }
 *
 * Output (stdout):
 *   { "svg": "<g>...</g>", "ok": true }
 *
 * Bubble shape:
 *   ┌──────────────┐
 *   │  「text」    │  <- rounded rect
 *   └──┐       ┌──┘
 *      ▼          <- tail (polygon)
 *   speaker
 *
 * The tail is a small triangle attached to one side, pointing outward.
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

/** Compute tail polygon points based on side + size. */
function tailPoints(bubble, tail) {
  const { x, y, w, h } = bubble;
  const s = tail.size ?? 10;
  switch (tail.side) {
    case 'bottom-left':
      return [
        [x + w * 0.2, y + h],
        [x + w * 0.2 + s, y + h],
        [x + w * 0.15, y + h + s],
      ];
    case 'bottom-center':
      return [
        [x + w * 0.45, y + h],
        [x + w * 0.55, y + h],
        [x + w * 0.5, y + h + s],
      ];
    case 'bottom-right':
      return [
        [x + w * 0.8, y + h],
        [x + w * 0.8 - s, y + h],
        [x + w * 0.85, y + h + s],
      ];
    case 'top-left':
      return [
        [x + w * 0.2, y],
        [x + w * 0.2 + s, y],
        [x + w * 0.15, y - s],
      ];
    case 'top-right':
      return [
        [x + w * 0.8, y],
        [x + w * 0.8 - s, y],
        [x + w * 0.85, y - s],
      ];
    case 'left':
      return [
        [x, y + h * 0.4],
        [x, y + h * 0.6],
        [x - s, y + h * 0.5],
      ];
    case 'right':
      return [
        [x + w, y + h * 0.4],
        [x + w, y + h * 0.6],
        [x + w + s, y + h * 0.5],
      ];
    default:
      return null;
  }
}

function renderBubble(b) {
  const { x, y, w, h, text, fontSize, tail, fill, stroke, radius } = b;
  const fs = fontSize ?? 14;
  const f = fill ?? '#fffbe6';
  const s = stroke ?? '#333';
  const r = radius ?? 8;
  const parts = [];

  // Body (rounded rect)
  parts.push(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" ` +
    `fill="${f}" stroke="${s}" stroke-width="1.5"/>`
  );

  // Tail (if specified)
  if (tail) {
    const pts = tailPoints(b, tail);
    if (pts) {
      const ptStr = pts.map((p) => p.join(',')).join(' ');
      parts.push(
        `<polygon points="${ptStr}" fill="${f}" stroke="${s}" stroke-width="1.5" ` +
        `stroke-linejoin="round"/>`
      );
    }
  }

  // Text (centered, monospace)
  const cx = x + w / 2;
  const cy = y + h / 2 + fs / 3; // vertical center approx
  parts.push(
    `<text x="${cx}" y="${cy}" font-family="monospace" font-size="${fs}" ` +
    `text-anchor="middle" fill="#222">${escapeXml(text)}</text>`
  );

  return parts.join('\n');
}

function main() {
  let input;
  try {
    const raw = readFileSync(0, 'utf8');
    if (raw.trim()) input = JSON.parse(raw);
  } catch (e) {
    console.error('bubble-render: failed to read stdin:', e.message);
    process.exit(2);
  }
  if (!input) {
    try {
      input = JSON.parse(readFileSync('request.json', 'utf8'));
    } catch (e) {
      console.error('bubble-render: no stdin and no request.json:', e.message);
      process.exit(2);
    }
  }

  const bubbles = input.bubbles ?? [];
  if (bubbles.length === 0) {
    console.error('bubble-render: no bubbles in input');
    process.exit(2);
  }

  const xml = bubbles.map(renderBubble).join('\n');
  const ok = bubbles.every((b) => b.x != null && b.y != null && b.w > 0 && b.h > 0 && b.text);

  process.stdout.write(
    JSON.stringify({ svg: `<g>${xml}</g>`, ok }, null, 2) + '\n'
  );
  if (!ok) process.exitCode = 1;
}

main();
