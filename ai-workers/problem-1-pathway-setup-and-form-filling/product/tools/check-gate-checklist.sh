#!/usr/bin/env bash
# Milestone gate checklist check (lab register LR-068; Done when: "The milestone-gate checklist in WAY-OF-WORKING names
# the ultra review and security pass; first gate run linked" — the run link is the gate's records line, not this check):
#   G1  WAY-OF-WORKING.md has a "## Milestone gate checklist" section.
#   G2  it names the deep review (`/code-review ultra` and this build's `/code-review max`) as a paid run (P-295b).
#   G3  it names the security pass (`/security-review`).
#   G4  it keeps both to gates only ("never per PR").
# First proves on fixtures that each rule fails when broken, then checks this checkout. Runs in ci (the tools step).
#   bash product/tools/check-gate-checklist.sh [WAY-OF-WORKING.md]
# US$0, no network.
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; F="${1:-$TOOLS/../WAY-OF-WORKING.md}"
python3 -I - "$F" <<'PY'
import re, sys
RULES = [("G2", "/code-review ultra"), ("G2", "/code-review max"), ("G2", "P-295b"), ("G3", "/security-review"),
         ("G4", "never per PR")]
def check(text):
    m = re.search(r"^## Milestone gate checklist[^\n]*\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    if not m: return ["G1 no '## Milestone gate checklist' section"]
    return [f"{g} the section does not say {s}" for g, s in RULES if s not in m.group(1)]
real = open(sys.argv[1], encoding="utf-8").read()
fixtures = [("the real page", real, None), ("section gone", real.replace("## Milestone gate checklist", "## Gate"), "G1"),
            ("no ultra review", real.replace("/code-review ultra", "/code-review"), "G2"),
            ("no security pass", real.replace("/security-review", "a check"), "G3"),
            ("per PR allowed", real.replace("never per PR", "also per PR"), "G4"),
            ("named only outside the section", re.sub(r"(## Milestone gate checklist[^\n]*\n)", r"\1\n## Other\n", real), "G2")]
bad = 0
for name, text, want in fixtures:
    got = sorted({e[:2] for e in check(text)})
    ok = (not got) if want is None else (want in got)
    print(("ok    " if ok else "FAIL  ") + f"fixture: {name} -> {got or 'clean'}"); bad += not ok
if bad: print(f"FAIL  {bad} self-test fixture(s): the check cannot be trusted"); sys.exit(1)
errs = check(real)
for e in errs: print("FAIL  " + e)
if errs: sys.exit(1)
print("PASS  WAY-OF-WORKING names the milestone gate's ultra review and security pass, gates only")
PY
