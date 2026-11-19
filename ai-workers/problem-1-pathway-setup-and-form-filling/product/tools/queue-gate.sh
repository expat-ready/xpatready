#!/usr/bin/env bash
# Queue gate (B194, founder 16 Nov: "concretely fix this problem"; P-502, P-610). Two jobs before a PR joins the queue,
# run by .github/workflows/queue-gate.yml (main's copy; the PR's code is never checked out or run):
#   label  — puts `review: approved` on once (a) a PR comment line "Reviewer: Approve <the head's full 40-hex SHA>" is
#            by the repository owner's account or a login in REVIEWERS (space-separated; the repository variable, so no
#            name sits in a file), author association OWNER, MEMBER or COLLABORATOR, and it is the last "Reviewer:"
#            line naming that head (a later "Changes needed" on it wins); (b) the check "ci" on that head is green; (c) no changed path
#            matches lead-read-paths.txt (.github/, .mergify.yml, migrations, money: those keep the Lead's read, P-423).
#            No more waiting for a sleeping lane to wake and label. A refusal is commented only when the Approve comment
#            itself started the run. label-sweep.sh keeps a github-actions[bot] label only when `eligible` passes.
#   fresh  — the commit status "queue-fresh" that Mergify's product queue needs for a PR touching prototype/
#            (.mergify.yml). Measured in design/merge-queue-causes-2026-11-16.md: when main merged a PR touching one of
#            the same app files, or both add migrations, after this PR's green ci started, the PR failed in the queue 35%
#            of the time (60% for two migrations), against 17% otherwise; plain age does not predict it. Such a PR gets
#            "failure" and, when labelled, its ci run is re-run (a re-run tests today's main, D6; never a cancel,
#            P-371); the re-run's green sets "success". A queued PR is left success: its batch is built on today's main.
#            After 3 attempts it is success (the batch checks it). An unlabelled PR is "pending": the verdict is made
#            when the label goes on (label() decides it before labelling; a person's label starts a run), so a label
#            never meets an old success (review M2). Every 30 minutes the labelled PRs are judged again (a refused re-run), or by hand (workflow_dispatch).
#   full run — CI-PRE (P-731, founder 19 Nov, "enforced, not text"): the label also needs one green full run on the head:
#            a run of main's ci.yml by workflow_dispatch (comment-run.yml's "/run full"), named "full-run PR #<n> <head>"
#            by its own inputs, on a commit of main's history (so its jobs were main's, not the PR's), ended success. A red
#            or missing one refuses the label and names the failing parts (the run's failed jobs). A records-only PR
#            (records-only.sh, main's one definition) is exempt. With FULL_FROM set (the repository variable
#            FULL_RUN_FROM, a UTC time like 2026-11-20T06:00:00Z), a head whose Approve line is older keeps the earlier
#            rule, so the PRs approved before CI-PRE landed are not sent back; unset, every head needs the run.
#            After a failed merge batch (a mergify[bot] batch PR naming this PR whose ci ended failure; the newest one),
#            the label goes on again only when a PR comment line by someone with write access,
#            "Batch failures covered: <that run's id>: <part>, <part>", names every failed job of that run.
#   proof  — for label-guard.sh: exit 0 when the full-run rule holds for one of HEADS (the head, back to its approved
#            commit) and, with RELABEL=1 (the label was just put on), the batch rule too; exit 1 and the reason if not.
#   eligible — exit 0 when `label` would label this PR now (the label aside); used by label-sweep.sh.
#   event  — reads GITHUB_EVENT_NAME / GITHUB_EVENT_PATH and runs the above for the PR(s) concerned.
# Env: GH_TOKEN, REPO (owner/name), PR (label, fresh, eligible, proof); REVIEWERS; FULL_FROM; HEADS, RELABEL (proof); API (default https://api.github.com);
# MAIN_REF (default origin/main; a git copy holding main's history). Exit 0 judged; 1 refused (eligible); 2 error.
# Test: check-queue-gate.sh.
set -uo pipefail
API="${API:-https://api.github.com}"; MAIN_REF="${MAIN_REF:-origin/main}"; LABEL="review: approved"; CTX="queue-fresh"
HERE=$(cd "$(dirname "$0")" && pwd)
for v in GH_TOKEN REPO; do [ -n "${!v:-}" ] || { echo "queue-gate: $v is not set"; exit 2; }; done
H=$(mktemp); trap 'rm -f "$H" "$H.v"' EXIT; chmod 600 "$H"   # the token in a file, not on curl's command line (seen by ps)
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
  # A renamed file counts under both names (Devin on #1861): a later main change to the old path still overlaps.
  files=$(pages "repos/$REPO/pulls/$PR/files" | jq -r '.[] | .filename, (.previous_filename // empty)') || { echo "#$PR: cannot read its files"; return 2; }; }
