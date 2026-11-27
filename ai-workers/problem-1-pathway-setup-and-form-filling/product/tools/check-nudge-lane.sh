#!/usr/bin/env bash
# Test of nudge-lane.sh (LR-146) with a stand-in `claude` CLI: ok, archived, CLI error, once an hour, URL input, logging.
# No network, US$0.   bash product/tools/check-nudge-lane.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/nudge.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
cat > "$T/claude" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$CL_LOG"
id=""; while [ $# -gt 0 ]; do [ "$1" = --cloud ] && id=$2; shift; done
case "$id" in
  session_ARCH*) printf '{"ok":false,"session_id":"%s","error":"cloud session %s is archived and cannot accept new messages"}\n' "$id" "$id";;
  session_BAD*) echo "Error: not logged in. Run claude auth login" >&2; exit 1;;
  session_WARN*) echo "Ignoring 2 permissions.allow entries: this workspace has not been trusted." >&2
    printf '{"ok":false,"session_id":"%s","error":"Session expired. Please run /login to sign in again."}\n' "$id"
    echo "Error: failed to send message to cloud session $id" >&2; exit 1;;
  *) printf '{"ok":true,"session_id":"%s","url":"https://claude.ai/code/%s"}\n' "$id" "$id";;
esac
EOF
chmod +x "$T/claude"
export CLAUDE_BIN="$T/claude" NUDGE_LOG="$T/nudges.tsv" CL_LOG="$T/cl.log" NOW=1800000000
N="$TOOLS/nudge-lane.sh"
out=$(bash "$N" session_01Idle "wake up"); r=$?
ok "an idle lane: ok, exit 0, the URL printed and logged" "$([ $r = 0 ] && grep -q '^nudge  session_01Idle ok https://claude.ai/code/session_01Idle' <<< "$out" && grep -qP '^1800000000\tsession_01Idle\tok\t' "$NUDGE_LOG" && echo 1)" "exit $r: $out"
ok "... sent as claude -p <msg> --cloud <id> --output-format json" "$(grep -qx -- '-p wake up --cloud session_01Idle --output-format json' "$CL_LOG" && echo 1)" "$(cat "$CL_LOG")"
out=$(NOW=$((NOW + 1200)) bash "$N" session_01Idle); r=$?
ok "the same lane 20 min later: skipped, nothing sent (once an hour)" "$([ $r = 0 ] && grep -q 'skipped: nudged 20 min ago' <<< "$out" && [ "$(wc -l < "$CL_LOG")" = 1 ] && echo 1)" "$out"
out=$(NOW=$((NOW + 3700)) bash "$N" "https://claude.ai/code/session_01Idle"); r=$?
ok "61 min later, given as a claude.ai/code URL: sent again" "$([ $r = 0 ] && grep -q ' ok ' <<< "$out" && [ "$(wc -l < "$CL_LOG")" = 2 ] && echo 1)" "$out"
out=$(bash "$N" session_ARCH1); r=$?
ok "an archived lane: error naming it, exit 1, logged" "$([ $r = 1 ] && grep -q 'error cloud session session_ARCH1 is archived' <<< "$out" && grep -qP '\tsession_ARCH1\terror\t' "$NUDGE_LOG" && echo 1)" "exit $r: $out"
out=$(bash "$N" session_BAD1); r=$?
ok "the CLI failing (not signed in): error with its words, exit 1" "$([ $r = 1 ] && grep -q 'error exit 1: Error: not logged in' <<< "$out" && echo 1)" "exit $r: $out"
out=$(bash "$N" session_ARCH1); r=$?
ok "a failed send is not counted as a nudge: the next check tries again" "$([ $r = 1 ] && ! grep -q skipped <<< "$out" && echo 1)" "$out"
out=$(bash "$N" 'x; touch /tmp/pwn2' 2>&1); r=$?
ok "no session id: usage, exit 2, nothing sent or run" "$([ $r = 2 ] && [ ! -e /tmp/pwn2 ] && echo 1)" "exit $r: $out"
out=$(bash "$N" session_WARN1 2>&1); r=$?
ok "a warning line before the CLI's JSON: the JSON's own error is reported (live, 27 Nov: an expired sign-in)" "$([ $r = 1 ] && grep -q 'error Session expired. Please run /login' <<< "$out" && echo 1)" "exit $r: $out"
grep -q 'nudge-lane.sh' "$TOOLS/lead-watch.sh"; ok "lead-watch.sh nudges the idle lanes it flags" "$([ $? = 0 ] && echo 1)"
finish
