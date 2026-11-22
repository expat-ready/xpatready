#!/usr/bin/env python3
"""Merge-queue batches running now (P-791 (2), (4); founder 22 Nov). Lesson: the Lead's by-hand merge of #2754 at 12:1x IST
moved main under the queue and restarted 9 running batches. A batch is an open PR whose head branch starts with mergify/
and whose head commit still has a check run that is not completed.

  python3 product/tools/queue-batches.py [--pulls FILE] [--checks FILE] [--count]
--pulls: GitHub's /pulls?state=open JSON (tests); --checks: {"<head sha>": <commits/{sha}/check-runs JSON>} (tests).
Without them it reads GitHub through gh.sh (REST only). Prints one line for lead-watch.sh:
  batches N merge-queue batch(es) running (#a, #b) · a manual merge to main now restarts N batches
--count prints only N. Unreadable: "batches not measured (...)" and, with --count, "?"; exit 3. Read-only, US$0, never
merges, never cancels. Used by lead-watch.sh and lead-merge.sh. Test: check-lead-merge.sh.
"""
import json, os, subprocess, sys

TOOLS = os.path.dirname(os.path.abspath(__file__))


def gh(path):
    p = subprocess.run(["bash", f"{TOOLS}/gh.sh", "api", path], capture_output=True, text=True, timeout=60)
    if p.returncode != 0:   # gh prints GitHub's error body on stdout too: never read it as "no batch"
        raise ValueError(f"gh api exit {p.returncode}: {(p.stdout or p.stderr).strip()[:100]}")
    return json.loads(p.stdout)


def running(pulls, checks_of):
    """Open mergify/ PRs whose head commit has a check run not completed (no check run yet counts as running)."""
    if not isinstance(pulls, list):
        raise ValueError("the open PR list is not a list: " + str((pulls or {}).get("message", type(pulls).__name__))[:80])
    out = []
    for p in pulls:
        if p.get("state", "open") != "open" or not str((p.get("head") or {}).get("ref", "")).startswith("mergify/"):
            continue
        runs = checks_of((p.get("head") or {}).get("sha"))
        if not isinstance(runs, dict) or not isinstance(runs.get("check_runs"), list):
            raise ValueError(f"checks of #{p.get('number')} unreadable")
        if (runs.get("total_count") or 0) > len(runs["check_runs"]):   # one page only: unfinished runs may be on the next
            raise ValueError(f"checks of #{p.get('number')}: only {len(runs['check_runs'])} of {runs['total_count']} read")
        if not runs["check_runs"] or any(r.get("status") != "completed" for r in runs["check_runs"]):
            out.append(p.get("number"))
    return sorted(out)


def main(argv):
    a = {"--pulls": None, "--checks": None}
    for i, x in enumerate(argv):
        if x in a and i + 1 < len(argv):
            a[x] = argv[i + 1]
    try:
        pulls = json.load(open(a["--pulls"])) if a["--pulls"] else gh("repos/{owner}/{repo}/pulls?state=open&sort=created&direction=desc&per_page=100")
        if isinstance(pulls, list) and len(pulls) >= 100:   # a full page: the oldest open PRs are unread (batches are new)
            print("warn  100 open PRs read, older ones not; batches are among the newest", file=sys.stderr)
        if a["--checks"]:
            table = json.load(open(a["--checks"]))
            checks_of = lambda sha: table.get(sha)
        else:
            checks_of = lambda sha: gh(f"repos/{{owner}}/{{repo}}/commits/{sha}/check-runs?per_page=100")
        n = running(pulls, checks_of)
    except Exception as e:   # any unreadable answer is "not measured", never 0
        print("?" if "--count" in argv else f"batches not measured ({str(e)[:100]}): a manual merge to main may restart running batches")
        return 3
    if "--count" in argv:
        print(len(n))
    else:
        print(f"batches {len(n)} merge-queue batch(es) running" + (f" ({', '.join('#%s' % x for x in n)})" if n else "")
              + f" · a manual merge to main now restarts {len(n)} batches")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
