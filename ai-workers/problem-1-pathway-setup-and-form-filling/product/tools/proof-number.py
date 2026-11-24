#!/usr/bin/env python3
"""Proof number first (A348, founder 24 Nov): the Lead's check prints, above merges, how many Release 1 items became Proven.
   "Proven" = rows R1.x with status Works in qa/CAPABILITIES.md on origin/main. Today = net change since 00:00 IST; the
   24 h net and the forecast are flow-measure.py's own (reverse_plan), never a second formula. One ACT when 4 h have passed
   since the first app-code merge that no newly Works row followed, and one when the numbers cannot be read or the file on
   the ref does not hold the rows its history gives (never a silent 0).
   Read-only: git only, no network. Exit 0; lead-watch.sh counts the ACT lines. Test: check-proof-number.sh.
   python3 -I product/tools/proof-number.py [--repo DIR] [--ref origin/main] [--now 2026-11-24T08:30:00+05:30]"""
import argparse, importlib.util, os, subprocess, sys
from datetime import datetime, timedelta, timezone
HERE = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("GITHUB_REPOSITORY", "local/none")   # flow-measure.py wants one at import; nothing here calls GitHub
spec = importlib.util.spec_from_file_location("flow_measure", os.path.join(HERE, "flow-measure.py"))
fm = importlib.util.module_from_spec(spec)
S = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/"
APP = [S + d for d in ("api/src", "web/src", "engine", "prisma", "contracts", "samples", "packages")]   # app-code-prs.sh's list (P-500)
HOURS = 4


def main():
    a = argparse.ArgumentParser(); a.add_argument("--repo", default=os.path.join(HERE, "..", "..", "..", ".."))
    a.add_argument("--ref", default="origin/main"); a.add_argument("--now"); o = a.parse_args()
    spec.loader.exec_module(fm)
    now = (datetime.fromisoformat(o.now) if o.now else datetime.now(timezone.utc)).astimezone(timezone.utc)

    def git(*c):
        r = subprocess.run(["git", "-C", o.repo, *c], capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError((r.stderr.strip() or "git failed").splitlines()[0][:120])
        return r.stdout
    sh = git("rev-parse", "--git-path", "shallow").strip()
    sh = sh if os.path.isabs(sh) else os.path.join(o.repo, sh)
    shallow = set(open(sh).read().split()) if os.path.exists(sh) else set()
    hist = fm.cap_history(git("log", "--reverse", "--first-parent", "--diff-merges=first-parent", "-p",
                              "--format=@@C %H %cI", o.ref, "--", fm.CAPS), shallow)
    if not hist:
        raise RuntimeError("no R1 row in " + fm.CAPS)
    live = {m.group(1): m.group(2).strip() for m in (fm.ROW.match("+" + l) for l in git("show", f"{o.ref}:{fm.CAPS}").splitlines()) if m}
    if live != {r: ev[-1][1] for r, ev in hist.items()}:
        raise RuntimeError(f"{fm.CAPS} holds {len(live)} R1 rows, its history {len(hist)}, or their statuses differ")
    for d in APP[:-1]:   # packages/ is not on main yet
        if not git("ls-tree", o.ref, d):
            raise RuntimeError(f"{d} is not on {o.ref}: app-code merges cannot be counted")
    mid = now.astimezone(fm.IST).replace(hour=0, minute=0, second=0, microsecond=0)
    rp = fm.reverse_plan(hist, now)
    edge = any(e[3] and e[0] >= mid for ev in hist.values() for e in ev) or not any(e[0] <= mid for ev in hist.values() for e in ev)
    before = sum(1 for ev in hist.values() if fm.status_at(ev, mid) == "Works")
    sign = lambda n: "not readable" if n is None else f"{n:+d}"
    today = None if edge else rp["works"] - before
    fc = "done" if not rp["left"] else rp["forecast_ist"] or ("none, the 24 h net is not readable" if rp["net_24h"] is None else "none, no gain in 24 h")
    need = "none, the date is past," if rp["need_per_day"] is None else rp["need_per_day"]
    print(f"proven Proven today {sign(today)} (since 00:00 IST, net) · last 24 h {sign(rp['net_24h'])} · {rp['works']} of {rp['total']} · "
          f"forecast {fc} · needed {need} a day to {rp['release_ist']}")
    if today is None or rp["net_24h"] is None:
        print("ACT   proven: the change is not readable (this copy's history is too short): fetch main's history")
    # Newly Works: the row's current Works streak started then (a re-walk of a Works row, or one reopened since, is not).
    last = max((e[0] for e in map(fm.proven_at, hist.values()) if e and not e[3] and e[0] <= now), default=now - timedelta(days=7))
    log = git("log", "--first-parent", "-s", "--format=%ct %h %H", o.ref, "--", *APP)
    apps = [l.split() for l in log.splitlines() if max(last, now - timedelta(days=7)).timestamp() < int(l.split()[0]) <= now.timestamp()
            and l.split()[2] not in shallow]   # a shallow edge "adds" every file
    if apps and rp["left"] and now.timestamp() - int(apps[-1][0]) >= HOURS * 3600:
        first = datetime.fromtimestamp(int(apps[-1][0]), timezone.utc)
        print(f"ACT   proven: {len(apps)} app-code merges since {fm.ist(first)} ({(now - first).total_seconds() / 3600:.1f} h) and no item newly Works: "
              f"send qa to the Built items first (newest {apps[0][1]})")
    return 0


try:
    main()
except (Exception, SystemExit) as e:   # said, never a silent pass
    print(f"ACT   proven: not measured ({type(e).__name__}: {str(e)[:140]})")
