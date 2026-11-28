#!/usr/bin/env python3
"""Burn watch (LR-099, lab automation-measures; P-440: burn at most 3% of the weekly plan an hour). Reads
cockpit/usage-log.tsv (time_ist, weekly_pct, account, by: usage-log.sh writes it) and prints, for the Lead's check:
  ACT burn    the last two intervals of one account were each over 3%/h ("over 3% of the weekly plan an hour twice")
  ACT night   the last interval, ending 22:00-06:00 IST, was over 4%/h: trim the lanes
  ACT plan    the latest reading is 85% or more: send the founder a push alert
  ACT log     the latest reading is over 2 h old, or there is none: the usage log stopped (restart it)
or one "burn  ..." line when none applies. An interval is two readings of the same account at least 15 min apart with
the percent not going down (a weekly reset or an account switch starts a new series). Burn and night are judged only
on a log under 2 h old. A line without a +05:30-style offset is skipped. Exit 0 always (a report).
  python3 -I product/tools/burn-watch.py [--file F] [--state DIR] [--now ISO] [--log PCT ACCOUNT]
--log: lead-watch passes the Lead's get_usage reading (LEAD_WEEKLY, LEAD_ACCOUNT); when the latest reading is 55 min old
or more, it is appended first with usage-log.sh, so the log gets one line an hour from the checks. No account: the log's
last account. Neither value: nothing is logged (the stale-log ACT then fires). --state: burn-watch.json there remembers
what was said, so burn and night are an ACT once per latest reading, plan once per account and week (until the percent
falls under 85), and a later check prints a "burn  said ..." line instead. --now: tests only. USAGE_LOG_FILE overrides
the file (as in usage-log.sh). The Lead commits the log with the records (usage-log.sh). Test: check-burn-watch.sh.
"""
import json
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
    """-> [(datetime, pct, account)] sorted by time; malformed or offset-free lines are skipped."""
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
            t = datetime.fromisoformat(f[0])
            if t.tzinfo is None:
                continue
            out.append((t, int(f[1]), f[2].strip()))
        except ValueError:
            continue
    return sorted(out, key=lambda r: r[0])


def series(rs):
    """The latest series, oldest first: same account, percent not down, readings >= 15 min apart."""
    if not rs:
        return []
    out = [rs[-1]]
    for r in reversed(rs[:-1]):
        head = out[0]
        if r[2] != head[2]:
            break
        if r[1] > head[1]:
            break
        if (head[0] - r[0]).total_seconds() >= GAP_MIN * 60:
            out.insert(0, r)
    return out


def rates(rs):
    """[(rate %/h, end time)] of the latest series' intervals, oldest first."""
    s = series(rs)
    return [((b[1] - a[1]) / ((b[0] - a[0]).total_seconds() / 3600), b[0]) for a, b in zip(s, s[1:])]


def main():
    path = os.environ.get("USAGE_LOG_FILE") or os.path.join(HERE, "..", "cockpit", "usage-log.tsv")
    path = (arg("--file") or [path])[0]
    now = datetime.fromisoformat(arg("--now")[0]) if arg("--now") else datetime.now(IST)
    state_dir = (arg("--state") or [None])[0]
    memo_path = os.path.join(state_dir, "burn-watch.json") if state_dir else None
    memo = {}
    if memo_path:
        try:
            memo = json.load(open(memo_path, encoding="utf-8"))
        except (OSError, ValueError):
            memo = {}
    rs = readings(path)
    log = arg("--log", 2)
    if log is not None and any(log):   # neither given: the stale-log ACT below says what to do
        pct_in = log[0] if log else ""
        acct_in = (log[1] if len(log) > 1 else "") or (rs[-1][2] if rs else "")
        if not pct_in or not acct_in:
            print("ACT   burn: LEAD_WEEKLY is needed (and LEAD_ACCOUNT when the log has no account yet) to log the "
                  "weekly plan (LR-099)")
        elif not rs or (now - rs[-1][0]).total_seconds() >= DUE_MIN * 60:
            r = subprocess.run(["bash", os.path.join(HERE, "usage-log.sh"), pct_in, acct_in], capture_output=True,
                               text=True, env=dict(os.environ, USAGE_LOG_FILE=path))
            print(("burn  " if r.returncode == 0 else "ACT   burn: ") + (r.stdout + r.stderr).strip().split("\n")[-1])
            rs = readings(path)
    acts, said = [], []

    def once(key, value, text):
        if memo.get(key) == value:
            said.append("burn  said %s already (%s): %s" % (key, value, text.split(":")[0]))
        else:
            acts.append(text)
            memo[key] = value

    if not rs:
        acts.append("log: no weekly-plan reading in %s: log one each hour (LEAD_WEEKLY on lead-watch, or bash "
                    "product/tools/usage-log.sh <pct> <account>)" % os.path.basename(path))
    else:
        t, pct, acct = rs[-1]
        age = (now - t).total_seconds() / 3600
        rt = rates(rs)
        stamp = t.isoformat()
        if age > STALE_H:
            acts.append("log: the latest weekly-plan reading is %.1f h old (%s, %d%% %s): the usage log stopped; log one "
                        "each hour (LEAD_WEEKLY on lead-watch)" % (age, t.strftime("%d %b %H:%M"), pct, acct))
        else:   # burn and night only on a fresh log
            if len(rt) >= 2 and rt[-1][0] > LIMIT and rt[-2][0] > LIMIT:
                once("burn", stamp, "burn: %.2f%%/h then %.2f%%/h, over %.0f%% of the weekly plan an hour twice (P-440): "
                     "pause or trim lanes" % (rt[-2][0], rt[-1][0], LIMIT))
            if rt and rt[-1][0] > NIGHT_LIMIT:
                end = rt[-1][1].astimezone(IST).hour
                if end >= 22 or end < 6:
                    once("night", stamp, "night: %.2f%%/h in the interval ending %s IST, over %.0f%%/h after 22:00: trim "
                         "the lanes now" % (rt[-1][0], rt[-1][1].astimezone(IST).strftime("%H:%M"), NIGHT_LIMIT))
        if pct >= ALERT:
            once("plan", acct, "plan: weekly plan at %d%% (%s), %d%% or more: send the founder a push alert" % (pct, acct,
                                                                                                          ALERT))
        elif memo.get("plan") == acct:
            memo.pop("plan")   # under 85% again (a reset): the next crossing alerts again
        if not acts and not said:
            last = ("%.2f%%/h" % rt[-1][0]) if rt else "no interval yet"
            print("burn  weekly plan %d%% (%s) at %s, last interval %s (limit %.0f%%/h)" % (pct, acct, t.strftime("%H:%M"),
                                                                                          last, LIMIT))
    for s in said:
        print(s)
    for a in acts:
        print("ACT   " + a)
    if memo_path:
        try:
            with open(memo_path, "w", encoding="utf-8") as f:
                json.dump(memo, f)
        except OSError as e:
            print("burn  memory not saved (%s): ACTs may repeat" % e)
    return 0


if __name__ == "__main__":
    sys.exit(main())
