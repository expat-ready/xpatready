#!/usr/bin/env bash
# Hooks fail closed (bundle A1, LR-046): every guard hook in .claude/settings.json runs as
#   bash product/tools/hook-fail-closed.sh <seconds> <guard in tools/> [args...]   (hook input on stdin)
# and ends only with the guard's own answer (exit 0 with one JSON object or nothing, or exit 2) or a block (exit 2, one
# line naming the guard and the fix). The rules and the docs behind them: hook-fail-closed.py, which does the work; this
# launcher turns a missing jq or python3, or any other ending of the runner, into a block. Keep 5 s (input) + <seconds>
# + 1 s (kill) under the hook's "timeout". Test: check-hook-fail-closed.sh.
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"
refuse() { echo "Blocked (hooks fail closed, LR-046): $1. Fix the hook: bash $TOOLS/hook-fail-closed.sh ${*:2}" >&2; exit 2; }
command -v jq >/dev/null 2>&1 || refuse "jq is missing, so the guards cannot read their input" "$@"
command -v python3 >/dev/null 2>&1 || refuse "python3 is missing, so the hook cannot run" "$@"
[ -f "$TOOLS/hook-fail-closed.py" ] || refuse "hook-fail-closed.py is missing" "$@"
python3 -I "$TOOLS/hook-fail-closed.py" "$TOOLS" "$@"; rc=$?
case "$rc" in 0|2) exit "$rc";; esac
refuse "hook-fail-closed.py ended with exit $rc" "$@"
