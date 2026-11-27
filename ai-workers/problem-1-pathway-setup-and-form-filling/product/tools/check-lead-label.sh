#!/usr/bin/env bash
# A435 (founder 27 Nov; LR-157): routine PRs queue by themselves on the reviewer's Approve, a Lead-read PR through one
# narrow command. Part 1 runs lead-label.sh with GitHub answered by a stand-in curl (the PR, its comments, the label
# POST/DELETE written to a log): it labels only an open, ready, main-based, same-repository PR whose last reviewer line
# about the head is "Reviewer: Approve <full head SHA>", and refuses (exit 1, nothing changed) a stale head, a short SHA,
# a later Changes line, a forged or unknown commenter, a draft, a closed PR, a fork, a batch, a bad argument, unreadable
# comments, a head that moves while labelling, and a copy of the script that is not origin/main's.
# Part 2 keeps the auto-queue's own cases (they live with their scripts; this names them so none is dropped silently):
# check-queue-gate.sh (queue-gate.sh label: a reviewed green head is labelled; a stale-head Approve, a forged Approve
# and every Lead-read path are refused) and check-label-sweep.sh (a label a workflow's token put on, the self-applied
# approval, comes off unless main's queue gate judges the PR eligible). US$0, no network.
#   bash product/tools/check-lead-label.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/leadlabel.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/fx"
cat > "$T/bin/curl" <<'EOF'
#!/usr/bin/env bash
m=GET; d=""; u=""
while [ $# -gt 0 ]; do case "$1" in -X) m=$2; shift;; -d) d=$2; shift;; -H) shift;; http*) u=$1;; esac; shift; done
p=${u#https://api.test/repos/o/r/}; pg=$(printf '%s' "$u" | sed -n 's/.*[?&]page=\([0-9]*\).*/\1/p')
case "$m $p" in
  "GET pulls/"*) [ -f "$FX/pr.json" ] || { echo '{"message":"Not Found"}'; exit 22; }
    if [ -f "$FX/labelled" ] && [ -f "$FX/pr-after.json" ]; then cat "$FX/pr-after.json"; else cat "$FX/pr.json"; fi;;
  "GET issues/"*/comments*) [ -n "${FAIL_COMMENTS:-}" ] && { echo '{"message":"Server Error"}'; exit 22; }
    [ "${pg:-1}" = 1 ] && cat "$FX/comments.json" || echo '[]';;
  "GET actions/variables/REVIEWERS") [ -f "$FX/reviewers" ] && jq -n --arg v "$(cat "$FX/reviewers")" '{name: "REVIEWERS", value: $v}' || { echo '{"message":"Not Found"}'; exit 22; };;
  "POST issues/"*/labels) echo "LABEL $(echo "$d" | jq -r '.labels[0]')" >> "$FX/log"; : > "$FX/labelled"; echo '[]';;
  "DELETE issues/"*/labels/*) echo "UNLABEL" >> "$FX/log"; echo '[]';;
  *) echo "unexpected $m $p" >> "$FX/log"; exit 22;;
esac
EOF
chmod +x "$T/bin/curl"
L="$TOOLS/lead-label.sh"
if [ ! -f "$L" ]; then ok "lead-label.sh exists (A435)" 0 "no $L"; finish; fi
HEAD1=a1b2c3d4e5a1b2c3d4e5a1b2c3d4e5a1b2c3d4e5; OLD=b2c3d4e5f6b2c3d4e5f6b2c3d4e5f6b2c3d4e5f6; HEAD2=c3d4e5f6a7c3d4e5f6a7c3d4e5f6a7c3d4e5f6a7   # a SHA has a digit and a letter (queue-gate.sh)
prj() {  # prj <head> [state] [draft] [base] [head ref] [head repo] [labels csv] → pr.json
  jq -n --arg h "$1" --arg s "${2:-open}" --argjson d "${3:-false}" --arg b "${4:-main}" --arg r "${5:-claude/x}" --arg rp "${6:-o/r}" --arg l "${7:-}" \
    '{number: 7, state: $s, draft: $d, base: {ref: $b}, head: {sha: $h, ref: $r, repo: {full_name: $rp}}, labels: ($l | split(",") | map(select(length > 0)) | map({name: .}))}' > "$T/fx/pr.json"; }
cmt() {  # cmt <login> <association> <body> [<login> <association> <body>]... → comments.json, in order
  local a='[]'; while [ $# -ge 3 ]; do a=$(jq -c --arg l "$1" --arg s "$2" --arg b "$3" '. + [{user: {login: $l}, author_association: $s, body: $b}]' <<< "$a"); shift 3; done
  echo "$a" > "$T/fx/comments.json"; }
run() {  # run [args...] → $out $log $r (REVIEWERS from $REV when set; the variable's file otherwise)
  : > "$T/fx/log"; rm -f "$T/fx/labelled"
  if [ -n "${REV+x}" ]; then out=$(PATH="$T/bin:$PATH" FX="$T/fx" GH_TOKEN=x REPO=o/r API=https://api.test LEAD_LABEL_MAIN_CHECK=0 REVIEWERS="$REV" FAIL_COMMENTS="${FAIL_COMMENTS:-}" bash "$L" "$@" 2>&1); r=$?
  else out=$(PATH="$T/bin:$PATH" FX="$T/fx" GH_TOKEN=x REPO=o/r API=https://api.test LEAD_LABEL_MAIN_CHECK=0 FAIL_COMMENTS="${FAIL_COMMENTS:-}" bash "$L" "$@" 2>&1); r=$?; fi
  log=$(cat "$T/fx/log"); }
labelled() { [ $r = 0 ] && [ "$log" = "LABEL review: approved" ] && echo 1; }
refused() { [ $r = 1 ] && [ -z "$log" ] && grep -q '^lead-label: refused: ' <<< "$out" && echo 1; }

# --- part 1: lead-label.sh
prj $HEAD1; cmt o OWNER "Reviewer: Approve $HEAD1"; REV="" run 7
ok "the owner's \"Reviewer: Approve <full head>\": labelled, exit 0" "$(labelled)" "exit $r: $out / $log"
cmt o OWNER "**Reviewer: Approve** \`$HEAD1\` (Opus, diff-only)"; REV="" run 7
ok "markdown around the Approve line is read as the line" "$(labelled)" "exit $r: $out / $log"
cmt o OWNER "Reviewer: Approve $OLD"; REV="" run 7
ok "stale head: an Approve naming an older commit is refused, nothing labelled" "$(refused)" "exit $r: $out / $log"
cmt o OWNER "Reviewer: Approve $HEAD1" o OWNER "Reviewer: Approve $OLD"; REV="" run 7
ok "an Approve on an older commit after one on the head does not undo it (the last line about the head decides)" "$(labelled)" "exit $r: $out / $log"
cmt o OWNER "Reviewer: Approve ${HEAD1:0:9}"; REV="" run 7
ok "a short SHA is not the head: refused (the full 40 characters, as queue-gate.sh)" "$(refused)" "exit $r: $out / $log"
cmt o OWNER "Reviewer: Approve $HEAD1" o OWNER "Reviewer: Changes needed $HEAD1: M1"; REV="" run 7
ok "a later \"Reviewer: Changes\" on the same head wins: refused" "$(refused)" "exit $r: $out / $log"
cmt o OWNER "Reviewer: Approve $HEAD1" o OWNER "Reviewer: Changes requested, see M2"; REV="" run 7
ok "a later verdict naming no SHA wins: refused" "$(refused)" "exit $r: $out / $log"
cmt someone NONE "Reviewer: Approve $HEAD1"; REV="" run 7
ok "forged: an Approve by an account without write access is refused" "$(refused)" "exit $r: $out / $log"
cmt helper COLLABORATOR "Reviewer: Approve $HEAD1"; REV="" run 7
ok "forged: a collaborator not in REVIEWERS is refused" "$(refused)" "exit $r: $out / $log"
REV="other helper" run 7
ok "a known reviewer (REVIEWERS) with write access: labelled" "$(labelled)" "exit $r: $out / $log"
cmt helper NONE "Reviewer: Approve $HEAD1"; REV=helper run 7
ok "forged: a known reviewer's login without write access is refused" "$(refused)" "exit $r: $out / $log"
cmt helper MEMBER "Reviewer: Approve $HEAD1"; echo "helper" > "$T/fx/reviewers"; unset REV; run 7
ok "REVIEWERS unset: the repository variable is read (a known reviewer labels)" "$(labelled)" "exit $r: $out / $log"
rm -f "$T/fx/reviewers"; run 7
ok "REVIEWERS unset and the variable unreadable: the owner alone counts (refused)" "$(refused)" "exit $r: $out / $log"
cmt o OWNER "> Reviewer: Approve $HEAD1"; REV="" run 7
ok "a quoted Approve line (> ...) is not the reviewer's own: refused" "$(refused)" "exit $r: $out / $log"
cmt o OWNER "Reviewer: Approve $HEAD1"
prj $HEAD1 closed; REV="" run 7; ok "a closed PR is refused" "$(refused)" "exit $r: $out / $log"
prj $HEAD1 open true; REV="" run 7; ok "a draft is refused" "$(refused)" "exit $r: $out / $log"
prj $HEAD1 open false release; REV="" run 7; ok "a PR not based on main is refused" "$(refused)" "exit $r: $out / $log"
prj $HEAD1 open false main mergify/merge-queue/1; REV="" run 7; ok "a merge-queue batch is refused" "$(refused)" "exit $r: $out / $log"
prj $HEAD1 open false main claude/x someone/r; REV="" run 7; ok "a fork's head is refused" "$(refused)" "exit $r: $out / $log"
prj $HEAD1 open false main claude/x o/r "review: approved,queued"; REV="" run 7
ok "already labelled: exit 0, nothing posted" "$([ $r = 0 ] && [ -z "$log" ] && echo 1)" "exit $r: $out / $log"
prj $HEAD1; rm -f "$T/fx/pr.json"; REV="" run 7; ok "the PR cannot be read: refused" "$(refused)" "exit $r: $out / $log"
prj $HEAD1; FAIL_COMMENTS=1 REV="" run 7; ok "the comments cannot be read: refused (fails closed)" "$(refused)" "exit $r: $out / $log"
for a in "" "7x" "07" "7 8" "--force"; do
  # shellcheck disable=SC2086
  REV="" run $a; ok "argument '${a}': refused with the usage, nothing posted" "$(refused)" "exit $r: $out / $log"
done
jq --arg h "$HEAD2" '.head.sha = $h' "$T/fx/pr.json" > "$T/fx/pr-after.json"; REV="" run 7; rm -f "$T/fx/pr-after.json"
ok "the head moves while labelling: the label comes off again, exit 1" "$([ $r = 1 ] && [ "$log" = "LABEL review: approved
UNLABEL" ] && grep -q "head moved" <<< "$out" && echo 1)" "exit $r: $out / $log"

# The accident guard: a copy whose lead-label.sh is not origin/main's refuses before any API call.
O="$T/origin.git"; C="$T/copy"; git init -q --bare -b main "$O"; git clone -q "$O" "$C" 2>/dev/null
git -C "$C" config user.email t@t; git -C "$C" config user.name t; git -C "$C" config commit.gpgsign false
mkdir -p "$C/tools" && cp "$L" "$C/tools/lead-label.sh" && git -C "$C" add -A && git -C "$C" commit -qm main && git -C "$C" push -q origin HEAD:main 2>/dev/null
mc() { : > "$T/fx/log"; out=$(PATH="$T/bin:$PATH" FX="$T/fx" GH_TOKEN=x REPO=o/r API=https://api.test REVIEWERS="" bash "$C/tools/lead-label.sh" 7 2>&1); r=$?; log=$(cat "$T/fx/log"); }
mc; ok "the copy's script is origin/main's: the check passes and the PR is labelled" "$(labelled)" "exit $r: $out / $log"
echo "# changed" >> "$C/tools/lead-label.sh"; mc
ok "the copy's script differs from origin/main's: refused before any API call" "$([ $r = 1 ] && [ -z "$log" ] && grep -q "not origin/main's" <<< "$out" && echo 1)" "exit $r: $out / $log"

# --- part 2: the auto-queue's own cases stay (A435 (1)): run their tests, and each named case must pass
need() {  # need <test> <grep -F line>...: the test is green and prints PASS for each
  local t=$1 o rc; shift; o=$(bash "$TOOLS/$t" 2>&1); rc=$?
  ok "$t is green" "$([ $rc = 0 ] && echo 1)" "exit $rc: $(tail -3 <<< "$o")"
  local c; for c in "$@"; do ok "  $t keeps: $c" "$(grep -qF "PASS  $c" <<< "$o" && echo 1)" "no such PASS line"; done; }
need check-queue-gate.sh \
  "label: the owner's \"Reviewer: Approve <head>\", ci green, no Lead-read path: labelled" \
  "label refused: the Approve names an older commit" \
  "label refused: an Approve from an account that is not the owner's nor a known reviewer" \
  "label refused: .github/workflows/x.yml keeps the Lead's read" \
  "label refused: .mergify.yml keeps the Lead's read" \
  "label refused: ai-workers/x/product/tools/queue-gate.sh keeps the Lead's read" \
  "label refused: .claude/skills/next/SKILL.md keeps the Lead's read" \
  "label refused: ai-workers/x/prototype/studio/prisma/schema/cases.prisma keeps the Lead's read" \
  "label refused: ai-workers/x/prototype/studio/api/src/permissions.ts keeps the Lead's read"
need check-label-sweep.sh \
  "19 Nov: a bot label queue-gate.sh refuses comes off" \
  "B194: a github-actions[bot] label on a PR queue-gate.sh judges eligible is kept"
finish
