#!/usr/bin/env python3
"""A427/A440: one line for every Lead check — lab register progress against the committed plan.

Usage: lab-progress.py [--ref origin/main]
Reads design/lab-register-2026-11-27.md on the ref (default origin/main), counts live rows (not DROP,
not MERGED-INTO) by gate (Status starts with Built / Proven), and compares with the plan the founder
was given (A420): all Built by 27 Nov 23:00 IST, all Proven by 28 Nov 10:00 IST.
The rate is measured from the previous run's snapshot (kept in $TMPDIR/lab-progress.log), never assumed.
Prints one line, starting 🟢 on track or 🔴 off track. Exit 0 always (a report, not a gate).
"""
import os, re, subprocess, sys, time
from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))
BUILT_BY = datetime(2026, 11, 27, 23, 0, tzinfo=IST)
PROVEN_BY = datetime(2026, 11, 28, 10, 0, tzinfo=IST)
ref = sys.argv[sys.argv.index('--ref') + 1] if '--ref' in sys.argv else 'origin/main'
here = os.path.dirname(os.path.abspath(__file__))
rel = os.path.relpath(os.path.join(here, '..', 'design', 'lab-register-2026-11-27.md'),
                      subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=here, capture_output=True, text=True).stdout.strip())
text = subprocess.run(['git', 'show', f'{ref}:{rel}'], cwd=here, capture_output=True, text=True).stdout
live = built = proven = 0
for line in text.split('\n'):
    if not re.match(r'^\| LR-\d+', line):
        continue
    c = [x.strip() for x in line.split('|')]
    if len(c) < 11 or c[4].startswith(('DROP', 'MERGED-INTO')):
        continue
    live += 1
    st = c[8]
    if st.startswith('Proven'):
        proven += 1; built += 1
    elif st.startswith('Built') and not st.startswith('Built pending'):
        built += 1
if not live:
    print('🔴 lab: register not readable on ' + ref); sys.exit(0)
now = datetime.now(IST)
log = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'lab-progress.log')
rate = None
try:
    last = open(log).read().split('\n')[-2].split()
    dt_h = (time.time() - float(last[0])) / 3600
    if dt_h > 0.2:
        rate = (built - int(last[1])) / dt_h
except Exception:
    pass
try:
    open(log, 'a').write(f'{time.time():.0f} {built} {proven}\n')
except Exception:
    pass
h_left = max((BUILT_BY - now).total_seconds() / 3600, 0.01)
need = (live - built) / h_left
on_track = rate is not None and rate >= need
mark = '🟢' if on_track else '🔴'
eta = ''
if rate and rate > 0:
    eta = ' · Built ETA at this rate ' + (now + timedelta(hours=(live - built) / rate)).strftime('%d %b %H:%M IST')
rate_s = 'not yet measured' if rate is None else f'{rate:.1f} rows/h'
print(f'{mark} lab: Built {built}/{live} ({100*built//live}%), Proven {proven}/{live} ({100*proven//live}%) on {ref} · '
      f'plan Built 27 Nov 23:00, Proven 28 Nov 10:00 IST · need {need:.1f} rows/h, measured {rate_s}{eta}')
