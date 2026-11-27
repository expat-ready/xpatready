#!/usr/bin/env bash
# Lead tools follow 301 (LR-046, full-power #56): every curl a product tool runs carries -L (or --location), so a GitHub
# redirect (a renamed repository answers 301) is followed, not read as an empty answer. Tests (check-*, test_*) and
# github-write-guard.py's examples are not tools. curl does not send the Authorization header on to another host.
#   bash product/tools/check-curl-follows.sh [dir]     exit 1 naming each curl without -L
set -u
D="${1:-$(cd "$(dirname "$0")" && pwd)}"
python3 -I - "$D" <<'PY'
import glob, os, re, sys
d = sys.argv[1]; bad = []; n = 0
SH = re.compile(r"(?:^|[\s;&|(`]|\$\()curl\s+(?=[-\"$'])")
PYL = re.compile(r"""\[\s*["']curl["']\s*,\s*["'](-[^"']*)["']""")
for f in sorted(glob.glob(os.path.join(d, "*.sh")) + glob.glob(os.path.join(d, "*.py")) + glob.glob(os.path.join(d, "*.mjs"))):
    b = os.path.basename(f)
    if b.startswith(("check-", "test_")) or b in ("github-write-guard.py",):
        continue
    text = open(f, encoding="utf-8", errors="replace").read()
    arr_l = set(re.findall(r"^\s*(?:.*;\s*)?(\w+)=\((-[A-Za-z]*L)\b", text, re.M))
    for i, line in enumerate(text.splitlines(), 1):
        s = line.strip()
        if s.startswith(("#", "//")):
            continue
        if b.endswith(".sh"):
            for m in SH.finditer(line):
                n += 1
                rest = line[m.end():]
                if re.match(r"(?:\S+\s+)*?(-[A-Za-z]*L\b|--location\b)", rest) or any(f'"${{{a}[@]}}"' in rest.split(" ")[0] for a, _ in arr_l):
                    continue
                bad.append(f"{b}:{i}: curl without -L: {s[:120]}")
        else:
            for m in PYL.finditer(line):
                n += 1
                if "L" not in m.group(1) and "--location" not in line:
                    bad.append(f"{b}:{i}: curl without -L: {s[:120]}")
for l in bad:
    print("REFUSED: " + l)
print(f"curl: {n} call(s) read, {len(bad)} without -L")
sys.exit(1 if bad or n == 0 else 0)
PY
