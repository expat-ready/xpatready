#!/usr/bin/env bash
# B192 (P-618): outside-deps-watch.py ACTs on a register row inside its start window, on a row stuck over 48 h and on a
# blocked row with no fallback or no decision date, on a decision date reached, and stays quiet on a healthy register. Planted registers in a temp
# dir, a fixed --now, no network, US$0. Run by check-guards.sh.
#   bash product/tools/check-outside-deps-watch.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
W="$TOOLS/outside-deps-watch.py"; NOW="2026-11-20 12:00"
reg() {  # $1 file, then table rows
  f=$1; shift
  { echo '# Outside dependencies'; echo
    echo '| # | Provider · what | Lead time (cited) | Needed by (row, date) | Start | Owner | Status (20 Nov 11:00 IST) | Decision date · fallback |'
    echo '|---|---|---|---|---|---|---|---|'
    for r in "$@"; do echo "$r"; done; } > "$f"
}
HEALTHY=(
  '| 1 | Alpha · domain | 1 day | PF-1, 1 Dec | started 18 Nov | founder | waiting: case filed 19 Nov | 22 Nov · Other registrar |'
  '| 2 | Beta · sandbox | to cite | FO-1, 10 Dec | 25 Nov | founder | not started | 25 Nov · Sample adapter |'
  '| 3 | Gamma · verification | to cite | FO-2 | when FO-2 PR is up | founder | not started | set when filed · test mode |'
  '| 4 | Delta · mail | to cite | first mail | started 10 Nov | founder | done 15 Nov | — |'
  '| 5 | Epsilon · sign-up | to cite | FO-3 | started 19 Nov | founder | blocked: ticket opened 19 Nov 13:00 IST | 22 Nov · Other provider |'
  '| 6 | Zeta · past start, done | to cite | FO-4 | 1 Nov | founder | done 12 Nov | — |'
)
run() { out=$(python3 "$W" --file "$1" --now "$NOW" 2>&1); rc=$?; }

reg "$T/ok.md" "${HEALTHY[@]}"; run "$T/ok.md"
ok "a healthy register prints no ACT and exits 0" "$([ $rc = 0 ] && ! grep -q '^ACT' <<<"$out" && echo 1)" "exit $rc: $out"

reg "$T/win.md" "${HEALTHY[@]}" '| 7 | Eta · partner account | needs documents | M4, 15 Dec | 19 Nov | founder | not started | 25 Nov · Google only |'; run "$T/win.md"
ok "a row whose start date has passed, not done, ACTs" "$([ $rc = 1 ] && grep -q '^ACT outside: 7 Eta: start date 19 Nov reached' <<<"$out" && echo 1)" "exit $rc: $out"
reg "$T/today.md" "${HEALTHY[@]}" '| 7 | Eta · partner account | x | M4 | 20 Nov | founder | not started | 25 Nov · Google only |'; run "$T/today.md"
ok "a row starting today ACTs" "$([ $rc = 1 ] && grep -q '^ACT outside: 7 Eta: start date 20 Nov' <<<"$out" && echo 1)" "exit $rc: $out"
reg "$T/now.md" "${HEALTHY[@]}" '| 7 | Eta · ownership | n/a | launch | now | founder | risk: a third party holds it | before launch · own access |'; run "$T/now.md"
ok "a row starting 'now' and not done ACTs" "$([ $rc = 1 ] && grep -q '^ACT outside: 7 Eta: start date' <<<"$out" && echo 1)" "exit $rc: $out"

reg "$T/stuck.md" "${HEALTHY[@]}" '| 7 | Eta · domain | 1 day | PF-2 | started 17 Nov | founder | blocked: refused; ticket opened 18 Nov 11:00 IST | 22 Nov · Other registrar |'; run "$T/stuck.md"
ok "a row blocked 49 h ACTs" "$([ $rc = 1 ] && grep -q '^ACT outside: 7 Eta: blocked for 49 h' <<<"$out" && echo 1)" "exit $rc: $out"
reg "$T/stuck47.md" "${HEALTHY[@]}" '| 7 | Eta · domain | 1 day | PF-2 | started 17 Nov | founder | blocked: refused; ticket opened 18 Nov 13:00 IST | 22 Nov · Other registrar |'; run "$T/stuck47.md"
ok "a row blocked 47 h stays quiet" "$([ $rc = 0 ] && echo 1)" "exit $rc: $out"
reg "$T/stuckh.md" "${HEALTHY[@]}" '| 7 | Eta · api | x | FO-5 | started 17 Nov | founder | stuck: no reply | 22 Nov · Sample adapter |'
sed -i.bak 's/Status (20 Nov 11:00 IST)/Status (18 Nov 11:00 IST)/' "$T/stuckh.md"; run "$T/stuckh.md"
ok "a stuck row with no date of its own takes the header's date (49 h) and ACTs" "$([ $rc = 1 ] && grep -q '^ACT outside: 7 Eta: stuck for 49 h' <<<"$out" && echo 1)" "exit $rc: $out"

