#!/usr/bin/env bash
# The checks of the "tooling" route (change-route.sh; fast route, lab lane, 27 Nov): for a change whose every path is
# pipeline or tooling (or a record), ci.yml's job "fast" runs this beside the tools' read-only list, instead of the
# app set-up (database, build) and the type check (review of #3908: the list's checks read tool and workflow files). For each changed file that still exists:
#   lint   .sh: bash -n · .py: parses (ast) · .mjs/.js/.cjs: node --check · .yml/.yaml: YAML loads · .json: JSON loads
#   tests  the tests that cover it, by the folder's naming: product/tools/X.sh is covered by check-X.sh, test-X.sh and
#          test_X.py beside it (when they exist); a changed check-*, test-* or test_* file runs itself; a changed script
#          that handles --self-test runs it; .mergify.yml runs product/screens/B119/check-queue-rules.py.
# The guard tests by path (guards.yml, lead-tools-tests.yml) still run beside it as before (check-guards.sh only there); the nightly runs everything
# on main. Exit 0: every lint and test passed (or none applied). Exit 1: one failed (each failure is named).
# Usage: tooling-checks.sh <base>..<head> | --files (paths on stdin) | --self-test
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
P=ai-workers/problem-1-pathway-setup-and-form-filling
TOOLS="$P/product/tools"
TIMEOUT="${TOOLING_TEST_TIMEOUT:-600}"

lint() {   # one file → 0 clean, 1 not
  case "$1" in
    *.sh) bash -n "$1";;
    *.py) python3 -I -c 'import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read(), sys.argv[1])' "$1";;
    *.mjs|*.js|*.cjs) node --check "$1";;
    *.yml|*.yaml) python3 -I -c 'import sys,yaml; yaml.safe_load(open(sys.argv[1], encoding="utf-8"))' "$1";;
    *.json) python3 -I -c 'import json,sys; json.load(open(sys.argv[1], encoding="utf-8"))' "$1";;
    *) return 0;;
  esac
}

self_tests() {   # a script that handles --self-test itself (a case arm or an argument test), not one that only calls another's
  grep -qE -- '(^|[[:space:]|"'"'"'(])--self-test\)|== *"--self-test"|"--self-test" *==|includes\("--self-test"\)|"--self-test" in sys\.argv' "$1"
}

