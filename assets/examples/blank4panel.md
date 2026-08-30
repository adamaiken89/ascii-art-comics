# Example: Blank 4-Panel Comic

Input: `"Alice and Bob happy hi, Bob angry no way, then Alice smug told you, finally Bob dead"`

Output:

```
╔══════════════════════╗ ╔══════════════════════╗
║     (◕‿◕)  (•_•)     ║ ║    (╥﹏╥)  (•_•)     ║
║          /|\         ║ ║          /|\         ║
║          / \         ║ ║          / \         ║
║                      ║ ║                      ║
║                      ║ ║                      ║
║                      ║ ║                      ║
║                      ║ ║                      ║
║──────────────────────║ ║──────────────────────║
║Alice: happy hi       ║ ║Bob: angry no way     ║
║                      ║ ║                      ║
║                      ║ ║                      ║
╚══════════════════════╝ ╚══════════════════════╝

╔══════════════════════╗ ╔══════════════════════╗
║     (¬‿¬)  (•_•)     ║ ║     (×_×)  (•_•)     ║
║          /|\         ║ ║          /|\         ║
║          / \         ║ ║          / \         ║
║                      ║ ║                      ║
║                      ║ ║                      ║
║                      ║ ║                      ║
║                      ║ ║                      ║
║──────────────────────║ ║──────────────────────║
║Bob: smug told you    ║ ║Alice: dead           ║
║                      ║ ║                      ║
║                      ║ ║                      ║
╚══════════════════════╝ ╚══════════════════════╝
```

## Spec used

- Template: `equal_2x2`
- panelW = 24, panelH = 12
- innerW = 22, innerH = 10
- Border: heavy
- Characters: Alice (TL), Bob (TR for panel 1, etc.)
- Moods: happy, sad, smug, dead (derived from dialogue keywords)
- Dialogue: speaker rotates, text from parsed prompt

## Read order

1. Top-Left (TL) — happy
2. Top-Right (TR) — sad (the "no" keyword matched sad; would be angry in v2 with better mood detection)
3. Bottom-Left (BL) — smug
4. Bottom-Right (BR) — dead

## Reproduce

```bash
python3 ~/.agents/skills/ascii-art-comics/scripts/harness.py "Alice and Bob happy hi, Bob angry no way, then Alice smug told you, finally Bob dead"
```

## Notes

- Visual zone: face + body (stick figure arms/legs).
- Dialogue zone: separator row + tag+text.
- Body is placeholder stick figure. v1 always uses the same body. v2 will add per-mood bodies.
- No props, no FX, no gaze. Pure kaomoji faces.
