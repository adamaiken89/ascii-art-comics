# Style C — Stick-Noir examples

No frames. Minimal ASCII faces. Dialogue carries story. Most CJK-safe (no alignment to break).

All examples use plain ASCII space. No borders means no NBSP needed.

---

## C.1 — "Standup" (3-beat)

```
           o_o

    "the meeting starts in 5"

                       >_<

        "i haven't read the doc"

                                  -_-

             "no one has"
```

---

## C.2 — "DNS" (2-beat, CJK)

```
        o_o

  「server down 咗」

                T_T

     「永遠都係 DNS」
```

---

## C.3 — "Coffee" (4-beat, English)

```
     o_o

  "morning"

          o_o

  "coffee?"

               -_-

     "always"
```

---

## C.4 — "OK" (5-beat, mixed)

```
        o_o

  "ship it?"

              -_-

  "tests pass?"

                    o_o

         "ship it"
```

---

## C.5 — "The end" (1-beat, deadpan)

```
        x_x

  "the deploy is done"

              T_T

     "so am i"
```

---

## Width check

No panel borders = no width check needed. Faces (`o_o`, `>_<`, `T_T`, `x_x`, `-_-`) all measure 3 cells, no grapheme ambiguity.

CJK chars still fullwidth but no alignment to break, so safe by construction.

---

## Face inventory (Style C)

| Mood | Glyph |
|---|---|
| neutral | `o_o` |
| happy | `^_^` |
| sad | `T_T` |
| panic | `>_<` |
| dead | `x_x` |
| thinking | `-_-` |
| shocked | `O_O` |

All ASCII. No CJK. No kaomoji. No chibi.

---

## Anti-patterns

- Adding panel borders (ruins the form)
- Using kaomoji (over-registers)
- Multi-character scenes (hard to track)
- Action sequences (needs visual structure noir lacks)
- More than 6 beats (loses pacing)
- Mixing style C with style A or B in same comic
