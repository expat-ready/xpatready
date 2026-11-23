#!/usr/bin/env bash
# A334 fix 1 (founder 23 Nov "Yes, beside product"): the idle-lane alarm and the enforced night checklist in the Lead's check.
# (1) app-view-check.sh (lead-watch.sh step 10): one ACT per cloud lane idle over 10 min with work left or waiting for the
#     Lead, oldest first, marked "[idle lane N min ...]"; an ACT when the app view is over 15 min old.
# (2) night-checklist.py (lead-watch.sh step 10b): one ACT per item overdue or without proof, product first, then
#     "operating system: n done of m".
# (3) an item is done only with a PR number merged on main; prose or an unmerged PR is not done.
# Pass and fail case for each. Clock, sessions and main's subjects are faked. US$0, no network.
#   bash product/tools/check-lead-watch-idle.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v python3 >/dev/null || { echo "python3 is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/lwi.XXXXXXXX"); trap 'rm -rf "$T"' EXIT
export APP_VIEW_FILE="$T/app-view.txt"; NOW=1763270000
save() { printf '%s\n' "$1" | NOW=$NOW bash "$TOOLS/app-view-save.sh" >/dev/null; }
check() { NOW=$1 bash "$TOOLS/app-view-check.sh"; echo "rc=$?"; }
L() { printf 'FLAG  %s · %s · %s · needs: none · d · idle %s min · context ? -> %s' "$@"; }   # title where category idle why

# (1) pass: no cloud lane idle or waiting; a done lane and a fresh one are "ok", a mac lane's context flag is not an idle lane.
save "app view 4 sessions · 2 flagged · rows=4
$(L 'Mac full' mac completed 3 'context 46% (over 45%, P-565)')
$(L 'Cloud full' cloud review_ready 4 'context 47% (over 45%, P-565)')
ok    Lane fine · cloud · review_ready · needs: none · d · idle 4 min · context ?
ok    Lane done · cloud · completed · needs: none · d · idle 200 min · context ?"
o=$(check $((NOW + 5 * 60)))
ok "(1) pass: no idle cloud lane, no idle-lane ACT; context flags (mac and cloud) stay plain ACTs" "$(grep -q '^rc=2$' <<<"$o" && ! grep -q '\[idle lane' <<<"$o" && grep -q '^idle lanes: 0 cloud lanes' <<<"$o" && grep -q '^ACT   app view: Mac full' <<<"$o" && echo 1)" "$o"

