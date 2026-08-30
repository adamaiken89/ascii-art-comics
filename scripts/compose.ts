#!/usr/bin/env bun
/**
 * compose.ts — Cell-space comic composer (the LLM never draws boxes).
 *
 * Input (semantic JSON, cell coordinates — 0,0 = first interior cell):
 *   {
 *     "title": "Monday Morning",
 *     "panels": [
 *       {
 *         "panelId": 0,
 *         "width": 40, "height": 12,          // cells INCLUDING border
 *         "border": "round" | "heavy" | "ascii",
 *         "content": [
 *           { "type": "component", "id": "chibi-happy-center", "x": 2, "y": 4 },
 *           { "type": "component", "id": "prop/coffee", "x": 12, "y": 5 },
 *           { "type": "text", "text": "Zzz", "x": 20, "y": 6 }
 *         ],
 *         "speaker": { "component": "chibi-happy-center", "anchor": "top" }
 *       }
 *     ],
 *     "dialogue": [
 *       { "panelId": 0, "text": "Monday again?", "align": "left", "style": "round" }
 *     ]
 *   }
 *
 * Output (stdout): { ok, issues, title, panels: [{panelId, width, height, ascii}] }
 * Issues: { type, panel, row, col, severity, expected, got, fix }
 *
 * Why borders can't be broken: the grid is a 2D array the composer fills —
 * every border cell is assigned programmatically, and serialization asserts
 * uniform cell width per row. Glyph widths come from lib/cellwidth.ts, the
 * same table the Python validator and rasterizer use.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cells, toCells, codepointWidth, type Cell } from './lib/cellwidth.ts';

// === Shared types ===

export type Severity = 'error' | 'warning';

export interface Issue {
  type: string;
  panel?: number | string;
  row?: number;
  col?: number;
  severity: Severity;
  expected: string;
  got: string;
  fix: string;
  /** identity of the offending content item (overlap repair) */
  item?: string;
  /** set when the issue came from validate-grid.py */
  validator?: boolean;
}

export type GridSlot =
  | { ch: string; w: number; bg?: true }
  | { cont: true }
  | null;

export interface ComponentItem {
  type: 'component';
  id: string;
  x?: number;
  y?: number | 'floor';
  /** two-shot sugar: place at panel edge, standing on the floor */
  side?: 'left' | 'right' | 'center';
}

export interface TextItem {
  type: 'text';
  text: string;
  x?: number;
  y?: number | 'floor';
}

export type ContentItem = ComponentItem | TextItem;

export interface Panel {
  panelId: number;
  width?: number;
  height?: number;
  border?: string;
  content?: ContentItem[];
  speaker?: { component: string; anchor?: string };
  /** draw a ▁ ground line across the interior floor */
  ground?: boolean;
  /** 'two-shot': ground on, characters placed from the edges on the floor */
  layout?: 'two-shot';
  /** characters for the two-shot layout (merged into content with side set) */
  cast?: { id: string; side?: 'left' | 'right' | 'center' }[];
}

export interface Dialogue {
  panelId: number;
  text: string;
  align?: 'left' | 'center' | 'right';
  style?: string;
  maxWidth?: number;
  /** speaker ref for THIS line (falls back to panel.speaker); the tail points here */
  speaker?: { component: string; anchor?: string };
  /** speaker name shown in the bubble's top border: ╭─ Mo ───╮ */
  label?: string;
}

export interface ComicInput {
  title?: string;
  panels?: Panel[];
  dialogue?: Dialogue[];
}

export interface ComposedPanel {
  panelId: number;
  width: number;
  height: number;
  ascii: string[];
}

