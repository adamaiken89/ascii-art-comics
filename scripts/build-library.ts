#!/usr/bin/env bun
/**
 * components/build-library.ts
 *
 * Builds assets/components.json from a directory of SVG source files.
 * Source files: assets/components-svg/<category>/<name>.svg
 * Each source file contains a self-contained <svg> with viewBox.
 *
 * Output: assets/components.json
 *   {
 *     "version": 2,
 *     "categories": {
 *       "face":     [...],
 *       "body":     [...],
 *       ...
 *     }
 *   }
 *
 * Each component:
 *   {
 *     "id":      "face/chibi-happy-center",
 *     "name":    "chibi-happy-center",
 *     "category":"face",
 *     "svg":     "<g>...</g>",           // inner content of <svg>
 *     "viewBox": "0 0 7 3",
 *     "width":   7,                       // from viewBox
 *     "height":  3,                       // from viewBox
 *     "tags":    ["face", "chibi", ...]
 *   }
 *
 * No more string-width math. The SVG itself defines the geometry.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'assets', 'components-svg');
const OUT = join(ROOT, 'assets', 'components.json');

function tagFromFilename(name) {
  return name.replace(/\.[^.]+$/, '').toLowerCase();
}

function parseSvg(content) {
  // Extract viewBox + inner content
  const vbMatch = content.match(/viewBox="([^"]+)"/);
  if (!vbMatch) return null;
  const [, , w, h] = vbMatch[1].split(/\s+/).map(Number);

  // Strip outer <svg> tags, keep inner
  const inner = content
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim();

  return { svg: inner, viewBox: vbMatch[1], width: w, height: h };
}

function buildComponent(category, filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const parsed = parseSvg(raw);
  if (!parsed) return null;
  const name = tagFromFilename(basename(filePath));
  return {
    id: `${category}/${name}`,
    name,
    category,
    svg: parsed.svg,
    viewBox: parsed.viewBox,
    width: parsed.width,
    height: parsed.height,
    tags: [category, name.replace(/-/g, ' ')],
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
    const files = readdirSync(catDir).filter((f) => f.endsWith('.svg'));
    const comps = files
      .map((f) => buildComponent(cat, join(catDir, f)))
      .filter(Boolean);
    categories[cat] = comps;
    totalCount += comps.length;
    console.log(`  ${cat}: ${comps.length} components`);
  }

  const out = {
    version: 2,
    generated: new Date().toISOString(),
    count: totalCount,
    categories,
  };

  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`\nwrote ${OUT} (${totalCount} components)`);
}

main();
