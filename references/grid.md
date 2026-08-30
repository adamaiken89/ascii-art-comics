# Grid Math — Panel + Zone Layout (v1)

## Template: equal_2x2

```
╔══════════════════════╗ ╔══════════════════════╗
║                      ║ ║                      ║
║                      ║ ║                      ║
║                      ║ ║                      ║
║                      ║ ║                      ║
║                      ║ ║                      ║
║                      ║ ║                      ║
║                      ║ ║                      ║
║──────────────────────║ ║──────────────────────║
║ Alice: hi!           ║ ║ Bob:   hello!        ║
║                      ║ ║                      ║
║                      ║ ║                      ║
╚══════════════════════╝ ╚══════════════════════╝

╔══════════════════════╗ ╔══════════════════════╗
║                      ║ ║                      ║
...
```

## Panel dimensions

| Field | Value | Notes |
|---|---|---|
| `panelW` | 24 | total width including borders |
| `panelH` | 12 | total height including borders |
| `outerW` | 24 | same as panelW (outer) |
| `outerH` | 12 | same as panelH (outer) |
| `innerW` | 22 | panelW - 2 (for left+right border) |
| `innerH` | 10 | panelH - 2 (for top+bottom border) |

## Zone split (inside panel)

```
row 0:    top border
row 1-7:  visual zone (7 rows)
row 8:    separator (─ row)
row 9-10: dialogue zone (2 rows, but 3 reserved)
row 11:   bottom border
```

**Visual zone** = face + body marks + spacing
**Separator** = single row of `─` chars (inside `║` borders)
**Dialogue zone** = tag + text lines

## Grid math

```
gridW = (cols * panelW) + ((cols - 1) * gutter_col)
      = (2 * 24) + (1 * 1) = 49

gridH = (rows * panelH) + ((rows - 1) * gutter_row)
      = (2 * 12) + (1 * 1) = 25
```

## Gutter rules

- **Vertical gutter (between rows):** 1 blank line
- **Horizontal gutter (between cols):** 1 space ` `

## Read order

```
1 (TL) → 2 (TR) → 3 (BL) → 4 (BR)
```

Standard left-to-right, top-to-bottom. Western default.

## Panel numbering

Each panel gets a 1-based index. Visual label optional (per Q9 numeric labels default, hidden in v1).

## Width safety

Every content line MUST measure `<= innerW` cells. Stage 1 enforces, Stage 2 re-verifies. Failure = retry.

## Border math

```
top    = corner_TL + horiz * (outerW - 2) + corner_TR
bottom = corner_BL + horiz * (outerW - 2) + corner_BR
mid    = vert + (content + NBSP_pad) + vert
```

Where:
- Heavy: TL=`╔`, T=`═`, TR=`╗`, L=`║`, R=`║`, BL=`╚`, B=`═`, BR=`╝`
- ASCII: TL=`+`, T=`-`, TR=`+`, L=`|`, R=`|`, BL=`+`, B=`-`, BR=`+`

## Custom override (deferred to v2)

User can declare `panelW`/`panelH`. v1 = hardcoded 24x12.
