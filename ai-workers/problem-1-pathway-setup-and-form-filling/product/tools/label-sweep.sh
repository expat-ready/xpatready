#!/usr/bin/env bash
# B134 (Lead 30 on #1232, P-214 fix to the checks): no PR labels itself `review: approved`. A same-repo PR runs its own
# copy of ci.yml, so a job it adds can put the label on with GITHUB_TOKEN; a label set that way starts no workflow run,
# so label-guard.yml's "labeled" run never sees it, and Mergify would queue the PR on a green ci. This sweep, run by
# label-guard.yml when Mergify puts `queued` on, every 10 minutes and after each ci run (main's copy, never the PR's),
# lists the open PRs carrying `review: approved` and reads each one's issue events: when the event that put the label
# on (the last "labeled" for it) has the actor github-actions[bot], the label comes off and a comment says why. A label
# put on by a person (the tech lead, a builder through the claude app: actor is the person) is kept, and so is any
# other bot's. An event list longer than PAGES_MAX pages counts as padded and the label comes off. Unlike label-guard.sh,
# a PR whose events cannot be read keeps its label (a GitHub hiccup must not empty the queue): the run goes red (exit 2)
# and the next sweep tries again; label-guard.yml's guard job, run when Mergify puts `queued` on, fails closed instead.
# Env: GH_TOKEN, REPO (owner/name); API (default https://api.github.com). Exit 0 all judged; 2 something could not be
# read or removed. Test: check-label-sweep.sh. The hard boundary for .github/** is the founder's (STATE F6).
set -uo pipefail
API="${API:-https://api.github.com}"; LABEL="review: approved"; BOT="github-actions[bot]"
for v in GH_TOKEN REPO; do [ -n "${!v:-}" ] || { echo "label-sweep: $v is not set"; exit 2; }; done
command -v jq >/dev/null || { echo "label-sweep: jq is missing"; exit 2; }
H=$(mktemp); trap 'rm -f "$H"' EXIT; chmod 600 "$H"   # the token in a file, not on curl's command line (seen by ps)
printf 'Authorization: Bearer %s\nAccept: application/vnd.github+json\n' "$GH_TOKEN" > "$H"
api() { curl -sS --fail-with-body -H @"$H" "$@"; }
pages() {  # every page of a list endpoint ($1, with or without its own query), as one JSON array
  # Events come oldest first, so a list cut short would drop the newest, which decide. More than PAGES_MAX full pages
  # (3000 events; no real PR has them, but a PR's job can pad its own list) returns 3: the label then comes off.
  local p=1 all='[]' one sep='?'; case "$1" in *\?*) sep='&';; esac
  while :; do
    [ "$p" -le "${PAGES_MAX:-30}" ] || { echo "label-sweep: $1 has more than ${PAGES_MAX:-30} pages" >&2; return 3; }
    one=$(api "$API/$1${sep}per_page=100&page=$p") || return 1
    echo "$one" | jq -e 'type == "array"' >/dev/null || return 1
    all=$(jq -s '.[0] + .[1]' <(echo "$all") <(echo "$one")); [ "$(echo "$one" | jq length)" -lt 100 ] && break; p=$((p + 1))
  done; echo "$all"; }
enc=$(jq -rn --arg l "$LABEL" '$l|@uri')

prs=$(pages "repos/$REPO/issues?state=open&labels=$enc") || { echo "label-sweep: cannot list the PRs labelled '$LABEL'"; exit 2; }
nums=$(echo "$prs" | jq -r '.[] | select(.pull_request != null) | .number')
rc=0; n=0
for pr in $nums; do
  n=$((n + 1))
  ev=$(pages "repos/$REPO/issues/$pr/events"); e=$?
  if [ "$e" = 3 ]; then who="$BOT"; how="an event list over ${PAGES_MAX:-30} pages (padded, as a PR's own job could; #1270 breaker M2)"
  elif [ "$e" != 0 ]; then echo "#$pr: events unreadable, label kept; the next sweep tries again"; rc=2; continue
  else how="put on by $BOT"
  who=$(echo "$ev" | jq -r --arg l "$LABEL" '[.[] | select(.event == "labeled" and .label.name == $l)] | last | .actor.login // empty')
  at=$(echo "$ev" | jq -r --arg l "$LABEL" '[.[] | select(.event == "labeled" and .label.name == $l)] | last | .created_at // empty'); fi
  if [ -z "$who" ]; then echo "#$pr: no labeled event for '$LABEL' found, label kept (an event list GitHub trimmed?)"; rc=2; continue; fi
  if [ "$who" != "$BOT" ]; then echo "#$pr: kept ('$LABEL' put on by $who)"; continue; fi
  # B194: queue-gate.yml labels with GITHUB_TOKEN too. Main's queue-gate.sh judges the PR as it is now (the owner's or a
  # known reviewer's Approve on the head, ci green, no Lead-read path): when it says eligible, the label is kept.
  if [ "$e" = 0 ]; then   # when it says no, its reason goes into the run's log and the removal's PR comment
    gate=$(PR=$pr LABELED_AT="${at:-}" bash "${QUEUE_GATE:-$(dirname "$0")/queue-gate.sh}" eligible 2>&1); g=$?
    if [ "$g" = 0 ]; then echo "#$pr: kept ('$LABEL' put on by $BOT; queue-gate.sh: eligible)"; continue; fi
    # CI-PRE: only the full runs could not be read (exit 3): as for unreadable events above, a GitHub hiccup must not empty the queue.
    if [ "$g" = 3 ]; then echo "#$pr: queue-gate.sh could not judge it, label kept; the next sweep tries again"; rc=2; continue; fi
    gate=$(tail -1 <<< "$gate" | cut -c1-200); how="$how; queue-gate.sh: ${gate:-no reason given}"
  fi
  if ! api -X DELETE "$API/repos/$REPO/issues/$pr/labels/$enc" >/dev/null; then
    # Already off (Lead 27, 24 Nov: #3472, the DELETE answered 404)? GitHub also says 404 to a token that may not see the
    # PR, so the PR's labels are read again: only a list that was read and does not hold the label is done.
    left=$(pages "repos/$REPO/issues/$pr/labels") && [ "$(jq --arg l "$LABEL" 'any(.[]; .name == $l)' <<< "$left")" = false ] \
      && { echo "#$pr: '$LABEL' ($how) was already off"; continue; }
    echo "#$pr: '$LABEL' ($how), but it could not be removed"; rc=2; continue
  fi
  body="**Label sweep (B134):** \`$LABEL\` removed: $how. \`$BOT\` is a workflow's GITHUB_TOKEN, not a person: a pull request's own workflow can set the label, and such a label starts no label-guard run. A person labels a reviewed head (P-277, P-189), or queue-gate.yml one it judges eligible (B194).

To label again: a person adds \`$LABEL\` once a PR comment line \"Reviewer: Approve\" names the head's SHA (label guard)."
  api -X POST "$API/repos/$REPO/issues/$pr/comments" -d "$(jq -n --arg b "$body" '{body: $b}')" >/dev/null || echo "#$pr: label removed, but the comment failed"
  echo "#$pr: removed '$LABEL' ($how)"
done
echo "label-sweep: $n labelled PR(s) judged"
exit $rc
