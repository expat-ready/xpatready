#!/usr/bin/env python3
"""Proof and Lead-read watch (founder, 20 Nov 23:1x IST, typed to Lead 4: "make them as a enforced rules and make them live";
STATE hand-over Lead 4 -> Lead 5 item (3); built by Lead 5 (series 3)). Two lessons of 20 Nov, now ACT lines in lead-watch:

 (a) proof: a PR merged in the last 24 h with a "Completes: R1.<n>" line and no qa PR naming that capability opened after
     the merge, once 30 min have passed -> ACT "type /qa capability R1.<n> into its qa lane" (qa lanes wait for a typed
     command after a merge; P-728 proof at the last merge).
 (b) read: an open, ready, unlabelled PR whose head carries "Reviewer: Approve <head sha>" but touches a path of
     lead-read-paths.txt with no "Lead read the diff: <head sha>" comment -> ACT with its age (three approved PRs waited
     hours on the Lead's P-423 read, 20 Nov).

Read-only, US$0. GitHub through gh.sh (TLS fallback to curl, P-363). Test: check-proof-read-watch.sh (fixtures, no network).
Usage: python3 -I proof-read-watch.py [--fixture DIR] [--now 2026-11-20T18:00:00Z]
Exit code: number of ACT lines (capped at 100).
"""
import json, os, re, subprocess, sys
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = "expat-ready/xpatready"
PROOF_WAIT = timedelta(minutes=30)
WINDOW = timedelta(hours=24)
STALE_MIN = 24 * 60
LABEL = "review: approved"
COMPLETES = re.compile(r"(?im)^\s*\**Completes:?\**\s*(.*)$")
CAP = re.compile(r"\bR\d+\.\d+\b")
APPROVE = re.compile(r"(?im)^[\s>*_]*Reviewer:?[\s*_]*Approve[\s*_`]+([0-9a-f]{7,40})\b")
LEAD_READ = re.compile(r"(?i)Lead read the diff:?[\s`]*([0-9a-f]{7,40})\b")


def ts(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def ist(d):
    return (d + timedelta(hours=5, minutes=30)).strftime("%H:%M IST")


class Source:
    """Live reads through gh.sh, or fixture files: closed.json, open.json, comments_<n>.json, files_<n>.json."""

    def __init__(self, fixture):
        self.fixture = fixture

    def get(self, name, path):
        if self.fixture:
            f = os.path.join(self.fixture, name + ".json")
            if not os.path.exists(f):
                return []
            with open(f) as fh:
                return json.load(fh)
        r = subprocess.run(["bash", os.path.join(HERE, "gh.sh"), "api", path], capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError("gh api %s: exit %d %s" % (path, r.returncode, r.stderr.strip()[:120]))
        return json.loads(r.stdout or "[]")


def read_paths():
    with open(os.path.join(HERE, "lead-read-paths.txt")) as fh:
        return [re.compile(l.strip(), re.I) for l in fh if l.strip() and not l.lstrip().startswith("#")]


def proof(closed, openp, now):
    acts, says = [], []
    allp = closed + openp
    for p in closed:
        if not p.get("merged_at"):
            continue
        merged = ts(p["merged_at"])
        if now - merged > WINDOW:
            continue
        caps = []
        for line in COMPLETES.findall(p.get("body") or ""):
            caps += [c for c in CAP.findall(line) if c not in caps]
        for cap in caps:
            word = re.compile(re.escape(cap) + r"(?![\d.]*\d)")
            done = [q["number"] for q in allp if re.match(r"(?i)qa\b", q.get("title") or "")
                    and word.search(q["title"]) and ts(q["created_at"]) >= merged]
            if done:
                says.append("proof %s: qa PR #%d after merge #%d" % (cap, done[0], p["number"]))
            elif now - merged < PROOF_WAIT:
                says.append("proof %s: #%d merged %s, qa has until %s" % (cap, p["number"], ist(merged), ist(merged + PROOF_WAIT)))
            else:
                acts.append('%s merged in #%d at %s, no qa proof PR after %d min: type "/qa capability %s" into its qa lane (P-728)'
                            % (cap, p["number"], ist(merged), int((now - merged).total_seconds() // 60), cap))
    return acts, says


def read_wait(src, openp, now, paths):
    acts, stale = [], []
    for p in openp:
        if p.get("draft") or p["head"]["ref"].startswith("mergify/") or LABEL in [l["name"] for l in p.get("labels", [])]:
            continue
        n, head = p["number"], p["head"]["sha"].lower()
        comments = src.get("comments_%d" % n, "repos/%s/issues/%d/comments?per_page=100" % (REPO, n))
        appr = [c for c in comments for m in APPROVE.findall(c.get("body") or "") if head.startswith(m.lower())]
        if not appr:
            continue
        if any(head.startswith(m.lower()) for c in comments for m in LEAD_READ.findall(c.get("body") or "")):
            continue
        files = src.get("files_%d" % n, "repos/%s/pulls/%d/files?per_page=100" % (REPO, n))
        hit = [f["filename"] for f in files if any(r.search(f["filename"]) for r in paths)]
        if not hit:
            continue
        age = int((now - ts(appr[-1]["created_at"])).total_seconds() // 60)
        if age >= STALE_MIN:
            stale.append("#%d (%d h)" % (n, age // 60))
            continue
        acts.append("#%d approved at %s %d min ago, unlabelled: waits on the Lead's P-423 read (%s): read the diff, then "
                    "comment \"Lead read the diff: %s\" (%s)" % (n, head[:9], age, ", ".join(os.path.basename(h) for h in hit[:3]),
                                                                head[:9], (p.get("title") or "")[:40]))
    if stale:  # one line, so a backlog of old approvals never buries tonight's
        acts.append("%d approved PR(s) waiting over 24 h on the Lead's P-423 read: %s: read each diff, or close it if superseded"
                    % (len(stale), ", ".join(stale)))
    return acts


def main(argv):
    fixture = argv[argv.index("--fixture") + 1] if "--fixture" in argv else None
    now = ts(argv[argv.index("--now") + 1]) if "--now" in argv else datetime.now(timezone.utc).replace(microsecond=0)
    src = Source(fixture)
    try:
        closed = src.get("closed", "repos/%s/pulls?state=closed&sort=updated&direction=desc&per_page=100" % REPO)
        openp = src.get("open", "repos/%s/pulls?state=open&per_page=100" % REPO)
        a1, says = proof(closed, openp, now)
        a2 = read_wait(src, openp, now, read_paths())
    except Exception as e:  # a failed read is an ACT, never a silent pass
        print("ACT   proof/read watch could not run: %s" % str(e)[:160])
        return 1
    for s in says:
        print(s)
    for a in a1 + a2:
        print("ACT   " + a)
    if not a1 + a2:
        print("proof every merged Completes: row has its qa PR; no approved PR waits on the Lead's read")
    return min(len(a1 + a2), 100)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
