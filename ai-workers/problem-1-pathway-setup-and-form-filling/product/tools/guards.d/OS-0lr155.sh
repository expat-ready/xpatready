# LR-155 (file named OS-0lr155.sh: check-guards-d.sh reads only OS-<digits>…; "LR-155" is the lab register row, lane
# automation-measures): the audit's top 15 counted by enforcer on main; a lost enforcer fails. Each row switches one rule
# of top15-watch.py off, so check-top15-watch.sh must then fail.
TESTS="$TESTS check-top15-watch.sh"   # LR-155: top 15 enforcers on main, N/15, a lost one fails
MUT="$MUT"'
LR155 text|product/tools/top15-watch.py|s/        elif text not in body:/        elif False:/|check-top15-watch.sh
LR155 file|product/tools/top15-watch.py|s/        if body is None:/        if False and body is None:/|check-top15-watch.sh
LR155 exit|product/tools/top15-watch.py|s/    return 1 if lost else 0/    return 0/|check-top15-watch.sh
LR155 fifteen|product/tools/top15-watch.py|s/if len(rows) != 15 or/if/|check-top15-watch.sh'
