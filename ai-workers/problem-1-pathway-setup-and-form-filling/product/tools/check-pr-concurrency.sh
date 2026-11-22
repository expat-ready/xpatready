#!/usr/bin/env bash
# SPD-2 item 5 (Lead 4, 22 Nov 15:10 IST; P-802): GitHub's hosted runners were full (53 runs in progress, 49 queued at
# 15:0x IST), largely with PR runs a newer push had already made stale. This check keeps the two settings that cut them:
#   (a) each PR workflow (ci, pr-suites, walks, module-cards, pr-rules, review-rounds) has one concurrency group per PR
#       and cancels that PR's older run when a newer one starts, while a merge-queue batch (head mergify/...) and a run
#       by hand (workflow_dispatch) are never cancelled. The expression is evaluated here for each kind of event;
#   (b) a draft runs only the light checks: guards, trace, cockpit-tests, lead-tools-tests and cycle-timeline skip a
#       draft (but not a merge-queue batch, which is a draft too) and run again on ready_for_review; ci on a draft runs
#       only its guard job; pr-suites and walks skip drafts.
# P-371's "never cancel" is about the Lead or a lane cancelling runs by hand; config supersession is this rule.
#   bash product/tools/check-pr-concurrency.sh        Reads the workflow files only; US$0, no network.
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; W="${PRC_WORKFLOWS:-$TOOLS/../../../../.github/workflows}"
python3 -I - "$W" <<'PY'
import os, re, sys, yaml
W = sys.argv[1]; bad = []; n = 0
def load(f):
    d = yaml.safe_load(open(os.path.join(W, f), encoding="utf-8")); return d, (d.get(True) or d.get("on") or {})
def ev(expr, ctx):
    """Evaluates the small GitHub expressions these settings use: ==, !=, &&, ||, !, startsWith(), contexts, literals."""
    e = str(expr).strip()
    m = re.fullmatch(r"\$\{\{(.*)\}\}", e, re.S)
    if not m: return {"true": True, "false": False}.get(e.lower(), e)
    s = m.group(1)
    s = re.sub(r"startsWith\(([^,()]+(?:\|\|\s*'[^']*')?),\s*'([^']*)'\)", lambda x: f"str({x.group(1)} or '').startswith('{x.group(2)}')", s)
    s = re.sub(r"\bformat\('([^']*)',\s*([^)]*)\)", lambda x: f"'{x.group(1)}'.replace('{{0}}', str({x.group(2)}))", s)
    s = s.replace("&&", " and ").replace("||", " or ").replace("!=", " NE ").replace("==", " EQ ")
    s = re.sub(r"!(?!=)", " not ", s).replace(" NE ", " != ").replace(" EQ ", " == ")
    s = re.sub(r"\bgithub\.([\w.]+)", lambda x: f"g({x.group(1)!r})", s); s = re.sub(r"\binputs\.(\w+)", lambda x: f"i({x.group(1)!r})", s)
    def g(path):
        v = ctx
        for k in path.split("."):
            v = v.get(k) if isinstance(v, dict) else None
        return v
    return eval(s, {"__builtins__": {"str": str}, "g": g, "i": lambda k: ctx.get("inputs", {}).get(k)})
def tmpl(t, ctx):
    """A string with ${{ }} parts, each evaluated (a concurrency group)."""
    return re.sub(r"\$\{\{.*?\}\}", lambda m: str(ev(m.group(0), ctx)), str(t))
def pr(num, ref, draft=False, event="pull_request"):
    return {"event_name": event, "run_id": 99, "event": {"pull_request": {"number": num, "draft": draft, "head": {"ref": ref}}, "issue": {"number": num}}}
CASES = {"a PR push": (pr(7, "claude/x"), True), "a draft push": (pr(7, "claude/x", True), True),
         "a merge-queue batch": (pr(8, "mergify/merge-queue/abc", True), False)}
A = {"ci.yml": "pull_request", "pr-suites.yml": "pull_request", "walks.yml": "pull_request", "module-cards.yml": "pull_request",
     "pr-rules.yml": "pull_request", "review-rounds.yml": "pull_request_target"}
for f, event in A.items():
    d, on = load(f); c = d.get("concurrency") or {}
    n += 1
    if not c.get("group"): bad.append(f"{f}: no concurrency group"); continue
    for why, (ctx, want) in CASES.items():
        ctx = {**ctx, "event_name": event}; n += 1
        try:
            got = ev(c.get("cancel-in-progress", False), ctx); grp = tmpl(c["group"], ctx)
        except Exception as e:
            bad.append(f"{f}: cannot read its concurrency ({e})"); break
        if bool(got) is not want: bad.append(f"{f}: {why} {'is not' if want else 'is'} cancelled by a newer run")
        if want and "7" not in str(grp): bad.append(f"{f}: {why}: the group {grp!r} is not the PR's own")
    if "workflow_dispatch" in on:
        n += 1; ctx = {"event_name": "workflow_dispatch", "run_id": 99, "event": {}, "inputs": {"head": "a" * 40, "pr": "7"}}
        if ev(c.get("cancel-in-progress", False), ctx) is not False: bad.append(f"{f}: a run by hand can be cancelled")
    if "issue_comment" in on:
        n += 1; ctx = {"event_name": "issue_comment", "event": {"issue": {"number": 7}}}
        if "7" not in tmpl(c["group"], ctx): bad.append(f"{f}: a comment's run is not in its PR's group")
# (b) drafts: the five path-filtered workflows skip a draft, not a batch, and run on ready_for_review
for f in ("guards.yml", "trace.yml", "cockpit-tests.yml", "lead-tools-tests.yml", "cycle-timeline.yml"):
    d, on = load(f); jobs = d.get("jobs") or {}; n += 1
    if "ready_for_review" not in ((on.get("pull_request") or {}).get("types") or []):
        bad.append(f"{f}: no ready_for_review trigger, so a draft skipped now never runs when it is ready"); continue
    for name, j in jobs.items():
        for why, ctx, want in (("a draft", pr(7, "claude/x", True), False), ("a ready PR", pr(7, "claude/x"), True),
                               ("a merge-queue batch", pr(8, "mergify/merge-queue/abc", True), True)):
            n += 1
            if bool(ev(j.get("if", "true"), ctx)) is not want: bad.append(f"{f}: job {name} {'skips' if want else 'runs on'} {why}")
for f, job in (("ci.yml", "kind"), ("pr-suites.yml", "plan"), ("walks.yml", None)):
    d, _ = load(f); jobs = d.get("jobs") or {}
    for name, j in jobs.items():
        if job and name != job: continue
        if "if" not in j: continue
        n += 1
        ctx = pr(7, "claude/x", True)
        try: run = ev(j["if"], ctx)
        except Exception: continue
        if run is True: bad.append(f"{f}: job {name} runs on a draft")
for b in bad: print(f"FAIL  {b}")
print(f"{'PASS' if not bad else 'FAIL'}  PR concurrency and drafts (SPD-2 item 5): {n} checks")
sys.exit(1 if bad else 0)
PY
