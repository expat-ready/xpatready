#!/usr/bin/env bash
# B194: the queue gate. Runs queue-gate.sh with GitHub answered by a stand-in curl (PRs, files, comments, the check
# "ci", runs from files; POSTs written to a log) and main's history from a scratch git copy, then checks .mergify.yml
# needs "queue-fresh" for app code and queue-gate.yml runs main's copy. Allowed and refused cases for the label; stale,
# fresh, queued and capped cases for the status. US$0, no network.
#   bash product/tools/check-queue-gate.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/qgate.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/fx"
cat > "$T/bin/curl" <<'EOF'
#!/usr/bin/env bash
m=GET; d=""; u=""
while [ $# -gt 0 ]; do case "$1" in -X) m=$2; shift;; -d) d=$2; shift;; -H) shift;; http*) u=$1;; esac; shift; done
p=${u#https://api.test/repos/o/r/}; pg=$(printf '%s' "$u" | sed -n 's/.*[?&]page=\([0-9]*\).*/\1/p')
serve() { [ -f "$FX/$1" ] && cat "$FX/$1" || { echo '{"message":"Not Found"}'; exit 22; }; }
case "$m $p" in
  "GET pulls/"*/files*) n=${p#pulls/}; n=${n%%/*}; [ "${pg:-1}" = 1 ] && serve "files-$n.json" || echo '[]';;
  "GET pulls/"*) serve "pr-${p#pulls/}.json";;
  "GET issues/"*/comments*) n=${p#issues/}; n=${n%%/*}; [ "${pg:-1}" = 1 ] && serve "comments-$n.json" || echo '[]';;
  "GET issues?"*) [ "${pg:-1}" = 1 ] && serve issues.json || echo '[]';;
  "GET commits/"*/check-runs*) s=${p#commits/}; serve "checks-${s%%/*}.json";;
  "GET actions/runs/"*) serve "run-${p#actions/runs/}.json";;
  "POST issues/"*/labels) n=${p#issues/}; echo "LABEL ${n%%/*}" >> "$FX/log"; echo '[]';;
  "POST issues/"*/comments) n=${p#issues/}; echo "COMMENT ${n%%/*} $(echo "$d" | jq -r .body | head -1 | cut -c1-60)" >> "$FX/log"; echo '{}';;
  "POST statuses/"*) echo "STATUS ${p#statuses/} $(echo "$d" | jq -r '.context + " " + .state')" >> "$FX/log"; echo '{}';;
  "POST actions/runs/"*/rerun) r=${p#actions/runs/}; echo "RERUN ${r%%/*}" >> "$FX/log"; echo '{}';;
  *) echo "unexpected $m $p" >> "$FX/log"; exit 22;;
esac
EOF
chmod +x "$T/bin/curl"
G="$TOOLS/queue-gate.sh"
if [ ! -f "$G" ]; then ok "queue-gate.sh exists (B194)" 0 "no $G: nobody labels a reviewed, green PR but a lane, and a stale check joins the queue"; finish; fi
S=ai-workers/x/prototype/studio; HEAD1=1111111111111111111111111111111111111111; OLD=2222222222222222222222222222222222222222
prj() {  # prj <n> <head> [draft] [labels csv] → pulls/<n>
  jq -n --argjson n "$1" --arg h "$2" --argjson d "${3:-false}" --arg l "${4:-}" '{number: $n, state: "open", draft: $d,
    base: {ref: "main"}, head: {sha: $h, ref: "claude/x"}, labels: ($l | split(",") | map(select(length > 0)) | map({name: .}))}' > "$T/fx/pr-$1.json"; }
files() { local n=$1; shift; printf '%s\n' "$@" | jq -R '{filename: .}' | jq -s . > "$T/fx/files-$n.json"; }
cmt() {  # cmt <n> <login> <association> <body>
  jq -n --arg l "$2" --arg a "$3" --arg b "$4" '[{user: {login: $l}, author_association: $a, body: $b}]' > "$T/fx/comments-$1.json"; }
