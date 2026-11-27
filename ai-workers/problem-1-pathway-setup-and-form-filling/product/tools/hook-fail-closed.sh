#!/usr/bin/env bash
# Hooks fail closed (bundle A1, LR-046, LR-060; lab triage 27 Nov §3). Every guard hook in .claude/settings.json runs
# through this wrapper:
#   bash product/tools/hook-fail-closed.sh <seconds> <guard script in tools/> [args...]   (hook input on stdin)
# The guard's own answer passes through (exit 0 with its JSON, or exit 2). Anything else blocks, with exit 2 and the
# reason on stderr:
#   * the input cannot be read (none within 5 s, empty, not a JSON object) or jq is missing;
#   * the guard is missing, exits with any code other than 0 or 2, or prints output that is not JSON;
#   * the guard runs longer than <seconds> (keep it under the hook's "timeout" in settings.json, so this fires first).
# Why a wrapper (docs code.claude.com/docs/en/hooks, read 28 Nov 2026): "Exit code 1 without valid JSON output is a
# non-blocking error"; "a timed-out command ... hook doesn't block the tool call, except for hooks whose failure blocks
# the action" (onFailure: "block", v2.1.295 or later), and onFailure has no effect on Stop hooks. Exit 2 blocks on every
# version and event: PreToolUse "Blocks the tool call"; Stop "Prevents Claude from stopping". A Stop hook that keeps
# failing is ended by Claude Code's cap of 8 consecutive continuations. Test: check-hook-fail-closed.sh.
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"
refuse() { echo "Blocked (hooks fail closed, LR-046): $1. Fix the hook: bash $TOOLS/hook-fail-closed.sh $LIMIT ${GUARD:-<none>}" >&2; exit 2; }
LIMIT=${1:-}; GUARD=${2:-}
case "$LIMIT" in ''|*[!0-9]*) LIMIT=?; refuse "the wrapper needs <seconds> <guard>, got '${1:-}'";; esac
[ -n "$GUARD" ] || refuse "no guard named"
shift 2
case "$GUARD" in */*|..*) refuse "guard '$GUARD' must be a file name in $TOOLS";; esac
command -v jq >/dev/null 2>&1 || refuse "jq is missing, so the input cannot be read"
input=""; IFS= read -r -d '' -t 5 input; rc=$?
[ "$rc" -gt 128 ] && refuse "no hook input within 5 s"
printf '%s' "$input" | jq -s -e 'length == 1 and (.[0] | type) == "object"' >/dev/null 2>&1 || refuse "the hook input is empty or not one JSON object"
[ -f "$TOOLS/$GUARD" ] || refuse "guard $GUARD is missing"
case "$GUARD" in *.py) run=(python3 -I "$TOOLS/$GUARD");; *) run=(bash "$TOOLS/$GUARD");; esac
T=$(mktemp -d "${TMPDIR:-/tmp}/hook-fc.XXXXXXXX") || refuse "no temporary folder"
trap 'rm -rf "$T"' EXIT
printf '%s' "$input" > "$T/in"
set -m   # the guard gets its own process group, so a timeout stops its children too
"${run[@]}" "$@" <"$T/in" >"$T/out" 2>"$T/err" & pid=$!
( sleep "$LIMIT"; touch "$T/late"; kill -TERM -- "-$pid"; sleep 1; kill -KILL -- "-$pid" ) >/dev/null 2>&1 & dog=$!
set +m
wait "$pid"; rc=$?; kill -KILL -- "-$pid" 2>/dev/null   # a child left behind writes nothing after the answer is read
kill -- "-$dog" 2>/dev/null; wait "$dog" 2>/dev/null
err=$(head -c 600 "$T/err" | tr '\n' ' ')
[ -e "$T/late" ] && refuse "guard $GUARD ran over ${LIMIT} s"
case "$rc" in
  0) if [ -s "$T/out" ] && ! jq -s -e 'length == 1 and (.[0] | type) == "object"' "$T/out" >/dev/null 2>&1; then refuse "guard $GUARD printed output that is not one JSON object: $(head -c 200 "$T/out" | tr '\n' ' ')"; fi
     cat "$T/out"; cat "$T/err" >&2; exit 0;;
  2) cat "$T/out"; cat "$T/err" >&2; exit 2;;
  *) refuse "guard $GUARD failed with exit $rc${err:+: $err}";;
esac
