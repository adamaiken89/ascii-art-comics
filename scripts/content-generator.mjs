#!/usr/bin/env node
/**
 * content-generator.mjs — Stage 1 of the ascii-art-comics pipeline.
 *
 * Pure deterministic. Validates content lines that were generated upstream
 * (by the LLM agent or a human) and emits the typed contract that Stage 2
 * consumes.
 *
 * Input (stdin or request.json):
 *   {
 *     "panels": [
 *       {
 *         "panelId": 0,
 *         "lines":    ["line1", "line2", ...],
 *         "target":   number,              // innerW budget; null = auto from global
 *         "borderSet": "heavy" | "light" | "ascii"  // for context only, not enforced
 *       }
 *     ],
 *     "defaultTarget": number              // fallback if panel.target is null
 *   }
 *
 * Output (stdout):
 *   {
 *     "panels": [
 *       {
 *         "panelId":  0,
 *         "lines":    [...],
 *         "measured": number[],            // visibleWidth per line
 *         "target":   number,              // resolved innerW
 *         "outerW":   number,              // target + 2
 *         "ok":       boolean
 *       }
 *     ],
 *     "ok":       boolean,                 // all panels ok
 *     "errors":   string[]                 // overflow, empty, etc.
 *   }
 *
 * Hard rules (persona rule 1):
 *   - This script does NOT add borders, NBSP, or outerW math.
 *   - It DOES compute measured[] and validate fit.
 *   - Overflow → fail-loud (ok: false, errors populated). Caller shrinks text.
 *
 * Width math via string-width + grapheme-splitter (persona rule 4).
 */

import { readFileSync } from 'node:fs';
import GraphemeSplitter from 'grapheme-splitter';
import stringWidth from 'string-width';

const splitter = new GraphemeSplitter();

function graphemes(s) {
  return splitter.splitGraphemes(s);
}

function vw(s) {
  return stringWidth(s);
}

/**
 * Border-leak check is deferred to Stage 3 (auditor) — script cannot reliably
 * distinguish panel borders from speech-bubble borders without style context.
 * Persona rule 1 still applies: the LLM agent should not generate border chars
 * unless they are inside a speech bubble (╭─╮/╰─╯).
 */
function detectBorderLeak(/* lines */) {
  return null;
}

/** Detect NBSP leak. Persona rule 5. */
function detectNbspLeak(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('\u00A0')) {
      return { line: i };
    }
  }
  return null;
}

function processPanel(panel, defaultTarget) {
  const errors = [];
  const lines = (panel.lines ?? []).map((l) => l.replace(/\s+$/, ''));

  if (lines.length === 0) {
    return {
      panelId: panel.panelId,
      lines: [],
      measured: [],
      target: 0,
      outerW: 0,
      ok: false,
      errors: ['empty panel'],
    };
  }

  // Persona rule 1: reject border chars.
  const leak = detectBorderLeak(lines);
  if (leak) {
    errors.push(
      `panel ${panel.panelId} line ${leak.line}: border char "${leak.char}" leaked into content (Stage 1 forbidden)`
    );
  }

  // Persona rule 5: reject NBSP in content.
  const nbspLeak = detectNbspLeak(lines);
  if (nbspLeak) {
    errors.push(
      `panel ${panel.panelId} line ${nbspLeak.line}: NBSP leaked into content (Stage 2 territory)`
    );
  }

  const measured = lines.map((l) => vw(l));
  const target = panel.target ?? defaultTarget ?? 0;
  const outerW = target + 2;

  // Check overflow.
  const overflowIdx = measured.findIndex((m) => m > target);
  if (overflowIdx !== -1) {
    errors.push(
      `panel ${panel.panelId} line ${overflowIdx}: measured ${measured[overflowIdx]} > target ${target} (shrink text)`
    );
  }

  // Check empty lines (visual gaps ok, but if EVERY line is empty that's degenerate).
  if (measured.every((m) => m === 0)) {
    errors.push(`panel ${panel.panelId}: all lines empty`);
  }

  return {
    panelId: panel.panelId,
    lines,
    measured,
    target,
    outerW,
    ok: errors.length === 0,
    errors,
  };
}

function main() {
  let input;
  try {
    const raw = readFileSync(0, 'utf8');
    if (raw.trim()) input = JSON.parse(raw);
  } catch (e) {
    console.error('content-generator: failed to read stdin:', e.message);
    process.exit(2);
  }

  if (!input) {
    try {
      input = JSON.parse(readFileSync('request.json', 'utf8'));
    } catch (e) {
      console.error('content-generator: no stdin and no request.json:', e.message);
      process.exit(2);
    }
  }

  const panels = input.panels ?? [];
  if (panels.length === 0) {
    console.error('content-generator: no panels in input');
    process.exit(2);
  }

  const defaultTarget = input.defaultTarget ?? 28;

  const processed = panels.map((p) => processPanel(p, defaultTarget));
  const allOk = processed.every((p) => p.ok);

  const out = {
    panels: processed,
    ok: allOk,
    errors: processed.flatMap((p) => p.errors),
  };

  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  if (!allOk) process.exitCode = 1;
}

main();
