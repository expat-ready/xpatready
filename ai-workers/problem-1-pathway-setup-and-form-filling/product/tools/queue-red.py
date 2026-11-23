#!/usr/bin/env python3
"""lead-watch.sh step 2, the queue (ENF-761 part 3): open PRs (gh pr list --json number,title,labels,isDraft,headRefName,
statusCheckRollup) on stdin; prints the queue line, one ACT per dequeued PR, and one ACT per labelled PR whose head has a
FAILED REQUIRED check (--required, comma list: the ruleset's required checks read by lead-watch.sh), plus MERGIFY: every
check a queue_rules condition of .mergify.yml names: ci; xfa-engine (engine PRs, review on #2475); skeleton (the
product queue's skeleton paths); completes-ready (the product queue holds a PR whose readiness gate failed, #2738).
check-queue-red.sh reads .mergify.yml and fails when a queue check is missing here (ENF-772). Also pr-rules (Lead 4,
23 Nov, ENF-772), which #2595 (E6) made a product queue condition: a labelled PR red on it is an ACT, ruleset readable or not.
A labelled PR red only on other checks (module-cards, walks, CodeQL) gets one info line,
no ACT: Mergify queues it all the same (20 Nov: 3 of 7 "red after approval" PRs were queued, red only on such checks).
queue-fresh (required for prototype PRs) is renewed by queue-gate re-running ci, so it stays an info line.
Test: check-queue-red.sh."""
import argparse, json, sys

FAILED = {"FAILURE", "TIMED_OUT", "ERROR", "STARTUP_FAILURE"}
MERGIFY = {"ci", "xfa-engine", "skeleton", "pr-rules", "completes-ready"}   # .mergify.yml queue_rules: check-success = ci, xfa-engine, skeleton; -check-failure = completes-ready; pr-rules (#2595, and the tech lead's ruling)


def failed(p):
    """Names of the head's checks that failed (CheckRun: name/conclusion; StatusContext: context/state)."""
    out = []
    for c in p.get("statusCheckRollup") or []:
        if (c.get("conclusion") or c.get("state") or "").upper() in FAILED:
            out.append(c.get("name") or c.get("context") or "?")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--required", default="ci")
    a = ap.parse_args()
    req = {r.strip() for r in a.required.split(",") if r.strip()} | MERGIFY
    prs = [p for p in json.load(sys.stdin) if not p["headRefName"].startswith("mergify/")]
    L = lambda p: [l["name"] for l in p["labels"]]
    q = [p for p in prs if "queued" in L(p)]
    deq = [p for p in prs if "dequeued" in L(p)]
    appr = [p for p in prs if "review: approved" in L(p) and "queued" not in L(p) and "dequeued" not in L(p)]
    print("queue %d queued · %d approved not queued · %d open without label"
          % (len(q), len(appr), len([p for p in prs if not L(p) and not p["isDraft"]])))
    for p in deq:
        print("ACT   #%d dequeued: owner merges main or fixes (%s)" % (p["number"], p["title"][:50]))
    opt = []
    for p in prs:
        if "review: approved" not in L(p):
            continue
        f = failed(p)
        blocking = sorted({n for n in f if n in req})
        if blocking:
            print("ACT   #%d red after approval: required %s failed (%s)" % (p["number"], ", ".join(blocking), p["title"][:50]))
        elif f:
            opt.append("#%d (%s)" % (p["number"], ", ".join(sorted(set(f)))))
    if opt:
        print("info  red only on checks the queue does not require (required: %s; queue-fresh renews itself): %s" % (", ".join(sorted(req)), "; ".join(opt)))


if __name__ == "__main__":
    main()
