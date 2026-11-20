#!/usr/bin/env python3
"""lead-watch.sh step 2, the queue (ENF-761 part 3): open PRs (gh pr list --json number,title,labels,isDraft,headRefName,
statusCheckRollup) on stdin; prints the queue line, one ACT per dequeued PR, and one ACT per labelled PR whose head has a
FAILED REQUIRED check (--required, comma list: the ruleset's required checks read by lead-watch.sh, plus ci always).
A labelled PR red only on optional checks (module-cards, walks, CodeQL, pr-rules while not required) gets one info line,
no ACT: Mergify queues it all the same (20 Nov: 3 of 7 "red after approval" PRs were queued, red only on optional checks).
Test: check-queue-red.sh."""
import argparse, json, sys

FAILED = {"FAILURE", "TIMED_OUT", "ERROR", "STARTUP_FAILURE"}


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
    req = {r.strip() for r in a.required.split(",") if r.strip()} | {"ci"}
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
        print("info  red only on optional checks, not blocking (required: %s): %s" % (", ".join(sorted(req)), "; ".join(opt)))


if __name__ == "__main__":
    main()
