#!/usr/bin/env bash
# Open product PRs to label "paused" (lab bundle A11, founder A451; P-847: product work stops until the lab is done). The
# list is factory-watch.py pause-list: open PRs that are not Dependabot, not the Lead's lead/ branches, not lab PRs (a
# title naming LR-<id> or starting lab/tooling/tools/pipeline/cleanup) and not labelled paused yet.
# Dry run by default: prints "would label #<n> <title>" and labels nothing. --apply labels each one through gh.sh (the
# Lead's run only; lanes never label). The open-PR cap (factory-watch.py cap, lead-watch step 10e) counts paused PRs out.
#   bash product/tools/pause-label.sh [--apply]        Test: check-factory-watch.sh.
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; apply=0
case "${1:-}" in --apply) apply=1;; '') ;; *) echo "usage: pause-label.sh [--apply]" >&2; exit 2;; esac
list=$(python3 -I "$TOOLS/factory-watch.py" pause-list ${PAUSE_PULLS:+--pulls "$PAUSE_PULLS"}) || { echo "factory-watch.py pause-list failed" >&2; exit 2; }
grep -q '^ACT' <<<"$list" && { echo "$list" >&2; exit 2; }
n=0; bad=0
while read -r _ num title; do [ -n "${num:-}" ] || continue; n=$((n + 1))
  if [ "$apply" = 1 ]; then
    if bash "$TOOLS/gh.sh" api -X POST "repos/{owner}/{repo}/issues/${num#\#}/labels" -f "labels[]=paused" >/dev/null 2>&1; then echo "labelled $num $title"
    else echo "FAILED  $num $title"; bad=1; fi
  else echo "would label $num $title"; fi
done <<<"$list"
echo "product PRs to pause: $n$([ "$apply" = 1 ] || echo " (dry run: --apply labels them)")"; exit $bad
