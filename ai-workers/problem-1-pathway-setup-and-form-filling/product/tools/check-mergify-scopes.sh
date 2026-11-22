#!/usr/bin/env bash
# Mergify scopes (P-715, design/mergify-parallel-scopes-2026-11-19.md): .mergify.yml's file scopes and barrier files
# stay true to the code. Each fenced module's scope holds its module card's own `paths:` (the cards are the one map of
# the modules, P-615), every scope and barrier pattern matches a tracked file, and the product and pipeline queues use
# one and the same "pipeline paths" pattern (P-717 (a)); each area's screens, tests and feature files sit in its scope
# (path owners, P-785 (2) step 2). Run by check-guards.sh, and by ci.yml on every pull request and batch (P-756 (2): job
# "fast", and job "ci" for notes; checked below). US$0, no network.
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
class Once(yaml.SafeLoader): pass   # a key given twice is refused: Mergify may keep the other copy (break m8)
def _once(loader, node, deep=False):
    keys = [loader.construct_object(k, deep=deep) for k, _ in node.value]
    dup = sorted({k for k in keys if keys.count(k) > 1}, key=str)
    if dup: raise SystemExit(f"FAIL  .mergify.yml gives the key {dup[0]!r} twice under one mapping\nFAIL  mergify scopes: 0 checks")
    return loader.construct_mapping(node, deep=deep)
Once.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _once)
cfg = yaml.load(open(os.path.join(root, ".mergify.yml")), Loader=Once)
files = [f for f in subprocess.run(["git", "-C", root, "ls-files", "-z"], capture_output=True, text=True, check=True).stdout.split("\0") if f]   # -z: spaces and accents (break m2)
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
       "front-office": [r"web/src/modules/front-office/", r"tests/check_fo(?!7)[0-9]", r"api/src/features/front-office-[^/]*\.ts$"],
       "money": [r"tests/check_fo7", r"api/src/features/client-money-[^/]*\.ts$"],
       "case-side": [r"tests/check_(cs|case_)", r"api/src/features/case-[^/]*\.ts$"],
       "forms-engine": [r"tests/check_forms", r"api/src/features/form-[^/]*\.ts$"]}
for need in ("platform", "front-office", "money", "case-side", "forms-engine", "migrations", "pipeline"):
    n += 1
    if need not in src: bad.append(f"scope {need} is missing from .mergify.yml (break m5)")
FOLDERS = {"platform": "platform", "front-office": "front-office", "client-money": "money", "money": "money",
           "case-side": "case-side", "cases": "case-side", "forms": "forms-engine", "forms-engine": "forms-engine"}
