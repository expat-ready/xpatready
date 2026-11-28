#!/usr/bin/env bash
# LR-051 (FP #215, OS-37): every hook guard's refusal carries "Rule <id>:", the reason and "Fix:" (refusal-triple.py),
# on the real guards, on planted fixtures, and in what three guards actually print. US$0, no network.
#   bash product/tools/check-refusal-triple.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/rt.XXXXXXXX"); trap 'rm -rf "$T"' EXIT
C="$TOOLS/refusal-triple.py"
out=$(python3 -I "$C"); r=$?
ok "every refusal of the hook guards on this tree carries the triple" "$([ $r = 0 ] && grep -q ' 0 missing a part' <<<"$out" && echo 1)" "exit $r: $out"
ok "... and the sites were found (at least 20)" "$(n=$(sed -n 's/^refusal-triple: \([0-9]*\) refusal sites.*/\1/p' <<<"$out"); [ "${n:-0}" -ge 20 ] && echo 1)" "$out"
plant() {  # $1 guard name, $2 sed edit → refusal-triple's output on a copy with that edit
  rm -rf "$T/t"; mkdir "$T/t"; cp "$TOOLS"/*.sh "$TOOLS"/*.py "$T/t/"; sed -i.bak "$2" "$T/t/$1"; rm -f "$T/t/$1.bak"
  python3 -I "$C" --tools "$T/t"; }
out=$(plant merge-guard.sh 's/Rule P-87: only/Only/'); r=$?
ok "a refusal with no rule id fails, naming the file and line" "$([ $r = 1 ] && grep -q '^merge-guard.sh:[0-9]*: the refusal lacks a rule id' <<<"$out" && echo 1)" "exit $r: $out"
out=$(plant away-guard.sh 's/ Fix: write it/ Write it/'); r=$?
ok "a refusal with no allowed fix fails" "$([ $r = 1 ] && grep -q '^away-guard.sh:[0-9]*: the refusal lacks the allowed fix' <<<"$out" && echo 1)" "exit $r: $out"
out=$(plant lane-preflight.sh 's/Rule P-734: lane brief/lane brief/'); r=$?
ok "a site never borrows the next site's markers (lane-preflight's brief refusals, 3 lines apart)" "$([ $r = 1 ] && grep -q '^lane-preflight.sh:[0-9]*: the refusal lacks a rule id' <<<"$out" && echo 1)" "exit $r: $out"
out=$(plant wip-guard.py 's/ Fix: get qa/ Get qa/'); r=$?
ok "a Python guard's message, built below its deny line, is read too" "$([ $r = 1 ] && grep -q '^wip-guard.py:[0-9]*: the refusal lacks the allowed fix' <<<"$out" && echo 1)" "exit $r: $out"
rm -rf "$T/t"; mkdir "$T/t"; cp "$TOOLS"/*.sh "$TOOLS"/*.py "$T/t/"; rm "$T/t/stop-check.sh"; out=$(python3 -I "$C" --tools "$T/t"); r=$?
ok "a guard missing from the tree fails (its refusals were not checked)" "$([ $r = 1 ] && grep -q '^stop-check.sh: missing' <<<"$out" && echo 1)" "exit $r: $out"
# What the guards print: the triple is in the reason an agent reads.
triple() { jq -r '.hookSpecificOutput.permissionDecisionReason // .reason // ""' <<<"$1" | tr '\n' ' ' | grep -qE '^(- )?Rule [A-Z][A-Za-z]*-?[0-9][0-9A-Za-z]*:.*Fix:' && echo 1; }
touch "$T/away"; out=$(echo '{}' | AWAY_FLAG="$T/away" bash "$TOOLS/away-guard.sh" --hook)
ok "away-guard's refusal reads 'Rule P-388: ... Fix: ...'" "$(triple "$out")" "$out"
mkdir -p "$T/g"; git -C "$T/g" init -q
out=$(jq -n --arg c "$T/g" '{cwd:$c,tool_input:{command:("gh pr " + "close 1")}}' | CLAUDE_CODE_REMOTE=true bash "$TOOLS/merge-guard.sh")
ok "merge-guard's refusal reads 'Rule P-87: ... Fix: ...'" "$(triple "$out")" "$out"
out=$(jq -n '{last_assistant_message:"Runners are the bottleneck tonight."}' | bash "$TOOLS/resource-claim-guard.sh")
ok "resource-claim-guard's refusal reads 'Rule P-771: ... Fix: ...'" "$(triple "$out")" "$out"
finish
