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
#   A5  each protected path (money, billing, schema, migrations, permissions, system identity, firm-scope bypasses,
#       secrets, pipeline, deploy, the agents' own files and hooks) is covered by a rule that applies (no rule `if`, no
#       rule `mode`; a "!" item takes the path out) and is strict: claude comments or blocks, and approves only through
#       an override whose `if` is exactly "claude/code_review = pass". Each protected path must exist in the checkout.
#   A6  verdict and override keys and values are the documented ones (claude: approves|comments|blocks).
#   A8  every studio API file that declares a no-sign-in route (@OpenRead, @StaffSignIn, @SystemSignIn, or a controller
#       under api/public, api/link or api/hooks) is covered strictly as in A5: found from the code at each run.
#   Patterns with {a,b} or [ab] are refused (this check does not read them, so it cannot vouch for them).
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
# Real files (A5 also fails when one is gone, so the list cannot go stale); the migration is a sample name.
PROTECTED = [f"{S}/api/src/client-money/ledger-check.ts", f"{S}/ports/client-money.ts", f"{S}/api/src/platform/billing/webhook.ts",
             f"{S}/api/src/platform/billing/plan-change/service.ts", f"{S}/ports/entitlement.ts", f"{S}/api/src/cost-gate.ts",
             f"{S}/prisma/migrations/20990101000000_x/migration.sql", f"{S}/prisma/schema/platform.prisma",
             f"{S}/api/src/platform/identity/guard.ts", f"{S}/api/src/platform/system-identity/guard.ts",
             f"{S}/api/src/platform/system-console/support.bypass.ts", f"{S}/api/src/platform/secret-box/aes-gcm.ts",
             f"{S}/api/src/features/audit-access.ts", f"{S}/api/src/field-scope.ts", f"{S}/api/src/core.ts",
             ".github/workflows/ci.yml", ".mergify.yml", ".githooks/pre-push", "CLAUDE.md", "AGENTS.md", "REVIEW.md",
             ".claude/approvals.yml", ".claude/settings.json", "ai-workers/tools/prompt-log.sh", f"{S}/Dockerfile",
             "ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/queue-gate.sh", f"{S}/tools/gate-b.mjs"]
SAMPLE = {f"{S}/prisma/migrations/20990101000000_x/migration.sql"}
VERDICT = {"claude", "seats", "max_age"}
OVERRIDE = {"if", "verdict", "reuse", "findings", "purpose", "use"}
GATE = "claude/code_review = pass"
# A door: a read mark that opens a route, or any controller under api/public, api/link or api/hooks (a webhook or a
# link is reached signed out; its handler checks a signature or a token, which this check cannot see). Review I-1 on
# #4155: an unmarked write under api/hooks is open (ConfigReadGuard passes every non-GET without a read mark).
# Known limits: an aliased decorator (`OpenRead as X`) and a door in a .js file are not seen (route-sweep says the same).
DOOR = re.compile(r'@(?:OpenRead|StaffSignIn|SystemSignIn)\(|@Controller\(\s*["\']/?api/(?:public|link|hooks)\b')
def doors(root):
    """Studio API files declaring a no-sign-in route, read from the code (None when the folder is missing)."""
    api = os.path.join(root, S, "api", "src")
    if not os.path.isdir(api): return None
    out = []
    for d, _, files in os.walk(api):
        for n in files:
            if n.endswith(".ts") and not n.endswith(".d.ts"):
                p = os.path.join(d, n)
                if DOOR.search(open(p, encoding="utf-8", errors="replace").read()): out.append(os.path.relpath(p, root))
    return sorted(out)

def rx(g):
    out, i = "", 0
    while i < len(g):
        if g.startswith("**/", i): out += "(?:.*/)?"; i += 3
        elif g.startswith("**", i): out += ".*"; i += 2
        elif g[i] == "*": out += "[^/]*"; i += 1
        elif g[i] == "?": out += "[^/]"; i += 1
        else: out += re.escape(g[i]); i += 1
    return re.compile("^" + out + "$")
