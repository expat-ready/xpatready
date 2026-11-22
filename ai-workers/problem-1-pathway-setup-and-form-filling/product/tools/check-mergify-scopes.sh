#!/usr/bin/env bash
# Mergify scopes (P-715, design/mergify-parallel-scopes-2026-11-19.md): .mergify.yml's file scopes and barrier files
# stay true to the code. Each fenced module's scope holds its module card's own `paths:` (the cards are the one map of
# the modules, P-615), every scope and barrier pattern matches a tracked file, and the product and pipeline queues use
# one and the same "pipeline paths" pattern (P-717 (a)); each area's screens, tests and feature files sit in its scope
# (path owners, P-785 (2) step 2). Run by check-guards.sh. US$0, no network.
#   bash product/tools/check-mergify-scopes.sh
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; ROOTD="$(cd "$TOOLS/../../../.." && pwd)"
python3 -I - "$ROOTD" <<'PY'
import os, re, subprocess, sys, yaml
root = sys.argv[1]; bad = []; n = 0
def braces(p):
    m = re.search(r"\{([^{}]*)\}", p)
    return [p] if not m else [x for a in m.group(1).split(",") for x in braces(p[:m.start()] + a + p[m.end():])]
def rx(g):
    o, i = "", 0
    while i < len(g):
        if g.startswith("**/", i): o += "(?:.*/)?"; i += 3
        elif g.startswith("**", i): o += ".*"; i += 2
        elif g[i] == "*": o += "[^/]*"; i += 1
        else: o += re.escape(g[i]); i += 1
    return re.compile(o + r"\Z")
cfg = yaml.safe_load(open(os.path.join(root, ".mergify.yml")))
files = subprocess.run(["git", "-C", root, "ls-files"], capture_output=True, text=True, check=True).stdout.split()
sc = (cfg.get("scopes") or {}); src = ((sc.get("source") or {}).get("files") or {})
CARDS = {"platform": "api-platform", "front-office": "api-front-office", "money": "api-client-money",
         "case-side": "api-cases", "forms-engine": "api-forms"}
for scope, card in CARDS.items():
    n += 1
    text = open(os.path.join(root, ".claude/rules/modules", card + ".md"), encoding="utf-8").read()
    want = {x for p in re.findall(r'^\s*-\s*"([^"]+)"\s*$', text.split("---")[1], re.M) for x in braces(p)}
    have = set((src.get(scope) or {}).get("include") or [])
    miss = sorted(want - have)
    if miss: bad.append(f"scope {scope}: lacks its card {card}'s paths {miss[:3]}{' …' if len(miss) > 3 else ''}")
# Path owners (P-785 (2) step 2, founder 22 Nov: two tracks never share a batch failure). Each area's own screens, tests and
# feature files sit in the area's scope: every web/src/modules/<area>/ folder is in the scope of that name; every
# tests/check_<id>* file whose id is an area's (pf, aud: platform; fo<digit>: front office, fo7 money too; cs, case_:
# case side; forms: forms engine) and every api/src/features/<area>-*.ts file is matched by that area's scope. So a new
# module folder, area test or feature file that no scope owns fails here, in the PR that adds it (with #2445: on every PR).
ST = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/"
OWN = {"platform": [r"web/src/modules/platform/", r"tests/check_(pf|aud)", r"api/src/features/platform-[^/]*\.ts$"],
       "front-office": [r"web/src/modules/front-office/", r"tests/check_fo[0-9]", r"api/src/features/front-office-[^/]*\.ts$"],
       "money": [r"tests/check_fo7", r"api/src/features/client-money-[^/]*\.ts$"],
       "case-side": [r"tests/check_(cs|case_)", r"api/src/features/case-[^/]*\.ts$"],
       "forms-engine": [r"tests/check_forms", r"api/src/features/form-[^/]*\.ts$"]}
def owners_bad(src, files):
    out = []
    inc = {k: [rx(g) for g in (v or {}).get("include") or []] for k, v in src.items()}
    for scope, pats in OWN.items():
        for pat in pats:
            r = re.compile(re.escape(ST) + pat)
            lost = [f for f in files if r.match(f) and not any(p.match(f) for p in inc.get(scope, []))]
            if lost: out.append(f"path owners: scope {scope} does not hold {len(lost)} of its files, first {lost[0]} (add its pattern to .mergify.yml)")
    for area in sorted({f[len(ST + "web/src/modules/"):].split("/")[0] for f in files if f.startswith(ST + "web/src/modules/") and f.count("/") > (ST + "web/src/modules/").count("/")}):
        if area.startswith("_"): continue   # _example: the template folder, no area's
        mine = [f for f in files if f.startswith(ST + "web/src/modules/" + area + "/")]
        if not any(all(p.match(f) for f in mine) for ps in inc.values() for p in ps):
            out.append(f"path owners: web/src/modules/{area}/ is in no scope: its PRs would batch with every other area's (add it to its area's scope in .mergify.yml)")
    return out
