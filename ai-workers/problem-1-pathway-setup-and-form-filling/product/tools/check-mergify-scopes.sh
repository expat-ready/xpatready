#!/usr/bin/env bash
# Mergify scopes (P-715, design/mergify-parallel-scopes-2026-11-19.md): .mergify.yml's file scopes and barrier files
# stay true to the code. Each fenced module's scope holds its module card's own `paths:` (the cards are the one map of
# the modules, P-615), every scope and barrier pattern matches a tracked file, and the product and pipeline queues use
# one and the same "pipeline paths" pattern (P-717 (a)); each area's screens, tests and feature files sit in its scope
# (path owners, P-785 (2) step 2), and a track list (track-paths.txt) never repeats a scope's pattern (one source).
# Run by check-guards.sh, and by ci.yml on every pull request and batch (P-756 (2): job
# "fast", and job "ci" for notes; checked below). US$0, no network.
#   bash product/tools/check-mergify-scopes.sh
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; ROOTD="$(cd "$TOOLS/../../../.." && pwd)"
python3 -I - "$ROOTD" <<'PY'
import functools, os, re, subprocess, sys, yaml
root = sys.argv[1]; bad = []; n = 0
def braces(p):
    m = re.search(r"\{([^{}]*)\}", p)
    return [p] if not m else [x for a in m.group(1).split(",") for x in braces(p[:m.start()] + a + p[m.end():])]
@functools.lru_cache(maxsize=None)   # one compile per glob: track_copies asks per file (break 2971 round 2 m3)
def rx(g):
    o, i = "", 0
    while i < len(g):
        if g.startswith("**/", i): o += "(?:.*/)?"; i += 3
        elif g.startswith("**", i): o += ".*"; i += 2
        elif g[i] == "*": o += "[^/]*"; i += 1
        else: o += re.escape(g[i]); i += 1
    return re.compile(o + r"\Z")
class Once(yaml.SafeLoader): pass   # a key given twice is refused: Mergify may keep the other copy (break m8)
class Twice(Exception): pass
def _once(loader, node, deep=False):
    # the node's own keys only: a merge key (<<:) is skipped, and a key it brings in may be overridden here, as YAML
    # allows (review 2971 m2); construct_mapping does the merging (break round 2 m4)
    if sum(k.tag == "tag:yaml.org,2002:merge" for k, _ in node.value) > 1: raise Twice("<<")   # two merge keys (break m8c)
    keys = [loader.construct_object(k, deep=deep) for k, _ in node.value if k.tag != "tag:yaml.org,2002:merge"]
    dup = sorted({k for k in keys if keys.count(k) > 1}, key=str)
    if dup: raise Twice(dup[0])
    return loader.construct_mapping(node, deep=deep)
Once.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _once)
def load_once(text):
    try: return yaml.load(text, Loader=Once), None
    except Twice as e: return None, f".mergify.yml gives the key {e.args[0]!r} twice under one mapping"
    except yaml.YAMLError as e: return None, f".mergify.yml cannot be read as YAML: {str(e).splitlines()[0]} (break 2971 m8d)"
try: cfg, why = load_once(open(os.path.join(root, ".mergify.yml"), encoding="utf-8").read())
except (OSError, UnicodeDecodeError) as e: cfg, why = None, f".mergify.yml cannot be read: {e}"
if not why and not isinstance(cfg, dict): why = ".mergify.yml is not a mapping of keys (break 2971 round 2 m6)"
if why: print(f"FAIL  {why}\nFAIL  mergify scopes: 0 checks"); sys.exit(1)   # on stdout like every FAIL (review round 2 R2-4)
files = [f for f in subprocess.run(["git", "-C", root, "ls-files", "-z"], capture_output=True, text=True, check=True).stdout.split("\0") if f]   # -z: spaces and accents (break m2)
sc = (cfg.get("scopes") or {}); src = ((sc.get("source") or {}).get("files") or {}) if isinstance(sc, dict) and isinstance(sc.get("source") or {}, dict) else None
shape = [] if isinstance(src, dict) else ["scopes.source.files is not a mapping of scopes"]
for k, v in (src or {}).items():
    inc = (v or {}).get("include") if isinstance(v, dict) else None
    if not isinstance(inc, list) or not all(isinstance(g, str) for g in inc): shape.append(f"scope {k}: include is not a list of glob strings")
