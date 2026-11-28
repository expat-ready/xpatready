# LR-173 (file named OS-0lr173.sh: check-guards-d.sh reads only OS-<digits>…; founder P-860/P-861, 28 Nov): dropped and
# deferred rows never get lost: a DROP names its other home, a DEFERRED its trigger; DEFERRED out of the lab goal; due
# triggers are ACTs in lead-watch.
TESTS="$TESTS check-register-rows.sh"   # LR-173: dropped and deferred rows never get lost
MUT="$MUT"'
LR173 drop|product/tools/register-rows.py|s/        if verdict.startswith("DROP") and not any(HOME.search(x) for x in cells):/        if False:/|check-register-rows.sh
LR173 defer|product/tools/register-rows.py|s/        if verdict.startswith("DEFERRED") and not any(TRIG.search(x) for x in cells):/        if False:/|check-register-rows.sh
LR173 cell|product/tools/register-rows.py|s/        cells = (verdict, reason, notes)   #/        cells = (" ".join((verdict, reason, notes)),)   #/|check-register-rows.sh
LR173 goal|product/tools/lab-progress.py|s/    if c\[4\].startswith(.DEFERRED.):/    if False:/|check-register-rows.sh
LR173 due|product/tools/register-rows.py|s/            if ds\[0\] <= today:/            if False:/|check-register-rows.sh
LR173 ahead|product/tools/register-rows.py|s/            if ds\[0\] <= today:/            if True:/|check-register-rows.sh
LR173 every|product/tools/register-rows.py|s/        for m in TRIG.finditer(x):/        for m in [TRIG.search(x)] if TRIG.search(x) else []:/|check-register-rows.sh
LR173 split|product/tools/register-rows.py|s/            c = \[x.strip() for x in line.split(".")\]/            c = [x.strip() for x in line.split(" ! ")]/|check-register-rows.sh
LR173 real|product/tools/register-rows.py|s/                    date.fromisoformat(d); ok.append(d)/                    ok.append(d)/|check-register-rows.sh
LR173 log|product/tools/lab-progress.py|s/    if .--file. not in sys.argv:   #/    if True:   #/|check-register-rows.sh
LR173 watch|product/tools/lead-watch.sh|s/^echo "\$rr"; act=/echo "$rr"; : act=/|check-register-rows.sh
LR173 window|product/tools/register-rows.py|s/.a quiet window near\\s+)(/)(/|check-register-rows.sh'
