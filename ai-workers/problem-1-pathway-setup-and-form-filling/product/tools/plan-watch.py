#!/usr/bin/env python3
"""P-690 guard: the full-power plan is the one action list; no item may silently disappear.

Usage: plan-watch.py [--summary] [plan.md]
  default : prints a problem line and exits 1 if any numbered inventory row 1..N is missing
            (N = the highest item number ever listed in the file's "Counts" table total, at least 223).
  --summary: prints one line "plan: Done a · Doing b · Open c · Superseded d · other e (of N)".
Founder, 18 Nov 18:4x IST (A169): "there should be some way that you all agents are aware, and until unless
this sheet is completed, we should not be silently missing it". Test: tools/check-plan-watch.sh.
"""
import re, sys, os

args = [a for a in sys.argv[1:] if not a.startswith('--')]
summary = '--summary' in sys.argv
here = os.path.dirname(os.path.abspath(__file__))
path = args[0] if args else os.path.join(here, '..', 'design', 'full-power-plan-2026-11-17.md')
if not os.path.exists(path):
    print(f"PLAN WATCH: {path} is missing (P-690: the one action list must stay)"); sys.exit(1)
text = open(path, encoding='utf-8').read()
m = re.search(r'\*\*Total\*\*\s*\|\s*\*\*(\d+)\*\*', text)
total = max(223, int(m.group(1)) if m else 0)
rows, scol = {}, {}
col = None
for line in text.split('\n'):
    if line.startswith('| #') or line.startswith('| Order'):   # a table header: find its Status column
        hdr = [x.strip() for x in line.split('|')]
        col = next((i for i, h in enumerate(hdr) if h.lower().startswith('status')), None)
    mm = re.match(r'^\| (\d+) \|', line)
    if mm and line.count('|') >= 8 and col is not None:   # inventory rows; the bucket tables have no Status column
        n = int(mm.group(1))
        if n not in rows: rows[n], scol[n] = line, col
missing = [n for n in range(1, total + 1) if n not in rows]
if summary:
    c = {'Done': 0, 'Doing': 0, 'Open': 0, 'Superseded': 0, 'other': 0}
    for n, line in rows.items():
        cells = [x.strip() for x in line.split('|')]
        st = cells[scol[n]] if len(cells) > scol[n] else ''
        k = ('Done' if re.search(r'\bDone\b', st) else 'Doing' if 'Doing' in st else
             'Superseded' if re.search(r'Superseded|Dropped|Duplicate|Declined', st) else
             'Open' if re.search(r'Open|Later|Decided|Prepared|Requested', st) else 'other')
        c[k] += 1
    print(f"plan: Done {c['Done']} · Doing {c['Doing']} · Open {c['Open']} · Superseded {c['Superseded']} · other {c['other']} (of {total}; P-690)")
if missing:
    print(f"PLAN WATCH: {len(missing)} item(s) missing from the full-power plan (P-690: items leave only when done or dropped by the founder, never deleted): {', '.join(map(str, missing[:20]))}")
    sys.exit(1)
