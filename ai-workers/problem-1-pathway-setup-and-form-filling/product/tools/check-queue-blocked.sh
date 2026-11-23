#!/usr/bin/env bash
# ENF-758 (P-757, P-758): lead-watch's "queue blocked by checks" ACT line. queue-blocked.py on fake GitHub answers (a fake
# gh in place of gh.sh), and lead-watch.sh's wiring. Fires for an approved, green, check-only PR while checks hold the
# queue; silent for product code, unapproved, red ci, or a queue checks do not hold. US$0, no network.
#   bash product/tools/check-queue-blocked.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/qblock.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
Q="$TOOLS/queue-blocked.py"; R=o/r; NOW=2026-11-20T08:00:00Z
H=1111111111111111111111111111111111111111; OLD=2222222222222222222222222222222222222222; S=ai-workers/problem-1-pathway-setup-and-form-filling
# The fake gh answers "gh api <path>" from $D/<path with every other character as _>, logs each call, fails when no answer.
cat > "$T/gh" <<'EOF'
echo "$*" >> "$D/log"; f="$D/$(printf '%s' "$*" | tr -c 'A-Za-z0-9' _)"
[ -f "$f" ] && cat "$f" || { echo "HTTP 404: no fake answer for $*" >&2; exit 1; }
EOF
put() { printf '%s' "$2" > "$D/$(printf '%s' "api $1" | tr -c 'A-Za-z0-9' _)"; }
run() { : > "$D/log"; D="$D" QB_GH="bash $T/gh" REVIEWERS= python3 -I "$Q" --repo $R --now $NOW 2>&1; }
# Lead 4 (23 Nov): the advice never suggests a browser merge without the Lead's read of the diff (P-423). Without a
# "Lead read the diff: <full head>" line it asks for the read (ACT10); with one it offers the merge (MERGE10), naming the
# full head it judged, so a push between the check and the click is seen (F2, follow-up on #2590, 23 Nov).
ACT10="ACT   queue blocked by checks: #10 (Hold the clock test until 06:00 IST) is a check-only fix, approved, ci green: read its diff first (P-423), then post \"Lead read the diff: $H\"; the next check offers the merge (P-757, P-758)"
MERGE10="ACT   queue blocked by checks: #10 (Hold the clock test until 06:00 IST) is a check-only fix, approved, ci green, the Lead's read on head $H: merge it in the browser now, only while its head is still $H (P-757, P-758)"
LR() { printf '{"author_association":"%s","user":{"login":"o"},"created_at":"2026-11-20T07:20:00Z","updated_at":"%s","body":"%s"}' "$1" "${3:-2026-11-20T07:20:00Z}" "$2"; }
scene() {  # a fresh world: main's guards red, no batch, no dequeue; PR #10 check-only, approved by label, ci green
  D="$T/$1"; mkdir -p "$D"
  put "repos/$R/actions/workflows/guards.yml/runs?per_page=100" '{"workflow_runs":[{"id":7,"head_branch":"mergify/merge-queue/abc","status":"completed","conclusion":"failure","created_at":"2026-11-20T07:00:00Z"},{"id":6,"head_branch":"main","status":"completed","conclusion":"success","created_at":"2026-11-20T06:00:00Z"},{"id":8,"head_branch":"mergify/merge-queue/def","status":"in_progress","conclusion":null,"created_at":"2026-11-20T07:50:00Z"},{"id":9,"head_branch":"fix/other","status":"completed","conclusion":"success","created_at":"2026-11-20T07:55:00Z"}]}'
  put "repos/$R/actions/workflows/ci.yml/runs?per_page=100" '{"workflow_runs":[{"id":90,"head_branch":"feature/x","conclusion":"failure","updated_at":"2026-11-20T07:30:00Z"}]}'
  put "repos/$R/issues/events?per_page=100&page=1" '[{"event":"labeled","label":{"name":"queued"},"issue":{"number":3},"created_at":"2026-11-20T07:40:00Z"}]'
  put "repos/$R/pulls?state=open&per_page=100" '[{"number":10,"title":"Hold the clock test until 06:00 IST","draft":false,"head":{"sha":"'$H'","ref":"fix/test-hold"},"labels":[{"name":"review: approved"}]}]'
  put "repos/$R/pulls/10/files?per_page=100&page=1" '[{"filename":"'$S'/prototype/studio/tests/clock.spec.ts"},{"filename":".mergify.yml"},{"filename":"'$S'/product/tools/check-queue-gate.sh"}]'
  put "repos/$R/commits/$H/check-runs?check_name=ci&filter=latest&per_page=100" '{"check_runs":[{"name":"ci","status":"completed","conclusion":"success","completed_at":"2026-11-20T07:10:00Z","app":{"slug":"github-actions"}}]}'
  put "repos/$R/issues/10/comments?per_page=100&page=1" '[]'
}
quiet() { ! grep -q '^ACT' <<< "$1"; }

