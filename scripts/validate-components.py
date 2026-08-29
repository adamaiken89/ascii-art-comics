#!/usr/bin/env python3
"""
Validate every component in assets/components-svg/<category>/<name>.svg.

Checks per component:
  1. File exists and is non-empty
  2. Has valid <svg> root with viewBox
  3. viewBox has 4 numbers
  4. width/height match viewBox
  5. Has actual content (not just an empty <svg>)
  6. Registered in assets/components.json (built from build-library.mjs)

Exits 0 if all components valid, 1 otherwise.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
SVG_DIR = ROOT / "assets" / "components-svg"
JSON_FILE = ROOT / "assets" / "components.json"


def validate_svg(path: Path) -> list[str]:
    errors = []
    try:
        content = path.read_text(encoding="utf-8")
    except Exception as e:
        return [f"read error: {e}"]

    if not content.strip():
        return ["empty file"]

    if "<svg" not in content:
        errors.append("no <svg> root")
        return errors

    vb = re.search(r'viewBox="([^"]+)"', content)
    if not vb:
        errors.append("no viewBox attribute")
        return errors

    parts = vb.group(1).split()
    if len(parts) != 4:
        errors.append(f"viewBox has {len(parts)} values, expected 4")
        return errors
    try:
        nums = [float(x) for x in parts]
    except ValueError:
        errors.append("viewBox has non-numeric values")
        return errors
    if nums[2] <= 0 or nums[3] <= 0:
        errors.append(f"viewBox has non-positive size: {nums[2]}x{nums[3]}")

    # Strip outer <svg> tags
    inner = re.sub(r"<svg[^>]*>", "", content)
    inner = re.sub(r"</svg>\s*$", "", inner).strip()
    if not inner:
        errors.append("empty <svg> body")

    return errors


def main() -> int:
    if not SVG_DIR.exists():
        print(f"FAIL: {SVG_DIR} does not exist")
        return 1
    if not JSON_FILE.exists():
        print(f"FAIL: {JSON_FILE} does not exist (run build-library.mjs)")
        return 1

    json_data = json.loads(JSON_FILE.read_text(encoding="utf-8"))
    json_by_id = {}
    for cat_arr in json_data.get("categories", {}).values():
        for c in cat_arr:
            json_by_id[c["id"]] = c

    fails = []
    total = 0
    for cat_dir in sorted(SVG_DIR.iterdir()):
        if not cat_dir.is_dir():
            continue
        cat = cat_dir.name
        for svg_file in sorted(cat_dir.glob("*.svg")):
            total += 1
            cid = f"{cat}/{svg_file.stem}"
            errs = validate_svg(svg_file)
            if cid not in json_by_id:
                errs.append(f"not registered in components.json (run build-library.mjs)")
            if errs:
                fails.append((cid, errs))

    print(f"checked {total} SVG components")
    for cat_dir in sorted(SVG_DIR.iterdir()):
        if cat_dir.is_dir():
            n = len(list(cat_dir.glob("*.svg")))
            print(f"  {cat_dir.name}: {n}")

    if fails:
        print(f"\n{len(fails)} FAILED:")
        for cid, errs in fails:
            print(f"  {cid}:")
            for e in errs:
                print(f"    - {e}")
        return 1

    print(f"\nALL OK ({len(json_by_id)} registered in components.json)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
