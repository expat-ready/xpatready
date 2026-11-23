#!/usr/bin/env bash
# ENF-746c (P-746, founder 20 Nov): in .github/workflows/ci.yml the records rules (check-docs.sh, decision-impact.sh:
# STATE, RULES and DECISIONS locks, lock notes, the rule register, decision impact) run on a pull request and are
# skipped in a merge-queue run (kind's queue output, or a merge_group event), while every code step a pull request runs,
# and the batch-only code steps (suites, packs, regression, types, gate B), still run in the batch. It evaluates each
# job's and step's `if:` (a small GitHub-expression reader) under six scenarios: code and notes changes, each as a
# pull request, a Mergify batch PR (mergify/merge-queue/*) and a merge_group event. A self-test first proves five
# breakages fail. Reads the file only, US$0, under a second.
#   bash product/tools/check-queue-run-scope.sh [path to ci.yml]
set -u
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
exec python3 -I - "${1:-$ROOT/.github/workflows/ci.yml}" <<'PY'
import re, sys, yaml

# A records step runs one of them (a line starting `bash .../check-docs.sh`), not one that only names it in a message.
RECORDS = re.compile(r"^\s*bash\s+\"?\$P/tools/(check-docs|decision-impact)\.sh", re.M)
# Bookkeeping that was pull-request-only before ENF-746c (P-371 (3): a batch's verdict is never remembered); no check.
PR_ONLY = ("remember the green verdict", "upload the verdict")
# Code steps that must run in a merge-queue batch of code: (label, pattern on the step's run text).
CODE = [("push guard", r"push-guard\.sh"), ("route has a screen", r"route-has-screen\.mjs"),
        ("set-up and build", r"cloud-setup\.sh"), ("test databases", r"check-test-dbs\.sh"),
        ("graph", r"graph\.mjs"), ("explicit-any count", r"count-any\.mjs"), ("tools' own checks", r"check-write-token\.sh"),
        ("port contracts", r"check-port-contracts\.mjs"), ("gate B packs", r"gate-b\.mjs"),
        ("no personal data in logs", r"scan-logs\.ts"), ("studio suites on the parts", r"run-suites\.sh"),
        ("packs by diff and the protected set", r"works-set\.mjs"), ("type check", r"typecheck\.mjs"),
        ("type check's own check", r"check-typecheck\.sh"), ("this test", r"check-queue-run-scope\.sh")]

# check-skeleton-scope.sh loads TOK .. evaluate from here by regex, up to `def truthy`: keep that block self-contained
# and keep the name truthy.
TOK = re.compile(r"\s*(?:('(?:[^']|'')*')|(==|!=|&&|\|\||<=|>=|[!(),<>])|([A-Za-z_][\w\-]*(?:\.(?:[\w\-]+|\*))*)|(\d+))")

def lookup(path, ctx):
    cur = ctx
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur: cur = cur[part]
        else: return None
    return cur