scene fire; out=$(run)
ok "main's guards red (newest finished run on a merge batch; a newer PR-branch run does not count): an approved, green, check-only PR gets the ACT line, word for word" "$(grep -qxF "$ACT10" <<< "$out" && echo 1)" "$out"
ok "the held line names why (guards red on main, run 7) and counts one fix" "$(grep -qx 'checks queue held by checks (guards red on a merge batch (run 7)): 1 approved green check-only fix(es) open' <<< "$out" && echo 1)" "$out"

scene green; put "repos/$R/actions/workflows/guards.yml/runs?per_page=100" '{"workflow_runs":[{"id":7,"head_branch":"main","status":"completed","conclusion":"success","created_at":"2026-11-20T07:00:00Z"}]}'
out=$(run)
ok "main green, no failed batch, no dequeue: silent, one checks line" "$(quiet "$out" && grep -q "^checks main's guards green" <<< "$out" && echo 1)" "$out"
ok "main green: no PR is read (no per-PR calls)" "$(! grep -q 'pulls' "$D/log" && echo 1)" "$(cat "$D/log")"

scene batch; put "repos/$R/actions/workflows/guards.yml/runs?per_page=100" '{"workflow_runs":[]}'
put "repos/$R/actions/workflows/ci.yml/runs?per_page=100" '{"workflow_runs":[{"id":91,"head_branch":"mergify/merge-queue/abc","conclusion":"failure","updated_at":"2026-11-20T06:30:00Z"}]}'
out=$(run)
ok "a merge batch's ci failed 90 min ago: fires" "$(grep -qxF "$ACT10" <<< "$out" && grep -q 'merge batch failed in 2 h (run 91)' <<< "$out" && echo 1)" "$out"
put "repos/$R/actions/workflows/ci.yml/runs?per_page=100" '{"workflow_runs":[{"id":91,"head_branch":"mergify/merge-queue/abc","conclusion":"failure","updated_at":"2026-11-20T05:30:00Z"}]}'
out=$(run)
ok "a batch that failed 2 h 30 min ago no longer holds: silent" "$(quiet "$out" && echo 1)" "$out"

scene deq; put "repos/$R/actions/workflows/guards.yml/runs?per_page=100" '{"workflow_runs":[]}'
put "repos/$R/issues/events?per_page=100&page=1" '[{"event":"labeled","label":{"name":"dequeued"},"issue":{"number":2438},"created_at":"2026-11-20T07:15:00Z"}]'
out=$(run)
ok "a PR dequeued 45 min ago: fires, naming it" "$(grep -qxF "$ACT10" <<< "$out" && grep -q 'dequeued in 2 h: #2438' <<< "$out" && echo 1)" "$out"
put "repos/$R/issues/events?per_page=100&page=1" '[{"event":"labeled","label":{"name":"dequeued"},"issue":{"number":2438},"created_at":"2026-11-20T05:15:00Z"}]'
out=$(run)
ok "a dequeue 2 h 45 min ago: silent" "$(quiet "$out" && echo 1)" "$out"

scene prod; put "repos/$R/pulls/10/files?per_page=100&page=1" '[{"filename":"'$S'/prototype/studio/tests/clock.spec.ts"},{"filename":"'$S'/prototype/studio/api/src/clock.ts"}]'
out=$(run)
ok "the PR also touches product code: silent" "$(quiet "$out" && echo 1)" "$out"
for f in .github/workflows/ci.yml tests/e2e/a.spec.ts $S/prototype/studio/tools/run-suites.sh $S/product/tools/label-guard.sh $S/product/tools/fixtures/a.json; do
  put "repos/$R/pulls/10/files?per_page=100&page=1" '[{"filename":"'$f'"}]'; out=$(run)
  ok "check path: $f alone fires" "$(grep -qxF "$ACT10" <<< "$out" && echo 1)" "$out"; done
for f in $S/product/tools/lead-watch.sh $S/prototype/studio/web/src/tests.tsx $S/product/STATE.md; do
  put "repos/$R/pulls/10/files?per_page=100&page=1" '[{"filename":"'$f'"}]'; out=$(run)
  ok "not a check path: $f is silent" "$(quiet "$out" && echo 1)" "$out"; done
