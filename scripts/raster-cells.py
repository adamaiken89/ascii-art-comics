#!/usr/bin/env python3
"""
raster-cells.py — Char-by-char cell rasterizer: validated ASCII grid → PNG/JPEG.

Every grapheme is drawn at its exact cell origin (col*cellW, row*cellH) with a
pinned font, so font advance widths never participate in alignment — a wider
glyph can overhang its cell but cannot shift the next character. Output is
byte-stable across platforms given the same fonts.

Cell width rule matches lib/cellwidth.ts / validate-grid.py:
    EAW in ('W','F') → 2 cells (drawn with the CJK fallback font), else 1 cell.

Also performs a cheap structural ink check (NOT an edge detector): the border
lines of each panel are at known pixel positions, so we verify dark-ink
coverage along them. Catches a missing glyph / blank font face in pixel space.
"""

import json
import os
import sys
import unicodedata

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_FONT = os.path.join(ROOT, "assets", "fonts", "JetBrainsMono-Regular.ttf")

CJK_CANDIDATES = [
    # macOS
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/Supplemental/Songti.ttc",
    "/System/Library/Fonts/Apple Symbols.ttf",
    # Linux
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    # Windows
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/simhei.ttf",
]

MARGIN = 24
GAP = 2  # blank rows between panels (in cells)

import struct

_CMAP_CACHE = {}


def font_cmap(font_path):
    """Set of codepoints the font's cmap actually maps (format 4 + 12).

    Deterministic (pure table read — no rasterized-glyph heuristics, which
    proved flaky across processes). Returns None if parsing fails, in which
    case callers should treat every glyph as present (safe degrade).
    """
    if font_path in _CMAP_CACHE:
        return _CMAP_CACHE[font_path]
    try:
        with open(font_path, "rb") as fh:
            data = fh.read()
        off = 0
        if data[:4] == b"ttcf":  # TrueType collection: use face 0
            num_fonts = struct.unpack(">I", data[8:12])[0]
            offsets = struct.unpack(">%dI" % num_fonts, data[12:12 + 4 * num_fonts])
            off = offsets[0]
        num_tables = struct.unpack(">H", data[off + 4:off + 6])[0]
        cmap_off = None
        for i in range(num_tables):
            tag, _, toff, _ = struct.unpack(">4sIII", data[off + 12 + 16 * i:off + 12 + 16 * (i + 1)])
            if tag == b"cmap":
                cmap_off = toff  # table offsets are absolute file offsets
                break
        if cmap_off is None:
            raise ValueError("no cmap")
        n = struct.unpack(">H", data[cmap_off + 2:cmap_off + 4])[0]
        sub = None
        for i in range(n):
            _, _, sub_off = struct.unpack(">HHI", data[cmap_off + 4 + 8 * i:cmap_off + 4 + 8 * (i + 1)])
            fmt = struct.unpack(">H", data[cmap_off + sub_off:cmap_off + sub_off + 2])[0]
            if fmt == 12:
                sub = cmap_off + sub_off
                break
            if fmt == 4 and sub is None:
                sub = cmap_off + sub_off
        if sub is None:
            raise ValueError("no format 4/12 subtable")
        fmt = struct.unpack(">H", data[sub:sub + 2])[0]
        cps = set()
        if fmt == 4:
            seg_x2 = struct.unpack(">H", data[sub + 6:sub + 8])[0]
            seg = seg_x2 // 2
            if not 0 < seg <= 0x10000 or sub + 16 + 2 * seg_x2 > len(data):
                raise ValueError("bad format 4")
            ends = struct.unpack(">%dH" % seg, data[sub + 14:sub + 14 + seg_x2])
            starts = struct.unpack(">%dH" % seg, data[sub + 16 + seg_x2:sub + 16 + 2 * seg_x2])
            for s, e in zip(starts, ends):
                if s == 0xFFFF:
                    continue
                cps.update(range(s, min(e, 0xFFFF) + 1))
        else:
            ngroups = struct.unpack(">I", data[sub + 12:sub + 16])[0]
            if sub + 16 + 12 * ngroups > len(data):
                raise ValueError("bad format 12")
            for i in range(ngroups):
                s, e, _ = struct.unpack(">III", data[sub + 16 + 12 * i:sub + 16 + 12 * (i + 1)])
                if e - s > 0x110000:
                    continue
                cps.update(range(s, e + 1))
        if not 0 < len(cps) < 0x110000:
            raise ValueError("implausible cmap size")
        _CMAP_CACHE[font_path] = cps
        return cps
    except Exception:
        _CMAP_CACHE[font_path] = None
        return None


