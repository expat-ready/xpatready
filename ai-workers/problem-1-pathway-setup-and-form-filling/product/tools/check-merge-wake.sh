#!/usr/bin/env bash
# Wake on merge (24 Nov): merge-wake.py, the ACT line for a pull request whose waits are all on main. Pass and fail case for
# each rule, on a made-up repository, PR list and app view. US$0, no network.   bash product/tools/check-merge-wake.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/mw.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
R="$T/r"; g() { git -C "$R" -c user.email=t@t -c user.name=t -c commit.gpgsign=false "$@"; }
at() { GIT_COMMITTER_DATE="$1 +0530" GIT_AUTHOR_DATE="$1 +0530" g "${@:2}"; }
git init -q -b main "$R"; echo 0 > "$R/f"; g add -A; at '2026-11-24 08:00' commit -qm x
br() { g checkout -q -b "$1" main; echo "$1" > "$R/${1//\//-}"; g add -A; at "$2" commit -qm w; g update-ref "refs/remotes/origin/$1" "$1"; g checkout -q main; }
merge() { at "$3" merge -q --no-ff -m "Merge pull request #$2 from o/$1" "$1"; g update-ref refs/remotes/origin/main main; }
br a '2026-11-24 09:00'; br b '2026-11-24 09:00'; br c/waits '2026-11-24 09:30'; br late '2026-11-24 12:00'
merge a 101 '2026-11-24 10:00'; merge b 102 '2026-11-24 11:00'
NOW=$(python3 -c 'import datetime as d; print(int(d.datetime(2026,11,24,11,30,tzinfo=d.timezone(d.timedelta(hours=5,minutes=30))).timestamp()))')
printf '%s\n' 'read epoch 1' 'app view 3 sessions · rows=3' 'FLAG  Lane Seven · cloud · review_ready · needs: none · #207 waits · idle 41 min · context ? -> idle' 'ok    Lane C · mac · working · needs: none · on c/waits · idle 2 min · context ?' > "$T/av"
pr() { python3 -I -c 'import json,sys; n,h,b=sys.argv[1:]; print(json.dumps({"number":int(n),"headRefName":h,"title":"t","body":b,"isDraft":True}))' "$@"; }
run() { printf '[%s]' "$(IFS=,; echo "$*")" > "$T/p.json"; o=$(python3 -I "$TOOLS/merge-wake.py" --prs "$T/p.json" --repo "$R" --app-view "$T/av" --now "$NOW" 2>&1); }
has() { grep -qF -- "$1" <<<"$o" && echo 1; }; acts() { grep -c '^ACT' <<<"$o"; }
X=$(pr 300 zz 'no waits')
run "$X" "$(pr 207 c/waits $'Why\nWaits on: #101\nMore')"
ok "fail: its one wait is on main: one ACT with the lane, the minutes and the words to type" "$([ "$(acts)" = 1 ] && has 'ACT   wake: #101 on main since 24 Nov 10:00 IST (90 min); #207 waited: Lane Seven (cloud, idle 41 min). Type: "#101 is on main: merge main once and go on with #207"')" "$o"
ok "the summary counts the waiting and the ready, and the merges of the last hour" "$(has 'wake  1 of 2 open pull requests say what they wait on, 1 may go on; 1 merges in the last hour')" "$o"
run "$X" "$(pr 208 c/waits 'Stacked on: #101, #102')"; ok "fail: both on main, the later merge counts, the lane found by its branch" "$([ "$(acts)" = 1 ] && has '#101 #102 on main since 24 Nov 11:00 IST (30 min); #208 waited: Lane C (mac, idle 2 min). Type: "#101 #102 are on main')" "$o"
run "$X" "$(pr 209 c/waits 'Waits on: #101 and #300')"; ok "pass: one of two still open" "$([ "$(acts)" = 0 ] && has '0 may go on')" "$o"
run "$X" "$(pr 210 late 'Waits on: #101')"; ok "pass: a commit after the merge" "$([ "$(acts)" = 0 ] && echo 1)" "$o"
run "$X" "$(pr 211 c/waits 'Waits on: #101, #999')"; ok "fail: a wait that is neither open nor merged is its own ACT, and no wake" "$([ "$(acts)" = 1 ] && has 'ACT   wake: #211 waits on #999, neither open nor merged')" "$o"
run "$X" "$(pr 212 gone 'Waits on: #101')"; ok "fail: a branch that is not here is said" "$([ "$(acts)" = 1 ] && has 'its branch gone is not in this copy')" "$o"
run "$X" "$(pr 213 c/waits 'Waits on: #213')"; ok "pass: waiting on itself is no wait" "$([ "$(acts)" = 0 ] && has '0 of 2 open')" "$o"
for b in '**Waits on:** #101' '- Waits on: #101.' 'waits on : #101' '**Stacked on: #101**'; do run "$X" "$(pr 214 c/waits "$b")"; ok "fail: '$b' is read" "$(has '#214 waited')" "$o"; done
for b in 'This waits on: #101 to land' 'Waits on: FO-7b and #101' 'Waits on: #101 after review' '> Waits on: #101' 'Waits on: none' 'Waits on #101' $'```\nWaits on: #101\n```' $'````\n```\nWaits on: #101\n````' $'<!--\nWaits on: #101\n-->' $'Waits on:\n#101'; do run "$X" "$(pr 215 c/waits "$b")"; ok "pass: '$(head -1 <<<"$b")' is no wait line" "$([ "$(acts)" = 0 ] && has '0 of 2 open')" "$o"; done
o=$(AV="$T/av" python3 -I -c 'import importlib.util as u,sys,os; f=sys.argv[1]; sys.argv=["x","--prs","/nope"]; s=u.spec_from_file_location("m",f); m=u.module_from_spec(s); s.loader.exec_module(m); v=open(os.environ["AV"]).read(); print(m.lane(v,20,"c"))' "$TOOLS/merge-wake.py"); ok "#20 is not #207, branch c is not c/waits" "$(has 'lane not found in the app view')" "$o"
mv "$T/av" "$T/av2"; run "$X" "$(pr 207 c/waits 'Waits on: #101')"; ok "no app view: the wake stands, the lane is said to be not found" "$([ "$(acts)" = 1 ] && has 'lane not found in the app view')" "$o"
for j in '' '{}' '[]'; do printf '%s' "$j" > "$T/p.json"; o=$(python3 -I "$TOOLS/merge-wake.py" --prs "$T/p.json" --repo "$R" 2>&1); ok "fail: a PR list of '$j' is an ACT" "$(has 'ACT   wake: not read')" "$o"; done
o=$(printf '[%s]' "$X" > "$T/p.json"; python3 -I "$TOOLS/merge-wake.py" --prs "$T/p.json" --repo "$R" --ref nope 2>&1); ok "fail: an unreadable main is an ACT" "$(has 'ACT   wake: not read')" "$o"
sed -n '/^# 4b\. Wake on merge/,/^$/p' "$TOOLS/lead-watch.sh" > "$T/step.sh"; mkdir "$T/l"
step() { printf 'print("""%s""")\n' "$1" > "$T/l/merge-wake.py"; o=$( ( TOOLS="$T/l"; STATE_DIR="$T/s"; act=0; ACT() { act=$((act + 1)); echo "ACT   $1"; }; seen() { echo "seen: $1"; }; fresh() { :; }; . "$T/step.sh"; echo "acts=$act" ) 2>&1 ); }
step 'wake  0'; ok "lead-watch.sh prints its line and hands it on, no ACT counted" "$([ "$(has 'seen: wake  0')" = 1 ] && has 'acts=0')" "$o"
step 'ACT   wake: x'; ok "lead-watch.sh counts its ACT line" "$(has 'acts=1')" "$o"
step Traceback; ok "fail: a merge-wake.py that dies is an ACT" "$(has 'ACT   wake: merge-wake.py did not run')" "$o"
a=$(grep -n '^# 4b\. Wake on merge' "$TOOLS/lead-watch.sh" | cut -d: -f1); b=$(grep -n '^git fetch -q origin 2' "$TOOLS/lead-watch.sh" | tail -1 | cut -d: -f1); c=$(grep -n 'prs-body.json" 2>/dev/null' "$TOOLS/lead-watch.sh" | head -1 | cut -d: -f1)
ok "the step comes after the fetch and after step 2b wrote the PR list" "$([ -n "$a" ] && [ "$a" -gt "$b" ] && [ "$a" -gt "$c" ] && echo 1)" "step $a fetch $b prs $c"
finish
