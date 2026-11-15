#!/usr/bin/env python3
# Outside-dependencies watch (B192, P-618; founder, 15 Nov ~21:55 IST: "i dont want anything to be halted, make a rule
# to bring these points before they are required or become the blocker"). Reads the register table in
# product/design/outside-dependencies.md and prints one line per row needing the tech lead now:
#   ACT outside: <row #> <provider>: <reason>
# A row ACTs when (1) its Start date is today or past, the Start cell does not say "started" and its Status is not done
# ("now" counts as today; a cell with no date, such as "after row 1 lands", waits); (2) its Status is blocked or stuck
# and the status date is over 48 h ago; (3) its Status is blocked and its Decision cell has no date or no fallback.
# The status date is the newest "15 Nov" (with "21:40 IST" if given) in the Status cell, else the date in the Status
# column's header ("Status (15 Nov 22:2x IST)"); a cell time with no date takes the header's day.
# Read-only, no network, US$0. Lead-watch runs it each check. Test: check-outside-deps-watch.sh.
#   python3 product/tools/outside-deps-watch.py [--file REGISTER] [--now "YYYY-MM-DD HH:MM"] (IST)
# Exit code = number of ACT lines (99 = register missing or unreadable).
import os, re, sys
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
HERE = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(HERE, "..", "design", "outside-dependencies.md")
MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
DAY = re.compile(r"\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b(?: (\d{4}))?", re.I)
ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
TIME = re.compile(r"\b(\d{1,2}):(\d)([0-9x])\b")


def dates(text, now):
    """Every date in text as an IST datetime at 00:00; a day with no year takes the year that puts it nearest now."""
    out = []
    for d, m, y in DAY.findall(text):
        yr = int(y) if y else now.year
        try:
            t = datetime(yr, MON[m[:3].lower()], int(d), tzinfo=IST)
        except ValueError:
            continue
        if not y and t - now > timedelta(days=183):
            t = t.replace(year=yr - 1)
        elif not y and now - t > timedelta(days=183):
            t = t.replace(year=yr + 1)
        out.append(t)
    for y, m, d in ISO.findall(text):
        try:
            out.append(datetime(int(y), int(m), int(d), tzinfo=IST))
        except ValueError:
            pass
    return out


def with_time(day, text):
    m = TIME.search(text)
    if not m:
        return day
    return day.replace(hour=int(m.group(1)) % 24, minute=int(m.group(2) + m.group(3).replace("x", "0")))


def main(argv):
    path, now = REG, datetime.now(IST)
    i = 0
    while i < len(argv):
        if argv[i] == "--file":
            path, i = argv[i + 1], i + 2
        elif argv[i] == "--now":
            now, i = datetime.strptime(argv[i + 1], "%Y-%m-%d %H:%M").replace(tzinfo=IST), i + 2
        else:
            print(f"unknown argument {argv[i]}"); return 99
    try:
        lines = open(path, encoding="utf-8").read().splitlines()
    except OSError as e:
        print(f"ACT outside: register unreadable ({e})"); return 99
    rows = [[c.strip() for c in l.strip().strip("|").split("|")] for l in lines if l.lstrip().startswith("|")]
    head = next((r for r in rows if r and r[0] == "#"), None)
    if not head:
        print("ACT outside: register has no table header ('| # | Provider …')"); return 99
    col = lambda word: next((k for k, h in enumerate(head) if h.lower().startswith(word)), None)
    c_prov, c_start, c_stat, c_dec = col("provider"), col("start"), col("status"), col("decision")
    if None in (c_prov, c_start, c_stat, c_dec):
        print("ACT outside: register header lacks Provider, Start, Status or Decision"); return 99
    hd = dates(head[c_stat], now)
    head_day = with_time(hd[0], head[c_stat]) if hd else None
    acts = []
    for r in rows:
        if not r or not r[0].isdigit() or len(r) <= max(c_prov, c_start, c_stat, c_dec):
            continue
        num, prov = r[0], r[c_prov].split("·")[0].strip()
        start, stat, dec = r[c_start], r[c_stat], r[c_dec]
        sl = stat.lower()
        done = sl.startswith("done")
        why = []
        if not done and "started" not in start.lower().replace("not started", ""):
            sd = dates(start, now) or ([now] if re.search(r"\bnow\b", start, re.I) else [])
            if sd and min(sd).date() <= now.date():
                why.append(f"start date {min(sd):%d %b} reached, not started and not done (Start: {start}; Status: {stat[:60]})")
        blocked = sl.startswith("blocked") or sl.startswith("stuck")
        if blocked:
            cd = dates(stat, now)
            if cd:
                t = max(cd)
                t = with_time(head_day, stat) if head_day and t.date() == head_day.date() and not TIME.search(stat) \
                    else with_time(t, stat)
            elif head_day:
                t = with_time(head_day, stat)
            else:
                t = None
            if t is None:
                why.append("blocked with no status date: write when it became blocked")
            elif now - t > timedelta(hours=48):
                why.append(f"{sl.split(':')[0]} for {int((now - t).total_seconds() // 3600)} h (since {t:%d %b %H:%M} IST)")
        if sl.startswith("blocked"):
            when, _, fb = dec.partition("·")
            if not dates(when, now):
                why.append("blocked with no decision date")
            if not fb.strip() or fb.strip().lower() in ("none", "-", "—", "tbd", "?"):
                why.append("blocked with no fallback")
        for w in why:
            acts.append(f"ACT outside: {num} {prov}: {w}")
    for a in acts:
        print(a)
    if not acts:
        print(f"outside: {sum(1 for r in rows if r and r[0].isdigit())} row(s), none in its start window, stuck or without a fallback")
    return len(acts)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
