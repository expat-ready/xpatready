#!/usr/bin/env bash
# P-756 tune 1 (founder 20 Nov): the lane Stop hook stop-check.sh blocks on check-docs lines only about files the lane's
# branch changed against origin/main. Lines about the Lead's records alone (WORKFLOW LOCK, RULES LAG, RULES register,
# STATE size) are a warning; CI enforces them on records PRs. Throwaway git copies, US$0, no network.
#   bash product/tools/check-stop-check.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
APPREL="ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio"
# main: the Lead's records fail four checks (a WORKFLOW LOCK row, RULES lagging, no RULES register, STATE over 12 KB).
docs_copy "$T/c"; C="$T/c"; P="$C/$PRODREL"; cp "$TOOLS/stop-check.sh" "$TOOLS/lane.sh" "$P/tools/"
printf '#!/bin/bash\nEXEMPT=" P-735 P-734 "   # workflow rows (test)\n' > "$P/tools/decision-impact.sh"
{ echo '| # | Date | Decision |'; echo '|---|---|---|'; echo '| P-734 | 19 Nov | **One engine to 22 Nov.** |'
  echo '| P-735 | 20 Nov | **Lanes pick their own next item (founder).** |'; } > "$P/DECISIONS.md"
printf '# Rules, as of **P-700**\n\nNo register table.\n' > "$P/RULES.md"
head -c 13000 /dev/zero | tr '\0' 'x' | fold -w 100 >> "$P/STATE.md"; echo 'See `domain/glossary.md`.' >> "$P/STATE.md"
mkdir -p "$P/domain" "$C/$APPREL/web/src"; echo '# Glossary' > "$P/domain/glossary.md"; echo 'export const a = 1;' > "$C/$APPREL/web/src/a.ts"
git -C "$C" add -A && git -C "$C" commit -qm main && git -C "$C" update-ref refs/remotes/origin/main HEAD
base=$(bash "$P/tools/check-docs.sh" 2>&1)
ok "the fixture's main fails check-docs on the Lead's four records checks" \
  "$(for w in 'WORKFLOW LOCK: P-735' 'RULES LAG:' 'RULES REGISTER:' 'STATE TOO BIG'; do grep -q "^$w" <<< "$base" || exit; done; echo 1)" "$base"
stop() { out=$(printf '{"cwd":"%s"}' "$C" | bash "$P/tools/stop-check.sh" 2>/dev/null); blocked=$(jq -r '.decision // "none"' <<< "$out" 2>/dev/null); }
lane() { git -C "$C" checkout -q -f -B "$1" origin/main; git -C "$C" clean -qfd; }
# 1. A lane that changed only app code stops, with the Lead-records lines as a warning.
lane screens/app; echo 'export const a = 2;' > "$C/$APPREL/web/src/a.ts"; git -C "$C" commit -qam app; stop
ok "a lane that changed only app code stops although DECISIONS has a WORKFLOW LOCK line" "$([ "$blocked" = none ] && echo 1)" "$out"
ok "... and is warned of the Lead's records lines (not blocking)" \
  "$(jq -r '.systemMessage // ""' <<< "$out" | grep 'warning: ' | grep 'WORKFLOW LOCK: P-735' | grep -q 'RULES LAG' && echo 1)" "$out"
# Uncommitted app work changes nothing.
lane forms/wip; echo 'export const b = 1;' > "$C/$APPREL/web/src/b.ts"; stop
ok "a lane with only uncommitted app work stops too" "$([ "$blocked" = none ] && echo 1)" "$out"
# 2. A lane that broke a records rule in a file it changed is still refused.
lane evidence/doc; echo 'See `domain/missing-page.md`.' >> "$P/domain/glossary.md"; git -C "$C" commit -qam doc; stop
ok "a lane whose changed file has a missing link is refused" \
  "$([ "$blocked" = block ] && jq -r .reason <<< "$out" | grep -q 'MISSING LINK in .*domain/glossary.md: domain/missing-page.md' && echo 1)" "$out"
ok "... and the Lead's records lines are not among its reasons" "$(jq -r .reason <<< "$out" | grep -q '^WORKFLOW LOCK' || echo 1)" "$out"
lane runtime/rec; echo '| P-736 | 20 Nov | **A new review step (founder).** |' >> "$P/DECISIONS.md"; printf '#!/bin/bash\nEXEMPT=" P-736 P-735 P-734 "   # workflow rows (test)\n' > "$P/tools/decision-impact.sh"
git -C "$C" commit -qam rec; stop
ok "a lane that adds a WORKFLOW LOCK row to DECISIONS itself is refused on that check-docs line" \
  "$([ "$blocked" = block ] && jq -r .reason <<< "$out" | grep -q '^WORKFLOW LOCK: P-736' && echo 1)" "$out"
lane screens/move; git -C "$C" mv "$PRODREL/domain/glossary.md" "$PRODREL/domain/terms.md"; git -C "$C" commit -qm move; stop
ok "a lane that renames a page the Lead's STATE links to is refused (it broke the link)" \
  "$([ "$blocked" = block ] && jq -r .reason <<< "$out" | grep -q 'MISSING LINK in .*STATE.md: domain/glossary.md' && echo 1)" "$out"