cirun() {  # cirun <head> <status> <conclusion> <started> [attempt] → the check "ci" and run 77
  jq -n --arg s "$2" --arg c "$3" '{check_runs: [{app: {slug: "github-actions"}, status: $s, conclusion: (if $c == "" then null else $c end),
    started_at: "2026-11-15T10:30:00Z", details_url: "https://github.test/o/r/actions/runs/77/job/1"}]}' > "$T/fx/checks-$1.json"
  jq -n --arg t "$4" --argjson a "${5:-1}" --arg s "$2" '{id: 77, run_started_at: $t, run_attempt: $a, status: $s}' > "$T/fx/run-77.json"; }
run() {  # run <mode> <pr> → $out $log $r
  : > "$T/fx/log"; out=$(cd "$T/git" && PATH="$T/bin:$PATH" FX="$T/fx" GH_TOKEN=x REPO=o/r API=https://api.test MAIN_REF=main PR=$2 \
    REVIEWERS="${REV:-}" TRIGGER="${TRIG:-}" bash "$G" "$1" 2>&1); r=$?; log=$(cat "$T/fx/log"); }
# main's history: a base, then at 11:00 UTC a merge touching form.ts, at 12:00 one adding a migration.
mkdir -p "$T/git" && cd "$T/git" && git init -q -b main && git config user.email t@t && git config user.name t
mkdir -p "$S/api/src" "$S/prisma/migrations/1_a" && echo a > "$S/api/src/form.ts" && echo a > "$S/api/src/other.ts" && git add -A && GIT_COMMITTER_DATE=2026-11-15T09:00:00Z git commit -qm base
mrg() {  # mrg <time> <n> <file>
  git checkout -qb "b$2" main~0 2>/dev/null || git checkout -qb "b$2"; mkdir -p "$(dirname "$3")"; echo "$2" >> "$3"; git add -A; GIT_COMMITTER_DATE=$1 git commit -qm "x$2"
  git checkout -q main; GIT_COMMITTER_DATE=$1 git merge -q --no-ff "b$2" -m "Merge pull request #$2 from o/b$2"; }
mrg 2026-11-15T11:00:00Z 501 "$S/api/src/form.ts"; mrg 2026-11-15T12:00:00Z 502 "$S/prisma/migrations/2_b/migration.sql"; cd - >/dev/null

# --- label: allowed and refused
prj 7 $HEAD1; files 7 "$S/api/src/form.ts"; cmt 7 o OWNER "Reviewer: Approve $HEAD1

