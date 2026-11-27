#!/usr/bin/env bash
# qa-due.sh — is an after-merge qa round owed? (lab lane automation-measures, 27 Nov; audit row "qa after each merge":
# "The Lead starts a qa lane by hand" → Claude Code scheduled task, .claude/routines/qa-after-merge.md).
# Owed = the newest app-code merge on the ref (first-parent merge commit whose diff touches app code, app-code-prs.sh's
# paths, P-500) is newer than the newest qa merge (a merge whose PR title starts "qa:" or "records: qa").
#   DUE  <sha> #<pr> <title> (after qa <sha> #<pr>)    exit 0: start /qa after-merge
#   NONE <reason>                                        exit 0: nothing to do; the session ends
#   BUSY <reason>                                        exit 0: an open qa PR from the last 6 h is working on it
# Exit 2 when history cannot be read (never a silent NONE). Git, plus one read-only GitHub search for BUSY (skipped with
# --no-open-check; a failed search prints BUSY, so a network fault never starts a second round).
# Usage: bash product/tools/qa-due.sh [--ref origin/main] [--no-open-check] [--max 400]   Test: check-qa-due.sh.
set -u
REF=origin/main; OPEN=1; MAX=400
while [ $# -gt 0 ]; do case "$1" in --ref) REF=$2; shift 2;; --no-open-check) OPEN=0; shift;; --max) MAX=$2; shift 2;; *) echo "usage: qa-due.sh [--ref R] [--no-open-check] [--max N]" >&2; exit 2;; esac; done
APP='^ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/(api/src|web/src|engine|prisma|contracts|samples|packages)/'
QA='^(qa:|records: qa)'
git rev-parse -q --verify "$REF^{commit}" >/dev/null || { echo "qa-due: $REF is not a commit here (git fetch origin main)" >&2; exit 2; }
app=""; qa=""
while IFS=$'\t' read -r sha subj title; do
  [ -n "$sha" ] || continue
  pr=$(printf '%s' "$subj" | grep -oE '#[0-9]+' | head -1)
  if [ -z "$qa" ] && printf '%s' "$title" | grep -qE "$QA"; then qa="$sha $pr"; break; fi
  if [ -z "$app" ] && git rev-parse -q --verify "$sha^2" >/dev/null && git diff --name-only "$sha^1" "$sha" 2>/dev/null | grep -qE "$APP"; then
    app="$sha"$'\t'"$pr"$'\t'"$title"; fi
done < <(git log --first-parent --merges -n "$MAX" --format='%H%x09%s%x09%b%x1e' "$REF" \
  | awk 'BEGIN {RS = "\036"} {sub(/^\n+/, ""); n = index($0, "\n"); print (n ? substr($0, 1, n - 1) : $0)}')
[ -n "$app" ] || { echo "NONE no app-code merge since the last qa merge${qa:+ ($(printf %s "${qa%% *}" | cut -c1-9) ${qa#* })}"; exit 0; }
IFS=$'\t' read -r asha apr atitle <<<"$app"
if [ "$OPEN" = 1 ]; then
  since=$(date -u -d '6 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-6H +%Y-%m-%dT%H:%M:%SZ)
  repo=$(git remote get-url origin 2>/dev/null | sed -E 's#^.*github\.com[:/]##; s#\.git$##')
  n=$(gh api -X GET search/issues -f q="repo:$repo is:pr is:open in:title qa created:>=$since" --jq '[.items[] | select(.title | test("^(qa:|records: qa)"))] | length' 2>/dev/null) \
    || { echo "BUSY the open-qa-PR search failed; not starting a second round blind"; exit 0; }
  [ "${n:-0}" -gt 0 ] && { echo "BUSY $n open qa PR(s) opened in the last 6 h; that round covers ${asha:0:9}"; exit 0; }
fi
qd="none in the last $MAX merges"; [ -n "$qa" ] && qd="$(printf '%s' "${qa%% *}" | cut -c1-9) ${qa#* }"
echo "DUE ${asha:0:9} $apr $atitle (after qa $qd)"
