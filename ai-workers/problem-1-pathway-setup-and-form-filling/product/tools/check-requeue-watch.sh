#!/usr/bin/env bash
# ENF-746b (P-746 (3), (4)): requeue-watch.sh with GitHub answered by a stand-in curl (the dequeued PRs, each PR's head,
# comments and files, main's commit at the time and its check runs, a batch's job log, all from files; DELETE and POST
# written to a log), its proof mode on gh pr list JSON, and the wiring in lead-watch.sh and requeue-watch.yml. The
# Mergify payload is the one #2315 carried on 19 Nov. US$0, no network.
#   bash product/tools/check-requeue-watch.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/requeue.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/fx"
cat > "$T/bin/curl" <<'EOF'
#!/usr/bin/env bash
m=GET; d=""; u=""
while [ $# -gt 0 ]; do case "$1" in -X) m=$2; shift;; -d) d=$2; shift;; -H) shift;; http*) u=$1;; esac; shift; done
p=${u#https://api.test/repos/o/r/}; pg=$(printf '%s' "$p" | sed -n 's/.*[?&]page=\([0-9]*\).*/\1/p')
f() { [ -f "$FX/$1" ] && cat "$FX/$1" || { echo '{"message":"Not Found"}'; exit 22; }; }
case "$m $p" in
  "GET issues?state=open&labels=dequeued"*) [ "$pg" = 1 ] && f issues.json || echo '[]';;
  "GET issues/"*/comments*) n=$(echo "$p" | cut -d/ -f2); [ "$pg" = 1 ] && f "comments-$n.json" || echo '[]';;
  "GET pulls/"*/files*) n=$(echo "$p" | cut -d/ -f2); [ "$pg" = 1 ] && { [ -f "$FX/files-$n.json" ] && cat "$FX/files-$n.json" || echo '[]'; } || echo '[]';;
  "GET pulls/"*) f "pull-$(echo "$p" | cut -d/ -f2).json";;
  "GET commits?sha=main&until="*) echo "$p" >> "$FX/until"; f main.json;;
  "GET commits/"*/check-runs*) f "runs-$(echo "$p" | cut -d/ -f2).json";;
  "GET actions/jobs/"*/logs) f "log-$(echo "$p" | cut -d/ -f3).txt";;
  "DELETE issues/"*/labels/dequeued) echo "DELETE $(echo "$p" | cut -d/ -f2)" >> "$FX/log"; echo '[]';;
  "POST issues/"*/comments) echo "POST $(echo "$p" | cut -d/ -f2) $(echo "$d" | jq -r .body | tr '\n' ' ' | cut -c1-400)" >> "$FX/log"; echo '{}';;
  *) echo "unexpected $m $p" >> "$FX/log"; exit 22;;
esac
EOF
chmod +x "$T/bin/curl"
S="$TOOLS/requeue-watch.sh"
if [ ! -f "$S" ]; then ok "requeue-watch.sh exists (ENF-746b)" 0 "no $S"; finish; fi
A=$(printf 'a%.0s' {1..40}); B=$(printf 'b%.0s' {1..40}); D=$(printf 'd%.0s' {1..40}); M=$(printf 'e%.0s' {1..40}); X=$(printf 'f%.0s' {1..40})
NOW=1795640000   # 2026-11-25T... any fixed time; comments below are dated relative to it
at() { jq -rn --argjson t $((NOW - $1)) '$t | todate'; }   # at <seconds ago> → ISO time
LEFT=$(jq -rn --argjson t $((NOW - 1800)) '$t | strftime("%Y-%m-%dT%H:%M:%S.467292+00:00")')
issue() { jq -n --argjson n "$1" --arg l "$2" '{number: $n, pull_request: {url: "x"}, labels: ($l | split(",") | map({name: .}))}'; }
cm() { jq -n --arg u "$1" --arg a "$2" --arg b "$3" --arg t "$(at "$4")" '{user: {login: $u}, author_association: $a, body: $b, created_at: $t}'; }
pay() {  # pay <state> <checks json> [left_at] [speculative pr] → a Mergify payload comment body, as on #2315
  printf '<!---\nDO NOT EDIT\n-*- Mergify Payload -*-\n%s\n-*- Mergify Payload End -*-\n-->\n\n### ❌ Left the queue · `fast` fails with this pull request' \
    "$(jq -cn --arg s "$1" --argjson c "$2" --arg l "${3:-}" --arg sp "${4:-}" '{version: 1, state: $s, queue_rule_name: "product",
      speculative_check_pr: (if $sp == "" then null else ($sp | tonumber) end), left_at: (if $l == "" then null else $l end),
      dequeue_reason: {code: "CHECKS_FAILED", label: "checks failed", checks: $c, checks_count: ($c | length)}}')"; }
