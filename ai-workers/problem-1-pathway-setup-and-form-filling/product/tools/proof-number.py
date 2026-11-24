#!/usr/bin/env python3
"""Proof number first (A348, founder 24 Nov): the Lead's check prints, above merges, how many Release 1 items became Proven.
   "Proven" = rows R1.x with status Works in qa/CAPABILITIES.md on origin/main. Today = net change since 00:00 IST; the
   24 h net and the forecast are flow-measure.py's own (reverse_plan), never a second formula. One ACT when app code merged
   in the last 4 h and no row turned Works in them, and one when the numbers cannot be read (never a silent 0).
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
    mid = now.astimezone(fm.IST).replace(hour=0, minute=0, second=0, microsecond=0)
    rp = fm.reverse_plan(hist, now)
    edge = any(e[3] and e[0] >= mid for ev in hist.values() for e in ev) or not any(e[0] <= mid for ev in hist.values() for e in ev)
    before = sum(1 for ev in hist.values() if fm.status_at(ev, mid) == "Works")
    sign = lambda n: "not readable" if n is None else f"{n:+d}"
    today = None if edge else rp["works"] - before
    fc = rp["forecast_ist"] or ("no forecast: the 24 h net is not readable" if rp["net_24h"] is None else "no forecast: no gain in 24 h")
    print(f"proven Proven today {sign(today)} (since 00:00 IST, net) · last 24 h {sign(rp['net_24h'])} · {rp['works']} of {rp['total']} · "
          f"forecast {fc} · needed {rp['need_per_day']} a day to {rp['release_ist']}")
    if today is None or rp["net_24h"] is None:
        print("ACT   proven: the change is not readable (this copy's history is too short): fetch main's history")
    since = now - timedelta(hours=HOURS)
    new = sorted({r for r, ev in hist.items() for i, e in enumerate(ev)
                  if e[1] == "Works" and since <= e[0] <= now and not e[3] and (i == 0 or ev[i - 1][1] != "Works")}, key=lambda r: int(r[3:]))
    log = git("log", "--first-parent", "-s", "--format=%ct %h", o.ref, "--", *APP)
    apps = [l.split()[1] for l in log.splitlines() if since.timestamp() <= int(l.split()[0]) <= now.timestamp()]
    if apps and not new:
        print(f"ACT   proven: {len(apps)} app-code merges in {HOURS} h and no item newly Works: send qa to the Built items first (newest {apps[0]})")
    return 0


try:
    main()
except (Exception, SystemExit) as e:   # said, never a silent pass
    print(f"ACT   proven: not measured ({type(e).__name__}: {str(e)[:140]})")
