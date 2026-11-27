#!/usr/bin/env python3
"""Times only from `TZ=Asia/Kolkata date` (B193 part 2 (f), P-302; broken several times on 15-16 Nov): refuses an edit
of product/STATE.md or product/DECISIONS.md whose new text holds a time or date ahead of now in IST.

PreToolUse hook on Edit, MultiEdit and Write. Only times the edit adds are read (a time already in the replaced text,
or in the file for a Write, is never re-judged). Read as IST: `2026-11-16 01:2x`, `16 Nov 01:20`, `01:20 IST 16 Nov`,
`~01:2x IST` (x = 0); a date alone as a stamp (`| 17 Nov |`, `updated: 17 Nov`, `as of 17 Nov`; a date in prose is
usually a plan); a bare `HH:MM` (with or without IST; not UTC, not a range's end) on its DECISIONS row's date, else
today's, ahead only when at most 6 h ahead (a later one is yesterday's). Plans pass: a time with due, by, until, next, target, resets, planned, scheduled, before, ETA,
expires or ends just before it ("by", "until", "till", "before" directly; the others with two words between
at most: "next 30-minute check 01:3x"). One minute of grace. Also by hand:
  python3 ist-time-guard.py --scan FILE    prints each time ahead of now; exit 1 when there is one
Env (tests): NOW (epoch seconds). Test: check-ist-time-guard.sh."""
import difflib, json, os, re, sys, time
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
FILES = re.compile(r"(^|/)product/(STATE|DECISIONS)\.md$")   # also STATE.md in the private copy, <private>/xpatready/product/ (PS-1b)
MON = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
M = r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*"
T = r"~?(\d{1,2}):([0-5])([0-9x])"
PATTERNS = [  # (regex, kind) — tried in order; a match is masked before the next pattern
    (re.compile(r"\b(\d{4})-(\d{2})-(\d{2})[ T]" + T), "iso"),
    (re.compile(r"\b(\d{1,2}) " + M + r",? " + T), "dmy-t"),
    (re.compile(T + r"(?: IST)?,? (\d{1,2}) " + M + r"\b"), "t-dmy"),
    (re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b"), "iso-d"),
    (re.compile(r"\b(\d{1,2}) " + M + r"\b"), "dmy"),
    (re.compile(r"(?<![\d:.\u2013+-])" + T + r"(?![\dx:])(?: IST\b)?(?!\s*(?:UTC|GMT|Z\b|h\b|hours?\b|min))"), "t"),   # a bare time; not a UTC offset or time, a duration or a range's end
]
STAMP = re.compile(r"(^\|\s*P-\d+[a-z]?\s*\|\s*|updated:?\s*|as of\s*)$", re.I)   # where a date alone is a stamp: a DECISIONS row's date cell, updated:, as of
ROWDATE = re.compile(r"^\|[^|]*\|\s*(\d{1,2}) " + M + r"\s*\|")
PLAN_END = re.compile(r"(\b(by|until|till|before)\s*|\b(due|next|target|reset|resets|planned|scheduled|eta|expires?|ends?|deadline|at the latest|after|expected|check at)\b(\s+[\w-]+){0,2}\s*)[:~]?\s*$", re.I)   # "by 01:30" directly; "next 30-minute check 01:3x" (two words between)


def now_ist():
    return datetime.fromtimestamp(int(os.environ.get("NOW") or time.time()), IST)


def ahead(text, now):
    """[(the text, how far ahead)] for each time or date in text ahead of now."""
    out = []
    yr = lambda mon: now.year - 1 if mon > now.month + 6 else now.year + 1 if mon < now.month - 6 else now.year   # 31 Dec on 1 Jan
    for line in text.splitlines():
        masked = line
        rd = ROWDATE.match(line)   # a DECISIONS row: its bare times are on the row's date
        rowday = rd and datetime(yr(MON.index(rd.group(2)[:3]) + 1), MON.index(rd.group(2)[:3]) + 1, int(rd.group(1)), tzinfo=IST)
        for rx, kind in PATTERNS:
            for m in rx.finditer(masked):
                g = m.groups()
                try:
                    if kind == "iso":
                        when = datetime(int(g[0]), int(g[1]), int(g[2]), int(g[3]), int(g[4] + g[5].replace("x", "0")), tzinfo=IST)
                    elif kind == "dmy-t":
                        when = datetime(yr(MON.index(g[1][:3]) + 1), MON.index(g[1][:3]) + 1, int(g[0]), int(g[2]), int(g[3] + g[4].replace("x", "0")), tzinfo=IST)
                    elif kind == "t-dmy":
                        when = datetime(yr(MON.index(g[4][:3]) + 1), MON.index(g[4][:3]) + 1, int(g[3]), int(g[0]), int(g[1] + g[2].replace("x", "0")), tzinfo=IST)
                    elif kind == "iso-d":
                        when = datetime(int(g[0]), int(g[1]), int(g[2]), tzinfo=IST)
                    elif kind == "dmy":
                        when = datetime(yr(MON.index(g[1][:3]) + 1), MON.index(g[1][:3]) + 1, int(g[0]), tzinfo=IST)
                    elif rowday:
                        when = rowday.replace(hour=int(g[0]), minute=int(g[1] + g[2].replace("x", "0")))
                    else:
                        when = now.replace(hour=int(g[0]), minute=int(g[1] + g[2].replace("x", "0")), second=0, microsecond=0)
                except ValueError:
                    continue
                if kind in ("iso-d", "dmy"):
                    if not STAMP.search(masked[:m.start()]):
                        continue   # a date alone in prose is usually a plan (by 29 Nov); only stamps are judged
                    gap = when.date() > now.date() and (when - now.replace(hour=0, minute=0, second=0, microsecond=0))
                else:
                    gap = when - now
                    if kind == "t" and rowday and (rowday.date() != now.date() or gap <= timedelta(0)):
                        pass
                    elif kind == "t" and gap > timedelta(hours=6):
                        gap = None   # yesterday's evening, written after midnight
                    elif kind == "t" and gap < -timedelta(hours=18):
                        gap = when + timedelta(days=1) - now   # after midnight, written late the day before
                        gap = gap if gap <= timedelta(hours=6) else None
                ok = not gap or gap <= timedelta(minutes=1) or PLAN_END.search(masked[:m.start()])
                if not ok:
                    out.append((m.group(0), gap))
            masked = rx.sub(lambda m: "#" * len(m.group(0)), masked)
    return out


def tokens(text):
    """Every time or date written in text, as written."""
    return {m.group(0) for line in text.splitlines() for rx, _ in PATTERNS for m in rx.finditer(line)}


def changes(hook):
    """[(new text, old text)] of an edit of a guarded file; None for any other file."""
    ti = hook.get("tool_input") or {}
    path = ti.get("file_path") or ""
    if not FILES.search(path):
        return None
    if "content" in ti:   # Write: against the file as it is
        try:
            old = open(path, encoding="utf-8").read()
        except OSError:
            old = ""
        return [(str(ti["content"]), old)]
    try:
        text = open(path, encoding="utf-8").read()
    except OSError:
        text = ""
    work = text   # every edit applied in order (replace_all honoured), then the changed lines judged whole
    for e in (ti.get("edits") or [ti]):
        old, new = str(e.get("old_string") or ""), str(e.get("new_string") or "")
        if not old or old not in work:
            return [(new, old)] if work == text else _hunks(text, work) + [(new, old)]
        work = work.replace(old, new) if e.get("replace_all") else work.replace(old, new, 1)
    return _hunks(text, work)


def _hunks(before, after):
    """[(changed lines after, the lines they replaced)], each hunk whole, so a DECISIONS row keeps its date."""
    a, b = before.splitlines(), after.splitlines()
    return [("\n".join(b[j1:j2]), "\n".join(a[i1:i2]))
            for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes() if op != "equal"]


def main():
    now = now_ist()
    if sys.argv[1:2] == ["--scan"]:
        bad = ahead(open(sys.argv[2], encoding="utf-8").read(), now)
        for t, g in bad:
            print(f"AHEAD {t!r} by {g} (now {now:%d %b %H:%M} IST)")
        return 1 if bad else 0
    try:
        pairs = changes(json.load(sys.stdin)) or []
    except ValueError:
        return 0
    bad = [(t, g) for new, old in pairs for t, g in ahead(new, now) if t not in tokens(old)]
    if bad:
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
            "permissionDecisionReason": f"P-302: times only from `TZ=Asia/Kolkata date`; it is {now:%d %b %H:%M} IST now and this edit writes "
            + ", ".join(f"'{t}' ({int(g.total_seconds() // 60)} min ahead)" for t, g in bad[:4])
            + ". Run TZ=Asia/Kolkata date and write that time; a planned time says so (due, by, next, target …)."}}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
