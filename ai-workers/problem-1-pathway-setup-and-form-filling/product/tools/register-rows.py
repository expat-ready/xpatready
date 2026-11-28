#!/usr/bin/env python3
"""Dropped and deferred rows never get lost (LR-173, founder P-860/P-861, 28 Nov: "how we will be ensuring that we will
not miss anything dropped or deferred ... as a row ... with the proper statuses").

A row of design/lab-register-2026-11-27.md whose Verdict starts DROP must name where its work lives: "exists elsewhere:
<where>" in its Verdict, Reason or Gate notes cell. A row whose Verdict starts DEFERRED must name its trigger: "trigger:
<a date YYYY-MM-DD or an event>" or "revisit when <event>" (or "revisit on <date>") in the same cells.
  register-rows.py check [--file F | --ref R]           one FAIL line per row breaking the rule; exit 1 when any, else 0
  register-rows.py due [--file F | --ref R] [--today D]  "deferred: N rows (K on a date, M on an event)", then one ACT
                                                          line per DEFERRED row whose date trigger is today or past (IST)
  register-rows.py lines [--file F | --ref R] [--today D]  lead-watch's lines: the check's FAILs as one ACT, then due's lines
Read-only, no network, US$0. The default source is origin/main's register (git show). Test: check-register-rows.sh.
"""
import os, re, subprocess, sys
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
IST = timezone(timedelta(hours=5, minutes=30))
HOME = re.compile(r"\bexists elsewhere:\s*[^\s;|)]", re.I)
TRIG = re.compile(r"\b(?:trigger:\s*|revisit (?:when|on)\s+)([^\s;|)][^;|)]*)", re.I)
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
    for line in t.split("\n"):
        if re.match(r"^\| LR-\d+ ", line):
            c = [x.strip() for x in line.split(" | ")]
            if len(c) >= 9:
                yield c[0].lstrip("| ").strip(), c[3], c[4], c[-1].rstrip(" |")


def check(t):
    bad = []
    for rid, verdict, reason, notes in rows(t):
        cells = (verdict, reason, notes)   # each cell on its own: a marker never borrows the next cell's words
        if verdict.startswith("DROP") and not any(HOME.search(x) for x in cells):
            bad.append(f"FAIL  {rid}: DROP names no other home for its work (write \"exists elsewhere: <where>\", LR-173)")
        if verdict.startswith("DEFERRED") and not any(TRIG.search(x) for x in cells):
            bad.append(f"FAIL  {rid}: DEFERRED names no trigger (write \"trigger: <YYYY-MM-DD or an event>\", LR-173)")
    return bad


def due(t, today):
    n = dated = 0; acts = []
    for rid, verdict, reason, notes in rows(t):
        if not verdict.startswith("DEFERRED"):
            continue
        n += 1
        m = next((m for m in (TRIG.search(x) for x in (verdict, reason, notes)) if m), None)
        d = DATE.search(m.group(1)) if m else None
        if d:
            dated += 1
            if d.group(1) <= today:
                acts.append(f"ACT   deferred row due: {rid} (trigger {d.group(1)}, today {today}): bring it back as DO or set a new trigger in the register (LR-173)")
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
            ids = [x.split()[1].rstrip(":") for x in b]
            print(f"ACT   register rows: {len(b)} DROP/DEFERRED row(s) without a home or trigger: {', '.join(ids)} (register-rows.py check; LR-173)")
        for x in due(t, today): print(x)
        return 0
    print(__doc__.split("\n\n")[1] if "\n\n" in __doc__ else __doc__); return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
