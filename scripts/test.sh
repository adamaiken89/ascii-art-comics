#!/usr/bin/env bash
# Smoke test the Stage 2 box wrapper.
# Verifies: happy path, CJK width math, overflow detection, style C fallback.

set -e
cd "$(dirname "$0")/.."

WRAP=scripts/box-wrap.mjs
CG=scripts/content-generator.mjs
FX_DIR=assets/examples/fixtures
RENDER_OUT=$FX_DIR/renders
SVG_OUT=$FX_DIR/renders-svg
mkdir -p "$RENDER_OUT" "$SVG_OUT"
FAIL=0

assert_ok() {
  local name=$1
  local input=$2
  local script=$3
  local result
  result=$(node "$script" < "$input" 2>&1) || true
  local ok
  ok=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['ok'])")
  if [ "$ok" = "True" ]; then
    echo "  PASS  $name"
  else
    echo "  FAIL  $name"
    echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print('  errors:', d['errors'])"
    FAIL=1
  fi
}

assert_err() {
  local name=$1
  local input=$2
  local script=$3
  local result
  result=$(node "$script" < "$input" 2>&1) || true
  local ok
  ok=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['ok'])")
  if [ "$ok" = "False" ]; then
    echo "  PASS  $name"
  else
    echo "  FAIL  $name (expected ok=false)"
    FAIL=1
  fi
}

TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

# Test 1: simple A-style
cat > "$TMP/a.json" <<'JSON'
{
  "panels": [{ "style": "A", "lines": ["hi"] }]
}
JSON
assert_ok "A-style basic" "$TMP/a.json" "$WRAP"

# Test 2: CJK width
cat > "$TMP/cjk.json" <<'JSON'
{
  "panels": [{ "style": "A", "lines": ["  好,approve了  "] }]
}
JSON
assert_ok "CJK width math" "$TMP/cjk.json" "$WRAP"

# Test 3: overflow
cat > "$TMP/over.json" <<'JSON'
{
  "panels": [{ "style": "A", "width": 5, "lines": ["this is too long"] }]
}
JSON
assert_err "overflow detection" "$TMP/over.json" "$WRAP"

# Test 4: style C
cat > "$TMP/c.json" <<'JSON'
{
  "panels": [{ "style": "C", "lines": ["o_o"] }]
}
JSON
assert_ok "style C ASCII" "$TMP/c.json" "$WRAP"

# Test 5: multi-panel stack
cat > "$TMP/multi.json" <<'JSON'
{
  "panels": [
    { "style": "A", "lines": ["panel one"] },
    { "style": "A", "lines": ["panel two"] }
  ]
}
JSON
assert_ok "multi-panel stack" "$TMP/multi.json" "$WRAP"

# Test 6: unknown style rejected
cat > "$TMP/bad.json" <<'JSON'
{
  "panels": [{ "style": "Z", "lines": ["x"] }]
}
JSON
assert_err "unknown style" "$TMP/bad.json" "$WRAP"

# --- Stage 1: content-generator ---

# Test 7: Stage 1 happy path
cat > "$TMP/cg-happy.json" <<'JSON'
{
  "defaultTarget": 28,
  "panels": [{
    "panelId": 0,
    "lines": [
      "      (•_•)        ",
      "       /|          ",
      "  ╭────────────────╮",
      "  │ pushing to prod │",
      "  ╰────────────────╯"
    ]
  }]
}
JSON
assert_ok "stage1: happy path" "$TMP/cg-happy.json" "$CG"

# Test 8: Stage 1 overflow
cat > "$TMP/cg-overflow.json" <<'JSON'
{
  "defaultTarget": 10,
  "panels": [{
    "panelId": 0,
    "lines": ["this line is way too long for the budget"]
  }]
}
JSON
assert_err "stage1: overflow detection" "$TMP/cg-overflow.json" "$CG"

# Test 9: Stage 1 NBSP leak
cat > "$TMP/cg-nbsp.json" <<'JSON'
{
  "defaultTarget": 28,
  "panels": [{
    "panelId": 0,
    "lines": ["line with nbsp inside"]
  }]
}
JSON
assert_err "stage1: NBSP leak" "$TMP/cg-nbsp.json" "$CG"

# Test 10: Stage 1 CJK width
cat > "$TMP/cg-cjk.json" <<'JSON'
{
  "defaultTarget": 30,
  "panels": [{
    "panelId": 0,
    "lines": [
      "    (◕‿◕)        ",
      "  ╭──────────────╮",
      "  │ 好,approve了 │",
      "  ╰──────────────╯"
    ]
  }]
}
JSON
assert_ok "stage1: CJK width" "$TMP/cg-cjk.json" "$CG"

