#!/usr/bin/env bash
# SPD-2 item 5 (Lead 4, 22 Nov 15:10 IST; P-802): GitHub's hosted runners were full (53 runs in progress, 49 queued at
# 15:0x IST), largely with PR runs a newer push had already made stale. This check keeps the two settings that cut them:
#   (a) each PR workflow (ci, pr-suites, walks, module-cards, pr-rules, review-rounds) has one concurrency group per PR,
#       at the workflow or at the job, and cancels that PR's older run when a newer one starts, while a merge-queue
#       batch (head mergify/...) and a run by hand (workflow_dispatch) are never cancelled (or no job runs for a batch,
#       as in pr-rules). A job group equal to its own workflow's group is refused: GitHub cancels such a run as a
#       deadlock (review round 1, B1). Two workflows never share a group name (they would cancel each other, m3);
#   (b) a draft runs only the light checks: guards, trace, cockpit-tests, lead-tools-tests and cycle-timeline skip a
#       draft (but not a merge-queue batch, which is a draft too) and run again on ready_for_review; ci's kind,
#       pr-suites' plan and walks' plan must have a condition that skips a draft and runs on a ready PR (M2).
# The expressions are evaluated by a small reader of GitHub's expression language (literals, contexts, ! && || == !=,
# parentheses, startsWith, contains, format; strings compared ignoring case, as GitHub does); a context it cannot know
# (needs., steps., a status function) fails the check instead of passing it.
# P-371's "never cancel" is about the Lead or a lane cancelling runs by hand; config supersession is this rule.
#   bash product/tools/check-pr-concurrency.sh        Reads the workflow files only; US$0, no network.
#   PRC_WORKFLOWS=<dir> reads another copy of .github/workflows (the mutation tests).
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; W="${PRC_WORKFLOWS:-$TOOLS/../../../../.github/workflows}"
python3 -I - "$W" <<'PY'
import glob, os, re, sys, yaml
W = sys.argv[1]; bad = []; n = 0

class Unknown(Exception): pass

TOK = re.compile(r"\s*(?:(\d+(?:\.\d+)?)|'((?:[^']|'')*)'|(&&|\|\||==|!=|[!(),.*])|([A-Za-z_][\w-]*))")
def tokens(s):
    out, i = [], 0
    while s[i:].strip():
        m = TOK.match(s, i)
        if not m: raise Unknown(f"cannot read {s[i:i+20]!r}")
        num, st, op, name = m.groups()
        out.append(("num", float(num)) if num else ("str", st.replace("''", "'")) if st is not None else ("op", op) if op else ("name", name))
        i = m.end()
    return out
def num(v):
    if v is None: return 0.0
    if isinstance(v, bool): return 1.0 if v else 0.0
    if isinstance(v, (int, float)): return float(v)
    if isinstance(v, str):
        if not v.strip(): return 0.0
        try: return float(v)
        except ValueError: return float("nan")
    return float("nan")
def eq(a, b):   # GitHub: strings compare ignoring case; different types are compared as numbers (null == '' is true)
    if isinstance(a, str) and isinstance(b, str): return a.lower() == b.lower()
    return num(a) == num(b)
def truthy(v):
    return not (v is None or v is False or v == "" or (isinstance(v, float) and (v == 0 or v != v)))
def text(v):
    return "" if v is None else "true" if v is True else "false" if v is False else (str(int(v)) if isinstance(v, float) and v.is_integer() else str(v))