# (1) fail: three cloud lanes (idle 40, asks for 3 min, idle 114) and a mac lane idle 300: cloud first, oldest first, each once.
save "app view 5 sessions · 4 flagged · rows=5
$(L 'Lane forty' cloud review_ready 40 'idle 40 min with work left')
$(L 'Mac idle' mac review_ready 300 'idle 300 min with work left')
$(L 'Lane asks' cloud need_input 3 'need_input')
$(L 'Lane idle' cloud review_ready 114 'idle 114 min with work left')
ok    Lane fine · cloud · review_ready · needs: none · d · idle 4 min · context ?"
o=$(check $((NOW + 5 * 60))); acts=$(grep '^ACT' <<<"$o")
ok "(1) fail: one ACT per flagged lane (4), never two" "$(grep -q '^rc=4$' <<<"$o" && [ "$(grep -c 'Lane idle' <<<"$acts")" = 1 ] && echo 1)" "$o"
ok "(1) fail: cloud idle or waiting lanes first, oldest first (114, 40, 3), the mac lane after" "$(sed -n 1p <<<"$acts" | grep -q '^ACT   app view: Lane idle .*\[idle lane 114 min: answer or wake it\]$' && sed -n 2p <<<"$acts" | grep -q 'Lane forty.*\[idle lane 40 min' && sed -n 3p <<<"$acts" | grep -q 'Lane asks.*need_input \[idle lane 3 min' && sed -n 4p <<<"$acts" | grep -q '^ACT   app view: Mac idle' && ! sed -n 4p <<<"$acts" | grep -q 'idle lane' && echo 1)" "$acts"
ok "(1) fail: summary line names 3 idle lanes, oldest 114 min" "$(grep -q '^idle lanes: 3 cloud lanes .*, oldest 114 min$' <<<"$o" && echo 1)" "$o"
# (1) fields found by shape: a title holding " · " and " -> ", and a failed run whose category is review_ready, still count.
save "app view 3 sessions · 3 flagged · rows=3
$(L 'Lane twelve' cloud review_ready 12 'idle 12 min with work left')
$(L 'Fix A · B -> C' cloud review_ready 50 'idle 50 min with work left')
$(L 'Lane run failed' cloud review_ready 2 'review_ready')"
o=$(check $((NOW + 5 * 60))); acts=$(grep '^ACT' <<<"$o")
ok "(1) fail: a title with ' · ' and ' -> ' is still an idle lane (50 min first); a failed run waiting is one too" "$(sed -n 1p <<<"$acts" | grep -q 'Fix A · B -> C.*\[idle lane 50 min' && sed -n 3p <<<"$acts" | grep -q 'Lane run failed.*\[idle lane 2 min' && grep -q '^idle lanes: 3 cloud lanes .*, oldest 50 min$' <<<"$o" && echo 1)" "$o"
# (1) staleness: 15 min is still read, 16 min is an ACT.
o=$(check $((NOW + 15 * 60))); ok "(1) pass: a view 15 min old is read (no 'not read' ACT)" "$(! grep -q 'not read in' <<<"$o" && echo 1)" "$o"
o=$(check $((NOW + 16 * 60))); ok "(1) fail: a view 16 min old is 'ACT app view not read in 16 min'" "$(grep -q '^rc=1$' <<<"$o" && grep -q '^ACT   app view not read in 16 min' <<<"$o" && echo 1)" "$o"
grep -q '"$TOOLS/app-view-check.sh"' "$TOOLS/lead-watch.sh" && grep -q '^nc=$(python3 -I "$TOOLS/night-checklist.py"' "$TOOLS/lead-watch.sh"
ok "lead-watch.sh runs app-view-check.sh and night-checklist.py and counts their ACT lines" "$([ $? = 0 ] && echo 1)"
unset APP_VIEW_FILE