reg "$T/nofb.md" "${HEALTHY[@]}" '| 7 | Eta · sign-up | x | FO-6 | started 19 Nov | founder | blocked: refused 20 Nov | 22 Nov · |'; run "$T/nofb.md"
ok "a blocked row with no fallback ACTs" "$([ $rc = 1 ] && grep -q '^ACT outside: 7 Eta: blocked with no fallback' <<<"$out" && echo 1)" "exit $rc: $out"
reg "$T/nodate.md" "${HEALTHY[@]}" '| 7 | Eta · sign-up | x | FO-6 | started 19 Nov | founder | blocked: refused 20 Nov | set later · Other provider |'; run "$T/nodate.md"
ok "a blocked row with no decision date ACTs" "$([ $rc = 1 ] && grep -q '^ACT outside: 7 Eta: blocked with no decision date' <<<"$out" && echo 1)" "exit $rc: $out"

reg "$T/dec.md" "${HEALTHY[@]}" '| 7 | Eta · partner | x | M4 | not started | founder | not started | 20 Nov · Google only |'; run "$T/dec.md"
ok "a row not done whose decision date is today ACTs, naming the fallback" "$([ $rc = 1 ] && grep -q '^ACT outside: 7 Eta: decision date 20 Nov reached.*Google only' <<<"$out" && echo 1)" "exit $rc: $out"

reg "$T/old.md" "${HEALTHY[@]}" '| 7 | Eta · partner | x | M4 | not started | founder | not started | 22 Nov · Google only |'
out=$(python3 "$W" --file "$T/old.md" --now "2027-06-25 09:00" 2>&1); rc=$?
ok "a yearless decision date seven months overdue still ACTs (Devin on #1849)" "$(grep -q '^ACT outside: 7 Eta: decision date 22 Nov reached' <<<"$out" && echo 1)" "exit $rc: $out"
reg "$T/jan.md" '| 1 | Eta · partner | x | M4 | 3 Jan | founder | not started | 10 Jan · Google only |'
out=$(python3 "$W" --file "$T/jan.md" --now "2026-12-01 09:00" 2>&1); rc=$?
ok "a January start written in November is next year's, so it is not yet due" "$([ $rc = 0 ] && echo 1)" "exit $rc: $out"
out=$(python3 "$W" --file "$T/jan.md" --now "2027-01-03 09:00" 2>&1); rc=$?
ok "... and it ACTs on 3 Jan across the year boundary" "$([ $rc = 1 ] && grep -q '^ACT outside: 1 Eta: start date 03 Jan' <<<"$out" && echo 1)" "exit $rc: $out"

reg "$T/three.md" "${HEALTHY[@]}" \
  '| 7 | Eta · a | x | y | 19 Nov | founder | not started | 25 Nov · z |' \
  '| 8 | Theta · b | x | y | started 17 Nov | founder | blocked: since 17 Nov | 22 Nov · z |' \
  '| 9 | Iota · c | x | y | started 19 Nov | founder | blocked: refused 20 Nov | |'
run "$T/three.md"
ok "exit code = number of ACT lines" "$([ $rc = 4 ] && [ "$(grep -c '^ACT' <<<"$out")" = 4 ] && echo 1)" "exit $rc: $out"

echo 'no table here' > "$T/bad.md"; run "$T/bad.md"
ok "a register with no table ACTs and exits 99" "$([ $rc = 99 ] && grep -q '^ACT outside: register' <<<"$out" && echo 1)" "exit $rc: $out"
run "$T/missing.md"
ok "a missing register ACTs and exits 99" "$([ $rc = 99 ] && grep -q '^ACT outside: register unreadable' <<<"$out" && echo 1)" "exit $rc: $out"

grep -q 'outside-deps-watch.py' "$TOOLS/lead-watch.sh"
ok "lead-watch.sh calls outside-deps-watch.py" "$([ $? = 0 ] && echo 1)"
finish
