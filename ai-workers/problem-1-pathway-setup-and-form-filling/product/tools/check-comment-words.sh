#!/usr/bin/env bash
# OS-78c (OS-PM 4, 26 Nov; OS-78 in design/os-backlog.md, P-339b): the comment-triggered workflows queue-gate,
# review-rounds and lead-read start no job on a PR comment that carries none of the words their scripts act on. About 20
# runs in 30 min on main from Lead comments fed the 68-run CI jam of 25 Nov (Lead 5, 12:50 IST on #3683). Each job's
# `if:` is evaluated here, with the comment as GitHub gives it, by a small reader of GitHub's expression language (the
# one check-pr-concurrency.sh uses: literals, contexts, ! && || == !=, parentheses, contains, startsWith, fromJSON;
# strings compared ignoring case, as GitHub does). A condition it cannot read fails the check.
#   bash product/tools/check-comment-words.sh      Reads the workflow files only; US$0, no network.
#   CCW_WORKFLOWS=<dir> reads another copy of .github/workflows.
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; W="${CCW_WORKFLOWS:-$TOOLS/../../../../.github/workflows}"
python3 -I - "$W" <<'PY'
import json, os, re, sys, yaml
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
        if f == "fromjson": return json.loads(text(a[0]))
        raise Unknown(f"function {f}()")
    def ctxval(self, path):
        if path[0] != "github": raise Unknown(f"context {'.'.join(path)}")
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

def cond(f, job):
    d = yaml.safe_load(open(os.path.join(W, f), encoding="utf-8")); j = (d.get("jobs") or {}).get(job)
    if j is None: raise Unknown(f"{f} has no job {job}")
    e = str(j.get("if", "true")).strip(); m = re.fullmatch(r"\$\{\{(.*)\}\}", e, re.S)
    return m.group(1) if m else e
def comment(body, action="created", old=None, assoc="MEMBER"):
    ev = {"action": action, "issue": {"number": 7, "pull_request": {"url": "x"}}, "comment": {"body": body, "author_association": assoc}}
    if old is not None: ev["changes"] = {"body": {"from": old}}
    return {"event_name": "issue_comment", "event": ev}
SHA = "0123456789abcdef0123456789abcdef01234567"
NONE = ["Thanks: merged main in, ci is green, the reviewer agent is on it.",                 # "reviewer" without a verdict word
        "Lead 5: review: approved stays; I approved the plan. Please read the lead row.",   # "approved", "read", "lead"
        "Question for the tech lead: should OS-50 go first?"]
# (workflow, job, [(case, context, should the job start)])
CASES = [
  ("queue-gate.yml", "gate",
   [(f"no words: {b[:40]!r}", comment(b), False) for b in NONE] +
   [("a reviewer's Approve line", comment(f"Reviewer: Approve {SHA}"), True),
    ("an Approve in bold markdown (the script decides)", comment(f"**Reviewer:** Approve {SHA}"), True),
    ("a Batch failures covered line", comment("Batch failures covered: 123: shard (3)"), True),
    ("an Approve line by an outsider", comment(f"Reviewer: Approve {SHA}", assoc="NONE"), False)]),
  ("review-rounds.yml", "review-rounds",
   [(f"no words: {b[:40]!r}", comment(b), False) for b in NONE] +
   [(f"no words, edited: {NONE[0][:30]!r}", comment(NONE[0], "edited", NONE[1]), False),
    ("a verdict", comment("Reviewer: Changes needed: M1"), True),
    ("a Lead allowance", comment("Lead allows round 3: one more"), True),
    ("an edit that removes a verdict", comment("(withdrawn)", "edited", "Reviewer: Approve x"), True),
    ("a deleted verdict", comment("reviewer: approve x", "deleted"), True),
    ("a verdict in split markdown (review-rounds.py strips it)", comment("**Reviewer**: Changes needed"), True),
    ("a verdict in italic markdown", comment("_Reviewer_: Block"), True),
    ("a verdict in a code span", comment("`Reviewer`: Approve x"), True),
    ("an edit that removes a split-markdown verdict", comment("(withdrawn)", "edited", "**Reviewer**: Reject"), True),
    ("an allowance in bold", comment("**Lead allows round** 3: one more"), True)]),
  ("lead-read.yml", "read-gate",
   [(f"no words: {b[:40]!r}", comment(b), False) for b in NONE] +
   [(f"no words, edited: {NONE[0][:30]!r}", comment(NONE[0], "edited", NONE[2]), False),
    (f"no words, deleted: {NONE[2][:30]!r}", comment(NONE[2], "deleted"), False),
    ("a read line", comment(f"Lead read the diff: {SHA}"), True),
    ("an edit that takes a read back", comment("(withdrawn)", "edited", f"Lead read the diff: {SHA}"), True),
    ("a deleted read line", comment(f"Lead read: OK {SHA}", "deleted"), True),
    ("an edit taking back a split-markdown read (lead-read-gate.sh strips it)", comment("(withdrawn)", "edited", f"**Lead** read the diff: {SHA}"), True),
    ("a deleted split-markdown read", comment(f"**Lead** read the diff: {SHA}", "deleted"), True),
    ("a read line by an outsider", comment(f"Lead read the diff: {SHA}", assoc="NONE"), False)]),
]
for f, job, cases in CASES:
    try: e = cond(f, job)
    except (Unknown, OSError) as x: bad.append(f"{f}: {x}"); continue
    for why, ctx, want in cases:
        n += 1
        try: got = truthy(Parser(e, ctx).parse())
        except Unknown as x: bad.append(f"{f} job {job}: cannot read its condition ({x})"); continue
        if got is not want: bad.append(f"{f} job {job}: {why}: {'starts' if got else 'does not start'} (want {'start' if want else 'none'})")
for b in bad: print("FAIL  " + b)
print(f"{n - len(bad)} passed, {len(bad)} failed")
sys.exit(1 if bad else 0)
PY
