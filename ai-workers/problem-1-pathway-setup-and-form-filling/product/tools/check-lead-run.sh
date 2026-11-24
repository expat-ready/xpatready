#!/usr/bin/env bash
# A363 and A368 (founder 24 Nov: "how it can't happen in the future"): the Lead's tools are main's newest (lead-run.sh,
# tools-fresh.sh), its copy is under 24 h old (copy-age.sh), its plan is this cycle's (plan-fresh.py). Throwaway repos, a
# faked clock, no network, US$0.      bash product/tools/check-lead-run.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
[ -f "$TOOLS/lead-run.sh" ] || { ok "lead-run.sh is there (A363)" 0 "no file: the Lead's own branch decides which tools run"; finish; }
T=$(mktemp -d "${TMPDIR:-/tmp}/lr.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }
trap 'rm -rf "${T:?}"' EXIT
unset GIT_INDEX_FILE LEAD_RUN_ROOT; export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t GIT_CONFIG_GLOBAL=/dev/null LEAD_RUN_DIR="$T/run"
U="$T/up"; D="$PRODREL/tools"; has() { grep -qF -- "$1" <<<"$2" && echo 1; }
git init -q -b main "$U"; mkdir -p "$U/$D" "$U/$PRODREL/state" "$U/$PRODREL/design"
cp "$TOOLS"/{lead-run.sh,tools-fresh.sh,copy-age.sh,plan-fresh.py,founder-report.py,cycle-timeline.py,takeover.sh,items.py,lane-branches.sh,lane.sh,session-start.sh} "$U/$D/"
printf '#!/bin/bash\necho "OLD tools in $(pwd)"\n' > "$U/$D/show.sh"; echo 'current_lead: main-state' > "$U/$PRODREL/STATE.md"; echo '[]' > "$U/$PRODREL/state/items.json"
git -C "$U" add -A; GIT_COMMITTER_DATE="$(($(date +%s) - 172800)) +0000" git -C "$U" commit -qm two-days-ago
L="$T/lead"; git clone -q "$U" "$L" 2>/dev/null; git -C "$L" checkout -qb lead/old; echo 'current_lead: lead-state' > "$L/$PRODREL/STATE.md"; git -C "$L" commit -qam "lead record"
printf '#!/bin/bash\necho "NEW tools in $(pwd)"; head -1 "$(dirname "$0")/../STATE.md"; echo w > "$(dirname "$0")/../state/w"; bash "$(dirname "$0")/tools-fresh.sh"\n' > "$U/$D/show.sh"; git -C "$U" commit -qam new-tools
line() { (cd "$L" && git fetch -q origin main && git show "origin/main:$D/lead-run.sh" | bash -s -- "$@") 2>&1; }

o=$(cd "$L" && bash "$D/show.sh"); ok "before: the copy's own tool is the old one" "$(has 'OLD tools' "$o")" "$o"
o=$(line show.sh); ok "lead-run from an old copy runs main's newest tool" "$(has 'NEW tools' "$o")" "$o"
ok "... in the Lead's copy, with the Lead's STATE and state/, not main's" "$([ "$(has 'current_lead: lead-state' "$o")" = 1 ] && [ "$(has "in $(cd "$L" && pwd -P)" "$o")" = 1 ] && [ -f "$L/$PRODREL/state/w" ] && echo 1)" "$o"
ok "... and it can say whose tools they are (sha, time, main's head: yes)" "$(grep -qE "^tools  main $(git -C "$U" rev-parse --short=9 main), committed [0-9:]+ IST \([0-9]+ min old\), main's head at [0-9:]+ IST: yes$" <<<"$o" && echo 1)" "$o"
o=$(cd "$L" && bash "$TOOLS/tools-fresh.sh" 2>&1); r=$?; ok "a tool run from a working copy: ACT, exit 1" "$([ $r = 1 ] && has 'ACT   tools: not main' "$o")" "exit $r: $o"
sha=$(git -C "$U" rev-parse main); C="$T/run/$sha"
o=$(NOW=$(($(date +%s) + 700)) bash "$C/$D/tools-fresh.sh"); r=$?; ok "main fetched over 10 min ago: ACT" "$([ $r = 1 ] && has 'fetched 1' "$o")" "exit $r: $o"
echo '# x' >> "$C/$D/show.sh"; o=$(bash "$C/$D/tools-fresh.sh"); r=$?; ok "one tool file changed in the copy: ACT" "$([ $r = 1 ] && has 'a file in the tools was changed' "$o")" "exit $r: $o"; git -C "$C" checkout -q -- "$D/show.sh"
echo x > "$C/$D/extra.py"; o=$(bash "$C/$D/tools-fresh.sh"); r=$?; ok "a file added to the copy: ACT" "$([ $r = 1 ] && echo 1)" "exit $r: $o"
echo more > "$U/$D/more.txt"; git -C "$U" add -A; git -C "$U" commit -qm more; o=$(line show.sh); ok "main moved: the next run is from the new head" "$(has "main $(git -C "$U" rev-parse --short=9 main)" "$o")" "$o"
git -C "$L" remote set-url origin "$T/none"; o=$(cd "$L" && bash "$U/$D/lead-run.sh" show.sh 2>&1); r=$?; ok "the fetch fails: nothing is run, exit 3" "$([ $r = 3 ] && [ "$(has 'nothing was run' "$o")" = 1 ] && ! grep -q 'NEW tools' <<<"$o" && echo 1)" "exit $r: $o"
printf '#!/bin/bash\necho "gap ran $1"\n' > "$U/$D/lead-watch.sh"; git -C "$U" add -A; git -C "$U" commit -qm lw; git -C "$L" remote set-url origin "$U"; line lead-watch.sh 30 > /dev/null
git -C "$L" remote set-url origin "$T/none"; o=$(cd "$L" && bash "$U/$D/lead-run.sh" lead-watch.sh gap 2>&1); ok "lead-watch.sh gap runs with no fetch, from the newest copy there" "$([ "$o" = 'gap ran gap' ] && echo 1)" "$o"
o=$(cd "$L" && LEAD_RUN_DIR="$T/empty" bash "$U/$D/lead-run.sh" lead-watch.sh gap 2>&1); r=$?; ok "... and with none there it is an ACT" "$([ $r = 1 ] && has 'ACT   watchdog' "$o")" "$o"; git -C "$L" remote set-url origin "$U"
bad=""; for x in ../x a/b .x ''; do (cd "$L" && bash "$U/$D/lead-run.sh" "$x" >/dev/null 2>&1); [ $? = 2 ] || bad="$bad [$x]"; done; ok "only a file of product/tools can be named" "$([ -z "$bad" ] && echo 1)" "$bad"
for k in 1 2 3 4 5; do s=$(printf '%040d' $k); mkdir -p "$T/run/$s/.git"; echo $(($(date +%s) - 20000 - k)) > "$T/run/$s/.git/lead-run"; done; mkdir -p "$T/run/keep-me/.git" "$T/run/$(printf '%040d' 9)"; echo 1 > "$T/run/keep-me/.git/lead-run"
line show.sh >/dev/null; n=$(ls "$T/run" | grep -c '^0000.*[1-5]$'); ok "its own copies over 3 h old are removed (the newest 3 kept); a folder it did not make or name is left" "$([ "$n" = 0 ] && [ -d "$T/run/keep-me" ] && [ -d "$T/run/$(printf '%040d' 9)" ] && [ "$(ls -d "$T/run"/*/.git/lead-run | wc -l | tr -d ' ')" -ge 3 ] && echo 1)" "$n left: $(ls "$T/run")"

# the copy's age
o=$(cd "$L" && git fetch -q && bash "$TOOLS/copy-age.sh"); r=$?; ok "a copy whose newest main commit is 48 h old: exit 1, its age and how far behind" "$([ $r = 1 ] && has 'is 48 h old' "$o")" "exit $r: $o"
git clone -q "$U" "$T/new" 2>/dev/null; o=$(cd "$T/new" && bash "$TOOLS/copy-age.sh"); r=$?; ok "a fresh copy: exit 0" "$([ $r = 0 ] && has 'is 0 h old' "$o")" "exit $r: $o"
o=$(cd "$T/new" && NOW=$(($(git -C "$U" log -1 --format=%ct) + 86400)) bash "$TOOLS/copy-age.sh"); r=$?; ok "24 h to the second is over" "$([ $r = 1 ] && echo 1)" "exit $r: $o"
git init -q "$T/lone"; o=$(cd "$T/lone" && bash "$TOOLS/copy-age.sh"); r=$?; ok "no origin/main: not readable, exit 2, never 'fresh'" "$([ $r = 2 ] && echo 1)" "exit $r: $o"
o=$(line takeover.sh); r=$?; ok "takeover.sh refuses a copy over 24 h old and names the step" "$([ $r = 3 ] && has 'REFUSED: this copy left main' "$o")" "exit $r: $o"
git -C "$L" checkout -qb lead/today origin/main; o=$(line takeover.sh); r=$?; ok "... and takes over in a fresh one" "$([ $r = 0 ] && has 'lead  main-state' "$o")" "exit $r: $o"
ss() { jq -n --arg d "$1" '{cwd:$d}' | (cd "$1" && bash "$TOOLS/session-start.sh") 2>/dev/null | jq -r '.hookSpecificOutput.additionalContext' | head -4; }
cp "$TOOLS/session-start.sh" "$TOOLS/copy-age.sh" "$T/new/$D/"
git -C "$T/new" checkout -qb screens/x; o=$(ss "$T/new"); ok "session-start.sh says every copy's age against origin/main (a builder's here)" "$(has 'newest main commit it holds is 0 h old' "$o")" "$o"
git -C "$L" checkout -q lead/old; cp "$TOOLS/copy-age.sh" "$L/$D/"; o=$(ss "$L"); w='is 48 h old'; [ "$(uname)" = Darwin ] && w='OVER 24 h'; ok "... and an old Lead copy's is named as such (the Mac; elsewhere its age)" "$(has "$w" "$o")" "$o"

# the plan
pl() { printf '%s' "$1" > "$T/plan.json"; python3 -I "$TOOLS/plan-fresh.py" --plan "$T/plan.json" --now "$2"; }
o=$(pl '{"cycle_start":"2026-11-21"}' 2026-11-24T09:00:00+05:30); r=$?; ok "the 21 Nov plan on 24 Nov: ACT" "$([ $r = 1 ] && has 'is of 2026-11-21, this cycle is 2026-11-24' "$o")" "$o"
o=$(pl '{"cycle_start":"2026-11-24"}' 2026-11-25T06:59:00+05:30); r=$?; ok "06:59 the next morning is still the same cycle" "$([ $r = 0 ] && echo 1)" "$o"
o=$(pl '{"cycle_start":"2026-11-24"}' 2026-11-25T07:00:00+05:30); r=$?; ok "... and 07:00 is not" "$([ $r = 1 ] && echo 1)" "$o"
nb=""; for b in '' '[]' '{}' '{"cycle_start":7}' '{"cycle_start":"soon"}'; do o=$(pl "$b" 2026-11-24T09:00:00+05:30); [ $? = 1 ] && grep -q '^ACT   plan: cycle-plan.json unreadable' <<<"$o" || nb="$nb [$b]"; done; ok "an unreadable plan is an ACT" "$([ -z "$nb" ] && echo 1)" "$nb"
o=$(cd "$L" && python3 -I "$TOOLS/founder-report.py" --needs nothing 2>&1); r=$?; ok "founder-report.py from a working copy prints no report, exit 2" "$([ $r = 2 ] && [ "$(has 'NO REPORT. ACT   tools' "$o")" = 1 ] && ! grep -q 'Proven this cycle' <<<"$o" && echo 1)" "exit $r: $o"
grep -q 'stale = not a.fixture and plan is not None and not plan_fresh' "$TOOLS/founder-report.py" && grep -q 'or stale else proven + coming' "$TOOLS/founder-report.py"; ok "founder-report.py gives no forecast from another cycle's plan" "$([ $? = 0 ] && echo 1)"

# lead-watch.sh: the block before everything else, cut out and run
W="$TOOLS/lead-watch.sh"; sed -n '/^# 00\. /,/^say "time  /p' "$W" | grep -v '^say "time' > "$T/block.sh"; first=$(grep -nE '^# [0-9]+[a-z]?\. ' "$W" | head -1)
ok "it is lead-watch.sh's first section" "$(has '# 00. ' "$first")" "$first"
blk() { mkdir -p "$T/b"; printf 'echo "%s"; exit %s\n' "$1" "$2" > "$T/b/tools-fresh.sh"; printf 'echo "%s"; exit %s\n' "$3" "$4" > "$T/b/copy-age.sh"; printf 'print("%s")\n' "$5" > "$T/b/plan-fresh.py"
  ( cd "$L"; TOOLS="$T/b"; act=0; seen() { :; }; say() { echo "$1"; }; fresh() { :; }; . "$T/block.sh"; echo "acts=$act" ) 2>&1; }
o=$(blk 'tools  ok' 0 'copy   ok' 0 'plan   ok'); ok "all three right: three lines, no ACT" "$(has 'acts=0' "$o")" "$o"
o=$(blk 'ACT   tools: x' 1 'copy   old' 1 'ACT   plan: y'); ok "all three wrong: the first three lines are the ACTs" "$([ "$(has 'acts=3' "$o")" = 1 ] && [ "$(head -3 <<<"$o" | grep -c '^ACT')" = 3 ] && has 'start a fresh lead/<today>' "$o")" "$o"
o=$(blk '' 0 'copy   none' 2 'Traceback'); ok "a check that says nothing, an age that cannot be read and a plan check that died are ACTs" "$(has 'acts=3' "$o")" "$o"
finish
