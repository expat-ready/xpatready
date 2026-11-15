#!/usr/bin/env bash
# Queue gate (B194, founder 16 Nov: "concretely fix this problem"; P-502, P-610). Two jobs before a PR joins the queue,
# run by .github/workflows/queue-gate.yml (main's copy; the PR's code is never checked out or run):
#   label  — puts `review: approved` on once (a) a PR comment line "Reviewer: Approve <the head's full 40-hex SHA>" is
#            by the repository owner's account or a login in REVIEWERS (space-separated; the repository variable, so no
#            name sits in a file), with write access; (b) the check "ci" on that head is green; (c) no changed path
#            matches lead-read-paths.txt (.github/, .mergify.yml, migrations, money: those keep the Lead's read, P-423).
#            No more waiting for a sleeping lane to wake and label. A refusal is commented only when the Approve comment
#            itself started the run. label-sweep.sh keeps a github-actions[bot] label only when `eligible` passes.
#   fresh  — the commit status "queue-fresh" that Mergify's product queue needs for a PR touching prototype/
#            (.mergify.yml). Measured in design/merge-queue-causes-2026-11-16.md: when main merged a PR touching one of
#            the same app files, or both add migrations, after this PR's green ci started, the PR failed in the queue 35%
#            of the time (60% for two migrations), against 17% otherwise; plain age does not predict it. Such a PR gets
#            "failure" and, when labelled, its ci run is re-run (a re-run tests today's main, D6; never a cancel,
#            P-371); the re-run's green sets "success". A queued PR is left success: its batch is built on today's main.
#            After 3 attempts it is success (the batch checks it).
#   eligible — exit 0 when `label` would label this PR now (the label aside); used by label-sweep.sh.
#   event  — reads GITHUB_EVENT_NAME / GITHUB_EVENT_PATH and runs the above for the PR(s) concerned.
# Env: GH_TOKEN, REPO (owner/name), PR (label, fresh, eligible); REVIEWERS; API (default https://api.github.com);
# MAIN_REF (default origin/main; a git copy holding main's history). Exit 0 judged; 1 refused (eligible); 2 error.
# Test: check-queue-gate.sh.
set -uo pipefail
API="${API:-https://api.github.com}"; MAIN_REF="${MAIN_REF:-origin/main}"; LABEL="review: approved"; CTX="queue-fresh"
HERE=$(cd "$(dirname "$0")" && pwd)
for v in GH_TOKEN REPO; do [ -n "${!v:-}" ] || { echo "queue-gate: $v is not set"; exit 2; }; done
H=$(mktemp); trap 'rm -f "$H"' EXIT; chmod 600 "$H"   # the token in a file, not on curl's command line (seen by ps)
printf 'Authorization: Bearer %s\nAccept: application/vnd.github+json\n' "$GH_TOKEN" > "$H"
api() { curl -sS --fail-with-body -H @"$H" "$@"; }
pages() { local p=1 all='[]' one sep='?'; case "$1" in *\?*) sep='&';; esac
  while [ "$p" -le 30 ]; do one=$(api "$API/$1${sep}per_page=100&page=$p") || return 1
    all=$(jq -s '.[0] + .[1]' <(echo "$all") <(echo "$one")); [ "$(echo "$one" | jq length)" -lt 100 ] && break; p=$((p + 1))
  done; echo "$all"; }
OWNER="${REPO%%/*}"
CODE='/prototype/'; DOCS='\.(md|txt|png|jpe?g|gif|webp|svg|pdf)$'; MIG='/prisma/migrations/'

load() {  # PR → pr, head, files, labels
  pr=$(api "$API/repos/$REPO/pulls/$PR") || { echo "#$PR: cannot read the PR"; return 2; }
  head=$(echo "$pr" | jq -r .head.sha); labels=$(echo "$pr" | jq -r '[.labels[].name] | join("\n")')
  files=$(pages "repos/$REPO/pulls/$PR/files" | jq -r '.[].filename') || { echo "#$PR: cannot read its files"; return 2; }; }
