#!/bin/bash
# PreToolUse hook on CronCreate (founder, 6 Nov ~03:00 IST): the tech lead's 30-minute check prompt is not stale. On 6 Nov
# the check's prompt listed rows already done, and every check went after them. The prompt is exactly
#   run lead-watch; read STATE Start here
# (case, spacing and a final full stop aside); what to watch lives in STATE "Start here", read fresh each time. Refused:
# a prompt naming lead-watch, anywhere, that is not that line; and in the Lead's copy (lane.sh whoami = lead) any recurring
# prompt that is not that line (the Lead's one recurring job is its check). One-shot reminders pass. Test: check-lead-cron.sh.
# Also allowed (founder, 7 Nov, P-389): the first standby's watchdog line, exactly HEARTBEAT below. The standby shares the
# Lead's copy (lane.sh whoami = lead), so the line is allowed there too; a Lead running it on itself only watches itself.
# Stop hook too (B197 (4), founder A110, 16 Nov: "I requested multiple times ... lead keep forgetting"): in the Lead's copy a
# check turn (its prompt is that one line) cannot end while the app view (app-view-check.sh --stale-only: missing or over
# 15 min old, P-798) is stale; it asks again on every stop until the view is saved (a page that cannot be read is saved as its
# UNREADABLE line). Other turns, and other copies, stop freely. Test: check-app-view.sh.
# LR-154 (founder A430, 27 Nov): and with a saved app view that says UNREADABLE (signed out), not without a
# PushNotification to the founder in the same turn. This Stop mode is registered in .claude/settings.json (it was not until
# 27 Nov, so B197's rule never ran). Test: check-lane-read.sh.
CANON="run lead-watch; read STATE Start here"
HEARTBEAT="run lead-heartbeat; notify the founder if stale"
GAP="run lead-watch gap"   # ENF-761 part 4: every standby's 10-min watchdog (lead-watch.sh gap; skill lead, hand-over)
input=$(cat)
norm() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -s '[:space:]' ' ' | sed -E 's/^ +//; s/[ .]+$//'; }
if [ "$(printf '%s' "$input" | jq -r '.hook_event_name // empty' 2>/dev/null)" = Stop ]; then
  cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null); tp=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
  ROOT=$([ -n "$cwd" ] && git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0
  [ "$(cd "$ROOT" && bash ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/lane.sh whoami 2>/dev/null)" = lead ] || exit 0
  # The turn's prompt: the newest user text in the transcript that is not a tool result, a meta line, a hook's feedback or
  # a background task's notification (one arriving mid-check must not end the check unread: review on #1925).
  turn=$([ -f "$tp" ] && python3 -I -c 'import json,sys
last=""
for l in open(sys.argv[1], encoding="utf-8"):
    try: e=json.loads(l)
    except Exception: continue
    if e.get("type")!="user" or e.get("isMeta"): continue
    c=(e.get("message") or {}).get("content")
    t=c if isinstance(c,str) else " ".join(x.get("text","") for x in (c or []) if isinstance(x,dict) and x.get("type")=="text")
    t=t.strip()
    if t and not t.startswith(("Stop hook feedback","<system-reminder>","<task-notification","[SYSTEM NOTIFICATION")): last=t
print(last)' "$tp" 2>/dev/null)
  case "$(norm "$turn")" in *"$(norm "$CANON")"*) ;; *) exit 0;; esac
  out=$(bash "$(dirname "$0")/app-view-check.sh" --stale-only 2>&1)
  if [ -n "$out" ]; then
    jq -n --arg r "$out" '{decision:"block",reason:("This is a 30-minute check and the app view is stale (B197, founder A110): read every lane before you stop.\n" + $r + "\nIf the page cannot be read, save its UNREADABLE line and ask the founder to sign in.")}'
    exit 0; fi
  # LR-154 (founder A430, 27 Nov: "You should be reminding me if you're not able to manage these"): a saved app view that
  # says UNREADABLE (signed out, the call refused, the browser not reached) needs a PushNotification to the founder in this
  # same turn, with the sign-in URL. The turn's tool calls are read from the transcript after the turn's prompt.
  av="${APP_VIEW_FILE:-$(dirname "$0")/../state/app-view-latest.txt}"
  sed -n 2p "$av" 2>/dev/null | grep -q '^UNREADABLE' || exit 0
  pushed=$(python3 -I - "$tp" <<'PY' 2>/dev/null
import json, re, sys
ev = []
for l in open(sys.argv[1], encoding="utf-8"):
    try: ev.append(json.loads(l))
    except Exception: pass
def utext(e):
    c = (e.get("message") or {}).get("content")
    return (c if isinstance(c, str) else " ".join(x.get("text", "") for x in (c or []) if isinstance(x, dict) and x.get("type") == "text")).strip()
start = 0
for i, e in enumerate(ev):
    if e.get("type") == "user" and not e.get("isMeta"):
        t = utext(e)
        if t and not t.startswith(("Stop hook feedback", "<system-reminder>", "<task-notification", "[SYSTEM NOTIFICATION")): start = i
print("yes" if any(isinstance(x, dict) and x.get("type") == "tool_use" and re.search(r"(^|__)PushNotification$", x.get("name", ""))
                   for e in ev[start + 1:] if e.get("type") == "assistant" for x in (e.get("message") or {}).get("content") or []) else "no")
PY
)
  [ "$pushed" = yes ] && exit 0
  jq -n --arg l "$(sed -n 2p "$av" | cut -c1-160)" '{decision:"block",reason:("The app view says \"" + $l + "\": send the founder a PushNotification 🔴 in this check with the sign-in URL (https://claude.ai/login; GitHub: https://github.com/login), then stop (LR-154, founder A430: \"You should be reminding me\").")}'
  exit 0
fi
prompt=$(printf '%s' "$input" | jq -r '.tool_input.prompt // empty' 2>/dev/null)
recurring=$(printf '%s' "$input" | jq -r 'if .tool_input.recurring == false then "no" else "yes" end' 2>/dev/null)
[ "$(norm "$prompt")" = "$(norm "$CANON")" ] && exit 0
[ "$(norm "$prompt")" = "$(norm "$HEARTBEAT")" ] && exit 0
[ "$(norm "$prompt")" = "$(norm "$GAP")" ] && exit 0
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
ROOT=$([ -n "$cwd" ] && git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)
LANE=$([ -n "$ROOT" ] && cd "$ROOT" && bash ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/lane.sh whoami 2>/dev/null)
why=""
printf '%s' "$prompt" | grep -qi 'lead-watch' && why="it names lead-watch but is not the check's one line"
[ -z "$why" ] && [ "$LANE" = lead ] && [ "$recurring" = yes ] && why="it is a recurring job in the Lead's copy, whose only recurring job is the check"
[ -z "$why" ] && exit 0
jq -n --arg w "$why" --arg c "$CANON" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:("The 30-minute check prompt is exactly \"" + $c + "\" (founder, 6 Nov: a prompt listing rows goes stale). Refused because " + $w + ". Put rows and rules in STATE \"Start here\" instead; a one-off reminder uses recurring: false.")}}'