n += 1; bad += owners_bad(src, files)
# Self-test: each way of losing an owner is caught (this script cannot be mutation-tested by check-guards.sh --mutate,
# whose copy has no module cards; as check-queue-run-scope.sh, the self-test stands in).
def without(scope, frag):
    c = {k: {"include": [g for g in (v or {}).get("include") or [] if not (k == scope and frag in g)]} for k, v in src.items()}
    return c if c[scope]["include"] != ((src.get(scope) or {}).get("include") or []) else None
for scope, frag in (("platform", "web/src/modules/platform/"), ("front-office", "web/src/modules/front-office/"), ("platform", "tests/check_pf"),
                    ("platform", "tests/check_aud"), ("front-office", "tests/check_fo1"), ("money", "tests/check_fo7"), ("case-side", "tests/check_cs"),
                    ("forms-engine", "tests/check_forms"), ("platform", "features/platform-"), ("front-office", "features/front-office-"),
                    ("money", "features/client-money-"), ("case-side", "features/case-"), ("forms-engine", "features/form-")):
    n += 1; c = without(scope, frag)
    if c is None: bad.append(f"self-test: scope {scope} has no pattern holding {frag}, so removing it proves nothing")
    elif not owners_bad(c, files): bad.append(f"self-test: scope {scope} without its {frag} pattern still passes the path-owners check")
n += 1
if not owners_bad(src, files + [ST + "web/src/modules/case-side/routes.tsx"]): bad.append("self-test: a new web module folder (modules/case-side/) in no scope still passes the path-owners check")
n += 1
if not owners_bad(src, [f for f in files] + [ST + "api/src/features/platform-new-thing.ts", ST + "tests/check_pf99_new.ts"]) == []: bad.append("self-test: a new platform feature file and test, held by the scope's patterns, fail the path-owners check")
for name, pats in [(k, (v or {}).get("include") or []) for k, v in src.items()] + [("barrier_files", (sc.get("barrier_files") or {}).get("include") or [])]:
    for g in pats:
        n += 1
        if not any(rx(g).match(f) for f in files):
            bad.append(f"{name}: {g} matches no tracked file")
conds = {q["name"]: [c for c in q.get("queue_conditions") or [] if isinstance(c, str)] for q in cfg.get("queue_rules") or []}
pp = [c.split("~=", 1)[1].strip() for c in conds.get("product", []) if c.replace(" ", "").startswith("files~=^(?!")]
pl = [c.split("~=", 1)[1].strip() for c in conds.get("pipeline", []) if c.replace(" ", "").startswith("-files~=^(?!")]
n += 1
if not (pp and pl and pp == pl): bad.append(f"the product and pipeline queues do not share one pipeline pattern: {pp} / {pl}")
else:
    r = re.compile(pp[0])
    for f, pipe in ((".github/workflows/ci.yml", True), ("ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/x.sh", True),
                    ("ai-workers/problem-1-pathway-setup-and-form-filling/product/STATE.md", False),
                    ("ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/api/src/core.ts", False)):
        n += 1
        if (r.search(f) is None) != pipe: bad.append(f"pipeline pattern: {f} is{'' if pipe else ' not'} pipeline work, read the other way")
# The pipeline scope and the pipeline pattern name the same paths (review, round 1).
    pinc = [rx(g) for g in (src.get("pipeline") or {}).get("include") or []]
    for f in (".github/workflows/ci.yml", ".githooks/pre-push", ".mergify.yml", ".claude/skills/next/SKILL.md", "AGENTS.md",
              "CLAUDE.md", "ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/x.sh"):
        n += 1
        if not any(p.match(f) for p in pinc): bad.append(f"pipeline scope: {f} is pipeline work by the queue pattern, not by the scope")
        if r.search(f) is not None: bad.append(f"pipeline pattern: {f} is in the pipeline scope, not pipeline work by the pattern")
for b in bad: print(f"FAIL  {b}")
print(f"{'PASS' if not bad else 'FAIL'}  mergify scopes: {n} checks")
sys.exit(1 if bad else 0)
PY