if shape: print("\n".join(f"FAIL  {x} (break 2971 round 3 m4)" for x in shape) + "\nFAIL  mergify scopes: 0 checks"); sys.exit(1)
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
# module folder, area test or feature file that no scope owns fails here, in the PR that adds it (on every PR: ci.yml runs it, #2445).
ST = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/"
OWN = {"platform": [r"web/src/modules/platform/", r"tests/check_(pf|aud)", r"api/src/features/platform-[^/]*\.ts$"],
       "front-office": [r"web/src/modules/front-office/", r"tests/check_fo(?!7)[0-9]", r"api/src/features/front-office-[^/]*\.ts$"],
       "money": [r"tests/check_fo7", r"api/src/features/client-money-[^/]*\.ts$"],
       "case-side": [r"tests/check_(cs|case_)", r"api/src/features/case-[^/]*\.ts$"],
       "forms-engine": [r"tests/check_forms", r"api/src/features/form-[^/]*\.ts$"]}
def missing(src):
    # SPD-2: the one "migrations" scope became one mig-<area> scope per schema file (migration-slots.py checks each)
    return [f"scope {need} is missing from .mergify.yml (break m5)" for need in ("platform", "front-office", "money", "case-side", "forms-engine", "pipeline") if need not in src] \
        + ([] if any(str(k).startswith("mig-") for k in src) else ["no mig-<area> migration scope in .mergify.yml (SPD-2; break m5)"])
n += 7; bad += missing(src)
def ambiguous(g):   # glob forms this script and Mergify may read differently
    return bool(re.search(r"[\[\]{}?]", g) or re.search(r"[^/]\*\*|\*\*[^/]", g))
# FOLDERS: a module folder's scope; None = a known area left out of every scope on purpose (say why on its line).
FOLDERS = {"platform": "platform", "front-office": "front-office", "client-money": "money", "money": "money",
           "case-side": "case-side", "cases": "case-side", "forms": "forms-engine", "forms-engine": "forms-engine"}
