#!/usr/bin/env bash
# Which route a pull request or merge-queue batch takes through ci.yml (fast route, lab lane, 27 Nov; DECISIONS P-847:
# product work paused to finish the lab). Path-based checks, as GitHub documents them (path filters; a required check
# that reports success when its work is skipped): the one required check "ci" always ends green or red, and only the
# work behind it changes with the changed paths. Prints one word:
#   docs     records only: change-kind.sh says notes, or records-only.sh says yes (the one definition of a record:
#            under product/, not product/tools/, a .md, image, .txt or .html). The doc checks only (push guard,
#            Mergify scopes, check-docs.sh, decision-impact.sh, and graph.mjs --check when a graph input changed); no
#            type check, no app set-up, no suite.
#   tooling  every changed path is pipeline or tooling (TOOLING below: .github/, .githooks/, .mergify.yml, .claude/
#            (skills, agents, settings), AGENTS.md, CLAUDE.md, product/tools/) or a record, and change-kind.sh says
#            records, so no product suite depends on it. The push guard, Mergify scopes, the records rules, and
#            tooling-checks.sh (lint of each changed file, the tests that cover it, check-queue-rules.py for
#            .mergify.yml); no type check, no app set-up, no suite, in a PR or in a batch.
#   full     anything else, unchanged: product code (prototype/studio/ and everything select-suites.mjs finds it
#            depends on) and the tools that decide how the suites run (ci.yml, pr-suites.yml, run-suites.sh,
#            select-suites.mjs, cloud-setup.sh, change-kind.sh, ...: change-kind.sh says code) take today's route, the
#            24 parts on a merge-queue batch; other non-record files (qa/board.csv, screens/**/*.py) take today's
#            records route (job "fast" and the type check).
# A tool a product suite reads (check-docs.sh, named by check_pf8r_restore.ts) stays "full": the suite must run when
# the tool changes. Fails closed: change-kind.sh or records-only.sh failing is "full", never a lighter route.
# Usage: change-route.sh <base>..<head> | --files (paths on stdin) | --self-test
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
P=ai-workers/problem-1-pathway-setup-and-form-filling
T="${T:-$P/product/tools}"
# The same paths as .mergify.yml's queue "pipeline" (check-queue-rules.py compares them).
TOOLING="^(\.github/|\.githooks/|\.mergify\.yml$|\.claude/|AGENTS\.md$|CLAUDE\.md$|$P/product/tools/)"
RECORD_FILE="^$P/product/([^/]+/)*[^/]+\.(md|png|jpe?g|gif|webp|svg|txt|html)$"

route() {   # stdin: changed paths
  local f k r; f=$(grep . || true)
  [ -n "$f" ] || { echo full; return; }
  k=$(printf '%s\n' "$f" | bash "$T/change-kind.sh" --files) || { echo full; return; }
  case "$k" in
    notes) echo docs; return;;
    records) ;;
    *) echo full; return;;
  esac
  r=$(printf '%s\n' "$f" | bash "$T/records-only.sh" is-records --files) || { echo full; return; }
  [ "$r" = yes ] && { echo docs; return; }
  # Every path is tooling or a record (no product code, no other file), and at least one is tooling.
  if ! printf '%s\n' "$f" | grep -vE "$TOOLING" | grep -vE "$RECORD_FILE" | grep -q . && printf '%s\n' "$f" | grep -qE "$TOOLING"; then
    echo tooling
  else
    echo full
  fi
}

self_test() {
  local bad=0 S="$P/prototype/studio" R="$P/product"
  t() { local want="$1" what="$2"; shift 2; local got; got=$(printf '%s\n' "$@" | route)
    if [ "$got" = "$want" ]; then echo "PASS  $what → $want"; else echo "FAIL  $what (got $got, want $want)"; bad=1; fi; }
  t docs    "records only: STATE, DECISIONS, a screenshot" "$R/STATE.md" "$R/DECISIONS.md" "$R/qa/walks/x/shot.png"
  t docs    "a skill's text only (change-kind.sh: notes)" ".claude/skills/next/SKILL.md"
  t docs    "a screen's HTML board (a record, not .md)" "$R/screens/12/board.html"
  t tooling "a tool and its test" "$R/tools/merge-guard.sh" "$R/tools/check-merge-guard.sh"
  t tooling "a tool plus a record" "$R/tools/records-only.sh" "$R/STATE.md"
  t tooling "the merge queue file" ".mergify.yml"
  t tooling "a git hook and CLAUDE.md" ".githooks/pre-push" "CLAUDE.md"
  t full    "AGENTS.md (a product suite reads it: check_p2_launch.ts)" "AGENTS.md"
  t tooling "a workflow no suite reads" ".github/workflows/guards.yml"
  t tooling "an agent definition and settings" ".claude/agents/screen-reviewer.md" ".claude/settings.json"
  t full    "app code" "$S/api/src/core.ts"
  t full    "a tool plus app code" "$R/tools/merge-guard.sh" "$S/api/src/core.ts"
  t full    "ci.yml (decides how the suites run: every suite)" ".github/workflows/ci.yml"
  t full    "run-suites.sh (decides how the suites run)" "$R/tools/run-suites.sh"
  t full    "a tool a product suite reads (check-docs.sh)" "$R/tools/check-docs.sh"
  t full    "a JSON file under screens/ (not a record, not tooling)" "$R/screens/12/fixture.json"
  t full    "a checker under screens/ (not product/tools/)" "$R/screens/B119/check-queue-rules.py"
  t full    "a look-alike: tools/ under studio/" "$S/tools/gate-b.mjs"
  t full    "nothing changed" ""
  # Fails closed: change-kind.sh failing is "full".
  local d got; d=$(mktemp -d)
  printf '#!/usr/bin/env bash\nexit 2\n' > "$d/change-kind.sh"; cp "$T/records-only.sh" "$d/"
  got=$(printf '%s\n' "$R/tools/merge-guard.sh" | T="$d" route 2>/dev/null); rm -rf "$d"
  [ "$got" = full ] && echo "PASS  change-kind.sh failing → full" || { echo "FAIL  change-kind.sh failing gave $got"; bad=1; }
  # The tooling paths are the ones .mergify.yml's pipeline queue selects (one list, two readers).
  local m; m=$(grep -oE '^\s+- -files ~= \^\(\?!\(.*' .mergify.yml | head -1)
  for p in '\.github/' '\.githooks/' '\.mergify\.yml$' '\.claude/' 'AGENTS\.md$' 'CLAUDE\.md$' 'product/tools/'; do
    grep -qF -- "$p" <<< "$m" || { echo "FAIL  .mergify.yml's pipeline queue does not name $p"; bad=1; }
  done
  [ "$bad" = 0 ] && echo "PASS  .mergify.yml's pipeline queue names every tooling path"
  [ "$bad" = 0 ] && echo "all passed"; return $bad
}

case "${1:-}" in
  --files) route;;
  --self-test) self_test;;
  *..*) git -c core.quotePath=false diff --no-renames --name-only "${1%%..*}...${1##*..}" | route;;
  *) echo "usage: change-route.sh <base>..<head> | --files | --self-test" >&2; exit 2;;
esac