* **Reviewer (Opus, high):** fine."; cirun $HEAD1 completed success 2026-11-15T13:00:00Z
run label 7
ok "label: the owner's \"Reviewer: Approve <head>\", ci green, no Lead-read path: labelled, with a comment" "$([ $r = 0 ] && grep -qx 'LABEL 7' <<< "$log" && grep -q '^COMMENT 7 \*\*Queue gate (B194):\*\* `review: approved` put on' <<< "$log" && echo 1)" "exit $r: $out / $log"
cmt 7 o OWNER "**Reviewer: Approve** \`$HEAD1\`"; run label 7
ok "label: markdown around the Approve line is read as the line" "$(grep -qx 'LABEL 7' <<< "$log" && echo 1)" "$out / $log"
cmt 7 o OWNER "Reviewer: Approve $OLD"; TRIG=approve run label 7
ok "label refused: the Approve names an older commit (with a comment, as the Approve started the run)" "$(! grep -q '^LABEL' <<< "$log" && grep -q '^COMMENT 7 \*\*Queue gate (B194):\*\* `review: approved` not put on' <<< "$log" && echo 1)" "$out / $log"
cmt 7 o OWNER "Reviewer: Approve ${HEAD1:0:9}"; run label 7
ok "label refused: a short SHA is not the head (the full 40 characters, B194)" "$(! grep -q '^LABEL' <<< "$log" && echo 1)" "$out / $log"
cmt 7 someone NONE "Reviewer: Approve $HEAD1"; run label 7
ok "label refused: an Approve from an account that is not the owner's nor a known reviewer" "$(! grep -q '^LABEL' <<< "$log" && grep -q 'is not an Approve' <<< "$out" && echo 1)" "$out / $log"
cmt 7 helper COLLABORATOR "Reviewer: Approve $HEAD1"; run label 7
ok "label refused: a collaborator not in REVIEWERS" "$(! grep -q '^LABEL' <<< "$log" && echo 1)" "$out / $log"
REV="other helper" run label 7
ok "label: a known reviewer (REVIEWERS) with write access is allowed" "$(grep -qx 'LABEL 7' <<< "$log" && echo 1)" "$out / $log"
cmt 7 helper NONE "Reviewer: Approve $HEAD1"; REV=helper run label 7
ok "label refused: a known reviewer's login without write access (author_association NONE)" "$(! grep -q '^LABEL' <<< "$log" && echo 1)" "$out / $log"
cmt 7 o OWNER "Reviewer: Approve $HEAD1"
for f in ".github/workflows/x.yml" ".mergify.yml" "ai-workers/x/product/tools/queue-gate.sh" "ai-workers/x/product/tools/lead-read-paths.txt" ".githooks/pre-push" ".claude/skills/next/SKILL.md" "$S/prisma/schema/cases.prisma" "$S/prisma/migrations/3_c/migration.sql" "$S/web/src/runtime/fees.tsx" "$S/api/src/rounds.ts" "$S/prisma/schema/client-money.prisma"; do
  files 7 "$S/api/src/form.ts" "$f"; run label 7
  ok "label refused: $f keeps the Lead's read (P-423)" "$(! grep -q '^LABEL' <<< "$log" && grep -q "Lead's read" <<< "$out" && echo 1)" "$out / $log"
done
files 7 "$S/api/src/form.ts"
cmt 7 o OWNER "> Reviewer: Approve $HEAD1"; run label 7
ok "label refused: a quoted Approve line (> ...) is not the reviewer's own" "$(! grep -q '^LABEL' <<< "$log" && echo 1)" "$out / $log"
jq -n --arg h $HEAD1 '[{user: {login: "o"}, author_association: "OWNER", body: ("Reviewer: Approve " + $h)},
  {user: {login: "o"}, author_association: "OWNER", body: ("Reviewer: Changes needed " + $h + " (round 2: M1)")}]' > "$T/fx/comments-7.json"; run label 7
ok "label refused: a later \"Reviewer: Changes needed\" on the same head wins over the Approve (review m3)" "$(! grep -q '^LABEL' <<< "$log" && echo 1)" "$out / $log"
jq -n --arg h $HEAD1 '[{user: {login: "o"}, author_association: "OWNER", body: ("Reviewer: Approve " + $h)},
  {user: {login: "o"}, author_association: "OWNER", body: "**Reviewer: Changes requested**: fix M1 first"}]' > "$T/fx/comments-7.json"; run label 7
ok "label refused: a later verdict naming no SHA (\"Reviewer: Changes requested\") wins (round 2 m2)" "$(! grep -q '^LABEL' <<< "$log" && echo 1)" "$out / $log"
jq -n --arg h $HEAD1 '[{user: {login: "o"}, author_association: "OWNER", body: ("Reviewer: Approve " + $h)},
  {user: {login: "o"}, author_association: "OWNER", body: "Reviewer: Approve 2222222222222222222222222222222222abcdef (another PR quoted)"}]' > "$T/fx/comments-7.json"; run label 7