# The area names, written apart from FOLDERS: a None in FOLDERS can never erase one (break 2971 round 2 m1).
AREA_NAMES = frozenset({"platform", "front-office", "client-money", "money", "case-side", "cases", "forms", "forms-engine"})
def is_area(name): return name in AREA_NAMES or any(name.startswith(a + "-") for a in AREA_NAMES)
def owners_bad(src, files):
    out = []
    inc = {k: [rx(g) for g in (v or {}).get("include") or []] for k, v in src.items()}
    for scope, pats in OWN.items():
        for pat in pats:
            r = re.compile(re.escape(ST) + pat, re.I if pat.startswith("tests/") else 0)   # check_FO3 too (break m4)
            lost = [f for f in files if r.match(f) and not any(p.match(f) for p in inc.get(scope, []))]
            if lost: out.append(f"path owners: scope {scope} does not hold {len(lost)} of its files, first {lost[0]} (add its pattern to .mergify.yml)")
            if pat.startswith(("tests/", "api/src/features/")):   # every owned test or feature file, one scope only (follow-up 1, 2)
                twice = sorted({k for f in files if r.match(f) for k, ps in inc.items() if k != scope and any(p.match(f) for p in ps)})
                if twice: out.append(f"path owners: files of scope {scope} ({pat}) are also in scope(s) {twice}")
    for area in sorted({f[len(ST + "web/src/modules/"):].split("/")[0] for f in files if f.startswith(ST + "web/src/modules/") and f.count("/") > (ST + "web/src/modules/").count("/")}):
        mine = [f for f in files if f.startswith(ST + "web/src/modules/" + area + "/")]
        # A fixture folder (web/src/modules/README.md): the default build leaves out only its routes.tsx, so it is
        # skipped only when routes.tsx files are all it holds; any other file may ship (break 2971 m3, follow-up 3).
        if area.startswith("_") and mine == [ST + "web/src/modules/" + area + "/routes.tsx"]: continue   # only its own routes.tsx (round 2 m4)
        want = FOLDERS.get(area, "")   # the folder's own area scope, by name (break M1: any scope used to do)
        if want is None:   # recorded in FOLDERS as an area with no scope, on purpose: batched with the scope-less PRs
            held = sorted(k for k, ps in inc.items() if any(p.match(f) for f in mine for p in ps))
            if area in inc or area in OWN or is_area(area):
                out.append(f"path owners: web/src/modules/{area}/ is recorded with no scope, but {area} is an area: give it its scope (break 2971 m2)")
            elif held: out.append(f"path owners: web/src/modules/{area}/ is recorded with no scope, yet scope(s) {held} hold it")
            continue
        if want == "":
            out.append(f"path owners: web/src/modules/{area}/ names no area: add it to FOLDERS in this script with its scope, and to that scope in .mergify.yml")
            continue
        if not all(any(p.match(f) for p in inc.get(want, [])) for f in mine):
            out.append(f"path owners: web/src/modules/{area}/ is not wholly in its scope {want}: its PRs would batch with another area's (add it to {want} in .mergify.yml)")
        other = sorted(k for k, ps in inc.items() if k != want and any(p.match(f) for f in mine for p in ps))
        if other: out.append(f"path owners: web/src/modules/{area}/ is also in scope(s) {other}: only {want} holds it")
    # Every held test or feature file, listed by name or by glob, sits in one scope only (review 2971 m1).
    for f in files:
        if not f.startswith((ST + "tests/", ST + "api/src/features/")): continue
        held = sorted(k for k, ps in inc.items() if any(p.match(f) for p in ps))
        if len(held) > 1: out.append(f"path owners: {f[len(ST):]} is in scopes {held}: one scope only")
    # A feature file named after an API file registers that file: it sits in the API file's area scope (review m1).
    for f in files:
        if not re.fullmatch(re.escape(ST) + r"api/src/features/[^/]+\.ts", f): continue
        api = ST + "api/src/" + f.rsplit("/", 1)[1]
        for scope in OWN:
            if any(p.match(api) for p in inc.get(scope, [])):
                if not any(p.match(f) for p in inc.get(scope, [])):
                    out.append(f"path owners: {f[len(ST):]} registers {api[len(ST):]} of scope {scope}, and that scope does not hold it")
                other = sorted(k for k, ps in inc.items() if k != scope and any(p.match(f) for p in ps))
                if other: out.append(f"path owners: {f[len(ST):]} belongs to scope {scope} and is also in scope(s) {other}")
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
def mutated(edit):   # a copy of the scopes, changed by edit(c)
    c = {k: {"include": list((v or {}).get("include") or [])} for k, v in src.items()}; edit(c); return c
base = owners_bad(src, files)
for t in ("tests/check_fo0_x.ts", "tests/check_FO3_x.ts", "tests/check_Pf9_x.ts"):   # a new area test no scope's glob holds (case-blind: break m4)
    n += 1
    if owners_bad(src, files + [ST + t]) == base: bad.append(f"self-test: a new {t} that no scope holds still passes")
