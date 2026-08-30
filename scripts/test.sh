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

echo ""
if [ $FAIL -eq 0 ]; then
  echo "  ALL PASS"
else
  echo "  SOME FAILED"
  exit 1
fi
