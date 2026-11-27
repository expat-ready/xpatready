#!/usr/bin/env bash
# A348 (founder 24 Nov): proof-number.py prints the proof number above merges in lead-watch.sh. Pass and fail case for each
# line, on a hand-made git history with a faked clock. US$0, no network.   bash product/tools/check-proof-number.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/pn.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }
trap 'rm -rf "${T:?}"' EXIT
P=ai-workers/problem-1-pathway-setup-and-form-filling; C="$P/product/qa/CAPABILITIES.md"; D="$P/prototype/studio"; R=""; seq=0
g() { git -C "$R" -c user.email=t@t -c user.name=t -c commit.gpgsign=false "$@"; }
rows() { : > "$R/$C"; i=0; for s in "$@"; do i=$((i + 1)); printf '| R1.%s | %s Thing | Who | %s | %s | note |\n' "$i" "$i" "${s%%@*}" "${s#*@}" >> "$R/$C"; done; }
com() { g add -A; GIT_COMMITTER_DATE="$1+05:30" GIT_AUTHOR_DATE="$1+05:30" g commit -qm x; }
app() { echo "$1" >> "$R/$D/${2:-api/src}/x.ts"; com "$1"; }
run() { python3 -I "$TOOLS/proof-number.py" --repo "$R" --ref main --now "$1+05:30" 2>&1; }
has() { grep -qF -- "$1" <<<"$2" && echo 1; }
both() { [ "$(has "$1" "$3")" = 1 ] && has "$2" "$3"; }
none() { ! grep -q '^ACT' <<<"$1" && echo 1; }
new() {  # a fresh history that starts on 1 Nov with every app folder and the rows given
  seq=$((seq + 1)); R="$T/r$seq"; git init -q -b main "$R"; mkdir -p "$R/$P/product/qa"
  for nd in api/src web/src engine prisma contracts samples packages tests; do mkdir -p "$R/$D/$nd"; echo 0 > "$R/$D/$nd/x.ts"; done
  rows "$@"; com 2026-11-01T10:00:00; }

new Partial Partial Partial Works
rows Works Partial Partial Works; com 2026-11-23T23:30:00     # the evening before: in the 24 h, not today
rows Works Works Partial Works; com 2026-11-24T00:30:00       # 00:30 IST = 19:00 UTC the day before: today
o=$(run 2026-11-24T08:00:00)
ok "today starts at 00:00 IST: 00:30 counts, 23:30 the evening before does not (+1)" "$(has 'Proven today +1 (since 00:00 IST, net)' "$o")" "$o"
ok "the last 24 h counts both (+2), 3 of 4 proven, forecast 1 left at +2 a day" "$(has 'last 24 h +2 · 3 of 4 · forecast 24 Nov 2026' "$o")" "$o"
ok "the needed rate is to the committed date, 12 Dec (P-815, the Lead's ruling 25 Nov): 1 left in 18.7 days" "$(has 'needed 0.1 a day to 12 Dec 2026' "$o")" "$o"
ok "pass: no app code merged, no ACT" "$(none "$o")" "$o"
rows Works Works Partial Partial; com 2026-11-24T08:30:00
o=$(run 2026-11-24T09:00:00); ok "net: one gained and one reopened today is +0" "$(has 'Proven today +0' "$o")" "$o"
rows Partial Partial Partial Partial; com 2026-11-24T09:30:00
o=$(run 2026-11-24T10:00:00); ok "a fall today is printed as a minus (-2), and no gain is 'none'" "$(both 'Proven today -2' 'forecast none, no gain in 24 h' "$o")" "$o"

new Partial Works; app 2026-11-24T06:00:00; app 2026-11-24T07:00:00 web/src
o=$(run 2026-11-24T09:59:00); ok "pass: the first merge is under 4 h old" "$(none "$o")" "$o"
o=$(run 2026-11-24T10:00:00); ok "fail: 4 h after the first merge, no item newly Works: one ACT naming both merges" "$([ "$(grep -c '^ACT' <<<"$o")" = 1 ] && has 'ACT   proven: 2 app-code merges since 24 Nov 06:00 IST (4.0 h) and no item newly Works' "$o")" "$o"
rows Partial Works@again; com 2026-11-24T10:30:00
o=$(run 2026-11-24T11:00:00); ok "fail: a re-walk of a row already Works is not newly Works" "$(has 'ACT   proven: 2 app-code' "$o")" "$o"
rows Works Works@again; com 2026-11-24T11:30:00
o=$(run 2026-11-24T12:00:00); ok "pass: a row turned Works after the merges" "$(none "$o")" "$o"
rows Partial Works@again; com 2026-11-24T12:30:00
o=$(run 2026-11-24T13:00:00); ok "fail: that row was reopened, so it no longer answers the merges" "$(has 'ACT   proven: 2 app-code' "$o")" "$o"
new Partial Works; app 2026-11-24T06:00:00 tests; echo x > "$R/notes.md"; com 2026-11-24T06:10:00
o=$(run 2026-11-24T12:00:00); ok "pass: studio tests and records are not app code" "$(none "$o")" "$o"
for d in api/src web/src engine prisma contracts samples packages; do new Partial; app 2026-11-24T06:00:00 "$d"; o=$(run 2026-11-24T12:00:00); ok "fail: $d is app code" "$(has 'ACT   proven: 1 app-code' "$o")" "$o"; done
new Partial; g checkout -q -b side; app 2026-11-24T05:00:00; app 2026-11-24T05:30:00; g checkout -q main; echo 5 > "$R/n.md"; com 2026-11-24T05:40:00
GIT_COMMITTER_DATE=2026-11-24T06:00:00+05:30 g merge -q --no-ff -m "Merge pull request #9 from x" side
o=$(run 2026-11-24T12:00:00); ok "fail: a merge commit with two commits counts once, at its merge" "$(has 'ACT   proven: 1 app-code merges since 24 Nov 06:00' "$o")" "$o"
new Works; app 2026-11-24T06:00:00; o=$(run 2026-11-24T12:00:00); ok "pass: every row proven, nothing to send qa to" "$([ "$(none "$o")" = 1 ] && has 'forecast done' "$o")" "$o"
new Partial; o=$(run 2026-12-14T12:00:00); ok "after the date the needed rate says so, never None" "$(has 'needed none, the date is past' "$o")" "$o"

