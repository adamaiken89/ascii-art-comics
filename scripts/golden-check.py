#!/usr/bin/env python3
"""
Golden parity check: render the comic fixture, compare against committed golden.
Pass if identical (byte-for-byte). Fail if not — investigate diff.

Golden file: assets/examples/comics/monday-morning-comic.golden.svg
Current:     assets/examples/comics/monday-morning-comic.svg

If intentional changes, regenerate golden:
  cp assets/examples/comics/monday-morning-comic.svg \\
     assets/examples/comics/monday-morning-comic.golden.svg
  git add assets/examples/comics/monday-morning-comic.golden.svg
"""
import hashlib
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
FIXTURE = ROOT / "assets/examples/fixtures/monday-morning-comic.json"
CURRENT = ROOT / "assets/examples/comics/monday-morning-comic.svg"
GOLDEN = ROOT / "assets/examples/comics/monday-morning-comic.golden.svg"


def hash_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()[:12]


def main() -> int:
    if not GOLDEN.exists():
        # Bootstrap: create golden from current render
        subprocess.run(
            ["python3", str(ROOT / "scripts/render-comic-svg.py"), str(FIXTURE)],
            check=True,
        )
        GOLDEN.write_bytes(CURRENT.read_bytes())
        print(f"  BOOTSTRAP: created golden from current ({hash_file(GOLDEN)})")
        return 0

    # Re-render current
    subprocess.run(
        ["python3", str(ROOT / "scripts/render-comic-svg.py"), str(FIXTURE)],
        check=True,
    )

    cur = hash_file(CURRENT)
    gold = hash_file(GOLDEN)
    if cur == gold:
        print(f"  PASS  golden parity ({cur})")
        return 0
    print(f"  FAIL  golden parity: current={cur} golden={gold}")
    print("  diff (current vs golden):")
    subprocess.run(["diff", str(GOLDEN), str(CURRENT)], check=False)
    return 1


if __name__ == "__main__":
    sys.exit(main())