class Parser:
    def __init__(self, s, ctx): self.t, self.i, self.ctx = tokens(s), 0, ctx
    def peek(self): return self.t[self.i] if self.i < len(self.t) else (None, None)
    def take(self, v=None):
        k = self.peek()
        if v is not None and k[1] != v: raise Unknown(f"expected {v}, got {k[1]}")
        self.i += 1; return k
    def parse(self):
        v = self.orx()
        if self.i != len(self.t): raise Unknown("trailing tokens")
        return v
    def orx(self):
        v = self.andx()
        while self.peek() == ("op", "||"):
            self.take(); r = self.andx(); v = v if truthy(v) else r
        return v
    def andx(self):
        v = self.cmp()
        while self.peek() == ("op", "&&"):
            self.take(); r = self.cmp(); v = r if truthy(v) else v
        return v
    def cmp(self):
        v = self.unary()
        while self.peek() in (("op", "=="), ("op", "!=")):
            op = self.take()[1]; r = self.unary(); v = eq(v, r) if op == "==" else not eq(v, r)
        return v
    def unary(self):
        if self.peek() == ("op", "!"):
            self.take(); return not truthy(self.unary())
        return self.prim()
    def prim(self):
        k, v = self.take()
        if k in ("num", "str"): return v
        if (k, v) == ("op", "("):
            x = self.orx(); self.take(")"); return x
        if k == "name":
            low = v.lower()
            if low in ("true", "false"): return low == "true"
            if low == "null": return None
            if self.peek() == ("op", "("):
                self.take(); args = []
                if self.peek() != ("op", ")"):
                    args.append(self.orx())
                    while self.peek() == ("op", ","): self.take(); args.append(self.orx())
                self.take(")")
                return self.call(low, args)
            path = [v]
            while self.peek() == ("op", "."):
                self.take(); path.append(self.take()[1])
            return self.ctxval(path)
        raise Unknown(f"unexpected {v}")
    def call(self, f, a):
        if f == "startswith": return text(a[0]).lower().startswith(text(a[1]).lower())
        if f == "endswith": return text(a[0]).lower().endswith(text(a[1]).lower())
        if f == "contains":
            if isinstance(a[0], list): return any(eq(x, a[1]) for x in a[0])
            return text(a[1]).lower() in text(a[0]).lower()
        if f == "format": return re.sub(r"\{(\d+)\}", lambda m: text(a[1 + int(m.group(1))]), text(a[0]))
        if f == "always" and not a: return True   # a status function: the job runs whatever its needs ended with
        raise Unknown(f"function {f}()")
    def ctxval(self, path):
        if path[0] not in ("github", "inputs"): raise Unknown(f"context {'.'.join(path)}")
        v = self.ctx if path[0] == "github" else self.ctx.get("inputs", {})
        if path[0] == "github" and len(path) > 1 and path[1] not in self.ctx:
            raise Unknown(f"github.{path[1]} is not modelled here")   # round 2 R2-1: never read an unknown key as null
        for i, k in enumerate(path[1:]):
            if k == "*":   # labels.*.name: a list of that field
                rest = path[2 + i:]
                out = []
                for x in (v or []):
                    for r in rest: x = x.get(r) if isinstance(x, dict) else None
                    out.append(x)
                return out
            v = v.get(k) if isinstance(v, dict) else None
        return v

def ev(expr, ctx, is_if=False):
    """An `if:` is an expression with or without ${{ }}; any other value is a literal or one ${{ }}."""
    if isinstance(expr, bool): return expr
    e = str(expr).strip()
    m = re.fullmatch(r"\$\{\{(.*)\}\}", e, re.S)
    if m: return Parser(m.group(1), ctx).parse()
    if is_if: return Parser(e, ctx).parse()
    return {"true": True, "false": False}.get(e.lower(), e)
def tmpl(t, ctx):
    return re.sub(r"\$\{\{(.*?)\}\}", lambda m: text(Parser(m.group(1), ctx).parse()), str(t))

WF = {}
def load(f):
    d = yaml.safe_load(open(os.path.join(W, f), encoding="utf-8")); WF["name"] = str(d.get("name") or f); return d, (d.get(True) or d.get("on") or {})
def pr(num_, ref, draft=False, event="pull_request"):
    return {"event_name": event, "run_id": 99, "head_ref": ref, "ref": f"refs/pull/{num_}/merge", "workflow": WF.get("name", ""), "sha": "c" * 40, "repository": "o/r",
            "event": {"pull_request": {"number": num_, "draft": draft, "head": {"ref": ref}, "labels": []}}}
