#!/usr/bin/env python3
# Library freshness (founder, 15 Nov: "keep these documents updated ... need based ... in the most token efficient way").
# Reads only git history and file times, never the documents: a living master is "behind" when one of its feeds
# (product/cockpit/library.json) changed in a commit after the master's own last commit. History and decision
# records are never checked; a source document (no feeds) is current by definition. Free to run: no API, no model.
# Reads this Lead branch and origin/main together: records land on the Lead branch, code feeds on main.
# Usage: python3 product/tools/library-freshness.py [--json] [--ref <one ref>]   Exit code = number of documents behind.
# Lead-watch section 8 runs it each check; only a "behind" document gets a refresh (one small job, one records commit).
import glob, json, os, subprocess, sys
from datetime import datetime, timezone, timedelta

ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True,
                      cwd=os.path.dirname(os.path.abspath(__file__))).stdout.strip()
CFG = os.path.join(ROOT, "ai-workers/problem-1-pathway-setup-and-form-filling/product/cockpit/library.json")
IST = timezone(timedelta(hours=5, minutes=30))


def git(*a):
    return subprocess.run(["git", *a], capture_output=True, text=True, cwd=ROOT).stdout.strip()


def last_commit(refs, path):
    """(epoch, sha) of the newest commit on any of refs touching path (a pathspec, globs allowed)."""
    out = git("log", "-1", "--format=%ct %h", *refs, "--", f":(glob){path}" if "*" in path else path)
    if not out:
        return None, None
    t, h = out.split()
    return int(t), h


def feed_commits_after(ref, doc, feeds, after, grep=None):
    """Commits on ref after `after` touching a feed but not the document itself (a commit that changes both counts as
    the document kept current)."""
    if not feeds:
        return []
    args = ["log", "--format=%ct %h", f"--since=@{after + 1}", *ref]
    if grep:
        args += ["-G", grep, "-i"]
    args += ["--"] + feeds
    rows = [r.split() for r in git(*args).splitlines() if r]
    out = []
    docspec = (f":(glob){doc}" if "*" in doc else doc) if doc else None
    for t, h in rows:
        if int(t) <= after:
            continue
        if docspec and git("log", "--format=%h", "--no-walk", h, "--", docspec):
            continue
        out.append((int(t), h))
    return out


def ist(t):
    return datetime.fromtimestamp(t, IST).strftime("%d %b %H:%M IST")


def check(ref=("HEAD", "origin/main")):
    cfg = json.load(open(CFG))
    res = []
    for d in cfg["docs"]:
        r = {"name": d["name"], "status": d["status"], "state": "not checked", "why": ""}
        if d["status"] != "living":
            r["why"] = f"{d['status']}: not checked"
            res.append(r)
            continue
        path = d["path"]
        if path.startswith("artifact:") or path.startswith("local:"):
            if not d.get("refreshed"):
                r["state"], r["why"] = "unknown", "no 'refreshed' time in library.json"
                res.append(r)
                continue
            t_doc, h_doc = int(datetime.fromisoformat(d["refreshed"]).timestamp()), None
        else:
            t_doc, h_doc = last_commit(ref, path)
            if t_doc is None:
                r["state"], r["why"] = "unknown", f"no commit found for {path}"
                res.append(r)
                continue
        r["doc_time"] = ist(t_doc)
        own = None if path.startswith(("artifact:", "local:")) else path
        behind = feed_commits_after(ref, own, d["feeds"], t_doc, d.get("feed_grep"))
        lg = d.get("local_feed_glob")
        if lg:
            snaps = sorted(glob.glob(os.path.join(ROOT, lg)), key=os.path.getmtime)
            if snaps and os.path.getmtime(snaps[-1]) > t_doc:
                behind.append((int(os.path.getmtime(snaps[-1])), os.path.basename(snaps[-1])))
            elif not snaps:
                r["why"] = "no local snapshot here (Mac only); "
        if not d["feeds"] and not lg:
            r["state"], r["why"] = "current", "source document"
        elif behind:
            behind.sort()
            r["state"] = "behind"
            r["since"] = ist(behind[0][0])
            r["feed_changes"] = len(behind)
            r["why"] += f"{len(behind)} feed change(s) since {r['doc_time']}, first {behind[0][1]} at {r['since']}; refresh: {d.get('refresh', '')}"
        else:
            r["state"] = "current"
            r["why"] += f"no feed change since {r['doc_time']}"
        res.append(r)
    return res


def main():
    ref = (sys.argv[sys.argv.index("--ref") + 1],) if "--ref" in sys.argv else ("HEAD", "origin/main")
    res = check(ref)
    if "--json" in sys.argv:
        print(json.dumps(res, indent=1))
    else:
        for r in res:
            if r["status"] == "living":
                print(f"{r['state']:<8} {r['name']}: {r['why']}")
    sys.exit(sum(1 for r in res if r["state"] == "behind"))


if __name__ == "__main__":
    main()
