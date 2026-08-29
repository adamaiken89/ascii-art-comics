#!/usr/bin/env node
/**
 * components/build-library.mjs
 *
 * Builds assets/components.json from a directory of source files.
 * Source files: assets/components-src/<category>/<name>.txt
 * Each source file contains a component, lines separated by \n.
 *
 * Output: assets/components.json
 *   {
 *     "version": 1,
 *     "categories": {
 *       "face":     [...],
 *       "body":     [...],
 *       "gesture":  [...],
 *       "prop":     [...],
 *       "scene":    [...],
 *       "frame":    [...],
 *       "separator": [...],
 *       "bubble":   [...]
 *     }
 *   }
 *
 * Each component:
 *   {
 *     "id":     "face/happy-kaomoji",
 *     "name":   "happy-kaomoji",
 *     "category": "face",
 *     "lines":  ["...", "..."],
 *     "width":  number,           // max(vw) across lines
 *     "height": number,           // lines.length
 *     "tags":   ["happy", "kaomoji", "positive"]
 *   }
 *
 * Width measured via string-width + grapheme-splitter (persona rule 4).
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import GraphemeSplitter from 'grapheme-splitter';
import stringWidth from 'string-width';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'assets', 'components-src');
const OUT = join(ROOT, 'assets', 'components.json');

const splitter = new GraphemeSplitter();

function vw(s) {
  return stringWidth(s);
}

function tagFromFilename(name) {
  // strip extension, kebab-case
  return name.replace(/\.[^.]+$/, '').toLowerCase();
}

function parseMetaFile(content) {
  // Optional first-line metadata: "@tags: tag1, tag2"
  let lines = content.split('\n');
  const tags = [];
  if (lines[0]?.startsWith('@tags:')) {
    tags.push(...lines[0].slice(6).split(',').map((s) => s.trim()).filter(Boolean));
    lines = lines.slice(1);
  }
  if (lines[0]?.startsWith('@width:')) {
    return { tags, lines, _explicitWidth: parseInt(lines[0].slice(7).trim(), 10) };
  }
  // Strip trailing empty lines (file-ending newlines).
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return { tags, lines };
}

function buildComponent(category, filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const { tags: extraTags, lines: rawLines, _explicitWidth } = parseMetaFile(raw);
  // Normalize: right-pad shorter lines with ASCII space to match the widest.
  // This prevents visual skew when components have variable-width lines.
  const measured = rawLines.map((l) => vw(l));
  const maxW = measured.reduce((m, w) => Math.max(m, w), 0);
  const lines = rawLines.map((l) => l + ' '.repeat(maxW - vw(l)));
  const width = maxW;
  const name = tagFromFilename(basename(filePath));
  return {
    id: `${category}/${name}`,
    name,
    category,
    lines,
    width,
    height: lines.length,
    tags: [category, name.replace(/-/g, ' '), ...extraTags],
  };
}

function main() {
  mkdirSync(SRC, { recursive: true });
  const categories = {};
  let totalCount = 0;

  const cats = readdirSync(SRC).filter((d) => {
    const p = join(SRC, d);
    return statSync(p).isDirectory();
  });

  for (const cat of cats) {
    const catDir = join(SRC, cat);
    const files = readdirSync(catDir).filter((f) => f.endsWith('.txt'));
    const comps = files.map((f) => buildComponent(cat, join(catDir, f)));
    categories[cat] = comps;
    totalCount += comps.length;
    console.log(`  ${cat}: ${comps.length} components`);
  }

  const out = {
    version: 1,
    generated: new Date().toISOString(),
    count: totalCount,
    categories,
  };

  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`\nwrote ${OUT} (${totalCount} components)`);
}

main();
