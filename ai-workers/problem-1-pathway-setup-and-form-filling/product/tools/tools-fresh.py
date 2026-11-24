#!/usr/bin/env python3
"""Are this copy's product/tools main's newest, file by file (A363, founder 24 Nov: a Lead's copy had left main on 11 Nov, so
the rules on main could not run there)? First line of lead-watch.sh; founder-report.py prints no report without a yes.

It fetches main (nothing but the remote-tracking ref of main is written: no index, HEAD, branch or file), pins that one sha and
compares each file with it. Exit 0 yes; 1 no (an ACT, with the one line that fixes it); 2 unknown (a failed or partial fetch:
an ACT, never "fresh"). A file is
  old      some earlier main's, or this branch's own: the printed line brings main's
  edited   no main's and not this branch's, or a file, folder or link stands where main has another kind (the line would remove it): the line is not printed, the files are named (nobody's work is overwritten)
  extra    main has no such file (or has deleted it): named, left
The line is printed only; nothing here runs it, and it stages nothing (git restore --worktree; --overlay, or it
would remove a file that main has removed).   Test: check-tools-fresh.sh
  python3 -I tools-fresh.py"""
import os, shlex, subprocess, sys, time
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
REL = "ai-workers/problem-1-pathway-setup-and-form-filling/product/tools"
IST = timezone(timedelta(hours=5, minutes=30))
LINE = "git -C %s restore --overlay --source=%s --worktree -- " + REL


def git(*a, stdin=None, limit=60):
    r = subprocess.run(["git", "-C", TOP, *a], input=stdin, capture_output=True, text=True, timeout=limit)
    if r.returncode != 0:
        raise OSError("git %s: %s" % (a[0], r.stderr.strip()[:120]))
    return r.stdout


def tree(rev):
    out = {}
    for line in git("ls-tree", "-r", "-z", rev, "--", REL).split("\0"):
        if line:
            meta, path = line.split("\t", 1)
            out[path] = (meta.split()[2], meta.split()[0])
    return out


def names(x, n=8):
    x = sorted(os.path.relpath(p, REL) for p in x)
    return "%d (%s%s)" % (len(x), ", ".join(x[:n]), ", ..." if len(x) > n else "")


def main():
    global TOP
    TOP = subprocess.run(["git", "-C", HERE, "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip()
    try:
        if not TOP or os.path.realpath(HERE) != os.path.realpath(os.path.join(TOP, REL)):
            raise OSError("not run from a copy's product/tools")
        fetch = ("fetch", "-q", "--no-tags", "--no-write-fetch-head", "--no-auto-maintenance", "origin", "+refs/heads/main:refs/remotes/origin/main")
        try:
            git(*fetch, limit=10)      # a check must not wait on the network
        except OSError:
            time.sleep(1)              # another check was writing the same ref
            git(*fetch, limit=10)
        sha = git("rev-parse", "--verify", "refs/remotes/origin/main^{commit}").strip()
        want, head = tree(sha), tree("HEAD")
        if len(want) < (1 if "--few" in sys.argv else 10):
            raise OSError("main's tools list is nearly empty")
        when = int(git("log", "-1", "--format=%ct", sha))
        have = {}
        for d, ds, fs in os.walk(os.path.join(TOP, REL)):
            ds[:] = [x for x in ds if x != "__pycache__"]
            for f in fs:
                if not f.endswith((".pyc", ".DS_Store")):
                    have[os.path.relpath(os.path.join(d, f), TOP)] = None
            have.update({os.path.relpath(os.path.join(d, x), TOP): None for x in ds if os.path.islink(os.path.join(d, x))})
        at = lambda p: os.path.join(TOP, p)
        paths = sorted(p for p in have if not os.path.islink(at(p)))
        for p, h in zip(paths, git("hash-object", "--no-filters", "--stdin-paths", stdin="".join(p + "\n" for p in paths)).split()):
            have[p] = (h, "100755" if os.access(at(p), os.X_OK) else "100644")
        for p in have:
            if os.path.islink(at(p)):
                have[p] = (git("hash-object", "--stdin", stdin=os.readlink(at(p))).strip(), "120000")
        def clash(p):   # what the line would have to remove: a link or file where main has a folder, or a folder where main has a file
            up = p
            while up != REL:
                up = os.path.dirname(up)
                if up != REL and (os.path.islink(at(up)) or os.path.isfile(at(up))):
                    return True
            return os.path.isdir(at(p)) or (os.path.islink(at(p)) and have.get(p) != want[p])
        stuck = [p for p in want if clash(p)]
        missing = [p for p in want if p not in have and p not in stuck]
        extra = [p for p in have if p not in want]
        old, edited = [], []
        for p in (p for p in want if p in have and have[p] != want[p] and p not in stuck):
            b = have[p][0]   # main's own states: its first parents, a merge's result included
            mains = b == want[p][0] or b == head.get(p, ("",))[0] or git("log", "-1", "--first-parent", "--diff-merges=first-parent", "--format=%h", "--find-object=" + b, sha, "--", p).strip()
            (old if mains else edited).append(p)
        edited += stuck
    except (OSError, ValueError, subprocess.TimeoutExpired) as e:
        print("ACT   tools: unknown whether they are main's (%s): not fresh until this reads" % str(e)[:150])
        return 2
    said = "main %s, committed %s IST (%d min old)" % (sha[:9], datetime.fromtimestamp(when, IST).strftime("%d %b %H:%M"), (time.time() - when) / 60)
    ext = " · not on main, left as they are: %s" % names(extra, 4) if extra else ""
    if not missing and not old and not edited:
        print("tools  %s: this copy's %d files are the same%s" % (said, len(want), ext))
        return 0
    what = "; ".join(w for w in ("old %s" % names(old) if old else "", "missing %s" % names(missing) if missing else "",
                                 "edited here %s" % names(edited) if edited else "") if w)
    print("ACT   tools: not %s: %s%s. %s" % (said, what, ext, "REFUSED a fix: the edited files are nobody's on main: commit or move them first"
          if edited else "The files stay unstaged (before a later branch change: git restore --worktree -- <tools>, and move the new ones away). Run: " + LINE % (shlex.quote(TOP), sha)))
    return 1


if __name__ == "__main__":
    sys.exit(main())
