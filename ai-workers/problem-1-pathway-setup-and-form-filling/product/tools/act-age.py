#!/usr/bin/env python3
"""Stale ACT lines (OS-85 part 2; Lead 2, 26 Nov): lead-watch printed ACT lines about events days old on every check
(retry-only passes of 17-19 Nov, outside-vendor dates of 16 Nov), so the live ones drowned. A filter for a detector's
output: an ACT line whose newest date ("24 Nov", "24 Nov 08:30 IST") is more than 72 h old leaves the check and goes to a
stale list; once a week the list is one ACT line ("ACT   stale <name>: ..."), on the other checks one info line.
"Unless it is still true": the detector dates each act by its newest event (retry-watch: the newest retry-only pass;
outside-deps-watch: the row's newest status or due date), so an act that happens again, or a register row the Lead
updates, carries a new date and is shown again at once. A line with no date, and every line that is not an ACT, passes
unchanged. Memory: <state>/act-age.json ({"<name>": epoch of the last weekly listing}); the full list each check in
<state>/stale-<name>.txt. Whatever goes wrong here, the detector's lines pass through unchanged with one ACT saying why.
   <detector> | python3 -I product/tools/act-age.py --name retry --state DIR [--now 2026-11-26T08:00:00Z] [--hours 72]
Test: check-act-age.sh. US$0, no network."""
import argparse, json, os, re, sys, time
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
MON = {m: i for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1)}
DATE = re.compile(r"\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b(?:\s+(\d{1,2}):(\d{2}))?")
WEEK = 7 * 24 * 3600


def newest(text, now):
    """The newest date in the text (IST; a date with no time counts as its day's end), or None."""
    best = None
    for d, m, hh, mm in DATE.findall(text):
        try:
            cands = [datetime(now.year + k, MON[m], int(d), tzinfo=IST) for k in (-1, 0, 1)]
        except ValueError:
            continue
        t = min(cands, key=lambda c: abs((c - now).total_seconds()))   # the year nearest the check
        t = t.replace(hour=int(hh), minute=int(mm)) if hh else t.replace(hour=23, minute=59)
        best = t if best is None or t > best else best
    return best


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--name", required=True); a.add_argument("--state", required=True)
    a.add_argument("--now"); a.add_argument("--hours", type=float, default=72)
    o = a.parse_args()
    raw = sys.stdin.read().splitlines()
    try:
        now = (datetime.strptime(o.now, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) if o.now
               else datetime.now(timezone.utc)).astimezone(IST)
        keep, stale = [], []
        for l in raw:
            t = newest(l, now) if l.startswith("ACT") else None
            (stale if t is not None and now - t > timedelta(hours=o.hours) else keep).append(l)
        os.makedirs(o.state, exist_ok=True)
        lst = os.path.join(o.state, f"stale-{o.name}.txt")
        with open(lst, "w", encoding="utf-8") as f:
            f.writelines(l + "\n" for l in stale)
        mpath = os.path.join(o.state, "act-age.json")
        try:
            mem = json.load(open(mpath, encoding="utf-8"))
            mem = mem if isinstance(mem, dict) else {}
        except (OSError, ValueError):
            mem = {}
        out = keep
        if stale:
            nowe = now.timestamp(); last = mem.get(o.name)
            if not isinstance(last, (int, float)) or nowe - last >= WEEK:
                eg = "; ".join(re.sub(r"^ACT\s+", "", l)[:90] for l in stale[:3])
                out = out + [f"ACT   stale {o.name}: {len(stale)} line(s) about events over {o.hours:g} h old (weekly list): {eg}"
                             + ("; …" if len(stale) > 3 else "") + f"; all in {lst}"]
                mem[o.name] = nowe
                tmp = f"{mpath}.{os.getpid()}"
                json.dump(mem, open(tmp, "w")); os.replace(tmp, mpath)
            else:
                nxt = datetime.fromtimestamp(last + WEEK, IST).strftime("%d %b %H:%M IST")
                out = out + [f"stale {o.name}: {len(stale)} line(s) about events over {o.hours:g} h old, listed weekly (next {nxt}); all in {lst}"]
        print("\n".join(out))
    except Exception as e:   # never hide the detector: its lines unchanged, and why
        print("\n".join(raw + [f"ACT   stale {o.name}: act-age.py could not judge ({type(e).__name__}: {str(e)[:100]}); every line shown"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
