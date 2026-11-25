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
br a '2026-11-24 09:00'; br b '2026-11-24 09:00'; br c/waits '2026-11-24 09:30'; br late '2026-11-24 09:30'
br qa '2026-11-24 09:30'; merge a 101 '2026-11-24 10:00'; merge b 102 '2026-11-24 11:00'
g checkout -q late; at '2026-11-24 11:10' merge -q --no-ff -m 'main in' main; g update-ref refs/remotes/origin/late late
g checkout -q qa; echo q > "$R/q"; g add -A; at '2026-11-24 11:20' commit -qm 'a later commit without main'; g update-ref refs/remotes/origin/qa qa; g checkout -q main
NOW=$(python3 -c 'import datetime as d; print(int(d.datetime(2026,11,24,11,30,tzinfo=d.timezone(d.timedelta(hours=5,minutes=30))).timestamp()))')
printf '%s\n' 'read epoch 1' 'app view 3 sessions · rows=3' 'FLAG  Lane Seven · cloud · review_ready · needs: none · #207 waits · idle 41 min · context ? -> idle' 'ok    Lane C · mac · working · needs: none · on c/other · idle 2 min · context ?' > "$T/av"
pr() { python3 -I -c 'import json,sys; n,h,b=sys.argv[1:4]; print(json.dumps({"number":int(n),"headRefName":h,"title":"t","body":b,"isDraft":True,"labels":[{"name":x} for x in sys.argv[4:]]}))' "$@"; }
run() { printf '[%s]' "$(IFS=,; echo "$*")" > "$T/p.json"; o=$(python3 -I "$TOOLS/merge-wake.py" --prs "$T/p.json" --repo "$R" --app-view "$T/av" --now "$NOW" 2>&1); }
has() { grep -qF -- "$1" <<<"$o" && echo 1; }; acts() { grep -c '^ACT' <<<"$o"; }
X=$(pr 300 zz 'no waits')
run "$X" "$(pr 207 c/waits $'Why\nWaits on: #101\nMore')"
ok "fail: its one wait is on main: one ACT with the lane, the minutes and the words to type" "$([ "$(acts)" = 1 ] && has 'ACT   wake: #101 on main since 24 Nov 10:00 IST (90 min); #207 waited: Lane Seven (cloud, idle 41 min). Type: "#101 is on main: merge main once and go on with #207"')" "$o"
ok "the summary counts the waiting and the ready, and the merges of the last hour" "$(has 'wake  1 of 2 open pull requests say what they wait on, 1 may go on; 1 merges in the last hour')" "$o"
run "$X" "$(pr 208 c/waits 'Stacked on: #101, #102')"; ok "fail: both on main, the later merge counts" "$([ "$(acts)" = 1 ] && has '#101 #102 on main since 24 Nov 11:00 IST (30 min); #208 waited: lane not found in the app view. Type: "#101 #102 are on main')" "$o"
run "$X" "$(pr 209 c/waits 'Waits on: #101 and #300')"; ok "pass: one of two still open" "$([ "$(acts)" = 0 ] && has '0 may go on')" "$o"
run "$X" "$(pr 210 late 'Waits on: #101')"; ok "pass: main with the merge is in the branch" "$([ "$(acts)" = 0 ] && echo 1)" "$o"
run "$X" "$(pr 216 qa 'Waits on: #101')"; ok "fail: a later commit that does not take main is no answer" "$(has '#216 waited')" "$o"
for l in queued 'review: approved'; do run "$X" "$(pr 217 c/waits 'Waits on: #101' "$l")"; ok "pass: '$l': nothing to type, said" "$([ "$(acts)" = 0 ] && has 'wake  #217 waited on #101, all on main; it is approved or queued: nothing to type')" "$o"; done
run "$X" "$(pr 218 c/waits 'Waits on: #101' 'size: small')"; ok "fail: another label changes nothing" "$([ "$(acts)" = 1 ] && echo 1)" "$o"
run "$X" "$(pr 211 c/waits 'Waits on: #101, #999')"; ok "fail: a wait that is neither open nor merged is its own ACT, and no wake" "$([ "$(acts)" = 1 ] && has 'ACT   wake: #211 waits on #999, neither open nor merged')" "$o"
run "$X" "$(pr 212 gone 'Waits on: #101')"; ok "fail: a branch that is not here is said" "$([ "$(acts)" = 1 ] && has 'its branch gone is not in this copy')" "$o"
run "$X" "$(pr 213 c/waits 'Waits on: #213')"; ok "pass: waiting on itself is no wait" "$([ "$(acts)" = 0 ] && has '0 of 2 open')" "$o"
for b in '**Waits on:** #101' '- Waits on: expat-ready/xpatready#101' 'Waits on: [#101](https://github.com/o/r/pull/101), and #102' '- Waits on: #101.' 'waits on : #101' '**Stacked on: #101**'; do run "$X" "$(pr 214 c/waits "$b")"; ok "fail: '$b' is read" "$(has '#214 waited')" "$o"; done
for b in 'This waits on: #101 to land' '> Waits on: #101' 'Waits on #101' $'```\nWaits on: #101\n```' $'````\n```\nWaits on: #101\n````' $'```\n```js\nWaits on: #101\n```' $'<!--\nWaits on: #101\n-->'; do run "$X" "$(pr 215 c/waits "$b")"; ok "pass: '$(head -1 <<<"$b")' is no wait line" "$([ "$(acts)" = 0 ] && has '0 of 2 open')" "$o"; done
for b in 'Waits on: FO-7b and #101' 'Waits on: #101 after review' $'Waits on:\n#101' "Waits on: #$(printf '1%.0s' $(seq 5000))" "Waits on: $(for i in $(seq 40); do printf '#%s ' "$i"; done)" "Waits on: #1$(printf ' %.0s' $(seq 16000))x"; do run "$X" "$(pr 215 c/waits "$b")" "$(pr 219 c/waits 'Waits on: #101')"; ok "fail: '${b:0:26}' cannot be read: one short ACT, and the next PR is still read" "$([ "$(acts)" = 2 ] && [ "$(has 'ACT   wake: 1 pull request with a wait line that cannot be read')" = 1 ] && [ "$(has '#219 waited')" = 1 ] && [ ${#o} -lt 900 ] && echo 1)" "${o:0:300}"; done
for b in 'Waits on: none' 'Waits on: nothing.' 'Stacked on: main'; do run "$X" "$(pr 215 c/waits "$b")"; ok "pass: '$b' is no wait" "$([ "$(acts)" = 0 ] && has '0 of 2 open')" "$o"; done
L=$(python3 -I -c 'print("\n".join("Waits on: "+" ".join("#%d"%(500000+12*i+k) for k in range(12)) for i in range(584)))'); run "$X" "$(pr 215 c/waits "$L")" "$(pr 219 c/waits 'Waits on: #101')"; ok "fail: thousands of numbers over many lines: one short ACT, the next PR is read" "$([ "$(acts)" = 2 ] && [ "$(has '#219 waited')" = 1 ] && [ ${#o} -lt 900 ] && echo 1)" "${#o}"
run "$X" "$(pr 215 c/waits $'```\ncode\n```\nWaits on: #101')" ; ok "fail: a wait after a closed block is read" "$(has '#215 waited')" "$o"
run "$X" "$(pr 215 c/waits $'```npm test``` passes\nWaits on: #101\r')"; ok "fail: a wait after code on one line, with a CR, is read" "$(has '#215 waited')" "$o"
cp "$T/av" "$T/av0"; printf '%s\n' 'read' 'app view' 'FLAG  Lead 25 · cloud · review_ready · needs: none · #207 reviewed, builder next · idle 12 min · context ?' 'ok    Builder · cloud · working · needs: none · on c/waits · idle 3 min · idle 55 min · context ?' > "$T/av"
run "$X" "$(pr 207 c/waits 'Waits on: #101')"; ok "the lane that names the branch wins over one that only mentions the number" "$(has '#207 waited: Builder (cloud, idle 55 min)')" "$o"
printf '%s\n' 'x' 'y' 'ok    One · cloud · a · needs: none · #207 · idle 1 min · c' 'ok    Two · mac · a · needs: none · #207 · idle 2 min · c' > "$T/av"; run "$X" "$(pr 207 c/waits 'Waits on: #101')"; ok "two lanes: both named, with a doubt" "$(has '2 lanes name it, look first: One (cloud, idle 1 min) or Two (mac, idle 2 min)')" "$o"
printf 'x\ny\nok    Ev\033[2J\033]0;t\007il\342\200\256 %s · cloud · a · needs: none · #207 · idle 1 min · c\n' "$(printf 'L%.0s' $(seq 200))" > "$T/av"; run "$X" "$(pr 207 c/waits 'Waits on: #101')"; ok "no control character reaches the terminal, a long title is cut" "$(! LC_ALL=C grep -q $'[\033\007]' <<<"$o" && ! grep -q $'‮' <<<"$o" && [ ${#o} -lt 500 ] && echo 1)" "$o"
cp "$T/av0" "$T/av"
python3 -I -c 'import json; print(json.dumps([{"number":1000+i,"headRefName":"z","body":"","labels":[]} for i in range(200)]))' > "$T/p.json"; o=$(python3 -I "$TOOLS/merge-wake.py" --prs "$T/p.json" --repo "$R" --app-view "$T/av" --now "$NOW" 2>&1); ok "fail: a list of 200 may be cut: an ACT" "$(has 'the list may be cut at 200')" "$o"
o=$(AV="$T/av" python3 -I -c 'import importlib.util as u,sys,os; f=sys.argv[1]; sys.argv=["x","--prs","/nope"]; s=u.spec_from_file_location("m",f); m=u.module_from_spec(s); s.loader.exec_module(m); v=open(os.environ["AV"]).read(); print(m.lane(v,20,"c"))' "$TOOLS/merge-wake.py"); ok "#20 is not #207, branch c is not c/waits" "$(has 'lane not found in the app view')" "$o"
mv "$T/av" "$T/av2"; run "$X" "$(pr 207 c/waits 'Waits on: #101')"; ok "no app view: the wake stands, the lane is said to be not found" "$([ "$(acts)" = 1 ] && [ "$(has 'wake  no app view in this copy')" = 1 ] && has 'lane not found in the app view')" "$o"
for j in '' '{}' '[]'; do printf '%s' "$j" > "$T/p.json"; o=$(python3 -I "$TOOLS/merge-wake.py" --prs "$T/p.json" --repo "$R" 2>&1); ok "fail: a PR list of '$j' is an ACT" "$(has 'ACT   wake: not read')" "$o"; done
o=$(printf '[%s]' "$X" > "$T/p.json"; python3 -I "$TOOLS/merge-wake.py" --prs "$T/p.json" --repo "$R" --ref nope 2>&1); ok "fail: an unreadable main is an ACT" "$(has 'ACT   wake: not read')" "$o"
sed -n '/^# 4b\. Wake on merge/,/^$/p' "$TOOLS/lead-watch.sh" > "$T/step.sh"; mkdir "$T/l"
step() { printf 'import sys\nprint("""%s""" + " args=" + " ".join(sys.argv[1:]))\n' "$1" > "$T/l/merge-wake.py"; o=$( ( TOOLS="$T/l"; STATE_DIR="$T/s"; act=0; ACT() { act=$((act + 1)); echo "ACT   $1"; }; seen() { echo "seen: $1"; }; fresh() { :; }; . "$T/step.sh"; echo "acts=$act" ) 2>&1 ); }
step 'wake  0'; ok "lead-watch.sh prints its line and hands it on, no ACT counted, and gives it step 2b's file" "$([ "$(has 'seen: wake  0')" = 1 ] && [ "$(has "args=--prs $T/s/prs-body.json")" = 1 ] && has 'acts=0')" "$o"
step 'ACT   wake: x'; ok "lead-watch.sh counts its ACT line" "$(has 'acts=1')" "$o"
step Traceback; ok "fail: a merge-wake.py that dies is an ACT" "$(has 'ACT   wake: merge-wake.py did not run')" "$o"
a=$(grep -n '^# 4b\. Wake on merge' "$TOOLS/lead-watch.sh" | cut -d: -f1); b=$(grep -n '^git fetch -q origin 2' "$TOOLS/lead-watch.sh" | tail -1 | cut -d: -f1); c=$(grep -n 'prs-body.json" 2>/dev/null' "$TOOLS/lead-watch.sh" | head -1 | cut -d: -f1)
ok "the step comes after the fetch and after step 2b wrote the PR list" "$([ -n "$a" ] && [ "$a" -gt "$b" ] && [ "$a" -gt "$c" ] && echo 1)" "step $a fetch $b prs $c"
# OS-49: --post wakes the lane by a PR comment, once; a stand-in gh records the posts
printf '#!/bin/sh\n[ -n "${GHFAIL:-}" ] && { echo "HTTP 403" >&2; exit 1; }\necho "$@" >> "%s/posts"\n' "$T" > "$T/gh"; chmod +x "$T/gh"
runp() { : > "$T/posts"; printf '[%s]' "$(IFS=,; echo "$*")" > "$T/p.json"; o=$(MERGE_WAKE_GH="$T/gh" python3 -I "$TOOLS/merge-wake.py" --prs "$T/p.json" --repo "$R" --app-view "$T/av" --now "${PNOW:-$NOW}" --post --state "$T/ps" 2>&1); }
posts() { grep -c . "$T/posts"; }; hp() { grep -qF -- "$1" <<<"$o"; }
P=$(pr 207 c/waits 'Waits on: #101'); rm -rf "$T/ps"
runp "$X" "$P"; ok "post: the wake is a comment on the waiting PR, no ACT, said" "$([ "$(posts)" = 1 ] && grep -q '^pr comment 207 --body \*\*Wake on merge (OS-49, lead-watch):\*\* #101 is on main: merge main once and go on with #207' "$T/posts" && [ "$(acts)" = 0 ] && hp 'wake comment posted on the PR' && echo 1)" "$o $(cat "$T/posts")"
runp "$X" "$P"; ok "post: the next check posts nothing and says it waits" "$([ "$(posts)" = 0 ] && [ "$(acts)" = 0 ] && hp 'woken by a PR comment' && echo 1)" "$o"
PNOW=$((NOW + 3700)) runp "$X" "$P"; ok "post: not taken 60 min after the post is an ACT with the words, no second post" "$([ "$(posts)" = 0 ] && [ "$(acts)" = 1 ] && hp 'has not merged #101 yet' && echo 1)" "$o"
rm -rf "$T/ps"; GHFAIL=1 runp "$X" "$P"; ok "post: a failed post is the ACT, and not remembered" "$([ "$(acts)" = 1 ] && hp 'ACT   wake (posting the wake on #207 failed: HTTP 403): #101 on main' && echo 1)" "$o"
runp "$X" "$P"; ok "post: after a failed post the next check posts" "$([ "$(posts)" = 1 ] && echo 1)" "$o"
runp "$X" "$(pr 217 c/waits 'Waits on: #101' 'review: approved')"; ok "post: an approved PR gets no comment" "$([ "$(posts)" = 0 ] && echo 1)" "$o"
runp "$X" "$(pr 210 late 'Waits on: #101')"; ok "post: a branch that holds main gets no comment" "$([ "$(posts)" = 0 ] && echo 1)" "$o"
runp "$X"; ok "post: a closed PR leaves the memory" "$(python3 -c 'import json,sys; sys.exit(0 if "207:#101" not in json.load(open(sys.argv[1])) else 1)' "$T/ps/merge-wake.json" && echo 1)" "$(cat "$T/ps/merge-wake.json")"
echo '{broken' > "$T/ps/merge-wake.json"; runp "$X" "$P"; ok "post: an unreadable memory is rebuilt and said; the wake is posted" "$([ "$(posts)" = 1 ] && hp 'memory unreadable' && echo 1)" "$o"
o=$(python3 -I "$TOOLS/merge-wake.py" --prs "$T/p.json" --repo "$R" --app-view "$T/av" --now "$NOW" --post 2>&1); ok "post: --post with no --state is an ACT, nothing posted" "$(hp 'ACT   wake: not read' && echo 1)" "$o"
finish
