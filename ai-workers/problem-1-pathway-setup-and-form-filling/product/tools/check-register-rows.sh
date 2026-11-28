#!/usr/bin/env bash
# Test of LR-173 (founder P-860/P-861, 28 Nov): dropped and deferred rows never get lost. register-rows.py check fails a DROP
# row naming no other home and a DEFERRED row naming no trigger, and passes them once named; lab-progress.py leaves
# DEFERRED rows out of the goal and prints their count apart; register-rows.py due (lead-watch's step 13a2) ACTs on a
# DEFERRED row whose date trigger is due and not on one still ahead. Fixture registers; no network, US$0.
#   bash product/tools/check-register-rows.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/regrows.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
RR="$TOOLS/register-rows.py"; LP="$TOOLS/lab-progress.py"
row() { echo "| $1 | item $1 | src | $2 | $3 | lane | done when | $4 | ${5:-notes} |"; }
reg() { { echo "| ID | Item | Source(s) | Verdict | Reason and citation | Lane | Done when | Status | Gate notes |"; echo "|---|---|---|---|---|---|---|---|---|"; printf '%s\n' "$@"; } > "$T/r.md"; }
chk() { out=$(python3 -I "$RR" check --file "$T/r.md"); r=$?; }
# DROP
reg "$(row LR-001 DROP 'not needed now' Intended)"; chk
ok "a DROP row naming no other home fails (exit 1, one FAIL line naming it)" "$([ $r = 1 ] && grep -q '^FAIL  LR-001: DROP names no other home' <<<"$out" && echo 1)" "rc=$r $out"
reg "$(row LR-001 'DROP (exists elsewhere: LR-072 and the qa skill)' 'covered' Intended)"; chk
ok "a DROP row with \"exists elsewhere: <where>\" in its Verdict passes" "$([ $r = 0 ] && echo 1)" "rc=$r $out"
reg "$(row LR-001 DROP 'replaced; exists elsewhere: #3896 settings' Intended)"; chk
ok "... or in its Reason cell" "$([ $r = 0 ] && echo 1)" "rc=$r $out"
reg "$(row LR-001 DROP 'x' Intended 'exists elsewhere: LR-144')"; chk
ok "... or in its Gate notes cell" "$([ $r = 0 ] && echo 1)" "rc=$r $out"
reg "$(row LR-001 DROP 'exists elsewhere:' Intended)"; chk
ok "\"exists elsewhere:\" with nothing after it still fails" "$([ $r = 1 ] && echo 1)" "rc=$r $out"
reg "$(row LR-002 'DEFERRED (trigger:)' 'later' Intended)"; chk
ok "\"trigger:\" with nothing after it still fails" "$([ $r = 1 ] && echo 1)" "rc=$r $out"
# DEFERRED
reg "$(row LR-002 DEFERRED 'later' Intended)"; chk
ok "a DEFERRED row naming no trigger fails" "$([ $r = 1 ] && grep -q '^FAIL  LR-002: DEFERRED names no trigger' <<<"$out" && echo 1)" "rc=$r $out"
reg "$(row LR-002 'DEFERRED (trigger: 2026-12-05)' 'later' Intended)"; chk
ok "a DEFERRED row with a date trigger passes" "$([ $r = 0 ] && echo 1)" "rc=$r $out"
reg "$(row LR-002 'DEFERRED (P-860: revisit when measures.py shows a need)' 'later' Intended)"; chk
ok "a DEFERRED row with an event (\"revisit when ...\") passes" "$([ $r = 0 ] && echo 1)" "rc=$r $out"
reg "$(row LR-003 DO 'x' Intended)" "$(row LR-004 DONE 'x' 'Proven')"; chk
ok "DO and DONE rows are not asked for either" "$([ $r = 0 ] && echo 1)" "rc=$r $out"
# lab-progress: DEFERRED out of the goal, counted apart
reg "$(row LR-010 DO x 'Built #1')" "$(row LR-011 DO x Intended)" "$(row LR-012 'DEFERRED (trigger: 2026-12-05)' x Intended)" "$(row LR-013 'DROP (exists elsewhere: LR-010)' x Intended)"
out=$(TMPDIR="$T" python3 -I "$LP" --file "$T/r.md")
ok "lab-progress.py leaves the DEFERRED row out of the goal (Built 1/2) and prints \"1 deferred\" apart" "$(grep -q 'Built 1/2 (50%)' <<<"$out" && grep -q '1 deferred (out of the goal)' <<<"$out" && echo 1)" "$out"
# due: a date trigger today or past is an ACT; one ahead is not; an event is counted, never an ACT
reg "$(row LR-020 'DEFERRED (trigger: 2026-11-28)' x Intended)" "$(row LR-021 'DEFERRED (trigger: 2026-12-05)' x Intended)" "$(row LR-022 'DEFERRED (revisit when Release 1 is near done)' x Intended)"
out=$(python3 -I "$RR" due --file "$T/r.md" --today 2026-11-28)
ok "due: a DEFERRED row whose date trigger is today is one ACT" "$([ "$(grep -c '^ACT' <<<"$out")" = 1 ] && grep -q '^ACT   deferred row due: LR-020 (trigger 2026-11-28' <<<"$out" && echo 1)" "$out"
ok "... the one still ahead and the event row are not, and the count line says 3 (2 on a date, 1 on an event)" "$(! grep -qE 'LR-021|LR-022' <<<"$out" && grep -q '^deferred: 3 rows (2 on a date, 1 on an event' <<<"$out" && echo 1)" "$out"
out=$(python3 -I "$RR" due --file "$T/r.md" --today 2026-11-27)
ok "due: the day before its date, no ACT" "$(! grep -q '^ACT' <<<"$out" && echo 1)" "$out"
# lead-watch's lines: the check's FAILs as one ACT, then due
reg "$(row LR-030 DROP x Intended)" "$(row LR-031 DEFERRED x Intended)" "$(row LR-032 'DEFERRED (trigger: 2026-11-01)' x Intended)"
out=$(python3 -I "$RR" lines --file "$T/r.md" --today 2026-11-28)
ok "lines: one ACT for the rows breaking the rule, naming both, and one ACT for the due row" "$([ "$(grep -c '^ACT' <<<"$out")" = 2 ] && grep -q '^ACT   register rows: 2 DROP/DEFERRED row(s) without a home or trigger: LR-030, LR-031' <<<"$out" && grep -q 'deferred row due: LR-032' <<<"$out" && echo 1)" "$out"
ok "lead-watch.sh runs register-rows.py lines on origin/main and counts its ACT lines" "$(grep -q 'rr=$(python3 -I "$TOOLS/register-rows.py" lines --ref origin/main' "$TOOLS/lead-watch.sh" && grep -q '^echo "$rr"; act=$((act + $(grep -c .^ACT. <<<"$rr")))' "$TOOLS/lead-watch.sh" && echo 1)"
finish
