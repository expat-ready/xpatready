#!/usr/bin/env bash
# OS-32 (P-319, P-425: no combination key, form number or program-specific branch in engine code; the slice guards were
# retired 8 Nov, so nothing checked it since). Reads the studio engine's code lines (.ts .tsx, comments left out; tests,
# __tests__, fixtures, *.test.* and *.spec.* not read) and finds:
#   form     a form number in code: IMM, IRM, EMP or CIT then 4 digits, any case, joined by nothing, a space, - or _
#            ("IMM 5257", "imm5476"); comments may cite forms, code may not decide by one;
#   branch   a combination, program or category key compared with a literal (combinationKey === "e1-...").
# KNOWN: the findings on main when this check landed (file and finding); each only warns, until its code moves to
# configuration and the entry is deleted here. A finding not in KNOWN fails. No network, US$0.
#   bash product/tools/engine-hardcode.sh [<engine dir>]   Exit 0: no new finding · 1: one (each named) · 2: no engine.
# Test: check-engine-hardcode.sh.
set -u
E="${1:-$(cd "$(dirname "$0")/../.." && pwd)/prototype/studio/engine}"
[ -d "$E" ] || { echo "engine-hardcode: no engine folder at $E: nothing was checked"; exit 2; }
KNOWN="
runtime/team.ts|imm5476
"
python3 -I - "$E" "$KNOWN" <<'PY'
import os, re, sys
eng, known = sys.argv[1], {l.strip() for l in sys.argv[2].split("\n") if l.strip()}
FORM = re.compile(r"(?<![A-Za-z0-9])(?:IMM|IRM|EMP|CIT)[ _-]?\d{4}[A-Z]?(?![A-Za-z0-9])", re.I)
KEY = r"[A-Za-z_.]*(?:combination|program|category)_?[Kk]ey"
BRANCH = re.compile(r"\b" + KEY + r"\s*[!=]==?\s*[\"'`]|[\"'`]\s*[!=]==?\s*" + KEY + r"\b|\bcase\s+[\"'`][^\"'`]*[\"'`]\s*:(?=.*\b" + KEY + r")")
def code_lines(text):
    block = False
    for n, line in enumerate(text.split("\n"), 1):
        s = line.strip()
        if block:
            if "*/" not in s: continue
            block = False; s = s.split("*/", 1)[1].strip()
        if s.startswith("/*"):
            if "*/" not in s: block = True; continue
            s = s.split("*/", 1)[1].strip()
        if s.startswith(("//", "*")): continue
        yield n, re.sub(r"(^|\s)//\s.*$", "", s)
new = warn = 0; seen = 0
for root, dirs, files in os.walk(eng):
    dirs[:] = sorted(d for d in dirs if d not in ("__tests__", "fixtures", "node_modules", "tests"))
    for f in sorted(files):
        if not f.endswith((".ts", ".tsx")) or re.search(r"\.(test|spec)\.tsx?$", f): continue
        p = os.path.join(root, f); rel = os.path.relpath(p, eng).replace(os.sep, "/"); seen += 1
        for n, s in code_lines(open(p, encoding="utf-8", errors="replace").read()):
            hits = [("form", m.group(0)) for m in FORM.finditer(s)] + [("branch", m.group(0)) for m in BRANCH.finditer(s)]
            for kind, h in hits:
                key = f"{rel}|{re.sub(r'[ _-]', '', h).lower() if kind == 'form' else h}"
                if key in known: print(f"WARN  engine/{rel}:{n}: {kind} {h!r}, known since OS-32: move it to configuration (P-425)"); warn += 1
                else:
                    what = "a form number in engine code" if kind == "form" else "a key compared with a literal in engine code"
                    print(f"FAIL  engine/{rel}:{n}: {what} ({h!r}): put it on a configuration line, a fee basis or a setting, never in the engine (P-319, P-425)"); new += 1
if not seen: print(f"engine-hardcode: no .ts file under {eng}: nothing was checked"); sys.exit(2)
print(f"engine-hardcode: {seen} files, {new} new finding(s), {warn} known")
sys.exit(1 if new else 0)
PY