# A check-docs that fails with no problem line (a crash) still blocks.
lane screens/crash; cp "$P/tools/check-docs.sh" "$T/check-docs.keep"; printf '#!/bin/bash\necho "line 3: boom" >&2; exit 1\n' > "$P/tools/check-docs.sh"
git -C "$C" update-index --assume-unchanged "$PRODREL/tools/check-docs.sh"; stop
ok "a check-docs that fails with no problem line still blocks" "$([ "$blocked" = block ] && jq -r .reason <<< "$out" | grep -q 'no problem line: line 3: boom' && echo 1)" "$out"
git -C "$C" update-index --no-assume-unchanged "$PRODREL/tools/check-docs.sh"; cp "$T/check-docs.keep" "$P/tools/check-docs.sh"
# A check-docs line the hook does not know (a new check) blocks even an app-only lane (fail closed).
lane screens/new; echo 'export const a = 4;' > "$C/$APPREL/web/src/a.ts"; git -C "$C" commit -qam app
printf '#!/bin/bash\necho "NEW CHECK: something new is wrong"; exit 1\n' > "$P/tools/check-docs.sh"
git -C "$C" update-index --assume-unchanged "$PRODREL/tools/check-docs.sh"; stop
ok "a check-docs line of a kind the hook does not know blocks an app-only lane" "$([ "$blocked" = block ] && jq -r .reason <<< "$out" | grep -q '^NEW CHECK: something new' && echo 1)" "$out"
git -C "$C" update-index --no-assume-unchanged "$PRODREL/tools/check-docs.sh"; cp "$T/check-docs.keep" "$P/tools/check-docs.sh"
# 2b. ENF-772 (#2599, E7): check-docs names a register row whose enforcer file is not on the branch. The line blocks
# the lane that deleted or renamed that file; a lane that did not touch it only gets the warning; a line saying the
# enforcer check could not run blocks every lane (fail closed).
mkdir -p "$C/$APPREL/tools"; echo '#!/bin/bash' > "$C/$APPREL/tools/gate-x.sh"; git -C "$C" add -A; git -C "$C" commit -qm gate; git -C "$C" update-ref refs/remotes/origin/main HEAD
reg() { printf '#!/bin/bash\necho "%s"; exit 1\n' "$1" > "$P/tools/check-docs.sh"; git -C "$C" update-index --assume-unchanged "$PRODREL/tools/check-docs.sh"; }
unreg() { git -C "$C" update-index --no-assume-unchanged "$PRODREL/tools/check-docs.sh"; cp "$T/check-docs.keep" "$P/tools/check-docs.sh"; }
GONE='RULES REGISTER: P-1 is enforced by gate-x.sh, but no such file is on this branch: fix the Enforced by cell (prose, or the real file), or write \"owed\" if it is not built yet (E7, P-611a)'
lane runtime/del; git -C "$C" rm -q "$APPREL/tools/gate-x.sh"; git -C "$C" commit -qm del; reg "$GONE"; stop
ok "E7: a lane that deleted a register row's enforcer file is refused on that RULES REGISTER line" \
  "$([ "$blocked" = block ] && jq -r .reason <<< "$out" | grep -q '^RULES REGISTER: P-1 is enforced by gate-x.sh' && echo 1)" "$out"
unreg; lane runtime/mv; git -C "$C" mv "$APPREL/tools/gate-x.sh" "$APPREL/tools/gate-y.sh"; git -C "$C" commit -qm mv; reg "$GONE"; stop
ok "E7: a lane that renamed the enforcer file is refused too" "$([ "$blocked" = block ] && jq -r .reason <<< "$out" | grep -q '^RULES REGISTER: P-1 is enforced by gate-x.sh' && echo 1)" "$out"
unreg; lane screens/app3; echo 'export const a = 5;' > "$C/$APPREL/web/src/a.ts"; git -C "$C" commit -qam app; reg "$GONE"; stop
ok "E7: an app-only lane that did not touch the enforcer gets the register line as a warning, not a block" \
  "$([ "$blocked" = none ] && jq -r '.systemMessage // ""' <<< "$out" | grep -q 'RULES REGISTER: P-1 is enforced by gate-x.sh' && echo 1)" "$out"
for l in "RULES REGISTER: git could not list this copy's files, so no enforcer file was checked (E7)" "RULES REGISTER: the enforcer-file check stopped with an error, so no enforcer file was checked (E7)"; do
  unreg; lane screens/app4; echo 'export const a = 6;' > "$C/$APPREL/web/src/a.ts"; git -C "$C" commit -qam app; reg "$l"; stop
  ok "E7: '${l:16:40}...' blocks even an app-only lane (the check did not run)" "$([ "$blocked" = block ] && jq -r .reason <<< "$out" | grep -qF "$l" && echo 1)" "$out"
done
unreg
# 3. Nothing to compare with: every line still blocks (fail closed).
lane screens/app2; echo 'export const a = 3;' > "$C/$APPREL/web/src/a.ts"; git -C "$C" commit -qam app
git -C "$C" update-ref -d refs/remotes/origin/main; git -C "$C" branch -q -m main old-main 2>/dev/null; stop
ok "with no origin/main to compare with, the Lead's records lines still block" \
  "$([ "$blocked" = block ] && jq -r .reason <<< "$out" | grep -q '^WORKFLOW LOCK: P-735' && echo 1)" "$out"
finish
