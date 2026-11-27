#!/bin/bash
# ACT alarms at the Lead's turn end (B193 part 2 (d); P-388, P-389, P-619): the Lead's 30-minute check last ran over
# 40 min ago (lead-watch.sh's stamp), or the founder's board data is over 45 min old (newest `taken_at` in
# cockpit/history.jsonl, as sle-watch.py target B reads it). Stop hook in the Lead's copy (lane.sh whoami = lead): blocks
# the stop once with the ACT lines, then stays quiet for 30 min while the same stamp and board time stand (no nagging on
# every reply). Also run by hand:  lead-act-check.sh --status [repo root]   prints the ACT lines; exit = their number.
# Env (tests): LEAD_STAMP (default /private/tmp/claude-<uid>/lead-watch/last-check), BOARD_FILE, NOW (epoch seconds).
# Test: check-lead-act-check.sh.
CHECK_MIN=40; BOARD_MIN=45; REPEAT_MIN=30; P=ai-workers/problem-1-pathway-setup-and-form-filling
stamp="${LEAD_STAMP:-/private/tmp/claude-$(id -u)/lead-watch/last-check}"; now="${NOW:-$(date +%s)}"
ist() { TZ=Asia/Kolkata date -d "@$1" '+%d %b %H:%M IST' 2>/dev/null || TZ=Asia/Kolkata date -r "$1" '+%d %b %H:%M IST'; }
lines() {  # $1 repo root → the ACT lines, one per line; the alert key is the stamp and the board line
  local last board bt
  if [ -s "$stamp" ]; then last=$(cat "$stamp"); [ $(( (now - last) / 60 )) -gt "$CHECK_MIN" ] &&
    echo "ACT   the 30-minute check last ran $(( (now - last) / 60 )) min ago ($(ist "$last")): run lead-watch now; over ${CHECK_MIN} min means checks were missed, tell the founder (P-388, P-389)"
  else echo "ACT   no 30-minute check has run in this copy (no stamp at $stamp): set the check, prompt exactly \"run lead-watch; read STATE Start here\" (F-6Nov)"; fi
  board="${BOARD_FILE:-$1/$P/product/cockpit/history.jsonl}"
  bt=$(python3 -I -c 'import json,sys,datetime as d
best=None
for l in open(sys.argv[1], encoding="utf-8"):
    try: t=int(d.datetime.fromisoformat(json.loads(l)["taken_at"]).timestamp()); best=max(best or t, t)
    except Exception: pass
print(best or "")' "$board" 2>/dev/null)
  if [ -z "$bt" ]; then echo "ACT   the board has no data time ($board): rebuild and republish it (P-619)"
  elif [ $(( (now - bt) / 60 )) -gt "$BOARD_MIN" ]; then
    echo "ACT   the founder's board data is $(( (now - bt) / 60 )) min old (taken $(ist "$bt")): rebuild and republish the board (P-619, target ${BOARD_MIN} min)"; fi
}
if [ "${1:-}" = --status ]; then out=$(lines "${2:-$(git rev-parse --show-toplevel 2>/dev/null)}"); [ -n "$out" ] && echo "$out"; exit "$(printf '%s' "$out" | grep -c '^ACT')"; fi
input=$(cat); [ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null)" = true ] && exit 0
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
ROOT=$([ -n "$cwd" ] && git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0
[ "$(cd "$ROOT" && bash $P/product/tools/lane.sh whoami 2>/dev/null | sed "s/^lead-stale$/lead/")" = lead ] || exit 0
out=$(lines "$ROOT")
KEY="$( [ -s "$stamp" ] && cat "$stamp" || echo none)|$(printf '%s' "$out" | grep -o 'taken [^)]*' | head -1)"
[ -z "$out" ] && exit 0
mark="$(dirname "$stamp")/act-check.alerted"
if [ -s "$mark" ] && [ "$(sed -n 2p "$mark")" = "$KEY" ] && [ $(( (now - $(head -1 "$mark")) / 60 )) -lt "$REPEAT_MIN" ]; then exit 0; fi
mkdir -p "$(dirname "$mark")" 2>/dev/null && printf '%s\n%s\n' "$now" "$KEY" > "$mark"
jq -n --arg r "$out" '{decision:"block",reason:("Lead alarms (B193): act on these before you stop.\n" + $r)}'
