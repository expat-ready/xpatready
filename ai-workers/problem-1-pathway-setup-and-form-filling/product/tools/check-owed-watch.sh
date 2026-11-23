#!/usr/bin/env bash
# E11 (P-599) and E19 (founder 21 Nov, P-772): owed-watch.py on made-up boards and STATE pages, and lead-watch.sh's
# wiring (steps 13b and 13c count their ACT lines). Guard 32 in check-guards.sh. No network, US$0.
#   bash product/tools/check-owed-watch.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
W="python3 -I $TOOLS/owed-watch.py"
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
board() { printf '{"freshness":{"generated_at":"%s"},"backlog":{"by_lane":{"v":%s,"src":"x"}}}' "$now" "$1" > "$T/b.json"; }
acts() { grep -c '^ACT' <<<"$1"; }

# --- E11: ready rows per lane
board '{"screens":{"ready":2,"blocked":1},"forms":{"ready":5},"runtime":{"ready":3},"evidence":{"ready":2},"schema":{"ready":0}}'
out=$($W lanes --board "$T/b.json"); r=$?
ok "every /next lane at two or more: no ACT, exit 0, the counts shown" "$([ $r = 0 ] && [ "$(acts "$out")" = 0 ] && grep -q 'screens 2 · forms 5 · runtime 3 · evidence 2' <<<"$out" && echo 1)" "$out"
ok "a lane outside the four (schema 0) is not judged" "$(! grep -q schema <<<"$out" && echo 1)" "$out"
board '{"screens":{"ready":1},"forms":{"ready":0},"runtime":{"ready":2},"evidence":{"ready":2}}'
out=$($W lanes --board "$T/b.json")
ok "one ready row is under two (P-599): ACT for that lane" "$(grep -q '^ACT   lane screens has 1 ready row(s), under 2' <<<"$out" && echo 1)" "$out"
ok "zero ready rows: ACT; exactly two ACTs (screens, forms)" "$(grep -q '^ACT   lane forms has 0 ready' <<<"$out" && [ "$(acts "$out")" = 2 ] && echo 1)" "$out"
board '{"screens":{"ready":4},"forms":{"ready":4},"runtime":{"ready":4}}'
out=$($W lanes --board "$T/b.json")
ok "a lane missing from the board is not measured: ACT, never a pass" "$(grep -q '^ACT   lane evidence: ready rows not measured' <<<"$out" && [ "$(acts "$out")" = 1 ] && echo 1)" "$out"
board '{"screens":{"ready":"3"},"forms":{"ready":true},"runtime":{"ready":4},"evidence":{"ready":4}}'
out=$($W lanes --board "$T/b.json")
ok "a count that is not a number (string, true) is not measured" "$([ "$(acts "$out")" = 2 ] && grep -q 'lane forms: ready rows not measured' <<<"$out" && echo 1)" "$out"
echo '{"backlog":{}}' > "$T/b.json"; out=$($W lanes --board "$T/b.json"); r=$?
ok "a board without backlog.by_lane: one ACT, exit 0, no traceback" "$([ $r = 0 ] && [ "$(acts "$out")" = 1 ] && grep -q 'not measured: board' <<<"$out" && ! grep -q Traceback <<<"$out" && echo 1)" "$out"
out=$($W lanes --board "$T/none.json"); ok "no board file: one ACT" "$([ "$(acts "$out")" = 1 ] && echo 1)" "$out"
echo '{not json' > "$T/b.json"; out=$($W lanes --board "$T/b.json"); ok "a broken board: one ACT, no traceback" "$([ "$(acts "$out")" = 1 ] && ! grep -q Traceback <<<"$out" && echo 1)" "$out"
board '{"screens":{"ready":1},"forms":{"ready":1},"runtime":{"ready":1},"evidence":{"ready":1}}'
out=$($W lanes --board "$T/b.json" --min 1); ok "--min moves the bar" "$([ "$(acts "$out")" = 0 ] && echo 1)" "$out"

