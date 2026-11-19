#!/usr/bin/env bash
# ENF-746b (P-746 (4), founder 20 Nov: "make it live and enforced"). On 20 Nov approved PRs #2315, #2268, #2302, #2323
# left the Mergify queue (label `dequeued`) only because main's pipeline was broken (a DECISIONS lock, a broken import)
# and stayed out until a Lead requeued each by hand ("@mergifyio queue" and `dequeued` off). Two modes:
#
#   watch (default; requeue-watch.yml, every 15 min, main's copy): for each open PR labelled `review: approved` and
#     `dequeued`, read Mergify's last dequeue record (its payload comment: reason, failing checks, left_at). The PR is
#     requeued (`dequeued` off, a comment "@mergifyio queue") only when all hold:
#       * its head is the SHA of the last "Reviewer: Approve <sha>" line (by the owner, a member or a collaborator);
#       * Mergify's reason is CHECKS_FAILED and the failure is main's, not the PR's: a failing job also failed on main's
#         head commit at left_at, or at least MIN_OTHERS other open PRs left the queue on the same job within WINDOW
#         seconds of it (a broken main drops everything at once), or the failed job's log in the batch Mergify checked
#         matches a pipeline lock in requeue-locks.txt;
#       * never twice for the same head SHA (a hidden marker in the comment), and at most MAX_DAY times per PR in 24 h:
#         then one "Question for the tech lead" comment a day instead.
#     A failure main does not share is the PR's own: no requeue, one comment (per head and dequeue) naming the job.
#   proof (lead-watch.sh, P-746 (3): proof first): stdin is `gh pr list --json number,title,labels,isDraft,
#     statusCheckRollup,createdAt`; prints one line listing open qa proof PRs (title starts "qa:" and says Works) not in
#     the queue, each with its reason, and an ACT line for each open over PROOF_MIN minutes. Exit = number of ACT lines.
#
# Env (watch): GH_TOKEN, REPO (owner/name); API (default https://api.github.com); NOW (epoch, tests). Exit 0 all judged;
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
    | "proof  qa proof PRs not in the queue (P-746 (3)): " + (if ($w | length) == 0 then "none" else ($w | map("#\(.n) \(.why), \(.m) min") | join(" · ")) end),
      ($w[] | select(.m > $lim) | "ACT   proof #\(.n) waited \(.m) min out of the queue (\(.why)): act on it first (P-746 (3))")')
  r=$?; [ $r = 0 ] || { echo "ACT   proof line could not be read (jq exit $r)"; exit 1; }
  echo "$out"; exit "$(grep -c '^ACT' <<< "$out")"
fi

