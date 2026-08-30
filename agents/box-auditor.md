# box-auditor (v1)

Stage 3. Code audit. No LLM in v1 (LLM audit deferred to v2).

## Input

```python
wrapped = {
    "panel_id": int,
    "block": list[str],
    "outer_w": 24,
    "border_set": "heavy" | "ascii"
}
```

## Output

```python
audit = {
    "ok": bool,
    "issues": list[dict],
    "border_set": "..."
}
```

## v1 checks (see `scripts/validate.py`)

1. **Width:** every line = `outer_w` cells.
2. **Corners:** TL, TR, BL, BR match border set.
3. **Border continuity:** top/bot horizontal, mid vertical.
4. **Tofu:** no `?`, `□`, `▯`, `◇`, `�` in mid lines.
5. **Forbidden:** no emoji (U+1F000-U+1FFFF).
6. **Content fit:** all `lines[i]` measured widths from Stage 1 still valid (re-verified by render.py).

## Failure → Caller action

| Result | Action |
|---|---|
| `ok: true, issues: []` | accept, proceed to grid |
| `ok: false, issues: [...]` | downgrade to ASCII border, re-render, re-audit |
| Still fail after downgrade | emit + add to issues footer |

## v1 limits

- No LLM visual audit (deferred to v2)
- No emoji detection beyond U+1F000 range
- No rewrap on failure (just downgrade)