# (2) and (3): night-checklist.py on a hand-made checklist and main's subjects. Now = 24 Nov 12:00 IST.
CNOW=$(python3 -c 'import datetime as d; print(int(d.datetime(2026,11,24,12,0,tzinfo=d.timezone(d.timedelta(hours=5,minutes=30))).timestamp()))')
printf '%s\n' 'Merge pull request #101 from expat-ready/x' 'Merge pull request #102 from expat-ready/y' 'records: mentions #103 in prose' 'qa: the 3 FAILs are part 2s (#104)' > "$T/subjects"
it() { printf '{"id":"%s","track":"%s","title":"t %s","owner":"o","done_when":"w","due_ist":"%s","proof":%s}' "$1" "$2" "$1" "$3" "$4"; }
nc() { printf '{"items":[%s]}' "$1" > "$T/c.json"; python3 -I "$TOOLS/night-checklist.py" --file "$T/c.json" --subjects "$T/subjects" --now "$CNOW"; echo "rc=$?"; }
o=$(nc "$(it P-1 product '2026-11-24 10:00' '{"pr":101}'),$(it OS-1 'operating system' '2026-11-25 23:59' '{"pr":102}')")
ok "(2) pass: every item proven by a merged PR: no ACT, 'operating system: 1 done of 1'" "$(grep -q '^rc=0$' <<<"$o" && ! grep -q '^ACT' <<<"$o" && grep -qx 'operating system: 1 done of 1' <<<"$o" && echo 1)" "$o"
o=$(nc "$(it OS-1 'operating system' '2026-11-24 09:00' null),$(it OS-2 'operating system' '2026-11-25 23:59' '{"pr":102}'),$(it P-2 product '2026-11-25 07:00' null),$(it P-1 product '2026-11-24 06:00' null)")
acts=$(grep '^ACT' <<<"$o")
ok "(2) fail: overdue and unproven items are ACTs, product first then by due (P-1, P-2, OS-1)" "$(grep -q '^rc=3$' <<<"$o" && sed -n 1p <<<"$acts" | grep -q '^ACT   product P-1 overdue 6.0 h, no proof' && sed -n 2p <<<"$acts" | grep -q '^ACT   product P-2 due in 19.0 h, no proof' && sed -n 3p <<<"$acts" | grep -q '^ACT   operating system OS-1 overdue 3.0 h, no proof' && grep -qx 'operating system: 1 done of 2' <<<"$o" && echo 1)" "$o"
o=$(nc "$(it P-1 bogus '2026-11-24 06:00' null),$(it P-2 product 'tomorrow' null),$(it OS-9 'operating system' 'soon' '{"pr":101}')")
ok "(2) fail: a bad track or due date is an ACT, never a crash or a silent pass; a bad OS item still counts in m" "$(grep -q '^rc=3$' <<<"$o" && grep -qx 'operating system: 0 done of 1' <<<"$o" && grep -q "P-1 unreadable: track 'bogus'" <<<"$o" && grep -q "P-2 unreadable: due_ist 'tomorrow'" <<<"$o" && echo 1)" "$o"
o=$(python3 -I "$TOOLS/night-checklist.py" --file "$T/none.json" --subjects "$T/subjects"; echo "rc=$?")
ok "(2) fail: a missing checklist file is an ACT" "$(grep -q '^rc=1$' <<<"$o" && grep -q '^ACT   night checklist unreadable' <<<"$o" && echo 1)" "$o"
o=$(python3 -I "$TOOLS/night-checklist.py" --subjects "$T/subjects" --now "$CNOW"; echo "rc=$?")
ok "(2) the live design/night-checklist.json reads (no unreadable item, at least one operating-system item)" "$(grep -qE '^operating system: [0-9]+ done of [1-9][0-9]*$' <<<"$o" && ! grep -q unreadable <<<"$o" && echo 1)" "$o"

o=$(nc "$(it OS-1 'operating system' '2026-11-25 23:59' '{"pr":101}'),$(it OS-2 'operating system' '2026-11-25 23:59' '{"pr":102}')")
ok "(3) pass: 'Merge pull request #101 from' and '#102 from' on main count as done" "$(grep -q '^rc=0$' <<<"$o" && grep -qx 'operating system: 2 done of 2' <<<"$o" && echo 1)" "$o"
o=$(nc "$(it OS-1 'operating system' '2026-11-25 23:59' '"merged in #101, works"'),$(it OS-2 'operating system' '2026-11-25 23:59' '{"pr":103}'),$(it OS-3 'operating system' '2026-11-25 23:59' '{"pr":"101"}'),$(it OS-4 'operating system' '2026-11-25 23:59' '{"pr":true}'),$(it OS-5 'operating system' '2026-11-25 23:59' '{"pr":104}')")
ok "(3) fail: prose, a PR only mentioned on main, a subject ending (#104), a PR number as text and true are not done" "$(grep -q '^rc=5$' <<<"$o" && grep -q 'OS-5 .*proof #104 not merged on main' <<<"$o" && grep -q 'OS-1 .*proof is not a PR number merged on main' <<<"$o" && grep -q 'OS-2 .*proof #103 not merged on main' <<<"$o" && grep -q 'OS-3 .*proof is not a PR number' <<<"$o" && grep -q 'OS-4 .*proof is not a PR number' <<<"$o" && grep -qx 'operating system: 0 done of 5' <<<"$o" && echo 1)" "$o"
finish