# --- E19: starts owed at the founder's next typed turn
cat > "$T/s1.md" <<'X'
# State
current_lead: local_aaa Lead 1
**Lead 2: create the check FIRST; standby: Lead 98 (local_b18084c0); start one more standby at the founder's next typed turn.** RULES as of P-744.
(1) **Founder-typed turn to-do (cron turns can't start sessions):** R1.59 lane STARTED 14:5x (task_bc15); start Lead C's two Wave 1 lanes for QA-593 and QA-591 when its briefs arrive; restart qa 9 for R1.40
Proven: R1.33 (re-prove after #2405; needs a qa lane at the founder's next typed turn) · R1.8 (#2338: full run dispatched)
Skill edit at the founder's next typed turn.
Standbys (started 14:5x by Lead 2 in a founder-typed turn): Lead 4, Lead 5.
A lane for R1.9 is owed, nothing about turns here.
X
out=$($W starts --state "$T/s1.md"); r=$?
ok "starts owed: one ACT line with the count (4), exit 0" "$([ $r = 0 ] && [ "$(acts "$out")" = 1 ] && grep -q "^ACT   starts owed at the founder's next typed turn: 4:" <<<"$out" && echo 1)" "$out"
ok "the ACT says raise them in his next turn and the push notification" "$(grep -q 'in his next turn and in the push notification' <<<"$out" && echo 1)" "$out"
ok "inline: 'start one more standby at the founder's next typed turn' listed" "$(grep -q "^      owed  start one more standby at the founder's next typed turn" <<<"$out" && echo 1)" "$out"
ok "a to-do heading lists each item after it (Lead C's lanes, restart qa 9)" "$(grep -q "owed  start Lead C's two Wave 1 lanes" <<<"$out" && grep -q 'owed  restart qa 9 for R1.40' <<<"$out" && echo 1)" "$out"
ok "an item already STARTED is not owed" "$(! grep -q 'owed .*R1.59' <<<"$out" && echo 1)" "$out"
ok "a qa lane needed at the typed turn, in a · list, is listed alone with its row (a ; in brackets does not cut it)" "$(grep -q 'owed  .*R1.33 (re-prove after #2405; needs a qa lane at the founder.s next typed turn)$' <<<"$out" && ! grep -q 'owed .*R1.8' <<<"$out" && echo 1)" "$out"
ok "not a start (a skill edit), past starts and lines without the typed turn are left out" "$(! grep -q 'Skill edit' <<<"$out" && ! grep -q 'Lead 4, Lead 5' <<<"$out" && ! grep -q 'R1.9' <<<"$out" && echo 1)" "$out"
printf '# State\ncurrent_lead: x\nNothing owed.\n' > "$T/s2.md"; out=$($W starts --state "$T/s2.md")
ok "nothing owed: a 'none' line, no ACT" "$([ "$(acts "$out")" = 0 ] && grep -q 'none' <<<"$out" && echo 1)" "$out"
out=$($W starts --state "$T/nope.md"); ok "STATE unreadable: an ACT, never a silent pass" "$([ "$(acts "$out")" = 1 ] && grep -q 'not measured' <<<"$out" && echo 1)" "$out"
printf 'x start a lane at the founder'"'"'s next typed turn; start a lane at the founder'"'"'s next typed turn\n' > "$T/s3.md"
out=$($W starts --state "$T/s3.md"); ok "the same item twice is listed once" "$(grep -q 'owed at the founder.s next typed turn: 2:' <<<"$out" && echo 1)" "$out"
printf '\xff\xfe broken \xc3\x28\n' > "$T/s4.md"; out=$($W starts --state "$T/s4.md"); r=$?
ok "STATE not UTF-8: an ACT, exit 0, no traceback (reviewer Minor 1)" "$([ $r = 0 ] && [ "$(acts "$out")" = 1 ] && ! grep -q Traceback <<<"$out" && echo 1)" "exit $r: $out"
cat > "$T/s5.md" <<'X'
🔴 **(2) Founder's next typed turn:** (a) restart Lead B for #2401 (merge main; then label) (b) start a qa lane for R1.40
Standbys: start one more standby ("Lead 2 (series 3) · standby", P-749) at the founder's next typed turn.
Start a qa lane for R1.5 once #2400 is done, at the founder's next typed turn.
**Founder’s next typed turn**: restart Lead D; start a lane for R1.77
X
out=$($W starts --state "$T/s5.md")
ok "a heading item keeps a ; inside its brackets (one item, not two)" "$(grep -q 'owed  restart Lead B for #2401 (merge main; then label)$' <<<"$out" && ! grep -q 'owed  then label' <<<"$out" && echo 1)" "$out"
ok "a · inside quotes and brackets does not cut the item" "$(grep -q 'owed  Standbys: start one more standby ("Lead 2 (series 3) · standby", P-749) at the founder' <<<"$out" && echo 1)" "$out"
ok "'once #2400 is done' does not hide an owed start" "$(grep -q 'owed  Start a qa lane for R1.5 once #2400 is done' <<<"$out" && echo 1)" "$out"
ok "a heading with the colon outside the bold and a curly apostrophe lists every item" "$(grep -q 'owed  restart Lead D' <<<"$out" && grep -q 'owed  start a lane for R1.77' <<<"$out" && echo 1)" "$out"
ok "six owed in all" "$(grep -q 'typed turn: 6:' <<<"$out" && echo 1)" "$out"

# --- wiring in lead-watch.sh
L="$TOOLS/lead-watch.sh"
ok "lead-watch.sh step 13b runs lanes on the board and counts its ACT lines" "$(grep -q 'owed-watch.py" lanes --board' "$L" && grep -q 'echo "\$lr"; act=\$((act + \$(grep -c .^ACT. <<<"\$lr")))' "$L" && echo 1)" "no 13b wiring in $L"
ok "lead-watch.sh step 13c runs starts on STATE and counts its ACT lines" "$(grep -q 'owed-watch.py" starts --state "\$TOOLS/../STATE.md"' "$L" && grep -q 'echo "\$so"; act=\$((act + \$(grep -c .^ACT. <<<"\$so")))' "$L" && echo 1)" "no 13c wiring in $L"
finish
