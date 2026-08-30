#!/usr/bin/env bash
# Test the comic-svg pipeline.
# Verifies: chibi parametric gen, comic render, fixture renders, component library.

set -e
cd "$(dirname "$0")/.."

COMIC=scripts/comic-render.ts
FX_DIR=assets/examples/fixtures
FAIL=0

# Helper: run a bun (TypeScript) script with stdin, check ok field
assert_ok() {
  local name=$1
  local input=$2
  local script=$3
  local result
  result=$(bun "$script" < "$input" 2>&1) || true
  local ok
  ok=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ok', False))" 2>/dev/null || echo "False")
  if [ "$ok" = "True" ]; then
    echo "  PASS  $name"
  else
    echo "  FAIL  $name"
    echo "  output: $(echo "$result" | head -c 300)"
    FAIL=1
  fi
}

assert_has() {
  # Assert that the output contains a substring
  local name=$1
  local input=$2
  local script=$3
  local needle=$4
  local result
  result=$(bun "$script" < "$input" 2>&1) || true
  if echo "$result" | grep -q "$needle"; then
    echo "  PASS  $name"
  else
    echo "  FAIL  $name (missing: $needle)"
    FAIL=1
  fi
}

TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

# --- Comic render: chibi parametric gen ---
echo "--- comic render ---"

# Test 1: parametric chibi (no library needed)
cat > "$TMP/chibi.json" <<'JSON'
{
  "panels": [
    {
      "panelId": 0,
      "width": 200,
      "bubbleHeight": 60,
      "content": [
        { "type": "component", "id": "chibi-happy-center", "x": 20, "y": 20 }
      ]
    }
  ],
  "layout": { "cols": 1, "padding": 20 },
  "dialogue": []
}
JSON
assert_ok "chibi: parametric happy-center" "$TMP/chibi.json" "$COMIC"

# Test 2: chibi left directional
cat > "$TMP/chibi-left.json" <<'JSON'
{
  "panels": [
    {
      "panelId": 0,
      "width": 200,
      "bubbleHeight": 60,
      "content": [
        { "type": "component", "id": "chibi-sad-left", "x": 20, "y": 20 }
      ]
    }
  ],
  "layout": { "cols": 1, "padding": 20 },
  "dialogue": []
}
JSON
assert_ok "chibi: directional left" "$TMP/chibi-left.json" "$COMIC"

# Test 3: 2x2 grid
cat > "$TMP/grid.json" <<'JSON'
{
  "title": "Grid Test",
  "panels": [
    { "panelId": 0, "width": 200, "bubbleHeight": 60,
      "content": [{ "type": "component", "id": "chibi-happy-center", "x": 20, "y": 20 }] },
    { "panelId": 1, "width": 200, "bubbleHeight": 60,
      "content": [{ "type": "component", "id": "chibi-thinking-right", "x": 20, "y": 20 }] },
    { "panelId": 2, "width": 200, "bubbleHeight": 60,
      "content": [{ "type": "component", "id": "chibi-sad-center", "x": 20, "y": 20 }] },
    { "panelId": 3, "width": 200, "bubbleHeight": 60,
      "content": [{ "type": "component", "id": "chibi-happy-right", "x": 20, "y": 20 }] }
  ],
  "layout": { "cols": 2, "gap": 20, "padding": 20 },
  "dialogue": [
    { "panelId": 0, "text": "hi", "align": "left" },
    { "panelId": 1, "text": "yo", "align": "right" }
  ]
}
JSON
assert_ok "comic: 2x2 grid with bubbles" "$TMP/grid.json" "$COMIC"

# Test 4: long text wraps by word, not grapheme
cat > "$TMP/wrap.json" <<'JSON'
{
  "panels": [
    {
      "panelId": 0,
      "width": 200,
      "bubbleHeight": 100,
      "content": [{ "type": "component", "id": "chibi-happy-center", "x": 20, "y": 20 }],
      "speaker": { "component": "chibi-happy-center", "anchor": "bottom" }
    }
  ],
  "layout": { "cols": 1, "padding": 20 },
  "dialogue": [
    { "panelId": 0, "text": "this is a longer dialogue line that should wrap by word boundary", "align": "left" }
  ]
}
JSON
assert_ok "comic: word-boundary wrap" "$TMP/wrap.json" "$COMIC"

