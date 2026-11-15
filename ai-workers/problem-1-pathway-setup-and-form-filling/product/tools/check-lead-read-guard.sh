#!/usr/bin/env bash
# B193 part 2 (b), P-423: lead-read-guard.sh refuses `review: approved` on a PR touching a migration, the schema,
# .github/, .mergify.yml, permissions or money unless a comment "Lead read the diff: <head sha>" names its head; other
# PRs label freely. gh is a fake on PATH answering from files. US$0, no network.
#   bash product/tools/check-lead-read-guard.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/lr.XXXXXXXX"); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/f"; git init -q "$T/copy"
printf '#!/bin/bash\n[ -n "${FAKE_FAIL:-}" ] && exit 1\ncat "$FAKE/$3.json"\n' > "$T/bin/gh"; chmod +x "$T/bin/gh"
H=abcdef1234567890abcdef1234567890abcdef12; OLD=1111111222222233333334444444555555566666
pr() {  # $1 number, $2 files (space separated), $3 comment body or "", $4 association
  jq -n --arg f "$2" --arg c "$3" --arg a "${4:-OWNER}" --arg h "$H" '{headRefOid:$h, files:[$f|split(" ")[]|{path:.}],
    comments:(if $c == "" then [] else [{body:$c, authorAssociation:$a}] end)}' > "$T/f/$1.json"; }
S=ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio
pr 1 "$S/prisma/migrations/20261116_x/migration.sql" ""
pr 2 ".github/workflows/ci.yml" "Lead read the diff: ${H:0:9}"
pr 3 ".mergify.yml" "Lead read the diff: ${OLD:0:9}"
pr 4 "$S/api/src/client-money/ledger.ts" ""
pr 5 "$S/web/src/runtime/fees.tsx" "Reviewer: Approve ${H:0:9}"
pr 6 "$S/web/src/screens/library.tsx $S/api/src/case-feed.ts" ""
pr 7 "$S/prisma/schema/cases.prisma" "notes first
Lead read the diff $H"
pr 8 "$S/api/src/platform-permissions/roles.ts" "Lead read the diff: ${H:0:9}" NONE
G="$TOOLS/lead-read-guard.sh"
guard() {  # $1 command → allow | deny
  local out; out=$(jq -n --arg c "$1" --arg d "$T/copy" '{tool_name:"Bash", tool_input:{command:$c}, cwd:$d}' | PATH="$T/bin:$PATH" FAKE="$T/f" bash "$G")
  if printf '%s' "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1; then echo deny; else echo allow; fi; }
L='--add-label "review: approved"'
r=$(guard "gh pr edit 1 $L"); ok "a migration with no read line is refused" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(guard "gh pr edit 2 $L"); ok ".github/ with the read line on the head passes" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(guard "gh pr edit 3 $L"); ok ".mergify.yml read on an older head is refused (a push needs a new read)" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(guard "cd x && gh pr edit 4 --add-label 'review: approved'"); ok "a money path (client money ledger) unread is refused" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(guard "gh pr edit 5 $L"); ok "fees: a reviewer's Approve is not the Lead's read" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(guard "gh pr edit 6 $L"); ok "a PR touching nothing sensitive labels freely (case-feed.ts is not fees)" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(guard "gh pr edit 7 $L"); ok "the schema with a full-SHA read line (no colon) passes" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(guard "gh pr edit 8 $L"); ok "a read line from outside the repository's writers does not count" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(guard "gh pr edit 1 --remove-label \"review: approved\""); ok "removing the label always passes" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(guard "gh pr view 1 --json labels"); ok "other commands pass untouched" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(FAKE_FAIL=1 guard "gh pr edit 6 $L"); ok "GitHub unreadable: refused (fails closed; the label can wait)" "$([ "$r" = deny ] && echo 1)" "got $r"
out=$(jq -n --arg d "$T/copy" '{tool_name:"mcp__github__issue_write", tool_input:{method:"update", owner:"o", repo:"r", issue_number:1, labels:["review: approved"]}, cwd:$d}' | PATH="$T/bin:$PATH" FAKE="$T/f" bash "$G")
ok "the GitHub MCP label write is guarded too" "$(echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1 && echo 1)" "$out"
ok "the refusal names the files and the line to write" "$(echo "$out" | jq -e '.hookSpecificOutput.permissionDecisionReason | test("migration.sql.*Lead read the diff: abcdef123")' >/dev/null && echo 1)" "$out"
PATH="$T/bin:$PATH" FAKE="$T/f" bash "$G" --pr 1 >/dev/null; r1=$?; PATH="$T/bin:$PATH" FAKE="$T/f" bash "$G" --pr 2 >/dev/null; r2=$?
ok "the GitHub check mode: exit 1 unread, 0 read" "$([ "$r1" = 1 ] && [ "$r2" = 0 ] && echo 1)" "got $r1 $r2"
finish
