#!/usr/bin/env python3
"""ENF-733 (b) (founder A261, 21 Nov: the Lead's prioritisation is enforced by simple scripts): the focus list stays true.
focus-check.py (ENF-733 (a)) refuses builder briefs for items off product/focus-list.md, so a stale list both misleads the
Lead and blocks the right lanes. This compares the list with qa's statuses (qa/CAPABILITIES.md, R1 rows, Status column;
qa alone sets Status, P-314) and prints:
  drop: proven      a list line whose every item is Works (remove it: P-733 (1) "remove a line when its item is Proven")
  missing: Partial  an R1 item at Partial that no list line names (focus-check.py refuses its lanes)
Exit 1 when either is printed, 0 when the list is true, 2 when a file cannot be read or has no R1 rows or lines.
Read-only: --md prints the corrected list (dropped lines removed, missing items appended for the Lead to fill in); it
never writes the file, the records are the Lead's. Standard library only. Test: test_focus_truth.py.
  python3 -I product/tools/focus-truth.py [--md] [--list focus-list.md] [--caps qa/CAPABILITIES.md]
"""
import os, re, sys

PH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ITEM = re.compile(r"(?<![A-Za-z0-9.])R1\.[0-9]+(?![0-9])")   # as focus-check.py
num = lambda i: int(i[3:])


def arg(name, default):
    a = sys.argv[1:]
    return a[a.index(name) + 1] if name in a and a.index(name) + 1 < len(a) else default


def cells(line):
    return [x.strip() for x in line.split("|")] if line.lstrip().startswith("|") else []


def read_caps(text):
    """R1 item -> (status, capability), from the table whose header has a Status column."""
    caps, col = {}, None
    for l in text.split("\n"):
        c = cells(l)
        if "Status" in c:
            col = c.index("Status")
        elif col and len(c) > col and re.fullmatch(r"R1\.[0-9]+", c[1]):
            caps[c[1]] = (c[col], c[2] if len(c) > 2 else "")
    return caps


def list_lines(text):
    """(line index, items) for each focus-list table line (the shape focus-check.py reads)."""
    out = []
    for n, l in enumerate(text.split("\n")):
        c = cells(l)
        if len(c) >= 4 and ITEM.match(c[1]):
            out.append((n, ITEM.findall(c[1])))
    return out


def check(list_text, caps_text):
    caps = read_caps(caps_text)
    status = lambda i: caps.get(i, ("", ""))[0]
    lines = list_lines(list_text)
    drop = [(n, items) for n, items in lines if items and all(status(i).startswith("Works") for i in items)]
    listed = {i for _, items in lines for i in items}
    missing = sorted((i for i in caps if status(i).startswith("Partial") and i not in listed), key=num)
    return caps, drop, missing


def main():
    lp = arg("--list", os.path.join(PH, "focus-list.md"))
    cp = arg("--caps", os.path.join(PH, "qa", "CAPABILITIES.md"))
    try:
        list_text = open(lp, encoding="utf-8").read()
        caps_text = open(cp, encoding="utf-8").read()
    except OSError as e:
        print(f"focus-truth: cannot read {e.filename}: nothing was checked"); return 2
    except UnicodeDecodeError as e:   # review: a file that is not UTF-8 is "not checked" (2), never a finding (1)
        print(f"focus-truth: a file is not UTF-8 ({e.reason}): nothing was checked"); return 2
    caps, drop, missing = check(list_text, caps_text)
    if not caps:
        print(f"focus-truth: no R1 rows with a Status column in {cp}: nothing was checked"); return 2
    if not list_lines(list_text):   # an empty or moved list must not read as "every Partial item is missing"
        print(f"focus-truth: no R1 lines in {lp}: nothing was checked"); return 2
    src = list_text.split("\n")
    if "--md" in sys.argv[1:]:
        gone = {n for n, _ in drop}
        out = [l for n, l in enumerate(src) if n not in gone]
        while out and not out[-1].strip():
            out.pop()
        if missing:
            out += ["", "## Partial on qa's file, not listed (focus-truth.py: the Lead fills in rows, Lead and parts left)",
                    "| Item | Rows a brief may name | Lead | Parts left |", "|---|---|---|---|"]
            out += [f"| {i} | - | ? | ? (qa: Partial; {caps[i][1]}) |" for i in missing]
        print("\n".join(out))
    else:
        for n, items in drop:
            print(f"drop: proven  {', '.join(items)} (all Works in qa/CAPABILITIES.md)  line {n + 1}: {src[n].strip()[:110]}")
        for i in missing:
            print(f"missing: Partial, not listed  {i} {caps[i][1]}")
        print(f"focus-truth: {len(drop)} proven line(s), {len(missing)} Partial item(s) missing")
    return 1 if drop or missing else 0


if __name__ == "__main__":
    sys.exit(main())
