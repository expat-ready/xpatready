# LR-142 (file named OS-0lr142.sh: check-guards-d.sh reads only OS-<digits>…; "LR-142" is the lab register row, lane
# automation-measures): the layer map with escape counts per layer. Each row switches one rule of escape-map.py off, so
# check-escape-map.sh must then fail.
TESTS="$TESTS check-escape-map.sh"   # LR-142: escapes (reverts, ci/nightly red episodes on main) counted per layer, page block
MUT="$MUT"'
LR142 attempts|product/tools/escape-map.py|s/tries = list(r.get("attempts") or \[\]) + \[r.get("conclusion")\]/tries = [r.get("conclusion")]/|check-escape-map.sh
LR142 schedule|product/tools/escape-map.py|s/if r.get("event") == "schedule" and r.get/if r.get/|check-escape-map.sh
LR142 green|product/tools/escape-map.py|s/        elif tries\[0\] == "success":/        elif "success" in tries:/|check-escape-map.sh
LR142 episode|product/tools/escape-map.py|s/            if not open_ep:/            if True:/|check-escape-map.sh
LR142 reached|product/tools/escape-map.py|s/                continue   # the reverted change came in with the revert/                pass   # the reverted change came in with the revert/|check-escape-map.sh
LR142 subject|product/tools/escape-map.py|s/not f\[2\].startswith(.Revert ".)/"Revert" not in f[2]/|check-escape-map.sh
LR142 layer|product/tools/escape-map.py|s/        elif r\[3\] not in names:/        elif False:/|check-escape-map.sh
LR142 known|product/tools/escape-map.py|s/        elif r\[0\] not in ids:/        elif False:/|check-escape-map.sh
LR142 twice|product/tools/escape-map.py|s/        elif r\[0\] in done:/        elif False:/|check-escape-map.sh
LR142 kind|product/tools/escape-map.py|s/        elif r\[1\] != ("revert" if/        elif False and r[1] != ("revert" if/|check-escape-map.sh
LR142 markers|product/tools/escape-map.py|s/if len(pat.findall(text)) != 1:/if False:/|check-escape-map.sh
LR142 header|product/tools/escape-map.py|s/if line.split("\\t")\[0\] != header:/if False:/|check-escape-map.sh
LR142 since|product/tools/escape-map.py|s/        datetime.strptime(since, "%Y-%m-%d")/        pass/|check-escape-map.sh
LR142 strict|product/tools/escape-map.py|s/return 1 if "--strict" in sys.argv and (unnamed or bad) else 0/return 0/|check-escape-map.sh'
