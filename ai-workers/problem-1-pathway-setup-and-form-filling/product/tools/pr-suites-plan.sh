#!/usr/bin/env bash
# E2 (P-772, B203; enforcement plan 21 Nov): plans ci.yml's report-only job pr-suites for one pull request.
#   bash product/tools/pr-suites-plan.sh <base>..<head>
# Prints GITHUB_OUTPUT lines: direct=true|false, units=<n>, n=<parts>, shards=[1,...,n].
#   * the pick is run-suites.sh --changed (select-suites.mjs). When the change would pick every suite ("ALL"), it is
#     --direct instead (the suites that import or name its files, plus the smoke set): the whole set is the merge queue's
#     job (P-651), and a PR must not spend 18 machines on it;
#   * parts = ceil(units / PER_PART), between 1 and MAX_PARTS (env PR_SUITES_PER_PART, default 25; PR_SUITES_MAX, default
#     12); no unit: shards=[] and the job runs nothing.
# Reads files only (git, node); exit 2 when the pick cannot be read (the job then runs nothing: report only, never red on
# a PR). Test: check-pr-suites-job.sh. US$0.
set -uo pipefail
TOOLS="${PR_SUITES_TOOLS:-$(cd "$(dirname "$0")" && pwd)}"   # PR_SUITES_TOOLS: a folder of fakes (tests only)
R="${1:-}"; [[ "$R" == *..* ]] || { echo "usage: pr-suites-plan.sh <base>..<head>" >&2; exit 2; }
PER="${PR_SUITES_PER_PART:-25}"; MAX="${PR_SUITES_MAX:-12}"
[[ "$PER" =~ ^[1-9][0-9]*$ ]] || PER=25; [[ "$MAX" =~ ^[1-9][0-9]*$ ]] || MAX=12
files=$(git diff --name-only "${R%%..*}...${R##*..}") || { echo "pr-suites-plan: git diff $R failed" >&2; exit 2; }
direct=false
if [ -n "$files" ]; then
  sel=$(printf '%s\n' "$files" | node "$TOOLS/select-suites.mjs") || { echo "pr-suites-plan: select-suites.mjs failed" >&2; exit 2; }
  case "$sel" in ALL$'\t'*) direct=true;; esac
fi
d=""; [ "$direct" = true ] && d="--direct"
list=$(bash "$TOOLS/run-suites.sh" --changed "$R" $d --list) || { echo "pr-suites-plan: run-suites.sh --list failed" >&2; exit 2; }
units=$(printf '%s\n' "$list" | grep -c '^check_' || true)
n=$(( (units + PER - 1) / PER )); [ "$n" -gt "$MAX" ] && n=$MAX
shards="[]"; [ "$n" -gt 0 ] && shards="[$(seq -s, 1 "$n")]"
printf 'direct=%s\nunits=%s\nn=%s\nshards=%s\n' "$direct" "$units" "$n" "$shards"
