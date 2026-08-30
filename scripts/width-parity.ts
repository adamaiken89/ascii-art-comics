/**
 * width-parity.ts — Verifies the JS width table (lib/cellwidth.ts, generated
 * from Python unicodedata) agrees with Python's unicodedata for a sample of
 * glyphs actually used by the vocabulary. This is the guard against the
 * legacy right-border bug (composer and validator disagreeing about widths).
 *
 * Exit 0 = parity, 1 = mismatch (prints the offending codepoints).
 */

import { cells } from './lib/cellwidth.ts';

const SAMPLES = ['◕', '‿', '﹏', '╥', '─', '│', '╭', '♥', '死', 'A', '~', '∨', '★', '︵', '(ツ)'];

function pyWidths(samples: string[]): Promise<number[]> {
  const { execFile } = require('child_process');
  return new Promise((resolve, reject) => {
    execFile(
      'python3',
      ['-c', 'import sys,unicodedata; print(" ".join(str(sum(2 if unicodedata.east_asian_width(c) in ("W","F") else 1 for c in s)) for s in sys.argv[1:]))', ...samples],
      (err: Error | null, stdout: string) => (err ? reject(err) : resolve(stdout.trim().split(/\s+/).map(Number))),
    );
  });
}

const py = await pyWidths(SAMPLES);
let bad = 0;
for (let i = 0; i < SAMPLES.length; i++) {
  const js = cells(SAMPLES[i]);
  if (js !== py[i]) {
    console.error(`MISMATCH ${JSON.stringify(SAMPLES[i])}: js=${js} py=${py[i]}`);
    bad++;
  }
}
if (bad > 0) {
  console.error(`width-table parity FAILED (${bad} mismatches) — regenerate scripts/lib/eaw-ranges.ts from unicodedata`);
  process.exit(1);
}
console.log('width-table parity OK');
