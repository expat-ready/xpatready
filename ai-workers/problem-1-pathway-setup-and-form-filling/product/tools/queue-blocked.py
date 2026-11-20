#!/usr/bin/env python3
"""Queue blocked by checks (ENF-758, P-757, P-758): the check-only fix the Lead merges in the browser at once.

20 Nov 09:0x-13:1x IST the merge queue stood about 4 h on #2435 (a test hold) and #2438 (a Mergify scope), each red
without the other, and no check told the Lead to merge them by hand. P-758: at the first check that sees checks holding
the queue, the Lead merges the approved check-only fix in the built-in browser that same check. This prints its ACT line.

The queue is held by checks when main's newest finished guards run is red, or a merge-queue batch's ci failed in the
last WINDOW_H hours, or a PR got the `dequeued` label in that time. Then every open PR (not a draft, not a Mergify batch)
that touches only check paths (CHECK_ONLY), is approved on its head (`review: approved`, or the last "Reviewer:" verdict
naming the head from someone with write access is "Reviewer: Approve <head>") and has a green `ci` on its head gets:
  ACT   queue blocked by checks: #N (<title>) is a check-only fix, approved, ci green: merge it in the browser now (P-757, P-758)
Not held: one "checks" line, and no per-PR read. A reading that fails is said on a warn line, never a silent pass: the
queue then counts as possibly held, so a waiting check-only fix is still shown.

GitHub is read through gh.sh (the helper lead-watch.sh uses; QB_GH replaces it in the test). Read-only, US$0.
  python3 product/tools/queue-blocked.py [--repo OWNER/NAME] [--now ISO]
Test: check-queue-blocked.sh (fake GitHub answers, no network).
"""
import json, os, re, shlex, subprocess, sys
from datetime import datetime, timedelta, timezone

TOOLS = os.path.dirname(os.path.abspath(__file__))
WINDOW_H = 2   # a failed batch or a dequeue this recent still holds the queue
# Check paths (P-757: tests, CI, Mergify, guard tools; no product code). Matched against each changed path.
CHECK_ONLY = [re.compile(x) for x in (
    r"(^|/)prototype/studio/tests/", r"^tests/", r"^\.github/", r"^\.mergify\.yml$", r"(^|/)run-suites\.sh$",
    r"(^|/)product/tools/check-[^/]+\.sh$", r"(^|/)product/tools/[^/]*guard[^/]*$", r"(^|/)product/tools/fixtures/")]
TRUSTED = ("OWNER", "MEMBER", "COLLABORATOR")
SHA = re.compile(r"\b[0-9a-f]{7,40}\b", re.I)


class Unread(Exception):
    pass


