#!/usr/bin/env python3
"""
render-ascii-comic.py — Full pipeline: semantic JSON → validated ASCII → PNG/JPEG.

    python3 scripts/render-ascii-comic.py content.json -o out/name [--max-repair 3] [--no-raster]

Pipeline:
  1. compose.ts (bun) builds the cell grid (LLM never draws boxes)
  2. validate-grid.py checks the grid in cell space
  3. if error issues: deterministic self-repair (grow panel, shift colliders)
     and re-compose, up to --max-repair times
  4. if still ok: raster-cells.py draws PNG/JPEG with the pinned font
  5. writes the raw ASCII artifact <out>.txt (advisory — the PNG is truth)

Output: JSON summary {ok, attempts, issues, files} on stdout.
Every issue keeps the shared shape {type, panel, row, col, expected, got, fix,
severity}; agent callers should read `fix` hints and patch the input JSON.
"""

import argparse
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import importlib.util

def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, filename))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

validate_grid = _load("validate_grid", "validate-grid.py")
raster_cells = _load("raster_cells", "raster-cells.py")


def run_compose(content, txt_path=None):
    cmd = ["bun", os.path.join(HERE, "compose.ts")]
    if txt_path:
        cmd += ["--txt", txt_path]
    proc = subprocess.run(cmd, input=json.dumps(content), capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"compose failed: {proc.stderr.strip()}")
    return json.loads(proc.stdout)


def repair(content, issues):
    """Apply deterministic fixes derived from issue `got`/`fix` fields."""
    changed = False
    by_panel = {p["panelId"]: p for p in content.get("panels", [])}

    def parse_needs(got):
        m = re.search(r"needs (\d+)x(\d+)", str(got or ""))
        return (int(m.group(1)), int(m.group(2))) if m else (None, None)

    for iss in issues:
        if iss.get("severity") != "error":
            continue
        p = by_panel.get(iss.get("panel"))
        if not p:
            continue
        typ = iss.get("type")
        need_w, need_h = parse_needs(iss.get("got"))
        if typ in ("component_out_of_bounds", "bubble_overflow", "text_overflow") and need_w:
            new_w, new_h = need_w + 2, need_h + 2
            if new_w > p.get("width", 0) or new_h > p.get("height", 0):
                p["width"] = max(p.get("width", 0), new_w)
                p["height"] = max(p.get("height", 0), new_h)
                changed = True
        elif typ == "bubble_overlap":
            # Content collides with the bubble area: push everything below
            # the collision row and grow the panel to make room. Items pinned
            # to the floor (y == "floor") stay put.
            hit_row = iss.get("row", 1)  # 1-based, border-inclusive
            for c in p.get("content", []):
                y = c.get("y", 0)
                if isinstance(y, (int, float)) and y < hit_row:
                    c["y"] = hit_row
            p["height"] = p.get("height", 10) + hit_row
            changed = True
        elif typ == "component_overlap" and iss.get("item"):
            item_id = iss["item"]
            target = None
            if item_id.startswith("text:"):
                text = item_id[5:]
                target = next((c for c in p.get("content", [])
                               if c.get("type") == "text" and c.get("text") == text), None)
            else:
                target = next((c for c in p.get("content", [])
                               if c.get("type") == "component" and c.get("id") == item_id), None)
            if target is not None:
                target["y"] = target.get("y", 0) + 3
                p["height"] = p.get("height", 10) + 2
                changed = True
    return changed


def write_txt(compose_result, path):
    parts = []
    if compose_result.get("title"):
        parts += [compose_result["title"], ""]
    for p in compose_result.get("panels", []):
        parts += p["ascii"] + [""]
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))


def main():
    ap = argparse.ArgumentParser(description="Render an ASCII-intermediate comic")
    ap.add_argument("input", help="semantic content JSON")
    ap.add_argument("-o", "--out", required=True, help="output prefix (writes .txt/.png/.jpg)")
    ap.add_argument("--max-repair", type=int, default=3)
    ap.add_argument("--no-raster", action="store_true")
    ap.add_argument("--font", default=None)
    ap.add_argument("--cjk-font", default=None)
    ap.add_argument("--size", type=int, default=20)
    args = ap.parse_args()

    content = json.loads(open(args.input, encoding="utf-8").read())
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)

    all_issues = []
    attempts = 0
    compose_result = None
    for attempt in range(1, args.max_repair + 1):
        attempts = attempt
        compose_result = run_compose(content)
        compose_result["issues"] = compose_result.get("issues", []) + \
            validate_grid.validate(compose_result)
        all_issues = compose_result["issues"]
        if not any(i["severity"] == "error" for i in all_issues):
            break
        if attempt == args.max_repair or not repair(content, all_issues):
            break

    ok = not any(i["severity"] == "error" for i in all_issues)
    files = {}
    if compose_result and compose_result.get("panels"):
        txt_path = args.out + ".txt"
        write_txt(compose_result, txt_path)
        files["txt"] = txt_path

    if ok and not args.no_raster:
        raster_issues, raster_files = raster_cells.raster(
            compose_result, args.out, font_size=args.size,
            font_path=args.font, cjk_path=args.cjk_font)
        all_issues += raster_issues
        files.update(raster_files)
        ok = not any(i["severity"] == "error" for i in all_issues)

    json.dump({"ok": ok, "attempts": attempts, "issues": all_issues, "files": files},
              sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