BATCH = pr(8, "mergify/merge-queue/abc", True)
CASES = (("a PR push", pr(7, "claude/x"), True), ("a draft push", pr(7, "claude/x", True), True), ("a merge-queue batch", BATCH, False))
def runs(j, ctx):
    try: return truthy(ev(j.get("if", True), ctx, is_if=True))
    except Unknown: return True   # a condition about needs. or a status: the job may run
def conc(c, ctx):
    if isinstance(c, dict):
        if not c.get("group"): raise Unknown("a concurrency block without a group")
        return tmpl(c["group"], ctx), ev(c.get("cancel-in-progress", False), ctx)
    return tmpl(c, ctx), False
def groups(d, ctx):
    """[(where, group, cancel)] for the workflow and each job that may run in ctx."""
    out = []
    if d.get("concurrency"): out.append(("workflow", *conc(d["concurrency"], ctx)))
    for name, j in (d.get("jobs") or {}).items():
        if j.get("concurrency") and runs(j, ctx): out.append((f"job {name}", *conc(j["concurrency"], ctx)))
    return out

A = {"ci.yml": "pull_request", "pr-suites.yml": "pull_request", "walks.yml": "pull_request", "module-cards.yml": "pull_request",
     "pr-rules.yml": "pull_request", "review-rounds.yml": "pull_request_target"}
for f, event in A.items():
    d, on = load(f); n += 1
    try:
        for why, ctx0, want in CASES:
            ctx = {**ctx0, "event_name": event, "workflow": WF["name"]}; n += 1   # #3007 round 3 R3-1: the real name
            if not want and not any(runs(j, ctx) for j in (d.get("jobs") or {}).values()): continue   # no job runs for a batch (pr-rules)
            gs = groups(d, ctx)
            if not gs: bad.append(f"{f}: {why}: no concurrency group"); continue
            if want and not any(truthy(c) and "7" in g for _, g, c in gs): bad.append(f"{f}: {why}: not cancelled by a newer run of the same PR ({gs})")
            if not want and any(truthy(c) for _, _, c in gs): bad.append(f"{f}: {why} can be cancelled ({gs})")
            wf = [g for w, g, _ in gs if w == "workflow"]
            for w, g, _ in gs:
                if w != "workflow" and wf and g == wf[0]: bad.append(f"{f}: {why}: {w}'s group {g!r} equals the workflow's: GitHub cancels it as a deadlock")
        if "workflow_dispatch" in on:
            n += 1; ctx = {"event_name": "workflow_dispatch", "run_id": 99, "event": {}, "inputs": {"head": "a" * 40, "pr": "7"}}
            if any(truthy(c) for _, _, c in groups(d, ctx)): bad.append(f"{f}: a run by hand can be cancelled")
        if "issue_comment" in on:
            cm = lambda body: {"event_name": "issue_comment", "run_id": 99, "workflow": WF["name"], "head_ref": "", "ref": "refs/heads/main",
                               "event": {"issue": {"number": 7, "pull_request": {"url": "x"}}, "comment": {"body": body}}}
            n += 1; gs = groups(d, cm("Reviewer: Approve"))
            if not any("7" in g for _, g, _ in gs): bad.append(f"{f}: a verdict comment's run is not in its PR's group")
            wf = [g for w, g, _ in gs if w == "workflow"]
            for w, g, _ in gs:
                n += 1
                if w != "workflow" and wf and g == wf[0]: bad.append(f"{f}: a verdict comment's run: {w}'s group {g!r} equals the workflow's (a deadlock)")
            # #2749 M1: a run for an unrelated comment takes no slot, so it can never cancel a verdict's run
            n += 1; gs = groups(d, cm("thanks"))
            if gs: bad.append(f"{f}: a run for an unrelated comment holds a concurrency group {gs} (it would cancel a verdict's run, #2749 M1)")
    except Unknown as e:
        bad.append(f"{f}: cannot read its concurrency or conditions ({e})")