has() { grep -qxF "$1" <<< "$labels"; }
ci() {  # the check "ci" on $head → ci_state (success|pending|failure), run_id, run_started, run_attempt, run_status
  local c; c=$(api "$API/repos/$REPO/commits/$head/check-runs?check_name=ci&per_page=100") || { ci_state=failure; return; }
  c=$(echo "$c" | jq -c '[.check_runs[] | select(.app.slug == "github-actions")] | sort_by(.started_at) | last // empty')
  [ -n "$c" ] || { ci_state=pending; return; }
  case "$(echo "$c" | jq -r '.status + " " + (.conclusion // "")')" in "completed success") ci_state=success;; completed*) ci_state=failure;; *) ci_state=pending;; esac
  run_id=$(echo "$c" | jq -r '.details_url // ""' | sed -n 's|.*/actions/runs/\([0-9]*\).*|\1|p')
  local r; r=$(api "$API/repos/$REPO/actions/runs/$run_id" 2>/dev/null) || r='{}'
  run_started=$(echo "$r" | jq -r '.run_started_at // empty'); run_attempt=$(echo "$r" | jq -r '.run_attempt // 1'); run_status=$(echo "$r" | jq -r '.status // ""'); }

why=""
judge() {  # eligibility for the label; reason in $why
  [ "$(echo "$pr" | jq -r .state)" = open ] || { why="the PR is not open"; return 1; }
  [ "$(echo "$pr" | jq -r .draft)" = false ] || { why="the PR is a draft"; return 1; }
  [ "$(echo "$pr" | jq -r .base.ref)" = main ] || { why="its base is not main"; return 1; }
  case "$(echo "$pr" | jq -r .head.ref)" in mergify/*) why="a merge-queue batch"; return 1;; esac
  local cs who bad; cs=$(pages "repos/$REPO/issues/$PR/comments") || { why="its comments cannot be read"; return 1; }
  who=$(printf '%s\n' "$OWNER" ${REVIEWERS:-} | jq -Rn '[inputs | select(length > 0)]')
  echo "$cs" | jq -r --argjson who "$who" '.[] | select((.user.login as $l | $who | index($l)) and (.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR")) | .body' \
    | tr -d '*_`' | grep -ioE '^[[:space:]>]*reviewer:[[:space:]]*approve[sd]?[[:space:]]+[0-9a-f]{40}\b' | grep -oE '[0-9a-f]{40}' | grep -qxF "$head" \
    || { why="no \"Reviewer: Approve $head\" line from the owner's account or a known reviewer"; return 1; }
  bad=$(grep -iEf <(grep -v '^#' "$HERE/lead-read-paths.txt" | grep .) <<< "$files" | head -3 | paste -sd ' ' -)
  [ -z "$bad" ] || { why="it touches a path that keeps the Lead's read (P-423): $bad"; return 1; }
  ci; [ "$ci_state" = success ] || { why="ci on ${head:0:9} is $ci_state"; return 1; }
  return 0; }

status() {  # state description
  api -X POST "$API/repos/$REPO/statuses/$head" -d "$(jq -n --arg s "$1" --arg d "${2:0:139}" --arg c "$CTX" '{state: $s, description: $d, context: $c}')" >/dev/null \
    && echo "#$PR ${head:0:9}: $CTX $1 ($2)" || { echo "#$PR: could not set $CTX"; return 2; }; }

fresh() {
  load || return 2
  grep -E "$CODE" <<< "$files" | grep -vqiE "$DOCS" || { status success "no app code: nothing to re-check"; return; }
  has queued && { status success "in the queue: its batch is tested on today's main"; return; }
  ci; [ "$ci_state" = success ] || { status pending "waiting for a green ci on this head"; return; }
  [ "${run_attempt:-1}" -ge 3 ] && { status success "3 ci attempts: the merge-queue batch checks the rest"; return; }
  local mine mig m mf hit=""
  mine=$(grep -E "$CODE" <<< "$files" | grep -viE "$DOCS"); mig=$(grep -cE "$MIG" <<< "$mine")
  while read -r m ts subj; do
    [ -n "$m" ] || continue; [[ "$ts" > "$run_started" ]] || continue
    mf=$(git diff --no-renames --name-only "$m^1" "$m" 2>/dev/null)
    if comm -12 <(sort -u <<< "$mine") <(sort -u <<< "$mf") | grep -q .; then hit="$subj ($(comm -12 <(sort -u <<< "$mine") <(sort -u <<< "$mf") | head -1 | sed 's|.*/||'))"; break; fi
    if [ "$mig" -gt 0 ] && grep -qE "$MIG" <<< "$mf"; then hit="$subj (a migration)"; break; fi
  done < <(TZ=UTC git log --first-parent --date=format-local:%Y-%m-%dT%H:%M:%SZ --format='%H %cd %s' --since="$run_started" "$MAIN_REF" 2>/dev/null | awk '{print $1, $2, $6}')
  [ -n "$hit" ] || { status success "no merge since this ci started touches its files"; return; }
  status failure "main merged $hit after this ci started: re-check on today's main" || return 2
  if has "$LABEL" && [ "$run_status" = completed ] && [ -n "$run_id" ]; then
    api -X POST "$API/repos/$REPO/actions/runs/$run_id/rerun" >/dev/null && echo "#$PR: ci run $run_id re-run (attempt $((run_attempt + 1)))" || echo "#$PR: the re-run was refused"
  fi; }

