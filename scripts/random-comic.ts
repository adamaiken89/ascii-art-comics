#!/usr/bin/env bun
/**
 * random-comic.ts — Fortune-style random comic generator (Cowsay pattern).
 *
 * Picks a story structure (daily4 kishōtenketsu / manzai boke-tsukkomi), samples
 * one line per beat from the assets/lines banks, casts two characters with
 * beat-guided moods, and emits semantic content JSON. The line art is NEVER
 * generated here — the output is piped through the existing validated pipeline
 * (render-ascii-comic.py: compose → validate → repair → raster).
 *
 * Usage:
 *   bun scripts/random-comic.ts --seed 7 -o out/lucky [--structure daily4|manzai]
 *
 * Deterministic: the same seed produces byte-identical output.
 * Output: renders via the pipeline and prints its {ok, issues, files} summary.
 *   Pass --json-only to stop after writing content.json (no render).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// --- Seeded RNG (mulberry32) — reproducible comics ---
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Line {
  text: string;
  style: string;
  mood: string;
  other?: string;
}
interface LineBank {
  structure: string;
  names: string[];
  scenes: string[];
  fx: Record<string, string>;
  beats: Record<string, Line[]>;
}

const arg = (name: string, fallback?: string) => {
  for (const flag of [`--${name}`, `-${name}`]) {
    const i = process.argv.indexOf(flag);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  }
  return fallback;
};

const seed = Number(arg('seed', String((Date.now() % 100000) | 0)));
const rand = mulberry32(seed);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

// --- 1. Structure + line bank ---
const structures = ['daily4', 'manzai'];
const structure = arg('structure') ?? pick(structures);
const bank: LineBank = JSON.parse(readFileSync(join(ROOT, 'assets', 'lines', `${structure}.json`), 'utf8'));

// Beat order per structure
const beatOrder: string[] = structure === 'daily4'
  ? ['ki', 'sho', 'ten', 'ketsu']
  : ['boke1', 'tsukkomi1', 'boke2', 'tsukkomi2'];

// --- 2. Cast: two names; who speaks each beat comes from the bank ---
const nameA = pick(bank.names);
let nameB = pick(bank.names.filter((n) => n !== nameA));

// Sides: A left (faces right → chibi dir 'right'), B right (dir 'left')
const sideDir = { left: 'right', right: 'left' } as const;

// --- 3. Sample lines ---
const lines = beatOrder.map((beat) => ({ beat, line: pick(bank.beats[beat]) }));

// --- 4. Scene per panel (same scene for the whole strip = one location) ---
const sceneId = pick(bank.scenes).replace(/^park-like:/, '');

// --- 5. Compose semantic content JSON ---
const W = 36;
const H = 14;
const panels: any[] = [];
const dialogue: any[] = [];

lines.forEach(({ beat, line }, i) => {
  const speakerSide = i % 2 === 0 ? 'left' : 'right';
  const speakerDir = sideDir[speakerSide as 'left' | 'right'];
  const otherSide = speakerSide === 'left' ? 'right' : 'left';
  const otherDir = sideDir[otherSide as 'left' | 'right'];
  const speakerName = i % 2 === 0 ? nameA : nameB;
  const otherName = speakerSide === 'left' ? nameB : nameA;

  const speakerId = `chibi-${line.mood}-${speakerDir}`;
  const otherMood = (line as any).other && bank.fx[(line as any).other] !== undefined || (line as any).other
    ? (line as any).other
    : 'neutral';
  const otherId = `chibi-${otherMood}-${otherDir}`;

  const content: any[] = [
    { type: 'component', id: speakerId, side: speakerSide },
  ];
  if (structure === 'daily4' && i === 0) {
    // Solo opener: only the speaker, scene behind them
    content.length = 0;
    content.push({ type: 'component', id: speakerId, side: 'center' });
  } else {
    content.push({ type: 'component', id: otherId, side: otherSide });
  }
  const fxId = bank.fx[line.mood];
  if (fxId) {
    // fx at head height, one column beside the speaker's head box
    const fxX = speakerSide === 'left' ? 9 : W - 11;
    content.push({ type: 'component', id: fxId, x: fxX, y: 4 });
  }
  if (structure === 'manzai' && beat === 'tsukkomi2') {
    // escalate: retort panel keeps both, plus a prop on the floor
    content.push({ type: 'component', id: pick(['table', 'cat', 'laptop']), x: 15, y: 'floor' });
  }

  panels.push({
    panelId: i,
    width: W,
    height: H,
    ground: true,
    layout: content.length > 1 ? 'two-shot' : undefined,
    content,
  });

  dialogue.push({
    panelId: i,
    text: line.text,
    align: speakerSide === 'left' ? 'left' : 'right',
    style: line.style,
    label: speakerName,
    speaker: { component: speakerId },
  });
});

// Scene: sprinkle the preset into the first and last panels only (calm backdrop)
for (const idx of [0, panels.length - 1]) {
  panels[idx].content.push({ type: 'component', id: `preset-${sceneId}`, x: 0, y: 0 });
}

const content = { title: `${nameA} & ${nameB}: ${structure}`, panels, dialogue };

// --- 6. Emit + run the validated pipeline ---
const outPrefix = arg('o', `out/random-${seed}`);
const jsonOnly = process.argv.includes('--json-only');
const contentPath = `${outPrefix}.content.json`;
mkdirSync(dirname(resolve(contentPath)), { recursive: true });
writeFileSync(contentPath, JSON.stringify(content, null, 2) + '\n');
console.error(`content: ${contentPath} (seed ${seed}, structure ${structure})`);

if (jsonOnly) {
  process.stdout.write(JSON.stringify({ content: contentPath }, null, 2) + '\n');
  process.exit(0);
}

const proc = Bun.spawnSync(['python3', join(ROOT, 'scripts', 'render-ascii-comic.py'), contentPath, '-o', outPrefix]);
process.stdout.write(proc.stdout.toString());
process.stderr.write(proc.stderr.toString());
process.exit(proc.exitCode ?? 0);
