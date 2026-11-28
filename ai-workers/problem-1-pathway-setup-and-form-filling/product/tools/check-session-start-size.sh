#!/usr/bin/env bash
# LR-052 (FP #54, #186): the SessionStart hook's text (session-start.sh additionalContext) stays under 1,536 bytes:
# a pointer to the start read and the current_lead line, never the pasted STATE.md (12,553 bytes measured 27 Nov).
# Throwaway repositories with a 20 KB STATE.md stand-in and an unreachable origin; no network, US$0.
#   bash product/tools/check-session-start-size.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/ss-size.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.invalid GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.invalid PRIVATE_HOME_DIR="$T/no-private"; unset XR_RECORDS
LIMIT=1536
mk() {  # mk <name> <with STATE.md: 1|0>: a copy with this tools folder, an origin that cannot be reached
  local R="$T/$1"; git init -q -b main "$R" 2>/dev/null || git init -q "$R"; mkdir -p "$R/$PRODREL/tools"; cp -R "$TOOLS/." "$R/$PRODREL/tools/"
  printf '# Current Lead\n\ncurrent_lead: local_public Lead 9 · 28 Nov (public line)\n' > "$R/$PRODREL/CURRENT-LEAD.md"
  if [ "$2" = 1 ]; then { printf '# State\n\ncurrent_lead: local_fixture Lead 12 · 28 Nov 13:0x IST (fixture)\n\n## Start here (next Lead)\n'; for i in $(seq 1 400); do echo "STATE BODY LINE $i: a long line of records the session never needs pasted in."; done; } > "$R/$PRODREL/STATE.md"; fi
  git -C "$R" add -A; git -C "$R" commit -qm base; git -C "$R" remote add origin "$T/nowhere.git"; }
ss() { (cd "$T/$1" && echo "{\"cwd\":\"$T/$1\"}" | bash "$PRODREL/tools/session-start.sh" 2>/dev/null | jq -r '.hookSpecificOutput.additionalContext // empty') > "$T/out"; }
has() { grep -qF -- "$1" "$T/out"; }

mk withstate 1; ss withstate; n=$(wc -c < "$T/out" | tr -d ' ')
ok "a copy holding a 20 KB STATE.md: the session start is under $LIMIT bytes (got $n)" "$([ "$n" -gt 0 ] && [ "$n" -lt "$LIMIT" ] && echo 1)" "$(head -c 400 "$T/out")"
ok "... it names the start read (RULES.md and STATE.md \"Start here\")" "$(has 'Start read (P-545): product/RULES.md and product/STATE.md' && echo 1)" "$(cat "$T/out")"
ok "... it carries STATE.md's current_lead line, so a lane knows whom to report to" "$(has 'current_lead: local_fixture Lead 12' && echo 1)" "$(cat "$T/out")"
ok "... and no STATE.md body is pasted" "$(has 'STATE BODY LINE' && echo 0 || echo 1)" "$(head -c 400 "$T/out")"
ok "... the copy line and the could-not-reach-GitHub note are still there" "$(has 'This copy is not bound yet' && has 'GitHub could not be reached' && echo 1)" "$(cat "$T/out")"

mk public 0; ss public; n=$(wc -c < "$T/out" | tr -d ' ')
ok "a copy whose STATE.md has left (private split): under $LIMIT bytes (got $n), the public CURRENT-LEAD.md line" "$([ "$n" -gt 0 ] && [ "$n" -lt "$LIMIT" ] && has 'current_lead: local_public Lead 9' && has 'CURRENT-LEAD.md' && echo 1)" "$(cat "$T/out")"

finish