for v in GH_TOKEN REPO; do [ -n "${!v:-}" ] || { echo "requeue-watch: $v is not set"; exit 2; }; done
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
iso() { jq -rn --argjson t "$1" '$t | todate'; }
# Mergify's payload comments, oldest first, as JSON objects (one per line).
payloads() { jq -c '.[] | select(.user.login == "mergify[bot]") | .body
  | (capture("Mergify Payload -\\*-\\s*(?<j>\\{.*\\})\\s*-\\*- Mergify Payload End"; "s") | .j | fromjson)? // empty' "$1"; }
epoch() { jq -r 'sub("\\.[0-9]+"; "") | sub("\\+00:00$"; "Z") | fromdateiso8601' <<< "\"$1\""; }

deq=$(pages "repos/$REPO/issues?state=open&labels=dequeued") || { echo "requeue-watch: cannot list the dequeued PRs"; exit 2; }
all=$(jq -r '.[] | select(.pull_request != null) | .number' <<< "$deq")
want=$(jq -r '.[] | select(.pull_request != null) | select(any(.labels[]; .name == "review: approved")) | .number' <<< "$deq")
rc=0; : > "$T/deq.tsv"
for n in $all; do   # pass 1: every dequeued PR's last dequeue (number, reason, left_at, failing jobs)
  pages "repos/$REPO/issues/$n/comments" > "$T/c-$n.json" || { echo "#$n: comments unreadable; the next run tries again"; rc=2; rm -f "$T/c-$n.json"; continue; }
  last=$(payloads "$T/c-$n.json" | jq -s -c '[.[] | select(.state == "dequeued")] | last // empty')
  [ -n "$last" ] || continue
  left=$(epoch "$(jq -r '.left_at // empty' <<< "$last")" 2>/dev/null) || left=""
  jobs=$(jq -r '(.dequeue_reason.checks // []) as $c | ($c - ["ci"]) as $j | (if ($j | length) > 0 then $j else $c end) | join(",")' <<< "$last")
  printf '%s\t%s\t%s\t%s\n' "$n" "$(jq -r '.dequeue_reason.code // "?"' <<< "$last")" "${left:-0}" "$jobs" >> "$T/deq.tsv"
done

judged=0
for n in $want; do
  [ -f "$T/c-$n.json" ] || continue; judged=$((judged + 1)); C="$T/c-$n.json"
  row=$(awk -F'\t' -v n="$n" '$1 == n' "$T/deq.tsv")
  [ -n "$row" ] || { echo "#$n: no Mergify dequeue record found; left alone"; continue; }
  IFS=$'\t' read -r _ code left jobs <<< "$row"
  pr=$(api "$API/repos/$REPO/pulls/$n") || { echo "#$n: PR unreadable; the next run tries again"; rc=2; continue; }
  head=$(jq -r .head.sha <<< "$pr")
  appr=$(jq -r '[.[] | select(.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR")
    | .body | scan("(?m)^Reviewer: Approve ([0-9a-f]{40})")[0]] | last // empty' "$C")
  if [ "$head" != "$appr" ]; then echo "#$n: head ${head:0:9} is not the approved ${appr:-none} — a new head needs a new review; no requeue"; continue; fi
  if [ "$code" != CHECKS_FAILED ]; then echo "#$n: left the queue for $code, not failing checks; no requeue"; continue; fi
  if jq -e --arg h "$head" 'any(.[]; .body | contains("<!-- requeue-watch:queued sha=" + $h + " -->"))' "$C" >/dev/null; then
    echo "#$n: already requeued once for head ${head:0:9}; not again (a Lead looks)"; continue; fi
  today=$(jq --argjson now "$NOW" '[.[] | select(.body | contains("<!-- requeue-watch:queued sha=")) | select(($now - (.created_at | fromdateiso8601)) < 86400)] | length' "$C")
  if [ "$today" -ge "$MAX_DAY" ]; then
    day=$(jq -rn --argjson t "$NOW" '$t | strftime("%Y-%m-%d")')
    if jq -e --arg d "$day" 'any(.[]; .body | contains("<!-- requeue-watch:limit day=" + $d + " -->"))' "$C" >/dev/null; then echo "#$n: $today requeues in 24 h; reported already"; continue; fi
    post "$n" "Question for the tech lead: requeue watch (ENF-746b) requeued this PR $today times in 24 h and stops; it left the queue again on \`${jobs}\`. Please look.
<!-- requeue-watch:limit day=$day -->" || rc=2
    echo "#$n: $today requeues in 24 h; reported to the tech lead instead"; continue
  fi
  why=""   # is the failure main's?
  if [ "$left" -gt 0 ]; then
    msha=$(api "$API/repos/$REPO/commits?sha=main&until=$(iso "$left")&per_page=1" | jq -r '.[0].sha // empty') || msha=""
    if [ -n "$msha" ]; then
      mfail=$(api "$API/repos/$REPO/commits/$msha/check-runs?per_page=100" | jq -r '.check_runs[] | select(.conclusion == "failure") | .name') || { echo "#$n: main's checks unreadable"; rc=2; }
      for j in ${jobs//,/ }; do grep -qxF "$j" <<< "${mfail:-}" && why="\`$j\` also failed on main's head ${msha:0:9} at that time"; done
    fi
    if [ -z "$why" ]; then
      others=$(awk -F'\t' -v n="$n" -v l="$left" -v w="$WINDOW" -v js="$jobs" 'BEGIN { split(js, a, ",") }
        $1 != n && $2 == "CHECKS_FAILED" && ($3 - l <= w) && (l - $3 <= w) { split($4, b, ","); hit = 0
          for (i in a) for (k in b) if (a[i] == b[k]) hit = 1; if (hit) printf "#%s ", $1 }' "$T/deq.tsv")
      [ "$(wc -w <<< "$others")" -ge "$MIN_OTHERS" ] && why="${others% } left the queue on the same job within $((WINDOW / 60)) min: main's pipeline, not this PR"
    fi
  fi
  if [ -z "$why" ] && [ -s "$LOCKS" ]; then   # a known pipeline lock in the failed job's log, in the batch Mergify checked
    spec=$(payloads "$C" | jq -s -r '[.[] | .speculative_check_pr // empty] | last // empty')
    if [ -n "$spec" ]; then
      ssha=$(api "$API/repos/$REPO/pulls/$spec" | jq -r '.head.sha // empty') || ssha=""
      ids=$( [ -n "$ssha" ] && api "$API/repos/$REPO/commits/$ssha/check-runs?per_page=100" \
        | jq -r --arg js "$jobs" '($js | split(",")) as $j | .check_runs[] | select(.conclusion == "failure") | select(.name as $x | $j | index($x)) | .id')
      files=$(pages "repos/$REPO/pulls/$n/files" | jq -r '.[].filename') || files=""
      for id in $ids; do
        api "$API/repos/$REPO/actions/jobs/$id/logs" > "$T/log" 2>/dev/null || continue
        while IFS=$'\t' read -r re paths; do
          case "$re" in ''|'#'*) continue;; esac
          grep -qE -- "$re" "$T/log" || continue
          [ -n "${paths:-}" ] && grep -qE -- "$paths" <<< "$files" && continue
          why="the failed job's log in batch #$spec matches the pipeline lock \`$re\` (requeue-locks.txt)"; break 2
        done < "$LOCKS"
      done
    fi
  fi
  if [ -n "$why" ]; then
    api -X DELETE "$API/repos/$REPO/issues/$n/labels/dequeued" >/dev/null || { echo "#$n: \`dequeued\` could not be removed"; rc=2; continue; }
    post "$n" "@mergifyio queue

<!-- requeue-watch:queued sha=$head -->
**Requeue watch (ENF-746b, P-746):** requeued unchanged: head \`${head:0:9}\` is the approved one and it left the queue on \`${jobs}\` because $why." \
      || { echo "#$n: \`dequeued\` removed, but the queue comment failed"; rc=2; continue; }
    echo "#$n: requeued ($why)"
  else
    mk="<!-- requeue-watch:own sha=$head left=$left -->"
    if ! jq -e --arg m "$mk" 'any(.[]; .body | contains($m))' "$C" >/dev/null; then
      post "$n" "**Requeue watch (ENF-746b, P-746):** not requeued: \`${jobs}\` failed with this PR and main does not share the failure (not on main's head at that time, no other PRs dropped on it, no known pipeline lock). The owner reads the failed job's log and fixes it.
$mk" || rc=2
    fi
    echo "#$n: not requeued: \`${jobs}\` is this PR's own failure"
  fi
done
echo "requeue-watch: $judged approved and dequeued PR(s) judged"
exit $rc
