# LR-081 (sources FP #87, #143; CU:7.4; OS-14): branch-classes.py, the branch report and its guarded removal.
# Each row switches one of its safety rules off; check-branch-classes.sh must go red.
TESTS="$TESTS check-branch-classes.sh"
MUT="$MUT"'
LR081 yes|product/tools/branch-classes.py|s/^    if o.delete and not o.yes:/    if False:/|check-branch-classes.sh
LR081 classes|product/tools/branch-classes.py|s/^    if bad:/    if False:/|check-branch-classes.sh
LR081 moved|product/tools/branch-classes.py|s/^        if now\[0\] != sha:/        if False:/|check-branch-classes.sh
LR081 open|product/tools/branch-classes.py|s/^    if any(p\[2\] == "open" for p in mine):/    if False:/|check-branch-classes.sh
LR081 sametip|product/tools/branch-classes.py|s/if any(p\[1\] == sha and p\[3\] for p in mine):/if any(p[3] for p in mine):/|check-branch-classes.sh
LR081 again|product/tools/branch-classes.py|s/^        if again not in want:/        if False:/|check-branch-classes.sh'
