#!/usr/bin/env bash
# LR-047, OS-30 (P-683): a ready PR with no "Reviewer: Approve <sha>" comment line gets a warning from pr-rules, never a
# failure; an unreadable comment list fails (LR-043). Runs ready-approve.py on planted comments and the pr-rules.yml
# step as written with a stand-in gh; no network, US$0.
#   bash product/tools/check-ready-approve.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/rdyapp.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
ROOTD="$(cd "$TOOLS/../../../.." && pwd)"; W="$ROOTD/.github/workflows/pr-rules.yml"; PAT="a ready PR carries the reviewer's Approve comment line"
H=0123456789abcdef0123456789abcdef01234567; OLD=fedcba9876543210fedcba9876543210fedcba98
js() { python3 -c 'import json,sys; [print(json.dumps(a)) for a in sys.argv[1:]]' "$@"; }
# ra < input: the tool on planted comments (input by redirection, so o and r stay in this shell)
ra() { o=$(python3 -I "$TOOLS/ready-approve.py" --head "${HEAD:-$H}" 2>&1); r=$?; }

ra < <(js "looks good"); ok "(1) no Approve line: a warning, exit 0" "$([ $r = 0 ] && grep -q '^::warning' <<<"$o" && grep -q 'APPROVE MISSING' <<<"$o" && echo 1)" "exit $r: $o"
ra < <(true); ok "(1) no comments at all: a warning, exit 0" "$([ $r = 0 ] && grep -q 'APPROVE MISSING' <<<"$o" && echo 1)" "exit $r: $o"
ra < <(js "round 1" "Reviewer: Approve $H"); ok "(2) an Approve naming the head: OK" "$([ $r = 0 ] && grep -q "APPROVE OK $H" <<<"$o" && echo 1)" "exit $r: $o"
ra < <(js "notes
  Reviewer: Approve $H
more"); ok "(2) the Approve line inside a longer comment counts" "$([ $r = 0 ] && grep -q 'APPROVE OK' <<<"$o" && echo 1)" "exit $r: $o"
ra < <(js "Reviewer: Approve $OLD"); ok "(3) an Approve of an older head: a notice, exit 0" "$([ $r = 0 ] && grep -q '^::notice' <<<"$o" && grep -q 'APPROVE OLDER HEAD' <<<"$o" && echo 1)" "exit $r: $o"
ra < <(js "> Reviewer: Approve $H"); ok "(4) a quoted Approve line does not count (OS-81)" "$(grep -q 'APPROVE MISSING' <<<"$o" && echo 1)" "$o"
ra < <(js "\`Reviewer: Approve $H\`"); ok "(4) a backticked Approve line does not count" "$(grep -q 'APPROVE MISSING' <<<"$o" && echo 1)" "$o"
ra < <(js "Reviewer: Changes $H"); ok "(4) a Changes line is not an Approve" "$(grep -q 'APPROVE MISSING' <<<"$o" && echo 1)" "$o"
ra < <(js "Reviewer: Approve ${H:0:12}"); ok "(4) a short SHA is not an Approve" "$(grep -q 'APPROVE MISSING' <<<"$o" && echo 1)" "$o"
ra < <(printf 'not json\n'); ok "(5) an unreadable comment line fails (exit 2)" "$([ $r = 2 ] && echo 1)" "exit $r: $o"
ra < <(printf '{"body":"x"}\n'); ok "(5) a comment that is not a string fails (exit 2)" "$([ $r = 2 ] && echo 1)" "exit $r: $o"
HEAD=main ra < <(js "Reviewer: Approve $H"); ok "(5) an unreadable head fails (exit 2)" "$([ $r = 2 ] && echo 1)" "exit $r: $o"

# (6) The pr-rules step as written: skips drafts, bots and records-only PRs; a failed comment read fails the step.
grep -F -- "- name: $PAT" "$W" >/dev/null; ok "(6) the step is in pr-rules.yml" "$([ $? = 0 ] && echo 1)"
C=$(grep -F -A1 -- "- name: $PAT" "$W" | tail -1)
for want in "!github.event.pull_request.draft" "github.event.pull_request.user.type != 'Bot'" "steps.rec.outputs.records != 'yes'"; do
  grep -qF -- "$want" <<<"$C"; ok "(6) the step's condition has $want" "$([ $? = 0 ] && echo 1)" "$C"
done
S=$(awk -v pat="$PAT" 'index($0, "- name: ") && index($0, pat) {on = 1; next} on && /^      - (name|uses):|^  [a-z]/ {exit}
  on && /run: \|/ {blk = 1; next} on && blk {sub(/^          /, ""); print}' "$W" \
  | sed -e 's/\${{ github.repository }}/o\/r/g' -e 's/\${{ github.event.pull_request.number }}/77/g')
mkdir -p "$T/bin"; cat > "$T/bin/gh" <<'EOF'
#!/bin/sh
[ -n "$DOWN" ] && exit 1
case "$*" in *"repos/o/r/issues/77/comments"*) cat "$CJ";; *) exit 1;; esac
EOF
chmod +x "$T/bin/gh"; js "Reviewer: Approve $H" > "$T/c.jsonl"
st() { o=$(cd "$ROOTD" && PATH="$T/bin:$PATH" CJ="$T/c.jsonl" DOWN="${1:-}" T="$TOOLS" HEAD_SHA="$H" bash -c "$S" 2>&1); r=$?; }
st; ok "(6) the step passes an approved head" "$([ $r = 0 ] && grep -q 'APPROVE OK' <<<"$o" && echo 1)" "exit $r: $o"
grep -F -A12 -- "- name: $PAT" "$W" | grep -qF -- "--jq '.[] | (.body // \"\") | @json'"; ok "(6) a comment with a null body is read as empty text, not a failure" "$([ $? = 0 ] && echo 1)"
st down; ok "(6) a failed comment read fails the step (LR-043)" "$([ $r != 0 ] && echo 1)" "exit $r: $o"
finish
