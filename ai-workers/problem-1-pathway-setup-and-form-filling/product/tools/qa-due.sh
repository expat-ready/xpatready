#!/usr/bin/env bash
# qa-due.sh — is an after-merge qa round owed? (lab lane automation-measures, 27 Nov; audit row "qa after each merge":
# "The Lead starts a qa lane by hand" → a Claude Code scheduled task, product/ops/qa-after-merge-task.md).
# The last round = the newest merge on the ref whose PR title starts "qa:" or "records: qa" and names "after-merge"
# (capability and proof qa PRs test one item, so they cover nothing here). What it tested = that PR's branch head (its
# second parent: the round merges main first, so every main commit it tested is an ancestor of it).
# Owed = an app-code merge (first-parent merge whose diff touches app-code-prs.sh's paths, P-500) that is not an ancestor
# of the last round's branch head.
#   DUE  <sha> #<pr> <title> (after qa <sha> #<pr>)    exit 0: start /qa after-merge
#   NONE <reason>                                        exit 0: nothing to do; the session ends
#   BUSY <reason>                                        exit 0: a round is running (an open "qa: after-merge" PR,
#                                                        any age, updated in the last 12 h; the round opens it as a
#                                                        draft at its start, ops/qa-after-merge-task.md step 3)
# Exit 2 when history cannot be read (never a silent NONE). Git, plus one read-only GitHub search for BUSY (skipped with
# --no-open-check; a failed search prints BUSY, so a network fault never starts a second round). An open after-merge PR
# not updated for 12 h is stale: named on the DUE line, and a new round starts.
# Usage: bash product/tools/qa-due.sh [--ref origin/main] [--no-open-check] [--max 400]   Test: check-qa-due.sh.
set -u
REF=origin/main; OPEN=1; MAX=400
while [ $# -gt 0 ]; do case "$1" in --ref) REF=$2; shift 2;; --no-open-check) OPEN=0; shift;; --max) MAX=$2; shift 2;; *) echo "usage: qa-due.sh [--ref R] [--no-open-check] [--max N]" >&2; exit 2;; esac; done
APP='^ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/(api/src|web/src|engine|prisma|contracts|samples|packages)/'
QA='^(qa:|records: qa).*after-merge'
git rev-parse -q --verify "$REF^{commit}" >/dev/null || { echo "qa-due: $REF is not a commit here (git fetch origin main)" >&2; exit 2; }
log=$(git log --first-parent --merges -n "$MAX" --format='%H%x09%s%x09%b%x1e' "$REF" \
  | awk 'BEGIN {RS = "\036"} {sub(/^\n+/, ""); n = index($0, "\n"); print (n ? substr($0, 1, n - 1) : $0)}')
qa=""; qhead=""
while IFS=$'\t' read -r sha subj title; do
  [ -n "$sha" ] || continue
  if printf '%s' "$title" | grep -qiE "$QA"; then qa="$sha $(printf '%s' "$subj" | grep -oE '#[0-9]+' | head -1)"; qhead=$(git rev-parse -q --verify "$sha^2"); break; fi
done <<<"$log"
app=""
while IFS=$'\t' read -r sha subj title; do
  [ -n "$sha" ] || continue
  [ -n "$qhead" ] && git merge-base --is-ancestor "$sha" "$qhead" 2>/dev/null && break   # tested by the last round, and so is all before it
  printf '%s' "$title" | grep -qiE '^(qa:|records|lead)' && continue
  if git rev-parse -q --verify "$sha^2" >/dev/null && git diff --name-only "$sha^1" "$sha" 2>/dev/null | grep -qE "$APP"; then
    app="$sha"$'\t'"$(printf '%s' "$subj" | grep -oE '#[0-9]+' | head -1)"$'\t'"$title"; break; fi
done <<<"$log"
[ -n "$app" ] || { echo "NONE no app-code merge since the last after-merge qa round${qa:+ ($(printf %s "${qa%% *}" | cut -c1-9) ${qa#* })}"; exit 0; }
IFS=$'\t' read -r asha apr atitle <<<"$app"
stale=""
if [ "$OPEN" = 1 ]; then
  repo=$(git remote get-url origin 2>/dev/null | sed -E 's#^.*github\.com[:/]##; s#\.git$##')
  cut=$(date -u -d '12 hours ago' +%s 2>/dev/null || date -u -v-12H +%s)
  open=$(gh api -X GET search/issues -f q="repo:$repo is:pr is:open in:title after-merge" \
    --jq '.items[] | select(.title | test("^(qa:|records: qa).*after-merge"; "i")) | "\(.number) \(.updated_at)"' 2>/dev/null) \
    || { echo "BUSY the open-qa-PR search failed; not starting a second round blind"; exit 0; }
  while read -r num upd; do
    [ -n "$num" ] || continue
    u=$(date -u -d "$upd" +%s 2>/dev/null || date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$upd" +%s)
    if [ "$u" -ge "$cut" ]; then echo "BUSY open after-merge qa PR #$num (updated $upd) is the running round; it covers ${asha:0:9} when it re-reads main"; exit 0; fi
    stale="$stale #$num"
  done <<<"$open"
fi
qd="none in the last $MAX merges"; [ -n "$qa" ] && qd="$(printf '%s' "${qa%% *}" | cut -c1-9) ${qa#* }"
echo "DUE ${asha:0:9} $apr $atitle (after qa $qd)${stale:+; stale open after-merge PR(s) not updated in 12 h:$stale}"
