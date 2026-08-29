#!/usr/bin/env bash
# Smoke test the Stage 2 box wrapper.
# Verifies: happy path, CJK width math, overflow detection, style C fallback.

set -e
cd "$(dirname "$0")/.."

SCRIPT=scripts/box-wrap.mjs
FAIL=0

assert_ok() {
  local name=$1
  local input=$2
  local result
  result=$(node "$SCRIPT" < "$input" 2>&1) || true
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
  local result
  result=$(node "$SCRIPT" < "$input" 2>&1) || true
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
assert_ok "A-style basic" "$TMP/a.json"

# Test 2: CJK width
cat > "$TMP/cjk.json" <<'JSON'
{
  "panels": [{ "style": "A", "lines": ["  好,approve了  "] }]
}
JSON
assert_ok "CJK width math" "$TMP/cjk.json"

# Test 3: overflow
cat > "$TMP/over.json" <<'JSON'
{
  "panels": [{ "style": "A", "width": 5, "lines": ["this is too long"] }]
}
JSON
assert_err "overflow detection" "$TMP/over.json"

# Test 4: style C
cat > "$TMP/c.json" <<'JSON'
{
  "panels": [{ "style": "C", "lines": ["o_o"] }]
}
JSON
assert_ok "style C ASCII" "$TMP/c.json"

# Test 5: multi-panel stack
cat > "$TMP/multi.json" <<'JSON'
{
  "panels": [
    { "style": "A", "lines": ["panel one"] },
    { "style": "A", "lines": ["panel two"] }
  ]
}
JSON
assert_ok "multi-panel stack" "$TMP/multi.json"

# Test 6: unknown style rejected
cat > "$TMP/bad.json" <<'JSON'
{
  "panels": [{ "style": "Z", "lines": ["x"] }]
}
JSON
assert_err "unknown style" "$TMP/bad.json"

if [ $FAIL -eq 0 ]; then
  echo "  ALL PASS"
else
  echo "  SOME FAILED"
  exit 1
fi