ok "label: a later verdict about another commit does not undo the head's Approve" "$(grep -qx 'LABEL 7' <<< "$log" && echo 1)" "$out / $log"
for w in "ci run 19283746501 failed" "date 20261115" "the page was defaced"; do
  jq -n --arg h $HEAD1 --arg w "$w" '[{user: {login: "o"}, author_association: "OWNER", body: ("Reviewer: Approve " + $h)},
    {user: {login: "o"}, author_association: "OWNER", body: ("Reviewer: Changes requested: " + $w)}]' > "$T/fx/comments-7.json"; run label 7
  ok "label refused: a later Changes requested mentioning \"$w\" (not a SHA) still wins (round 3 m1)" "$(! grep -q '^LABEL' <<< "$log" && echo 1)" "$out / $log"
done
cmt 7 o OWNER "Reviewer: Approve $HEAD1"
cirun $HEAD1 in_progress "" 2026-11-15T13:00:00Z; run label 7
ok "label refused: ci still running on the head" "$(! grep -q '^LABEL' <<< "$log" && grep -q 'ci on 111111111 is pending' <<< "$out" && echo 1)" "$out / $log"
cirun $HEAD1 completed failure 2026-11-15T13:00:00Z; run label 7
ok "label refused: ci red on the head" "$(! grep -q '^LABEL' <<< "$log" && echo 1)" "$out / $log"
cirun $HEAD1 completed success 2026-11-15T13:00:00Z; prj 7 $HEAD1 true; run label 7
ok "label refused: a draft" "$(! grep -q '^LABEL' <<< "$log" && echo 1)" "$out / $log"
prj 7 $HEAD1 false "review: approved"; run label 7
ok "label: already labelled, nothing posted" "$([ -z "$log" ] && echo 1)" "$out / $log"
prj 7 $HEAD1; run eligible 7
ok "eligible: exit 0 for the allowed case (label-sweep.sh keeps such a label)" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
cmt 7 o OWNER "Reviewer: Approve $OLD"; run eligible 7
ok "eligible: exit 1 for a refused case" "$([ $r = 1 ] && echo 1)" "exit $r: $out"

# --- fresh: the status queue-fresh
cmt 7 o OWNER "Reviewer: Approve $HEAD1"
prj 8 $HEAD1 false "review: approved"; files 8 "$S/api/src/form.ts"; cirun $HEAD1 completed success 2026-11-15T10:00:00Z; run fresh 8
ok "fresh: main merged #501 touching the same file after this ci started: failure, and the labelled PR's ci is re-run" "$(grep -qx "STATUS $HEAD1 queue-fresh failure" <<< "$log" && grep -qx 'RERUN 77' <<< "$log" && grep -q '#501' <<< "$out" && echo 1)" "$out / $log"
jq -n --arg n "$S/api/src/form-v2.ts" --arg o "$S/api/src/form.ts" '[{filename: $n, previous_filename: $o}]' > "$T/fx/files-8.json"; run fresh 8
ok "fresh: a PR that renamed form.ts is stale when main changed form.ts (the old name counts, Devin on #1861)" "$(grep -qx "STATUS $HEAD1 queue-fresh failure" <<< "$log" && echo 1)" "$out / $log"
files 8 "$S/api/src/other.ts"; run fresh 8
ok "fresh: no merge since touches its files: success, no re-run" "$(grep -qx "STATUS $HEAD1 queue-fresh success" <<< "$log" && ! grep -q RERUN <<< "$log" && echo 1)" "$out / $log"
files 8 "$S/prisma/migrations/9_z/migration.sql"; run fresh 8
ok "fresh: both add migrations (#502 after this ci started): failure and a re-run" "$(grep -qx "STATUS $HEAD1 queue-fresh failure" <<< "$log" && grep -qx 'RERUN 77' <<< "$log" && echo 1)" "$out / $log"
files 8 "$S/api/src/form.ts"; cirun $HEAD1 completed success 2026-11-15T11:30:00Z; run fresh 8
ok "fresh: a ci started after the merge touching its file: success" "$(grep -qx "STATUS $HEAD1 queue-fresh success" <<< "$log" && echo 1)" "$out / $log"
cirun $HEAD1 completed success 2026-11-15T10:00:00Z; prj 8 $HEAD1; run fresh 8
ok "fresh: not labelled: pending, never a success a later label could meet (review M2), no re-run" "$(grep -qx "STATUS $HEAD1 queue-fresh pending" <<< "$log" && ! grep -q RERUN <<< "$log" && echo 1)" "$out / $log"
prj 8 $HEAD1 false "review: approved,queued"; run fresh 8
ok "fresh: a queued PR stays success (its batch is built on today's main), no re-run" "$(grep -qx "STATUS $HEAD1 queue-fresh success" <<< "$log" && ! grep -q RERUN <<< "$log" && echo 1)" "$out / $log"
prj 8 $HEAD1 false "review: approved"; cirun $HEAD1 completed success 2026-11-15T10:00:00Z 3; run fresh 8
ok "fresh: after 3 ci attempts it is success (no loop under churn)" "$(grep -qx "STATUS $HEAD1 queue-fresh success" <<< "$log" && ! grep -q RERUN <<< "$log" && echo 1)" "$out / $log"
cirun $HEAD1 in_progress "" 2026-11-15T10:00:00Z; run fresh 8
ok "fresh: ci running: pending, never a cancel or a second run" "$(grep -qx "STATUS $HEAD1 queue-fresh pending" <<< "$log" && ! grep -q RERUN <<< "$log" && echo 1)" "$out / $log"
files 8 "ai-workers/x/product/STATE.md"; run fresh 8
ok "fresh: no app code: success" "$(grep -qx "STATUS $HEAD1 queue-fresh success" <<< "$log" && echo 1)" "$out / $log"

