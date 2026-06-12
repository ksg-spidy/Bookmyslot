"""One-shot codemod: replace arbitrary Tailwind hex classes (bg-[#161b22] etc.)
with the named palette tokens registered in tailwind.config.ts.

Usage: python scripts/codemod-palette.py   (from the web/ directory)
"""

import re
from pathlib import Path

PALETTE = {
    "0d1117": "canvas",
    "161b22": "card",
    "30363d": "edge",
    "21262d": "edge-soft",
    "8b949e": "muted",
    "e6edf3": "ink",
    "238636": "accent",
    "2ea043": "accent-hover",
    "58a6ff": "link",
    "3fb950": "success",
    "0c2218": "success-soft",
    "f0c93a": "warn",
    "3d2a00": "warn-soft",
    "f85149": "danger",
}

SRC = Path(__file__).resolve().parent.parent / "src"

pattern = re.compile(r"\[#([0-9a-fA-F]{6})\]")


def replace(match: re.Match) -> str:
    name = PALETTE.get(match.group(1).lower())
    return name if name else match.group(0)


changed_files = 0
replacements = 0
leftovers: list[str] = []

for path in sorted(SRC.rglob("*")):
    if path.suffix not in {".ts", ".tsx"}:
        continue
    text = path.read_text(encoding="utf-8")
    new_text, count = pattern.subn(replace, text)
    if count:
        path.write_text(new_text, encoding="utf-8", newline="")
        changed_files += 1
        replacements += count
    for m in pattern.finditer(new_text):
        leftovers.append(f"{path}: [#{m.group(1)}]")

print(f"Rewrote {replacements} classes across {changed_files} files.")
if leftovers:
    print("Hex classes not in the palette (left untouched):")
    for line in leftovers:
        print(" ", line)
