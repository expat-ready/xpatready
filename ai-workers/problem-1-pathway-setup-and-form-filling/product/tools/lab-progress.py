#!/usr/bin/env python3
"""A427/A440: one line for every Lead check — lab register progress against the committed plan.

Usage: lab-progress.py [--ref origin/main]
Reads design/lab-register-2026-11-27.md on the ref (default origin/main), counts live rows (not DROP,
not MERGED-INTO) by gate (Status starts with Built / Proven), and compares with the plan the founder
was given (A420): all Built by 27 Nov 23:00 IST, all Proven by 28 Nov 10:00 IST.
The rate is measured from the previous run's snapshot (kept in $TMPDIR/lab-progress.log), never assumed.
Prints one line, starting 🟢 on track or 🔴 off track. Exit 0 always (a report, not a gate).

LR-102 (lab automation-measures): counts per lane, from row status, never estimated by hand.
  lab-progress.py --lanes [--ref R | --register FILE]         # one line per lane: Intended / Built / Proven / live
  lab-progress.py --page FILE [--ref R | --register FILE]     # rewrites the block between
      <!-- lab-progress:lanes --> and <!-- /lab-progress:lanes --> in FILE (the software-factory page) with that table
A row with two lanes ("Lead + automation-measures") counts in each; the Total line counts each row once.
Exit for --lanes and --page: 0 written, 2 register unreadable or page markers missing (nothing written).
Test: product/tools/check-lab-progress.sh.
"""
import os, re, subprocess, sys, time
from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))
BUILT_BY = datetime(2026, 11, 27, 23, 0, tzinfo=IST)
PROVEN_BY = datetime(2026, 11, 28, 10, 0, tzinfo=IST)
def arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv[:-1] else None


def gate(status):
    """Proven / Built / Intended from a Status cell (as the one-line count always read it)."""
    if status.startswith('Proven'):
        return 'Proven'
    if status.startswith('Built') and not status.startswith("Built pending"):
        return 'Built'
    return 'Intended'


def rows(text):
    """-> [(lanes, gate)] for live rows (not DROP, not MERGED-INTO)."""
    out = []
    for line in text.split('\n'):
        if not re.match(r'^\| LR-\d+', line):
            continue
        c = [x.strip() for x in line.split('|')]
        if len(c) < 11 or c[4].startswith(("DROP", "MERGED-INTO")):
            continue
        out.append(([x.strip() for x in re.split(r'[+,]', c[6]) if x.strip()] or ['(none)'], gate(c[8])))
    return out


def lanes_table(rs):
    """-> [(lane, intended, built, proven, live)], lanes by name, then Total (each row once). Built excludes Proven."""
    per = {}
    for ls, g in rs:
        for lane in ls:
            per.setdefault(lane, {'Intended': 0, 'Built': 0, 'Proven': 0})[g] += 1
    tot = {'Intended': 0, 'Built': 0, 'Proven': 0}
    for _, g in rs:
        tot[g] += 1
    out = [(k, v['Intended'], v['Built'], v['Proven'], sum(v.values())) for k, v in sorted(per.items())]
    return out + [('Total', tot['Intended'], tot['Built'], tot['Proven'], len(rs))]


def page_block(table, src):
    h = ['<!-- lab-progress:lanes -->',
         '<p>Register rows by gate, counted by <code>product/tools/lab-progress.py --page</code> from %s (LR-102). '
         'Built here means built and not yet proven.</p>' % src,
         '<div class="tbl"><table>', '<tr><th>Lane</th><th>Intended</th><th>Built</th><th>Proven</th><th>Rows</th>'
         '<th>Proven</th></tr>']
    for lane, i, b, p, n in table:
        pct = 100 * p // n if n else 0
        name = '<b>%s</b>' % lane if lane == 'Total' else lane
        h.append('<tr><td>%s</td><td class="pct">%d</td><td class="pct">%d</td><td class="pct">%d</td>'
                 '<td class="pct">%d</td><td><div class="bar"><i style="width:%d%%"></i></div>'
                 '<span class="pct">%d%%</span></td></tr>' % (name, i, b, p, n, pct, pct))
    return '\n'.join(h + ['</table></div>', '<!-- /lab-progress:lanes -->'])


ref = arg('--ref') or 'origin/main'
here = os.path.dirname(os.path.abspath(__file__))
if arg('--register'):
    try:
        text, src = open(arg('--register'), encoding='utf-8').read(), os.path.basename(arg('--register'))
    except OSError:
        text, src = '', arg('--register')
else:
    rel = os.path.relpath(os.path.join(here, '..', 'design', 'lab-register-2026-11-27.md'),
                          subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=here, capture_output=True,
                                         text=True).stdout.strip())
    text = subprocess.run(['git', 'show', f'{ref}:{rel}'], cwd=here, capture_output=True, text=True).stdout
    sha = subprocess.run(['git', 'rev-parse', '--short=9', ref], cwd=here, capture_output=True,
                         text=True).stdout.strip()
    src = 'the register on %s %s' % (ref, sha)
rs = rows(text)
if '--lanes' in sys.argv or '--page' in sys.argv:
    if not rs:
        print('lab-progress: register not readable (%s): nothing written' % src); sys.exit(2)
    table = lanes_table(rs)
    if '--page' in sys.argv:
        page = arg('--page')
        try:
            html = open(page, encoding='utf-8').read()
        except (OSError, TypeError):
            print('lab-progress: page %s not readable: nothing written' % page); sys.exit(2)
        pat = re.compile(r'<!-- lab-progress:lanes -->.*?<!-- /lab-progress:lanes -->', re.S)
        if len(pat.findall(html)) != 1:
            print('lab-progress: %s needs exactly one <!-- lab-progress:lanes --> block: nothing written' % page)
            sys.exit(2)
        open(page, 'w', encoding='utf-8').write(pat.sub(lambda m: page_block(table, src), html))
        print('lab-progress: %s updated from %s' % (page, src))
    for lane, i, b, p, n in table:
        print('%-28s Intended %3d  Built %3d  Proven %3d  of %3d' % (lane, i, b, p, n))
    sys.exit(0)
live = len(rs)
proven = sum(1 for _, g in rs if g == 'Proven')
built = proven + sum(1 for _, g in rs if g == 'Built')
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
if not arg("--register"):   # a fixture register never feeds the rate log (check-lab-progress.sh)
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
