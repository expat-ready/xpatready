#!/usr/bin/env python3
"""LR-177 (a) (founder A455, 15:5x IST: "nobody waits unseen"): the saved app view (app-view-save.sh's text: "saved <IST>
epoch <n>", then app-view.js's lines) as JSON, so every lane's state, last message time and what it waits for are data.
  python3 -I product/tools/app-view-json.py <app-view-latest.txt> <app-view.json>
Each line "FLAG|ok  <title> · cloud|mac · <state> · needs: <what> · <detail> · idle <n> min · <context> [· id <session>]
[-> <reasons>]" becomes {title, where, state, waits_for, detail, idle_min, last_message_at (ISO, UTC: saved time minus idle),
session_id, flagged, reasons}. Fields are found by shape, never by position (a title or detail may hold " · ").
Writes the file atomically; exit 0, or 2 (nothing written) when the text is not a saved app view. Test: check-wait-unseen.sh.
"""
import json, os, re, sys
from datetime import datetime, timezone

LINE = re.compile(r"^(FLAG|ok)\s+(.*?) · (cloud|mac) · ([a-z_]+) · needs: (.*?) · (.*)$")


def parse(text):
    lines = text.split("\n")
    m = re.search(r"\bepoch (\d+)", lines[0] if lines else "")
    if not m:
        return None
    saved = int(m.group(1))
    out = {"saved_at": datetime.fromtimestamp(saved, timezone.utc).isoformat(), "summary": lines[1] if len(lines) > 1 else "",
           "unreadable": any(l.startswith("UNREADABLE") for l in lines[1:]), "lanes": []}
    for l in lines[1:]:
        g = LINE.match(l)
        if not g:
            continue
        rest = g.group(6)
        reasons = ""
        if " -> " in rest:
            rest, reasons = rest.rsplit(" -> ", 1)
        sid = re.search(r"(?:^| · )id ((?:session|cse)_[A-Za-z0-9]+)", rest)
        idle = re.findall(r"(?:^| · )idle (\d+) min(?= · |$)", rest)
        detail = re.split(r" · idle (?:\d+ min|\?)(?= · |$)", rest)[0]
        mins = int(idle[-1]) if idle else None
        out["lanes"].append({
            "title": g.group(2), "where": g.group(3), "state": g.group(4),
            "waits_for": "" if g.group(5) == "none" else g.group(5), "detail": detail,
            "idle_min": mins,
            "last_message_at": datetime.fromtimestamp(saved - mins * 60, timezone.utc).isoformat() if mins is not None else None,
            "session_id": sid.group(1) if sid else None, "flagged": g.group(1) == "FLAG",
            "reasons": [r for r in re.split(r", (?![^()]*\))", reasons) if r]})
    return out


def main(argv):
    if len(argv) != 2:
        print(__doc__.split("\n")[2].strip()); return 2
    try:
        data = parse(open(argv[0], encoding="utf-8").read())
    except OSError as e:
        print(f"app-view-json: {argv[0]} unreadable ({e.__class__.__name__})"); return 2
    if data is None:
        print("app-view-json: not a saved app view (no \"epoch <n>\" first line): nothing written"); return 2
    tmp = f"{argv[1]}.{os.getpid()}"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)
    os.replace(tmp, argv[1])
    print(f"app view as JSON: {len(data['lanes'])} lanes to {argv[1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
