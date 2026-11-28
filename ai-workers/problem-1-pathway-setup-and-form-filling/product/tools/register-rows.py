#!/usr/bin/env python3
"""Dropped and deferred rows never get lost (LR-173, founder P-860/P-861, 28 Nov: "how we will be ensuring that we will
not miss anything dropped or deferred ... as a row ... with the proper statuses").

A row of design/lab-register-2026-11-27.md whose Verdict starts DROP must name where its work lives: "exists elsewhere:
<where>" in its Verdict, Reason or Gate notes cell. A row whose Verdict starts DEFERRED must name its trigger: "trigger:
<a date YYYY-MM-DD or an event>", "revisit when <event>" (or "revisit on <date>"), or P-860's "a quiet window near
<event>" in the same cells.
  register-rows.py check [--file F | --ref R]           one FAIL line per row breaking the rule; exit 1 when any, else 0
  register-rows.py due [--file F | --ref R] [--today D]  "deferred: N rows (K on a date, M on an event)", then one ACT
                                                          line per DEFERRED row whose date trigger is today or past (IST)
  register-rows.py lines [--file F | --ref R] [--today D]  lead-watch's lines: the check's FAILs as one ACT, then due's lines
Read-only, no network, US$0. The default source is origin/main's register (git show). Test: check-register-rows.sh.
"""
import os, re, subprocess, sys
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
IST = timezone(timedelta(hours=5, minutes=30))
HOME = re.compile(r"\bexists elsewhere:\s*[^\s;|)]", re.I)
# "a quiet window near <event>" is P-860's wording for a deferral (class C), accepted as an event trigger as written.
TRIG = re.compile(r"\b(?:trigger:\s*|revisit (?:when|on)\s+|a quiet window near\s+)([^\s;|)][^;|)]*)", re.I)
DATE = re.compile(r"\b(20\d\d-\d\d-\d\d)\b")


def text(argv):
    if "--file" in argv:
        return open(argv[argv.index("--file") + 1], encoding="utf-8").read()
    ref = argv[argv.index("--ref") + 1] if "--ref" in argv else "origin/main"
    top = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=HERE, capture_output=True, text=True).stdout.strip()
    rel = os.path.relpath(os.path.join(HERE, "..", "design", "lab-register-2026-11-27.md"), top)
    r = subprocess.run(["git", "show", f"{ref}:{rel}"], cwd=HERE, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"register not readable on {ref}")
    return r.stdout


def rows(t):
    """(id, Verdict, Reason, Gate notes) per register row; split on "|" as lab-progress.py does, so an empty cell is kept."""
    for line in t.split("\n"):
        if re.match(r"^\| LR-\d+", line):
            c = [x.strip() for x in line.split("|")]
            if len(c) >= 11:
                yield c[1], c[4], c[5], c[9]


def dates(cells):
    """Every trigger date in the cells, valid ones (YYYY-MM-DD that exist) and bad ones apart."""
    ok, bad = [], []
    for x in cells:
        for m in TRIG.finditer(x):
            for d in DATE.findall(m.group(1)):
                try:
                    date.fromisoformat(d); ok.append(d)
                except ValueError:
                    bad.append(d)
    return ok, bad


def check(t):
    bad = [f"FAIL  line {i}: a merge conflict marker is left in the register (LR-173)"
           for i, l in enumerate(t.split("\n"), 1) if re.match(r"^(<{7}|={7}|>{7})( |$)", l)]
    for rid, verdict, reason, notes in rows(t):
        cells = (verdict, reason, notes)   # each cell on its own: a marker never borrows the next cell's words
        if verdict.startswith("DROP") and not any(HOME.search(x) for x in cells):
            bad.append(f"FAIL  {rid}: DROP names no other home for its work (write \"exists elsewhere: <where>\", LR-173)")
        if verdict.startswith("DEFERRED") and not any(TRIG.search(x) for x in cells):
            bad.append(f"FAIL  {rid}: DEFERRED names no trigger (write \"trigger: <YYYY-MM-DD or an event>\", LR-173)")
        elif verdict.startswith("DEFERRED") and dates(cells)[1]:
            bad.append(f"FAIL  {rid}: DEFERRED trigger date {', '.join(dates(cells)[1])} is not a real date (LR-173)")
    return bad


def due(t, today):
    n = dated = 0; acts = []
    for rid, verdict, reason, notes in rows(t):
        if not verdict.startswith("DEFERRED"):
            continue
        n += 1
        ds = sorted(dates((verdict, reason, notes))[0])   # every marker in every cell; the earliest date decides
        if ds:
            dated += 1
            if ds[0] <= today:
                acts.append(f"ACT   deferred row due: {rid} (trigger {ds[0]}, today {today}): bring it back as DO or set a new trigger in the register (LR-173)")
    return [f"deferred: {n} rows ({dated} on a date, {n - dated} on an event; LR-173)"] + acts


def main(argv):
    mode = argv[0] if argv else ""
    today = argv[argv.index("--today") + 1] if "--today" in argv else datetime.now(IST).strftime("%Y-%m-%d")
    try:
        t = text(argv)
    except (OSError, SystemExit) as e:
        print(f"ACT   register rows: {e} (LR-173)"); return 2
    if mode == "check":
        b = check(t)
        for x in b: print(x)
        if not b: print("register rows: every DROP names its other home, every DEFERRED its trigger (LR-173)")
        return 1 if b else 0
    if mode == "due":
        for x in due(t, today): print(x)
        return 0
    if mode == "lines":
        b = check(t)
        if b:
            ids = [" ".join(x.split()[1:3]).rstrip(":") if x.split()[1] == "line" else x.split()[1].rstrip(":") for x in b]
            print(f"ACT   register rows: {len(b)} DROP/DEFERRED row(s) without a home or trigger: {', '.join(ids)} (register-rows.py check; LR-173)")
        for x in due(t, today): print(x)
        return 0
    print(__doc__.split("\n\n")[1] if "\n\n" in __doc__ else __doc__); return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