def cell_width(ch: str) -> int:
    if len(ch) != 1:
        return sum(cell_width(c) for c in ch)
    return 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1


def find_fallback_fonts(explicit=None):
    """Ordered fallback font paths (explicit first, then platform candidates)."""
    paths = []
    if explicit and os.path.exists(explicit):
        paths.append(explicit)
    for p in CJK_CANDIDATES:
        if os.path.exists(p) and p not in paths:
            paths.append(p)
    return paths


def raster(compose_result, out_prefix, font_size=20, jpeg_quality=90,
           font_path=None, cjk_path=None, ink_check=True):
    """Render compose-output panels. Returns (issues, files)."""
    issues = []
    files = {}
    title = compose_result.get("title")
    panels = compose_result.get("panels", [])

    font_path = font_path or DEFAULT_FONT
    font = ImageFont.truetype(font_path, font_size)
    cell_w = max(1, round(font.getlength("M")))
    ascent, descent = font.getmetrics()
    cell_h = ascent + descent

    # --- Fallback chain: main font first, then platform CJK/symbol fonts ---
    chain = [(font, font_cmap(font_path))]
    for fb_path in find_fallback_fonts(cjk_path):
        try:
            fb = ImageFont.truetype(fb_path, font_size)
        except OSError:
            continue
        chain.append((fb, font_cmap(fb_path)))
    if len(chain) < 2:
        issues.append({
            "type": "cjk_font_missing", "severity": "warning",
            "expected": "a CJK fallback font", "got": "none found",
            "fix": "pass --cjk-font (wide/missing glyphs will raster as boxes)",
        })

    # --- Per-glyph font resolution: first chain entry whose cmap covers the
    #     codepoint (None cmap = assume covered, safe degrade) ---
    char_font = {}
    missing_glyphs = set()
    for p in panels:
        for line in p.get("ascii", []):
            for ch in set(line):
                if ch in char_font:
                    continue
                cp = ord(ch)
                for fb, cps in chain:
                    if ch == " " or cps is None or cp in cps:
                        char_font[ch] = fb
                        break
                else:
                    char_font[ch] = font
                    missing_glyphs.add(ch)
    if missing_glyphs:
        issues.append({
            "type": "glyph_missing", "severity": "warning",
            "expected": "glyph in main or fallback font",
            "got": "".join(sorted(missing_glyphs)),
            "fix": "add a fallback font (--cjk-font) or swap the component glyphs",
        })

    # --- Layout ---
    margin_x = MARGIN
    title_h = (font_size + 12) if title else 0
    panel_origins = []  # (origin_row_y, panel) in cell units for ink check
    max_cols = max((p.get("width") or len(p["ascii"][0])) for p in panels) if panels else 1
    total_rows = sum(len(p["ascii"]) for p in panels) + GAP * (len(panels) - 1) if panels else 0

    W = max_cols * cell_w + 2 * margin_x
    H = title_h + total_rows * cell_h + 2 * MARGIN
    img = Image.new("RGB", (max(W, 1), max(H, 1)), "white")
    draw = ImageDraw.Draw(img)

    if title:
        # Title goes through the same per-glyph font resolution as panel
        # content — CJK titles must not raster as .notdef boxes.
        title_map = {}
        for ch in set(title):
            cp = ord(ch)
            title_map[ch] = next(
                (fb for fb, cps in chain if cps is None or cp in cps), font)
        tw = sum(draw.textlength(ch, font=title_map[ch]) for ch in title)
        tx = (W - tw) / 2
        for ch in title:
            draw.text((tx, MARGIN // 2), ch, font=title_map[ch], fill="#222")
            tx += draw.textlength(ch, font=title_map[ch])

    # --- Draw char by char at exact cell origins ---
    y_px = title_h + MARGIN
    for p in panels:
        panel_origins.append((y_px, p))
        for r, line in enumerate(p["ascii"]):
            c = 0
            for ch in line:
                w = cell_width(ch)
                draw.text((margin_x + c * cell_w, y_px + r * cell_h), ch,
                          font=char_font[ch], fill="#222")
                c += w
        y_px += (len(p["ascii"]) + GAP) * cell_h

    png_path = out_prefix + ".png"
    img.save(png_path)
    files["png"] = png_path

    jpg_path = out_prefix + ".jpg"
    try:
        img.save(jpg_path, quality=jpeg_quality)
        files["jpg"] = jpg_path
    except (OSError, ValueError) as e:
        issues.append({"type": "jpeg_failed", "severity": "warning",
                       "expected": "JPEG written", "got": str(e), "fix": "check disk/permissions"})

    # --- Structural ink check on the PNG (border lines are at known pixels) ---
    if ink_check:
        gray = img.convert("L")
        px = gray.load()
        for y0, p in panel_origins:
            rows = p["ascii"]
            if len(rows) < 3:
                continue
            ph = len(rows)
            pw = max_cols
            # top border: horizontal band at the vertical middle of row 0
            ym = y0 + cell_h // 2
            dark = sum(1 for x in range(margin_x, margin_x + pw * cell_w)
                       for yy in range(ym - 1, ym + 2) if px[x, yy] < 128)
            area = pw * cell_w * 3
            if area and dark / area < 0.35:
                issues.append({
                    "type": "border_ink_missing", "severity": "warning",
                    "panel": p.get("panelId"), "border": "top",
                    "expected": "continuous border ink", "got": f"{dark / area:.0%} coverage",
                    "fix": "check font glyph coverage for border characters",
                })
            # left border: vertical band at the horizontal center of col 0
            xm = margin_x + cell_w // 2
            dark = sum(1 for yy in range(y0, y0 + ph * cell_h)
                       for xx in range(xm - 1, xm + 2) if px[xx, yy] < 128)
            area = ph * cell_h * 3
            if area and dark / area < 0.35:
                issues.append({
                    "type": "border_ink_missing", "severity": "warning",
                    "panel": p.get("panelId"), "border": "left",
                    "expected": "continuous border ink", "got": f"{dark / area:.0%} coverage",
                    "fix": "check font glyph coverage for border characters",
                })

    return issues, files


def main():
    import argparse

    ap = argparse.ArgumentParser(description="Rasterize compose-output JSON to PNG/JPEG")
    ap.add_argument("input", help="compose.ts output JSON (or - for stdin)")
    ap.add_argument("-o", "--out", required=True, help="output prefix (writes .png/.jpg)")
    ap.add_argument("--font", default=None, help="main monospace font path")
    ap.add_argument("--cjk-font", default=None, help="CJK fallback font path")
    ap.add_argument("--size", type=int, default=20, help="font pixel size")
    ap.add_argument("--no-jpeg", action="store_true")
    ap.add_argument("--no-ink-check", action="store_true")
    args = ap.parse_args()

    raw = sys.stdin.read() if args.input == "-" else open(args.input, encoding="utf-8").read()
    data = json.loads(raw)
    issues, files = raster(data, args.out, font_size=args.size,
                           font_path=args.font, cjk_path=args.cjk_font,
                           ink_check=not args.no_ink_check)
    data["issues"] = data.get("issues", []) + issues
    data["files"] = files
    json.dump(data, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
