#!/usr/bin/env bash
# Test of LR-167 (founder A455, 28 Nov): the Lead's check turn (prompt "run lead-watch; read STATE Start here") cannot end
# until lead-watch.sh finished a run under 12 min ago from a copy within 20 commits of origin/main (the full-check stamp it
# writes at its end); other turns and other copies stop freely; after 3 blocks in one turn the stop goes through with a
# message (no loop). Fixture transcripts, a throwaway copy bound as the Lead's; no network, US$0.
#   bash product/tools/check-check-stamp.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/chkstamp.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
G="$TOOLS/lead-check-guard.sh"; C='run lead-watch; read STATE Start here'
git init -q "$T/copy" && mkdir -p "$T/copy/$PRODREL/tools" && printf '#!/bin/bash\necho "$FAKE_LANE"\n' > "$T/copy/$PRODREL/tools/lane.sh"
export NOW=1800000000 LEAD_WATCH_STATE_DIR="$T/lw" APP_VIEW_FILE="$T/app-view.txt"; mkdir -p "$T/lw"
printf 'saved epoch %s\napp view rows=3\n' "$NOW" > "$APP_VIEW_FILE"   # a fresh, readable app view: only LR-167 can block
tr() { jq -cn --arg p "$1" '{type:"user", message:{role:"user", content:$p}}, {type:"assistant", message:{content:[{type:"text", text:"done"}]}}' > "$T/${2:-t}.jsonl"; }
stop() {  # [$1 lane] [$2 transcript name] → $out, $v block|pass
  out=$(jq -n --arg d "$T/copy" --arg t "$T/${2:-t}.jsonl" '{hook_event_name:"Stop", cwd:$d, transcript_path:$t, stop_hook_active:true}' | FAKE_LANE="${1:-lead}" bash "$G" 2>&1)
  v=pass; printf '%s' "$out" | jq -e '.decision == "block" and (.reason | test("LR-167"))' >/dev/null 2>&1 && v=block; }
stamp() { echo "$1 $2 abc 30" > "$T/lw/full-check"; }
tr "$C" a; stop lead a; ok "no stamp: a check turn is refused" "$([ $v = block ] && grep -q 'no lead-watch run has finished' <<<"$out" && echo 1)" "$out"
stamp $((NOW - 13 * 60)) 0; tr "$C" b; stop lead b; ok "a stamp 13 min old: refused" "$([ $v = block ] && grep -q '13 min old' <<<"$out" && echo 1)" "$out"
stamp $((NOW - 12 * 60)) 0; tr "$C" c; stop lead c; ok "a stamp 12 min old: refused (under 12 min is fresh)" "$([ $v = block ] && echo 1)" "$out"
stamp $((NOW - 2 * 60)) 21; tr "$C" d; stop lead d; ok "a fresh stamp from a copy 21 behind: refused" "$([ $v = block ] && grep -q '21 commits behind' <<<"$out" && echo 1)" "$out"
stamp $((NOW - 11 * 60)) 20; tr "$C" e; stop lead e; ok "a stamp 11 min old from a copy 20 behind: passes" "$([ $v = pass ] && echo 1)" "$out"
echo "garbage" > "$T/lw/full-check"; tr "$C" f; stop lead f; ok "an unreadable stamp: refused" "$([ $v = block ] && grep -q unreadable <<<"$out" && echo 1)" "$out"
rm -f "$T/lw/full-check"
tr "where are we?" g; stop lead g; ok "another turn of the Lead stops freely" "$([ $v = pass ] && echo 1)" "$out"
tr "$C" h; stop screens h; ok "a builder's copy is never blocked" "$([ $v = pass ] && echo 1)" "$out"
tr "  Run lead-watch;  read STATE Start here." i; stop lead i; ok "the prompt matched like the cron guard (case, spacing, full stop)" "$([ $v = block ] && echo 1)" "$out"
tr "$C" j; for k in 1 2 3; do stop lead j; done; ok "three stops in one turn are blocked" "$([ $v = block ] && echo 1)" "$out"
stop lead j; ok "the fourth stop goes through with a message to tell the founder (no loop)" "$([ $v = pass ] && jq -e '.systemMessage | test("Tell the founder")' <<<"$out" >/dev/null && echo 1)" "$out"
# lead-watch.sh writes the stamp at its very end, after every step, with this copy's behind count
lw="$TOOLS/lead-watch.sh"
last=$(grep -n 'full-check.\$\$" \&\& mv -f' "$lw" | cut -d: -f1); ex=$(grep -n '^exit "\$act"' "$lw" | cut -d: -f1)
ok "lead-watch.sh writes full-check on the line before its final exit" "$([ -n "$last" ] && [ -n "$ex" ] && [ "$((ex - last))" = 1 ] && echo 1)" "stamp line ${last:-none}, exit line ${ex:-none}"
ok "... with the epoch and the commits its own copy is behind origin/main" "$(grep -q 'fb=$(git -C "$TOOLS" rev-list --count HEAD..origin/main' "$lw" && echo 1)"
ok "... and the gap watchdog still reads last-check (written at the start), not full-check" "$(grep -q 'st="$STATE_DIR/last-check"' "$lw" && echo 1)"
finish
