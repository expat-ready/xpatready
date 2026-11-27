#!/usr/bin/env bash
# A438 cut 1 (founder 27 Nov 14:3x IST, "Yes, all three"): a records-only PR merges with no reviewer and no
# `review: approved` label; everything else keeps today's path. Reads this repository's .mergify.yml and routes made-up
# PRs through its queue conditions (a small reading of Mergify's conditions, as screens/B119/check-queue-rules.py, which
# holds the full routing cases; this test lives under tools/ so check-guards.sh's mutation rows can run it on a copy).
# The "records" label is put on as records-label.yml would: records-only.sh is-records on the PR's files. US$0, no network.
#   bash product/tools/check-records-queue.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
R=$(git -C "$TOOLS" rev-parse --show-toplevel 2>/dev/null); M="$R/.mergify.yml"
[ -r "$M" ] || { ok ".mergify.yml is readable" 0 "no $M"; finish; }
out=$(cd "$R" && python3 -I - "$M" "$TOOLS/records-only.sh" <<'PY' 2>&1
import re, subprocess, sys, yaml
cfg = yaml.safe_load(open(sys.argv[1]))
P = "ai-workers/problem-1-pathway-setup-and-form-filling"; R = P + "/product"; A = P + "/prototype/studio"
COND = re.compile(r"^(-)?([a-z][a-z-]*)\s*(?:(~=|=)\s*(.*))?$")
def holds(c, pr):
    if isinstance(c, dict):
        (op, subs), = c.items()
        return all(holds(x, pr) for x in subs) if op == "and" else any(holds(x, pr) for x in subs) if op == "or" else not holds(subs, pr)
    neg, attr, op, val = COND.match(c.strip()).groups()
    v = pr[attr]
    if op is None: r = bool(v)
    else:
        val = val.strip().strip('"').strip("'")
        items = list(v) if isinstance(v, (list, tuple)) else [v]
        r = any((re.search(val, i) is not None) if op == "~=" else i == val for i in items)
    return not r if neg else r
def queue(pr):
    for q in cfg["queue_rules"]:
        if all(holds(c, pr) for c in q.get("queue_conditions", [])): return q["name"]
def records(files):
    return subprocess.run(["bash", sys.argv[2], "is-records", "--files"], input="\n".join(files) + "\n", capture_output=True, text=True).stdout.strip() == "yes"
def pr(files, labels=(), checks=("ci", "pr-rules"), title="evidence: x", auto=True, draft=False):
    l = list(labels) + (["records"] if auto and records(files) else [])
    return {"files": files, "label": l, "check-success": checks, "check-failure": [], "title": title, "draft": draft, "base": "main", "head": "claude/x"}
cases = [
    ("a records-only PR with no Approve and no review label queues (records)", pr([R + "/STATE.md", R + "/design/x.md"]), "records"),
    ("a records-only PR, a later records push, still no review: queues (records)", pr([R + "/STATE.md", R + "/BACKLOG.md", R + "/qa/BUGS.md"]), "records"),
    ("a qa verdict records PR with no review label queues first (verdicts)", pr([R + "/qa/CAPABILITIES.md"], title="qa: after-merge"), "verdicts"),
    ("an .html record (it can carry script) with no review label: no queue (breaker M4)", pr([R + "/screens/12/board.html"]), None),
    ("an .html record with the review label: records", pr([R + "/screens/12/board.html"], labels=["review: approved"]), "records"),
    ("a records-only PR whose ci is not green: no queue (CI stays required)", pr([R + "/STATE.md"], checks=()), None),
    ("a records-only draft: no queue", pr([R + "/STATE.md"], draft=True), None),
    ("a PR mixing records and code with no review label: no queue (not records only)", pr([R + "/STATE.md", A + "/api/src/core.ts"], checks=("ci", "pr-rules", "queue-fresh")), None),
    ("a PR mixing records and a tool with no review label: no queue", pr([R + "/STATE.md", R + "/tools/x.sh"]), None),
    ("a code PR with a hand-put records label and no review label: no queue", pr([A + "/api/src/core.ts"], labels=["records"], auto=False), None),
    ("a hand-put records label on product/Tools/x.md: no queue", pr([R + "/Tools/x.md"], labels=["records"], auto=False), None),
    ("a hand-put records label on a JSON under product/: no queue", pr([R + "/screens/1/x.json"], labels=["records"], auto=False), None),
    ("a code PR with no review label: no queue (a code PR still needs a reviewer)", pr([A + "/api/src/core.ts"], checks=("ci", "pr-rules", "queue-fresh")), None),
    ("a code PR with the review label: product", pr([A + "/api/src/core.ts"], labels=["review: approved"], checks=("ci", "pr-rules", "queue-fresh")), "product"),
    ("a tool PR with no review label: no queue (pipeline still needs a reviewer)", pr([R + "/tools/x.sh"]), None),
    ("a tool PR with the review label: pipeline", pr([R + "/tools/x.sh"], labels=["review: approved"]), "pipeline"),
]
bad = 0
for what, p, want in cases:
    got = queue(p)
    print(("PASS  " if got == want else "FAIL  ") + what + (" → %s" % (got or "no queue")) + ("" if got == want else " (want %s)" % (want or "no queue")))
    bad += got != want
sys.exit(1 if bad else 0)
PY
); r=$?
printf '%s\n' "$out" | sed -n 's/^PASS  //p' | while IFS= read -r l; do echo "PASS  $l"; done
pass=$((pass + $(grep -c '^PASS' <<< "$out"))); fail=$((fail + $(grep -c '^FAIL' <<< "$out")))
grep '^FAIL\|Error\|Traceback' <<< "$out" | sed 's/^/  /'
[ "$r" = 0 ] || [ "$(grep -c '^FAIL' <<< "$out")" -gt 0 ] || { fail=$((fail + 1)); echo "FAIL  the reading of .mergify.yml did not run: $(tail -2 <<< "$out")"; }
finish
