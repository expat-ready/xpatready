#!/usr/bin/env python3
"""OS-78 (a) (OS P1, design/os-manual-enforcement-2026-11-26.md: "about 20 runs in 30 min from Lead comments fed a
68-run CI jam"): every workflow triggered by issue_comment must skip, at the job, a comment that lacks its words.
Each job of such a workflow has an `if:` that reads the comment's text (comment.body or changes.body), or `needs:` a job
that has one. A job without either takes a runner for every comment on every PR. Replaces the Lead's hand count
("gh run list --workflow queue-gate.yml to watch comment-run spikes"). No YAML library (none is promised on the
runner): jobs are the two-space keys under `jobs:`, their `if:` and `needs:` the four-space keys, with continuation lines.
Usage: python3 -I product/tools/comment-filter-check.py [workflows dir]      Test: check-comment-filter.sh."""
import glob, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WF = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "..", "..", ".github", "workflows")


def jobs(text):
    out, cur, key, in_jobs = {}, None, None, False
    for line in text.splitlines():
        if re.match(r"^jobs:\s*$", line):
            in_jobs = True; continue
        if in_jobs and re.match(r"^\S", line):
            in_jobs = False
        if not in_jobs:
            continue
        m = re.match(r"^  ([A-Za-z0-9_-]+):\s*$", line)
        if m:
            cur = out.setdefault(m.group(1), {"if": "", "needs": ""}); key = None; continue
        m = re.match(r"^    (if|needs):\s*(.*)$", line)
        if m and cur is not None:
            key = m.group(1); cur[key] += m.group(2); continue
        if re.match(r"^    \S", line):
            key = None; continue
        if key and cur is not None and re.match(r"^      ", line):
            cur[key] += " " + line.strip()
    return out


bad, n = [], 0
for f in sorted(glob.glob(os.path.join(WF, "*.yml")) + glob.glob(os.path.join(WF, "*.yaml"))):
    t = open(f, encoding="utf-8").read()
    head = t.split("\njobs:", 1)[0]
    if not re.search(r"^\s+issue_comment:", head, re.M):
        continue
    n += 1
    js = jobs(t)
    filt = {k for k, j in js.items() if re.search(r"(comment|changes)\.body", j["if"])}
    for k, j in js.items():
        if k in filt or any(x in j["needs"] for x in filt):
            continue
        bad.append(f"{os.path.basename(f)}: job \"{k}\" runs for every PR comment (no `if:` reading comment.body, OS-78 (a))")
for b in bad:
    print("REFUSED:", b)
print(f"comment workflows: {n} checked, {len(bad)} job(s) without a comment-text filter")
sys.exit(1 if bad or n == 0 else 0)
