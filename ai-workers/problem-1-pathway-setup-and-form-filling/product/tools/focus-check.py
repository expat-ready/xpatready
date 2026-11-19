#!/usr/bin/env python3
"""ENF-733 (a) (founder 19 Nov, P-733 (1), P-734 (2)): a builder brief may name only the R1 items and rows on the focus
list the Lead keeps, product/focus-list.md (the items nearest to done). Reads the brief on stdin; exit 0 when it
passes; exit 1 with one line "OFF THE FOCUS LIST: ..." naming what is not listed, the reason and the list's path.
Run by lane-preflight.sh --hook on every session start (no hook or settings change, P-387). Test: check-focus-list.sh.

What counts (the choices are stated in the PR that added this file):
* R1 item: "R1.<n>". Row: an id that is a row of BACKLOG*.md (first cell) or of the list, or an id with a digit in a
  build family (J, PF, FO, CS, AUD, AS, BK, B<n>). Decisions (P-n), file names (J-48.md) and PR numbers are not rows.
* Not a builder brief, so it passes untouched: one that names no R1 item and no such row; a /qa, /lead or strategy
  desk start; one whose own row (after "/next <area>", else after "Row", else the first row named) has a BACKLOG
  area starting tooling, qa, records, lead or tech lead. Rows of those areas named in passing are never refused.
* A builder brief with no readable list is refused: the lock fails closed.
The list: table lines "| R1.<n>[, R1.<n>] | row ids a brief may name | owning Lead | ... |"; "-" for no row.
  python3 -I product/tools/focus-check.py < brief.txt     FOCUS_LIST, FOCUS_BACKLOG_DIR: other files (tests)
  python3 -I product/tools/focus-check.py --list          the items and rows read from the list
"""
import glob, os, re, sys

PH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIST = os.environ.get("FOCUS_LIST") or os.path.join(PH, "focus-list.md")
BACKLOG_DIR = os.environ.get("FOCUS_BACKLOG_DIR") or PH
SHOWN = "ai-workers/problem-1-pathway-setup-and-form-filling/product/focus-list.md" if not os.environ.get("FOCUS_LIST") else LIST
ITEM = re.compile(r"(?<![A-Za-z0-9.])R1\.[0-9]+(?![0-9])")
ROW = re.compile(r"(?<![A-Za-z0-9/-])(?:[A-Z]{1,4}-[0-9A-Za-z]+|B[0-9]+[a-z]?)(?![A-Za-z0-9])")
FAMILY = re.compile(r"^(?:(?:J|PF|FO|CS|AUD|AS|BK)-[A-Za-z]*[0-9][0-9A-Za-z]*|B[0-9]+[a-z]?)$")
FILE = re.compile(r"\S*\.(?:md|ts|tsx|js|mjs|sh|py|json|prisma|yml|yaml|sql|html|txt|tsv|csv)\b")
EXEMPT_AREA = re.compile(r"^\W*(tooling|qa|records|lead|tech lead)\b", re.I)


def read_list():
    items, rows = set(), set()
    try:
        lines = open(LIST, encoding="utf-8").read().split("\n")
    except OSError:
        return None, None
    for l in lines:
        c = [x.strip() for x in l.split("|")]
        if len(c) < 4 or not ITEM.match(c[1]):
            continue
        items.update(ITEM.findall(c[1]))
        rows.update(ROW.findall(c[2]))
    return items, rows


def read_backlog():
    area = {}
    for f in sorted(glob.glob(os.path.join(BACKLOG_DIR, "BACKLOG*.md"))):
        for l in open(f, encoding="utf-8").read().split("\n"):
            c = l.split("|")
            if len(c) > 3 and ROW.fullmatch(c[1].strip()):
                area.setdefault(c[1].strip(), c[2])   # the first row with that id is the row
    return area


def main():
    items, rows = read_list()
    if "--list" in sys.argv[1:]:
        if items is None:
            print(f"no focus list at {SHOWN}"); return 1
        print("items: " + " ".join(sorted(items, key=lambda i: int(i[3:])))); print("rows: " + " ".join(sorted(rows))); return 0
    brief = sys.stdin.read().replace("\r", "")
    if re.search(r"(?:^|\s)/(?:qa|lead)\b|strategy[- ]desk", brief):
        return 0
    text = FILE.sub(" ", brief)
    area = read_backlog()
    listed_rows = rows or set()
    named = [r for r in dict.fromkeys(ROW.findall(text)) if not r.startswith("P-") and (r in area or r in listed_rows or FAMILY.match(r))]
    exempt = lambda r: r in area and r not in listed_rows and EXEMPT_AREA.match(area[r])
    own = re.search(r"/next [a-z]+ (" + ROW.pattern + ")", text) or re.search(r"(?<![A-Za-z])[Rr]ow (" + ROW.pattern + ")", text)
    own = own.group(1) if own and own.group(1) in named else (named[0] if named else None)
    if own and exempt(own):
        return 0
    named_items = list(dict.fromkeys(ITEM.findall(text)))
    build_rows = [r for r in named if not exempt(r)]
    if not named_items and not build_rows:
        return 0
    why = "P-733 (1): builder lanes work the items nearest to done first, and P-734 holds that until the evening of 22 Nov"
    if items is None or not items:
        print(f"OFF THE FOCUS LIST: no focus list could be read at {SHOWN}, so no builder brief can start ({why}). The Lead restores the list.")
        return 1
    off = [i for i in named_items if i not in items] + [r for r in build_rows if r not in listed_rows]
    if not off:
        return 0
    print(f"OFF THE FOCUS LIST: this brief names {', '.join(off)}, not on the focus list ({why}). "
          f"Brief a listed item, or the Lead adds the item or row to {SHOWN} first.")
    return 1


sys.exit(main())