bad() { has 'ACT   proven: not measured' "$1"; }
new Works Partial; o=$(run 2026-11-01T11:00:00); ok "fail: no history before 00:00 IST is an ACT, never +0" "$(both 'Proven today not readable' 'ACT   proven: the change is not readable' "$o")" "$o"
new Works Partial; rows Works Works; com 2026-11-24T07:00:00; git clone -q --depth 1 "file://$R" "$T/sh" 2>/dev/null
o=$(python3 -I "$TOOLS/proof-number.py" --repo "$T/sh" --ref main --now 2026-11-24T08:00:00+05:30); ok "fail: a copy cut short at today's commit (shallow) is an ACT, never a gain" "$(both 'Proven today not readable' 'ACT   proven: the change is not readable' "$o")" "$o"
new Partial Partial; rows Partial Partial@again; com 2026-11-24T07:00:00; git clone -q --depth 1 "file://$R" "$T/sh2" 2>/dev/null
o=$(python3 -I "$TOOLS/proof-number.py" --repo "$T/sh2" --ref main --now 2026-11-24T12:00:00+05:30); ok "pass: the shallow edge adds every file, it is not an app-code merge" "$(! grep -q 'app-code merges since' <<<"$o" && echo 1)" "$o"
new Works Partial; : > "$R/$C"; com 2026-11-24T07:00:00; ok "fail: an emptied CAPABILITIES.md is an ACT, never frozen numbers" "$(bad "$(run 2026-11-24T08:00:00)")"
new Works Partial; rm "${R:?}/${C:?}"; com 2026-11-24T07:00:00; ok "fail: a deleted CAPABILITIES.md is an ACT" "$(bad "$(run 2026-11-24T08:00:00)")"
new Works Partial; rows Works; com 2026-11-24T07:00:00; ok "fail: a removed row is an ACT" "$(bad "$(run 2026-11-24T08:00:00)")"
new Works Partial; g rm -rq "$D/web"; com 2026-11-24T07:00:00; ok "fail: an app folder that is not there is an ACT" "$(bad "$(run 2026-11-24T08:00:00)")"
ok "fail: an unreadable repository is an ACT" "$(bad "$(python3 -I "$TOOLS/proof-number.py" --repo "$T/none" --ref main)")"
new Works; ok "fail: an unknown ref is an ACT" "$(bad "$(python3 -I "$TOOLS/proof-number.py" --repo "$R" --ref main~99 2>&1)")"

# lead-watch.sh's own step 1d, cut out and run as written: its lines, its ACT count, and the two ways it can fail
lw="$TOOLS/lead-watch.sh"; a=$(grep -n '^# 1d\. Proof number' "$lw" | cut -d: -f1); b=$(grep -n '^say "merged in' "$lw" | cut -d: -f1)
ok "step 1d is above the merges line" "$([ -n "$a" ] && [ "$a" -lt "$b" ] && echo 1)" "line ${a:-none}, merges ${b:-none}"
sed -n '/^# 1d\. Proof number/,/^$/p' "$lw" > "$T/step.sh"; mkdir -p "$T/t"
step() {  # $1 = git's exit code, $2 = what proof-number.py prints
  printf 'print("""%s""")\n' "$2" > "$T/t/proof-number.py"; rc=$1
  ( TOOLS="$T/t"; act=0; ACT() { act=$((act + 1)); echo "ACT   $1"; }; seen() { :; }; fresh() { :; }; git() { return "$rc"; }; . "$T/step.sh"; echo "acts=$act" ) 2>&1; }
o=$(step 0 'proven fine'); ok "pass: the line is printed, no ACT counted" "$(both 'proven fine' 'acts=0' "$o")" "$o"
o=$(step 0 'proven fine
ACT   proven: x'); ok "fail: its ACT line is counted" "$(has 'acts=1' "$o")" "$o"
o=$(step 1 'proven fine'); ok "fail: origin/main not fetched is an ACT" "$(both 'ACT   proven: origin/main not fetched' 'acts=1' "$o")" "$o"
o=$(step 0 'Traceback'); ok "fail: a proof-number.py that dies is an ACT" "$(both 'ACT   proven: proof-number.py did not run' 'acts=1' "$o")" "$o"
finish