def owners_bad(src, files):
    out = []
    inc = {k: [rx(g) for g in (v or {}).get("include") or []] for k, v in src.items()}
    for scope, pats in OWN.items():
        for pat in pats:
            r = re.compile(re.escape(ST) + pat, re.I if pat.startswith("tests/") else 0)   # check_FO3 too (break m4)
            lost = [f for f in files if r.match(f) and not any(p.match(f) for p in inc.get(scope, []))]
            if lost: out.append(f"path owners: scope {scope} does not hold {len(lost)} of its files, first {lost[0]} (add its pattern to .mergify.yml)")
            if pat.startswith(("tests/", "api/src/features/")) and not pat.startswith("tests/check_fo(?!7)"):
                twice = sorted({k for f in files if r.match(f) for k, ps in inc.items() if k not in (scope, "migrations") and any(p.match(f) for p in ps)})
                if twice and not (scope == "money" and twice == ["front-office"]): out.append(f"path owners: files of scope {scope} ({pat}) are also in scope(s) {twice}")
    for area in sorted({f[len(ST + "web/src/modules/"):].split("/")[0] for f in files if f.startswith(ST + "web/src/modules/") and f.count("/") > (ST + "web/src/modules/").count("/")}):
        if area == "_example": continue   # the template folder, no area's (any other "_" folder is checked, break m3)
        mine = [f for f in files if f.startswith(ST + "web/src/modules/" + area + "/")]
        want = FOLDERS.get(area)   # the folder's own area scope, by name (break M1: any scope used to do)
        if want is None:
            out.append(f"path owners: web/src/modules/{area}/ names no area: add it to FOLDERS in this script with its scope, and to that scope in .mergify.yml")
            continue
        if not all(any(p.match(f) for p in inc.get(want, [])) for f in mine):
            out.append(f"path owners: web/src/modules/{area}/ is not wholly in its scope {want}: its PRs would batch with another area's (add it to {want} in .mergify.yml)")
        other = sorted(k for k, ps in inc.items() if k != want and any(p.match(f) for f in mine for p in ps))
        if other: out.append(f"path owners: web/src/modules/{area}/ is also in scope(s) {other}: only {want} holds it")
    # A feature file named after an API file registers that file: it sits in the API file's area scope (review m1).
    for f in files:
        if not re.fullmatch(re.escape(ST) + r"api/src/features/[^/]+\.ts", f): continue
        api = ST + "api/src/" + f.rsplit("/", 1)[1]
        for scope in OWN:
            if any(p.match(api) for p in inc.get(scope, [])) and not any(p.match(f) for p in inc.get(scope, [])):
                out.append(f"path owners: {f[len(ST):]} registers {api[len(ST):]} of scope {scope}, and that scope does not hold it")
    return out
n += 1; bad += owners_bad(src, files)
# Self-test: each way of losing an owner is caught (this script cannot be mutation-tested by check-guards.sh --mutate,
# whose copy has no module cards; as check-queue-run-scope.sh, the self-test stands in).
def without(scope, frag):
    c = {k: {"include": [g for g in (v or {}).get("include") or [] if not (k == scope and frag in g)]} for k, v in src.items()}
    return c if c.get(scope, {"include": []})["include"] != ((src.get(scope) or {}).get("include") or []) else None
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
if owners_bad(src, files + [ST + "api/src/features/platform-new-thing.ts", ST + "tests/check_pf99_new.ts"]) != owners_bad(src, files): bad.append("self-test: a new platform feature file and test, held by the scope's patterns, fail the path-owners check")
n += 1   # break M1: a new module folder filed under the wrong area's scope
c = {k: {"include": list((v or {}).get("include") or [])} for k, v in src.items()}; c.setdefault("case-side", {"include": []})["include"].append(ST + "web/src/modules/client-money/**")
if not any("client-money" in x for x in owners_bad(c, files + [ST + "web/src/modules/client-money/index.tsx"])): bad.append("self-test: web/src/modules/client-money/ filed under case-side still passes")
n += 1   # ... or in a second scope as well
c = {k: {"include": list((v or {}).get("include") or [])} for k, v in src.items()}; c.setdefault("money", {"include": []})["include"].append(ST + "web/src/modules/platform/**")
if not owners_bad(c, files): bad.append("self-test: web/src/modules/platform/ also in money still passes")
n += 1   # break m1 G1: a folder only partly held
c = {k: {"include": [g for g in (v or {}).get("include") or [] if not g.endswith("web/src/modules/platform/**")]} for k, v in src.items()}; c.setdefault("platform", {"include": []})["include"].append(ST + "web/src/modules/platform/*.tsx")
if not owners_bad(c, files): bad.append("self-test: web/src/modules/platform/ only partly in platform still passes")
for t in ("tests/check_fo0_x.ts", "tests/check_FO3_x.ts", "web/src/modules/_money/x.tsx", "web/src/modules/client money/x.tsx"):
    n += 1
    if not owners_bad({k: {"include": [g for g in (v or {}).get("include") or [] if "check_fo0" not in g]} for k, v in src.items()}, files + [ST + t]) and "check_fo" in t:
        bad.append(f"self-test: a new {t} in no scope still passes")
    elif "modules" in t and not owners_bad(src, files + [ST + t]): bad.append(f"self-test: a new {t} still passes")