plan() {   # stdin: changed paths → "<lint|test|selftest> <file>" lines, each once
  local f b s d
  while IFS= read -r f; do
    [ -n "$f" ] && [ -f "$f" ] || continue
    case "$f" in *.sh|*.py|*.mjs|*.js|*.cjs|*.yml|*.yaml|*.json) echo "lint $f";; esac
    [ "$f" = .mergify.yml ] && echo "test $P/product/screens/B119/check-queue-rules.py"
    case "$f" in "$TOOLS"/*) ;; *) continue;; esac
    d=$(dirname "$f"); b=$(basename "$f"); s="${b%.*}"
    case "$b" in
      # check-guards.sh is the whole guard suite (80+ tests and the mutation rows): guards.yml runs it, in parts, on a
      # runner with zsh. Running it here again duplicated that run and failed on tests no change touched (#3918, #3920,
      # #3923, 27 Nov: check-capacity-watch.sh's unreadable-repository case on the fast runner).
      check-guards.sh) continue;;
      check-*.sh|test-*.sh|test_*.py) echo "test $f"; continue;;
    esac
    for c in "$d/check-$s.sh" "$d/test-$s.sh" "$d/test_${s//-/_}.py"; do [ -f "$c" ] && echo "test $c"; done
    case "$b" in *.sh|*.py|*.mjs) self_tests "$f" && echo "selftest $f";; esac
  done | awk '!seen[$0]++'
}

run() {   # "<kind> <file>" → runs it; prints PASS or FAIL
  local k="$1" f="$2" out st
  case "$k" in
    lint) out=$(lint "$f" 2>&1); st=$?;;
    test) case "$f" in *.py) out=$(timeout "$TIMEOUT" python3 -I "$f" 2>&1);; *) out=$(timeout "$TIMEOUT" bash "$f" 2>&1);; esac; st=$?;;
    selftest) case "$f" in *.py) out=$(timeout "$TIMEOUT" python3 -I "$f" --self-test 2>&1);; *.mjs) out=$(timeout "$TIMEOUT" node "$f" --self-test 2>&1);; *) out=$(timeout "$TIMEOUT" bash "$f" --self-test 2>&1);; esac; st=$?;;
  esac
  if [ "$st" = 0 ]; then echo "PASS  $k $f"; else echo "FAIL  $k $f (exit $st)"; printf '%s\n' "$out" | tail -20 | sed 's/^/      /'; return 1; fi
}

main() {   # stdin: changed paths
  local lines bad=0 n=0 k f
  lines=$(plan)
  if [ -z "$lines" ]; then echo "tooling checks: nothing to lint or test for these files"; return 0; fi
  while read -r k f; do n=$((n+1)); run "$k" "$f" || bad=$((bad+1)); done <<< "$lines"
  echo "tooling checks: $n run, $bad failed"
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "**Tooling route:** $n lint and test runs for the changed tool files, $bad failed (tooling-checks.sh)." >> "$GITHUB_STEP_SUMMARY"
  [ "$bad" = 0 ]
}

self_test() {
  local bad=0 d got
  ok() { if [ -n "$2" ]; then echo "PASS  $1"; else echo "FAIL  $1: $3"; bad=1; fi; }
  got=$(printf '%s\n' "$TOOLS/merge-guard.sh" | plan)
  ok "a tool: lint and its check-<name>.sh" "$(grep -qx "lint $TOOLS/merge-guard.sh" <<< "$got" && grep -qx "test $TOOLS/check-merge-guard.sh" <<< "$got" && echo 1)" "$got"
  got=$(printf '%s\n' "$TOOLS/records-only.sh" | plan)
  ok "a tool with --self-test: runs it" "$(grep -qx "selftest $TOOLS/records-only.sh" <<< "$got" && echo 1)" "$got"
  got=$(printf '%s\n' "$TOOLS/check-merge-guard.sh" | plan)
  ok "a changed test runs itself, never as a --self-test" "$(grep -qx "test $TOOLS/check-merge-guard.sh" <<< "$got" && ! grep -q '^selftest' <<< "$got" && echo 1)" "$got"
  got=$(printf '%s\n' "$TOOLS/check-guards.sh" | plan)
  ok "check-guards.sh (the whole guard suite) is guards.yml's, never re-run here: lint only" "$([ "$got" = "lint $TOOLS/check-guards.sh" ] && echo 1)" "$got"
  got=$(printf '%s\n' .mergify.yml | plan)
  ok ".mergify.yml: YAML loads and check-queue-rules.py" "$(grep -qx "lint .mergify.yml" <<< "$got" && grep -qx "test $P/product/screens/B119/check-queue-rules.py" <<< "$got" && echo 1)" "$got"
  got=$(printf '%s\n' "$P/product/STATE.md" "$TOOLS/no-such-file.sh" | plan)
  ok "a record and a deleted file: nothing to run" "$([ -z "$got" ] && echo 1)" "$got"
  got=$(printf '%s\n' "$TOOLS/merge-guard.sh" "$TOOLS/merge-guard.sh" | plan | grep -c "check-merge-guard")
  ok "each run once" "$([ "$got" = 1 ] && echo 1)" "$got"
  # Lint fails on a broken file of each kind, and main() fails when one run fails.
  d=$(mktemp -d)
  printf 'if then\n' > "$d/x.sh"; printf 'def (:\n' > "$d/x.py"; printf 'const = ;\n' > "$d/x.mjs"; printf 'a: [\n' > "$d/x.yml"; printf '{\n' > "$d/x.json"
  for x in sh py mjs yml json; do ok "lint refuses a broken .$x" "$(lint "$d/x.$x" >/dev/null 2>&1 || echo 1)" "passed"; done
  printf 'echo fine\n' > "$d/y.sh"; ok "lint passes a sound .sh" "$(lint "$d/y.sh" && echo 1)" "failed"
  ok "a failing run is FAIL and non-zero" "$(run lint "$d/x.sh" >/dev/null 2>&1 || echo 1)" "passed"
  rm -rf "$d"
  [ "$bad" = 0 ] && echo "all passed"; return $bad
}

case "${1:-}" in
  --files) main;;
  --self-test) self_test;;
  *..*) git -c core.quotePath=false diff --no-renames --diff-filter=d --name-only "${1%%..*}...${1##*..}" | main;;
  *) echo "usage: tooling-checks.sh <base>..<head> | --files | --self-test" >&2; exit 2;;
esac