# Test 5: CJK text in bubble
cat > "$TMP/cjk.json" <<'JSON'
{
  "panels": [
    {
      "panelId": 0,
      "width": 200,
      "bubbleHeight": 80,
      "content": [{ "type": "component", "id": "chibi-happy-center", "x": 20, "y": 20 }],
      "speaker": { "component": "chibi-happy-center", "anchor": "bottom" }
    }
  ],
  "layout": { "cols": 1, "padding": 20 },
  "dialogue": [
    { "panelId": 0, "text": "死線 = today, ready?", "align": "right" }
  ]
}
JSON
assert_ok "comic: CJK bubble" "$TMP/cjk.json" "$COMIC"

# Test 6: tail points at speaker (speaker ref + anchor)
cat > "$TMP/tail.json" <<'JSON'
{
  "panels": [
    {
      "panelId": 0,
      "width": 200,
      "bubbleHeight": 80,
      "content": [{ "type": "component", "id": "chibi-sad-left", "x": 150, "y": 20 }],
      "speaker": { "component": "chibi-sad-left", "anchor": "bottom" }
    }
  ],
  "layout": { "cols": 1, "padding": 20 },
  "dialogue": [
    { "panelId": 0, "text": "far away", "align": "left" }
  ]
}
JSON
assert_ok "comic: tail follows speaker" "$TMP/tail.json" "$COMIC"

# Test 7: missing panel errors
cat > "$TMP/empty.json" <<'JSON'
{ "panels": [], "layout": { "cols": 1 } }
JSON
result=$(bun "$COMIC" < "$TMP/empty.json" 2>&1) || true
if echo "$result" | grep -q "no panels"; then
  echo "  PASS  comic: rejects empty panels"
else
  echo "  FAIL  comic: rejects empty panels"
  FAIL=1
fi

# --- Comic fixture (legacy SVG path; renders to temp — committed examples dir
#     holds only the current ascii-pipeline outputs) ---
echo ""
echo "--- comic fixture ---"
python3 scripts/render-comic-svg.py assets/examples/fixtures/monday-morning-comic.json "$TMP/monday-morning-comic.svg" 2>&1 | tail -1
if [ -s "$TMP/monday-morning-comic.svg" ]; then
  echo "  PASS  monday-morning-comic rendered ($(wc -c < "$TMP/monday-morning-comic.svg") bytes)"
else
  echo "  FAIL  monday-morning-comic"
  FAIL=1
fi

# --- Component library validation ---
echo ""
echo "--- component library ---"
python3 scripts/validate-components.py 2>&1 | tail -3
if [ $? -eq 0 ]; then
  echo "  PASS  validate-components"
else
  FAIL=1
fi

# --- Component SVG showcase ---
echo ""
echo "--- component showcase ---"
bun scripts/render-components-svg.ts 2>&1 | tail -1
showcase=assets/components-renders/components-svg.svg
if [ -s "$showcase" ]; then
  echo "  PASS  components-svg showcase ($(wc -c < "$showcase") bytes)"
else
  echo "  FAIL  components-svg showcase"
  FAIL=1
fi