def covers(rule, path):
    """GitHub-style: a positive item matches and no "!" item takes the path out; a rule with its own `if` or `mode`
    may not apply ("While the if is false, the rule ... doesn't apply"; a rule-level observe "neither applies nor covers")."""
    if rule.get("if", True) not in (True, "true") or "mode" in rule: return False
    pats = [str(g) for g in rule.get("paths") or []]
    return any(rx(g).match(path) for g in pats if not g.startswith("!")) and not any(rx(g[1:]).match(path) for g in pats if g.startswith("!"))
def strict(rule):
    v = rule.get("verdict") or {}
    if v.get("claude") not in ("comments", "blocks"): return False
    for o in rule.get("override") or []:
        if (o.get("verdict") or {}).get("claude") == "approves" and str(o.get("if", "")).strip() != GATE: return False
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
        if any(c in str(g) for g in r.get("paths") or [] for c in "{["): errs.append(f"A0 rule {i}: a {{a,b}} or [ab] pattern this check cannot read")
        for v in [r.get("verdict")] + [o.get("verdict") for o in r.get("override") or [] if isinstance(o, dict)]:
            if v is None: continue
            if not isinstance(v, dict): errs.append(f"A6 rule {i}: a verdict that is not a mapping"); continue
            for k in set(v) - VERDICT: errs.append(f"A6 rule {i}: unknown verdict key `{k}`")
            if v.get("claude") not in (None, "approves", "comments", "blocks"): errs.append(f"A6 rule {i}: claude: {v.get('claude')} is not approves, comments or blocks")
        for o in r.get("override") or []:
            for k in set(o if isinstance(o, dict) else {}) - OVERRIDE: errs.append(f"A6 rule {i}: unknown override key `{k}`")
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
        if path not in SAMPLE and not os.path.isfile(os.path.join(ROOT, path)):
            errs.append(f"A5 {path} is not in this checkout: the protected list (check-approvals-policy.sh) is stale"); continue
        if not any(covers(r, path) and strict(r) for r in rules if isinstance(r, dict)):
            errs.append(f"A5 {path}: no rule gives it a strict verdict (comments, approves only after claude/code_review)")
    found = doors(ROOT)
    if found is None: errs.append(f"A8 {S}/api/src is missing: no-sign-in doors could not be read")
    elif not found: errs.append("A8 no file declares a no-sign-in route: the door pattern no longer matches the code")
    for path in found or []:
        if not any(covers(r, path) and strict(r) for r in rules if isinstance(r, dict)):
            errs.append(f"A8 {path} declares a no-sign-in route and no rule gives it a strict verdict")
    return errs

root = ROOT = sys.argv[1]
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
    ('a "!" item takes client money out', m(lambda p: risky(p)[0]["paths"].append("!**/client-money/**")), "A5"),
    ("a risky rule switched off by its own if", m(lambda p: risky(p)[0].update({"if": "false"})), "A5"),
    ("a risky rule in its own observe mode", m(lambda p: risky(p)[0].update(mode="observe")), "A5"),
    ("an override on a failed review", m(lambda p: risky(p)[0]["override"][0].update({"if": "claude/code_review != pass"})), "A5"),
    ("a misspelt verdict", m(lambda p: p["rules"][0]["verdict"].update(claude="aproves")), "A6"),
    ("a brace pattern", m(lambda p: risky(p)[0]["paths"].append("**/{a,b}.ts")), "A0"),
    ("the no-sign-in doors rule removed", m(lambda p: p.update(rules=[r for r in p["rules"] if not r["purpose"].startswith("No-sign-in doors")])), "A8"),
]
bad = 0
for name, p, want in fixtures:
    got = sorted({e[:2] for e in check(p)})
    ok = want in got
    print(("ok    " if ok else "FAIL  ") + f"fixture: {name} -> {got or 'clean'}"); bad += not ok
if bad: print(f"FAIL  {bad} self-test fixture(s): the check cannot be trusted"); sys.exit(1)
print(f"PASS  {F}: observe mode, a catch-all rule, no seat for people, Code Review only on risky rules, {len(PROTECTED)} protected paths and {len(doors(ROOT))} no-sign-in door files strict")
PY
