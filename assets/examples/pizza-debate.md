# Example: Pizza Debate (4-beat arc)

A complete 4-panel story: setup → conflict → climax → resolution.

## Input

```
Alice I love pizza, then Bob I hate pineapple, then Alice shocked really, finally Bob smug told you
```

## Output

```
╔══════════════════════╗ ╔══════════════════════╗
║     (◕‿◕)  (•_•)     ║ ║   (╬ Ò﹏Ó)  (•_•)    ║
║          /|\         ║ ║          /|\         ║
║          / \         ║ ║          / \         ║
║                      ║ ║                      ║
║                      ║ ║                      ║
║                      ║ ║                      ║
║                      ║ ║                      ║
║──────────────────────║ ║──────────────────────║
║Alice: I love pizza   ║ ║Bob: I hate pineapple ║
║                      ║ ║                      ║
║                      ║ ║                      ║
╚══════════════════════╝ ╚══════════════════════╝

╔══════════════════════╗ ╔══════════════════════╗
║     (°□°)  (•_•)     ║ ║     (¬‿¬)  (•_•)     ║
║          /|\         ║ ║          /|\         ║
║          / \         ║ ║          / \         ║
║                      ║ ║                      ║
║                      ║ ║                      ║
║                      ║ ║                      ║
║                      ║ ║                      ║
║──────────────────────║ ║──────────────────────║
║Bob: shocked really   ║ ║Alice: smug told you  ║
║                      ║ ║                      ║
║                      ║ ║                      ║
╚══════════════════════╝ ╚══════════════════════╝
```

## Story arc

| Panel | Beat | Speaker | Mood | Face |
|---|---|---|---|---|
| 1 (TL) | Setup | Alice | happy | `(◕‿◕)` |
| 2 (TR) | Conflict | Bob | angry | `(╬ Ò﹏Ó)` |
| 3 (BL) | Climax | Bob | shocked | `(°□°)` |
| 4 (BR) | Resolution | Alice | smug | `(¬‿¬)` |

**Narrative:** Alice loves pizza. Bob hates pineapple on pizza. Alice is shocked. Alice smugly declares her stance.

## Metadata

```json
{
  "panels": [1, 2, 3, 4],
  "characters": ["Alice", "Bob"],
  "moods": ["happy", "angry", "shocked", "smug"],
  "lang": "en",
  "word_count": 11,
  "border_set": "heavy"
}
```

## Reproduce

```bash
python3 ~/.agents/skills/ascii-art-comics/scripts/harness.py "Alice I love pizza, then Bob I hate pineapple, then Alice shocked really, finally Bob smug told you"
```

## Notes

- All 4 moods distinct. Pizza debate as classic "setup → conflict → climax → resolution".
- Both Alice and Bob appear in every panel (stick figure body shared).
- v1 always uses same body template. v2 will add per-mood bodies.
