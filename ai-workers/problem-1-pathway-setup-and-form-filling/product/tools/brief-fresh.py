#!/usr/bin/env python3
"""Brief freshness (ENF-803, P-803; founder 22 Nov: "Always verify the source of information and whether the information
is up to date … Never assumes it"). Lessons of 22 Nov: lanes were started from qa notes of 18 Nov for parts merged since
(AUD-5 part 2 #2197, FO-5s #2802), and times were written as guesses (15:1x when the clock said 14:4x).
A lane brief (stdin) with a "Duplicate check:" line is refused (exit 1, one reason per line) when that line
  (1) names no origin/main commit: a 7-40 hex sha next to the word "main", which must be a commit on origin/main here;
  (2) names no exact clock time "HH:MM" (IST), or one more than 5 minutes ahead of TZ=Asia/Kolkata now (a guess);
and when the brief cites a qa note ("qa/....md", or "qa notes of 18 Nov") older than the newest commit on origin/main
touching the files on its "Touches:" line (touch-overlap.py's reader; first-parent, so a merge's time, not a lane's commit time), or cites one with no "Touches:" line to check.
A brief without a "Duplicate check:" line is left to brief-check.sh. Called by brief-check.sh --brief.
Env (tests): BRIEF_MAIN (default refs/remotes/origin/main), BRIEF_NOW (epoch, default now). Test: test-enf-803.sh."""
import importlib.util, os, re, subprocess, sys, time
from datetime import datetime, timedelta, timezone

TOOLS = os.path.dirname(os.path.abspath(__file__))
MAIN = os.environ.get("BRIEF_MAIN", "refs/remotes/origin/main")
IST = timezone(timedelta(hours=5, minutes=30))
MON = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()


def git(*a):
    p = subprocess.run(["git", *a], capture_output=True, text=True)
    return p.returncode, p.stdout.strip()


def touches(brief):
    spec = importlib.util.spec_from_file_location("touch_overlap", os.path.join(TOOLS, "touch-overlap.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m.touches(brief)


def resolve(entries, files):
    import fnmatch
    out = set()
    for e in entries:
        e = re.sub(r"^(\./)+", "", e)
        for f in files:
            if f == e or f.endswith("/" + e) or (e.endswith("/") and ("/" + e in "/" + f)) or fnmatch.fnmatch(f, e) or fnmatch.fnmatch(f, "*/" + e):
                out.add(f)
    return sorted(out)


def main():
    brief = sys.stdin.read().replace("\r", "")
    dup = [l for l in brief.splitlines() if re.match(r"^[\s*>-]*\**Duplicate check\**:", l)]
    if not dup:
        return 0
    line = " ".join(dup)
    bad = []
    now = datetime.fromtimestamp(float(os.environ.get("BRIEF_NOW") or time.time()), IST)
    # (1) the main sha
    rc, _ = git("rev-parse", "-q", "--verify", MAIN)
    # every 7-40 hex token with a digit on a line that names main ("origin/main at 73c4e4dc", "main head 73c4e4dc", ...)
    shas = [t for t in re.findall(r"\b([0-9a-f]{7,40})\b", line) if re.search(r"\d", t)] if re.search(r"\bmain\b", line) else []
    if rc != 0:
        bad.append(f"cannot read {MAIN} here: git fetch origin main, then check the brief again (ENF-803)")
    elif not shas:
        bad.append('"Duplicate check:" names no main sha: write "read origin/main <sha> at HH:MM IST" after a fresh fetch (ENF-803, P-803)')
    else:
        for s in shas:
            ok = git("cat-file", "-e", s + "^{commit}")[0] == 0 and git("merge-base", "--is-ancestor", s, MAIN)[0] == 0
            if not ok:
                bad.append(f'"Duplicate check:" sha {s} is not a commit on origin/main here (unfetched or a branch commit): fetch and read main again (ENF-803)')
    # (2) an exact time, not ahead of the clock
    times = re.findall(r"\b([01]\d|2[0-3]):([0-5]\d)\b", line)
    if not times:
        bad.append('"Duplicate check:" names no exact time: write the HH:MM IST that TZ=Asia/Kolkata date printed when you read main (not "14:5x"; ENF-803)')
    else:
        for h, m in times:
            ahead = (int(h) * 60 + int(m)) - (now.hour * 60 + now.minute)
            if 5 < ahead < 720:
                bad.append(f'"Duplicate check:" time {h}:{m} IST is ahead of the clock ({now:%H:%M} IST): a guessed time; read TZ=Asia/Kolkata date (ENF-803)')
    # (3) qa notes against the newest merge on the row's files
    # qa notes: files under a qa/ folder, not its registers (qa/CAPABILITIES.md, qa/BUGS.md, qa/GRAPH.md: all-caps names in qa/ itself)
    paths = sorted(p for p in set(re.findall(r"(?<![\w/.-])((?:[\w.-]+/)*qa/[\w./-]+\.md)\b", brief))
                   if not re.search(r"(^|/)qa/[A-Z0-9_-]+\.md$", p))
    dated = re.findall(r"\bqa notes?\b[^\n]{0,20}?\b(\d{1,2}) (" + "|".join(MON) + r")[a-z]*\b", brief, re.I)
    if (paths or dated) and rc == 0:
        tl = touches(brief)
        if not tl:
            bad.append('cites a qa note but has no "Touches:" line, so its age cannot be checked against the row\'s files (ENF-803)')
        else:
            files = git("ls-tree", "-r", "--name-only", MAIN)[1].splitlines()
            row = [f for f in resolve(tl, files) if "/qa/" not in "/" + f]
            last = git("log", "-1", "--first-parent", "--format=%H %ct", MAIN, "--", *row)[1].split() if row else []
            if last:
                lsha, lt = last[0], int(last[1])
                lwhen = datetime.fromtimestamp(lt, IST).strftime("%d %b %H:%M IST")
                for p in paths:
                    hit = resolve([p], files)
                    if not hit:
                        bad.append(f"qa note {p} is not on origin/main (ENF-803)"); continue
                    q = git("log", "-1", "--first-parent", "--format=%H %ct", MAIN, "--", hit[0])[1].split()
                    if q and int(q[1]) < lt:
                        bad.append(f"qa note {p} (last changed {datetime.fromtimestamp(int(q[1]), IST):%d %b %H:%M} IST, {q[0][:9]}) is older than "
                                   f"{lsha[:9]} ({lwhen}) touching the row's files: read qa on main again (ENF-803)")
                for d, mon in dated:
                    at = datetime(now.year, MON.index(mon.title()[:3]) + 1, int(d), 23, 59, tzinfo=IST)
                    if at.timestamp() < lt:
                        bad.append(f"qa notes of {d} {mon} are older than {lsha[:9]} ({lwhen}) touching the row's files: read qa on main again (ENF-803)")
    for b in bad:
        print("STALE: " + b)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
