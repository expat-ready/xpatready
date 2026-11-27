#!/usr/bin/env bash
# LR-146 (docs gap research row 3, 27 Nov): wake an idle cloud lane by script, not by typing in the claude.ai prompt box.
# Docs, code.claude.com/docs/en/claude-code-on-the-web, "Send follow-ups from the CLI", read 27 Nov 2026:
#   claude -p "your message" --cloud <session-id>   "The CLI queues the message into the session and exits without
#   waiting for a reply"; with --output-format json: {ok, session_id, url}, or {ok: false, session_id, error} "when the
#   send fails, for example when the session is missing or archived". Needs `claude auth login` (an Anthropic account).
# Usage: bash product/tools/nudge-lane.sh <session id or claude.ai/code URL> [message]
#   prints "nudge  <id> ok <url>" (exit 0), "nudge  <id> skipped: ..." (exit 0, nudged under NUDGE_MIN (60) min ago, so a
#   lane is never flooded), or "nudge  <id> error <why>" (exit 1). Every send is logged to NUDGE_LOG
#   (default ~/.claude/xr-nudges.tsv: time, id, ok|error, detail). lead-watch.sh step 10a calls it for each idle lane.
# Env: CLAUDE_BIN (default claude), NUDGE_LOG, NUDGE_MIN, NOW (epoch, tests). Test: check-nudge-lane.sh.
set -u
LOG="${NUDGE_LOG:-$HOME/.claude/xr-nudges.tsv}"; now=${NOW:-$(date +%s)}; min=${NUDGE_MIN:-60}
id=$(printf '%s' "${1:-}" | grep -oE '(session|cse)_[A-Za-z0-9]+' | head -1)
[ -n "$id" ] || { echo "nudge  usage: nudge-lane.sh <session id or claude.ai/code URL> [message]" >&2; exit 2; }
msg=${2:-"Lead check (automatic nudge, LR-146): you look idle with work left. Continue your row: push your next step, or post a \"Question for the tech lead\" comment on your PR saying what blocks you."}
last=$([ -s "$LOG" ] && awk -F'\t' -v i="$id" '$2 == i && $3 == "ok" {t = $1} END {print t + 0}' "$LOG" || echo 0)
if [ "${last:-0}" -gt 0 ] && [ $(( (now - last) / 60 )) -lt "$min" ]; then
  echo "nudge  $id skipped: nudged $(( (now - last) / 60 )) min ago (once per $min min)"; exit 0; fi
out=$(timeout 90 "${CLAUDE_BIN:-claude}" -p "$msg" --cloud "$id" --output-format json 2>&1); rc=$?
# The CLI may print warnings (an untrusted workspace's settings) around its JSON: read the JSON line itself.
j=$(printf '%s\n' "$out" | grep -m1 '^{' ); [ -n "$j" ] && out=$j
ok=$(printf '%s' "$out" | jq -r 'if type == "object" then (.ok | tostring) else "" end' 2>/dev/null)
if [ "$ok" = true ]; then det=$(printf '%s' "$out" | jq -r '.url // ""'); st=ok
else det=$(printf '%s' "$out" | jq -r '.error // empty' 2>/dev/null); [ -n "$det" ] || det="exit $rc: $(printf '%s' "$out" | tr '\n\t' '  ' | cut -c1-160)"; st=error; fi
mkdir -p "$(dirname "$LOG")" 2>/dev/null; printf '%s\t%s\t%s\t%s\n' "$now" "$id" "$st" "$det" >> "$LOG"
echo "nudge  $id $st $det"; [ "$st" = ok ]