def evaluate(expr, ctx):
    e = expr.strip()
    m = re.fullmatch(r"\$\{\{(.*)\}\}", e, re.S)
    if m: e = m.group(1)
    toks, pos = [], 0
    e = e.strip()
    while pos < len(e):
        t = TOK.match(e, pos)
        if not t or t.end() == pos: raise ValueError(f"cannot read expression at: {e[pos:pos+30]!r}")
        pos = t.end()
        s, op, ident, num = t.groups()
        if s is not None: toks.append(("v", s[1:-1].replace("''", "'")))
        elif op: toks.append(("o", op))
        elif num: toks.append(("v", num))
        elif ident in ("true", "false"): toks.append(("v", ident == "true"))
        elif ident == "null": toks.append(("v", None))
        else: toks.append(("i", ident))
    i = 0
    def peek(): return toks[i] if i < len(toks) else (None, None)
    def take(): nonlocal i; i += 1; return toks[i - 1]
    def s_(v): return "" if v is None else ("true" if v is True else "false" if v is False else str(v))
    def orx():
        v = andx()
        while peek() == ("o", "||"): take(); r = andx(); v = v if v else r
        return v
    def andx():
        v = eqx()
        while peek() == ("o", "&&"): take(); r = eqx(); v = r if v else v
        return v
    def eqx():
        v = unary()
        while peek()[0] == "o" and peek()[1] in ("==", "!="):
            op = take()[1]; r = unary()
            same = s_(v).lower() == s_(r).lower() if not (isinstance(v, bool) or isinstance(r, bool)) else s_(v) == s_(r)
            v = same if op == "==" else not same
        return v
    def unary():
        if peek() == ("o", "!"): take(); return not unary()
        return prim()
    def prim():
        k, v = take()
        if (k, v) == ("o", "("):
            r = orx(); assert take() == ("o", ")"); return r
        if k == "v": return v
        if k == "i":
            if peek() == ("o", "("):
                take(); args = []
                if peek() != ("o", ")"):
                    args.append(orx())
                    while peek() == ("o", ","): take(); args.append(orx())
                assert take() == ("o", ")")
                f = v.lower()
                if f in ("success", "always"): return True
                if f in ("failure", "cancelled"): return False
                if f == "startswith": return s_(args[0]).lower().startswith(s_(args[1]).lower())
                if f == "contains":
                    return (args[1] in args[0]) if isinstance(args[0], list) else s_(args[1]).lower() in s_(args[0]).lower()
                if f == "format": return re.sub(r"\{(\d+)\}", lambda m: s_(args[1 + int(m.group(1))]), s_(args[0]))
                raise ValueError(f"unknown function {v}")
            return lookup(v, ctx)
        raise ValueError(f"unexpected token {v!r}")
    r = orx()
    if i != len(toks): raise ValueError(f"trailing tokens in {expr!r}")
    return r

def truthy(v): return bool(v)   # as GitHub: false, null, 0 and "" are falsy; any other string (even "false") is truthy

def scenario(kind, mode):
    queue = mode == "batch"
    pr = None if mode == "merge_group" else {
        "draft": queue, "head": {"ref": "mergify/merge-queue/abc" if queue else "claude/runtime-x"},
        "number": 1, "labels": [], "user": {"login": "mergify[bot]" if queue else "a-builder"}}
    suites = queue  # kind.outputs.suites: a batch (a merge_group event is not read as a batch by kind: the guard reads the event)
    code = kind == "code"
    out = {"kind": kind, "queue": "true" if queue else "false", "suites": "true" if suites else "false", "mode": "",
           "shards": "[1,2]" if code and suites else "[]", "dpacks": '[{"caps":"C1.1"}]' if code and suites else "",
           "mbase": "abc", "battempt": "1", "verdict": "", "base": "abc"}
    return {"github": {"event_name": "merge_group" if mode == "merge_group" else "pull_request", "run_attempt": "1",
                       "event": {"pull_request": pr} if pr else {}, "head_ref": pr["head"]["ref"] if pr else ""},
            "inputs": {}, "vars": {}, "needs": {"kind": {"outputs": out, "result": "success"},
            "regression-plan": {"outputs": {"groups": '[{"caps":"C1.1"}]' if code and suites else ""}, "result": "success"}},
            "steps": {"k": {"outputs": {"kind": kind, "suites": out["suites"]}}, "b": {"outputs": {}}}}

def run_steps(wf, ctx):
    """[(job, step label, run text)] for every step that runs in this scenario."""
    ran_jobs, result = set(), []
    jobs = wf["jobs"]
    order, seen = [], set()
    def visit(j):
        if j in seen: return
        seen.add(j)
        needs = jobs[j].get("needs") or []
        for n in ([needs] if isinstance(needs, str) else needs): visit(n)
        order.append(j)
    for j in jobs: visit(j)
    for j in order:
        job = jobs[j]
        needs = job.get("needs") or []; needs = [needs] if isinstance(needs, str) else needs
        cond = str(job.get("if", "success()"))
        status_fn = re.search(r"\b(always|cancelled|failure|success)\(\)", cond) and not re.fullmatch(r"\s*success\(\)\s*", cond)
        if not status_fn and not all(n in ran_jobs for n in needs): continue
        if not truthy(evaluate(cond, ctx)): continue
        ran_jobs.add(j)
        env = {}
        for k, v in (job.get("env") or {}).items():
            env[k] = evaluate(v, ctx) if isinstance(v, str) and "${{" in v else v
        jctx = dict(ctx, env=env)
        for n, st in enumerate(job.get("steps") or []):
            if "if" in st and not truthy(evaluate(str(st["if"]), jctx)): continue
            result.append((j, st.get("name") or st.get("uses") or f"step {n + 1}", st.get("run", "") or ""))
    return result

