# LR-081 (sources FP #87, #143; CU:7.4; OS-14): branch-classes.py, the branch report and its guarded removal.
# Each row switches one of its safety rules off; check-branch-classes.sh must go red.
TESTS="$TESTS check-branch-classes.sh"
MUT="$MUT"'
LR081 yes|product/tools/branch-classes.py|s/^    if o.delete and not o.yes:/    if False:/|check-branch-classes.sh
LR081 classes|product/tools/branch-classes.py|s/^    if bad:/    if False:/|check-branch-classes.sh
LR081 moved|product/tools/branch-classes.py|s/^        if now\[0\] != sha:/        if False:/|check-branch-classes.sh
LR081 open|product/tools/branch-classes.py|s/^    if any(p\[2\] == "open" for p in mine):/    if False:/|check-branch-classes.sh
LR081 sametip|product/tools/branch-classes.py|s/^    if any(p\[1\] == sha for p in into_main):/    if into_main:/|check-branch-classes.sh
LR081 base|product/tools/branch-classes.py|s/ and len(p) > 4 and p\[4\] == "main"\]/]/|check-branch-classes.sh
LR081 lease|product/tools/branch-classes.py|s/\["push", "--force-with-lease=refs\/heads\/%s:%s" % (b, sha), /["push", /|check-branch-classes.sh
LR081 origin|product/tools/branch-classes.py|s/^        if not url.rstrip/        if False and not url.rstrip/|check-branch-classes.sh
LR081 failed|product/tools/branch-classes.py|s/^    return 1 if failed else 0/    return 0/|check-branch-classes.sh
LR081 again|product/tools/branch-classes.py|s/^        if again not in want:/        if False:/|check-branch-classes.sh'
