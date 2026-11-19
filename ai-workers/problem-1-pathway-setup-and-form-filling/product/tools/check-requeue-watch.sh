#!/usr/bin/env bash
# ENF-746b (P-746 (3), (4)): requeue-watch.sh with GitHub answered by a stand-in curl (the dequeued PRs, each PR's head,
# comments and files, the merge-queue batches and their check runs, a batch's job log, all from files; POSTs written to
# a log), its proof mode on gh pr list JSON, and the wiring in lead-watch.sh and requeue-watch.yml. The
# Mergify payload is the one #2315 carried on 19 Nov. US$0, no network.
#   bash product/tools/check-requeue-watch.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/requeue.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/fx"
cat > "$T/bin/curl" <<'EOF2'
#!/usr/bin/env bash
m=GET; d=""; u=""
while [ $# -gt 0 ]; do case "$1" in -X) m=$2; shift;; -d) d=$2; shift;; -H) shift;; http*) u=$1;; esac; shift; done
p=${u#https://api.test/repos/o/r/}; pg=$(printf '%s' "$p" | sed -n 's/.*[?&]page=\([0-9]*\).*/\1/p')
f() { [ -f "$FX/$1" ] && cat "$FX/$1" || { echo '{"message":"Not Found"}'; exit 22; }; }
case "$m $p" in
  "GET issues?state=open&labels=dequeued"*) [ "$pg" = 1 ] && f issues.json || echo '[]';;
  "GET issues/"*/comments*) n=$(echo "$p" | cut -d/ -f2); [ "$pg" = 1 ] && f "comments-$n.json" || echo '[]';;
  "GET pulls?state=all"*) f batches.json;;
  "GET pulls/"*/files*) n=$(echo "$p" | cut -d/ -f2); [ "$pg" = 1 ] && { [ -f "$FX/files-$n.json" ] && cat "$FX/files-$n.json" || echo '[]'; } || echo '[]';;
  "GET pulls/"*) f "pull-$(echo "$p" | cut -d/ -f2).json";;
  "GET commits/"*/check-runs*) s=$(echo "$p" | cut -d/ -f2); c=$(printf '%s' "$p" | sed -n 's/.*check_name=\([^&]*\).*/\1/p')
    echo "$c" >> "$FX/names"; f "runs-$s.json" | jq --arg c "$c" '{check_runs: [.check_runs[] | select(.name == $c)]}';;
  "GET actions/jobs/"*/logs) f "log-$(echo "$p" | cut -d/ -f3).txt";;
  "POST issues/"*/comments) echo "POST $(echo "$p" | cut -d/ -f2) $(echo "$d" | jq -r .body | tr '\n' ' ' | cut -c1-400)" >> "$FX/log"; echo '{}';;
  *) echo "unexpected $m $p" >> "$FX/log"; exit 22;;
esac
EOF2
chmod +x "$T/bin/curl"
S="$TOOLS/requeue-watch.sh"
if [ ! -f "$S" ]; then ok "requeue-watch.sh exists (ENF-746b)" 0 "no $S"; finish; fi
A=$(printf 'a%.0s' {1..40}); B=$(printf 'b%.0s' {1..40}); D=$(printf 'd%.0s' {1..40}); X=$(printf 'f%.0s' {1..40})
NOW=1795640000; BOT='github-actions[bot]'
at() { jq -rn --argjson t $((NOW - $1)) '$t | todate'; }   # at <seconds ago> → ISO time
LEFT=$(jq -rn --argjson t $((NOW - 1800)) '$t | strftime("%Y-%m-%dT%H:%M:%S.467292+00:00")')
issue() { jq -n --argjson n "$1" --arg l "$2" '{number: $n, pull_request: {url: "x"}, labels: ($l | split(",") | map({name: .}))}'; }
cm() { jq -n --arg u "$1" --arg a "$2" --arg b "$3" --arg t "$(at "$4")" '{user: {login: $u}, author_association: $a, body: $b, created_at: $t}'; }
pay() {  # pay <state> <checks json> [left_at] [speculative pr] → a Mergify payload comment body, as on #2315
  printf '<!---\nDO NOT EDIT\n-*- Mergify Payload -*-\n%s\n-*- Mergify Payload End -*-\n-->\n\n### ❌ Left the queue · `fast` fails with this pull request' \
    "$(jq -cn --arg s "$1" --argjson c "$2" --arg l "${3:-}" --arg sp "${4:-}" '{version: 1, state: $s, queue_rule_name: "product",
      speculative_check_pr: (if $sp == "" then null else ($sp | tonumber) end), left_at: (if $l == "" then null else $l end),
      dequeue_reason: {code: "CHECKS_FAILED", label: "checks failed", checks: $c, checks_count: ($c | length)}}')"; }
