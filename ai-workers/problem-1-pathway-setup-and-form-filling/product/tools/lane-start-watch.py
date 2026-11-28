#!/usr/bin/env python3
"""Lane-start watch (LR-171, founder A455, 28 Nov: lane starts sat unseen as founder cards for 25 min; at 12:45 IST 24 of
26 sessions were idle with rows unbuilt, and no check said so).

Every lane named in STATE's "Lanes running" line (a lane label, then its session_... id) is watched: its newest session
activity is the saved app view's line for that session (app-view.js writes "id session_..." on each line: minutes idle
when the view was read, plus the view's own age), and its newest push is any branch named in the lane's part of the line
(claude/..., lead/..., pipeline/...; the committer time of origin/<branch> as the last fetch saw it). When both are over
--max (90) minutes, or neither can be read, that lane is one ACT line. Read-only, no network, US$0.
  python3 -I product/tools/lane-start-watch.py --state STATE.md --view state/app-view-latest.txt [--repo DIR] [--max 90] [--now EPOCH]
Output: one "lanes running: ..." line, then one "ACT   lane start: ..." line per quiet lane. Exit 0. Test: check-lane-start-watch.sh.
"""
import argparse, re, subprocess, sys, time

SID = re.compile(r"\bsession_[A-Za-z0-9]{8,}\b")
BRANCH = re.compile(r"\b((?:claude|lead|pipeline|lab|cleanup)/[A-Za-z0-9._/-]*[A-Za-z0-9])")


def lanes(state):
    """The "Lanes running" line → [(label, session id, [branches])], in order."""
    line = next((l for l in state.splitlines() if re.search(r"\*\*lanes running\b", l, re.I)), "")
    body = line.split(":**", 1)[1] if ":**" in line else line
    out, start = [], 0
    for m in SID.finditer(body):
        seg = body[start:m.start()]
        label = re.split(r"[,;]\s*", seg.strip(" ,;"))[-1].strip() or "(no name)"
        tail = body[m.end():]
        nxt = SID.search(tail)
        own = tail[:nxt.start()] if nxt else tail
        own = re.split(r",\s*(?=[\w+ ()-]+ session_)|;\s*", own)[0]
        out.append((label[:60], m.group(0), BRANCH.findall(seg.split(",")[-1] + " " + own)))
        start = m.end()
    return out


def view_idle(view, now):
    """app view text → ({session id: minutes idle now}, view age in min or None)."""
    lines = view.splitlines()
    m = re.search(r"\bepoch (\d+)", lines[0]) if lines else None
    if not m:
        return {}, None
    age = max(0, (now - int(m.group(1))) // 60)
    idle = {}
    for l in lines[1:]:
        s = re.search(r"\bid (session_[A-Za-z0-9]+)", l)
        i = re.search(r"\bidle (\d+) min\b", l)
        if s and i:
            idle[s.group(1)] = int(i.group(1)) + age
    return idle, age


def push_age(repo, branch, now):
    try:
        t = subprocess.run(["git", "-C", repo, "log", "-1", "--format=%ct", f"refs/remotes/origin/{branch}"],
                           capture_output=True, text=True, timeout=20).stdout.strip()
        return max(0, (now - int(t)) // 60) if t.isdigit() else None
    except Exception:
        return None


def main(argv):
    a = argparse.ArgumentParser()
    a.add_argument("--state", required=True); a.add_argument("--view", required=True)
    a.add_argument("--repo", default="."); a.add_argument("--max", type=int, default=90); a.add_argument("--now", type=int)
    o = a.parse_args(argv)
    now = o.now or int(time.time())
    try:
        state = open(o.state, encoding="utf-8").read()
    except OSError as e:
        print(f"ACT   lane start: STATE unreadable ({o.state}: {e.__class__.__name__}): lanes running not watched (LR-171)"); return 0
    try:
        view = open(o.view, encoding="utf-8").read()
    except OSError:
        view = ""
    ls = lanes(state)
    idle, age = view_idle(view, now)
    acts, blind = [], []
    for label, sid, branches in ls:
        s = idle.get(sid)
        p = [x for x in (push_age(o.repo, b, now) for b in branches) if x is not None]
        pa = min(p) if p else None
        seen = [x for x in (s, pa) if x is not None]
        if not seen and age is None:
            blind.append(label)   # no app view at all: one line for all of them (app-view-check.sh has its own ACT)
        elif not seen:
            acts.append(f"ACT   lane start: {label} ({sid}) is not in the app view and shows no push: open it in claude.ai and type its next step, or start it again (LR-171, A451)")
        elif min(seen) > o.max:
            acts.append(f"ACT   lane start: {label} ({sid}) quiet {min(seen)} min (session {'?' if s is None else f'{s} min'}, push {'?' if pa is None else f'{pa} min'}; over {o.max}): type its next step in claude.ai or restart it (LR-171, A451)")
    if blind:
        acts.append(f"ACT   lane start: no app view saved, so {len(blind)} lane(s) in STATE \"Lanes running\" with no push are not watched ({', '.join(blind)}): save the app view (lead-watch.sh app-view-read), LR-171")
    print(f"lanes running: {len(ls)} in STATE, {len(acts)} quiet over {o.max} min (app view {'not saved' if age is None else f'{age} min old'}; LR-171)")
    for x in acts:
        print(x)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
