#!/usr/bin/env python3
"""Lane clean-up list (A348, founder 24 Nov): the sessions whose pull requests have all merged, as a list for the Lead. It
archives, closes and deletes nothing, and no line is an ACT by itself.
  mac    each worktree under .claude/worktrees (never demo-main): its branch has a "Merge pull request #n from <owner>/<branch>"
         on main, no commit that is not on main, and nothing uncommitted. Never the worktree this runs in. It speaks for
         that branch only: the Lead looks at other branches and ignored files before archiving.
  cloud  each cloud line of the saved app view (app-view.js) whose status is "completed", that needs nothing, has been idle
         60 min or more, and names pull requests (#n, /pull/n, "pull request n"), every one merged on main.
Only an app view read in the last 15 min, whole (rows=N, no WARNING, not UNREADABLE), is used: else that is said and no
cloud lane is listed. Reads git (taking no lock in any lane) and the saved app view only. A read that fails is an ACT; a
worktree that cannot be read is one ACT and the others are still judged.
   python3 -I product/tools/lane-cleanup.py [--repo DIR] [--app-view FILE] [--ref origin/main]      exit 0
Test: check-lane-cleanup.sh."""
import argparse, os, re, subprocess, time
HERE = os.path.dirname(os.path.abspath(__file__))
IDLE_MIN, STALE_MIN = 60, 15
PR = re.compile(r"(?:#|/pull/|pull request #?|\bPR #?)(\d{2,})\b", re.I)
MERGE = re.compile(r"^Merge pull request #(\d+) from [^/\s]+/(\S+)$")


def git(d, *a):
    r = subprocess.run(["git", "--no-optional-locks", "-C", d, *a], capture_output=True, text=True, timeout=60)
    if r.returncode:
        raise RuntimeError((r.stderr.strip() or "git failed").splitlines()[0][-100:])
    return r.stdout


def mac(repo, ref, by_branch):
    out, seen, me = [], 0, os.path.realpath(git(repo, "rev-parse", "--show-toplevel").strip())
    for block in git(repo, "worktree", "list", "--porcelain").strip().split("\n\n"):
        d = dict(l.split(" ", 1) if " " in l else (l, "") for l in block.split("\n"))
        path, br = d.get("worktree", ""), d.get("branch", "").replace("refs/heads/", "", 1)
        if "/.claude/worktrees/" not in path or path.endswith("/demo-main") or not br or "prunable" in d or os.path.realpath(path) == me:
            continue
        seen += 1
        prs = by_branch.get(br, [])
        try:
            clean = prs and not git(repo, "rev-list", "-n1", f"{ref}..{d['HEAD']}").strip() and not git(path, "status", "--porcelain").strip()
        except RuntimeError as e:
            print(f"ACT   lane clean-up list: worktree {os.path.basename(path)} not read ({e})")
            continue
        if clean:
            out.append(f"mac    {os.path.basename(path)} · {br} · merged {' '.join('#' + n for n in prs)}")
    return out, seen


def cloud(text, merged):
    out, seen = [], 0
    for l in text.splitlines():
        m = re.match(r"^(ok|FLAG) +(.*?) · cloud · (\S+) · needs: (.*)$", l)
        if not m:
            continue
        seen += 1
        rest = m.group(4); idle = re.findall(r"(?:^| · )idle (\d+) min\b", rest)
        if m.group(1) != "ok" or m.group(3) != "completed" or rest.split(" · ")[0] != "none" or not idle or int(idle[-1]) < IDLE_MIN:
            continue
        prs = sorted(set(PR.findall(m.group(2) + " " + rest)), key=int)
        if prs and all(p in merged for p in prs):
            out.append(f"cloud  {m.group(2)} · {m.group(3)} · idle {idle[-1]} min · merged {' '.join('#' + p for p in prs)}")
    return out, seen


def view(f, now):
    """(text, why it cannot be used)"""
    try:
        t = open(f, encoding="utf-8").read()
    except OSError:
        return "", "there is none"
    l = t.splitlines() or [""]; m = re.search(r" epoch (\d+)$", l[0])
    if not m:
        return "", "it carries no time"
    age = (now - int(m.group(1))) / 60
    if not 0 <= age <= STALE_MIN:
        return "", f"it was read {age:.0f} min ago (over {STALE_MIN})"
    head = "\n".join(l[:4])
    if "UNREADABLE" in head or "WARNING" in head or not re.search(r"(^| )rows=\d+", "\n".join(l[1:2])):
        return "", "it is not whole (UNREADABLE, WARNING or no rows=N)"
    return t, ""


def main():
    a = argparse.ArgumentParser(); a.add_argument("--repo", default=os.path.join(HERE, "..", "..", "..", ".."))
    a.add_argument("--app-view", default=os.path.join(HERE, "..", "state", "app-view-latest.txt")); a.add_argument("--ref", default="origin/main"); a.add_argument("--now", type=float); o = a.parse_args()
    by, merged = {}, set()
    for l in git(o.repo, "log", "--first-parent", "--merges", "--format=%s", o.ref).splitlines():
        m = MERGE.match(l)
        if m:
            merged.add(m.group(1)); by.setdefault(m.group(2), []).append(m.group(1))
    if not merged:
        raise RuntimeError(f"no merged pull request on {o.ref}")
    m, ms = mac(o.repo, o.ref, by)
    text, bad = view(o.app_view, o.now or time.time())
    c, cs = cloud(text, merged)
    print(f"lanes to clean up: {len(m)} of {ms} mac, " + (f"no cloud lane judged: the app view cannot be used, {bad}" if bad else f"{len(c)} of {cs} cloud")
          + " (every PR named is merged; the Lead looks, then archives)")
    for l in m + c:
        print("      clean  " + l)


try:
    main()
except Exception as e:
    print(f"ACT   lane clean-up list not read ({type(e).__name__}: {str(e)[:120]})")