for scope, frag in (("case-side", "tests/check_case_"), ("front-office", "tests/check_fo5"), ("case-side", "features/clients.ts"), ("forms-engine", "features/answer-keys.ts")):
    n += 1; c = without(scope, frag)
    if c is None: bad.append(f"self-test: scope {scope} has no pattern holding {frag}, so removing it proves nothing")
    elif not owners_bad(c, files): bad.append(f"self-test: scope {scope} without its {frag} pattern still passes the path-owners check")
for name, pats in [(k, (v or {}).get("include") or []) for k, v in src.items()] + [("barrier_files", (sc.get("barrier_files") or {}).get("include") or [])]:
    for g in pats:
        n += 1
        if re.search(r"[\[\]{}?]", g) or re.search(r"[^/]\*\*|\*\*[^/]", g):
            bad.append(f"{name}: {g} uses glob syntax this script and Mergify may read differently ([...], {{...}}, ?, or ** inside a path part): use plain * and whole-part **")

    for g in pats:
        n += 1
        p = rx(g)   # once per pattern, not per file (about 14k files: 22 s became 0.3 s)
        if not any(p.match(f) for f in files):
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
# P-756 (2): ci.yml runs this script on every pull request and batch, not behind a paths filter: in job "fast" (code and
# records) with no condition of its own, and in job "ci" on the notes path, so the PR that adds a module folder fails itself.
# A self-test first proves each way of losing that is caught (check-guards' --mutate copy has no module cards, so this
# script cannot be mutation-tested there; the self-test stands in, as in check-queue-run-scope.sh).
NOTES_IF = "env.MODE != 'same' && (env.KIND == 'notes')"
def ci_bad(text):
    ci = yaml.safe_load(text); on = ci.get("on", ci.get(True)) or {}; jobs = ci.get("jobs") or {}; out = []
    runs = lambda job, cond: [s for s in (jobs.get(job) or {}).get("steps") or [] if "check-mergify-scopes.sh" in (s.get("run") or "") and s.get("if") == cond]
    pr = on.get("pull_request", False) if isinstance(on, dict) else False
    if pr is False or (pr or {}).get("paths") or (pr or {}).get("paths-ignore"):
        out.append("ci.yml: no pull_request trigger without a paths filter, so this check cannot run on every PR")
    if not runs("fast", None): out.append("ci.yml: job fast does not run check-mergify-scopes.sh with no condition of its own (P-756 (2))")
    if not runs("ci", NOTES_IF): out.append("ci.yml: job ci does not run check-mergify-scopes.sh on the notes path (P-756 (2))")
    return out
citext = open(os.path.join(root, ".github/workflows/ci.yml"), encoding="utf-8").read()
for why, edit in (("the fast step gone", lambda t: re.sub(r"(every PR and batch, seconds\)\n(?:        #.*\n)*        run: bash \"\$P/tools/)check-mergify-scopes", r"\1check-off", t, count=1)),
                  ("the notes step gone", lambda t: re.sub(r"(as job \"fast\"\)\n        if: .*\n        run: bash \"\$P/tools/)check-mergify-scopes", r"\1check-off", t, count=1)),
                  ("a paths filter on pull_request", lambda t: re.sub(r"(?m)^  pull_request:$", "  pull_request:\n    paths: [\".mergify.yml\"]", t, count=1))):
    n += 1; t = edit(citext)
    if t == citext: bad.append(f"self-test: the edit '{why}' changed nothing in ci.yml, so it proves nothing")
    elif not ci_bad(t): bad.append(f"self-test: ci.yml with {why} still passes this check")
n += 1; bad += ci_bad(citext)
for b in bad: print(f"FAIL  {b}")
print(f"{'PASS' if not bad else 'FAIL'}  mergify scopes: {n} checks")
sys.exit(1 if bad else 0)
PY