dequeued() {  # dequeued <pr> <head> [extra comments json lines on stdin] → fixtures of one approved, dequeued PR
  jq -n --arg h "$2" '{head: {sha: $h}}' > "$T/fx/pull-$1.json"
  { cm the-owner OWNER "Reviewer: Approve $A" 7200; cm "mergify[bot]" CONTRIBUTOR "$(pay checking '[]' '' 99)" 5000
    cm "mergify[bot]" CONTRIBUTOR "$(pay dequeued '["ci","fast"]' "$LEFT")" 1700; cat; } | jq -s . > "$T/fx/comments-$1.json"; }
main_runs() { jq -n --arg m "$M" '[{sha: $m}]' > "$T/fx/main.json"; jq -n --arg c "$1" '{check_runs: [{name: "ci", conclusion: $c}, {name: "fast", conclusion: $c}]}' > "$T/fx/runs-$M.json"; }
reset() { rm -f "$T/fx"/*; { issue 10 "review: approved,dequeued"; } | jq -s . > "$T/fx/issues.json"; }
run() { : >> "$T/fx/log"; out=$(PATH="$T/bin:$PATH" FX="$T/fx" GH_TOKEN=x REPO=o/r API=https://api.test NOW=$NOW bash "$S" 2>&1); r=$?; log=$(cat "$T/fx/log" 2>/dev/null); rm -f "$T/fx/log"; }

# 1. Unchanged head, main shares the failure: `dequeued` off and one "@mergifyio queue", marked with the head.
reset; dequeued 10 "$A" < /dev/null; main_runs failure; run
ok "requeue: head unchanged since the Approve, \`fast\` failed on main at that time → \`dequeued\` off, \"@mergifyio queue\"" \
  "$([ $r = 0 ] && grep -qx 'DELETE 10' <<< "$log" && grep -q "^POST 10 @mergifyio queue  <!-- requeue-watch:queued sha=$A -->" <<< "$log" && echo 1)" "exit $r: $out / $log"
ok "requeue: main is read at the dequeue time (left_at), not now" "$(grep -q "until=$(jq -rn --argjson t $((NOW - 1800)) '$t | todate')" "$T/fx/until" && echo 1)" "$(cat "$T/fx/until" 2>&1)"
# 1b. Idempotent: the same head already requeued once → never twice.
cm github-actions[bot] NONE "@mergifyio queue
<!-- requeue-watch:queued sha=$A -->" 900 | dequeued 10 "$A"; run
ok "idempotent: a head requeued once is never requeued again" "$([ $r = 0 ] && [ -z "$log" ] && grep -q 'already requeued once' <<< "$out" && echo 1)" "exit $r: $out / $log"

# 2. A new head since the Approve: no requeue, no comment.
reset; dequeued 10 "$B" < /dev/null; main_runs failure; run
ok "no requeue on a new head (head is not the SHA the reviewer approved)" "$([ $r = 0 ] && [ -z "$log" ] && grep -q 'not the approved' <<< "$out" && echo 1)" "exit $r: $out / $log"
# 2b. An Approve line from someone without write access does not count (the repository is public).
reset; { cm stranger NONE "Reviewer: Approve $X" 600; } | dequeued 10 "$X"; main_runs failure; run
ok "an Approve line by an outside commenter is ignored" "$([ -z "$log" ] && grep -q 'not the approved' <<< "$out" && echo 1)" "exit $r: $out / $log"

# 3. A failure main does not share: no requeue, one comment naming the job, once.
reset; dequeued 10 "$A" < /dev/null; main_runs success; run
ok "no requeue on a PR-only failure; a comment names the failing job" \
  "$([ $r = 0 ] && ! grep -q DELETE <<< "$log" && grep -q '^POST 10 \*\*Requeue watch (ENF-746b, P-746):\*\* not requeued: `fast` failed with this PR' <<< "$log" && echo 1)" "exit $r: $out / $log"
cm github-actions[bot] NONE "$(sed -n 's/^POST 10 //p' <<< "$log" | sed 's/.*\(<!-- requeue-watch:own[^>]*-->\).*/\1/')" 60 | dequeued 10 "$A"; run
ok "the PR-only comment is posted once per head and dequeue" "$([ $r = 0 ] && [ -z "$log" ] && echo 1)" "exit $r: $out / $log"

# 4. A 4th time in 24 h: no requeue; one question for the tech lead (once a day).
reset; { for s in "$B" "$D" "$X"; do cm github-actions[bot] NONE "@mergifyio queue
<!-- requeue-watch:queued sha=$s -->" 3600; done; } | dequeued 10 "$A"; main_runs failure; run
ok "no requeue a 4th time in 24 h; a question for the tech lead instead" \
  "$([ $r = 0 ] && ! grep -q DELETE <<< "$log" && grep -q '^POST 10 Question for the tech lead: requeue watch (ENF-746b) requeued this PR 3 times' <<< "$log" && echo 1)" "exit $r: $out / $log"
{ for s in "$B" "$D" "$X"; do cm github-actions[bot] NONE "<!-- requeue-watch:queued sha=$s -->" 3600; done
  cm github-actions[bot] NONE "Question <!-- requeue-watch:limit day=$(jq -rn --argjson t $NOW '$t | strftime("%Y-%m-%d")') -->" 600; } | dequeued 10 "$A"; run
ok "the limit question is posted once a day" "$([ $r = 0 ] && [ -z "$log" ] && echo 1)" "exit $r: $out / $log"
{ for s in "$B" "$D" "$X"; do cm github-actions[bot] NONE "<!-- requeue-watch:queued sha=$s -->" 90000; done; } | dequeued 10 "$A"; run
ok "requeues older than 24 h do not count toward the 3" "$(grep -qx 'DELETE 10' <<< "$log" && echo 1)" "exit $r: $out / $log"

# 5. Main green on its head, but two other PRs left the queue on the same job within the hour: main's pipeline.
reset; { issue 10 "review: approved,dequeued"; issue 11 dequeued; issue 12 "review: approved,dequeued"; } | jq -s . > "$T/fx/issues.json"
dequeued 10 "$A" < /dev/null; dequeued 11 "$B" < /dev/null; dequeued 12 "$B" < /dev/null; main_runs success; run
ok "two other PRs dropped on the same job within 60 min: the approved one with its head unchanged is requeued" \
  "$(grep -qx 'DELETE 10' <<< "$log" && ! grep -q 'DELETE 12' <<< "$log" && grep -q '^#10: requeued (#11 #12 left the queue' <<< "$out" && echo 1)" "exit $r: $out / $log"

# 6. A pipeline lock from requeue-locks.txt in the failed job's log of the batch Mergify checked.
reset; dequeued 10 "$A" < /dev/null; main_runs success
jq -n --arg h "$D" '{head: {sha: $h}}' > "$T/fx/pull-99.json"; echo '{"check_runs":[{"id":555,"name":"fast","conclusion":"failure"}]}' > "$T/fx/runs-$D.json"
echo "WORKFLOW LOCK: P-735 changes the workflow (it is in decision-impact.sh's EXEMPT ...)" > "$T/fx/log-555.txt"; run
ok "a pipeline lock (requeue-locks.txt) in the batch's failed job log → requeue" "$(grep -qx 'DELETE 10' <<< "$log" && grep -q 'pipeline lock' <<< "$out" && echo 1)" "exit $r: $out / $log"
echo '[{"filename":"ai-workers/problem-1-pathway-setup-and-form-filling/product/DECISIONS.md"}]' > "$T/fx/files-10.json"; run
ok "the lock does not cover a PR that changes DECISIONS.md itself" "$(! grep -q DELETE <<< "$log" && grep -q 'own failure' <<< "$out" && echo 1)" "exit $r: $out / $log"

# 7. Proof first (P-746 (3)): the lead-watch line, and non-zero past 60 min.
prs() { jq -n --arg old "$(at 4200)" --arg new "$(at 1200)" '[
  {number: 1, title: "qa: R1.80 Works on main 4a4b6bc00", labels: [{name: "review: approved"}], isDraft: false, headRefName: "q1", statusCheckRollup: [{name: "ci", status: "COMPLETED", conclusion: "FAILURE"}], createdAt: $old},
  {number: 2, title: "qa: R1.28 Consent recorded per purpose — Works", labels: [], isDraft: false, headRefName: "q2", statusCheckRollup: [], createdAt: $new},
  {number: 3, title: "qa: R1.67 stays Partial", labels: [], isDraft: false, headRefName: "q3", statusCheckRollup: [], createdAt: $old},
  {number: 4, title: "qa: R1.5 Works", labels: [{name: "queued"}], isDraft: false, headRefName: "q4", statusCheckRollup: [], createdAt: $old}]'; }
po=$(prs | NOW=$NOW bash "$S" proof); pr_=$?
ok "proof line lists qa Works PRs out of the queue with the reason (not Partial ones, not queued ones)" \
  "$(grep -q '^proof  qa proof PRs not in the queue (P-746 (3)): #1 red: ci, 70 min · #2 no review: approved label, 20 min$' <<< "$po" && echo 1)" "$po"
ok "proof: one waiting over 60 min → an ACT line and a non-zero exit" "$([ $pr_ = 1 ] && grep -q '^ACT   proof #1 waited 70 min' <<< "$po" && echo 1)" "exit $pr_: $po"
po=$(prs | jq 'map(select(.number != 1))' | NOW=$NOW bash "$S" proof); pr_=$?
ok "proof: none past 60 min → exit 0" "$([ $pr_ = 0 ] && ! grep -q '^ACT' <<< "$po" && echo 1)" "exit $pr_: $po"
LW="$TOOLS/lead-watch.sh"
ok "lead-watch.sh prints the proof line and counts its ACT lines in its exit code" \
  "$(grep -q 'bash "$TOOLS/requeue-watch.sh" proof' "$LW" && grep -q "act=\$((act + \$(grep -c '^ACT' <<<\"\$pf\")))" "$LW" && echo 1)" "lead-watch.sh does not call requeue-watch.sh proof"

# 8. The workflow: every 15 min, main's copy, never cancelled.
WF="$TOOLS/../../../../.github/workflows/requeue-watch.yml"
ok "requeue-watch.yml runs every 15 min from main, never cancelled, and calls requeue-watch.sh" \
  "$([ -f "$WF" ] && grep -q 'cron: "7,22,37,52 \* \* \* \*"' "$WF" && grep -q 'ref: main' "$WF" && grep -q 'cancel-in-progress: false' "$WF" && grep -q 'product/tools/requeue-watch.sh$' "$WF" && echo 1)" "$WF"
finish