has() { grep -qxF "$1" <<< "$labels"; }
ci() {  # the check "ci" on $head → ci_state (success|pending|failure), run_id, run_started, run_attempt, run_status
  local c; c=$(api "$API/repos/$REPO/commits/$head/check-runs?check_name=ci&per_page=100") || { ci_state=failure; return; }
  c=$(echo "$c" | jq -c '[.check_runs[] | select(.app.slug == "github-actions")] | sort_by(.started_at) | last // empty')
  [ -n "$c" ] || { ci_state=pending; return; }
  case "$(echo "$c" | jq -r '.status + " " + (.conclusion // "")')" in "completed success") ci_state=success;; completed*) ci_state=failure;; *) ci_state=pending;; esac
  run_id=$(echo "$c" | jq -r '.details_url // ""' | sed -n 's|.*/actions/runs/\([0-9]*\).*|\1|p')
  local r; r=$(api "$API/repos/$REPO/actions/runs/$run_id" 2>/dev/null) || r='{}'
  run_started=$(echo "$r" | jq -r '.run_started_at // empty'); run_attempt=$(echo "$r" | jq -r '.run_attempt // 1'); run_status=$(echo "$r" | jq -r '.status // ""'); }

# --- CI-PRE (P-731): the full run and the failed batch
FULL_WF=".github/workflows/ci.yml"; TEAM='.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR"'
san() { LC_ALL=C tr -cd 'A-Za-z0-9 ().,_#:/\n-'; }   # a job's name may hold a matrix value worked out from a PR's files: plain marks only
records() { [ "$(printf '%s\n' "$files" | (cd "$HERE" && bash "${RECORDS_ONLY:-$HERE/records-only.sh}" is-records --files) 2>/dev/null)" = yes ]; }
failing() {  # a run's id → its failed jobs' names, one a line (the summary job "ci" aside); nothing when unreadable
  api "$API/repos/$REPO/actions/runs/$1/jobs?filter=latest&per_page=100" 2>/dev/null \
    | jq -r '.jobs[]? | select(.conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "cancelled") | .name | select(. != "ci" and . != "retry-comment")' 2>/dev/null | san | cut -c1-120 | grep .; true; }