put "repos/$R/pulls/10/files?per_page=100&page=1" '[]'; out=$(run)
ok "a PR with no changed files: silent" "$(quiet "$out" && echo 1)" "$out"

scene unappr; put "repos/$R/pulls?state=open&per_page=100" '[{"number":10,"title":"Hold the clock test until 06:00 IST","draft":false,"head":{"sha":"'$H'","ref":"fix/test-hold"},"labels":[]}]'
out=$(run)
ok "no label and no Approve comment: silent" "$(quiet "$out" && echo 1)" "$out"
put "repos/$R/issues/10/comments?per_page=100&page=1" '[{"author_association":"MEMBER","user":{"login":"o"},"body":"**Reviewer: Approve '$H'**"}]'; out=$(run)
ok "\"Reviewer: Approve <head>\" from a member: fires" "$(grep -qxF "$ACT10" <<< "$out" && echo 1)" "$out"
put "repos/$R/issues/10/comments?per_page=100&page=1" '[{"author_association":"MEMBER","user":{"login":"o"},"body":"Reviewer: Approve '$OLD'"}]'; out=$(run)
ok "an Approve naming an older head: silent" "$(quiet "$out" && echo 1)" "$out"
put "repos/$R/issues/10/comments?per_page=100&page=1" '[{"author_association":"NONE","user":{"login":"o"},"body":"Reviewer: Approve '$H'"}]'; out=$(run)
ok "an Approve from someone without write access: silent" "$(quiet "$out" && echo 1)" "$out"
put "repos/$R/issues/10/comments?per_page=100&page=1" '[{"author_association":"OWNER","user":{"login":"o"},"body":"Reviewer: Approve '$H'"},{"author_association":"OWNER","user":{"login":"o"},"body":"Reviewer: Changes requested: M1"}]'; out=$(run)
ok "a later verdict naming no SHA (changes requested) overrides the Approve: silent" "$(quiet "$out" && echo 1)" "$out"
put "repos/$R/issues/10/comments?per_page=100&page=1" '[{"author_association":"OWNER","user":{"login":"o"},"body":"Reviewer: Approve '${H:0:9}'"}]'; out=$(run)
ok "an Approve naming only a prefix of the head: silent (the full head, as queue-gate.sh)" "$(quiet "$out" && echo 1)" "$out"

scene ci; put "repos/$R/commits/$H/check-runs?check_name=ci&filter=latest&per_page=100" '{"check_runs":[{"name":"ci","status":"completed","conclusion":"failure","completed_at":"2026-11-20T07:10:00Z","app":{"slug":"github-actions"}}]}'
out=$(run); ok "ci red on the head: silent" "$(quiet "$out" && echo 1)" "$out"
put "repos/$R/commits/$H/check-runs?check_name=ci&filter=latest&per_page=100" '{"check_runs":[{"name":"ci","status":"in_progress","conclusion":null,"app":{"slug":"github-actions"}}]}'
out=$(run); ok "ci still running: silent" "$(quiet "$out" && echo 1)" "$out"
put "repos/$R/commits/$H/check-runs?check_name=ci&filter=latest&per_page=100" '{"check_runs":[]}'
out=$(run); ok "no ci on the head: silent" "$(quiet "$out" && echo 1)" "$out"
put "repos/$R/commits/$H/check-runs?check_name=ci&filter=latest&per_page=100" '{"check_runs":[{"name":"ci","status":"completed","conclusion":"success","completed_at":"2026-11-20T07:10:00Z","app":{"slug":"github-actions"}},{"name":"ci","status":"in_progress","conclusion":null,"app":{"slug":"github-actions"}}]}'
out=$(run); ok "a green ci with a newer ci still running (a re-run): silent" "$(quiet "$out" && echo 1)" "$out"

scene skip; put "repos/$R/pulls?state=open&per_page=100" '[{"number":10,"title":"t","draft":true,"head":{"sha":"'$H'","ref":"fix/x"},"labels":[{"name":"review: approved"}]},{"number":11,"title":"t","draft":false,"head":{"sha":"'$H'","ref":"mergify/merge-queue/x"},"labels":[{"name":"review: approved"}]}]'
put "repos/$R/pulls/11/files?per_page=100&page=1" '[{"filename":".mergify.yml"}]'
out=$(run); ok "a draft and a Mergify batch PR: silent, and neither is read" "$(quiet "$out" && ! grep -q 'pulls/1[01]/' "$D/log" && echo 1)" "$out"

