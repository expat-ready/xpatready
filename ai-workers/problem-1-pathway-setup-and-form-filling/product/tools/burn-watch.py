#!/usr/bin/env python3
"""Burn watch (LR-099, lab automation-measures; P-440: burn at most 3% of the weekly plan an hour). Reads
cockpit/usage-log.tsv (time_ist, weekly_pct, account, by: usage-log.sh writes it) and prints, for the Lead's check:
  ACT burn    the last two intervals of one account were each over 3%/h ("over 3% of the weekly plan an hour twice")
  ACT night   the last interval was over 4%/h between 22:00 and 06:00 IST: trim the lanes
  ACT plan    the latest reading is 85% or more: send the founder a push alert
  ACT log     the latest reading is over 2 h old, or there is none: the usage log stopped (restart it)
or one "burn  ..." line when none applies. An interval is two readings of the same account at least 15 min apart with
the percent not going down (a weekly reset or an account switch starts a new series). Exit 0 always (a report).
  python3 -I product/tools/burn-watch.py [--file F] [--now ISO] [--log PCT ACCOUNT]
--log: lead-watch passes the Lead's get_usage reading (LEAD_WEEKLY, LEAD_ACCOUNT); when the latest reading is 55 min old
or more, it is appended first with usage-log.sh, so the log gets one line an hour from the checks. One of the two without
the other is an ACT; neither is not (the stale-log ACT then fires). --now: tests only.
USAGE_LOG_FILE overrides the file (as in usage-log.sh). Test: check-burn-watch.sh.
"""
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
LIMIT, NIGHT_LIMIT, ALERT, STALE_H, DUE_MIN, GAP_MIN = 3.0, 4.0, 85, 2.0, 55, 15
HERE = os.path.dirname(os.path.abspath(__file__))


def arg(name, n=1):
    a = sys.argv
    if name not in a:
        return None
    i = a.index(name)
    return a[i + 1:i + 1 + n] if len(a) > i + n else []


def readings(path):
    """-> [(datetime, pct, account)] sorted by time; malformed lines are skipped (cockpit-data.py reports them)."""
    out = []
    try:
        lines = open(path, encoding="utf-8").read().split("\n")
    except OSError:
        return out
    for line in lines:
        f = line.split("\t")
        if len(f) < 3 or f[0] == "time_ist" or line.startswith("#"):
            continue
        try:
            out.append((datetime.fromisoformat(f[0]), int(f[1]), f[2].strip()))
        except ValueError:
            continue
    return sorted(out, key=lambda r: r[0])


def rates(rs):
    """Rates (%/h) of the latest series' intervals, oldest first: same account, percent not down, readings >= 15 min apart."""
    if not rs:
        return []
    series = [rs[-1]]
    for r in reversed(rs[:-1]):
        head = series[0]
        if r[2] != head[2] or r[1] > head[1]:
            break
        if (head[0] - r[0]).total_seconds() >= GAP_MIN * 60:
            series.insert(0, r)
    return [(b[1] - a[1]) / ((b[0] - a[0]).total_seconds() / 3600) for a, b in zip(series, series[1:])]


def main():
    path = os.environ.get("USAGE_LOG_FILE") or os.path.join(HERE, "..", "cockpit", "usage-log.tsv")
    path = (arg("--file") or [path])[0]
    now = datetime.fromisoformat(arg("--now")[0]) if arg("--now") else datetime.now(IST)
    rs = readings(path)
    log = arg("--log", 2)
    if log is not None and any(log):   # neither given: the stale-log ACT below says what to do
        if len(log) < 2 or not log[0] or not log[1]:
            print("ACT   burn: LEAD_WEEKLY and LEAD_ACCOUNT must both be given to log the weekly plan (LR-099)")
        elif not rs or (now - rs[-1][0]).total_seconds() >= DUE_MIN * 60:
            r = subprocess.run(["bash", os.path.join(HERE, "usage-log.sh"), log[0], log[1]], capture_output=True,
                               text=True, env=dict(os.environ, USAGE_LOG_FILE=path))
            print(("burn  " if r.returncode == 0 else "ACT   burn: ") + (r.stdout + r.stderr).strip().split("\n")[-1])
            rs = readings(path)
    acts = []
    if not rs:
        acts.append("log: no weekly-plan reading in %s: log one each hour (bash product/tools/usage-log.sh <pct> "
                    "<account>, or LEAD_WEEKLY and LEAD_ACCOUNT on lead-watch)" % os.path.basename(path))
    else:
        t, pct, acct = rs[-1]
        age = (now - t).total_seconds() / 3600
        rt = rates(rs)
        if age > STALE_H:
            acts.append("log: the latest weekly-plan reading is %.1f h old (%s, %d%% %s): the usage log stopped; log one "
                        "each hour (LEAD_WEEKLY and LEAD_ACCOUNT on lead-watch)" % (age, t.strftime("%d %b %H:%M"), pct, acct))
        if len(rt) >= 2 and rt[-1] > LIMIT and rt[-2] > LIMIT:
            acts.append("burn: %.1f%%/h then %.1f%%/h, over %.0f%% of the weekly plan an hour twice (P-440): pause or trim "
                        "lanes" % (rt[-2], rt[-1], LIMIT))
        hour = now.astimezone(IST).hour
        if rt and rt[-1] > NIGHT_LIMIT and (hour >= 22 or hour < 6):
            acts.append("night: %.1f%%/h after 22:00 IST, over %.0f%%/h: trim the lanes now" % (rt[-1], NIGHT_LIMIT))
        if pct >= ALERT:
            acts.append("plan: weekly plan at %d%% (%s), %d%% or more: send the founder a push alert" % (pct, acct, ALERT))
        if not acts:
            last = ("%.1f%%/h" % rt[-1]) if rt else "no interval yet"
            print("burn  weekly plan %d%% (%s) at %s, last interval %s (limit %.0f%%/h)" % (pct, acct, t.strftime("%H:%M"),
                                                                                          last, LIMIT))
    for a in acts:
        print("ACT   " + a)
    return 0


if __name__ == "__main__":
    sys.exit(main())