dequeued() {  # dequeued <pr> <head>, extra comments (JSON) on stdin → fixtures of one approved, dequeued PR
  jq -n --arg h "$2" '{head: {sha: $h}}' > "$T/fx/pull-$1.json"
  { cm o OWNER "Reviewer: Approve $A" 7200; cm "mergify[bot]" CONTRIBUTOR "$(pay checking '[]' '' 99)" 5000
    cm "mergify[bot]" CONTRIBUTOR "$(pay dequeued '["ci","fast"]' "$LEFT")" "${DQ_AGO:-1700}"; cat; } | jq -s . > "$T/fx/comments-$1.json"; }
batch() {  # batch <n> <sha> <conclusion of fast> <seconds before left_at> [member PR, default the batch number] → one merge-queue draft and its runs
  jq -n --argjson n "$1" --arg s "$2" --arg t "$(at $((1800 + $4)))" --arg m "${5:-$1}" \
    '{number: $n, user: {login: "mergify[bot]"}, head: {ref: "mergify/merge-queue/x\($n)", sha: $s}, created_at: $t,
      body: "> Mergify opened it for batch b of the `product` queue, to test [#\($m)](/o/r/pull/\($m)) before it merges into `main`."}' >> "$T/fx/b.jsonl"
  jq -n --arg c "$3" '{check_runs: [{id: 555, name: "ci", conclusion: $c}, {id: 555, name: "fast", conclusion: $c}]}' > "$T/fx/runs-$2.json"
  jq -s . "$T/fx/b.jsonl" > "$T/fx/batches.json"; }
