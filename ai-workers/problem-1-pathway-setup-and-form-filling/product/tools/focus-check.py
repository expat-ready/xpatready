#!/usr/bin/env python3
"""ENF-733 (a) (founder 19 Nov, P-733 (1), P-734 (2)): a builder brief may name only the R1 items and rows on the focus
list the Lead keeps, product/focus-list.md (the items nearest to done). Reads the brief on stdin; exit 0 when it
passes; exit 1 with one line "OFF THE FOCUS LIST: ..." naming what is not listed, the reason and the list's path.
Run by lane-preflight.sh --hook on every session start (no hook or settings change, P-387). Test: check-focus-list.sh.

What counts (the choices, with the evidence for them, are stated in the PR that added this file):
* R1 item: "R1.<n>". Row: an id that is a row of BACKLOG*.md (first cell) or of the list, or an id with a digit in a
  build family (J, PF, FO, CS, AUD, AS, BK, B<n>). Decisions (P-n), file names (J-48.md) and PR numbers are not rows.
  A row whose BACKLOG area is tooling, qa, records, Lead or tech lead is not a build row and is never refused.
* What the brief is for (each must be on the list): the row after "/next <area>" or "Row", else the first R1 item or
  build row it names; and any that directly follows build, start, implement, resume, finish, "open the", then,
  "merges,", or is the brief file after Read, per or from (J-77.md, CS-NT1-1.md). A brief that names nothing
  outside file names is for the rows of every brief file it cites. Other rows named
  further on (clash notes, waits-on, duplicate-check lines) are context: every real brief for a listed item names
  some, so refusing them would refuse the focus items themselves.
* Not a builder brief, so it passes untouched: one that names no R1 item and no build row; one whose "/next" or "Row"
  row has a tooling, qa, records or Lead area; /qa or /lead as a command (at the start of a line, or after "Run"), or a line
  starting "qa <mode>", "Records only" or "You are ... Lead" (a qa, records or Lead start); the strategy desk.
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
EXEMPT_AREA = re.compile(r"^\s*(tooling|qa|records|tech lead|lead)\s*([(;,:./]|$)", re.I)
NOT_BUILDER = re.compile(r"(?:^[\s>*`-]*|[Rr]un\s+`?)/(?:qa|lead)(?![A-Za-z0-9-])|^[\s>*`-]*(?:(?:[Rr]un\s+)?qa (?:after-merge|milestone|capability|explore|with-me)\b"
                         r"|[Rr]ecords only\b|[Yy]ou are (?:the |a |now )?(?:[A-Za-z]+ )?(?:tech )?[Ll]ead\b)|strategy[- ]desk", re.M)
ANY = "(?:" + ITEM.pattern + "|" + ROW.pattern + ")"
OWN = re.compile(r"(?:/next [a-z]+|(?<![A-Za-z])[Rr]ow) (" + ROW.pattern + ")")
VERB = re.compile(r"(?:(?<![A-Za-z])(?:[Bb]uild|[Ss]tart|[Ii]mplement|[Rr]esume|[Ff]inish|[Oo]pen the|[Tt]hen|merges,))\s+(?:the\s+)?(" + ANY + ")")
BRIEF_FILE = re.compile(r"(?<![A-Za-z])([Rr]ead|per|from)\s+[`*]*(?:[A-Za-z0-9_.-]+/)*([A-Z]{1,4}-[0-9A-Za-z-]+|B[0-9]+[a-z]?)\.md\b")
MD_FILE = re.compile(r"(?<![A-Za-z0-9-])([A-Z]{1,4}-[0-9A-Za-z-]+|B[0-9]+[a-z]?)\.md\b")


def read_list():
    items, rows = set(), set()
    try:
        lines = open(LIST, encoding="utf-8").read().split("\n")
    except OSError:
        return items, rows
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
        if not items:
            print(f"no focus list at {SHOWN}"); return 1
        print("items: " + " ".join(sorted(items, key=lambda i: int(i[3:])))); print("rows: " + " ".join(sorted(rows))); return 0
    brief = sys.stdin.read().replace("\r", "")
    if NOT_BUILDER.search(brief):
        return 0
    area = read_backlog()

    def row_of(stem):   # J-77.md is J-77, CS-NT1-1.md is CS-NT1, PF-19b3.md is PF-19b3 or PF-19b
        cands = [stem, re.sub(r"-[0-9]+$", "", stem), re.sub(r"[0-9]$", "", stem)]
        hit = next((c for c in cands if c in rows), None) or next((c for c in cands if c in area), None) \
            or (cands[1] if FAMILY.match(cands[1]) else None)
        return hit

    def file_row(m):   # "Read J-77.md", "per briefs/PF-19b3.md", "from CS-NT1-1.md": the brief file names its row
        hit = row_of(m.group(2))
        return f"{m.group(1)} then {hit} " if hit else " "   # "then": VERB reads it as what the brief is for
    text = BRIEF_FILE.sub(file_row, brief)
    more = re.compile(r"(then \S+ [`*]*\s*(?:and|,)\s+)[`*]*(?:[A-Za-z0-9_.-]+/)*([A-Z]{1,4}-[0-9A-Za-z-]+|B[0-9]+[a-z]?)\.md\b")
    while more.search(text):   # "Read J-77.md and CS-NT1-1.md": the files joined to a brief file are brief files too
        text = more.sub(lambda m: m.group(1) + (f"then {row_of(m.group(2))} " if row_of(m.group(2)) else " "), text, count=1)
    text = FILE.sub(" ", text)
    exempt = lambda r: r in area and r not in rows and bool(EXEMPT_AREA.match(area[r]))
    known = lambda x: bool(ITEM.fullmatch(x)) or (not x.startswith("P-") and (x in area or x in rows or bool(FAMILY.match(x))))
    own = OWN.search(text)
    if own and exempt(own.group(1)):
        return 0
    named = [x for x in re.findall(ANY, text) if known(x) and not exempt(x)]   # R1 items and build rows, in the brief's order
    if not named:   # nothing named outside file names: the brief files it cites say what it is for
        named = [r for r in dict.fromkeys(filter(None, map(row_of, MD_FILE.findall(brief)))) if not exempt(r)]
        if not named:
            return 0
        text = "then " + " then ".join(named)
    subject = ([own.group(1)] if own and known(own.group(1)) else named[:1]) + [x for x in VERB.findall(text) if known(x) and not exempt(x)]
    subject = list(dict.fromkeys(subject))
    why = "P-733 (1): builder lanes work the items nearest to done first, and P-734 holds that until the evening of 22 Nov"
    if not items:
        print(f"OFF THE FOCUS LIST: no focus list could be read at {SHOWN}, so no builder brief can start ({why}). The Lead restores the list.")
        return 1
    off = [x for x in subject if x not in items and x not in rows]
    if not off:
        return 0
    print(f"OFF THE FOCUS LIST: this brief is for {', '.join(off)}, not on the focus list ({why}). "
          f"Brief a listed item, or the Lead adds the item and its rows to {SHOWN} first.")
    return 1


sys.exit(main())