def check(text):
    wf = yaml.safe_load(text)
    if True in wf and "on" not in wf: wf["on"] = wf.pop(True)
    bad = []
    runs = {(k, m): run_steps(wf, scenario(k, m)) for k in ("code", "notes") for m in ("pr", "batch", "merge_group")}
    def rec(steps): return [(j, n) for j, n, r in steps if RECORDS.search(r)]
    for k in ("code", "notes"):
        if not rec(runs[(k, "pr")]): bad.append(f"{k} pull request: no records-rules step runs (check-docs.sh, decision-impact.sh)")
        for m in ("batch", "merge_group"):
            for j, n in rec(runs[(k, m)]): bad.append(f"{k} {m}: records step still runs in a merge-queue run: {j} / {n}")
    pr_ran = {(j, n) for j, n, r in runs[("code", "pr")] if not RECORDS.search(r) and not n.startswith(PR_ONLY)}
    q_ran = {(j, n) for j, n, r in runs[("code", "batch")]}
    for j, n in sorted(pr_ran - q_ran): bad.append(f"code batch: a step a pull request runs is skipped in the batch: {j} / {n}")
    for label, pat in CODE:
        hits = [(j, n) for j, n, r in runs[("code", "batch")] if re.search(pat, r)]
        if not hits: bad.append(f"code batch: no step runs {label} ({pat})")
    for (k, m), steps in runs.items():
        print(f"  {k:5} {m:11}: {len(steps):2} steps run, records steps {len(rec(steps))}")
    return bad

src = open(sys.argv[1]).read()
# Self-test: five breakages must each fail (a checker that passes everything proves nothing).
FAST = "        if: env.QUEUE != 'true' && github.event_name != 'merge_group'\n"
muts = [("records step loses its queue guard", lambda s: s.replace(FAST, "", 1)),
        ("records step guarded only by the branch, not merge_group", lambda s: s.replace(FAST, "        if: env.QUEUE != 'true'\n", 1)),
        ("type check skipped in a batch", lambda s: s.replace("        run: node \"$P/tools/typecheck.mjs\"", "        if: needs.kind.outputs.queue != 'true'\n        run: node \"$P/tools/typecheck.mjs\"", 1)),
        ("records step guarded by a bare string output (\"false\" is truthy on GitHub)", lambda s: s.replace(FAST, "        if: ${{ !needs.kind.outputs.queue }}\n", 1)),
        ("records rule moved into an ungated code step", lambda s: s.replace("          node \"$P/tools/graph.mjs\" --check", "          bash \"$P/tools/check-docs.sh\"\n          node \"$P/tools/graph.mjs\" --check", 1))]
ok = True
print("self-test:")
for name, f in muts:
    m = f(src)
    if m == src: print(f"FAIL  self-test could not apply: {name}"); ok = False; continue
    try:
        import contextlib, io
        with contextlib.redirect_stdout(io.StringIO()): b = check(m)
    except Exception as e: b = [f"error {e}"]
    print(("PASS  " if b else "FAIL  ") + f"breakage is caught: {name}" + ("" if b else " (it passed)")); ok = ok and bool(b)
print("ci.yml:")
bad = check(src)
for b in bad: print("FAIL  " + b)
if not bad: print("PASS  records rules skipped in merge-queue runs (batch and merge_group), run on pull requests; every code step still runs in the batch")
sys.exit(0 if ok and not bad else 1)
PY