export interface ComposeResult {
  ok: boolean;
  issues: Issue[];
  title: string | null;
  panels: ComposedPanel[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const BORDERS = {
  round: { tl: '╭', t: '─', tr: '╮', bl: '╰', b: '─', br: '╯', v: '│' },
  heavy: { tl: '┏', t: '━', tr: '┓', bl: '┗', b: '━', br: '┛', v: '┃' },
  ascii: { tl: '+', t: '-', tr: '+', bl: '+', br: '+', b: '-', v: '|' },
};
const BUBBLE_STYLE: Record<string, { tl: string; t: string; tr: string; bl: string; b: string; br: string; v: string }> = {
  round: { tl: '╭', t: '─', tr: '╮', bl: '╰', b: '─', br: '╯', v: '│' },
  shout: { tl: '┏', t: '━', tr: '┓', bl: '┗', b: '━', br: '┛', v: '┃' },
  // dashed border — quiet/aside speech
  whisper: { tl: '.', t: '┄', tr: '.', bl: '.', b: '┄', br: '.', v: '┆' },
};
// Thought bubbles: round borders but the tail is bubbles shrinking toward the
// speaker (o → ˙) instead of the solid ▼ pointer.
const THOUGHT_TAIL = ['o', '˙'];
const TAIL_DOWN = '▼'; // solid triangle — ∨ (logical OR) sits too small/high in the pinned font

// === Parametric chibi (cell-space) ===
// Faces use ONLY canonical ASCII kaomoji forms (the ^_^ / T_T / O_O family
// found in every kaomoji dictionary) — symmetric, instantly readable, and
// free of the geometric Unicode symbols that raster as abstract noise in the
// pinned font. Direction is expressed by shifting the face inside the box,
// never by changing eye glyphs.
const CHIBI_FACE: Record<string, string> = {
  happy: '^_^',
  sad: 'T_T',
  panic: 'O_O',
  angry: '>#<',
  smug: '¬_¬', // classic side-eye; ¬ is verified in the bundled font
  dead: 'x_x',
  thinking: '-_-',
  shocked: '0_0',
  neutral: '._.',
  excited: '*_*',
  confused: '?_?',
  sleepy: '-.-',
  love: '^3^',
  dizzy: '@_@',
  proud: '^o^',
  embarrassed: '^///^', // blush slashes — widest face; the box adapts
  suspicious: '<_<',
};

/**
 * Gaze metric: horizontal offset of the face inside the box interior
 * (interior width = w - 2). Left-facing → face at column 0; right-facing →
 * face flush right; center → centered. Pure + exported so tests can assert
 * gaze direction without rendering.
 */
export function faceOffset(faceW: number, w: number, dir: string): number {
  const inner = w - 2;
  if (dir === 'left') return 0;
  if (dir === 'right') return inner - faceW;
  return Math.max(0, Math.floor((inner - faceW) / 2));
}

/** Body poses: the arms row under the face box. Point flips with dir. */
const CHIBI_POSES: Record<string, string> = {
  basic: '╱│╲',
  up: '╲│╱',
  point: '─│╲', // mirrored to ╱│─ when dir === 'left'
};

/** Build a chibi: face box + simple body (arms / torso / legs), total 6 rows.
 *  Width derived from actual glyph cell widths, so a 2-cell mouth (﹏) widens
 *  the box instead of breaking it; the body centers under the box. */
function chibiLines(mood: string, dir: string, pose = 'basic'): string[] {
  const face = CHIBI_FACE[mood] ?? CHIBI_FACE.neutral;
  const faceW = cells(face);
  // Directional faces get two extra cells (one per side) so the box stays
  // odd-width: head, neck notch, and body share one exact center column.
  const w = faceW + 2 + (dir === 'center' ? 0 : 2);
  const xoff = faceOffset(faceW, w, dir);
  const faceRow = ' '.repeat(xoff) + face;
  const pad = '─'.repeat(w - 2);
  const cx = Math.floor((w - 1) / 2); // body center column (box center)
  const inner = w - 2;
  // Arms scale with the head (`╱│╲` narrow, `╱─│─╲` when there is room) so a
  // wide head doesn't overhang a skinny body.
  const armW = inner >= 5 ? 5 : 3;
  const half = (armW - 1) / 2;
  let arms = '╱' + '─'.repeat(half - 1) + '│' + '─'.repeat(half - 1) + '╲';
  // Point arm extends toward the gaze: dashes on the looked-at side.
  if (pose === 'point') arms = dir === 'left' ? '─'.repeat(armW - 2) + '│╲' : '╱│' + '─'.repeat(armW - 2);
  // Each body row is anchored so its center glyph (│ / ┴) sits exactly on cx:
  // symmetric arms have their │ at index `half`, point arms at index 1.
  const leadArms = ' '.repeat(Math.max(0, cx - (pose === 'point' ? 1 : half)));
  const leadLegs = ' '.repeat(Math.max(0, cx - 1));
  // ┴ in the legs row is the hip joint: it sits directly under the torso │.
  const body = [leadArms + arms, ' '.repeat(cx) + '│', leadLegs + '╱┴╲'];
  // Neck notch: ┬ in the box bottom connects the head to the torso.
  const padArr = pad.split('');
  padArr[Math.max(0, cx - 1)] = '┬';
  const fit = (row: string) => row + ' '.repeat(Math.max(0, w - cells(row)));
  const fitFace = (row: string) => row + ' '.repeat(Math.max(0, inner - cells(row)));
  return [`╭${pad}╮`, `│${fitFace(faceRow)}│`, `╰${padArr.join('')}╯`, ...body.map(fit)];
}

function loadJson(p: string): any | null {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

let FACES: any, ASCII_LIB: any;
function faces(): any {
  if (!FACES) FACES = loadJson(join(ROOT, 'assets', 'faces.json')) ?? { faces: {} };
  return FACES;
}
function asciiLib(): any {
  if (!ASCII_LIB) ASCII_LIB = loadJson(join(ROOT, 'assets', 'ascii-library.json')) ?? { components: {} };
  return ASCII_LIB;
}

/** Resolve id → { lines } (ASCII art rows) or { preset } or null. */
function resolveComponent(id: string): { lines: string[] } | { preset: any } | null {
  const lib = asciiLib().components;
  let m;
  if ((m = id.match(/^chibi[:\-](\w+?)(?:-(center|left|right))?(?:-(basic|up|point))?$/))) {
    return { lines: chibiLines(m[1], m[2] ?? 'center', m[3] ?? 'basic') };
  }
  if ((m = id.match(/^face[:\-](\w+)$/))) {
    const f = faces().faces[m[1]];
    if (!f) return null;
    return { lines: [f.glyph] };
  }
  if ((m = id.match(/^preset[:\-]([\w-]+)$/))) {
    const preset = asciiLib().scene_presets?.[m[1]];
    if (!preset) return null;
    return { preset };
  }
  // Library: "prop/coffee" or bare "coffee"
  if (lib[id]) return { lines: lib[id] };
  const found = Object.keys(lib).find((k) => k.endsWith('/' + id));
  if (found) return { lines: lib[found] };
  return null;
}

/** Expand grapheme rows into PER-COLUMN rows: a 2-cell glyph occupies its
 *  column plus a continuation slot, so column positions stay exact. */
function expandRows(rows: Cell[][]): GridSlot[][] {
  const w = Math.max(...rows.map((r) => r.reduce((n, c) => n + c.w, 0)));
  return rows.map((r) => {
    const out = [];
    for (const c of r) {
      out.push({ ch: c.ch, w: c.w });
      for (let k = 1; k < c.w; k++) out.push({ cont: true });
    }
    while (out.length < w) out.push({ ch: ' ', w: 1 });
    return out;
  });
}

function padCells(lines: string[]): GridSlot[][] {
  return expandRows(lines.map((l) => toCells(l)));
}

// === Grid ===
class Grid {
  w: number;
  h: number;
  g: GridSlot[][];
  // Interior origin: callers use interior coordinates (0,0 = first cell inside
  // the border); the offset maps them to grid cells so the border — drawn last
  // — can never overwrite content (this exact overwrite used to eat every
  // bubble's top border row).
  ox = 1;
  oy = 1;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.g = Array.from({ length: h }, () => Array(w).fill(null));
  }
  /** Stamp cells; returns collisions with pre-existing glyphs. */
  /** Background stamp (ground lines): no collision reporting, later stamps
   *  may overwrite it freely. */
  stampBg(x: number, y: number, cellsRows: GridSlot[][]): void {
    for (let r = 0; r < cellsRows.length; r++) {
      const row = cellsRows[r];
      for (let c = 0; c < row.length; c++) {
        const gx = this.ox + x + c, gy = this.oy + y + r;
        if (gx < 0 || gy < 0 || gx >= this.w || gy >= this.h) continue;
        this.g[gy][gx] = row[c].cont ? { cont: true } : { ...row[c], bg: true };
      }
    }
  }

  stamp(x: number, y: number, cellsRows: GridSlot[][]): { row: number; col: number; got: string }[] {
    const hits = [];
    for (let r = 0; r < cellsRows.length; r++) {
      const row = cellsRows[r];
      for (let c = 0; c < row.length; c++) {
        if (row[c].cont) continue;
        const gx = this.ox + x + c, gy = this.oy + y + r;
        if (gx < 0 || gy < 0 || gx >= this.w || gy >= this.h) continue;
        const cur = this.g[gy][gx];
        if (cur && !cur.cont && !cur.bg && cur.ch !== ' ') hits.push({ row: gy, col: gx, got: cur.ch });
      }
    }
    for (let r = 0; r < cellsRows.length; r++) {
      const row = cellsRows[r];
      for (let c = 0; c < row.length; c++) {
        const gx = this.ox + x + c, gy = this.oy + y + r;
        if (gx < 0 || gy < 0 || gx >= this.w || gy >= this.h) continue;
        this.g[gy][gx] = row[c].cont ? { cont: true } : { ...row[c] };
      }
    }
    return hits;
  }
  bounds(x: number, y: number, w: number, h: number): { fitsX: boolean; fitsY: boolean; needW: number; needH: number } {
    const iw = this.w - 2, ih = this.h - 2;
    return {
      fitsX: x >= 0 && x + w <= iw,
      fitsY: y >= 0 && y + h <= ih,
      needW: x + w, needH: y + h,
    };
  }
  serialize(): string[] {
    return this.g.map((row) =>
      row.map((slot) => (slot ? (slot.cont ? '' : slot.ch) : ' ')).join('')
    );
  }
}

function drawBorder(g: Grid, b: { tl: string; t: string; tr: string; bl: string; br: string; b: string; v: string }): void {
  const { w, h } = g;
  for (let c = 0; c < w; c++) {
    g.g[0][c] = { ch: c === 0 ? b.tl : c === w - 1 ? b.tr : b.t, w: 1 };
    g.g[h - 1][c] = { ch: c === 0 ? b.bl : c === w - 1 ? b.br : b.b, w: 1 };
  }
  for (let r = 1; r < h - 1; r++) {
    g.g[r][0] = { ch: b.v, w: 1 };
    g.g[r][w - 1] = { ch: b.v, w: 1 };
  }
}

/** Wrap text to max visible cells (word boundary; grapheme fallback). */
function wrapText(text: string, maxCells: number): Cell[][] {
  if (maxCells < 2) return [toCells(text)];
  const words = String(text).split(/(\s+)/);
  const lines = [];
  let cur = [];
  let curW = 0;
  const push = () => {
    if (cur.length) {
      lines.push(cur);
      cur = [];
      curW = 0;
    }
  };
  const width = (arr) => arr.reduce((n, c) => n + c.w, 0);
  for (const word of words) {
    const wCells = toCells(word);
    const wW = width(wCells);
    if (wW <= maxCells) {
      if (curW + wW <= maxCells) {
        cur.push(...wCells);
        curW += wW;
      } else {
        push();
        if (/^\s+$/.test(word)) continue;
        cur = wCells;
        curW = wW;
      }
    } else {
      push();
      let line = [];
      let lw = 0;
      for (const c of wCells) {
        if (lw + c.w > maxCells && lw > 0) {
          lines.push(line);
          line = [];
          lw = 0;
        }
        if (/^\s+$/.test(c.ch) && lw === 0) continue;
        line.push(c);
        lw += c.w;
      }
      cur = line;
      curW = lw;
    }
  }
  push();
  return lines.length ? lines : [[{ ch: ' ', w: 1 }]];
}

function buildBubbleCells(lines: Cell[][], style: { tl: string; t: string; tr: string; bl: string; br: string; b: string; v: string }, bw: number, label?: string): GridSlot[][] {
  // Speaker tag: ╭─ Mo ──────╮ — the label rides the top border so every
  // bubble names its owner.
  const inner = bw - 2;
  // The label may contain wide glyphs (碼農) — the row MUST go through
  // expandRows so each wide char gets its continuation column, like text rows.
  let topCells: Cell[];
  if (label) {
    const tag = ` ${label} `;
    const tagW = cells(tag);
    const dash = inner - tagW - 1; // one leading dash
    topCells = dash >= 0
      ? [{ ch: style.tl, w: 1 }, { ch: style.t, w: 1 }, ...toCells(tag),
          ...Array(dash).fill({ ch: style.t, w: 1 }), { ch: style.tr, w: 1 }]
      : [{ ch: style.tl, w: 1 }, ...Array(inner).fill({ ch: style.t, w: 1 }), { ch: style.tr, w: 1 }];
  } else {
    topCells = [{ ch: style.tl, w: 1 }, ...Array(inner).fill({ ch: style.t, w: 1 }), { ch: style.tr, w: 1 }];
  }
  const rows = [...expandRows([topCells])];
  for (const line of lines) {
    const pad = bw - 2 - line.reduce((n, c) => n + c.w, 0);
    rows.push(...expandRows([[{ ch: style.v, w: 1 }, ...line, ...Array(pad).fill({ ch: ' ', w: 1 }), { ch: style.v, w: 1 }]]));
  }
  rows.push([
    { ch: style.bl, w: 1 },
    ...Array(bw - 2).fill({ ch: style.b, w: 1 }),
    { ch: style.br, w: 1 },
  ]);
  return rows;
}

function composePanel(panel: Panel, dialogue: Dialogue[], issues: Issue[]): ComposedPanel {
  const pid = panel.panelId;
  const W = Math.max(6, panel.width ?? 32);
  const H = Math.max(5, panel.height ?? 10);
  const border = BORDERS[panel.border] ?? BORDERS.round;
  const g = new Grid(W, H);
  const Wi = W - 2, Hi = H - 2;
  const gc = (r, c) => ({ row: r + 1, col: c + 1 }); // 1-based, border-inclusive

  // --- Ground line + two-shot layout ---
  const twoShot = panel.layout === 'two-shot';
  if (panel.ground || twoShot) {
    // ▁ renders at the bottom of its cell → reads as a floor the characters
    // stand on. Stamped as background: components overwrite it without
    // triggering collision issues.
    g.stampBg(0, Hi - 1, [Array.from({ length: Wi }, () => ({ ch: '\u2581', w: 1, bg: true as const }))]);
  }
  const castItems: ContentItem[] = (panel.cast ?? []).map((c, i) => ({
    type: 'component' as const,
    id: c.id,
    side: c.side ?? (i === 0 ? 'left' : i === 1 ? 'right' : 'center'),
  }));

  // --- Components & text ---
  const placed = new Map(); // component id -> {x, y, w, h}
  for (const item of [...castItems, ...(panel.content ?? [])]) {
    if (item.type === 'text') {
      const cs = toCells(String(item.text ?? ''));
      const w = cs.reduce((n, c) => n + c.w, 0);
      const x = item.x ?? 0;
      const y = item.y === 'floor' ? Hi - 1 : (item.y ?? 0);
      const b = g.bounds(x, y, w, 1);
      if (!b.fitsX || !b.fitsY) {
        issues.push({
          type: 'text_overflow', panel: pid, row: y + 1, col: x + 1, severity: 'error',
          expected: `text of ${w} cells inside ${Wi}x${Hi} interior`,
          got: `needs ${b.needW}x${b.needH}`,
          fix: `grow panel to width ${Math.max(W, b.needW + 2)} / height ${Math.max(H, b.needH + 2)} or shorten text`,
        });
        continue;
      }
      const hits = g.stamp(x, y, expandRows([cs]));
      if (hits.length) {
        issues.push({ type: 'component_overlap', panel: pid, ...gc(hits[0].row, hits[0].col), severity: 'error', expected: 'empty cell', got: hits[0].got, fix: 'move the text item', item: `text:${item.text}` });
      }
    } else if (item.type === 'component') {
      const res = resolveComponent(item.id);
      if (!res) {
        issues.push({
          type: 'unknown_component', panel: pid, row: (item.y ?? 0) + 1, col: (item.x ?? 0) + 1,
          severity: 'error', expected: 'resolvable component id', got: item.id,
          fix: 'use chibi-<mood>-<dir>, face-<mood>, a library id from assets/ascii-library.json, or preset-<name>',
        });
        continue;
      }
      if (res.preset) {
        for (const member of res.preset) {
          const mres = resolveComponent(member.id);
          if (!mres) continue;
          const mp = padCells(mres.lines);
          const mw = mp[0].length, mh = mp.length;
          const anchor = member.x ?? 'center-top';
          const mx = anchor.startsWith('left') ? 0 : anchor.startsWith('right') ? Wi - mw : Math.max(0, Math.floor((Wi - mw) / 2));
          const my = anchor.endsWith('top') ? 0 : Hi - mh;
          const b = g.bounds(mx, my, mw, mh);
          if (!b.fitsX || !b.fitsY) {
            issues.push({ type: 'component_out_of_bounds', panel: pid, row: my + 1, col: mx + 1, severity: 'warning', expected: `${member.id} (${mw}x${mh}) inside ${Wi}x${Hi}`, got: `needs ${b.needW}x${b.needH}`, fix: 'grow panel' });
            continue;
          }
          // Scene presets are BACKDROPS: stamped as background, they never
          // collide with bubbles/characters (a window behind a bubble is
          // normal staging) and can be overwritten freely.
          g.stampBg(mx, my, mp);
        }
        continue;
      }
      const rows = padCells(res.lines);
      const cw = rows[0].length, chh = rows.length;
      let x: number, y: number;
      if (item.side) {
        x = item.side === 'right' ? Wi - 1 - cw
          : item.side === 'center' ? Math.max(0, Math.floor((Wi - cw) / 2))
          : 1;
        y = Hi - chh; // standing on the floor
      } else {
        x = item.x ?? 0;
        y = item.y === 'floor' ? Hi - chh : (item.y ?? 0);
      }
      const b = g.bounds(x, y, cw, chh);
      if (!b.fitsX || !b.fitsY) {
        issues.push({
          type: 'component_out_of_bounds', panel: pid, row: y + 1, col: x + 1, severity: 'error',
          expected: `${item.id} (${cw}x${chh}) inside ${Wi}x${Hi} interior`,
          got: `needs ${b.needW}x${b.needH}`,
          fix: `grow panel to width ${Math.max(W, b.needW + 2)} / height ${Math.max(H, b.needH + 2)}`,
        });
        continue;
      }
      const hits = g.stamp(x, y, rows);
      if (hits.length) {
        issues.push({
          type: 'component_overlap', panel: pid, ...gc(hits[0].row, hits[0].col), severity: 'error',
          expected: 'empty cell', got: hits[0].got,
          fix: `move ${item.id} (placed at ${x},${y}, size ${cw}x${chh}) or grow the panel`,
          item: item.id,
        });
      }
      placed.set(item.id, { x, y, w: cw, h: chh });
    } else if (item.type) {
      issues.push({ type: 'unknown_item_type', panel: pid, row: (item.y ?? 0) + 1, col: (item.x ?? 0) + 1, severity: 'error', expected: '"component"|"text"', got: item.type, fix: 'use type "component" or "text"' });
    }
  }

  // --- Bubbles (top of interior, stacked) ---
  // Voice-style consistency: each SPEAKER keeps one spoken style across the
  // story (round/shout/whisper; thought is exempt — inner monologue, same
  // border family). Warns when a character's own lines mix spoken styles.
  const stylesByLabel = new Map<string, Set<string>>();
  for (const d of dialogue) {
    if ((d.style ?? 'round') === 'thought') continue;
    const who = d.label ?? `panel:${d.panelId}`;
    if (!stylesByLabel.has(who)) stylesByLabel.set(who, new Set());
    stylesByLabel.get(who)!.add(d.style ?? 'round');
  }
  for (const [who, styles] of stylesByLabel) {
    if (styles.size > 1 && !composeWarned) {
      composeWarned = true;
      issues.push({
        type: 'style_inconsistent', severity: 'warning',
        expected: `one spoken bubble style for "${who}"`,
        got: [...styles].sort().join(' + '),
        fix: 'keep the same style for all of a character’s spoken lines; vary mood instead',
      });
    }
  }
  const panelDialogue = dialogue.filter((d) => d.panelId === pid);
  let bubbleY = 0;
  for (const d of panelDialogue) {
    const style = BUBBLE_STYLE[d.style] ?? BUBBLE_STYLE.round;
    const maxTextW = Math.max(4, Math.min(Wi - 4, d.maxWidth ?? Wi - 4));
    const lines = wrapText(String(d.text ?? ''), maxTextW);
    const textW = Math.max(...lines.map((l) => l.reduce((n, c) => n + c.w, 0)));
    // The bubble is as wide as the text or the speaker tag, whichever wins.
    const label = d.label;
    const labelW = label ? cells(` ${label} `) + 3 : 0; // tl + tag + tr + dash
    const bw = Math.max(textW + 2, labelW);
    const bh = lines.length + 2;
    const totalH = bh + 1; // tail row
    const x = d.align === 'right' ? Math.max(0, Wi - bw - 1)
      : d.align === 'center' ? Math.max(0, Math.floor((Wi - bw) / 2))
      : Math.min(1, Wi - bw);

    let tailCol = null;
    const sp = d.speaker ?? panel.speaker; // per-line speaker wins
    if (sp?.component && placed.has(sp.component)) {
      const p = placed.get(sp.component);
      tailCol = p.x + Math.floor(p.w / 2);
      const clamped = Math.max(x + 1, Math.min(x + bw - 2, tailCol));
      if (clamped !== tailCol) {
        issues.push({ type: 'tail_truncated', panel: pid, row: bubbleY + bh + 1, col: clamped + 1, severity: 'warning', expected: `tail at speaker col ${tailCol + 1}`, got: `clamped to ${clamped + 1}`, fix: 'move the speaker toward the bubble or change dialogue align' });
        tailCol = clamped;
      }
    }

    const b = g.bounds(x, bubbleY, bw, totalH);
    if (!b.fitsX || !b.fitsY) {
      issues.push({
        type: 'bubble_overflow', panel: pid, row: bubbleY + 1, col: x + 1, severity: 'error',
        expected: `bubble ${bw}x${totalH} inside ${Wi}x${Hi} interior`,
        got: `needs ${b.needW}x${b.needH}`,
        fix: `grow panel to width ${Math.max(W, b.needW + 2)} / height ${Math.max(H, b.needH + 2)} or split the dialogue`,
      });
      bubbleY += totalH;
      continue;
    }
    const hits = g.stamp(x, bubbleY, buildBubbleCells(lines, style, bw, label));
    if (hits.length) {
      issues.push({ type: 'bubble_overlap', panel: pid, ...gc(hits[0].row, hits[0].col), severity: 'error', expected: 'empty cell', got: hits[0].got, fix: 'grow panel height so content clears the bubble area' });
    }
    if (tailCol !== null && bubbleY + bh < Hi) {
      const tailRow = bubbleY + bh;
      const speaker = sp?.component ? placed.get(sp.component) : undefined;
      // Proportional tail: │ connector rows from the bubble down to just
      // above the speaker, ▼ tip at the end. No room (speaker adjacent to or
      // overlapping the tail row) means no tail — never overwrite the speaker.
      const isThought = (d.style ?? 'round') === 'thought';
      if (isThought) {
        // bubble chain o → ˙ toward the speaker
        g.stamp(tailCol, tailRow, [[{ ch: THOUGHT_TAIL[0], w: 1 }]]);
        if (tailRow + 1 < Hi && (!speaker || speaker.y > tailRow + 1)) {
          g.stamp(tailCol, tailRow + 1, [[{ ch: THOUGHT_TAIL[1], w: 1 }]]);
        }
      } else if (speaker && speaker.y > tailRow) {
        const tipRow = Math.min(speaker.y - 1, Hi - 1);
        for (let r = tailRow; r < tipRow; r++) {
          g.stamp(tailCol, r, [[{ ch: '│', w: 1 }]]);
        }
        g.stamp(tailCol, tipRow, [[{ ch: TAIL_DOWN, w: 1 }]]);
      } else if (!speaker) {
        g.stamp(tailCol, tailRow, [[{ ch: TAIL_DOWN, w: 1 }]]);
      }
    }
    bubbleY += totalH;
  }

  // --- Border last: the composer owns it, it cannot be missed ---
  drawBorder(g, border);
  const ascii = g.serialize();
  for (let r = 0; r < ascii.length; r++) {
    if (cells(ascii[r]) !== W) {
      issues.push({ type: 'internal_width_mismatch', panel: pid, row: r + 1, severity: 'error', expected: W, got: cells(ascii[r]), fix: 'report as a bug' });
    }
  }
  return { panelId: pid, width: W, height: H, ascii };
}

let composeWarned = false;

function compose(input: ComicInput): ComposeResult {
  composeWarned = false;
  const issues = [];
  const panels = input.panels ?? [];
  if (panels.length === 0) {
    return {
      ok: false,
      issues: [{ type: 'no_panels', severity: 'error', expected: '>=1 panel', got: 0, fix: 'add panels' }],
      title: input.title ?? null,
      panels: [],
    };
  }
  const out = panels.map((p) => composePanel(p, input.dialogue ?? [], issues));
  return { ok: !issues.some((i) => i.severity === 'error'), issues, title: input.title ?? null, panels: out };
}

function main(): void {
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => !a.startsWith('-'));
  const txtIdx = args.indexOf('--txt');
  let input;
  try {
    if (fileArg) input = JSON.parse(readFileSync(fileArg, 'utf8'));
    else {
      const raw = readFileSync(0, 'utf8');
      input = raw.trim() ? JSON.parse(raw) : null;
    }
  } catch (e) {
    console.error('compose: failed to read input:', e.message);
    process.exit(2);
  }
  if (!input) {
    console.error('compose: empty input (pass file arg or pipe JSON to stdin)');
    process.exit(2);
  }
  const result = compose(input);
  if (txtIdx >= 0 && args[txtIdx + 1]) {
    const parts = [];
    if (result.title) parts.push(result.title, '');
    for (const p of result.panels) parts.push(...p.ascii, '');
    writeFileSync(args[txtIdx + 1], parts.join('\n'), 'utf8');
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (import.meta.main) main();
