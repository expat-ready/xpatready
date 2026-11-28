#!/usr/bin/env python3
"""The red "Waiting on the founder" line (OS-18; P-530, DECISIONS row, 13 Nov).

P-530 (1): the moment work waits on the founder, the Lead sends a push notification and lists it under a 🔴 "Waiting on
the founder" line at the top of STATE "Start here". (2): each check re-reads the line and re-sends the notification while
an item has waited over 30 minutes, at most once an hour per item. So, at each lead-watch check (step 13d):
  * a 🔴 line above STATE's first ## heading or inside "## Start here" is found (a list marker, ** before or after the
    emoji and leading spaces are allowed);
  * first seen now: its wait starts (the Lead's first push went with it, P-530 (1)); a plain line;
  * waited 30 min or more, and no re-send yet or the last one 60 min ago or more: one ACT "re-send the push", remembered
    as sent (the next falls due an hour on);
  * otherwise a plain line with the minutes waited and when the next re-send falls due.
Each line is remembered by its text in --memory (JSON, written after each decision); a line that is gone is forgotten.
STATE unreadable: an ACT, never "no line". Exit 0 when it ran.
    python3 -I founder-wait.py --state <STATE.md> --memory <file.json> [--now ISO]      Test: check-founder-wait.sh.
"""
import argparse, hashlib, json, os, re, sys
from datetime import datetime, timezone

LINE = re.compile(r"^\s*(?:[-*]|\d+\.)?\s*(?:\*\*)?\s*🔴\s*(?:\*\*)?\s*Waiting on the founder")
WAIT_MIN, EVERY_MIN = 30, 60


def lines_atop(text):
    """The 🔴 lines above the first ## heading or inside ## Start here."""
    out, scope = [], True
    for ln in text.replace("\r", "").split("\n"):
        if ln.startswith("## "):
            scope = ln[3:].strip().startswith("Start here")
            continue
        if scope and LINE.match(ln):
            out.append(ln.strip())
    return out


def clean(s):
    return "".join(ch for ch in s if ch >= " " and ch != "\x7f")[:200]


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--state", required=True); a.add_argument("--memory", required=True); a.add_argument("--now")
    o = a.parse_args()
    now = datetime.fromisoformat(o.now.replace("Z", "+00:00")) if o.now else datetime.now(timezone.utc)
    try:
        with open(o.state, "rb") as f:
            text = f.read().decode("utf-8", "replace")
    except OSError as e:
        print("ACT   founder wait: STATE.md unreadable (%s), so a 🔴 Waiting on the founder line cannot be judged" % e.__class__.__name__)
        return 0
    try:
        with open(o.memory, encoding="utf-8") as f:
            mem = json.load(f)
        if not isinstance(mem, dict):
            raise ValueError
    except (OSError, ValueError):
        mem = {}
    found = lines_atop(text)
    if not found:
        print("founder wait: no 🔴 Waiting on the founder line atop STATE or in Start here")
    new = {}
    for ln in found:
        k = hashlib.sha1(ln.encode()).hexdigest()[:16]
        m = mem.get(k) if isinstance(mem.get(k), dict) else None
        try:
            first = datetime.fromisoformat(m["first"]); push = datetime.fromisoformat(m["push"]) if m.get("push") else None
            if first > now or (push and push > now):
                raise ValueError
        except (TypeError, KeyError, ValueError):
            first, push = now, None                 # first seen (or an unreadable memory): the wait starts now
        waited = int((now - first).total_seconds() // 60); since = int((now - push).total_seconds() // 60) if push else None
        if waited >= WAIT_MIN and (since is None or since >= EVERY_MIN):
            print("ACT   founder wait: waited %d min, %s: re-send the push notification and raise it in the founder's next turn (P-530): %s"
                  % (waited, "no re-send yet" if since is None else "last re-send %d min ago" % since, clean(ln)))
            push = now
        else:
            due = max(WAIT_MIN - waited, 0) if since is None else EVERY_MIN - since
            print("founder wait: 🔴 line stands, waited %d min; next re-send due in %d min (P-530): %s" % (waited, due, clean(ln)))
        new[k] = {"first": first.isoformat(), "push": push.isoformat() if push else None}
    try:
        tmp = o.memory + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(new, f)
        os.replace(tmp, o.memory)
    except OSError as e:
        print("ACT   founder wait: memory %s not written (%s): the next check starts every wait again" % (o.memory, e.__class__.__name__))
    return 0


if __name__ == "__main__":
    sys.exit(main())
