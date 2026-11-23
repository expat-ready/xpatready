#!/usr/bin/env bash
# QA-449 (R1.16): .github/workflows/skeleton.yml (PF-7's container proof: build the image, compose it beside
# PostgreSQL, migrations, /api/health, the first page, /api/platform/me after sign-in, seeded fails) runs on the code
# that lands on main. It evaluates the job's `if:` under six scenarios (a builder's draft PR, a ready PR, a Mergify
# batch PR (mergify/merge-queue/*, a draft by design), another mergify/* draft, a dispatch, a draft whose branch only
# contains the batch prefix) and reads the triggers: pull_request (types opened, synchronize, ready_for_review) with
# every path that goes into the image, the compose file, the smoke script and this workflow; workflow_dispatch; and
# no push trigger (P-85). The expression reader is check-queue-run-scope.sh's own (one reader, loaded from that file, never a second copy). A self-test first proves
# that six breakages fail. Reads files only, US$0, under a second.
#   bash product/tools/check-skeleton-scope.sh [path to skeleton.yml]
set -u
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
exec python3 -I - "${1:-$ROOT/.github/workflows/skeleton.yml}" "$ROOT/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/check-queue-run-scope.sh" <<'PY'
import copy, re, sys, yaml

wf_path, reader_path = sys.argv[1], sys.argv[2]
src = open(reader_path).read()
m = re.search(r"^TOK = .*?(?=^def truthy)", src, re.S | re.M)
if not m or "def evaluate" not in m.group(0):
    print(f"FAIL  could not load the expression reader (TOK .. evaluate) from {reader_path}"); sys.exit(1)
ns = {"re": re}
exec(m.group(0), ns)
evaluate = ns["evaluate"]

R = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/"
S = R + "studio/"
# Everything that goes into the image (the Dockerfile's COPY lines), the compose file, the smoke script and this workflow.
NEEDED_PATHS = [S + p for p in ("api/**", "web/**", "engine/**", "contracts/**", "prisma/**", "samples/**", "package.json",
                                "package-lock.json", "prisma.config.ts", "Dockerfile", "Dockerfile.dockerignore", "deploy/**",
                                "tools/skeleton-smoke.sh")] + \
               [R + "contracts/**", R + "p2/*.ts", R + "p5/**/*.ts", R + "env/node/**", ".github/workflows/skeleton.yml"]
# A batch PR only ever arrives as "opened" (Mergify makes a new branch per batch); a builder's PR runs when made ready.
NEEDED_TYPES = ["opened", "synchronize", "ready_for_review"]

def ctx(event, draft=False, ref="claude/runtime-x"):
    pr = {"draft": draft, "head": {"ref": ref}, "number": 7} if event == "pull_request" else None
    return {"github": {"event_name": event, "event": {"pull_request": pr} if pr else {}, "ref": "refs/heads/main"}}

SCENARIOS = [  # (label, context, must the job run?)
    ("a builder's draft PR (P-371 (1): the guard only)", ctx("pull_request", True), False),
    ("a ready PR", ctx("pull_request", False), True),
    ("a Mergify batch PR (mergify/merge-queue/*, draft): QA-449", ctx("pull_request", True, "mergify/merge-queue/239e0f9901"), True),
    ("another mergify/* draft (not a batch)", ctx("pull_request", True, "mergify/bp/main/pr-1"), False),
    ("a draft whose branch only contains the batch prefix", ctx("pull_request", True, "claude/mergify/merge-queue/x"), False),
    ("a dispatch (the Lead on main)", ctx("workflow_dispatch"), True),
]

def problems(wf):
    out = []
    on = wf.get("on", wf.get(True)) or {}
    pr = on.get("pull_request") if isinstance(on, dict) else None
    if not isinstance(pr, dict): out.append("trigger: no pull_request block")
    else:
        paths = pr.get("paths") or []
        for p in NEEDED_PATHS:
            if p not in paths: out.append(f"trigger: pull_request paths lack {p}")
        types = pr.get("types")
        if types is not None:
            for t in NEEDED_TYPES:
                if t not in types: out.append(f"trigger: pull_request types lack {t}")
    if not isinstance(on, dict) or "workflow_dispatch" not in on: out.append("trigger: no workflow_dispatch")
    if isinstance(on, dict) and "push" in on: out.append("trigger: a push trigger (P-85: nothing on a plain push)")
    job = (wf.get("jobs") or {}).get("skeleton")
    if not job: return out + ["job: no job named skeleton"]
    cond = str(job.get("if", "true"))
    for label, c, want in SCENARIOS:
        try: got = bool(evaluate(cond, c))
        except Exception as e: out.append(f"job if: cannot read ({e})"); break
        if got != want: out.append(f"job if: {label}: {'runs' if got else 'skipped'}, expected {'run' if want else 'skip'}")
    return out

wf = yaml.safe_load(open(wf_path))

# Self-test: each breakage must be caught.
def mut_if(w, v): w["jobs"]["skeleton"]["if"] = v
def mut_on(w, f): f(w.get("on", w.get(True)))
MUTANTS = [
    ("the batch clause removed (the old condition)", lambda w: mut_if(w, "github.event_name != 'pull_request' || github.event.pull_request.draft == false")),
    ("every draft runs", lambda w: mut_if(w, "true")),
    ("dispatch removed", lambda w: mut_on(w, lambda on: on.pop("workflow_dispatch", None))),
    ("deploy/** dropped from paths", lambda w: mut_on(w, lambda on: on["pull_request"]["paths"].remove(S + "deploy/**"))),
    ("engine/** dropped from paths", lambda w: mut_on(w, lambda on: on["pull_request"]["paths"].remove(S + "engine/**"))),
    ("types cut to synchronize (batches never arrive)", lambda w: mut_on(w, lambda on: on["pull_request"].__setitem__("types", ["synchronize"]))),
]
bad = 0
for label, f in MUTANTS:
    w = copy.deepcopy(wf)
    try: f(w)
    except Exception as e: print(f"FAIL  self-test: could not apply '{label}': {e}"); bad += 1; continue
    if problems(w): print(f"PASS  self-test: caught '{label}'")
    else: print(f"FAIL  self-test: '{label}' was not caught"); bad += 1

found = problems(wf)
for label, c, want in SCENARIOS:
    if not any(label in p for p in found): print(f"PASS  {label}: {'runs' if want else 'skipped'}")
for p in found: print(f"FAIL  {p}")
if not [p for p in found if p.startswith("trigger")]: print("PASS  triggers: pull_request on the image's paths, workflow_dispatch, no push")
bad += len(found)
print(f"check-skeleton-scope: {'all passed' if not bad else f'{bad} failed'}")
sys.exit(1 if bad else 0)
PY
