#!/usr/bin/env bash
# Test of lane-death.sh (LR-147): a simulated StopFailure writes the log line and comments on the branch's open PR; the
# read mode turns it into an ACT for lead-watch. GitHub is a stand-in gh; no network, US$0.
#   bash product/tools/check-lane-death.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/ldeath.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"; cat > "$T/bin/gh" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$GH_LOG"
case "$*" in
  *"-X POST"*comments*) echo '{}';;
  *"pulls?state=open&head=o:claude/lane-x"*) echo 42;;
  *"pulls?state=open"*) ;;
  *search/issues*) [ -n "${GH_FAIL:-}" ] && exit 1; [ -n "${GH_HIT:-}" ] && printf '77\tqa: after-merge 27 Nov\n'; true;;
  *) exit 1;;
esac
EOF
chmod +x "$T/bin/gh"
git init -q -b claude/lane-x "$T/lane"
export LANE_DEATH_LOG="$T/deaths.tsv" REPO=o/r GH_LOG="$T/gh.log" NOW=1800000000 PATH="$T/bin:$PATH"
H="$TOOLS/lane-death.sh"
fire() { jq -n --arg d "$1" --arg e "$2" '{session_id:"session_01AbC", transcript_path:"/x.jsonl", cwd:$d, hook_event_name:"StopFailure",
  error:$e, error_details:"429 Too Many Requests", last_assistant_message:"API Error: Rate limit reached"}' | bash "$H"; r=$?; }
: > "$GH_LOG"; fire "$T/lane" rate_limit
ok "a simulated StopFailure (rate_limit) exits 0 and writes time, session, error, branch, details" "$([ $r = 0 ] && grep -qP '^1800000000\tsession_01AbC\trate_limit\tclaude/lane-x\t429 Too Many Requests$' "$LANE_DEATH_LOG" && echo 1)" "exit $r: $(cat "$LANE_DEATH_LOG")"
ok "... and comments on the branch's open PR with the marker" "$(grep -q 'repos/o/r/issues/42/comments' "$GH_LOG" && grep -q 'Lane stopped (StopFailure):' "$GH_LOG" && grep -q 'rate_limit' "$GH_LOG" && echo 1)" "$(cat "$GH_LOG")"
: > "$GH_LOG"; git init -q -b claude/no-pr "$T/nopr"; fire "$T/nopr" authentication_failed
ok "a branch with no open PR: logged, no comment" "$([ $r = 0 ] && grep -q 'authentication_failed' "$LANE_DEATH_LOG" && ! grep -q 'POST' "$GH_LOG" && echo 1)" "$(cat "$GH_LOG")"
: > "$GH_LOG"; printf '{"session_id":"s$(touch /tmp/pwn)","error":"billing_error`id`","cwd":"%s"}' "$T/lane" | bash "$H"; r=$?
ok "odd characters in the input are stripped, never run" "$([ $r = 0 ] && [ ! -e /tmp/pwn ] && tail -1 "$LANE_DEATH_LOG" | grep -qP '\tbilling_errorid\t' && echo 1)" "$(tail -1 "$LANE_DEATH_LOG")"
echo 'not json' | bash "$H"; r=$?; ok "unreadable input: exit 0, logged as unknown (the hook never fails the session)" "$([ $r = 0 ] && tail -1 "$LANE_DEATH_LOG" | grep -qP '\tunknown\t' && echo 1)" "exit $r"
out=$(NOW=$((NOW + 600)) bash "$H" read 30); ok "read: each death in the window is one ACT naming session and error" "$(grep -c '^ACT   lane death: session' <<< "$out" | grep -qx 4 && grep -q 'stopped on rate_limit' <<< "$out" && echo 1)" "$out"
out=$(NOW=$((NOW + 7200)) bash "$H" read 30); ok "read: deaths older than the window are not repeated" "$(! grep -q '^ACT' <<< "$out" && grep -q 'lane deaths: 0' <<< "$out" && echo 1)" "$out"
out=$(GH_HIT=1 NOW=$((NOW + 7200)) bash "$H" read 30); ok "read: a cloud lane's marker comment found on GitHub is an ACT naming the PR" "$(grep -q '^ACT   lane death: PR #77' <<< "$out" && echo 1)" "$out"
out=$(GH_FAIL=1 NOW=$((NOW + 7200)) bash "$H" read 30); ok "read: a failed search is an ACT, never a silent none" "$(grep -q '^ACT   lane death: the GitHub search' <<< "$out" && echo 1)" "$out"
S="$TOOLS/../../../../.claude/settings.json"
jq -e '[.hooks.StopFailure[]?.hooks[]?.command | select(test("lane-death.sh"))] | length == 1' "$S" >/dev/null; ok "settings.json runs lane-death.sh on StopFailure" "$([ $? = 0 ] && echo 1)"
grep -q 'lane-death.sh" read' "$TOOLS/lead-watch.sh"; ok "lead-watch.sh reads the deaths each check" "$([ $? = 0 ] && echo 1)"
finish
