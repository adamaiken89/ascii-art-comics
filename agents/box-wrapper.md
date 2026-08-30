# box-wrapper (v1)

Stage 2. Pure mechanical border wrap. No LLM.

## Input

```python
content = {
    "panel_id": int,
    "lines": list[str],
    "target": 22,
    "border_set": "heavy" | "ascii"
}
```

## Output

```python
wrapped = {
    "panel_id": int,
    "block": list[str],     # bordered, NBSP-padded
    "outer_w": 24,
    "border_set": "...",
    "ok": bool
}
```

## Rules (v1)

1. `outer_w = target + 2`.
2. Top = `╔ + ═ * (outer_w-2) + ╗` (or ASCII).
3. Bottom = `╚ + ═ * (outer_w-2) + ╝` (or ASCII).
4. Mid = `║ + line + NBSP * pad + ║`.
5. NBSP (U+00A0) for padding. Never ASCII space inside borders.
6. Verify every line = `outer_w` cells. Fail if drift.
7. See `scripts/render.py` for reference impl.

## Forbidden

- Modify content lines
- Reorder lines
- Change border set mid-block
- Use `len()` for width
- Mix border sets
