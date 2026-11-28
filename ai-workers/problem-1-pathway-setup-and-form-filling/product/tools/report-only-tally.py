#!/usr/bin/env python3
"""LR-048 (OS-13): false blocks of the report-only workflows, from their pull-request runs.

A report-only workflow is in no Mergify condition and no queue-gate read, so a red one never blocked anything. This
counts what it WOULD have done had it blocked, over the runs given:
  runs     completed pull_request(_target) runs on a PR head (Mergify batch heads and skipped runs left out; an
           issue_comment run sits on main's commit, not the PR's head, so it is not counted)
  red      runs with conclusion failure or timed_out
  false    red runs on a head that merged into main unchanged (that head is a merge commit's second parent): blocking
           would have stopped a PR that landed as it was. A red on a head that later went green on a re-run counts here
           too when that head merged: blocking would have cost a re-run.
  caught   red runs on a head that never merged, whose PR later merged another head: the PR changed after the red
           (a real catch, or work in progress; the tool cannot tell them apart)
  masked   the workflow file has continue-on-error steps and no run in the window is red: its run conclusion cannot
           show a red at all, so it cannot graduate as it is (a verdict step, as pr-suites has, would come first)
Usage (US$0, no model call):
  python3 -I report-only-tally.py RUNS.json... --merged HEADS.txt [--workflows DIR]
      RUNS.json: GitHub's list-workflow-runs answer ({"workflow_runs": [...]}) or a bare list, one or more files.
      HEADS.txt: one sha per line: git log origin/main --merges --format=%P | awk '{print $2}'
  python3 -I report-only-tally.py --self-test
Exit 0 when the table printed, 2 on bad input. Test: check-report-only-tally.sh.
"""
import json
import os
import re
import sys

RED = {"failure", "timed_out"}


def load_runs(paths):
    runs = []
    for p in paths:
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
        runs.extend(d["workflow_runs"] if isinstance(d, dict) else d)
    return runs


def counted(r):
    return (r.get("event") in ("pull_request", "pull_request_target") and r.get("status") == "completed"
            and r.get("conclusion") not in ("skipped", None)
            and not str(r.get("head_branch", "")).startswith("mergify/"))


def has_coe(wdir, name):
    p = os.path.join(wdir, name + ".yml") if wdir else ""
    if not p or not os.path.isfile(p):
        return False
    with open(p, encoding="utf-8") as f:
        return any(re.match(r"\s*continue-on-error:\s*true\b", line) for line in f)


def tally(runs, merged, wdir=None):
    by = {}
    seen = set()
    for r in runs:
        if r.get("id") in seen or not counted(r):
            continue
        seen.add(r.get("id"))
        name = os.path.splitext(os.path.basename(r.get("path") or r.get("name") or "?"))[0]
        by.setdefault(name, []).append(r)
    merged_prs = {}
    for rs in by.values():
        for r in rs:
            if r["head_sha"] in merged:
                for n in r.get("pull_requests") or []:
                    merged_prs[n] = True
    rows = []
    for name in sorted(by):
        rs = by[name]
        red = [r for r in rs if r["conclusion"] in RED]
        false = [r for r in red if r["head_sha"] in merged]
        caught = [r for r in red if r["head_sha"] not in merged
                  and any(merged_prs.get(n) for n in (r.get("pull_requests") or []))]
        times = sorted(r.get("created_at", "") for r in rs)
        rows.append({"workflow": name, "runs": len(rs), "red": len(red), "false": len(false), "caught": len(caught),
                     "masked": bool(not red and has_coe(wdir, name)), "from": times[0][:16], "to": times[-1][:16],
                     "false_runs": [r.get("id") for r in false]})
    return rows


def show(rows):
    print("| Workflow | PR runs | Window (UTC) | Red | False blocks | Caught | Masked |")
    print("|---|---|---|---|---|---|---|")
    for x in rows:
        print("| %s | %d | %s to %s | %d | %d | %d | %s |" % (x["workflow"], x["runs"], x["from"], x["to"], x["red"],
                                                          x["false"], x["caught"], "yes" if x["masked"] else "no"))
        if x["false_runs"]:
            print("|  false-block runs: %s |||||||" % ", ".join(str(i) for i in x["false_runs"][:12]))


def self_test():
    def run(i, sha, c, prs, wf="w.yml", branch="b", ev="pull_request"):
        return {"id": i, "head_sha": sha, "conclusion": c, "pull_requests": prs, "path": ".github/workflows/" + wf,
                "head_branch": branch, "event": ev, "status": "completed", "created_at": "2026-11-28T0%d:00:00Z" % (i % 10)}
    runs = [run(1, "a1", "failure", [10]), run(2, "a2", "success", [10]),   # 10: red then fixed, a2 merged: caught
            run(3, "b1", "failure", [11]), run(4, "b1", "success", [11]),   # 11: red, re-run green, b1 merged: false
            run(5, "c1", "failure", [12]),                                  # 12: red, never merged: neither
            run(6, "m1", "failure", [], branch="mergify/merge-queue/x"),    # batch head: not counted
            run(7, "d1", "skipped", [13]), run(8, "e1", "failure", [14], ev="push"),
            run(9, "f1", "success", [15], wf="v.yml"), run(9, "f1", "success", [15], wf="v.yml")]   # duplicate id once
    rows = {x["workflow"]: x for x in tally(runs, {"a2", "b1", "f1"})}
    bad = []
    w = rows.get("w", {})
    for k, v in (("runs", 5), ("red", 3), ("false", 1), ("caught", 1)):
        if w.get(k) != v:
            bad.append("w %s = %s, want %s" % (k, w.get(k), v))
    if rows.get("v", {}).get("runs") != 1:
        bad.append("duplicate run id counted twice")
    if w.get("false_runs") != [3]:
        bad.append("false-block run ids %s, want [3]" % w.get("false_runs"))
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        with open(os.path.join(d, "v.yml"), "w") as f:
            f.write("jobs:\n  a:\n    steps:\n      - run: x\n        continue-on-error: true\n")
        if not tally(runs, set(), d)[0]["masked"] or tally(runs, set(), d)[1]["masked"]:
            bad.append("masked: an all-green continue-on-error workflow is masked; a workflow with reds is not")
    for b in bad:
        print("FAIL " + b)
    print("report-only-tally self-test: %s" % ("all passed" if not bad else "%d failed" % len(bad)))
    return 1 if bad else 0


def main(argv):
    if argv[1:2] == ["--self-test"]:
        return self_test()
    files, merged_path, wdir, i = [], None, None, 1
    while i < len(argv):
        if argv[i] == "--merged" and i + 1 < len(argv):
            merged_path, i = argv[i + 1], i + 2
        elif argv[i] == "--workflows" and i + 1 < len(argv):
            wdir, i = argv[i + 1], i + 2
        else:
            files, i = files + [argv[i]], i + 1
    if not files or not merged_path:
        print("usage: report-only-tally.py RUNS.json... --merged HEADS.txt [--workflows DIR] | --self-test")
        return 2
    try:
        with open(merged_path, encoding="utf-8") as f:
            merged = {line.strip() for line in f if re.fullmatch(r"[0-9a-f]{40}", line.strip())}
        rows = tally(load_runs(files), merged, wdir)
    except (OSError, ValueError, KeyError, TypeError) as e:
        print("report-only-tally: bad input: %s" % e)
        return 2
    show(rows)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
