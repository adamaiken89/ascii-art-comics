# Test fixtures — example comics

Reference outputs the subagents can pattern-match against. Each example is complete, width-checked, and validated.

## Files

- `showcase.md` — same scene in all 3 styles, side-by-side comparison
- `style-A-kaomoji.md` — Style A examples (4 comics)
- `style-B-manga.md` — Style B examples (4 comics)
- `style-C-noir.md` — Style C examples (5 beats)

## Width check note

All examples use NBSP (U+00A0) for right-padding inside borders. Plain-text preview shows regular spaces — actual files preserve NBSP. Stage 3 auditor must verify NBSP survives in render pipeline.

## Example 1 — Style A, English, 2 panels

```
╔════════════════════════════════════╗   ╔════════════════════════════════════╗
║                                    ║   ║                                    ║
║            (◕‿◕)                   ║   ║            (╥﹏╥)                   ║
║             /|                     ║   ║             /|                     ║
║            / |                    ║   ║            / |                    ║
║                                    ║   ║                                    ║
║    < the server is down >          ║   ║    < it's DNS >                    ║
║                                    ║   ║                                    ║
╚════════════════════════════════════╝   ╚════════════════════════════════════╝
```

Note: NBSP padding inside `║ ║` not visible in this plain-text preview. In actual file, padding is U+00A0.

## Example 2 — Style B, CJK, 4-koma

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

## Example 3 — Style C, ASCII, no borders

```
           o_o

    "the meeting starts in 5"

                       >_<

        "i haven't read the doc"

                                  -_-

             "no one has"
```

## Width check (Example 1)

Panel 1:
- innerW = 34
- outerW = 36
- All mid lines measure 36 cells (NBSP-padded)

Panel 2:
- innerW = 32
- outerW = 34
- All mid lines measure 34 cells

## Width check (Example 2)

Each panel:
- innerW = 8
- outerW = 10
- All mid lines measure 10 cells

## CJK char count rules

- `今` = 2 cells
- `天` = 2 cells
- `「` = 2 cells (CJK punctuation)
- `」` = 2 cells
- `?` (ASCII) = 1 cell
- ` ` (space) = 1 cell
