#!/usr/bin/env bash
# Claude Approvals policy check (lab register LR-144; P-849; schema read 28 Nov 2026 from code.claude.com/docs/en/
# approvals-policy). Done when: "approvals.yml on main validates; observe week log shows no unjudged merge and Code
# Review only on risky PRs" (the observe week is read on GitHub; this checks the file):
#   A0  .claude/approvals.yml parses; version 1; only the documented keys (an unknown key makes Approvals refuse the
#       file); each rule has purpose, paths and a verdict, advisory, findings or reuse.
#   A1  mode: observe (enforcing is a later, separate step).
#   A2  a "**" rule with a verdict: no changed file is left uncovered (an uncovered file "counts as passing").
#   A3  no "!pr/authors" set and no seat for people: P-849 (every PR is the founder's; such a seat never fills).
#   A4  claude/code_review is named only in rules that do not cover "**" (naming it bills a review at each push).
#   A5  each protected path (money, schema, migrations, permissions, pipeline, the agents' own files) gets a strict
#       verdict from some rule: claude comments, and approves only through an override that needs claude/code_review.
# First proves on fixtures that each rule fails when broken, then checks this checkout. Runs in ci (the tools step).
#   bash product/tools/check-approvals-policy.sh [repo-root]
# US$0, no network.
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; ROOTD="${1:-$(cd "$TOOLS/../../../.." && pwd)}"
python3 -c 'import yaml' 2>/dev/null || { echo "PyYAML is missing; nothing was checked"; exit 2; }
python3 -I - "$ROOTD" <<'PY'
import copy, os, re, sys, yaml
F = ".claude/approvals.yml"
S = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio"
TOP = {"version", "rules", "mode", "nested", "run", "locals"}
RULE = {"purpose", "paths", "if", "verdict", "override", "advisory", "reuse", "findings", "use", "mode", "nested", "run"}
PROTECTED = [f"{S}/api/src/client-money/ledger.ts", f"{S}/api/src/front-office/invoices/invoice.ts",
             f"{S}/prisma/migrations/20990101000000_x/migration.sql", f"{S}/prisma/schema/platform.prisma",
             f"{S}/api/src/platform/identity/guard.ts", f"{S}/api/src/core.ts", ".github/workflows/ci.yml", ".mergify.yml",
             ".githooks/pre-push", "CLAUDE.md", "AGENTS.md", "REVIEW.md", ".claude/approvals.yml", ".claude/settings.json",
             "ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/queue-gate.sh", f"{S}/tools/gate-b.mjs"]

def rx(g):
    out, i = "", 0
    while i < len(g):
        if g.startswith("**/", i): out += "(?:.*/)?"; i += 3
        elif g.startswith("**", i): out += ".*"; i += 2
        elif g[i] == "*": out += "[^/]*"; i += 1
        elif g[i] == "?": out += "[^/]"; i += 1
        else: out += re.escape(g[i]); i += 1
    return re.compile("^" + out + "$")
def covers(rule, path): return any(rx(g).match(path) for g in rule.get("paths") or [])
def strict(rule):
    v = rule.get("verdict") or {}
    if v.get("claude") not in ("comments", "blocks"): return False
    for o in rule.get("override") or []:
        if (o.get("verdict") or {}).get("claude") == "approves" and "claude/code_review" not in str(o.get("if", "")): return False
    return True

def check(p):
    errs = []
    if not isinstance(p, dict): return ["A0 the file is not a YAML mapping"]
    if p.get("version") != 1: errs.append("A0 version is not 1")
    for k in set(p) - TOP: errs.append(f"A0 unknown top-level key `{k}` (Approvals refuses the file)")
    rules = p.get("rules")
    if not isinstance(rules, list) or not rules: return errs + ["A0 no rules list"]
    for i, r in enumerate(rules, 1):
        if not isinstance(r, dict): errs.append(f"A0 rule {i} is not a mapping"); continue
        for k in set(r) - RULE: errs.append(f"A0 rule {i}: unknown key `{k}`")
        if not r.get("purpose") or not r.get("paths"): errs.append(f"A0 rule {i}: needs purpose and paths")
        if not any(k in r for k in ("verdict", "advisory", "findings", "reuse")): errs.append(f"A0 rule {i}: no verdict, advisory, findings or reuse")
    if p.get("mode") != "observe": errs.append("A1 mode is not observe")
    if not any("**" in (r.get("paths") or []) and "verdict" in r for r in rules if isinstance(r, dict)):
        errs.append('A2 no "**" rule with a verdict: a file no rule covers counts as passing')
    text = yaml.safe_dump(p)
    if "!pr/authors" in text: errs.append('A3 a "!pr/authors" set: no person can fill it (P-849)')
    for i, r in enumerate(rules, 1):
        for v in [r.get("verdict") or {}] + [o.get("verdict") or {} for o in r.get("override") or []]:
            if v.get("seats") not in (None, 0): errs.append(f"A3 rule {i}: a seat for people (seats {v.get('seats')}), none can fill it (P-849)")
        if "**" in (r.get("paths") or []) and "claude/code_review" in yaml.safe_dump(r):
            errs.append(f'A4 rule {i} covers "**" and names claude/code_review: a billed review at every push')
    for path in PROTECTED:
        if not any(covers(r, path) and strict(r) for r in rules if isinstance(r, dict)):
            errs.append(f"A5 {path}: no rule gives it a strict verdict (comments, approves only after claude/code_review)")
    return errs

root = sys.argv[1]
fp = os.path.join(root, F)
if not os.path.isfile(fp): print(f"FAIL  A0 {F} is missing"); sys.exit(1)
try: real = yaml.safe_load(open(fp, encoding="utf-8"))
except yaml.YAMLError as e: print(f"FAIL  A0 {F} does not parse: {str(e).splitlines()[0]}"); sys.exit(1)
errs = check(real)
for e in errs: print("FAIL  " + e)
if errs: sys.exit(1)
def m(fn):
    p = copy.deepcopy(real); fn(p); return p
def risky(p): return [r for r in p["rules"] if "**" not in r["paths"]]
fixtures = [
    ("an unknown key", m(lambda p: p.update(extra=1)), "A0"),
    ("enforce mode", m(lambda p: p.update(mode="enforce")), "A1"),
    ('no "**" rule', m(lambda p: p.update(rules=risky(p))), "A2"),
    ("a !pr/authors seat", m(lambda p: risky(p)[0]["verdict"].update(seats=[{"count": 1, "from": ["humans", "!pr/authors"]}])), "A3"),
    ("Code Review on the catch-all", m(lambda p: p["rules"][0].update(advisory=["claude/code_review"])), "A4"),
    ("migrations approved with no review", m(lambda p: [r["verdict"].update(claude="approves") for r in risky(p) if any("prisma" in g for g in r["paths"])]), "A5"),
    ("an override that approves with no review", m(lambda p: risky(p)[-1]["override"][0].update({"if": "true"})), "A5"),
]
bad = 0
for name, p, want in fixtures:
    got = sorted({e[:2] for e in check(p)})
    ok = want in got
    print(("ok    " if ok else "FAIL  ") + f"fixture: {name} -> {got or 'clean'}"); bad += not ok
if bad: print(f"FAIL  {bad} self-test fixture(s): the check cannot be trusted"); sys.exit(1)
print(f"PASS  {F}: observe mode, a catch-all rule, no seat for people, Code Review only on risky rules, {len(PROTECTED)} protected paths strict")
PY