def gh(*args):
    cmd = shlex.split(os.environ["QB_GH"]) if os.environ.get("QB_GH") else ["bash", os.path.join(TOOLS, "gh.sh")]
    try:
        r = subprocess.run(cmd + list(args), capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise Unread(str(e))
    if r.returncode != 0:
        raise Unread(((r.stderr or r.stdout).strip().splitlines() or ["exit %d" % r.returncode])[-1][:120])
    return r.stdout


def api(path, kind):
    try:
        doc = json.loads(gh("api", path))
    except ValueError:
        raise Unread("not JSON")
    if not isinstance(doc, kind):
        raise Unread(str((doc or {}).get("message", "unexpected answer")) if isinstance(doc, dict) else "unexpected answer")
    return doc


def when(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def check_only(files):
    return bool(files) and all(any(r.search(f) for r in CHECK_ONLY) for f in files)


def approved_by_comment(comments, head):
    """The last "Reviewer:" verdict that can be about this head (it names the head or a prefix of it, or no SHA) from
    someone with write access must be an Approve naming the full head (queue-gate.sh's rule)."""
    last = ""
    for c in comments:
        if c.get("author_association") not in TRUSTED:
            continue
        for line in re.sub(r"[*_`]", "", c.get("body") or "").splitlines():
            if not re.match(r"\s*reviewer:", line, re.I):
                continue
            shas = [x.lower() for x in SHA.findall(line) if re.search(r"\d", x) and re.search(r"[a-f]", x, re.I)]
            if not shas or any(head.startswith(x) for x in shas):
                last = line
    return bool(re.match(r"\s*reviewer:\s*approve[sd]?\s+%s\b" % re.escape(head), last, re.I))


def ci_green(runs):
    """The newest finished `ci` run on the head (by GitHub Actions) is a success, and none is still running."""
    mine = [r for r in runs if r.get("name") == "ci" and (r.get("app") or {}).get("slug", "github-actions") == "github-actions"]
    if not mine or any(r.get("status") != "completed" for r in mine):
        return False
    return max(mine, key=lambda r: r.get("completed_at") or "").get("conclusion") == "success"


def held(repo, now):
    """(reasons, warnings): why checks hold the queue now."""
    why, warn, since = [], [], now - timedelta(hours=WINDOW_H)
    try:
        g = [r for r in api("repos/%s/actions/workflows/guards.yml/runs?branch=main&per_page=20" % repo, dict).get("workflow_runs") or []
             if r.get("status") == "completed"]
        if g:
            last = max(g, key=lambda r: r.get("created_at") or "")
            if last.get("conclusion") in ("failure", "timed_out"):
                why.append("guards red on main (run %s)" % last.get("id"))
    except Unread as e:
        warn.append("main's guards runs unreadable (%s)" % e)
    try:
        b = [r for r in api("repos/%s/actions/workflows/ci.yml/runs?per_page=100" % repo, dict).get("workflow_runs") or []
             if str(r.get("head_branch") or "").startswith("mergify/merge-queue/") and r.get("conclusion") in ("failure", "timed_out")
             and (when(r.get("updated_at")) or now) >= since]
        if b:
            why.append("merge batch failed in %d h (run %s)" % (WINDOW_H, " ".join(str(r.get("id")) for r in b[:3])))
    except Unread as e:
        warn.append("merge batch runs unreadable (%s)" % e)
    try:
        d = sorted({e.get("issue", {}).get("number") for e in api("repos/%s/issues/events?per_page=100" % repo, list)
                    if e.get("event") == "labeled" and (e.get("label") or {}).get("name") == "dequeued"
                    and (when(e.get("created_at")) or now) >= since} - {None})
        if d:
            why.append("dequeued in %d h: %s" % (WINDOW_H, " ".join("#%s" % n for n in d)))
    except Unread as e:
        warn.append("dequeue events unreadable (%s)" % e)
    return why, warn


def main(argv):
    repo, now = None, datetime.now(timezone.utc)
    for i, a in enumerate(argv):
        if a == "--repo": repo = argv[i + 1]
        if a == "--now": now = when(argv[i + 1]) or now
    try:
        repo = repo or gh("repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner").strip()
    except Unread as e:
        print("warn  queue blocked by checks: not measured (repository unreadable: %s)" % e); return 0
    why, warn = held(repo, now)
    for w in warn:
        print("warn  queue blocked by checks: %s; counted as possibly held" % w)
    if not why and not warn:
        print("checks main's guards green, no failed merge batch or dequeue in %d h: the queue is not held by checks" % WINDOW_H); return 0
    try:
        prs = api("repos/%s/pulls?state=open&per_page=100" % repo, list)
    except Unread as e:
        print("warn  queue blocked by checks: open PRs unreadable (%s)" % e); return 0
    hits = 0
    for p in prs:
        n, head = p.get("number"), (p.get("head") or {}).get("sha") or ""
        if p.get("draft") or str((p.get("head") or {}).get("ref") or "").startswith("mergify/") or not head:
            continue
        try:
            files = [f.get("filename") for f in api("repos/%s/pulls/%s/files?per_page=100" % (repo, n), list)]
            if not check_only(files):
                continue
            labels = [l.get("name") for l in p.get("labels") or []]
            if "review: approved" not in labels and not approved_by_comment(api("repos/%s/issues/%s/comments?per_page=100" % (repo, n), list), head):
                continue
            if not ci_green(api("repos/%s/commits/%s/check-runs?check_name=ci&filter=latest&per_page=100" % (repo, head), dict).get("check_runs") or []):
                continue
        except Unread as e:
            print("warn  queue blocked by checks: #%s unreadable (%s)" % (n, e)); continue
        hits += 1
        print("ACT   queue blocked by checks: #%s (%s) is a check-only fix, approved, ci green: merge it in the browser now (P-757, P-758)"
              % (n, (p.get("title") or "")[:60]))
    print("checks queue held by checks (%s): %d approved green check-only fix(es) open" % ("; ".join(why) or "possibly", hits))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