# m3: no two workflows share a group name for the same PR (they would cancel each other's runs)
seen = {}
for p in sorted(glob.glob(os.path.join(W, "*.yml"))):
    f = os.path.basename(p)
    try:
        d, on = load(f)
        evn = "pull_request_target" if "pull_request_target" in on and "pull_request" not in on else "pull_request"
        ctx = {**pr(7, "claude/x"), "event_name": evn}; gs = set()
        for blk in [d.get("concurrency")] + [j.get("concurrency") for j in (d.get("jobs") or {}).values()]:
            if not blk: continue
            raw = blk.get("group") if isinstance(blk, dict) else blk
            if not raw: bad.append(f"{f}: a concurrency block without a group"); continue
            try: gs.add(tmpl(raw, ctx))
            except Unknown: gs.add(str(raw))   # a matrix or index group: compared by its text (same text, same group)
    except Exception: continue   # not a workflow file this check can parse (a YAML error fails its own run)
    for g in gs:
        n += 1
        if g in seen and seen[g] != f: bad.append(f"{f} and {seen[g]} share the concurrency group {g!r}: they cancel each other")
        seen.setdefault(g, f)
# (b) drafts: the five path-filtered workflows skip a draft, not a batch, and run on ready_for_review
for f in ("guards.yml", "trace.yml", "cockpit-tests.yml", "lead-tools-tests.yml", "cycle-timeline.yml"):
    d, on = load(f); jobs = d.get("jobs") or {}; n += 1
    if "ready_for_review" not in ((on.get("pull_request") or {}).get("types") or []):
        bad.append(f"{f}: no ready_for_review trigger, so a draft skipped now never runs when it is ready"); continue
    for name, j in jobs.items():
        for why, ctx, want in (("a draft", pr(7, "claude/x", True), False), ("a ready PR", pr(7, "claude/x"), True), ("a merge-queue batch", BATCH, True)):
            n += 1
            try: r = truthy(ev(j.get("if", True), ctx, is_if=True))
            except Unknown as e: bad.append(f"{f}: job {name}: cannot read its condition ({e})"); continue
            if r is not want: bad.append(f"{f}: job {name} {'skips' if want else 'runs on'} {why}")
    for why, ctx in (("a merge-queue batch", BATCH),):   # m4: a batch run of these is never cancelled either
        n += 1
        try:
            if any(truthy(c) for _, _, c in groups(d, ctx)): bad.append(f"{f}: {why} can be cancelled")
        except Unknown as e: bad.append(f"{f}: cannot read its concurrency ({e})")
# M2: the heavy PR jobs need a condition that skips a draft and runs on a ready PR (never "no condition")
for f, job, on_batch in (("ci.yml", "kind", True), ("pr-suites.yml", "plan", False), ("walks.yml", "plan", False)):
    d, _ = load(f); j = (d.get("jobs") or {}).get(job); n += 1
    if j is None: bad.append(f"{f}: no job {job}"); continue
    if "if" not in j: bad.append(f"{f}: job {job} has no condition, so it runs on every draft"); continue
    for why, ctx, want in (("a draft", pr(7, "claude/x", True), False), ("a ready PR", pr(7, "claude/x"), True), ("a merge-queue batch", BATCH, on_batch)):
        n += 1
        try: r = truthy(ev(j["if"], ctx, is_if=True))
        except Unknown as e: bad.append(f"{f}: job {job}: cannot read its condition ({e})"); continue
        if r is not want: bad.append(f"{f}: job {job} {'skips' if want else 'runs on'} {why}")
for b in bad: print(f"FAIL  {b}")
print(f"{'PASS' if not bad else 'FAIL'}  PR concurrency and drafts (SPD-2 item 5): {n} checks")
sys.exit(1 if bad else 0)
PY
