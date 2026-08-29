#!/usr/bin/env bash
# Smoke test the Stage 2 box wrapper.
# Verifies: happy path, CJK width math, overflow detection, style C fallback.

set -e
cd "$(dirname "$0")/.."

WRAP=scripts/box-wrap.mjs
CG=scripts/content-generator.mjs
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