comments() { [ -n "${cs:-}" ] || cs=$(pages "repos/$REPO/issues/$PR/comments"); }
full() {  # $@ commits → full_state (success|failure|pending|none), full_why
  local p=1 one all='[]' c t id st co url sha first=""; full_state=none; full_why="no full run on ${1:0:9} yet: comment \`/run full\` on the PR (every suite a merge batch runs; P-731)"
  while [ "$p" -le 3 ]; do   # the 300 newest runs started by hand or by "/run full"
    one=$(api "$API/repos/$REPO/actions/workflows/ci.yml/runs?event=workflow_dispatch&per_page=100&page=$p") || { full_why="the full runs cannot be read"; return; }
    all=$(jq -c --argjson a "$all" --arg r "$REPO" --arg wf "$FULL_WF" '$a + [.workflow_runs[]? | select(.event == "workflow_dispatch" and ((.path // "") | split("@")[0]) == $wf
      and .head_branch == "main" and .head_repository.full_name == $r) | {id, status, conclusion, html_url, head_sha, title: (.display_title // "")}]' <<< "$one") || { full_why="the full runs cannot be read"; return; }
    [ "$(jq '.workflow_runs | length' <<< "$one")" -lt 100 ] && break; p=$((p + 1))
  done
  for c in "$@"; do t="full-run PR #$PR $c"
    while IFS=$'\t' read -r id st co url sha; do
      [[ "$id" =~ ^[0-9]+$ && "$sha" =~ ^[0-9a-f]{40}$ ]] || continue
      git merge-base --is-ancestor "$sha" "$MAIN_REF" 2>/dev/null || continue   # the run's workflow file was main's
      if [ "$st $co" = "completed success" ]; then full_state=success; full_why="full run $id green on ${c:0:9}"; return; fi
      [ -n "$first" ] || first="$id"$'\t'"$st"$'\t'"$url"$'\t'"$c"
    done < <(jq -r --arg t "$t" '.[] | select(.title == $t) | [.id, .status, (.conclusion // "none"), .html_url, .head_sha] | @tsv' <<< "$all")
  done
  [ -n "$first" ] || return 0
  IFS=$'\t' read -r id st url c <<< "$first"
  if [ "$st" != completed ]; then full_state=pending; full_why="the full run on ${c:0:9} has not ended ($url)"; return; fi
  full_state=failure; full_why="the full run on ${c:0:9} failed: $(failing "$id" | paste -sd ';' - | sed 's/;/; /g; s/^$/its failed parts cannot be read/') ($url). Fix and push, then \`/run full\` on the new head; \`/run full\` on this head re-runs only the failed parts"; }
fullproof() {  # $@ the commits a full run may be on → 0, or 1 with $why
  records && return 0
  if [[ "${FULL_FROM:-}" =~ ^20[0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z$ ]]; then   # approved before CI-PRE landed
    local at; comments || { why="its comments cannot be read"; return 1; }
    at=$(jq -r --arg re "$(printf '%s\n' "$@" | paste -sd '|' -)" '[.[] | select(.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR")
      | select((.body // "") | gsub("[*_`]"; "") | test("(^|\n)\\s*reviewer:\\s*approve[sd]?\\s+(" + $re + ")\\b"; "i")) | .created_at] | max // empty' <<< "$cs")
    [ -n "$at" ] && [[ "$at" < "$FULL_FROM" ]] && return 0
  fi
  full "$@"; [ "$full_state" = success ] && return 0; why=$full_why; return 1; }
covered() {  # 0 when no failed merge batch held this PR, or a comment line covers the newest one's failed parts; else 1 with $why
  local prs sha c rid="" names lines n miss=""
  prs=$(api "$API/repos/$REPO/pulls?state=all&sort=created&direction=desc&per_page=100") || { why="the merge batches cannot be read"; return 1; }
  # Mergify's batch PRs naming this PR, newest first: "#n" in the title (merge-queue-causes.py members()), else the
  # body's "pull_requests:" numbers (flaky.mjs targets()). The newest that ended decides: failed, or passed (merged).
  for sha in $(jq -r --arg r "$REPO" --argjson n "$PR" '[.[] | select(.user.login == "mergify[bot]" and ((.head.ref // "") | startswith("mergify/merge-queue/")) and .head.repo.full_name == $r)
      | select(([(.title // "") | scan("#([0-9]+)") | .[0] | tonumber]) as $t | (if ($t | length) > 0 then $t else [(.body // "") | scan("(?m)^\\s*-\\s*number:\\s*([0-9]+)\\s*$") | .[0] | tonumber] end) | index($n))
      | .head.sha | select(test("^[0-9a-f]{40}$"))][0:10][]' <<< "$prs"); do
    c=$(api "$API/repos/$REPO/commits/$sha/check-runs?check_name=ci&per_page=100") || { why="a merge batch's ci cannot be read"; return 1; }
    c=$(jq -r '[.check_runs[] | select(.app.slug == "github-actions")] | sort_by(.started_at) | last // empty | [.status, (.conclusion // ""), (.details_url // "")] | @tsv' <<< "$c")
    case "$c" in completed$'\t'success*) return 0;; completed$'\t'failure*|completed$'\t'timed_out*) rid=$(sed -n 's|.*/actions/runs/\([0-9]*\).*|\1|p' <<< "$c"); break;; esac
  done
  [ -n "$rid" ] || return 0
  comments || { why="its comments cannot be read"; return 1; }
  names=$(failing "$rid")
  lines=$(jq -r ".[] | select($TEAM) | .body // \"\"" <<< "$cs" | tr -d '\r' | san | grep -E "^ *Batch failures covered: *$rid *:"; true)
  [ -n "$lines" ] || { why="it was in the failed merge batch run $rid (failed: $(paste -sd ';' - <<< "${names:-not readable}" | sed 's/;/; /g')) and no PR comment line \"Batch failures covered: $rid: <every failed part>\" by someone with write access names them (P-731 (4))"; return 1; }
  while IFS= read -r n; do [ -z "$n" ] || grep -qF -- "$n" <<< "$lines" || miss="$miss${miss:+; }$n"; done <<< "$names"
  [ -z "$miss" ] || { why="the line \"Batch failures covered: $rid:\" does not name every failed part of that merge batch run: missing $miss (P-731 (4))"; return 1; }
  return 0; }

why=""
judge() {  # eligibility for the label; reason in $why
  [ "$(echo "$pr" | jq -r .state)" = open ] || { why="the PR is not open"; return 1; }
  [ "$(echo "$pr" | jq -r .draft)" = false ] || { why="the PR is a draft"; return 1; }
  [ "$(echo "$pr" | jq -r .base.ref)" = main ] || { why="its base is not main"; return 1; }
  case "$(echo "$pr" | jq -r .head.ref)" in mergify/*) why="a merge-queue batch"; return 1;; esac
  local who bad; cs=""; comments || { why="its comments cannot be read"; return 1; }
  who=$(printf '%s\n' "$OWNER" ${REVIEWERS:-} | jq -Rn '[inputs | select(length > 0)]')
  echo "$cs" | jq -r --argjson who "$who" '.[] | select((.user.login as $l | $who | index($l)) and (.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR")) | .body' \
    | tr -d '*_`' | grep -iE '^[[:space:]]*reviewer:' > "$H.v"; true
  # The last verdict that can be about this head decides: a line naming the head (or a prefix of it), or naming no SHA
  # at all ("Reviewer: Changes requested: fix M1", round 2 m2). A SHA has a digit and a letter: a run id, a date or a
  # word like "defaced" is not one, so such a line still counts (round 3 m1, fails closed). It must be an Approve
  # naming the full head. (tr, not ${x,,}: the Mac's bash 3.2.)
  local l x last="" keep; while IFS= read -r l; do keep=1
    for x in $(grep -oiE '\b[0-9a-f]{7,40}\b' <<< "$l" | tr A-F a-f | grep '[0-9]' | grep '[a-f]'; true); do keep=0; case "$head" in "$x"*) keep=1; break;; esac; done
    [ "$keep" = 1 ] && last=$l; done < "$H.v"; rm -f "$H.v"
  grep -qiE "^[[:space:]]*reviewer:[[:space:]]*approve[sd]?[[:space:]]+$head\b" <<< "$last" \
    || { why="the last \"Reviewer:\" verdict about $head from the owner's account or a known reviewer is not an Approve naming it"; return 1; }
  bad=$(grep -iEf <(grep -v '^#' "$HERE/lead-read-paths.txt" | grep .) <<< "$files" | head -3 | sed 's/.*/`&`/' | paste -sd ' ' -)
  [ -z "$bad" ] || { why="it touches a path that keeps the Lead's read (P-423): $bad"; return 1; }
  ci; [ "$ci_state" = success ] || { why="ci on ${head:0:9} is $ci_state"; return 1; }
  fullproof "$head" || return 1   # CI-PRE (P-731): one green full run on this exact head
  return 0; }

status() {  # state description
  api -X POST "$API/repos/$REPO/statuses/$head" -d "$(jq -n --arg s "$1" --arg d "${2:0:139}" --arg c "$CTX" '{state: $s, description: $d, context: $c}')" >/dev/null \
    && echo "#$PR ${head:0:9}: $CTX $1 ($2)" || { echo "#$PR: could not set $CTX"; return 2; }; }

fresh() {
  load || return 2
  local mine mig m mf hit=""
  mine=$(grep -E "$CODE" <<< "$files" | grep -viE "$DOCS"; true)   # no grep -q in a pipe: pipefail + SIGPIPE (review m1)
  [ -n "$mine" ] || { status success "no app code: nothing to re-check"; return; }
  has queued && { status success "in the queue: its batch is tested on today's main"; return; }
  # Review M2: an unlabelled PR never holds a success, so a label always waits for a verdict made at labelling time.
  has "$LABEL" || [ "${LABELLING:-}" = 1 ] || { status pending "decided when review: approved goes on"; return; }
  ci; [ "$ci_state" = success ] || { status pending "waiting for a green ci on this head"; return; }
  [ -n "${run_started:-}" ] || { status pending "the ci run cannot be read: tried again on the next event"; return; }
  [ "${run_attempt:-1}" -ge 3 ] && { status success "3 ci attempts: the merge-queue batch checks the rest"; return; }
  mig=$(grep -cE "$MIG" <<< "$mine")
  while read -r m ts subj; do
    [ -n "$m" ] || continue; [[ "$ts" > "$run_started" ]] || continue
    mf=$(git diff --no-renames --name-only "$m^1" "$m" 2>/dev/null)
    local both; both=$(comm -12 <(sort -u <<< "$mine") <(sort -u <<< "$mf"); true)   # no grep -q in a pipe (round 2 m1)
    if [ -n "$both" ]; then hit="$subj ($(sed -n '1s|.*/||p' <<< "$both"))"; break; fi
    if [ "$mig" -gt 0 ] && grep -qE "$MIG" <<< "$mf"; then hit="$subj (a migration)"; break; fi
  done < <(TZ=UTC git log --first-parent --date=format-local:%Y-%m-%dT%H:%M:%SZ --format='%H %cd %s' --since="$run_started" "$MAIN_REF" 2>/dev/null | awk '{print $1, $2, $6}')
  [ -n "$hit" ] || { status success "no merge since this ci started touches its files"; return; }
  status failure "main merged $hit after this ci started: re-check on today's main" || return 2
  if { has "$LABEL" || [ "${LABELLING:-}" = 1 ]; } && [ "$run_status" = completed ] && [ -n "$run_id" ]; then
    api -X POST "$API/repos/$REPO/actions/runs/$run_id/rerun" >/dev/null && echo "#$PR: ci run $run_id re-run (attempt $((run_attempt + 1)))" || echo "#$PR: the re-run was refused"
  fi; }

label() {
  load || return 2
  has "$LABEL" && { echo "#$PR: already labelled"; return 0; }
  # CI-PRE: a relabel after a failed merge batch needs its failed parts named (decided here, as the label goes on).
  if ! { judge && covered; }; then
    echo "#$PR: not labelled: $why"
    # A full run that just ended says how it ended, whatever else the label waits for (CI-PRE (c)).
    if [ "${TRIGGER:-}" = full ]; then full "$head"; [ "$full_state" = success ] && why="$full_why; the label waits: $why" || why=$full_why; fi
    [[ "${TRIGGER:-}" =~ ^(approve|full)$ ]] && api -X POST "$API/repos/$REPO/issues/$PR/comments" -d "$(jq -n --arg b "**Queue gate (B194):** \`$LABEL\` not put on by itself: $why. A person labels it after the Lead's read where P-423 asks for one.

---
_Generated by [Claude Code](https://claude.ai/code)_" '{body: $b}')" >/dev/null
    return 0; fi
  LABELLING=1 fresh || return 2; did_fresh=1   # review M2: queue-fresh is decided before the label goes on
  api -X POST "$API/repos/$REPO/issues/$PR/labels" -d "$(jq -n --arg l "$LABEL" '{labels: [$l]}')" >/dev/null || { echo "#$PR: could not label"; return 2; }
  labels="$labels"$'\n'"$LABEL"; echo "#$PR: labelled ($head has the reviewer's Approve, a green ci and a green full run; no Lead-read path)"
  api -X POST "$API/repos/$REPO/issues/$PR/comments" -d "$(jq -n --arg b "**Queue gate (B194):** \`$LABEL\` put on: \"Reviewer: Approve ${head:0:9}\" names the head, ci and the full run (P-731) are green on it, and no path keeps the Lead's read (P-423)." '{body: $b}')" >/dev/null || true; }

both() {  # label, then fresh unless label already decided it; any error → 2 (review m6)
  local rc=0; did_fresh=0; label || rc=$?; [ "$did_fresh" = 1 ] || fresh || rc=$?; return $rc; }
event() {
  local e="${GITHUB_EVENT_PATH:-/dev/null}" n rc=0
  case "${GITHUB_EVENT_NAME:-}" in
    issue_comment) jq -e '.issue.pull_request != null and (.comment.body | test("reviewer:\\s*approve"; "i"))' "$e" >/dev/null || { echo "not an Approve comment on a PR"; return 0; }
      PR=$(jq -r .issue.number "$e"); TRIGGER=approve both || rc=$?;;
    workflow_run)
      if [ "$(jq -r '.workflow_run.event // ""' "$e")" = workflow_dispatch ]; then   # CI-PRE: a full run ended; its PR from its name
        n=$(jq -r '.workflow_run.display_title // ""' "$e" | sed -nE 's/^full-run PR #([1-9][0-9]{0,6}) [0-9a-f]{40}$/\1/p')
        [ -n "$n" ] || { echo "a run by hand that is not a full run"; return 0; }
        PR=$n; TRIGGER=full both || rc=$?; return $rc
      fi
      for n in $(jq -r '.workflow_run.pull_requests[].number' "$e"); do PR=$n; both || rc=$?; done;;   # a fork PR has none: no queue-fresh (fails closed)
    pull_request_target) PR=$(jq -r .pull_request.number "$e"); fresh || rc=$?;;
    push|schedule|workflow_dispatch) local ns; ns=$(pages "repos/$REPO/issues?state=open&labels=review%3A%20approved") || { echo "queue-gate: cannot list the labelled PRs"; return 2; }
      for n in $(echo "$ns" | jq -r '.[] | select(.pull_request) | .number'); do PR=$n; fresh || rc=$?; done;;
    *) echo "queue-gate: event ${GITHUB_EVENT_NAME:-none} is not handled"; return 2;;
  esac; return $rc; }

case "${1:-}" in
  label|fresh) "$1"; exit $?;;
  proof) load || exit 2; [ -n "${HEADS:-}" ] || { echo "queue-gate: HEADS is not set"; exit 2; }
    # shellcheck disable=SC2086
    fullproof $HEADS || { echo "$why"; exit 1; }
    if [ "${RELABEL:-}" = 1 ]; then covered || { echo "$why"; exit 1; }; fi; exit 0;;
  eligible) load || exit 2; judge && { echo "#$PR: eligible"; exit 0; }; echo "#$PR: not eligible: $why"; exit 1;;
  event) event; exit $?;;
  *) echo "usage: queue-gate.sh label|fresh|eligible|proof|event"; exit 2;;
esac
