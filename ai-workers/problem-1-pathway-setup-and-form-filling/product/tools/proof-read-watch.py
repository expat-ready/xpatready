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
# The "Completes:" line as CI's item-proof.mjs detect() reads it: optionally a list item, quote or bold; R1 ids only;
# lines inside ``` fences are examples (review m2).
COMPLETES = re.compile(r"^[\s>*-]*(?:\*\*|__)?Completes(?:\*\*|__)?\s*:(?:\*\*|__)?\s*(.*)$")
ITEM = re.compile(r"^R1\.\d+$")
QA_TITLE = re.compile(r"(?i)^qa:")   # "qa: capability R1.16 Works ..."; never "QA-610: ..." (a builder's fix, review m4)
WRITER = ("OWNER", "MEMBER", "COLLABORATOR")   # as queue-gate.sh and lead-read-guard.sh count a comment (review m3)
SHA = re.compile(r"\b[0-9a-f]{7,40}\b")
VERDICT = re.compile(r"^\s*reviewer:", re.I)
LEAD_READ = re.compile(r"(?i)Lead read the diff:? +([0-9a-f]{7,40})\b")
PER_PAGE = int(os.environ.get("PRW_PER_PAGE", "100"))
MAX_PAGES = 30   # GitHub lists at most 3000 files or comments; past that the read is incomplete and says so


def ts(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def ist(d):
    return (d + timedelta(hours=5, minutes=30)).strftime("%H:%M IST")


class Source:
    """Live reads through gh.sh, or fixture files: closed.json, open.json, comments_<n>.json, files_<n>.json."""

    def __init__(self, fixture):
        self.fixture = fixture

    def page(self, name, path, n):
        if self.fixture:
            f = os.path.join(self.fixture, "%s%s.json" % (name, "" if n == 1 else "_p%d" % n))
            if not os.path.exists(f):
                return []
            with open(f) as fh:
                data = json.load(fh)
        else:
            sep = "&" if "?" in path else "?"
            r = subprocess.run(["bash", os.path.join(HERE, "gh.sh"), "api", "%s%sper_page=%d&page=%d" % (path, sep, PER_PAGE, n)],
                               capture_output=True, text=True)
            if r.returncode != 0:
                raise RuntimeError("gh api %s: exit %d %s" % (path, r.returncode, r.stderr.strip()[:120]))
            data = json.loads(r.stdout)
        if not isinstance(data, list):
            raise RuntimeError("gh api %s: not a list" % path)
        return data

    def get(self, name, path, stop=None):
        """Every page (review M1: one page of closed PRs covered ~8.5 h of the 24 h window). stop(page) ends early once
        the rest is outside the window; running out of pages is an error, never a silent cut."""
        out = []
        for n in range(1, MAX_PAGES + 1):
            pg = self.page(name, path, n)
            out += pg
            if len(pg) < PER_PAGE or (stop and stop(pg)):
                return out
        raise RuntimeError("%s: more than %d pages, the read is incomplete" % (path, MAX_PAGES))


def read_paths():
    out = []
    with open(os.path.join(HERE, "lead-read-paths.txt")) as fh:
        for l in fh:
            if l.startswith("# --- read-after public"):   # P-823: queue-gate.sh's after-read only, never a read before the label
                break
            if l.strip() and not l.lstrip().startswith("#"):
                out.append(re.compile(l.strip(), re.I))
    return out


def proof(closed, openp, now):
    acts, says = [], []
    allp = closed + openp
    for p in closed:
        if not p.get("merged_at"):
            continue
        merged = ts(p["merged_at"])
        if now - merged > WINDOW:
            continue
        caps, fence = [], False
        for raw in (p.get("body") or "").splitlines():
            if re.match(r"^\s*(```|~~~)", raw):
                fence = not fence
                continue
            m = None if fence else COMPLETES.match(raw)
            if not m:
                continue
            toks = [t for t in re.split(r"\s*,\s*|\s+and\s+|\s+", re.sub(r"[.;]\s*$", "", m.group(1))) if t]
            if toks and all(ITEM.match(t) for t in toks):   # item-proof calls any other line unreadable, never a claim
                caps += [t for t in toks if t not in caps]
        for cap in caps:
            word = re.compile(re.escape(cap) + r"(?![\d.]*\d)")
            done = [q["number"] for q in allp if QA_TITLE.match(q.get("title") or "")
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
        comments = [c for c in src.get("comments_%d" % n, "repos/%s/issues/%d/comments" % (REPO, n))
                    if c.get("author_association") in WRITER]
        # queue-gate.sh's rule: the last "Reviewer:" verdict that can be about this head decides (a line naming the head
        # or a prefix of it, or naming no SHA); it must be an Approve naming the full head.
        last, first_ok = None, None
        for c in comments:
            for line in (c.get("body") or "").replace("*", "").replace("_", "").replace("`", "").splitlines():
                if not VERDICT.match(line):
                    continue
                shas = [x.lower() for x in SHA.findall(line) if re.search(r"\d", x) and re.search(r"[a-fA-F]", x)]
                if shas and not any(head.startswith(x) for x in shas):
                    continue
                last = (c, line)
                if re.match(r"(?i)^\s*reviewer:\s*approve[sd]?\s+%s\b" % head, line) and first_ok is None:
                    first_ok = c
        if not last or not re.match(r"(?i)^\s*reviewer:\s*approve[sd]?\s+%s\b" % head, last[1]):
            continue
        if any(head.startswith(m.lower()) for c in comments for m in LEAD_READ.findall(c.get("body") or "")):
            continue
        files = src.get("files_%d" % n, "repos/%s/pulls/%d/files" % (REPO, n))
        # Every changed path, .md included, and a rename's old path: as queue-gate.sh matches them (review round 2 M1, m2).
        names = [x for f in files for x in (f["filename"], f.get("previous_filename")) if x]
        hit = [x for x in names if any(r.search(x) for r in paths)]
        if not hit:
            continue
        age = int((now - ts(first_ok["created_at"])).total_seconds() // 60)   # the first Approve on the head: the true wait
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
        cutoff = now - WINDOW
        closed = src.get("closed", "repos/%s/pulls?state=closed&sort=updated&direction=desc" % REPO,
                         stop=lambda pg: ts(pg[-1]["updated_at"]) < cutoff)
        openp = src.get("open", "repos/%s/pulls?state=open" % REPO)
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
