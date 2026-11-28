# LR-099 (file named OS-0lr099.sh: check-guards-d.sh reads only OS-<digits>…; "LR-099" is the lab register row, lane
# automation-measures): the burn watch. Each row switches one rule of burn-watch.py (or its lead-watch step) off, so
# check-burn-watch.sh must then fail.
TESTS="$TESTS check-burn-watch.sh"   # LR-099: over 3%/h twice, night 4%/h, 85% push alert, stopped log, hourly logging
MUT="$MUT"'
LR099 twice|product/tools/burn-watch.py|s/rt\[-1\] > LIMIT and rt\[-2\] > LIMIT/rt[-1] > LIMIT/|check-burn-watch.sh
LR099 series|product/tools/burn-watch.py|s/if r\[2\] != head\[2\] or r\[1\] > head\[1\]:/if False:/|check-burn-watch.sh
LR099 gap|product/tools/burn-watch.py|s/>= GAP_MIN \* 60:/>= 0:/|check-burn-watch.sh
LR099 night|product/tools/burn-watch.py|s/(hour >= 22 or hour < 6)/True/|check-burn-watch.sh
LR099 stale|product/tools/burn-watch.py|s/if age > STALE_H:/if False:/|check-burn-watch.sh
LR099 due|product/tools/burn-watch.py|s/>= DUE_MIN \* 60:/>= 0:/|check-burn-watch.sh
LR099 step|product/tools/lead-watch.sh|s/^bw=\$(python3 -I "\$TOOLS\/burn-watch.py"/bw=$(true/|check-burn-watch.sh'
