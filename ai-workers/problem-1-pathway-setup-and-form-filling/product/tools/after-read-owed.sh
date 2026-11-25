#!/usr/bin/env bash
# The Lead's after-reads owed (P-823, founder 25 Nov ~08:1x IST: "the Lead reads afterwards: every money PR within the
# hour, others 1 in 3"). queue-gate.sh labels a read-after PR (money, an additive migration, a public route) by itself and
# puts "after-read: money" or, when drawn (its number mod 3 is 0), "after-read: other" on it with the line
# "Lead after-read owed: <kinds> #<n> <head>". This lists those PRs that have no "Lead read the diff: <their head>" line
# from someone with write access (OWNER, MEMBER, COLLABORATOR), as lead-read-gate.sh reads that line:
#   OWED money #<n> merged <time>: due <merge + 60 min>, <m> min overdue | <m> min left
#   OWED other #<n> merged <time>
#   WAIT <kind> #<n>: labelled, not merged yet (the after-read starts at the merge)
# Read-only (GET only), US$0, no model call. For the Lead's 30-minute check (lead-watch.sh calls it once #3506 lands;
# until then the Lead runs it). The Lead takes the label off after the read, or leaves it: the read line alone clears it.
# Env: GH_TOKEN, REPO (owner/name); API (default https://api.github.com); NOW (ISO time, the test's clock).
# Exit 0; 1 when a money after-read is overdue; 2 when GitHub cannot be read. Test: check-after-read-owed.sh.
set -uo pipefail
API="${API:-https://api.github.com}"
for v in GH_TOKEN REPO; do [ -n "${!v:-}" ] || { echo "after-read-owed: $v is not set"; exit 2; }; done
H=$(mktemp); trap 'rm -f "$H"' EXIT; chmod 600 "$H"   # the token in a file, not on curl's command line (seen by ps)
printf 'Authorization: Bearer %s\nAccept: application/vnd.github+json\n' "$GH_TOKEN" > "$H"
api() { curl -sS --fail-with-body -H @"$H" "$@"; }
pages() { local p=1 all='[]' one; while [ "$p" -le 30 ]; do one=$(api "$API/$1&per_page=100&page=$p") || return 1
    all=$(jq -s '.[0] + .[1]' <(echo "$all") <(echo "$one")) || return 1; [ "$(jq length <<< "$one")" -lt 100 ] && break; p=$((p + 1)); done; echo "$all"; }
now=$(date -u -d "${NOW:-now}" +%s 2>/dev/null) || { echo "after-read-owed: NOW is not a time"; exit 2; }
rc=0
for kind in money other; do
  list=$(pages "repos/$REPO/issues?state=all&labels=after-read%3A%20$kind") || { echo "after-read-owed: the after-read: $kind PRs cannot be read"; exit 2; }
  for n in $(jq -r '.[] | select(.pull_request) | .number' <<< "$list"); do
    pr=$(api "$API/repos/$REPO/pulls/$n") || { echo "after-read-owed: #$n cannot be read"; exit 2; }
    head=$(jq -r '.head.sha // ""' <<< "$pr"); merged=$(jq -r '.merged_at // ""' <<< "$pr")
    [[ "$head" =~ ^[0-9a-f]{40}$ ]] || { echo "after-read-owed: #$n has no head"; exit 2; }
    cs=$(pages "repos/$REPO/issues/$n/comments?x=1") || { echo "after-read-owed: #$n's comments cannot be read"; exit 2; }
    # The read line, alone on its line, by a writer, in an unedited comment (lead-read-gate.sh's rule, simplified: no fences)
    if jq -r '.[] | select(.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR")
        | select((.updated_at // .created_at) == .created_at) | (.body // "")' <<< "$cs" | tr -d '*_`\r' \
        | grep -iE '^[[:space:]]*Lead read(: *OK| the diff:?)[[:space:]]+[0-9a-f]{40}[[:space:]]*\.?[[:space:]]*$' | grep -oiE '[0-9a-f]{40}' | tr 'A-F' 'a-f' | grep -qx "$head"; then
      continue; fi
    if [ -z "$merged" ]; then [ "$(jq -r .state <<< "$pr")" = open ] && echo "WAIT $kind #$n: labelled, not merged yet (the after-read starts at the merge)"; continue; fi
    m=$(date -u -d "$merged" +%s) || { echo "after-read-owed: #$n's merge time cannot be read"; exit 2; }
    if [ "$kind" = money ]; then due=$((m + 3600)); left=$(( (due - now) / 60 ))
      if [ "$left" -lt 0 ]; then echo "OWED money #$n merged $merged: due $(date -u -d "@$due" +%FT%TZ), $(( -left )) min overdue"; rc=1
      else echo "OWED money #$n merged $merged: due $(date -u -d "@$due" +%FT%TZ), $left min left"; fi
    else echo "OWED other #$n merged $merged"; fi
  done
done
exit $rc