# --- review M2: at labelling, the verdict is posted before the label (Mergify reacts to the label within seconds)
prj 9 $HEAD1; files 9 "$S/api/src/form.ts"; cmt 9 o OWNER "Reviewer: Approve $HEAD1"; cirun $HEAD1 completed success 2026-11-15T10:00:00Z; run label 9
ok "label on a stale head: queue-fresh failure and a re-run come before the label (review M2)" "$(grep -n . <<< "$log" | awk -F: '/STATUS/ && /failure/ {s=$1} /LABEL 9/ {l=$1} END {exit !(s && l && s < l)}' && grep -qx 'RERUN 77' <<< "$log" && echo 1)" "$out / $log"
cirun $HEAD1 completed success 2026-11-15T13:00:00Z; run label 9
ok "label on a fresh head: queue-fresh success before the label" "$(grep -n . <<< "$log" | awk -F: '/STATUS/ && /success/ {s=$1} /LABEL 9/ {l=$1} END {exit !(s && l && s < l)}' && echo 1)" "$out / $log"
# --- events, as GitHub sends them
printf '%s' "{\"issue\": {\"number\": 9, \"pull_request\": {}}, \"comment\": {\"body\": \"Reviewer: Approve $HEAD1\"}}" > "$T/fx/ev.json"
ev() { : > "$T/fx/log"; out=$(cd "$T/git" && PATH="$T/bin:$PATH" FX="$T/fx" GH_TOKEN=x REPO=o/r API=https://api.test MAIN_REF=main GITHUB_EVENT_NAME=$1 GITHUB_EVENT_PATH="$T/fx/ev.json" bash "$G" event 2>&1); r=$?; log=$(cat "$T/fx/log"); }
ev issue_comment
ok "event issue_comment: an Approve comment labels the PR and sets queue-fresh once (no second verdict)" "$([ $r = 0 ] && grep -qx 'LABEL 9' <<< "$log" && [ "$(grep -c '^STATUS' <<< "$log")" = 1 ] && echo 1)" "exit $r: $out / $log"
printf '{"workflow_run": {"pull_requests": [{"number": 9}]}}' > "$T/fx/ev.json"; ev workflow_run
ok "event workflow_run: the PR of a finished ci is labelled and judged" "$([ $r = 0 ] && grep -qx 'LABEL 9' <<< "$log" && grep -q '^STATUS' <<< "$log" && echo 1)" "exit $r: $out / $log"
printf '{"workflow_run": {"pull_requests": [{"number": 404}]}}' > "$T/fx/ev.json"; ev workflow_run
ok "event: a PR that cannot be read makes the run red (exit 2, review m6)" "$([ $r = 2 ] && echo 1)" "exit $r: $out"
rm -f "$T/fx/issues.json"; ev push
ok "event push: the labelled PRs cannot be listed: red (exit 2, round 2 m5)" "$([ $r = 2 ] && echo 1)" "exit $r: $out"
# --- review m1: a long file list is read whole (pipefail and SIGPIPE once made it "no app code")
prj 8 $HEAD1 false "review: approved"; cirun $HEAD1 completed success 2026-11-15T10:00:00Z
{ seq 1 2500 | sed "s|^|$S/api/src/f|; s|$|.ts|"; echo "$S/api/src/form.ts"; } | jq -R '{filename: .}' | jq -s . > "$T/fx/files-8.json"; run fresh 8
ok "fresh: 2,501 files with app code are app code (review m1): stale, failure" "$(grep -qx "STATUS $HEAD1 queue-fresh failure" <<< "$log" && echo 1)" "$out / $log"
( cd "$T/git" && git checkout -qb big main~0 && for i in $(seq 1 3000); do echo "$S/api/src/g$i.ts"; done | while read -r f; do echo x > "$f"; done && git add -A && GIT_COMMITTER_DATE=2026-11-15T12:30:00Z git commit -qm big && git checkout -q main && GIT_COMMITTER_DATE=2026-11-15T12:30:00Z git merge -q --no-ff big -m "Merge pull request #503 from o/big" )
seq 1 3000 | sed "s|^|$S/api/src/g|; s|$|.ts|" | jq -R '{filename: .}' | jq -s . > "$T/fx/files-8.json"; cirun $HEAD1 completed success 2026-11-15T12:10:00Z; run fresh 8
ok "fresh: 3,000 files shared with a merge are still a hit (round 2 m1: no grep -q in a pipe)" "$(grep -qx "STATUS $HEAD1 queue-fresh failure" <<< "$log" && echo 1)" "$out / $log"
files 8 "$S/api/src/form.ts"; rm -f "$T/fx/run-77.json"; run fresh 8
ok "fresh: the ci run cannot be read: pending, no re-run" "$(grep -qx "STATUS $HEAD1 queue-fresh pending" <<< "$log" && ! grep -q RERUN <<< "$log" && echo 1)" "$out / $log"

# --- the wiring
R=$(git -C "$TOOLS" rev-parse --show-toplevel); M="$R/.mergify.yml"; W="$R/.github/workflows/queue-gate.yml"
ok ".mergify.yml: the product queue needs queue-fresh for a PR touching prototype/" "$(awk '/- name: product/,/- name: records/' "$M" | grep -q 'check-success = queue-fresh' && awk '/- name: product/,/- name: records/' "$M" | grep -qF -- '-files ~= /prototype/' && echo 1)" "no queue-fresh condition in the product queue"
ok "queue-gate.yml runs main's copy of queue-gate.sh on comments, ci runs, labels and pushes to main" "$([ -f "$W" ] && grep -q 'ref: main' "$W" && grep -q 'queue-gate.sh event' "$W" && grep -q 'issue_comment' "$W" && grep -q 'workflow_run' "$W" && ! grep -qE 'refs/pull|head\.sha' "$W" && grep -q '"OWNER","MEMBER","COLLABORATOR"' "$W" && grep -q 'types: \[labeled, unlabeled\]' "$W" && echo 1)" "$W (an outsider's comment must start no write-token run, review m2)"
finish
