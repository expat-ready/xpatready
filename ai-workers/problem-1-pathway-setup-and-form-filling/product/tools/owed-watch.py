#!/usr/bin/env python3
"""What is owed and nobody has raised yet: lead-watch.sh steps 14 (E11) and 15 (E19). Founder 21 Nov (P-772): every
valuable rule in code; the Lead stalled when work arrived from a teammate session while starts could happen only in a
founder-typed turn, so the owed starts waited unseen.

  lanes  --board data.json [--lanes "screens forms runtime evidence"] [--min 2]
         E11, P-599 (1): "at least two ready rows per lane at all times". Reads the board's own count (data.json ›
         backlog.by_lane, built by cockpit-data.py's backlog(): no second formula). One ACT per builder lane below --min;
         a board that cannot be read, or has no count for a lane, is an ACT ("not measured"), never a silent pass.
  starts --state STATE.md
         E19: STATE sentences saying a start (a lane, qa lane, standby, session) is owed at the founder's next typed turn
         (a cron or message turn cannot start sessions). One ACT line listing them, so the Lead raises them in the
         founder's next turn and in its push notification; each listed below it on an "owed" line.
Exit 0 always; lead-watch counts the ACT lines. US$0, no network. Test: check-owed-watch.sh.
"""
import argparse, json, re, sys
from datetime import datetime, timezone

LANES = "screens forms runtime evidence"   # the four /next lanes (skill next)


def lanes(a):
    want = a.lanes.split()
    try:
        d = json.load(open(a.board, encoding="utf-8"))
        by = ((d.get("backlog") or {}).get("by_lane") or {}).get("v")
        if not isinstance(by, dict):
            raise ValueError("no backlog.by_lane")
    except (OSError, ValueError, AttributeError) as e:
        print(f"ACT   ready rows per lane not measured: board {a.board} unreadable ({str(e)[:80]}); refresh the board (P-599)")
        return
    age = ""
    try:
        g = datetime.fromisoformat(d["freshness"]["generated_at"].replace("Z", "+00:00"))
        age = f", board {int((datetime.now(timezone.utc) - g).total_seconds() // 60)} min old"
    except (KeyError, TypeError, ValueError, AttributeError):
        age = ", board age unknown"
    got = {}
    for ln in want:
        v = by.get(ln)
        r = v.get("ready") if isinstance(v, dict) else None
        got[ln] = r if isinstance(r, int) and not isinstance(r, bool) else None
    print("lanes ready rows (P-599, at least %d each%s): %s" % (a.min, age, " · ".join(f"{ln} {'?' if r is None else r}" for ln, r in got.items())))
    for ln, r in got.items():
        if r is None:
            print(f"ACT   lane {ln}: ready rows not measured (board has no count): shape or check its rows (P-599)")
        elif r < a.min:
            print(f"ACT   lane {ln} has {r} ready row(s), under {a.min}: shape or unblock rows for it now (P-599)")


TYPED = re.compile(r"(founder'?s|his) next typed turn|founder-typed turn|next typed turn", re.I)
HEAD = re.compile(r"(founder-typed turn to-do|founder'?s next typed turn)[^:]{0,80}:\*\*", re.I)   # a bold heading only
START = re.compile(r"\bstart(s|ing)?\b|\brestart\b|\bunarchive\b|\bstandbys?\b|\bnew session\b|\b(lane|qa lane)\b", re.I)
DONE = re.compile(r"\bstarted\b|\bdone\b|\bcreated\b|\bnot owed\b", re.I)
SENT = r"(?:(?<=[.!?])|(?<=[.!?]\*\*))\s+(?=[A-Z(🔴*])|\s·\s"
SPLIT = re.compile(SENT + r"|;\s+|\s\([a-z]\)\s")   # the items of a to-do heading
CLAUSE = re.compile(SENT)


def clauses(line):   # inline: sentences, then ";" outside brackets (one inside keeps the row it belongs to)
    out = []
    for sent in CLAUSE.split(line):
        depth, cur = 0, ""
        for ch in sent:
            depth += (ch == "(") - (ch == ")" and depth > 0)
            if ch == ";" and depth == 0:
                out.append(cur); cur = ""
            else:
                cur += ch
        out.append(cur)
    return out


def clean(s):
    s = re.sub(r"\*\*|`|🔴|🟡|🟥", "", s)
    return re.sub(r"\s+", " ", s).strip(" -|>:")[:160]


def starts(a):
    try:
        text = open(a.state, encoding="utf-8").read()
    except OSError as e:
        print(f"ACT   starts owed not measured: {a.state} unreadable ({e.strerror}) (E19)")
        return
    owed = []
    for line in text.splitlines():
        if not TYPED.search(line):
            continue
        h = HEAD.search(line)
        if h:   # a to-do heading: every item after it is owed at that turn
            items = SPLIT.split(line[h.end():])
        else:   # inline: only the clause that names the typed turn
            items = [c for c in clauses(line) if TYPED.search(c)]
        for c in items:
            if START.search(c) and not DONE.search(c):
                c = clean(c)
                if len(c) >= 12 and c not in owed:   # a fragment such as "lane)" is not an item
                    owed.append(c)
    if not owed:
        print("starts owed at the founder's next typed turn: none")
        return
    print(f"ACT   starts owed at the founder's next typed turn: {len(owed)}: raise them at once in his next turn and in "
          "the push notification (a cron or message turn cannot start sessions; P-772, E19)")
    for c in owed:
        print(f"      owed  {c}")


def main():
    p = argparse.ArgumentParser()
    s = p.add_subparsers(dest="cmd", required=True)
    l = s.add_parser("lanes"); l.add_argument("--board", required=True); l.add_argument("--lanes", default=LANES); l.add_argument("--min", type=int, default=2)
    t = s.add_parser("starts"); t.add_argument("--state", required=True)
    a = p.parse_args()
    (lanes if a.cmd == "lanes" else starts)(a)


if __name__ == "__main__":
    main()
