# LR-171 (file named OS-0lr171.sh: check-guards-d.sh reads only OS-<digits>…; founder A455, 28 Nov): a lane in STATE "Lanes
# running" with no session activity and no push over 90 min is an ACT in lead-watch.
TESTS="$TESTS check-lane-start-watch.sh"   # LR-171: lane-start watch
MUT="$MUT"'
LR171 max|product/tools/lane-start-watch.py|s/        elif min(seen) > o.max:/        elif False:/|check-lane-start-watch.sh
LR171 push|product/tools/lane-start-watch.py|s/        seen = \[x for x in (s, pa) if x is not None\]/        seen = [x for x in (s,) if x is not None]/|check-lane-start-watch.sh
LR171 age|product/tools/lane-start-watch.py|s/idle\[s.group(1)\] = int(i.group(1)) + age/idle[s.group(1)] = int(i.group(1))/|check-lane-start-watch.sh
LR171 missing|product/tools/lane-start-watch.py|s/        elif not seen:/        elif False:/|check-lane-start-watch.sh
LR171 watch|product/tools/lead-watch.sh|s/^echo "\$lsw"; act=/echo "$lsw"; : act=/|check-lane-start-watch.sh
LR171 id|product/tools/app-view.js|s/\.concat(clean(s\.id/.concat(false \&\& clean(s.id/|check-lane-start-watch.sh'