reset() { rm -f "$T/fx"/*; { issue 10 "review: approved,dequeued"; } | jq -s . > "$T/fx/issues.json"; echo '[]' > "$T/fx/batches.json"
  jq -n --arg h "$D" '{head: {sha: $h}}' > "$T/fx/pull-99.json"; echo '{"check_runs":[{"id":555,"name":"fast","conclusion":"success"}]}' > "$T/fx/runs-$D.json"; }   # this PR's own batch
broken() { batch 201 "$(printf '1%.0s' {1..40})" failure 600; batch 202 "$(printf '2%.0s' {1..40})" failure 300; }   # main broken: two batches without #10 red
run() { : >> "$T/fx/log"; out=$(PATH="$T/bin:$PATH" FX="$T/fx" GH_TOKEN=x REPO=o/r REVIEWERS="rev1 rev2" API=https://api.test NOW=$NOW bash "$S" 2>&1); r=$?; log=$(cat "$T/fx/log" 2>/dev/null); rm -f "$T/fx/log"; }
queued10() { [ $r = 0 ] && grep -q "^POST 10 @mergifyio queue  <!-- requeue-watch:queued sha=$A -->" <<< "$log" && ! grep -q unexpected <<< "$log" && echo 1; }

# 1. Unchanged head, main shared the failure (two batches built on main then, without this PR, failed `fast`).
reset; dequeued 10 "$A" < /dev/null; broken; run
ok "requeue: head unchanged since the Approve, \`fast\` also failed in batches on main then without this PR → \"@mergifyio queue\"" "$(queued10)" "exit $r: $out / $log"
ok "requeue: \`dequeued\` is left for Mergify (no DELETE), and the job is read by name (\`fast\`, not the aggregate \`ci\`)" "$(! grep -q DELETE <<< "$log" && grep -qx fast "$T/fx/names" && ! grep -qx ci "$T/fx/names" && echo 1)" "$log / $(cat "$T/fx/names")"
# 1b. Idempotent: the same head already requeued once (by POSTER) → never twice; a forged marker by someone else does not count.
cm "$BOT" NONE "@mergifyio queue
<!-- requeue-watch:queued sha=$A -->" 900 | dequeued 10 "$A"; run
ok "idempotent: a head requeued once is never requeued again" "$([ $r = 0 ] && [ -z "$log" ] && grep -q 'already requeued once' <<< "$out" && echo 1)" "exit $r: $out / $log"
cm stranger NONE "<!-- requeue-watch:queued sha=$A -->" 900 | dequeued 10 "$A"; run
ok "a marker forged by another commenter does not block the requeue" "$(queued10)" "exit $r: $out / $log"
# 1c. Requeued 40 min ago and Mergify never answered: one question for the tech lead (a refused bot command), once.
cm "$BOT" NONE "@mergifyio queue
<!-- requeue-watch:queued sha=$A -->" 2400 | DQ_AGO=3000 dequeued 10 "$A"; run
ok "a requeue Mergify does not answer in 30 min → one question for the tech lead" "$(grep -q "^POST 10 Question for the tech lead: requeue watch (ENF-746b) commented \"@mergifyio queue\"" <<< "$log" && echo 1)" "exit $r: $out / $log"
{ cm "$BOT" NONE "<!-- requeue-watch:queued sha=$A -->" 2400; cm "$BOT" NONE "<!-- requeue-watch:stall sha=$A -->" 300; } | DQ_AGO=3000 dequeued 10 "$A"; run
ok "the stall question is asked once" "$([ -z "$log" ] && echo 1)" "exit $r: $out / $log"

# 2. A new head since the Approve: no requeue, no comment.
reset; dequeued 10 "$B" < /dev/null; broken; run
ok "no requeue on a new head (head is not the SHA the reviewer approved)" "$([ $r = 0 ] && [ -z "$log" ] && grep -q 'not the approved' <<< "$out" && echo 1)" "exit $r: $out / $log"
# 2b. Approve lines that do not count: an outsider, and a member who is not the owner or a listed reviewer.
reset; { cm stranger NONE "Reviewer: Approve $X" 600; cm someone MEMBER "Reviewer: Approve $X" 500; } | dequeued 10 "$X"; broken; run
ok "an Approve line by an outsider or an unlisted member is ignored" "$([ -z "$log" ] && grep -q 'not the approved' <<< "$out" && echo 1)" "exit $r: $out / $log"
cm rev2 MEMBER "**Reviewer: Approve $X**" 500 | dequeued 10 "$X"; run
ok "an Approve line by a listed reviewer counts (bold allowed, as in ci.yml)" "$(grep -q "^POST 10 @mergifyio queue  <!-- requeue-watch:queued sha=$X -->" <<< "$log" && echo 1)" "exit $r: $out / $log"

# 3. A failure main does not share: no requeue, one comment naming the job, once.
reset; dequeued 10 "$A" < /dev/null; batch 201 "$(printf '1%.0s' {1..40})" success 600; run
ok "no requeue on a PR-only failure; a comment names the failing job" \
  "$([ $r = 0 ] && ! grep -q '@mergifyio' <<< "$log" && grep -q '^POST 10 \*\*Requeue watch (ENF-746b, P-746):\*\* not requeued: `fast` failed with this PR' <<< "$log" && echo 1)" "exit $r: $out / $log"
cm "$BOT" NONE "$(sed -n 's/^POST 10 //p' <<< "$log" | sed 's/.*\(<!-- requeue-watch:own[^>]*-->\).*/\1/')" 60 | dequeued 10 "$A"; run
ok "the PR-only comment is posted once per head and dequeue" "$([ $r = 0 ] && [ -z "$log" ] && echo 1)" "exit $r: $out / $log"
reset; dequeued 10 "$A" < /dev/null; batch 201 "$(printf '1%.0s' {1..40})" failure 600; run
ok "one other red batch is not enough (a PR of its own can break it)" "$(grep -q 'not requeued' <<< "$log" && echo 1)" "exit $r: $out / $log"
batch 202 "$(printf '2%.0s' {1..40})" failure 300 10; run
ok "a batch that contains this PR does not count as main's" "$(grep -q 'not requeued' <<< "$log" && echo 1)" "exit $r: $out / $log"
batch 203 "$(printf '3%.0s' {1..40})" failure 7200; run
ok "a batch from outside the hour before left_at does not count" "$(grep -q 'not requeued' <<< "$log" && echo 1)" "exit $r: $out / $log"
reset; dequeued 10 "$A" < /dev/null; batch 201 "$(printf '1%.0s' {1..40})" failure 600 55; batch 202 "$(printf '2%.0s' {1..40})" failure 300 55; run
ok "two red batches retesting the same other PR are one broken PR, not main" "$(grep -q 'not requeued' <<< "$log" && echo 1)" "exit $r: $out / $log"
reset; dequeued 10 "$A" < /dev/null; batch 201 "$(printf '1%.0s' {1..40})" failure 600 "55)(/o/r/pull/66"; run
ok "one red batch of two other PRs is one broken batch, not main" "$(grep -q 'not requeued' <<< "$log" && echo 1)" "exit $r: $out / $log"
reset; dequeued 10 "$A" < /dev/null; broken; jq -n '[range(100) | {number: 1, user: {login: "x"}, head: {ref: "x", sha: "x"}, created_at: "2099-01-01T00:00:00Z", body: ""}]' > "$T/fx/batches.json"; run
ok "a drop older than the newest 100 PRs is left unjudged (exit 2), never an \"own failure\" comment" "$([ $r = 2 ] && [ -z "$log" ] && echo 1)" "exit $r: $out / $log"
# 3b. A read error: not judged, no comment, exit 2.
reset; dequeued 10 "$A" < /dev/null; broken; rm -f "$T/fx/runs-$(printf '1%.0s' {1..40}).json"; run
ok "a batch's checks unreadable → no comment either way, exit 2, the next run tries again" "$([ $r = 2 ] && [ -z "$log" ] && grep -q 'not judged' <<< "$out" && echo 1)" "exit $r: $out / $log"

# 4. A 4th time in 24 h: no requeue; one question for the tech lead (once a day).
reset; { for s in "$B" "$D" "$X"; do cm "$BOT" NONE "@mergifyio queue
<!-- requeue-watch:queued sha=$s -->" 3600; done; } | dequeued 10 "$A"; broken; run
ok "no requeue a 4th time in 24 h; a question for the tech lead instead" \
  "$([ $r = 0 ] && ! grep -q '@mergifyio' <<< "$log" && grep -q '^POST 10 Question for the tech lead: requeue watch (ENF-746b) requeued this PR 3 times' <<< "$log" && echo 1)" "exit $r: $out / $log"
{ for s in "$B" "$D" "$X"; do cm "$BOT" NONE "<!-- requeue-watch:queued sha=$s -->" 3600; done
  cm "$BOT" NONE "Question <!-- requeue-watch:limit day=$(jq -rn --argjson t $NOW '$t | strftime("%Y-%m-%d")') -->" 600; } | dequeued 10 "$A"; run
ok "the limit question is posted once a day" "$([ $r = 0 ] && [ -z "$log" ] && echo 1)" "exit $r: $out / $log"
{ for s in "$B" "$D" "$X"; do cm "$BOT" NONE "<!-- requeue-watch:queued sha=$s -->" 90000; done; } | dequeued 10 "$A"; run
ok "requeues older than 24 h do not count toward the 3" "$(queued10)" "exit $r: $out / $log"

# 6. A pipeline lock from requeue-locks.txt in the failed job's log of this PR's batch (#99).
reset; dequeued 10 "$A" < /dev/null
jq -n --arg h "$D" '{head: {sha: $h}}' > "$T/fx/pull-99.json"; echo '{"check_runs":[{"id":555,"name":"fast","conclusion":"failure"}]}' > "$T/fx/runs-$D.json"
echo "WORKFLOW LOCK: P-735 changes the workflow (it is in decision-impact.sh's EXEMPT ...)" > "$T/fx/log-555.txt"; run
ok "a pipeline lock (requeue-locks.txt) in the batch's failed job log → requeue" "$(queued10 >/dev/null && grep -q 'pipeline lock' <<< "$out" && echo 1)" "exit $r: $out / $log"
echo '[{"filename":"ai-workers/problem-1-pathway-setup-and-form-filling/product/DECISIONS.md"}]' > "$T/fx/files-10.json"; run
ok "the lock does not cover a PR that changes DECISIONS.md itself" "$(! grep -q '@mergifyio' <<< "$log" && grep -q 'own failure' <<< "$out" && echo 1)" "exit $r: $out / $log"

# 7. Proof first (P-746 (3)): the lead-watch line, and non-zero past 60 min.
prs() { jq -n --arg old "$(at 4200)" --arg new "$(at 1200)" '[
  {number: 1, title: "qa: R1.80 Works on main 4a4b6bc00", labels: [{name: "review: approved"}], isDraft: false, headRefName: "q1", statusCheckRollup: [{name: "ci", status: "COMPLETED", conclusion: "FAILURE"}], createdAt: $old},
  {number: 2, title: "qa: R1.28 Consent recorded per purpose — Works", labels: [], isDraft: false, headRefName: "q2", statusCheckRollup: [], createdAt: $new},
  {number: 3, title: "qa: R1.67 stays Partial", labels: [], isDraft: false, headRefName: "q3", statusCheckRollup: [], createdAt: $old},
  {number: 4, title: "qa: R1.5 Works", labels: [{name: "queued"}], isDraft: false, headRefName: "q4", statusCheckRollup: [], createdAt: $old}]'; }
po=$(prs | NOW=$NOW bash "$S" proof); pr_=$?
ok "proof line lists qa Works PRs out of the queue with the reason (not Partial ones, not queued ones)" \
  "$(grep -q '^proof  qa proof PRs not in the queue (P-746 (3)): #1 red: ci, open 70 min · #2 no review: approved label, open 20 min$' <<< "$po" && echo 1)" "$po"
ok "proof: one waiting over 60 min → an ACT line and a non-zero exit" "$([ $pr_ = 1 ] && grep -q '^ACT   proof #1 open 70 min and not in the queue' <<< "$po" && echo 1)" "exit $pr_: $po"
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
