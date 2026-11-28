#!/usr/bin/env bash
# P-857 (5) (founder 28 Nov, "cap the records"): a PR over 800 changed lines passes with the label "size: exception" and a
# "Size exception: <reason>" line in its body, so an exception no longer costs a DECISIONS row; the old "Size exception: P-NNN"
# form keeps working, and the records-only and under-limit passes are unchanged. Planted cases against pr-size.sh, and
# pr-rules.yml read for the label step. The base cases (800, 801, the old form, records only) are check-g4-rules.sh (6).
# Guard rows: guards.d/OS-857.sh. US$0, no network.   bash product/tools/check-size-exception.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/sizeex.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
W="$(cd "$TOOLS/../../../.." && pwd)/.github/workflows/pr-rules.yml"
printf '| P-1 | 1 Oct | the folder layout |\n| P-610 | 15 Nov | PRs under 800 lines |\n' > "$T/DEC.md"
ps() { out=$(printf '%s' "$3" | DECISIONS="$T/DEC.md" bash "$TOOLS/pr-size.sh" "$1" "$2" "$4" "$5"); r=$?; }
ps 900 100 "What and why."$'\n'"Size exception: one webhook flow, splitting it mid-feature is riskier" no yes
ok "over 800 with the label and a reason line passes, naming the reason" "$([ $r = 0 ] && echo "$out" | grep -q 'label "size: exception": one webhook flow' && echo 1)" "exit $r: $out"
ps 900 100 "What and why."$'\n'"Size exception:   "$'\n' no yes
ok "the label with an empty reason fails, naming the missing line" "$([ $r = 1 ] && echo "$out" | grep -q 'no line "Size exception: <reason>"' && echo 1)" "exit $r: $out"
ps 900 100 "What and why." no yes
ok "the label with no reason line fails" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
ps 900 100 "Size exception: one webhook flow" no no
ok "a reason line without the label fails, naming the label" "$([ $r = 1 ] && echo "$out" | grep -q 'add the label "size: exception"' && echo 1)" "exit $r: $out"
ps 900 100 '`Size exception: in backticks`' no yes
ok "a reason line in backticks (the template's inert example) is not read" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
ps 900 100 "Size exception: P-610" no no
ok "the old form (a size row of DECISIONS) passes without the label" "$([ $r = 0 ] && echo "$out" | grep -q 'recorded exception P-610' && echo 1)" "exit $r: $out"
ps 900 100 "Size exception: P-999" no no
ok "the old form naming no size row still fails without the label" "$([ $r = 1 ] && echo "$out" | grep -q 'P-999 is not a size row' && echo 1)" "exit $r: $out"
ps 900 100 "Size exception: P-610" no yes
ok "the old form passes with the label too" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
ps 600 200 "" no yes
ok "the label changes nothing under the limit" "$([ $r = 0 ] && echo "$out" | grep -q '(limit 800)' && echo 1)" "exit $r: $out"
ps 3000 0 "" yes no
ok "a records-only PR still passes at any size without the label" "$([ $r = 0 ] && echo "$out" | grep -q 'records only' && echo 1)" "exit $r: $out"
grep -qF 'issues/${{ github.event.pull_request.number }}/labels' "$W" && grep -qF "grep -qxF 'size: exception'" "$W" && grep -qF 'pr-size.sh" "$CODE" 0 "$REC" "$LAB"' "$W"
ok "pr-rules.yml reads the PR's labels at the run and hands the size label to pr-size.sh" "$([ $? = 0 ] && echo 1)"
grep -qF 'labels could not be read, so this step fails (LR-043, fail closed)"; exit 1; }' "$W"
ok "an unreadable label list fails the size step (LR-043, fail closed)" "$([ $? = 0 ] && echo 1)"
grep -qF 'screens|qa' "$W" && grep -qF 'records-only.sh" is-records --files' "$W"
ok "screens/qa records and records-only PRs stay outside the count, as before" "$([ $? = 0 ] && echo 1)"
finish