n += 1   # a new area folder only partly in its scope (break round 2 m6, R-G1)
c = mutated(lambda c: c["money"]["include"].append(ST + "web/src/modules/client-money/index.tsx"))
if not any("not wholly" in x for x in owners_bad(c, files + [ST + "web/src/modules/client-money/index.tsx", ST + "web/src/modules/client-money/b.tsx"])): bad.append("self-test: client-money/ only partly in money still passes")
n += 1   # an owned test also in a second scope, a migration slot included (follow-up 1, 2; SPD-2: mig-<area>)
c = mutated(lambda c: c["mig-platform"]["include"].append(ST + "tests/check_pf*"))
if not any("also in scope(s) ['mig-platform']" in x for x in owners_bad(c, files)): bad.append("self-test: check_pf* also in mig-platform still passes")
n += 1
c = mutated(lambda c: c["case-side"]["include"].append(ST + "tests/check_fo1*"))
if not any("also in scope(s) ['case-side']" in x for x in owners_bad(c, files)): bad.append("self-test: check_fo1* also in case-side still passes")
n += 1   # a named feature file in a second scope (follow-up 2)
c = mutated(lambda c: c["platform"]["include"].append(ST + "api/src/features/clients.ts"))
if not any("clients.ts belongs to scope case-side" in x for x in owners_bad(c, files)): bad.append("self-test: features/clients.ts also in platform still passes")
n += 1   # a missing scope, a key given twice, an ambiguous glob (break round 2 m6)
if not [x for x in src if str(x).startswith("mig-")]: bad.append("self-test: the real file has no mig-<area> migration scope")
n += 1
if load_once("a:\n  b: 1\n  b: 2\n")[1] is None: bad.append("self-test: a YAML mapping with a key given twice still loads")
if load_once("x: &a {k: 1}\ny:\n  <<: *a\n  j: 2\n")[1] is not None: bad.append("self-test: a YAML merge key is refused as a duplicate")
n += 1
if not ambiguous(ST + "web/src/modules/client-money**") or ambiguous(ST + "web/src/modules/client-money/**"): bad.append("self-test: the glob refusal reads client-money** and client-money/** the wrong way")
for scope, frag in (("case-side", "tests/check_case_"), ("front-office", "tests/check_fo5"), ("case-side", "features/clients.ts"), ("forms-engine", "features/answer-keys.ts")):
    n += 1; c = without(scope, frag)
    if c is None: bad.append(f"self-test: scope {scope} has no pattern holding {frag}, so removing it proves nothing")
    elif not owners_bad(c, files): bad.append(f"self-test: scope {scope} without its {frag} pattern still passes the path-owners check")
def globs_bad(src, barrier):
    return [f"{name}: {g} uses glob syntax this script and Mergify may read differently ([...], {{...}}, ?, or ** inside a path part): use plain * and whole-part **"
            for name, pats in [(k, (v or {}).get("include") or []) for k, v in src.items()] + [("barrier_files", barrier)] for g in pats if ambiguous(g)]
BARRIER = (sc.get("barrier_files") or {}).get("include") or []
n += 1; bad += globs_bad(src, BARRIER)
for name, pats in [(k, (v or {}).get("include") or []) for k, v in src.items()] + [("barrier_files", BARRIER)]:

    for g in pats:
        n += 1
        p = rx(g)   # once per pattern, not per file (about 14k files: 22 s became 0.3 s)
        # SPD-2: a per-area migration glob names folders still to come (<stamp>_<area>__<name>); migration-slots.py
        # mergify --check (below) proves those lines instead.
        if re.fullmatch(r".*/prisma/migrations/\*_[a-z0-9-]+__\*/\*\*", g): continue
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
# SPD-2 (P-802): the per-area migration slots are exactly what migration-slots.py generates from prisma/schema.
n += 1
r = subprocess.run([sys.executable, "-I", os.path.join(root, "ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/migration-slots.py"),
                    "mergify", "--check", os.path.join(root, ".mergify.yml")], capture_output=True, text=True, env={**os.environ, "ROOT": root})
if r.returncode: bad += [l[6:] for l in r.stdout.splitlines() if l.startswith("FAIL  ") and "mergify migration slots" not in l] or [f"migration-slots.py mergify --check: exit {r.returncode} {r.stderr.strip()[:200]}"]
# E6 (P-772): the product queue waits for a green pr-rules (body and size rules), as a plain top-level condition (inside an
# "or" another branch could satisfy it), next to ci. Undo with the .mergify.yml line, then this check.
n += 1
pc = [c.replace(" ", "") for c in conds.get("product", [])]
if "check-success=pr-rules" not in pc or "check-success=ci" not in pc:
    bad.append("the product queue does not wait for both check-success = pr-rules (E6, P-772) and check-success = ci")
