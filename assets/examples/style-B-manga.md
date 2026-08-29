# Style B — Panel-Manga examples

Thin borders (`┌ ─ ┐ │ └ ┘`), chibi-box faces, CJK-native, 4-koma flow.

All examples use NBSP (U+00A0) for right-padding inside `│ │`. Plain-text preview shows regular spaces.

---

## B.1 — "Monday" (4-koma, CJK)

```
┌────────┬────────┬────────┬────────┐
│  ╭──╮  │  ╭──╮  │  ╭──╮  │  ╭──╮  │
│  │◕‿◕│  │  │◑_◑│  │  │╥_╥│  │  │>_<│  │
│  ╰──╯  │  ╰──╯  │  ╰──╯  │  ╰──╯  │
│        │        │        │        │
│ 「今天  │ 「吃啥?」│ 「隨便」│ 「吃飯」│
│  週一」 │        │        │        │
└────────┴────────┴────────┴────────┘
```

Width check: each panel outerW=10, gridW=43.

---

## B.2 — "Standup" (4-koma, mixed)

```
┌─────────┬─────────┬─────────┬─────────┐
│  ╭──╮   │  ╭──╮   │  ╭──╮   │  ╭──╮   │
│  │◕_◕│  │  │⊙_⊙│  │  │╥_╥│  │  │>_<│  │
│  ╰──╯   │  ╰──╯   │  ╰──╯   │  ╰──╯   │
│         │         │         │         │
│ 「hi」  │ 「y0」  │ 「bug」 │ 「fix?」│
│         │         │         │         │
└─────────┴─────────┴─────────┴─────────┘
```

---

## B.3 — "Lunch" (2-panel, vertical CJK)

```
┌──────────────────────┐
│                      │
│  ╭──╮                │
│  │◕‿◕│               │
│  ╰──╯                │
│                      │
│ 「食咗 lunch 未?」   │
│                      │
└──────────────────────┘
          │
          ▼
┌──────────────────────┐
│                      │
│  ╭──╮                │
│  │◑‿◑│               │
│  ╰──╯                │
│                      │
│ 「食咗, 燒臘飯」     │
│                      │
└──────────────────────┘
```

---

## B.4 — "Code review" (4-koma, English in CJK frames)

```
┌──────────┬──────────┬──────────┬──────────┐
│  ╭──╮    │  ╭──╮    │  ╭──╮    │  ╭──╮    │
│  │◕_◕│   │  │◑_◑│   │  │╥_╥│   │  │>_<│   │
│  ╰──╯    │  ╰──╯    │  ╰──╯    │  ╰──╯    │
│          │          │          │          │
│「LGTM」 │「wait」  │「what?」 │「undo」  │
│          │          │          │          │
└──────────┴──────────┴──────────┴──────────┘
```

---

## Width math reference (B.1, panel 1)

```
Panel spec: innerW=8
content lines (Stage 1):
  "  ╭──╮  "  → 8 cells
  "  │◕‿◕│ "  → 8 cells (◕ fullwidth = 2)
  "  ╰──╯  "  → 8 cells
  "        "  → 0 cells
  " 「今天  "  → 8 cells (「=2, 今=2, 天=2, space=1, space=1)
  "  週一」 "  → 8 cells (space, 週=2, 一=2, 」=2, space=1)

max(measured) = 8
outerW = 10 ✓
```

---

## Face chibi-box reference

3-line block centered in panel:
```
  ╭──╮
  │x_y│
  ╰──╯
```

Each `─` and `│` = 1 cell. `x_y` eyes = 3 cells. Total chibi width = 8 cells (including `╭`, `─`, `─`, `╮` = 4, plus `│`, `x`, `_`, `y`, `│` = 5... hmm).

Re-check:
- `╭` = 1, `─` = 1, `─` = 1, `╮` = 1 → top line = 4 cells
- `│` = 1, content = 2 cells, `│` = 1 → mid line = 4 cells
- `╰` = 1, `─` = 1, `─` = 1, `╯` = 1 → bot line = 4 cells

If innerW = 8, chibi = 4 cells, pad with 2 spaces each side.

---

## Anti-patterns

- Heavy borders (`╔`) — wrong register
- Kaomoji faces — use chibi box instead
- Single panel (no 4-koma timing)
- More than 6 panels
- CJK punctuation centered (impossible in monospace, left-align only)
- Dialogue outside 「」 brackets
