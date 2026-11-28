#!/usr/bin/env bash
# Runs test_gh_graphql.py (LR-098: lead-watch's GitHub reads through a few GraphQL queries, REST when GraphQL fails)
# and gives its result the guard tests' one-line form. No network, US$0.   bash product/tools/check-gh-graphql.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
out=$(python3 -I "$TOOLS/test_gh_graphql.py" 2>&1); r=$?
ok "test_gh_graphql.py: GraphQL bundle, REST shape, batches, failures, sle-watch, proof-read-watch and flow-measure --lead on both paths" "$([ $r = 0 ] && grep -q '^OK' <<< "$out" && echo 1)" "$(tail -15 <<< "$out")"
finish