# Test 11: end-to-end Stage 1 → Stage 2
cat > "$TMP/cg-out.json" <<EOF
{
  "defaultTarget": 28,
  "panels": [{
    "panelId": 0,
    "lines": [
      "      (•_•)        ",
      "       /|          ",
      "  ╭────────────────╮",
      "  │ pushing to prod │",
      "  ╰────────────────╯"
    ]
  }]
}
EOF
CG_RESULT=$(node "$CG" < "$TMP/cg-out.json" 2>&1)
STAGE2_INPUT=$(echo "$CG_RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
panel = d['panels'][0]
out = {'panels': [{'style': 'A', 'width': panel['target'], 'lines': panel['lines']}]}
print(json.dumps(out))
")
echo "$STAGE2_INPUT" | node "$WRAP" 2>&1 > "$TMP/stage2.json"
STAGE2_OK=$(python3 -c "import json; print(json.load(open('$TMP/stage2.json'))['ok'])")
if [ "$STAGE2_OK" = "True" ]; then
  echo "  PASS  end-to-end: stage1 → stage2"
else
  echo "  FAIL  end-to-end: stage1 → stage2"
  cat "$TMP/stage2.json"
  FAIL=1
fi

if [ $FAIL -eq 0 ]; then
  echo "  ALL PASS"
else
  echo "  SOME FAILED"
  exit 1
fi

# --- SVG render path ---
echo ""
echo "--- svg render ---"
python3 scripts/render-fixtures-svg.py 2>&1 | tail -8

# Verify each non-C fixture produced a valid SVG
for fx in "$FX_DIR"/*.json; do
  name=$(basename "$fx" .json)
  case "$name" in
    bubbles-*) continue ;;
    *-comic) continue ;;
  esac
  # Skip if fixture is pure style C (borderless)
  has_border=$(python3 -c "
import json, sys
d = json.load(open('$fx'))
styles = {p.get('style','A') for p in d.get('panels', [])}
print('yes' if styles - {'C'} else 'no')
")
  if [ "$has_border" = "no" ]; then
    continue
  fi
  if [ ! -s "$SVG_OUT/${name}.svg" ]; then
    echo "  FAIL  svg $name: no output"
    FAIL=1
  else
    bytes=$(wc -c < "$SVG_OUT/${name}.svg")
    echo "  PASS  svg $name: $bytes bytes"
  fi
done

if [ $FAIL -eq 0 ]; then
  echo "  SVG ALL PASS"
fi

# --- Fixture rendering (end-to-end) ---
echo ""
echo "--- fixtures ---"

# Run render-fixtures.py and verify all pass.
python3 scripts/render-fixtures.py 2>&1 | tail -8

# Verify each panel fixture has a render and outerW > 0.
for fx in "$FX_DIR"/*.json; do
  name=$(basename "$fx" .json)
  case "$name" in
    bubbles-*) continue ;;
    *-comic) continue ;;
  esac
  if [ ! -s "$RENDER_OUT/${name}.txt" ]; then
    echo "  FAIL  fixture $name: no render produced"
    FAIL=1
  else
    echo "  PASS  fixture $name: $(wc -l < "$RENDER_OUT/${name}.txt") lines"
  fi
done

# --- Bubble SVG rendering ---
echo ""
echo "--- bubble SVG ---"
RENDER_OUT_SVG=$FX_DIR/renders-svg
mkdir -p "$RENDER_OUT_SVG"
python3 scripts/render-bubbles-svg.py 2>&1 | tail -3
for fx in "$FX_DIR"/bubbles-*.json; do
  [ -f "$fx" ] || continue
  name=$(basename "$fx" .json)
  if [ ! -s "$RENDER_OUT_SVG/${name}.svg" ]; then
    echo "  FAIL  bubble $name: no svg produced"
    FAIL=1
  else
    echo "  PASS  bubble $name: $(wc -c < "$RENDER_OUT_SVG/${name}.svg") bytes"
  fi
done

# --- Panel SVG rendering (existing) ---
echo ""
echo "--- panel SVG ---"
python3 scripts/render-fixtures-svg.py 2>&1 | tail -3
for fx in "$FX_DIR"/*.json; do
  name=$(basename "$fx" .json)
  case "$name" in
    bubbles-*) continue ;;
    dns-styleC) continue ;;  # style C = borderless, no SVG
    *-comic) continue ;;     # comic fixtures handled by comic-render
  esac
  if [ ! -s "$RENDER_OUT_SVG/${name}.svg" ]; then
    echo "  FAIL  svg $name: no svg produced"
    FAIL=1
  else
    echo "  PASS  svg $name: $(wc -c < "$RENDER_OUT_SVG/${name}.svg") bytes"
  fi
done

if [ $FAIL -eq 0 ]; then
  echo "  ALL FIXTURES + SVG + BUBBLES PASS"
else
  echo "  SOMETHING FAILED"
  exit 1
fi

# --- Comic SVG (panels + bubbles) ---
echo ""
echo "--- comic svg ---"
COMIC_OUT=assets/examples/comics
mkdir -p "$COMIC_OUT"
for fx in "$FX_DIR"/monday-morning-comic.json; do
  [ -f "$fx" ] || continue
  python3 scripts/render-comic-svg.py "$fx" 2>&1 | tail -2
  name=$(basename "$fx" .json)
  if [ ! -s "$COMIC_OUT/${name}.svg" ]; then
    echo "  FAIL  comic $name: no svg produced"
    FAIL=1
  else
    bytes=$(wc -c < "$COMIC_OUT/${name}.svg")
    echo "  PASS  comic $name: $bytes bytes"
  fi
done

if [ $FAIL -eq 0 ]; then
  echo "  COMIC SVG PASS"
else
  echo "  COMIC FAILED"
  exit 1
fi
