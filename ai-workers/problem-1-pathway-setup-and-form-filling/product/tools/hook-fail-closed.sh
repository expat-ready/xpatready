#!/usr/bin/env bash
# Hooks fail closed (bundle A1, LR-046, LR-060; lab triage 27 Nov §3). Every guard hook in .claude/settings.json runs
# through this wrapper:
#   bash product/tools/hook-fail-closed.sh <seconds> <guard script in tools/> [args...]   (hook input on stdin)
# The guard's own answer passes through (exit 0 with its one JSON object or nothing, or exit 2). Anything else blocks,
# with exit 2 and the reason on stderr:
#   * the input cannot be read (stdin closed, not all there within 5 s, empty, not one JSON object), or jq or python3
#     is missing;
#   * the guard is missing, exits with any code other than 0 or 2, is killed, or prints output that is not one JSON object;
#   * the guard runs longer than <seconds>. Keep 5 s (input) + <seconds> + 1 s (kill) under the hook's "timeout" in
#     settings.json, so this fires first.
# The work is done by hook-fail-closed.py (select, subprocess, process groups: no shell watchdogs, whose traps raced in
# round 2 of #3971); this launcher turns any other ending of it into a block.
# Why a wrapper (docs code.claude.com/docs/en/hooks, read 28 Nov 2026): "Exit code 1 without valid JSON output is a
# non-blocking error"; "a timed-out command ... hook doesn't block the tool call, except for hooks whose failure blocks
# the action" (onFailure: "block", v2.1.295 or later), and onFailure has no effect on Stop hooks. Exit 2 blocks on every
# version and event: PreToolUse "Blocks the tool call"; Stop "Prevents Claude from stopping". A Stop hook that keeps
# failing is ended by Claude Code's cap of 8 consecutive continuations. Test: check-hook-fail-closed.sh.
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"
refuse() { echo "Blocked (hooks fail closed, LR-046): $1. Fix the hook: bash $TOOLS/hook-fail-closed.sh ${*:2}" >&2; exit 2; }
command -v jq >/dev/null 2>&1 || refuse "jq is missing, so the guards cannot read their input" "$@"
command -v python3 >/dev/null 2>&1 || refuse "python3 is missing, so the hook cannot run" "$@"
[ -f "$TOOLS/hook-fail-closed.py" ] || refuse "hook-fail-closed.py is missing" "$@"
python3 -I "$TOOLS/hook-fail-closed.py" "$TOOLS" "$@"; rc=$?
case "$rc" in 0|2) exit "$rc";; esac
refuse "hook-fail-closed.py ended with exit $rc" "$@"
