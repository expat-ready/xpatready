#!/bin/bash
# Scripted hand-over (P-611 (2), row G-2; replaces the lead skill's step-by-step paragraph). In order:
#  1. refuses (exit 2, with a list) while product/state/items.json has an open un-acked item, or a board/* or tools/*
#     branch has commits not on this lead branch;
#  2. rewrites STATE.md's one current_lead: line;  3. commits and pushes it (STATE.md only);
#  4. prints the one-line message for each lane and the "take over now" text for the standby.
# --dry-run does 1 and shows the line 2 would write, then stops (nothing written). Exit 1 on bad input or a git failure.
# Usage: bash product/tools/handover.sh <standby-session-id> "<Lead N+1 · date time IST>" [--dry-run]
# Test: check-handover.sh. Next: the standby runs takeover.sh.
set -uo pipefail
dry=0; args=(); for a in "$@"; do case "$a" in --dry-run) dry=1;; *) args+=("$a");; esac; done
id="${args[0]:-}"; title="${args[1]:-}"
TOOLS="$(cd "$(dirname "$0")" && pwd)"; P="$(cd "$TOOLS/.." && pwd)"; S="$P/STATE.md"
echo "$id" | grep -qE '^[A-Za-z]+_[A-Za-z0-9_-]{8,}$' || { echo "handover: first argument must be the standby's session id (local_<uuid>, session_<id>), got '$id'" >&2; exit 1; }
new=$(echo "$title" | grep -oE 'Lead [0-9]+' | head -1); [ -n "$new" ] || { echo "handover: second argument must name \"Lead N+1 · <date> <time> IST\", got '$title'" >&2; exit 1; }
cd "$P" || exit 1
br=$(git rev-parse --abbrev-ref HEAD); case "$br" in lead/*) ;; *) echo "handover: run it on the Lead's lead/* branch, not '$br'" >&2; exit 1;; esac
[ "$(grep -c '^current_lead: ' "$S")" = 1 ] || { echo "handover: STATE.md needs exactly one current_lead: line" >&2; exit 1; }
if [ "$dry" = 0 ]; then git pull -q --ff-only origin "$br" || { echo "handover: git pull --ff-only failed; settle the branch first" >&2; exit 1; }; fi

# 1. Refusals.
items=$(python3 -I "$TOOLS/items.py" blocking); ri=$?
lanes=$(bash "$TOOLS/lane-branches.sh" HEAD); rl=$?
if [ "$ri" != 0 ] || [ "$rl" != 0 ]; then
  echo "REFUSED: hand-over waits until every item is acked or done and every lane branch is merged (P-611 (2))"
  [ -n "$items" ] && echo "$items" && echo "      ack or finish each: python3 product/tools/items.py ack <id> --by \"<Lead N>\" (or done <id>)"
  [ -n "$lanes" ] && echo "$lanes" && echo "      merge each here, test, push; or delete an abandoned branch on GitHub"
  exit 2
fi

# 2. The new current_lead line.
old=$(grep '^current_lead: ' "$S"); oldid=$(echo "${old#current_lead: }" | cut -d' ' -f1); prev=$(echo "$old" | grep -oE 'Lead [0-9]+' | head -1)
line="current_lead: $id $title (took over from ${prev:-?}, ${oldid:0:14})"
[ "$oldid" = "$id" ] && { echo "handover: $id is already the current Lead" >&2; exit 1; }
if [ "$dry" = 1 ]; then echo "dry run: nothing blocks; would write:"; echo "  $line"; exit 0; fi
LINE="$line" python3 -I -c '
import os,sys; p=sys.argv[1]; s=open(p).read().split("\n")
s=[os.environ["LINE"] if l.startswith("current_lead: ") else l for l in s]; open(p,"w").write("\n".join(s))' "$S" || exit 1

# 3. Commit and push STATE.md only.
git commit -q -m "Hand-over: ${prev:-?} -> $new (current_lead:, handover.sh, P-611)" -- STATE.md || { echo "handover: commit failed" >&2; exit 1; }
ok=0; for t in 2 4 8 16 0; do git push -q origin "HEAD:refs/heads/${br}" && { ok=1; break; }; [ "$t" -gt 0 ] && sleep "$t"; done
[ "$ok" = 1 ] || { echo "handover: push failed after retries; current_lead: is committed here only: push before anything else" >&2; exit 1; }
echo "written and pushed: $line"

# 4. Messages.
echo
echo "To each running local lane (ListAgents), one line:"
echo "  Current Lead is now $new ($id)"
echo "In flight (acked items, their owners):"; python3 -I "$TOOLS/items.py" list --open | sed 's/^/  /'
echo
echo "To the standby $id (SendMessage):"
echo "  take over now: you are $new ($id). Rename yourself \"$title\", run bash ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/takeover.sh, then /lead."
echo "Then you: rewrite the STATE hand-over block, CronDelete your check, rename yourself \"${prev:-Lead N} · … (ended)\"."
