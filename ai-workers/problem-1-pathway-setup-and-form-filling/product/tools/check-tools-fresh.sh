#!/usr/bin/env bash
# A363 and A368 (founder 24 Nov: "how it can't happen in the future"): the Lead's tools are main's newest, file by file
# (tools-fresh.py), its copy is under 24 h old (copy-age.sh), its plan is this cycle's (plan-fresh.py). Throwaway repos, a
# faked clock, no network, US$0.      bash product/tools/check-tools-fresh.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
[ -f "$TOOLS/tools-fresh.py" ] || { ok "tools-fresh.py is there (A363)" 0 "no file: a copy's old tools run and nothing says so"; finish; }
T=$(mktemp -d "${TMPDIR:-/tmp}/tf.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }
trap 'rm -rf "${T:?}"' EXIT
unset GIT_INDEX_FILE; export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t GIT_CONFIG_GLOBAL=/dev/null TOOLS_FRESH_FEW=1
U="$T/up"; D="$PRODREL/tools"; has() { grep -qF -- "$1" <<<"$2" && echo 1; }
DAY=86400; NOWT=$(date +%s); at() { GIT_AUTHOR_DATE="$1 +0000" GIT_COMMITTER_DATE="$1 +0000" git -C "$U" commit -qm "$2"; }
git init -q -b main "$U"; mkdir -p "$U/$D" "$U/$PRODREL/state" "$U/$PRODREL/design"
cp "$TOOLS"/{tools-fresh.py,copy-age.sh,plan-fresh.py,founder-report.py,cycle-timeline.py,takeover.sh,items.py,lane-branches.sh,lane.sh,session-start.sh} "$U/$D/"
printf 'echo OLD\n' > "$U/$D/callee.sh"; printf '. "$(dirname "$0")/callee.sh"\n' > "$U/$D/caller.sh"; echo gone > "$U/$D/gone.sh"; echo 'current_lead: main-state' > "$U/$PRODREL/STATE.md"; echo '[]' > "$U/$PRODREL/state/items.json"
git -C "$U" add -A; at $((NOWT - 2 * DAY)) two-days-ago
L="$T/lead"; git clone -q "$U" "$L" 2>/dev/null; git -C "$L" checkout -qb lead/old; echo rec >> "$L/$PRODREL/STATE.md"; git -C "$L" commit -qam "lead record"
tf() { python3 -I "$L/$D/tools-fresh.py" 2>&1; }
fix() { sed -nE 's/.*Run: (git restore [^;|&]*)$/\1/p' <<<"$1"; }
state() { git -C "$L" rev-parse HEAD; git -C "$L" for-each-ref refs/heads; git -C "$L" ls-files -s | git hash-object --stdin; find "$L/.git" -maxdepth 1 -name FETCH_HEAD -exec cat {} +; }

o=$(tf); r=$?; ok "the same files as main: yes, exit 0, main's sha, time and age" "$([ $r = 0 ] && grep -qE "^tools  main $(git -C "$U" rev-parse --short=9 main), committed .* IST \([0-9]+ min old\): this copy's [0-9]+ files are the same$" <<<"$o" && echo 1)" "exit $r: $o"
printf 'echo NEW\n' > "$U/$D/callee.sh"; git -C "$U" add -A; at $((NOWT - 60)) new-callee
before=$(state); o=$(tf); r=$?; ok "one changed tool on main (called by another, which did not change): ACT, exit 1, named" "$([ $r = 1 ] && grep -q '^ACT   tools: not main' <<<"$o" && grep -qF 'old 1 (callee.sh)' <<<"$o" && bash "$L/$D/caller.sh" | grep -q OLD && echo 1)" "exit $r: $o"
ok "the check changed no branch, HEAD, index or FETCH_HEAD" "$([ "$before" = "$(state)" ] && echo 1)" "changed"
c=$(fix "$o"); ok "the printed line pins that sha and stages nothing" "$(grep -qE "^git restore --overlay --source=$(git -C "$U" rev-parse main) --worktree -- $D$" <<<"$c" && echo 1)" "$c"
(cd "$L" && eval "$c"); o=$(tf); r=$?; ok "... and after it: yes, the caller runs the new tool, nothing is staged" "$([ $r = 0 ] && bash "$L/$D/caller.sh" | grep -q NEW && [ -z "$(git -C "$L" diff --cached --name-only)" ] && echo 1)" "exit $r: $o"
printf 'echo NEWER\n' > "$U/$D/callee.sh"; git -C "$U" add -A; at $((NOWT - 50)) newer; o=$(tf); ok "main moves on: an unstaged older main's file is old, not an edit" "$([ "$(has 'old 1 (callee.sh)' "$o")" = 1 ] && ! grep -q edited <<<"$o" && echo 1)" "$o"
echo new > "$U/$D/more.sh"; git -C "$U" add -A; at $((NOWT - 40)) more; o=$(tf); r=$?; ok "one missing tool: ACT" "$([ $r = 1 ] && has 'missing 1 (more.sh)' "$o")" "$o"
git -C "$U" rm -q "$D/gone.sh"; at $((NOWT - 30)) gone; echo mine > "$L/$D/mine.sh"; (cd "$L" && eval "$(fix "$(tf)")"); o=$(tf); r=$?
ok "extra files (one main deleted, one only here): named, left where they are, not an ACT" "$([ $r = 0 ] && has 'left as they are: 2 (gone.sh, mine.sh)' "$o" >/dev/null && [ -f "$L/$D/gone.sh" ] && [ -f "$L/$D/mine.sh" ] && echo 1)" "exit $r: $o"
echo '# my change' >> "$L/$D/caller.sh"; o=$(tf); r=$?; ok "a tool edited here: ACT, named, and no line is printed" "$([ $r = 1 ] && [ "$(has 'edited here 1 (caller.sh)' "$o")" = 1 ] && [ -z "$(fix "$o")" ] && ! grep -q 'git restore' <<<"$o" && echo 1)" "exit $r: $o"; git -C "$L" restore "$D/caller.sh"
echo theirs > "$U/$D/mine.sh"; git -C "$U" add -A; at $((NOWT - 20)) mine; o=$(tf); ok "an untracked file that main now has too, not the same: edited, no line" "$([ "$(has 'edited here 1 (mine.sh)' "$o")" = 1 ] && ! grep -q 'git restore' <<<"$o" && echo 1)" "$o"
git -C "$L" remote set-url origin "$T/none"; o=$(tf); r=$?; ok "the fetch fails: unknown, an ACT, exit 2, never yes" "$([ $r = 2 ] && has 'ACT   tools: unknown' "$o")" "exit $r: $o"
git -C "$L" remote set-url origin "$U"; o=$(TOOLS_FRESH_FEW='' python3 -I "$L/$D/tools-fresh.py" 2>&1); ok "with the real floor, this small tree still reads (over 10 tools)" "$(grep -q '^ACT   tools: not main' <<<"$o" && echo 1)" "$o"
E1="$T/e"; git clone -q "$U" "$E1" 2>/dev/null; git -C "$U" checkout -q -b empty; git -C "$U" rm -rq "$D"; git -C "$U" commit -qm none; o=$(git -C "$E1" remote set-url origin "$T/up2"; git clone -q --bare "$U" "$T/up2" 2>/dev/null; git -C "$T/up2" update-ref refs/heads/main "$(git -C "$U" rev-parse empty)"; unset TOOLS_FRESH_FEW; python3 -I "$E1/$D/tools-fresh.py" 2>&1); ok "a main with no tools (a partial read) is unknown" "$(has 'ACT   tools: unknown' "$o")" "$o"; git -C "$U" checkout -q main

# the copy's age
age() { (cd "$1" && bash "$TOOLS/copy-age.sh"); }
git -C "$L" fetch -q; o=$(age "$L"); r=$?; ok "a copy whose newest main commit is 48 h old: exit 1, its age and what it misses" "$([ $r = 1 ] && has 'is 48 h old' "$o")" "exit $r: $o"
git clone -q "$U" "$T/new" 2>/dev/null; o=$(age "$T/new"); r=$?; ok "a copy that holds all of main: exit 0" "$([ $r = 0 ] && has 'holds all of origin/main' "$o")" "exit $r: $o"
o=$(NOW=$((NOWT + 14 * DAY)) age "$T/new"); r=$?; ok "... however quiet main has been" "$([ $r = 0 ] && echo 1)" "exit $r: $o"
git -C "$U" merge -q --no-ff -m "records PR" "$(git -C "$U" fetch -q "$L" lead/old && git -C "$U" rev-parse FETCH_HEAD)" 2>/dev/null; echo r > "$U/rule"; git -C "$U" add -A; at "$NOWT" rule; git -C "$L" fetch -q; o=$(age "$L"); r=$?; ok "the Lead's own records merged into main do not make its copy fresh" "$([ $r = 1 ] && has 'is 48 h old' "$o")" "exit $r: $o"
o=$(NOW=$((NOWT - 2 * DAY + DAY)) age "$L"); r=$?; ok "24 h to the second is over" "$([ $r = 1 ] && echo 1)" "exit $r: $o"
o=$(NOW=$((NOWT - 3 * DAY)) age "$L"); r=$?; ok "a commit dated after the clock: not readable, exit 2" "$([ $r = 2 ] && echo 1)" "exit $r: $o"
git init -q "$T/lone"; o=$(age "$T/lone"); r=$?; ok "no origin/main: not readable, exit 2, never 'fresh'" "$([ $r = 2 ] && echo 1)" "exit $r: $o"
for f in takeover.sh copy-age.sh tools-fresh.py; do cp "$TOOLS/$f" "$L/$D/"; done
o=$(cd "$L" && bash "$D/takeover.sh" 2>&1); r=$?; ok "takeover.sh refuses a copy over 24 h old, names the step, and goes no further" "$([ $r = 3 ] && [ "$(has 'REFUSED: this copy left main' "$o")" = 1 ] && ! grep -q '^lead  ' <<<"$o" && echo 1)" "exit $r: $o"
git -C "$L" checkout -qf -b lead/today origin/main; o=$(cd "$L" && bash "$D/takeover.sh" 2>&1); r=$?; ok "... and takes over in a fresh one" "$([ $r = 0 ] && has 'lead  main-state' "$o")" "exit $r: $o"
ss() { jq -n --arg d "$1" '{cwd:$d}' | (cd "$1" && bash "$TOOLS/session-start.sh") 2>/dev/null | jq -r '.hookSpecificOutput.additionalContext' | head -4; }
git -C "$T/new" checkout -qb screens/x; o=$(ss "$T/new"); ok "session-start.sh says every copy's age against origin/main (a builder's here)" "$(has 'copy   ' "$o")" "$o"
git -C "$L" checkout -qf lead/old; cp "$TOOLS/copy-age.sh" "$L/$D/"; o=$(ss "$L"); w='is 48 h old'; [ "$(uname)" = Darwin ] && w='OVER 24 h'; ok "... and an old Lead copy's is named as such (the Mac; elsewhere its age)" "$(has "$w" "$o")" "$o"

# the plan
pl() { printf '%s' "$1" > "$T/plan.json"; python3 -I "$TOOLS/plan-fresh.py" --plan "$T/plan.json" --now "$2"; }
o=$(pl '{"cycle_start":"2026-11-21"}' 2026-11-24T09:00:00+05:30); r=$?; ok "the 21 Nov plan on 24 Nov: ACT" "$([ $r = 1 ] && has 'is of 2026-11-21, this cycle is 2026-11-24' "$o")" "$o"
o=$(pl '{"cycle_start":"2026-11-24"}' 2026-11-25T06:59:00+05:30); r=$?; ok "06:59 the next morning is still the same cycle" "$([ $r = 0 ] && echo 1)" "$o"
o=$(pl '{"cycle_start":"2026-11-24"}' 2026-11-25T07:00:00+05:30); r=$?; ok "... and 07:00 is not" "$([ $r = 1 ] && echo 1)" "$o"
nb=""; for b in '' '[]' '{}' '{"cycle_start":7}' '{"cycle_start":"soon"}'; do o=$(pl "$b" 2026-11-24T09:00:00+05:30); [ $? = 1 ] && grep -q '^ACT   plan: cycle-plan.json unreadable' <<<"$o" || nb="$nb [$b]"; done; ok "an unreadable plan is an ACT" "$([ -z "$nb" ] && echo 1)" "$nb"
o=$(cd "$L" && python3 -I "$TOOLS/founder-report.py" --needs nothing 2>&1); r=$?; ok "founder-report.py from a working copy prints no report, exit 2" "$([ $r = 2 ] && [ "$(has 'NO REPORT. ACT   tools' "$o")" = 1 ] && ! grep -q 'Proven this cycle' <<<"$o" && echo 1)" "exit $r: $o"
fr() { python3 -I - "$TOOLS" "$1" <<'PY'
import importlib.util, os, sys
spec = importlib.util.spec_from_file_location("fr", os.path.join(sys.argv[1], "founder-report.py")); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.caps_at = lambda w: "| R1.1 | 1 A | Who | Partial | n |\n"; m.LiveGitHub = type("G", (), {"pull": lambda s, n: {}})
m.CT.read_capabilities = lambda p: ("| R1.1 | 1 A | Who | Partial | n |\n", "x"); m.CT.parse_capabilities = lambda t: {"R1.1": {"status": "Partial", "name": "A"}}; m.board = lambda *a: ([""], 3)
a = type("A", (), dict(now="2026-11-24T09:00:00+05:30", needs=["nothing"], capabilities=None, capabilities_at_start=None, plan=sys.argv[2], fixture=None, short=True, since=[], stage=None, constraint=None))
print(m.report(a))
PY
}
echo '{"cycle_start":"2026-11-24","rows":[]}' > "$T/p.json"; o=$(fr "$T/p.json"); ok "founder-report.py with this cycle's plan gives its forecast (3 / 15)" "$(grep -q 'Forecast by 07:00  3 / 15' <<<"$o" && echo 1)" "$o"
echo '{"cycle_start":"2026-11-21","rows":[]}' > "$T/p.json"; o=$(fr "$T/p.json"); ok "... with the 21 Nov plan: no forecast, and it says whose plan it is" "$(grep -q 'Forecast by 07:00  unknown' <<<"$o" && grep -q '🔴 The plan is of 2026-11-21' <<<"$o" && echo 1)" "$o"

# lead-watch.sh: the block before everything else, cut out and run
W="$TOOLS/lead-watch.sh"; sed -n '/^# 00\. /,/^say "time  /p' "$W" | grep -v '^say "time' > "$T/block.sh"; first=$(grep -nE '^# [0-9]+[a-z]?\. ' "$W" | head -1)
ok "it is lead-watch.sh's first section" "$(has '# 00. ' "$first")" "$first"
blk() { mkdir -p "$T/b"; printf 'import sys; print("%s"); sys.exit(%s)\n' "$1" "$2" > "$T/b/tools-fresh.py"; printf 'echo "%s"; exit %s\n' "$3" "$4" > "$T/b/copy-age.sh"; printf 'print("%s")\n' "$5" > "$T/b/plan-fresh.py"
  ( cd "$L"; TOOLS="$T/b"; act=0; seen() { :; }; say() { echo "$1"; }; fresh() { :; }; . "$T/block.sh"; echo "acts=$act" ) 2>&1; }
o=$(blk 'tools  ok' 0 'copy   ok' 0 'plan   ok'); ok "all three right: three lines, no ACT" "$(has 'acts=0' "$o")" "$o"
o=$(blk 'ACT   tools: x' 1 'copy   old' 1 'ACT   plan: y'); ok "all three wrong: the first three lines are the ACTs" "$([ "$(has 'acts=3' "$o")" = 1 ] && [ "$(head -3 <<<"$o" | grep -c '^ACT')" = 3 ] && has 'start a fresh lead/<today>' "$o")" "$o"
o=$(blk '' 0 'copy   none' 2 'Traceback'); ok "a check that says nothing, an age that cannot be read and a plan check that died are ACTs" "$(has 'acts=3' "$o")" "$o"
finish
