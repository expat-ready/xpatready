#!/usr/bin/env bash
# Away flag (P-388 as a hook; anti-stall review 17 Nov, "the prompt rule becomes a hook"; lab register LR-105). While the
# founder is away, a question that waits for a person stalls the session: on 6-7 Nov the Lead waited about 7.4 h on one
# prompt and no check fired. The Lead sets the flag when the founder says they are away and removes it on return:
#   touch "${AWAY_FLAG:-/tmp/claude-$(id -u)/away}"      (rm the same path on return)
#   away-guard.sh --hook   PreToolUse hook on AskUserQuestion: denied while the flag exists, so the turn goes on: the
#                          question becomes a card in STATE (P-530) and the work continues on the recommended option.
# No flag: nothing happens. US$0, no network. Env: AWAY_FLAG. Test: check-g4-rules.sh (8).
set -u
[ "${1:-}" = --hook ] || { echo "usage: away-guard.sh --hook (reads the PreToolUse event on stdin)" >&2; exit 2; }
cat >/dev/null
flag="${AWAY_FLAG:-/tmp/claude-$(id -u)/away}"
[ -e "$flag" ] || exit 0
jq -n --arg r "The founder is away (flag $flag), so this question would wait with no one to answer it (P-388). Write it as a card at the top of STATE (P-530), go on with your recommended option, and remove the flag when the founder is back." \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
