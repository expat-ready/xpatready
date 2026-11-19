#!/usr/bin/env bash
# ENF-746b (P-746 (4), founder 20 Nov: "make it live and enforced"). On 20 Nov approved PRs #2315, #2268, #2302, #2323
# left the Mergify queue (label `dequeued`) only because main's pipeline was broken (a DECISIONS lock, a broken import)
# and stayed out until a Lead requeued each by hand ("@mergifyio queue" and `dequeued` off). Two modes:
#
#   watch (default; requeue-watch.yml, every 15 min, main's copy): for each open PR labelled `review: approved` and
#     `dequeued`, read Mergify's last dequeue record (its payload comment: reason, failing checks, left_at). The PR is
#     requeued (a comment "@mergifyio queue"; Mergify takes `dequeued` off itself) only when all hold:
#       * its head is the SHA of the last "Reviewer: Approve <sha>" line by the owner's account or a login in REVIEWERS;
#       * Mergify's reason is CHECKS_FAILED and the failure is main's, not the PR's. Main has no push run (P-85), so main
#         "at that time" is read in the other merge-queue batches built around left_at that do not contain this PR: at
#         least MIN_OTHERS independent batches (no member in common) failed the same job. Or the failed job's log in this PR's batch matches a pipeline
#         lock in requeue-locks.txt;
#       * never twice for the same head SHA (a hidden marker, counted only in POSTER's comments), and at most MAX_DAY
#         times per PR in 24 h: then one "Question for the tech lead" comment a day instead. A requeue Mergify does not
#         answer in 30 min (a refused bot command) is one question for the tech lead too.
#     A failure main does not share is the PR's own: no requeue, one comment (per head and dequeue) naming the job. A
#     read error leaves the PR unjudged (exit 2), never a wrong comment.
#   proof (lead-watch.sh, P-746 (3): proof first): stdin is `gh pr list --json number,title,labels,isDraft,
#     statusCheckRollup,createdAt`; prints one line listing open qa proof PRs (title starts "qa:" and says Works) not in
#     the queue, each with its reason, and an ACT line for each open over PROOF_MIN minutes. Exit = number of ACT lines.
#
# Env (watch): GH_TOKEN, REPO (owner/name), REVIEWERS (logins), POSTER (default github-actions[bot]); API (default https://api.github.com); NOW (epoch, tests). Exit 0 all judged;
# 2 something could not be read or written (the next run tries again). Test: check-requeue-watch.sh. US$0.
set -uo pipefail
TOOLS="$(cd "$(dirname "$0")" && pwd)"
API="${API:-https://api.github.com}"; LOCKS="${LOCKS:-$TOOLS/requeue-locks.txt}"; NOW="${NOW:-$(date -u +%s)}"
MAX_DAY="${MAX_DAY:-3}"; WINDOW="${WINDOW:-3600}"; MIN_OTHERS="${MIN_OTHERS:-2}"; PROOF_MIN="${PROOF_MIN:-60}"
command -v jq >/dev/null || { echo "requeue-watch: jq is missing"; exit 2; }

