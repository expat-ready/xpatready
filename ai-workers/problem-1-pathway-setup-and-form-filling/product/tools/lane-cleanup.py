#!/usr/bin/env python3
"""Lane clean-up list (A348, founder 24 Nov): the sessions whose pull requests have all merged, as a list for the Lead. It
archives, closes and deletes nothing, and no line is an ACT by itself.
  mac    each worktree under .claude/worktrees (never demo-main): its branch has a "Merge pull request #n from <owner>/<branch>"
         on main, no commit that is not on main, and nothing uncommitted.
  cloud  each cloud line of the saved app view (app-view.js) that names pull requests (#n), every one of them merged on
         main. A lane naming none, or one not merged, is never listed; its "needs:" is printed, so an asking lane shows.
Reads git and the saved app view only. A read that fails is an ACT, never an empty list.
   python3 -I product/tools/lane-cleanup.py [--repo DIR] [--app-view FILE] [--ref origin/main]      exit 0
Test: check-lane-cleanup.sh."""
import argparse, os, re, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
MERGE = re.compile(r"^Merge pull request #(\d+) from [^/\s]+/(\S+)$")


def git(d, *a):
    r = subprocess.run(["git", "-C", d, *a], capture_output=True, text=True, timeout=60)
    if r.returncode:
        raise RuntimeError((r.stderr.strip() or "git failed").splitlines()[0][:100])
    return r.stdout


def mac(repo, ref, by_branch):
    out, seen = [], 0
    for block in git(repo, "worktree", "list", "--porcelain").strip().split("\n\n"):
        d = dict(l.split(" ", 1) if " " in l else (l, "") for l in block.split("\n"))
        path, br = d.get("worktree", ""), d.get("branch", "").replace("refs/heads/", "", 1)
        if "/.claude/worktrees/" not in path or path.endswith("/demo-main") or not br or "prunable" in d:
            continue
        seen += 1
        prs = by_branch.get(br, [])
        if prs and not git(repo, "rev-list", "-n1", f"{ref}..{d['HEAD']}").strip() and not git(path, "status", "--porcelain").strip():
            out.append(f"mac    {os.path.basename(path)} · {br} · merged {' '.join('#' + n for n in prs)}")
    return out, seen


def cloud(text, merged):
    out, seen = [], 0
    for l in text.splitlines():
        m = re.match(r"^(ok|FLAG) +(.*?) · cloud · (\S+) · needs: (.*)$", l)
        if not m:
            continue
        seen += 1
        prs = sorted(set(re.findall(r"#(\d{2,})\b", m.group(2) + " " + m.group(4))), key=int)
        if prs and all(p in merged for p in prs):
            out.append(f"cloud  {m.group(2)} · {m.group(3)} · needs: {m.group(4).split(' · ')[0][:80]} · merged {' '.join('#' + p for p in prs)}")
    return out, seen


def main():
    a = argparse.ArgumentParser(); a.add_argument("--repo", default=os.path.join(HERE, "..", "..", "..", ".."))
    a.add_argument("--app-view", default=os.path.join(HERE, "..", "state", "app-view-latest.txt")); a.add_argument("--ref", default="origin/main"); o = a.parse_args()
    by, merged = {}, set()
    for l in git(o.repo, "log", "--first-parent", "--merges", "--format=%s", o.ref).splitlines():
        m = MERGE.match(l)
        if m:
            merged.add(m.group(1)); by.setdefault(m.group(2), []).append(m.group(1))
    if not merged:
        raise RuntimeError(f"no merged pull request on {o.ref}")
    m, ms = mac(o.repo, o.ref, by)
    if os.path.exists(o.app_view):
        c, cs = cloud(open(o.app_view, encoding="utf-8").read(), merged)
    else:
        c, cs = [], "no app view, none of the"
    print(f"lanes to clean up: {len(m)} of {ms} mac, {len(c)} of {cs} cloud (every PR named is merged; the Lead archives after a look)")
    for l in m + c:
        print("      clean  " + l)


try:
    main()
except Exception as e:
    print(f"ACT   lane clean-up list not read ({type(e).__name__}: {str(e)[:120]})")
