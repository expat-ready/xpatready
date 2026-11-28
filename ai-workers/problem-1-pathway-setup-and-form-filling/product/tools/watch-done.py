#!/usr/bin/env python3
"""LR-127 (lab register, founder A425; Loops article: a loop "stops when cancelled or the work completes (PR merged, queue
empty)", and "react based on events rather than time"): the end condition of a watch. A watch that polls (a Monitor
until-loop, a /loop, a session cron) asks this script each turn and ends when it says done; it never runs to its timeout.
Prefer an event where one exists (subscribe_pr_activity, a workflow_run trigger): then no watch is needed at all.
  --pr N    done when pull request N is merged or closed.
  --queue   done when the merge queue is empty: no open pull request carries `review: approved` (queue-gate.sh's label).
Exit 0 done (one "watch end" line, also appended to the log: IST time, what, why), 1 not yet (one line), 2 cannot read
(not done: the watch keeps going and says so; never a silent end). Reads GitHub through gh (US$0), or --prs FILE: a JSON
pull request object (--pr) or a list of them (--queue), as `gh api` returns them. Test: check-watch-done.sh.
   until python3 -I product/tools/watch-done.py --pr 4045; do sleep 600; done      # the watch exits on merge
   python3 -I product/tools/watch-done.py --queue [--repo OWNER/NAME] [--prs FILE] [--log FILE] [--what TEXT]"""
import argparse, json, os, subprocess, sys
from datetime import datetime
from zoneinfo import ZoneInfo

LABEL = "review: approved"


def gh(path):
    r = subprocess.run(["gh", "api", "--paginate", "--slurp", path] if "?" in path else ["gh", "api", path],
                       capture_output=True, text=True, timeout=60)
    if r.returncode:
        raise RuntimeError((r.stderr.strip() or "gh api failed").splitlines()[0][:120])
    d = json.loads(r.stdout)
    return [x for page in d for x in page] if "?" in path else d


def main():
    a = argparse.ArgumentParser(description="the end condition of a watch (LR-127)")
    g = a.add_mutually_exclusive_group(required=True)
    g.add_argument("--pr", type=int)
    g.add_argument("--queue", action="store_true")
    a.add_argument("--repo", default=os.environ.get("WATCH_REPO", "expat-ready/xpatready"))
    a.add_argument("--prs", help="JSON as gh api returns it, in place of GitHub")
    a.add_argument("--log", default=os.environ.get("WATCH_LOG", os.path.expanduser("~/.claude/xr-watch-ends.tsv")))
    a.add_argument("--what", default="", help="the watch's name in the log line")
    o = a.parse_args()
    what = o.what or (f"#{o.pr}" if o.pr else "merge queue")
    try:
        if o.prs:
            with open(o.prs) as f:
                d = json.load(f)
        else:
            d = gh(f"repos/{o.repo}/pulls/{o.pr}") if o.pr else gh(f"repos/{o.repo}/pulls?state=open&per_page=100")
        if o.pr:
            if not isinstance(d, dict) or d.get("number") != o.pr or d.get("state") not in ("open", "closed"):
                raise ValueError(f"not pull request #{o.pr}")
            why = None if d["state"] == "open" else ("merged" if d.get("merged_at") or d.get("merged") else "closed")
            wait = f"#{o.pr} is open"
        else:
            if not isinstance(d, list):
                raise ValueError("not a list of pull requests")
            queued = sorted(p["number"] for p in d if p.get("state", "open") == "open"
                            and any(lb.get("name") == LABEL for lb in p.get("labels") or []))
            why = None if queued else f"empty (no open PR labelled {LABEL})"
            wait = f"{len(queued)} queued: " + " ".join(f"#{n}" for n in queued[:12])
    except Exception as e:  # noqa: BLE001 - every read failure is the same answer: not done, said
        print(f"watch-done: {what}: cannot read ({str(e)[:140]}); not ended, the watch keeps going")
        return 2
    if why is None:
        print(f"watch-done: {what}: not yet ({wait})")
        return 1
    now = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d %H:%M IST")
    print(f"watch end: {what} {why} at {now}")
    try:
        os.makedirs(os.path.dirname(o.log) or ".", exist_ok=True)
        with open(o.log, "a") as f:
            f.write(f"{now}\t{what}\t{why}\n")
    except OSError as e:
        print(f"watch-done: log not written ({e}); the watch still ends")
    return 0


if __name__ == "__main__":
    sys.exit(main())
