# LR-142 (file named OS-0lr142.sh: check-guards-d.sh reads only OS-<digits>…; "LR-142" is the lab register row, lane
# automation-measures): the layer map with escape counts per layer. Each row switches one rule of escape-map.py off, so
# check-escape-map.sh must then fail.
TESTS="$TESTS check-escape-map.sh"   # LR-142: escapes (reverts, ci/nightly red episodes on main) counted per layer, page block
MUT="$MUT"'
LR142 episode|product/tools/escape-map.py|s/if c == "failure" and open_ep is None:/if c == "failure":/|check-escape-map.sh
LR142 green|product/tools/escape-map.py|s/            elif c == "success":/            elif c != "failure":/|check-escape-map.sh
LR142 revert|product/tools/escape-map.py|s/f\[2\].startswith(.Revert ".)/"Revert" in f[2]/|check-escape-map.sh
LR142 layer|product/tools/escape-map.py|s/        if r\[3\] not in names:/        if False:/|check-escape-map.sh
LR142 known|product/tools/escape-map.py|s/        elif r\[0\] not in ids:/        elif False:/|check-escape-map.sh
LR142 markers|product/tools/escape-map.py|s/if len(pat.findall(text)) != 1:/if False:/|check-escape-map.sh
LR142 strict|product/tools/escape-map.py|s/return 1 if "--strict" in sys.argv and (unnamed or bad) else 0/return 0/|check-escape-map.sh'