if [ "${1:-watch}" = proof ]; then
  out=$(jq -r --argjson now "$NOW" --argjson lim "$PROOF_MIN" '
    def names(f): [.statusCheckRollup[]? | select(f) | (.name // .context)] | unique | join(", ");
    [ .[] | select(.title | test("^qa:")) | select(.title | test("\\bWorks\\b")) | select(.headRefName // "" | startswith("mergify/") | not)
      | [.labels[].name] as $l | select($l | index("queued") | not)
      | (($now - (.createdAt | fromdateiso8601)) / 60 | floor) as $m
      | (if .isDraft then "draft"
         elif ($l | index("dequeued")) then "dequeued by Mergify"
         elif ($l | index("review: approved") | not) then "no review: approved label"
         elif names(.conclusion == "FAILURE" or .state == "FAILURE" or .state == "ERROR") != "" then "red: " + names(.conclusion == "FAILURE" or .state == "FAILURE" or .state == "ERROR")
         elif names((.status // "COMPLETED") != "COMPLETED" or .state == "PENDING") != "" then "checks running"
         else "approved and green, not queued by Mergify" end) as $why
      | {n: .number, m: $m, why: $why} ] as $w
    | "proof  qa proof PRs not in the queue (P-746 (3)): " + (if ($w | length) == 0 then "none" else ($w | map("#\(.n) \(.why), open \(.m) min") | join(" · ")) end),
      ($w[] | select(.m > $lim) | "ACT   proof #\(.n) open \(.m) min and not in the queue (\(.why)): act on it first (P-746 (3))")')
  r=$?; [ $r = 0 ] || { echo "ACT   proof line could not be read (jq exit $r)"; exit 1; }
  echo "$out"; exit "$(grep -c '^ACT' <<< "$out")"
fi

for v in GH_TOKEN REPO; do [ -n "${!v:-}" ] || { echo "requeue-watch: $v is not set"; exit 2; }; done
POSTER="${POSTER:-github-actions[bot]}"   # the account whose comments carry this tool's markers (others' copies are ignored)
WHO="${REPO%%/*} ${REVIEWERS:-}"          # who may approve: the owner's account or a known reviewer, as ci.yml and comment-run.yml
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; chmod 700 "$T"
printf 'Authorization: Bearer %s\nAccept: application/vnd.github+json\n' "$GH_TOKEN" > "$T/h"   # never on curl's command line
api() { curl -sSL --fail-with-body -H @"$T/h" "$@"; }
pages() {  # every page of a list endpoint, as one JSON array (at most 10 pages)
  local p=1 all='[]' one sep='?'; case "$1" in *\?*) sep='&';; esac
  while [ $p -le 10 ]; do
    one=$(api "$API/$1${sep}per_page=100&page=$p") || return 1
    jq -e 'type == "array"' <<< "$one" >/dev/null || return 1
    all=$(jq -s '.[0] + .[1]' <(echo "$all") <(echo "$one")); [ "$(jq length <<< "$one")" -lt 100 ] && break; p=$((p + 1))
  done; echo "$all"; }
post() { api -X POST "$API/repos/$REPO/issues/$1/comments" -d "$(jq -n --arg b "$2" '{body: $b}')" >/dev/null; }
uri() { jq -rn --arg s "$1" '$s | @uri'; }
# Mergify's payload comments, oldest first, as JSON objects (one per line).
payloads() { jq -c '.[] | select(.user.login == "mergify[bot]") | .body
  | (capture("Mergify Payload -\\*-\\s*(?<j>\\{.*\\})\\s*-\\*- Mergify Payload End"; "s") | .j | fromjson)? // empty' "$1"; }
epoch() { jq -r 'sub("\\.[0-9]+"; "") | sub("\\+00:00$"; "Z") | fromdateiso8601' <<< "\"$1\""; }
mark() { jq -e --arg p "$POSTER" --arg m "$2" 'any(.[]; .user.login == $p and (.body | contains($m)))' "$1" >/dev/null; }   # has POSTER's marker $2

deq=$(pages "repos/$REPO/issues?state=open&labels=dequeued") || { echo "requeue-watch: cannot list the dequeued PRs"; exit 2; }
want=$(jq -r '.[] | select(.pull_request != null) | select(any(.labels[]; .name == "review: approved")) | .number' <<< "$deq")
rc=0; judged=0; batches=""
for n in $want; do
  judged=$((judged + 1)); C="$T/c-$n.json"
  pages "repos/$REPO/issues/$n/comments" > "$C" || { echo "#$n: comments unreadable; the next run tries again"; rc=2; continue; }
  last=$(payloads "$C" | jq -s -c '[.[] | select(.state == "dequeued")] | last // empty')
  [ -n "$last" ] || { echo "#$n: no Mergify dequeue record found; left alone"; continue; }
  code=$(jq -r '.dequeue_reason.code // "?"' <<< "$last")
  left=$(epoch "$(jq -r '.left_at // empty' <<< "$last")" 2>/dev/null) || left=0
  IFS=, read -ra J <<< "$(jq -r '(.dequeue_reason.checks // []) as $c | ($c - ["ci"]) as $j | (if ($j | length) > 0 then $j else $c end) | join(",")' <<< "$last")"
  jobs=$(IFS=,; echo "${J[*]}")
  pr=$(api "$API/repos/$REPO/pulls/$n") || { echo "#$n: PR unreadable; the next run tries again"; rc=2; continue; }
  head=$(jq -r .head.sha <<< "$pr")
  appr=$(WHO="$WHO" jq -r '[.[] | select(.user.login as $l | (env.WHO | split(" ")) | index($l))
    | select(.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR")
    | .body // "" | gsub("[*_`]"; "") | scan("(?im)^\\s*reviewer:\\s*approve[sd]?\\s+([0-9a-f]{40})\\b")[0]] | last // empty' "$C")
  if [ "$head" != "$appr" ]; then echo "#$n: head ${head:0:9} is not the approved ${appr:-none} — a new head needs a new review; no requeue"; continue; fi
  if [ "$code" != CHECKS_FAILED ]; then echo "#$n: left the queue for $code, not failing checks; no requeue"; continue; fi
  if mark "$C" "<!-- requeue-watch:queued sha=$head -->"; then
    # Requeued once for this head and still dequeued. Mergify answered (a payload after ours) → it failed again: a Lead looks.
    # No answer within 30 min → Mergify did not take the command (a bot's command refused?): one question for the tech lead.
    q=$(jq -r --arg p "$POSTER" --arg h "$head" '[.[] | select(.user.login == $p and (.body | contains("<!-- requeue-watch:queued sha=" + $h + " -->")))] | last | .created_at' "$C")
    answered=$(jq --arg q "$q" '[.[] | select(.user.login == "mergify[bot]" and .created_at > $q)] | length' "$C")
    if [ "$answered" = 0 ] && [ $(( NOW - $(epoch "$q") )) -gt 1800 ] && ! mark "$C" "<!-- requeue-watch:stall sha=$head -->"; then
      post "$n" "Question for the tech lead: requeue watch (ENF-746b) commented \"@mergifyio queue\" at $q and Mergify has not answered in 30 min: it may refuse commands from \`$POSTER\`. Requeue by hand, and set the secret REQUEUE_TOKEN (and the variable REQUEUE_LOGIN) for a write account.
<!-- requeue-watch:stall sha=$head -->" || rc=2
      echo "#$n: Mergify did not answer the requeue; asked the tech lead"; continue
    fi
    echo "#$n: already requeued once for head ${head:0:9}; not again (a Lead looks)"; continue; fi
  today=$(jq --arg p "$POSTER" --argjson now "$NOW" '[.[] | select(.user.login == $p and (.body | contains("<!-- requeue-watch:queued sha="))) | select(($now - (.created_at | fromdateiso8601)) < 86400)] | length' "$C")
  if [ "$today" -ge "$MAX_DAY" ]; then
    day=$(jq -rn --argjson t "$NOW" '$t | strftime("%Y-%m-%d")')
    if mark "$C" "<!-- requeue-watch:limit day=$day -->"; then echo "#$n: $today requeues in 24 h; reported already"; continue; fi
    post "$n" "Question for the tech lead: requeue watch (ENF-746b) requeued this PR $today times in 24 h and stops; it left the queue again on \`${jobs}\`. Please look.
<!-- requeue-watch:limit day=$day -->" || rc=2
    echo "#$n: $today requeues in 24 h; reported to the tech lead instead"; continue
  fi
  # Is the failure main's? Main has no push run (P-85), so main "at that time" is read where it was tested: the other merge-queue
  # batches (drafts mergify[bot] opens on mergify/merge-queue/*) built on main around left_at that do not contain this PR. At least
  # MIN_OTHERS of them failing the same job = main's pipeline. Or: a known pipeline lock in the job's log in this PR's own batch.
  why=""; unknown=""
  if [ "$left" -gt 0 ]; then
    [ -n "$batches" ] || batches=$(api "$API/repos/$REPO/pulls?state=all&sort=created&direction=desc&per_page=100" \
      | jq -c '{full: (length == 100), oldest: (map(.created_at | fromdateiso8601) | min // 0),
               list: [.[] | select(.user.login == "mergify[bot]" and (.head.ref | startswith("mergify/merge-queue/")))
               | {n: .number, sha: .head.sha, t: (.created_at | fromdateiso8601), body: (.body // "")}]}') || { batches=""; unknown="the merge-queue batches"; }
    # The newest 100 PRs must reach back past the window (an old drop, after an outage): else unjudged, never "own failure".
    [ -n "$batches" ] && jq -e --argjson l "$left" --argjson w "$WINDOW" '.full and .oldest > $l - $w' <<< "$batches" >/dev/null && unknown="batches that old (older than the newest 100 PRs)"
    others=""; bad=""; groups=0
    if [ -z "$unknown" ]; then
      while IFS=$'\t' read -r bn bsha members; do
        for j in "${J[@]}"; do
          c=$(api "$API/repos/$REPO/commits/$bsha/check-runs?filter=latest&check_name=$(uri "$j")" | jq -r '[.check_runs[] | .conclusion] | index("failure") != null') || { unknown="batch #$bn's checks"; break 2; }
          if [ "$c" = true ]; then   # counted only if it shares no member with a red batch already counted (independent)
            dup=""; for m in $members; do case " $others " in *" $m "*) dup=1;; esac; done
            [ -z "$dup" ] && { bad="$bad#$bn "; groups=$((groups + 1)); }; others="$others $members"; break
          fi
        done
      done < <(jq -r --argjson l "$left" --argjson w "$WINDOW" --arg me "/pull/$n)" \
        '.list[] | select(.t >= $l - $w and .t <= $l + 300) | select(.body | contains($me) | not)
         | "\(.n)\t\(.sha)\t\([.body | scan("/pull/([0-9]+)\\)")[0]] | unique | join(" "))"' <<< "$batches" | head -15)
      # Independent red batches (no shared member): one broken PR, retested in several batches or breaking its batch-mate, is one.
      [ -z "$unknown" ] && [ "$groups" -ge "$MIN_OTHERS" ] && why="\`${jobs}\` also failed in $groups independent batches (${bad% }) on main as it was then, without this PR"
    fi
  fi
  if [ -z "$why" ] && [ -z "$unknown" ] && [ -s "$LOCKS" ]; then   # a known pipeline lock in the failed job's log, in the batch Mergify checked
    spec=$(payloads "$C" | jq -s -r '[.[] | .speculative_check_pr // empty] | last // empty')
    if [ -n "$spec" ]; then
      ssha=$(api "$API/repos/$REPO/pulls/$spec" | jq -r '.head.sha // empty') || unknown="batch #$spec"
      files=$(pages "repos/$REPO/pulls/$n/files" | jq -r '.[].filename') || unknown="this PR's files"
      for j in "${J[@]}"; do [ -n "$unknown" ] || [ -z "$ssha" ] && break
        ids=$(api "$API/repos/$REPO/commits/$ssha/check-runs?filter=latest&check_name=$(uri "$j")" | jq -r '.check_runs[] | select(.conclusion == "failure") | .id') || { unknown="batch #$spec's checks"; break; }
        for id in $ids; do
          api "$API/repos/$REPO/actions/jobs/$id/logs" > "$T/log" 2>/dev/null || { unknown="job $id's log"; break 2; }
          while IFS=$'\t' read -r re paths; do
            case "$re" in ''|'#'*) continue;; esac
            grep -qE -- "$re" "$T/log" || continue
            [ -n "${paths:-}" ] && grep -qE -- "$paths" <<< "$files" && continue
            why="the failed job's log in batch #$spec matches the pipeline lock \`$re\` (requeue-locks.txt)"; break 3
          done < "$LOCKS"
        done
      done
    fi
  fi
  if [ -z "$why" ] && [ -n "$unknown" ]; then echo "#$n: could not read $unknown; not judged, the next run tries again"; rc=2; continue; fi
  if [ -n "$why" ]; then
    # `dequeued` stays on: Mergify takes it off when the PR is back in (19 Nov, #2315's events), so a refused command
    # leaves the PR visible to lead-watch as dequeued, never silently out of every list.
    post "$n" "@mergifyio queue

<!-- requeue-watch:queued sha=$head -->
**Requeue watch (ENF-746b, P-746):** requeued unchanged: head \`${head:0:9}\` is the approved one and it left the queue on \`${jobs}\` because $why." \
      || { echo "#$n: the queue comment failed"; rc=2; continue; }
    echo "#$n: requeued ($why)"
  else
    mk="<!-- requeue-watch:own sha=$head left=$left -->"
    mark "$C" "$mk" || post "$n" "**Requeue watch (ENF-746b, P-746):** not requeued: \`${jobs}\` failed with this PR and main does not share the failure (fewer than $MIN_OTHERS other batches without this PR failed it, no known pipeline lock). The owner reads the failed job's log and fixes it.
$mk" || rc=2
    echo "#$n: not requeued: \`${jobs}\` is this PR's own failure"
  fi
done
echo "requeue-watch: $judged approved and dequeued PR(s) judged"
exit $rc