# ... and pr-rules must then run on every PR that can reach that queue: its job never skips on a label read from the event
# (records-label.yml drops "records" on the same push that adds code; no run follows a GITHUB_TOKEN label change).
n += 1
pr = yaml.safe_load(open(os.path.join(root, ".github/workflows/pr-rules.yml"), encoding="utf-8"))
jif = str(((pr.get("jobs") or {}).get("pr-rules") or {}).get("if", ""))
if "label" in jif: bad.append(f"pr-rules.yml: the job skips on a label ({jif}), so a product PR can wait for a check that never runs")
# One source (Lead 4, 22 Nov 16:03 IST, for SPD-1 #3006): the path owners live in .mergify.yml's scopes only. A track
# list (product/tools/track-paths.txt, read by track-route.py) names a scope by "scope:<name>"; a raw line that repeats a
# scope's own include pattern is a second copy that can drift, so it is refused. A raw line naming part of a scope (a
# sub-folder) is allowed: that is the track's own split. Dormant while track-paths.txt does not exist.
def track_copies(text, scopes, files=None):
    """-> [(line number, track, line text, why, level)] for the track lines that are a second copy of a scope's pattern.
    FAIL: the same text (dir/**/* read as dir/**); a glob this script and Mergify may read differently; one scope named
    by two tracks (every PR of it would touch both, break 2971 m7); a one-file line whose own track already names that
    file's scope (a pure copy; a one-file line of another track's scope is that track's split, break m8a, round 2 m2).
    WARN only: a glob matching exactly today's files of a scope's wildcard pattern (dir/**/*, tests/**/check_pf*,
    break m6). It depends on the file count, so a PR deleting one file must not turn ci red over the track list
    (break round 2 M1, as track-route.py:110)."""
    own = {g: k for k, v in scopes.items() for g in ((v or {}).get("include") or []) if "*" in g}
    one = {g: k for k, v in scopes.items() for g in ((v or {}).get("include") or []) if "*" not in g}
    sets = {}
    if files is not None:
        for g, k in own.items():
            m = frozenset(f for f in files if rx(g).match(f))
            if m: sets.setdefault(m, (g, k))
    rows, prefix, named = [], "", {}
    for i, raw in enumerate(text.split("\n"), 1):
        parts = raw.split("#", 1)[0].split()
        if len(parts) != 2: continue
        k, v = parts
        if k == "prefix": prefix = v; continue
        if v.startswith("scope:"): named.setdefault(v[6:], []).append((i, k)); continue
        w = v[1:] if v.startswith("!") else v   # an exception that copies a scope pattern is a copy too (review 2971 m3)
        rows.append((i, k, v, w[1:] if w.startswith("/") else prefix + w))
    out = []
    for sc, who in named.items():
        if len({k for _, k in who}) > 1:
            i, k = who[-1]; out.append((i, k, f"scope:{sc}", f"scope {sc} is named by tracks {sorted({k for _, k in who})}: one track per scope", "FAIL"))
    for i, k, v, g in rows:
        if ambiguous(g): out.append((i, k, v, "uses glob syntax this script and Mergify may read differently", "FAIL")); continue
        g2 = re.sub(r"/\*\*/\*\*?$", "/**", g)   # dir/**/* and dir/**/** name the same files as dir/** (round 3 m3)
        if g in own or g2 in own: out.append((i, k, v, f"repeats scope {own.get(g) or own[g2]}'s own pattern", "FAIL")); continue
        if g in one and not v.startswith("!") and k in {t for _, t in named.get(one[g], [])}:   # a ! line carves the file out (round 3 m1)
            out.append((i, k, v, f"repeats a file of scope {one[g]}, which {k} already names", "FAIL")); continue
        if files is not None and "*" in g:
            m = frozenset(f for f in files if rx(g).match(f))
            if m in sets: out.append((i, k, v, f"matches exactly today's files of scope {sets[m][1]}'s pattern {sets[m][0][len(ST):] if sets[m][0].startswith(ST) else sets[m][0]}", "WARN"))
    return sorted(out)
