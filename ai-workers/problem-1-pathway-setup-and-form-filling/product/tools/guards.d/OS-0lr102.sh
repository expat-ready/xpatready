# LR-102 (file named OS-0lr102.sh: check-guards-d.sh reads only OS-<digits>…; "LR-102" is the lab register row, lane
# automation-measures): lab progress per lane counted from the register's row status. Each row switches one rule of
# lab-progress.py off, so check-lab-progress.sh must then fail.
TESTS="$TESTS check-lab-progress.sh"   # LR-102: per-lane Intended/Built/Proven from the register, the factory page block
MUT="$MUT"'
LR102 drop|product/tools/lab-progress.py|s/c\[4\].startswith(("DROP", "MERGED-INTO"))/False/|check-lab-progress.sh
LR102 total|product/tools/lab-progress.py|s/^        tot\[g\] += 1$/        tot[g] += 2/|check-lab-progress.sh
LR102 pending|product/tools/lab-progress.py|s/ and not status.startswith("Built pending")//|check-lab-progress.sh
LR102 markers|product/tools/lab-progress.py|s/if len(pat.findall(html)) != 1:/if False:/|check-lab-progress.sh
LR102 log|product/tools/lab-progress.py|s/^if not arg("--register"):   #/if True:   #/|check-lab-progress.sh'