label() {
  load || return 2
  has "$LABEL" && { echo "#$PR: already labelled"; return 0; }
  if ! judge; then
    echo "#$PR: not labelled: $why"
    [ "${TRIGGER:-}" = approve ] && api -X POST "$API/repos/$REPO/issues/$PR/comments" -d "$(jq -n --arg b "**Queue gate (B194):** \`$LABEL\` not put on by itself: $why. A person labels it after the Lead's read where P-423 asks for one.

---
_Generated by [Claude Code](https://claude.ai/code)_" '{body: $b}')" >/dev/null
    return 0; fi
  api -X POST "$API/repos/$REPO/issues/$PR/labels" -d "$(jq -n --arg l "$LABEL" '{labels: [$l]}')" >/dev/null || { echo "#$PR: could not label"; return 2; }
  labels="$labels"$'\n'"$LABEL"; echo "#$PR: labelled ($head has the reviewer's Approve and a green ci; no Lead-read path)"
  api -X POST "$API/repos/$REPO/issues/$PR/comments" -d "$(jq -n --arg b "**Queue gate (B194):** \`$LABEL\` put on: \"Reviewer: Approve ${head:0:9}\" names the head, ci is green on it, and no path keeps the Lead's read (P-423)." '{body: $b}')" >/dev/null || true; }

event() {
  local e="${GITHUB_EVENT_PATH:-/dev/null}" n
  case "${GITHUB_EVENT_NAME:-}" in
    issue_comment) jq -e '.issue.pull_request != null and (.comment.body | test("reviewer:\\s*approve"; "i"))' "$e" >/dev/null || { echo "not an Approve comment on a PR"; return 0; }
      PR=$(jq -r .issue.number "$e") TRIGGER=approve label; PR=$(jq -r .issue.number "$e") fresh;;
    workflow_run) for n in $(jq -r '.workflow_run.pull_requests[].number' "$e"); do PR=$n label; PR=$n fresh; done;;
    pull_request_target) PR=$(jq -r .pull_request.number "$e") fresh;;
    push|schedule) for n in $(pages "repos/$REPO/issues?state=open&labels=review%3A%20approved" | jq -r '.[] | select(.pull_request) | .number'); do PR=$n fresh; done;;
    *) echo "queue-gate: event ${GITHUB_EVENT_NAME:-none} is not handled"; return 2;;
  esac; }

case "${1:-}" in
  label|fresh) "$1";;
  eligible) load || exit 2; judge && { echo "#$PR: eligible"; exit 0; }; echo "#$PR: not eligible: $why"; exit 1;;
  event) event;;
  *) echo "usage: queue-gate.sh label|fresh|eligible|event"; exit 2;;
esac
