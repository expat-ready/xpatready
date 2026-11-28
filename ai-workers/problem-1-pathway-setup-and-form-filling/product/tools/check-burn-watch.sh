#!/usr/bin/env bash
# Test of burn-watch.py (LR-099): over 3%/h twice is an ACT, once is not; a weekly reset or an account switch starts a new
# series; over 4%/h in an interval ending after 22:00 IST; 85% asks for a push alert; a log over 2 h old (or none) is an
# ACT and silences burn and night; each ACT once with --state; --log appends through usage-log.sh only when the latest
# reading is 55 min old or more. Fixture logs, a fixed --now. No network, US$0.   bash product/tools/check-burn-watch.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/burn.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
B="$TOOLS/burn-watch.py"; H=$'time_ist\tweekly_pct\taccount\tby'
log() { printf '%s\n' "$H" > "$T/u.tsv"; while [ $# -gt 0 ]; do printf '2026-11-28T%s:00+05:30\t%s\tA1\tLead 13\n' "$1" "$2" >> "$T/u.tsv"; shift 2; done; }
run() { python3 -I "$B" --file "$T/u.tsv" --now "2026-11-28T$1:00+05:30" "${@:2}"; }
acts() { grep -c '^ACT' <<< "$1"; }
log 10:00 20 11:00 24 12:00 28; out=$(run 12:10); r=$?
ok "over 3%/h twice (4 then 4): ACT burn, exit 0" "$([ $r = 0 ] && grep -q '^ACT   burn: 4.00%/h then 4.00%/h, over 3% of the weekly plan an hour twice' <<< "$out" && [ "$(acts "$out")" = 1 ] && echo 1)" "exit $r: $out"
log 10:00 20 11:00 22 12:00 26; out=$(run 12:10)
ok "over 3%/h once (2 then 4): no ACT, the burn line" "$([ "$(acts "$out")" = 0 ] && grep -q '^burn  weekly plan 26% (A1) at 12:00, last interval 4.00%/h' <<< "$out" && echo 1)" "$out"
log 10:00 20 11:00 23 12:00 26; out=$(run 12:10)
ok "exactly 3%/h twice: not over, no ACT" "$([ "$(acts "$out")" = 0 ] && echo 1)" "$out"
log 10:00 20 10:30 22 11:00 24; out=$(run 11:05)
ok "half-hour readings (4%/h twice): ACT burn" "$(grep -q '^ACT   burn: 4.00%/h then 4.00%/h' <<< "$out" && echo 1)" "$out"
log 10:00 20 11:00 24 11:05 27 12:05 31; out=$(run 12:10)
ok "a reading under 15 min before another is skipped (not a 36%/h interval): 6.46 then 4.00" "$(grep -q '^ACT   burn: 6.46%/h then 4.00%/h' <<< "$out" && echo 1)" "$out"
log 10:00 90 11:00 95 12:00 1 13:00 5; out=$(run 13:10)
ok "a weekly reset (95 → 1) starts a new series: one interval, no ACT" "$([ "$(acts "$out")" = 0 ] && echo 1)" "$out"
log 10:00 90 11:00 95 11:30 1 12:00 3 13:00 7; out=$(run 13:10)
ok "... and the reset's first readings still make a series (4 then 4 after it: ACT)" "$(grep -q '^ACT   burn: 4.00%/h then 4.00%/h' <<< "$out" && echo 1)" "$out"
log 10:00 29 11:00 34 11:10 33 12:10 37; out=$(run 12:15)
ok "a small drop (34 → 33) ends the series even when the reading before it is skipped: no ACT" "$([ "$(acts "$out")" = 0 ] && echo 1)" "$out"
printf '%s\n2026-11-28T10:00:00+05:30\t20\tA1\tLead 13\n2026-11-28T11:00:00+05:30\t40\tA2\tLead 13\n2026-11-28T12:00:00+05:30\t44\tA2\tLead 13\n' "$H" > "$T/u.tsv"; out=$(run 12:10)
ok "an account switch starts a new series: no ACT from A1 → A2" "$([ "$(acts "$out")" = 0 ] && echo 1)" "$out"
log 21:00 20 22:00 25; out=$(run 22:10)
ok "5%/h in an interval ending 22:00 IST: ACT night" "$(grep -q '^ACT   night: 5.00%/h in the interval ending 22:00 IST, over 4%/h' <<< "$out" && echo 1)" "$out"
log 20:30 20 21:30 25; out=$(run 22:05)
ok "... an interval ending 21:30, read at 22:05: no night ACT (judged by its end)" "$([ "$(acts "$out")" = 0 ] && echo 1)" "$out"
log 13:00 20 14:00 25; out=$(run 14:10)
ok "... the same at 14:10: no ACT" "$([ "$(acts "$out")" = 0 ] && echo 1)" "$out"
log 10:00 84 11:00 85; out=$(run 11:10)
ok "85%: ACT plan, a push alert to the founder" "$(grep -q '^ACT   plan: weekly plan at 85% (A1), 85% or more: send the founder a push alert' <<< "$out" && echo 1)" "$out"
log 10:00 83 11:00 84; out=$(run 11:10)
ok "84%: no plan ACT" "$([ "$(acts "$out")" = 0 ] && echo 1)" "$out"
log 08:00 20 09:00 21; out=$(run 11:30)
ok "the latest reading 2.5 h old: ACT log (the usage log stopped)" "$(grep -q '^ACT   log: the latest weekly-plan reading is 2.5 h old' <<< "$out" && echo 1)" "$out"
log 07:00 20 08:00 25 09:00 30; out=$(run 11:30)
ok "... a stale log silences burn (5 then 5 three hours ago): only the log ACT" "$([ "$(acts "$out")" = 1 ] && grep -q '^ACT   log:' <<< "$out" && echo 1)" "$out"
printf '%s\n' "$H" > "$T/u.tsv"; out=$(run 11:30)
ok "no reading at all: ACT log" "$(grep -q '^ACT   log: no weekly-plan reading' <<< "$out" && echo 1)" "$out"
out=$(python3 -I "$B" --file "$T/missing.tsv" --now 2026-11-28T11:30:00+05:30); r=$?
ok "a missing file: ACT log, exit 0" "$([ $r = 0 ] && grep -q '^ACT   log: no weekly-plan reading' <<< "$out" && echo 1)" "exit $r: $out"
log 10:00 20; printf '2026-11-28T10:30:00\t22\tA1\tLead 13\n' >> "$T/u.tsv"; out=$(run 10:40); r=$?
ok "a line with no timezone is skipped, not a crash" "$([ $r = 0 ] && grep -q '^burn  weekly plan 20% (A1) at 10:00' <<< "$out" && echo 1)" "exit $r: $out"
# Memory (--state): each ACT once.
mkdir -p "$T/st"; log 10:00 20 11:00 24 12:00 28 12:30 86
out=$(run 12:40 --state "$T/st"); out2=$(run 12:50 --state "$T/st")
ok "with --state: burn and plan are ACTs on the first check ..." "$([ "$(acts "$out")" = 2 ] && echo 1)" "$out"
ok "... and 'said' lines, not ACTs, on the next check with no new reading" "$([ "$(acts "$out2")" = 0 ] && grep -q '^burn  said burn already' <<< "$out2" && grep -q '^burn  said plan already (A1)' <<< "$out2" && echo 1)" "$out2"
printf '2026-11-28T13:30:00+05:30\t90\tA1\tLead 13\n' >> "$T/u.tsv"; out3=$(run 13:40 --state "$T/st")
ok "a new reading still over: burn again; plan stays said for the account" "$(grep -q '^ACT   burn:' <<< "$out3" && ! grep -q '^ACT   plan' <<< "$out3" && echo 1)" "$out3"
printf '2026-11-28T14:30:00+05:30\t2\tA1\tLead 13\n' >> "$T/u.tsv"; run 14:40 --state "$T/st" >/dev/null
printf '2026-11-28T15:30:00+05:30\t86\tA1\tLead 13\n' >> "$T/u.tsv"; out4=$(run 15:40 --state "$T/st")
ok "after a reset under 85%, crossing 85% again alerts again" "$(grep -q '^ACT   plan' <<< "$out4" && echo 1)" "$out4"
export USAGE_LOG_BY="Lead 13"
log 10:00 20; out=$(run 10:40 --log 22 A1)
ok "--log 40 min after the latest reading: nothing appended" "$([ "$(grep -c '^2026' "$T/u.tsv")" = 1 ] && echo 1)" "$out"
out=$(run 11:00 --log 22 A1)
ok "--log 60 min after: appended through usage-log.sh (a burn line says so)" "$([ "$(grep -c $'\t22\tA1\tLead 13$' "$T/u.tsv")" = 1 ] && grep -q '^burn  usage-log: ' <<< "$out" && echo 1)" "$out"
log 10:00 20; out=$(run 11:00 --log 23 "")
ok "--log with no account: the log's last account (A1)" "$([ "$(grep -c $'\t23\tA1\tLead 13$' "$T/u.tsv")" = 1 ] && echo 1)" "$out"
printf '%s\n' "$H" > "$T/u.tsv"; out=$(run 11:00 --log 23 "")
ok "--log with no account and an empty log: ACT, nothing appended" "$(grep -q '^ACT   burn: LEAD_WEEKLY is needed' <<< "$out" && [ "$(grep -c '^2026' "$T/u.tsv")" = 0 ] && echo 1)" "$out"
log 10:00 20; out=$(run 11:00 --log 120 A1)
ok "--log with a bad percent: usage-log.sh's refusal is an ACT, nothing appended" "$(grep -q '^ACT   burn: usage-log: weekly_pct' <<< "$out" && [ "$(grep -c '^2026' "$T/u.tsv")" = 1 ] && echo 1)" "$out"
log 10:00 20; out=$(run 10:10 --log "" "")
ok "--log with neither value (a check without get_usage): no extra ACT" "$([ "$(acts "$out")" = 0 ] && echo 1)" "$out"
ok "lead-watch runs it with the Lead's reading and its memory (step 1c4)" "$(grep -q 'burn-watch.py" --state "\$STATE_DIR" --log "\${LEAD_WEEKLY:-}" "\${LEAD_ACCOUNT:-}"' "$TOOLS/lead-watch.sh" && echo 1)" "no burn-watch call in lead-watch.sh"
finish
