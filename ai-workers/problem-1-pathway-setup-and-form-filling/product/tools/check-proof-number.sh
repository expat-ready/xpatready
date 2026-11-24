#!/usr/bin/env bash
# A348 (founder 24 Nov): proof-number.py prints the proof number above merges in lead-watch.sh. Pass and fail case for each
# line, on a hand-made git history with a faked clock. US$0, no network.   bash product/tools/check-proof-number.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/pn.XXXXXXXX"); trap 'rm -rf "$T"' EXIT
P=ai-workers/problem-1-pathway-setup-and-form-filling; C="$P/product/qa/CAPABILITIES.md"; A="$P/prototype/studio/api/src/x.ts"
git -C "$T" init -q -b main; g() { git -C "$T" -c user.email=t@t -c user.name=t -c commit.gpgsign=false "$@"; }
mkdir -p "$T/$P/product/qa" "$T/$P/prototype/studio/api/src"
rows() { : > "$T/$C"; i=0; for s in "$@"; do i=$((i + 1)); printf '| R1.%s | %s Thing | Who | %s | abc 1 Nov | note |\n' "$i" "$i" "$s" >> "$T/$C"; done; }
com() { g add -A; GIT_COMMITTER_DATE="$1" GIT_AUTHOR_DATE="$1" g commit -qm x; }
run() { python3 -I "$TOOLS/proof-number.py" --repo "$T" --ref main --now "$1"; }
has() { grep -qF -- "$1" <<<"$2" && echo 1; }
rows Partial Partial Partial Works; com 2026-11-22T10:00:00+05:30
rows Works Partial Partial Works; com 2026-11-23T20:00:00+05:30     # yesterday evening: in the 24 h, not today
rows Works Works Partial Partial; com 2026-11-24T06:00:00+05:30     # today: one gained, one reopened
o=$(run 2026-11-24T08:00:00+05:30)
ok "today is net (one gained, one reopened = +0) and starts at 00:00 IST" "$(has 'Proven today +0 (since 00:00 IST, net)' "$o")" "$o"
ok "the last 24 h counts yesterday evening's gain (+1), 2 of 4 proven" "$(has 'last 24 h +1 · 2 of 4' "$o")" "$o"
ok "the forecast is a date (2 left at +1 a day = 26 Nov 2026)" "$(has 'forecast 26 Nov 2026' "$o")" "$o"
ok "pass: no app code merged, no ACT" "$([ "$(grep -c '^ACT' <<<"$o")" = 0 ] && echo 1)" "$o"
echo 1 > "$T/$A"; com 2026-11-24T07:00:00+05:30
o=$(run 2026-11-24T08:00:00+05:30)
ok "pass: app code merged and an item turned Works in the 4 h: no ACT" "$(! grep -q '^ACT' <<<"$o" && echo 1)" "$o"
echo 2 > "$T/$A"; com 2026-11-24T11:00:00+05:30
o=$(run 2026-11-24T12:00:00+05:30)
ok "fail: app code merged in 4 h, no item newly Works: one ACT naming the count" "$([ "$(grep -c '^ACT' <<<"$o")" = 1 ] && has 'ACT   proven: 1 app-code merges in 4 h and no item newly Works' "$o")" "$o"
o=$(run 2026-11-24T16:00:00+05:30)
ok "pass: the app merge is older than 4 h: no ACT" "$(! grep -q '^ACT' <<<"$o" && echo 1)" "$o"
echo 3 > "$T/notes.md"; com 2026-11-24T17:00:00+05:30
o=$(run 2026-11-24T17:30:00+05:30)
ok "pass: a records merge is not app code: no ACT" "$(! grep -q '^ACT' <<<"$o" && echo 1)" "$o"
g checkout -q -b side; echo 4 > "$T/$A"; com 2026-11-24T22:00:00+05:30; g checkout -q main; echo 5 >> "$T/notes.md"; com 2026-11-24T22:05:00+05:30
GIT_COMMITTER_DATE=2026-11-24T22:30:00+05:30 g merge -q --no-ff -m "Merge pull request #9 from x" side
o=$(run 2026-11-24T23:00:00+05:30)
ok "fail: a merge commit that brings app code counts once" "$(has 'ACT   proven: 1 app-code merges in 4 h' "$o")" "$o"
rows Works Partial Partial Partial; com 2026-11-24T23:10:00+05:30
o=$(run 2026-11-24T23:30:00+05:30)
ok "a fall today is printed as a minus, never hidden (-1)" "$(has 'Proven today -1' "$o")" "$o"
o=$(run 2026-11-22T11:00:00+05:30)
ok "fail: no history before 00:00 IST is an ACT, never +0" "$(has 'Proven today not readable' "$o" >/dev/null && has 'ACT   proven: the change is not readable' "$o" >/dev/null && echo 1)" "$o"
o=$(python3 -I "$TOOLS/proof-number.py" --repo "$T/none" --ref main; echo "rc=$?")
ok "fail: an unreadable repository is an ACT" "$(has 'ACT   proven: not measured' "$o")" "$o"
: > "$T/$C"; com 2026-11-24T23:40:00+05:30; o=$(python3 -I "$TOOLS/proof-number.py" --repo "$T" --ref main~99 2>&1)
ok "fail: an unknown ref is an ACT" "$(has 'ACT   proven: not measured' "$o")" "$o"
lw="$TOOLS/lead-watch.sh"; a=$(grep -n '"\$TOOLS/proof-number.py"' "$lw" | head -1 | cut -d: -f1); b=$(grep -n '^say "merged in' "$lw" | cut -d: -f1)
ok "lead-watch.sh runs it above the merges line and counts its ACT lines" "$([ -n "$a" ] && [ "$a" -lt "$b" ] && sed -n "${a}p" "$lw" | grep -qF "act=\$((act + \$(grep -c '^ACT' <<<\"\$pn\")))" && echo 1)" "line ${a:-none}, merges ${b:-none}"
finish
