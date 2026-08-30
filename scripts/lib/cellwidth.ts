/**
 * cellwidth.ts — The single source of truth for visible cell widths.
 *
 * Rule (identical in validate-grid.py and raster-cells.py):
 *   width(codepoint) = 2 if East Asian Width ∈ {W, F} else 1
 *   (ambiguous → narrow), applied per codepoint and summed.
 *
 * The W/F ranges table is GENERATED from Python's unicodedata (the same
 * authority the Python side reads), so JS and Python can never disagree —
 * which is exactly what broke the right border of boxes in the legacy
 * pipeline (string-width counted ambiguous glyphs like ♥ differently).
 */

import { EAW_WIDE_RANGES } from './eaw-ranges.ts';

function codepointWide(cp: number): boolean {
  let lo = 0, hi = EAW_WIDE_RANGES.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [a, b] = EAW_WIDE_RANGES[mid];
    if (cp < a) hi = mid - 1;
    else if (cp > b) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Visible cell width of a single codepoint. */
export function codepointWidth(ch: string): number {
  const cp = ch.codePointAt(0);
  return codepointWide(cp ?? 0) ? 2 : 1;
}

/** Split a string into codepoints (not graphemes — Python parity matters
 *  more than typographic clustering; emoji are forbidden by the validator). */
export function chars(s: string): string[] {
  return Array.from(String(s));
}

/** Total visible cell width of a string (sum over codepoints). */
export function cells(s: string): number {
  let n = 0;
  for (const ch of chars(s)) n += codepointWidth(ch);
  return n;
}

/** One entry per codepoint with its pinned cell width — the unit the
 *  composer places on the grid and the rasterizer draws. */
export interface Cell {
  ch: string;
  w: number;
}

export function toCells(s: string): Cell[] {
  return chars(s).map((ch) => ({ ch, w: codepointWidth(ch) }));
}