scene unread; rm -f "$D"/*guards*; out=$(run)
ok "guards runs unreadable: said on a warn line, and the queue counts as possibly held (the fix still shows)" "$(grep -q '^warn  queue blocked by checks: main.s guards runs unreadable' <<< "$out" && grep -qxF "$ACT10" <<< "$out" && echo 1)" "$out"
scene bad; put "repos/$R/pulls?state=open&per_page=100" '{"message":"API rate limit exceeded"}'; out=$(run)
ok "open PRs unreadable: warn line, no traceback" "$(grep -q '^warn  queue blocked by checks: open PRs unreadable (API rate limit exceeded)' <<< "$out" && ! grep -q Traceback <<< "$out" && echo 1)" "$out"

scene src; put "repos/$R/actions/workflows/guards.yml/runs?per_page=100" '{"workflow_runs":[{"id":5,"head_branch":"main","status":"completed","conclusion":"success","created_at":"2026-11-20T06:00:00Z"},{"id":9,"head_branch":"fix/other","status":"completed","conclusion":"failure","created_at":"2026-11-20T07:55:00Z"}]}'
out=$(run); ok "a red guards run on a PR branch is not main's: silent" "$(quiet "$out" && echo 1)" "$out"
put "repos/$R/actions/workflows/guards.yml/runs?per_page=100" '{"workflow_runs":[{"id":4,"head_branch":"main","status":"completed","conclusion":"timed_out","created_at":"2026-11-20T06:00:00Z"}]}'
out=$(run); ok "guards timed out on main: fires" "$(grep -qxF "$ACT10" <<< "$out" && grep -q 'guards red on main (run 4)' <<< "$out" && echo 1)" "$out"
put "repos/$R/actions/workflows/guards.yml/runs?per_page=100" '{"workflow_runs":[{"id":3,"head_branch":"mergify/merge-queue/a","status":"completed","conclusion":"failure","created_at":"2026-11-20T04:00:00Z"},{"id":4,"head_branch":"mergify/merge-queue/b","status":"completed","conclusion":"cancelled","created_at":"2026-11-20T07:30:00Z"}]}'
out=$(run); ok "a newer cancelled batch run does not hide the red one before it: fires" "$(grep -qxF "$ACT10" <<< "$out" && grep -q 'guards red on a merge batch (run 3)' <<< "$out" && echo 1)" "$out"
put "repos/$R/actions/workflows/guards.yml/runs?per_page=100" '{"workflow_runs":[{"id":3,"head_branch":"mergify/merge-queue/a","status":"completed","conclusion":"failure","created_at":"2026-11-20T07:03:00Z"},{"id":4,"head_branch":"mergify/merge-queue/b","status":"completed","conclusion":"success","created_at":"2026-11-20T07:38:00Z"}]}'
out=$(run); ok "red in one batch 57 min ago, green in another since (parallel scopes, 20 Nov 07:03/07:38): fires" "$(grep -qxF "$ACT10" <<< "$out" && grep -q 'guards red on a merge batch (run 3)' <<< "$out" && echo 1)" "$out"
put "repos/$R/actions/workflows/guards.yml/runs?per_page=100" '{"workflow_runs":[{"id":3,"head_branch":"mergify/merge-queue/a","status":"completed","conclusion":"failure","created_at":"2026-11-20T05:00:00Z"},{"id":4,"head_branch":"mergify/merge-queue/b","status":"completed","conclusion":"success","created_at":"2026-11-20T07:38:00Z"}]}'
out=$(run); ok "red 3 h ago, green since: silent" "$(quiet "$out" && echo 1)" "$out"
put "repos/$R/actions/workflows/guards.yml/runs?per_page=100" '{"workflow_runs":[{"id":9,"head_branch":"fix/other","status":"completed","conclusion":"failure","created_at":"2026-11-20T07:55:00Z"}]}'
out=$(run); ok "no guards run on main or a batch: a not-measured line, never \"main's guards green\", and silent" "$(quiet "$out" && grep -q '^guards: no finished run on main or a merge batch' <<< "$out" && grep -qx 'checks no failed merge batch or dequeue in 2 h: the queue is not held by checks' <<< "$out" && echo 1)" "$out"

scene pg; put "repos/$R/actions/workflows/guards.yml/runs?per_page=100" '{"workflow_runs":[]}'
put "repos/$R/issues/events?per_page=100&page=1" "$(python3 -c 'import json; print(json.dumps([{"event":"labeled","label":{"name":"queued"},"issue":{"number":3},"created_at":"2026-11-20T07:50:00Z"}]*100))')"
put "repos/$R/issues/events?per_page=100&page=2" '[{"event":"labeled","label":{"name":"dequeued"},"issue":{"number":2438},"created_at":"2026-11-20T06:30:00Z"},{"event":"labeled","label":{"name":"queued"},"issue":{"number":3},"created_at":"2026-11-20T05:00:00Z"}]'
out=$(run); ok "a dequeue on the second page of events (busy day): fires" "$(grep -qxF "$ACT10" <<< "$out" && grep -q 'dequeued in 2 h: #2438' <<< "$out" && echo 1)" "$out"
put "repos/$R/issues/events?per_page=100&page=2" "$(python3 -c 'import json; print(json.dumps([{"event":"labeled","label":{"name":"queued"},"issue":{"number":3},"created_at":"2026-11-20T07:50:00Z"}]*100))')"
for n in 3 4 5; do cp "$D/$(printf '%s' "api repos/$R/issues/events?per_page=100&page=2" | tr -c 'A-Za-z0-9' _)" "$D/$(printf '%s' "api repos/$R/issues/events?per_page=100&page=$n" | tr -c 'A-Za-z0-9' _)"; done
out=$(run); ok "more than 5 pages of events in 2 h: a warn line, counted as possibly held" "$(grep -q '^warn  queue blocked by checks: dequeue events unreadable (more than 5 pages)' <<< "$out" && grep -qxF "$ACT10" <<< "$out" && echo 1)" "$out"

scene files; put "repos/$R/pulls/10/files?per_page=100&page=1" "$(python3 -c 'import json; print(json.dumps([{"filename":".github/workflows/w%d.yml" % i} for i in range(100)]))')"
put "repos/$R/pulls/10/files?per_page=100&page=2" '[{"filename":"'$S'/prototype/studio/api/src/clock.ts"}]'
out=$(run); ok "product code on the second page of files: silent" "$(quiet "$out" && echo 1)" "$out"
put "repos/$R/pulls/10/files?per_page=100&page=1" '[{"filename":"'$S'/prototype/studio/tests/clock.ts","previous_filename":"'$S'/prototype/studio/api/src/clock.ts"}]'
out=$(run); ok "a product file renamed into a test folder: silent (both sides of a rename count)" "$(quiet "$out" && echo 1)" "$out"

scene who; put "repos/$R/pulls?state=open&per_page=100" '[{"number":10,"title":"Hold the clock test until 06:00 IST","draft":false,"head":{"sha":"'$H'","ref":"fix/test-hold"},"labels":[]}]'
put "repos/$R/issues/10/comments?per_page=100&page=1" '[{"author_association":"COLLABORATOR","user":{"login":"lane-bot"},"body":"Reviewer: Approve '$H'"}]'
out=$(run); ok "an Approve from a collaborator outside the owner and REVIEWERS: silent (queue-gate.sh would not label it)" "$(quiet "$out" && echo 1)" "$out"
: > "$D/log"; out=$(D="$D" QB_GH="bash $T/gh" REVIEWERS="someone lane-bot" python3 -I "$Q" --repo $R --now $NOW 2>&1)
ok "the same Approve with its login in REVIEWERS (env): fires" "$(grep -qxF "$ACT10" <<< "$out" && echo 1)" "$out"
printf '%s\n' 'someone lane-bot' > "$D/$(printf '%s' "api repos/$R/actions/variables/REVIEWERS -q .value" | tr -c 'A-Za-z0-9' _)"
: > "$D/log"; out=$(env -u REVIEWERS D="$D" QB_GH="bash $T/gh" python3 -I "$Q" --repo $R --now $NOW 2>&1)
ok "REVIEWERS unset (the Mac): read from the repository variable through gh, and the Approve fires" "$(grep -qxF "$ACT10" <<< "$out" && grep -q 'actions/variables/REVIEWERS' "$D/log" && echo 1)" "$out"
put "repos/$R/issues/10/comments?per_page=100&page=1" "$(python3 -c 'import json; print(json.dumps([{"author_association":"OWNER","user":{"login":"o"},"body":"note"}]*100))')"
put "repos/$R/issues/10/comments?per_page=100&page=2" '[{"author_association":"OWNER","user":{"login":"o"},"body":"Reviewer: Approve '$H'"}]'
out=$(run); ok "the Approve on the second page of comments: fires" "$(grep -qxF "$ACT10" <<< "$out" && echo 1)" "$out"

scene read; out=$(run)
ok "no Lead read on the head: the ACT asks for the read and never mentions a browser merge (Lead 4, 23 Nov)" "$(grep -qxF "$ACT10" <<< "$out" && ! grep -qi 'browser' <<< "$out" && echo 1)" "$out"
put "repos/$R/issues/10/comments?per_page=100&page=1" "[$(LR OWNER "Lead read the diff: $H")]"; out=$(run)
ok "\"Lead read the diff: <full head>\" from the owner: the merge is offered, word for word" "$(grep -qxF "$MERGE10" <<< "$out" && echo 1)" "$out"
put "repos/$R/issues/10/comments?per_page=100&page=1" "[$(LR MEMBER "Lead read: OK $H.")]"; out=$(run)
ok "\"Lead read: OK <full head>.\" from a member counts the same (lead-read-gate.sh's forms)" "$(grep -qxF "$MERGE10" <<< "$out" && echo 1)" "$out"
for c in "$(LR OWNER "Lead read the diff: $OLD")" "$(LR OWNER "Lead read the diff: ${H:0:12}")" "$(LR NONE "Lead read the diff: $H")" "$(LR OWNER "Lead read the diff: $H" 2026-11-20T07:30:00Z)" "$(LR OWNER "I will do the Lead read the diff: $H later")"; do
  put "repos/$R/issues/10/comments?per_page=100&page=1" "[$c]"; out=$(run)
  ok "not a Lead read (older head, short SHA, no write access, edited, or not alone on its line): no merge offered: ${c:0:110}" "$(grep -qxF "$ACT10" <<< "$out" && ! grep -qi 'browser' <<< "$out" && echo 1)" "$out"; done
# Breaker and reviewer, 23 Nov: the read is judged exactly as lead-read-gate.sh on main judges it.
NB=$(printf '\302\240')
for b in 'Next:\n```\nLead read the diff: '$H'\n```' 'Next:\n~~~\nLead read the diff: '$H'\n~~~' '<!--\nLead read the diff: '$H'\n-->' 'Post this:\n\n    Lead read the diff: '$H 'Post this:\n\n\tLead read the diff: '$H "${NB}Lead read the diff: $H" 'Lead read the diff:\n'$H; do
  put "repos/$R/issues/10/comments?per_page=100&page=1" "[$(LR OWNER "$b")]"; out=$(run)
  ok "the gate does not count it, so no merge is offered: ${b:0:60}" "$(grep -qxF "$ACT10" <<< "$out" && ! grep -qi 'browser' <<< "$out" && echo 1)" "$out"; done
for b in "**Lead read the diff:** $H" "Lead read the diff $H" "Lead read:OK $H"; do
  put "repos/$R/issues/10/comments?per_page=100&page=1" "[$(LR OWNER "$b")]"; out=$(run)
  ok "the gate counts it, so the merge is offered: $b" "$(grep -qxF "$MERGE10" <<< "$out" && echo 1)" "$out"; done
put "repos/$R/pulls?state=open&per_page=100" '[{"number":10,"title":"Hold the clock test until 06:00 IST","draft":false,"user":{"login":"lead1"},"head":{"sha":"'$H'","ref":"fix/test-hold"},"labels":[{"name":"review: approved"}]}]'
lr() { : > "$D/log"; D="$D" QB_GH="bash $T/gh" REVIEWERS= QB_LEAD_LOGINS="$1" python3 -I "$Q" --repo $R --now $NOW 2>&1; }
put "repos/$R/issues/10/comments?per_page=100&page=1" "[$(LR OWNER "Lead read the diff: $H")]"
out=$(lr "Lead1, lead2"); ok "LEAD_LOGINS set: a read by a writer outside it offers no merge" "$(grep -qxF "$ACT10" <<< "$out" && echo 1)" "$out"
out=$(lr "o"); ok "LEAD_LOGINS set: a read by a login in it offers the merge" "$(grep -qxF "$MERGE10" <<< "$out" && echo 1)" "$out"
put "repos/$R/issues/10/comments?per_page=100&page=1" '[{"author_association":"OWNER","user":{"login":"lead1"},"created_at":"2026-11-20T07:20:00Z","updated_at":"2026-11-20T07:20:00Z","body":"Lead read the diff: '$H'"}]'
out=$(lr "o lead1"); ok "LEAD_LOGINS set: the PR's own author never frees it, even when listed" "$(grep -qxF "$ACT10" <<< "$out" && echo 1)" "$out"
put "repos/$R/pulls?state=open&per_page=100" '[{"number":10,"title":"Hold the clock test until 06:00 IST","draft":false,"head":{"sha":"'$H'","ref":"fix/test-hold"},"labels":[{"name":"review: approved"}]}]'
put "repos/$R/issues/10/comments?per_page=100&page=1" "[$(LR OWNER "Lead read the diff: $H")]"
printf '%s\n' 'echo "$*" >> "$D/log"; case "$*" in *LEAD_LOGINS*) echo "HTTP 403: Resource not accessible" >&2; exit 1;; esac; f="$D/$(printf %s "$*" | tr -c A-Za-z0-9 _)"; [ -f "$f" ] && cat "$f" || { echo "HTTP 404: no fake answer for $*" >&2; exit 1; }' > "$T/gh403"
: > "$D/log"; out=$(D="$D" QB_GH="bash $T/gh403" REVIEWERS= python3 -I "$Q" --repo $R --now $NOW 2>&1)
ok "LEAD_LOGINS unreadable (not a 404): a warn line and no merge offered, even with a read (fails safe)" "$(grep -q '^warn  queue blocked by checks: LEAD_LOGINS unreadable' <<< "$out" && grep -qxF "$ACT10" <<< "$out" && echo 1)" "$out"
# Breaker round 2 (23 Nov): LEAD_LOGINS may be an organization variable (lead-read.yml reads vars.LEAD_LOGINS); a NUL in
# a counted comment makes the gate's grep see binary (HOLD); an empty updated_at is not "never edited" (jq //); logins
# fold ASCII only; an empty LEAD_LOGINS in the shell does not override the variables.
put "repos/$R/pulls?state=open&per_page=100" '[{"number":10,"title":"Hold the clock test until 06:00 IST","draft":false,"head":{"sha":"'$H'","ref":"fix/test-hold"},"labels":[{"name":"review: approved"}]}]'
put "repos/$R/issues/10/comments?per_page=100&page=1" "[$(LR OWNER "Lead read the diff: $H")]"
printf '%s\n' 'lead-only' > "$D/$(printf '%s' "api orgs/o/actions/variables/LEAD_LOGINS -q .value" | tr -c 'A-Za-z0-9' _)"
out=$(run); ok "LEAD_LOGINS set only for the organization (repository variable 404): read from the organization, so a read by another writer offers no merge" "$(grep -qxF "$ACT10" <<< "$out" && grep -q 'orgs/o/actions/variables/LEAD_LOGINS' "$D/log" && echo 1)" "$out"
: > "$D/log"; out=$(D="$D" QB_GH="bash $T/gh" REVIEWERS= LEAD_LOGINS="o" python3 -I "$Q" --repo $R --now $NOW 2>&1)
ok "a LEAD_LOGINS in the shell never overrides the variables (the gate reads only vars.LEAD_LOGINS; breaker round 3)" "$(grep -qxF "$ACT10" <<< "$out" && echo 1)" "$out"
rm -f "$D/$(printf '%s' "api orgs/o/actions/variables/LEAD_LOGINS -q .value" | tr -c 'A-Za-z0-9' _)"
put "repos/$R/issues/10/comments?per_page=100&page=1" "[$(LR OWNER "Lead read the diff: $H"),$(LR OWNER 'note\u0000')]"; out=$(run)
ok "a NUL in another counted comment (the gate's grep reads binary, HOLD): no merge offered" "$(grep -qxF "$ACT10" <<< "$out" && echo 1)" "$out"
put "repos/$R/issues/10/comments?per_page=100&page=1" '[{"author_association":"OWNER","user":{"login":"o"},"created_at":"2026-11-20T07:20:00Z","updated_at":"","body":"Lead read the diff: '$H'"}]'; out=$(run)
ok "an empty updated_at is not 'never edited' (as jq's // reads it): no merge offered" "$(grep -qxF "$ACT10" <<< "$out" && echo 1)" "$out"
put "repos/$R/issues/10/comments?per_page=100&page=1" '[{"author_association":"OWNER","user":{"login":"Ka"},"created_at":"2026-11-20T07:20:00Z","updated_at":"2026-11-20T07:20:00Z","body":"Lead read the diff: '$H'"}]'
: > "$D/log"; out=$(D="$D" QB_GH="bash $T/gh" REVIEWERS= QB_LEAD_LOGINS="$(printf '\342\204\252a')" python3 -I "$Q" --repo $R --now $NOW 2>&1)
ok "logins fold ASCII only (a Kelvin sign is not K, as jq's ascii_downcase): no merge offered" "$(grep -qxF "$ACT10" <<< "$out" && echo 1)" "$out"
# Breaker round 3 (23 Nov): grep -i under C.UTF-8 folds ASCII only; jq's \s does not split on \x1c-\x1f; only gh's real
# 404 forms mean "unset" (also gh-fallback.py's curl form, whose 404 sits past 120 characters).
put "repos/$R/pulls?state=open&per_page=100" '[{"number":10,"title":"Hold the clock test until 06:00 IST","draft":false,"head":{"sha":"'$H'","ref":"fix/test-hold"},"labels":[{"name":"review: approved"}]}]'
for b in "Lead read: O$(printf '\342\204\252') $H" "Lead read the d$(printf '\304\260')ff: $H"; do
  put "repos/$R/issues/10/comments?per_page=100&page=1" "[$(LR OWNER "$b")]"; out=$(run)
  ok "a Unicode look-alike letter the gate's grep -i does not fold: no merge offered: $b" "$(grep -qxF "$ACT10" <<< "$out" && echo 1)" "$out"; done
put "repos/$R/issues/10/comments?per_page=100&page=1" "[$(LR OWNER "Lead read the diff: $H")]"
out=$(lr "$(printf 'lead\037o')"); ok "LEAD_LOGINS split as jq splits it (\\x1f is not a separator): no merge offered" "$(grep -qxF "$ACT10" <<< "$out" && echo 1)" "$out"
printf '%s\n' 'echo "$*" >> "$D/log"; case "$*" in *repos/o/r/actions/variables/LEAD_LOGINS*) printf "gh: something (HTTP 502)\nerror: upstream said repository not found in cache\n" >&2; exit 1;; esac; f="$D/$(printf %s "$*" | tr -c A-Za-z0-9 _)"; [ -f "$f" ] && cat "$f" || { echo "HTTP 404: no fake answer for $*" >&2; exit 1; }' > "$T/gh502"
: > "$D/log"; out=$(D="$D" QB_GH="bash $T/gh502" REVIEWERS= python3 -I "$Q" --repo $R --now $NOW 2>&1)
ok "an error that merely mentions 'not found' is not a 404: no merge offered" "$(grep -qxF "$ACT10" <<< "$out" && grep -q 'LEAD_LOGINS unreadable' <<< "$out" && echo 1)" "$out"
printf '%s\n' 'echo "$*" >> "$D/log"; case "$*" in *repos/o/r/actions/variables/LEAD_LOGINS*) echo "gh fallback: GET https://api.github.com/repos/o/r/actions/variables/LEAD_LOGINS failed: curl: (22) The requested URL returned error: 404" >&2; exit 1;; esac; f="$D/$(printf %s "$*" | tr -c A-Za-z0-9 _)"; [ -f "$f" ] && cat "$f" || { echo "HTTP 404: no fake answer for $*" >&2; exit 1; }' > "$T/ghfb"
: > "$D/log"; out=$(D="$D" QB_GH="bash $T/ghfb" REVIEWERS= python3 -I "$Q" --repo $R --now $NOW 2>&1)
ok "gh-fallback.py's 404 (past 120 characters) counts as a 404: the organization is asked, then unset, the merge offered" "$(grep -qxF "$MERGE10" <<< "$out" && grep -q 'orgs/o/actions/variables/LEAD_LOGINS' "$D/log" && echo 1)" "$out"
ok "no line in queue-blocked.py offers a browser merge outside the read branch" "$(python3 -I - "$Q" <<'PY' && echo 1
import sys,re
src=open(sys.argv[1]).read().splitlines()
hits=[i for i,l in enumerate(src) if "browser now" in l and l.lstrip().startswith(("print","\"ACT","'ACT"))]
ok=all(any("if read" in src[j] for j in range(max(0,i-3),i)) for i in hits) and hits
sys.exit(0 if ok else 1)
PY
)" "a merge line not guarded by the read"

# lead-watch.sh runs it each check, prints it and counts its ACT lines; nothing here merges or labels
L="$TOOLS/lead-watch.sh"
ok "lead-watch.sh runs queue-blocked.py and counts its ACT lines" "$(grep -qF 'qb=$(python3 -I "$TOOLS/queue-blocked.py" 2>&1); echo "$qb"; seen "$qb"; act=$((act + $(grep -c '"'^ACT'"' <<<"$qb")))' "$L" && echo 1)" "no wiring in $L"
ok "queue-blocked.py only reads (no merge, label, POST or PUT)" "$(! grep -qiE '"(merge|edit|-X|POST|PUT|PATCH|--method)"|/merge[" ]' "$Q" && echo 1)" "a write call found"
finish