TP = os.path.join(root, "ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/track-paths.txt")
def one_source(text, src, files=None):   # -> (FAIL lines, WARN lines)
    rows = track_copies(text, src, files)
    line = lambda i, k, v, why: f"one source: track-paths.txt:{i} '{k} {v}' {why}: name the scope or a sub-folder, never a second copy"
    return [line(*r[:4]) for r in rows if r[4] == "FAIL"], [line(*r[:4]) for r in rows if r[4] == "WARN"]
def real_list(tp, src, files):   # the wiring to the real file, self-tested on a made-up one (break 2971 round 2 m5)
    if os.path.exists(tp): return one_source(open(tp, encoding="utf-8").read(), src, files)
    if os.path.exists(os.path.join(os.path.dirname(tp), "track-route.py")):
        return ["one source: track-route.py exists but track-paths.txt does not: the one-source check would be off (move both together)"], []
    return [], []
n += 1
fails, warns = real_list(TP, src, files); bad += fails
for w in warns: print(f"WARN  {w}")
n += 1   # review 2971 Major 1: the missing-scope rule, the glob refusal loop and "names no area" each fire
if not missing({k: v for k, v in src.items() if not str(k).startswith("mig-")}): bad.append("self-test: a .mergify.yml without any mig-<area> scope still passes")
n += 1
if not globs_bad(mutated(lambda c: c["money"]["include"].append(ST + "web/src/modules/client-money**")), BARRIER): bad.append("self-test: a scope pattern client-money** is not refused")
n += 1
if not any("names no area" in x for x in owners_bad(src, files + [ST + "web/src/modules/client money/x.tsx"])): bad.append("self-test: a new web module folder that names no area still passes")
for scope, glob, what in (("front-office", "tests/check_fo7*", "check_fo7"), ("front-office", "api/src/features/platform-*.ts", "features/platform-"),
                          ("pipeline", "tests/**", "tests/"), ("pipeline", "api/src/features/clients.ts", "features/clients.ts")):   # break 2971 m4a-d
    n += 1
    if not owners_bad(mutated(lambda c, s=scope, g=glob: c[s]["include"].append(ST + g)), files): bad.append(f"self-test: {glob} also in {scope} still passes")
n += 1   # break 2971 m2: a recorded "no scope" entry that is really an area, or that a scope holds
FOLDERS["forms"] = None
if not any("is an area" in x for x in owners_bad(src, files + [ST + "web/src/modules/forms/page.tsx"])): bad.append("self-test: FOLDERS forms: None still passes")
FOLDERS["forms"] = "forms-engine"; FOLDERS["billing"] = None
if not any("yet scope(s)" in x for x in owners_bad(mutated(lambda c: c["platform"]["include"].append(ST + "web/src/modules/billing/**")), files + [ST + "web/src/modules/billing/page.tsx"])):
    bad.append("self-test: a no-scope folder that a scope holds still passes")
del FOLDERS["billing"]
n += 1   # break 2971 m3: a _ folder holding more than routes.tsx is checked
if not any("_cases/" in x for x in owners_bad(src, files + [ST + "web/src/modules/_cases/page.tsx"])): bad.append("self-test: a _ folder with a page in it is skipped")
if owners_bad(src, files + [ST + "web/src/modules/_demo/routes.tsx"]) != owners_bad(src, files): bad.append("self-test: a _ folder holding only routes.tsx is refused")
n += 1   # review 2971 m1: a test or feature file listed by name in a second scope
if not any("visitor-visa-filings.ts is in scopes" in x for x in owners_bad(mutated(lambda c: c["platform"]["include"].append(ST + "api/src/features/visitor-visa-filings.ts")), files)):
    bad.append("self-test: features/visitor-visa-filings.ts also in platform still passes")
n += 1   # review 2971 m2: a merge key may override a key it brings in
if load_once("x: &a {k: 1}\ny:\n  <<: *a\n  k: 2\n")[1] is not None: bad.append("self-test: a YAML merge override is refused as a duplicate")
n += 1   # review 2971 m4: the one-source FAIL loop itself
if len(one_source(f"prefix {ST}\ntrack-a tests/check_pf*\ntrack-a web/src/modules/platform/**/*\ntrack-b !api/src/features/platform-*.ts\n", src)[0]) != 3:
    bad.append("self-test: the one-source check does not give one FAIL per copy (plain, /**/* form, ! form)")
