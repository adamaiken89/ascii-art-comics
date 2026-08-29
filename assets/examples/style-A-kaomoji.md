# Style A — Kaomoji-Cinematic examples

Heavy borders (`╔ ═ ╗ ║ ╚ ╝`), big kaomoji faces, English/CJK dialogue. Default style.

All examples use NBSP (U+00A0) for right-padding inside `║ ║`. Plain-text preview shows regular spaces.

---

## A.1 — "The deploy" (4-panel, English)

```
╔══════════════════════════════╗╲╔══════════════════════════════╗
║                              ║ ║                              ║
║      (•_•)                   ║ ║      (•_•)                   ║
║       /|\                    ║ ║       /|\                    ║
║      / | \                   ║ ║      / | \                   ║
║                              ║ ║                              ║
║  ╭──────────────────────╮    ║ ║  ╭──────────────────────╮    ║
║  │ pushing to prod      │    ║ ║  │ tests: 0 failures    │    ║
║  ╰──────────────────────╯    ║ ║  ╰──────────────────────╯    ║
║                              ║ ║                              ║
╚══════════════════════════════╝ ╚══════════════════════════════╝
                                  │
                                  ▼
╔══════════════════════════════╗   ╔══════════════════════════════╗
║                              ║   ║                              ║
║      (⊙_⊙)                   ║   ║      (╥﹏╥)                   ║
║       /|\                    ║   ║       /|\                    ║
║                              ║   ║                              ║
║  ╭──────────────────────╮    ║   ║  ╭──────────────────────╮    ║
║  │ wait... 1 failure?    │    ║   ║  │ prod is on fire     │    ║
║  ╰──────────────────────╯    ║   ║  ╰──────────────────────╯    ║
║                              ║   ║                              ║
╚══════════════════════════════╝   ╚══════════════════════════════╝
```

Width check: outerW=30 per panel. Bubble inner width: 22.

---

## A.2 — "DNS" (2-panel, English)

```
╔════════════════════════════════════╗   ╔════════════════════════════════════╗
║                                    ║   ║                                    ║
║            (－_－)                  ║   ║            (╥﹏╥)                  ║
║             /|                     ║   ║             /|                     ║
║            / |                    ║   ║            / |                    ║
║                                    ║   ║                                    ║
║    ╭────────────────────────╮      ║   ║    ╭────────────────────────╮      ║
║    │ the server is down     │      ║   ║    │ it's DNS              │      ║
║    ╰────────────────────────╯      ║   ║    ╰────────────────────────╯      ║
║                                    ║   ║                                    ║
╚════════════════════════════════════╝   ╚════════════════════════════════════╝
```

---

## A.3 — "Monday morning" (3-panel, mixed CJK+EN)

```
╔════════════════════════════════════╗   ╔════════════════════════════════════╗
║                                    ║   ║                                    ║
║            (◑_◑)                   ║   ║            (◕‿◕)                   ║
║             /|                     ║   ║             /|                     ║
║                                    ║   ║                                    ║
║    ╭────────────────────────╮      ║   ║    ╭────────────────────────╮      ║
║    │ 「星期一」             │      ║   ║    │ 「let me check git」  │      ║
║    ╰────────────────────────╯      ║   ║    ╰────────────────────────╯      ║
║                                    ║   ║                                    ║
╚════════════════════════════════════╝   ╚════════════════════════════════════╝
```

---

## A.4 — "Approved" (1-panel, CJK heavy)

```
╔════════════════════════════════════════╗
║                                        ║
║              (◕‿◕)                     ║
║               /|                       ║
║              / |                      ║
║                                        ║
║   ╭──────────────────────────────╮     ║
║   │  好, 呢個 PR 我 approve 了  │     ║
║   ╰──────────────────────────────╯     ║
║                                        ║
╚════════════════════════════════════════╝
```

Note: CJK chars = 2 cells each. `好, 呢個 PR 我 approve 了` = `2+1+2+2+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+2+2` visible cells. All within innerW.

---

## Width math reference (A.1, panel 1)

```
innerW = 28 (content area between borders)
outerW = 30
top/bot = ╔ + ═*28 + ╗  → 30 cells
mid     = ║ + (content + NBSP pad) + ║  → 30 cells

content lines (Stage 1):
  ""          → 0 cells
  "      (•_•)                   "  → 28 cells (after NBSP pad)
  "       /|\\                    "  → 28 cells
  "      / | \\                   "  → 28 cells
  ""          → 0 cells
  "  ╭──────────────────────╮    "  → 28 cells
  "  │ pushing to prod      │    "  → 28 cells
  "  ╰──────────────────────╯    "  → 28 cells
  ""          → 0 cells

max(measured) = 28
outerW = 30 ✓
```

---

## Face registry used

| Panel | Mood | Glyph | Fallback |
|---|---|---|---|
| A.1 P1 | neutral | `(•_•)` | `o_o` |
| A.1 P2 | happy | `(•_•)` | `o_o` |
| A.1 P3 | panic | `(⊙_⊙)` | `>_<` |
| A.1 P4 | sad | `(╥﹏╥)` | `T_T` |
| A.2 P1 | neutral | `(－_－)` | `o_o` |
| A.2 P2 | sad | `(╥﹏╥)` | `T_T` |
| A.3 P1 | thinking | `(◑_◑)` | `-_-` |
| A.3 P2 | happy | `(◕‿◕)` | `^_^` |
| A.4 | happy | `(◕‿◕)` | `^_^` |

---

## Anti-patterns (DO NOT DO)

- Mixing `╔` with `┌` in same panel
- Using `║` for left border and `│` for right border
- CJK char counted as 1 cell (breaks alignment)
- ASCII space padding inside borders (may be stripped by renderer)
- More than 4 panels (manga territory)
- Using kaomoji with chibi box in same comic