# --- Template system ---
echo ""
echo "--- template system ---"
COMIC_OUT=$TMP/templates
mkdir -p "$COMIC_OUT"
FAIL_TPL=0
for content in assets/examples/content/*.json; do
  name=$(basename "$content" .json)
  python3 scripts/render-template.py "$content" "$COMIC_OUT/${name}.svg" > /dev/null 2>&1
  if [ -s "$COMIC_OUT/${name}.svg" ]; then
    bytes=$(wc -c < "$COMIC_OUT/${name}.svg")
    echo "  PASS  template: $name ($bytes bytes)"
  else
    echo "  FAIL  template: $name"
    FAIL_TPL=1
  fi
done

# Template structural assertions on monday-morning
SVG="$COMIC_OUT/monday-morning.svg"
if [ -s "$SVG" ]; then
  rects=$(python3 -c "
import xml.etree.ElementTree as ET
t = ET.parse('$SVG')
ns = {'s':'http://www.w3.org/2000/svg'}
print(len(t.findall('.//s:rect', ns)))
")
  polygons=$(python3 -c "
import xml.etree.ElementTree as ET
t = ET.parse('$SVG')
ns = {'s':'http://www.w3.org/2000/svg'}
print(len(t.findall('.//s:polygon', ns)))
")
  tspans=$(python3 -c "
import xml.etree.ElementTree as ET
t = ET.parse('$SVG')
ns = {'s':'http://www.w3.org/2000/svg'}
print(len(t.findall('.//s:tspan', ns)))
")
  if [ "$rects" -ge 5 ] && [ "$polygons" -ge 4 ] && [ "$tspans" -ge 4 ]; then
    echo "  PASS  template structure: $rects rects, $polygons polygons, $tspans tspans"
  else
    echo "  FAIL  template structure: $rects rects, $polygons polygons, $tspans tspans (expected >=5/4/4)"
    FAIL_TPL=1
  fi
fi

if [ $FAIL_TPL -eq 0 ]; then
  echo "  TEMPLATES PASS"
else
  FAIL=1
fi

# --- ASCII-intermediate pipeline: compose → validate → repair → raster ---
echo ""
echo "--- ascii comic pipeline ---"
ASC=scripts/render-ascii-comic.py
ASC_OUT=assets/examples/comics/ascii
mkdir -p "$ASC_OUT"

asc_check() {
  # name fixture expect_ok expect_repaired(yes/no)
  local name=$1 fixture=$2 expect_ok=$3 expect_repaired=$4
  local out
  out=$(python3 "$ASC" "assets/examples/fixtures/ascii/$fixture.json" -o "$TMP/$fixture" 2>/dev/null) || true
  local ok attempts
  ok=$(echo "$out" | python3 -c "import sys,json; print(json.load(sys.stdin)['ok'])")
  attempts=$(echo "$out" | python3 -c "import sys,json; print(json.load(sys.stdin)['attempts'])")
  if [ "$ok" != "$expect_ok" ]; then
    echo "  FAIL  $name (ok=$ok, expected $expect_ok)"
    FAIL=1
    return
  fi
  if [ "$expect_repaired" = "yes" ] && [ "$attempts" -lt 2 ]; then
    echo "  FAIL  $name (expected repair loop, attempts=$attempts)"
    FAIL=1
    return
  fi
  echo "  PASS  $name (attempts=$attempts)"
}

asc_check "ascii: showcase renders clean" monday-morning-ascii True no
asc_check "ascii: CJK/wrap torture (repaired)" cjk-wrap True yes
asc_check "ascii: overlap repair loop" repairable True yes

# Unknown component must fail AND must not raster (errors block output)
out=$(python3 "$ASC" assets/examples/fixtures/ascii/unknown-component.json -o "$TMP/unknown" 2>/dev/null) || true
if echo "$out" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if (not d['ok'] and 'png' not in d['files']) else 1)"; then
  echo "  PASS  ascii: unresolvable component blocks raster"
else
  echo "  FAIL  ascii: unresolvable component must block raster"
  FAIL=1
fi

# Golden parity: byte-stable raster + raw ASCII artifact
if shasum -a 256 -c "$ASC_OUT/golden.sha256" > /dev/null 2>&1; then
  echo "  PASS  ascii: golden parity (png + txt)"
else
  echo "  FAIL  ascii: golden parity — regenerate with:"
  echo "          python3 $ASC assets/examples/fixtures/ascii/monday-morning-ascii.json -o $ASC_OUT/monday-morning-ascii"
  echo "          python3 $ASC assets/examples/fixtures/ascii/cjk-wrap.json -o $ASC_OUT/cjk-wrap"
  echo "          shasum -a 256 $ASC_OUT/monday-morning-ascii.png $ASC_OUT/monday-morning-ascii.txt $ASC_OUT/cjk-wrap.png $ASC_OUT/cjk-wrap.txt > $ASC_OUT/golden.sha256"
  FAIL=1
fi

# JS/Python width-table parity: same codepoint must get the same cell width
# on both sides of the pipeline (this is what broke legacy box borders).
if bun scripts/width-parity.ts > /dev/null 2>&1; then
  echo "  PASS  width-table parity (JS compose = Python validate/raster)"
else
  echo "  FAIL  width-table parity — regenerate scripts/lib/eaw-ranges.ts from unicodedata"
  FAIL=1
fi

# Gaze direction: faceOffset metric (hard-coded expectations) + rendered faces
# must shift toward the looking direction.
if bun -e '
const m = await import("./scripts/compose.ts");
const cases = [[3, 5, "center", 0], [3, 7, "left", 0], [3, 7, "right", 2],
               [5, 7, "center", 0], [5, 9, "left", 0], [5, 9, "right", 2]];
for (const [fw, w, dir, want] of cases) {
  const got = m.faceOffset(fw, w, dir);
  if (got !== want) { console.error(`faceOffset(${fw},${w},${dir}) = ${got}, want ${want}`); process.exit(1); }
}
console.log("ok");
' > /dev/null 2>&1; then
  echo "  PASS  gaze metric faceOffset"
else
  echo "  FAIL  gaze metric faceOffset"
  FAIL=1
fi
dir_txt="$TMP/direction/direction.txt"
python3 scripts/render-ascii-comic.py assets/examples/fixtures/ascii/direction.json -o "$TMP/direction/direction" > /dev/null 2>&1 || true
if grep -q "│^_^  │" "$dir_txt" && grep -q "│  ^_^│" "$dir_txt"; then
  echo "  PASS  gaze rendering: left-facing shifts left, right-facing shifts right"
else
  echo "  FAIL  gaze rendering direction"
  FAIL=1
fi

# Chibi connectivity: ┬ (neck) → │ (torso) → ┴ (hips) must share one column.
pycol='import sys
rows=[l.rstrip("\n") for l in open(sys.argv[1],encoding="utf-8") if l.strip()]
ok=True
for i,r in enumerate(rows):
    if "┬" in r:
        c=r.index("┬")
        seg=rows[i+1:i+4]
        if not (len(seg)==3 and all(len(s)>c and s[c]=="│" for s in seg[:2]) and seg[2][c]=="┴"):
            print(f"disconnected chibi at line {i}: col {c}"); ok=False
sys.exit(0 if ok else 1)'
if python3 scripts/render-ascii-comic.py assets/examples/fixtures/ascii/direction.json -o "$TMP/direction/direction" > /dev/null 2>&1 \
   && python3 -c "$pycol" "$TMP/direction/direction.txt" 2>/dev/null; then
  echo "  PASS  chibi connectivity (┬→│→┴ one column)"
else
  echo "  FAIL  chibi connectivity"
  FAIL=1
fi

# --- Random comic generator: determinism + ok ---
echo ""
echo "--- random generator ---"
RC=scripts/random-comic.ts
bun "$RC" --seed 42 --structure manzai -o "$TMP/rc-a" > /dev/null 2>&1 || true
bun "$RC" --seed 42 --structure manzai -o "$TMP/rc-b" > /dev/null 2>&1 || true
if cmp -s "$TMP/rc-a.txt" "$TMP/rc-b.txt" && cmp -s "$TMP/rc-a.png" "$TMP/rc-b.png"; then
  echo "  PASS  random: same seed → byte-identical output"
else
  echo "  FAIL  random: same seed must reproduce identical output"
  FAIL=1
fi
ok42=$(bun "$RC" --seed 42 --structure daily4 -o "$TMP/rc-c" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['ok'])" || echo False)
if [ "$ok42" = "True" ]; then
  echo "  PASS  random: daily4 seed 42 renders clean"
else
  echo "  FAIL  random: daily4 seed 42 must render ok"
  FAIL=1
fi

echo ""
if [ $FAIL -eq 0 ]; then
  echo "  ALL PASS"
else
  echo "  SOME FAILED"
  exit 1
fi