n += 1   # self-test, on a made-up track list
demo = f"prefix {ST}\ntrack-a scope:platform\ntrack-a tests/check_pf*\ntrack-a api/src/front-office/sales/**\ntrack-b /{ST}tests/check_cs*\n"
got = [(k, v) for _, k, v, _w, _l in track_copies(demo, src)]
if got != [("track-a", "tests/check_pf*"), ("track-b", f"/{ST}tests/check_cs*")]:
    bad.append(f"self-test: a track list repeating scope patterns is not caught exactly (got {got})")
n += 1   # break 2971 m4e, m6, m7, m8a: a feature copy, copies spelled differently, one scope in two tracks, one file of a scope
demo2 = (f"prefix {ST}\ntrack-a api/src/features/platform-*.ts\ntrack-a tests/check_pf**\ntrack-a tests/**/check_pf*\n"
         f"track-a scope:case-side\ntrack-b scope:case-side\ntrack-c api/src/clients.ts\ntrack-a api/src/front-office/sales/**\n"
         f"track-a api/src/front-office/sales**\ntrack-c scope:money\ntrack-c api/src/client-money/x.ts\n"
         f"track-a web/src/modules/platform/**/**\ntrack-b !api/src/clients.ts\n")
DEMO_FILES = [ST + "tests/check_pf1_a.ts", ST + "tests/check_pf2_b.ts", ST + "api/src/clients.ts"]   # made up: today's tests/ layout never matters (break 2971 round 3 M1)
f2, w2 = one_source(demo2, mutated(lambda c: c["money"]["include"].append(ST + "api/src/client-money/x.ts")), DEMO_FILES)
want_f = ["features/platform-*.ts", "check_pf**", "scope:case-side", "front-office/sales**", "client-money/x.ts", "platform/**/**"]
if len(f2) != len(want_f) or not all(any(x in l for l in f2) for x in want_f) or not any("tests/**/check_pf*" in l for l in w2) or any("clients.ts" in l for l in f2 + w2):
    bad.append(f"self-test: the one-source FAIL and WARN lines are not exactly as meant (FAIL {f2}; WARN {w2})")
n += 1   # break 2971 round 2 m5: the wiring to the real file, and YAML read errors
import tempfile
with tempfile.TemporaryDirectory() as d:
    tp = os.path.join(d, "track-paths.txt"); open(tp, "w").write(f"prefix {ST}\ntrack-a tests/check_pf*\n")
    if len(real_list(tp, src, files)[0]) != 1: bad.append("self-test: the real track list is not read")
    open(os.path.join(d, "track-route.py"), "w").write(""); os.remove(tp)
    if not real_list(tp, src, files)[0]: bad.append("self-test: track-route.py without its list is not refused")
n += 1
if load_once("a: [")[1] is None or load_once("a: &x {k: 1}\nb:\n  <<: *x\n  <<: *x\n")[1] is None: bad.append("self-test: a YAML read error or two merge keys load")
n += 1   # round 2 m1, m4
FOLDERS["cases"] = None
if not any("is an area" in x for x in owners_bad(src, files + [ST + "web/src/modules/cases/page.tsx"])): bad.append("self-test: FOLDERS cases: None still passes")
FOLDERS["cases"] = "case-side"
FOLDERS["platform-admin"] = None
if not any("is an area" in x for x in owners_bad(src, files + [ST + "web/src/modules/platform-admin/page.tsx"])): bad.append("self-test: FOLDERS platform-admin: None still passes")
del FOLDERS["platform-admin"]
if not any("_shared/" in x for x in owners_bad(src, files + [ST + "web/src/modules/_shared/deep/routes.tsx"])): bad.append("self-test: a _ folder with a nested routes.tsx is skipped")
for b in bad: print(f"FAIL  {b}")
print(f"{'PASS' if not bad else 'FAIL'}  mergify scopes: {n} checks")
sys.exit(1 if bad else 0)
PY
