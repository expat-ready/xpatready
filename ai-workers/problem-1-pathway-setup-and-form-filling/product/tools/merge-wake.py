#!/usr/bin/env python3
"""Wake on merge (founder 24 Nov, through Lead 25; design/wake-on-merge-design-2026-11-24.md, option A): an open pull request
that waits for others is an ACT in the Lead's check as soon as all of them are on main, with the words to type in its lane.
Report only: it types, posts and starts nothing.
  Waits    a line of its own in the PR's body, "Waits on: #12" or "Stacked on: #12, #13" (nothing else on the line but
           numbers; not in a code block, HTML comment or quote). Prose is not read.
  Wake     every number merged on main ("Merge pull request #n"), and the PR's branch has no commit newer than the last of
           those merges. It stays an ACT until such a commit, or the PR closes.
  Broken   a number that is neither open nor merged (closed, or no pull request) is an ACT of its own.
The lane is the app view's line that names the PR or its branch; not found is said. Reads git, the open PRs step 2b saved
and the saved app view; no network, US$0. What cannot be read is an ACT. Exit 0. Test: check-merge-wake.sh.
   python3 -I product/tools/merge-wake.py --prs prs-body.json [--app-view FILE] [--repo DIR] [--ref origin/main] [--now EPOCH]"""
import argparse, json, os, re, subprocess, time
HERE = os.path.dirname(os.path.abspath(__file__))
MERGE = re.compile(r"^(\d+) Merge pull request #(\d+) from ")
WAIT = re.compile(r"^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?(?:waits|stacked) on(?:\*\*)?[ \t]*:(?:\*\*)?([^\n]*)$", re.I)
NUMS = re.compile(r"#\d+(?:[ \t]*(?:,|and|\+)?[ \t]*#\d+)*[ \t]*\.?")


def git(d, *a):
    r = subprocess.run(["git", "-C", d, *a], capture_output=True, text=True, timeout=60)
    if r.returncode:
        raise RuntimeError((r.stderr.strip() or "git failed").splitlines()[0][:100])
    return r.stdout


def waits(body):
    """The pull requests a body waits on."""
    out, fence = [], ""
    for l in re.sub(r"<!--.*?(?:-->|\Z)", "", (body or "").replace("\r", ""), flags=re.S).split("\n"):
        f = re.match(r"\s*(`{3,}|~{3,})", l)
        if fence:
            if f and f.group(1)[0] == fence[0] and len(f.group(1)) >= len(fence):
                fence = ""
            continue
        if f:
            fence = f.group(1); continue
        m = WAIT.match(l)
        if m and NUMS.fullmatch(m.group(1).strip(" \t*")):
            out += [int(n) for n in re.findall(r"#(\d+)", m.group(1))]
    return sorted(set(out))


def ist(t):
    return time.strftime("%d %b %H:%M IST", time.gmtime(t + 19800))


def lane(view, n, branch):
    for l in view.splitlines():
        m = re.match(r"^(?:ok|FLAG) +(.*?) · (cloud|mac) · (.*)$", l)
        if m and (re.search(rf"(?:#|/pull/){n}\b", l) or re.search(rf"(?<![\w/-]){re.escape(branch)}(?![\w/-])", l)):
            i = re.findall(r" · idle (\d+) min\b", l)
            return f"{m.group(1)[:60]} ({m.group(2)}, " + (f"idle {i[-1]} min)" if i else "idle ?)")
    return "lane not found in the app view"


def main():
    a = argparse.ArgumentParser(); a.add_argument("--prs", required=True); a.add_argument("--repo", default=os.path.join(HERE, "..", "..", "..", ".."))
    a.add_argument("--app-view", default=os.path.join(HERE, "..", "state", "app-view-latest.txt")); a.add_argument("--ref", default="origin/main"); a.add_argument("--now", type=float)
    o = a.parse_args(); now = o.now or time.time()
    prs = json.load(open(o.prs, encoding="utf-8"))
    if not isinstance(prs, list) or not prs:
        raise RuntimeError("no open pull request read")
    merged = {}
    for l in git(o.repo, "log", "--first-parent", "--merges", "--format=%ct %s", o.ref).splitlines():
        m = MERGE.match(l)
        if m:
            merged.setdefault(int(m.group(2)), int(m.group(1)))
    if not merged:
        raise RuntimeError(f"no merged pull request on {o.ref}")
    view = open(o.app_view, encoding="utf-8").read() if os.path.exists(o.app_view) else ""
    up, n, wake = {p["number"] for p in prs}, 0, 0
    for p in sorted(prs, key=lambda x: x["number"]):
        w = [x for x in waits(p.get("body")) if x != p["number"]]
        if not w:
            continue
        n += 1
        lost = [x for x in w if x not in up and x not in merged]
        if lost:
            print(f"ACT   wake: #{p['number']} waits on {' '.join('#%d' % x for x in lost)}, neither open nor merged: {lane(view, p['number'], p['headRefName'])}: settle what it waits for")
        if lost or any(x not in merged for x in w):
            continue
        t = max(merged[x] for x in w)
        try:
            tip = int(git(o.repo, "log", "-1", "--format=%ct", f"refs/remotes/origin/{p['headRefName']}").strip())
        except (RuntimeError, ValueError):
            print(f"ACT   wake: #{p['number']}: its branch {p['headRefName'][:60]} is not in this copy, so its last commit is unknown"); continue
        if tip > t:
            continue
        wake += 1; ws = " ".join("#%d" % x for x in w)
        print(f"ACT   wake: {ws} on main since {ist(t)} ({(now - t) / 60:.0f} min); #{p['number']} waited: {lane(view, p['number'], p['headRefName'])}. Type: \"{ws} {'is' if len(w) == 1 else 'are'} on main: merge main once and go on with #{p['number']}\"")
    print(f"wake  {n} of {len(prs)} open pull requests say what they wait on, {wake} may go on; {sum(1 for t in merged.values() if now - t < 3600)} merges in the last hour")


try:
    main()
except Exception as e:   # said, never a silent pass
    print(f"ACT   wake: not read ({type(e).__name__}: {str(e)[:120]})")
