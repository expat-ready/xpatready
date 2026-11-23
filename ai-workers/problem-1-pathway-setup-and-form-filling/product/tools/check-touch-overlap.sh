#!/usr/bin/env bash
# The test of touch-overlap.py (enforcement plan row E10; P-576, P-526b, P-438b): a lane brief whose "Touches:" list
# overlaps an open PR's changed files is refused by the start_session hook (lane-preflight.sh --hook), here or in the
# cloud; the PR the brief names as #N is not counted; GitHub is read through gh.sh (a stand-in gh here: pages, a PR with
# over 100 files, a failure that refuses). Throwaway files under $TMPDIR, no network. US$0.
#   bash product/tools/check-touch-overlap.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
# ENF-803: a start brief's Duplicate check names the main sha and the exact IST time (brief-fresh.py); HEAD stands for main here
export BRIEF_MAIN=HEAD; FRESH_DUP="read main $(git rev-parse --short=9 HEAD) at $(TZ=Asia/Kolkata date +%H:%M) IST;"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/touch.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
TO="$TOOLS/touch-overlap.py"; P1=ai-workers/problem-1-pathway-setup-and-form-filling
printf '2001\t%s/prototype/studio/apps/api/prisma/schema.prisma\n2001\t%s/prototype/studio/apps/api/src/case/case-prepare.service.ts\n2002\t%s/product/tools/lane-preflight.sh\n2002\t%s/product/screens/R1.9/review.md\n2002\t.github/workflows/label-guard.yml\n' "$P1" "$P1" "$P1" "$P1" > "$T/prs.tsv"
to() { out=$(printf '%s\n' "$1" | TOUCH_PRS="$T/prs.tsv" python3 -I "$TO" 2>&1); r=$?; }
y() { [ "$1" = "$2" ] && echo 1 || echo 0; }

to $'Row X-1.\nTouches: prototype/studio/apps/api/prisma/schema.prisma'
ok "a Touches: path an open PR changes is refused, naming the PR and the file" "$([ $r = 1 ] && echo "$out" | grep -q 'TOUCH OVERLAP: prototype/studio/apps/api/prisma/schema.prisma is changed by open PR #2001' && echo 1 || echo 0)" "exit $r: $out"
to $'Touches: `lane-preflight.sh`, product/qa/x.md'; ok "a bare file name in backticks matches the end of a path" "$([ $r = 1 ] && echo "$out" | grep -q 'lane-preflight.sh is changed by open PR #2002' && echo 1 || echo 0)" "exit $r: $out"
to $'- **Touches:** studio/apps/api/prisma/'; ok "a folder ending in / matches what it holds (bullet and bold read)" "$([ $r = 1 ] && echo "$out" | grep -q '#2001' && echo 1 || echo 0)" "exit $r: $out"
to $'**Touches**: */case/*.service.ts'; ok "a glob matches" "$([ $r = 1 ] && echo "$out" | grep -q 'case-prepare.service.ts' && echo 1 || echo 0)" "exit $r: $out"
to $'Touches: product/tools/lane-preflight.sh, prisma/schema.prisma'; ok "every overlap is named at once" "$([ $r = 1 ] && echo "$out" | grep -q '#2001' && echo "$out" | grep -q '#2002' && echo 1 || echo 0)" "exit $r: $out"
to $'Touches: product/tools/new-check.sh, prototype/studio/apps/web/src/x.tsx'; ok "files no open PR changes pass" "$(y "$r" 0)" "$out"
to $'Touches: preflight.sh'; ok "a name is matched after a /, never inside a name (preflight.sh is not lane-preflight.sh)" "$(y "$r" 0)" "$out"
to $'Touches: tools/'; ok "a folder name matches a whole folder anywhere in the path (tools/ holds product/tools/lane-preflight.sh)" "$(y "$r" 1)" "$out"
to $'Continue #2002.\nTouches: lane-preflight.sh'; ok "the PR the brief names as #N (the lane's own) is not counted" "$(y "$r" 0)" "$out"
to $'Touches: .github/workflows/label-guard.yml'; ok "a path starting with a dot (.github/) is matched, not stripped" "$([ $r = 1 ] && echo "$out" | grep -q '#2002' && echo 1 || echo 0)" "exit $r: $out"
to $'Touches: ./.github/workflows/label-guard.yml'; ok "... and ./ in front of it is dropped" "$(y "$r" 1)" "$out"
to $'Touches: prototype\\studio\\apps\\api\\prisma\\schema.prisma'; ok "a Windows-style path is read with /" "$(y "$r" 1)" "$out"
to $'Touches:\n- product/tools/new.sh\n- `prisma/schema.prisma`\n\nDone when: x'; ok "an empty Touches: reads the bullet list under it, every bullet" "$([ $r = 1 ] && echo "$out" | grep -q 'prisma/schema.prisma is changed by open PR #2001' && echo 1 || echo 0)" "exit $r: $out"
to $'Touches:\nDone when: STATE.md updated'; ok "an empty Touches: never reads the next line as its list" "$(y "$r" 0)" "$out"
to $'touches: lane-preflight.sh in prose'; ok "a lower-case touches: in prose is not a Touches: line" "$(y "$r" 0)" "$out"
to $'See #2002 for context.\nTouches: lane-preflight.sh'; ok "a #N in passing does not exempt that PR (only PR #N, continue #N, resume #N)" "$(y "$r" 1)" "$out"
to $'Resumes PR #2002.\nTouches: lane-preflight.sh'; ok "... 'Resumes PR #2002' does" "$(y "$r" 0)" "$out"
to $'Touches: `product/tools/new.sh`, `lane-preflight.sh`.'; ok "the last entry of a list ending in a full stop is read (backticks, then .)" "$(y "$r" 1)" "$out"
to $'Touches: the model (prisma/schema.prisma).'; ok "... and in brackets" "$(y "$r" 1)" "$out"
to $'- **Touches:**\n- **Done when:** STATE.md shows the row'; ok "a bulleted next field (- **Done when:**) is not read as the list" "$(y "$r" 0)" "$out"
to $'Touches:\n\n1. prisma/schema.prisma'; ok "a blank line, then a numbered list, is read" "$(y "$r" 1)" "$out"
to $'TOUCHES: lane-preflight.sh'; ok "TOUCHES: in capitals is read" "$(y "$r" 1)" "$out"
to $'Touches: `*.prisma`'; ok "a glob starting with * keeps it (bold ** is dropped, a glob's * is not)" "$(y "$r" 1)" "$out"
to $'Touches: **lane-preflight.sh**'; ok "... and a bold entry is read" "$(y "$r" 1)" "$out"
to $'Touches: none'; ok "Touches: none checks nothing" "$(y "$r" 0)" "$out"
to $'Row X-1. Model: Opus 5.5.'; ok "a brief with no Touches: line checks nothing (and reads no PRs)" "$([ $r = 0 ] && [ -z "$out" ] && echo 1 || echo 0)" "$out"
out=$(printf 'Touches: x.ts\n' | TOUCH_PRS="$T/none.tsv" python3 -I "$TO" 2>&1); r=$?
ok "open PRs that cannot be read refuse (exit 2, fails closed)" "$([ $r = 2 ] && echo "$out" | grep -q 'could not be read' && echo 1 || echo 0)" "exit $r: $out"

# GitHub through gh.sh: a stand-in gh answers repo view, two GraphQL pages and the REST files of a PR with over 100 files.
mkdir "$T/bin"; cat > "$T/bin/gh" <<'EOF'
#!/bin/sh
case "$1 $2" in
  "repo view") echo "o/r";;
  "api graphql") case "$*" in
    *"a=c1"*) echo '{"data":{"repository":{"pullRequests":{"pageInfo":{"hasNextPage":false,"endCursor":null},"nodes":[{"number":7,"files":{"pageInfo":{"hasNextPage":true},"nodes":[{"path":"f0"}]}}]}}}}';;
    *) [ -n "$GH_FAIL" ] && { echo "HTTP 502" >&2; exit 1; }
       echo '{"data":{"repository":{"pullRequests":{"pageInfo":{"hasNextPage":true,"endCursor":"c1"},"nodes":[{"number":5,"files":{"pageInfo":{"hasNextPage":false},"nodes":[{"path":"a/page-one.ts"}]}}]}}}}';;
  esac;;
  "api --paginate") printf 'f0\nbig/file-150.ts\n';;
  *) echo "unexpected gh $*" >&2; exit 9;;
esac
EOF
chmod +x "$T/bin/gh"
gt() { out=$(printf '%s\n' "$1" | env -u TOUCH_PRS PATH="$T/bin:$PATH" GH_FALLBACK=never ${2:+GH_FAIL=1} python3 -I "$TO" 2>&1); r=$?; }
gt 'Touches: page-one.ts'; ok "GitHub: a file on the first page of open PRs is found" "$([ $r = 1 ] && echo "$out" | grep -q 'open PR #5' && echo 1 || echo 0)" "exit $r: $out"
gt 'Touches: file-150.ts'; ok "GitHub: the second page is read, and a PR's files past the first 100 (by REST)" "$([ $r = 1 ] && echo "$out" | grep -q 'open PR #7 (big/file-150.ts)' && echo 1 || echo 0)" "exit $r: $out"
gt 'Touches: page-one.ts' fail; ok "GitHub: a failed read refuses (exit 2)" "$([ $r = 2 ] && echo "$out" | grep -q 'HTTP 502' && echo 1 || echo 0)" "exit $r: $out"

# The hook: lane-preflight.sh --hook denies a cloud start whose Touches: list overlaps (after the brief and focus checks).
printf '| R1.1 | X-1 | test | test |\n' > "$T/focus-list.md"; export FOCUS_LIST="$T/focus-list.md"
printf '| # | Map row: capability | Module | Status |\n|---|---|---|---|\n| R1.1 | x | P | Partial |\n' > "$T/caps.md"; printf 'R1.1\t1\tJ0\n' > "$T/waves.tsv"
printf '| Row | Area | What |\n|---|---|---|\n| X-1 | runtime (case side) | a build row |\n' > "$T/BACKLOG.md"; export FOCUS_BACKLOG_DIR="$T" WAVES_TSV="$T/waves.tsv" WAVES_CAPS="$T/caps.md"
BRIEF=$'Row X-1. Model: Opus 5.5, effort: medium.\nItem: R1.1\nDuplicate check: '"$FRESH_DUP"$' searched BACKLOG; none\nDone when: check-x.sh exits 0'
hook() { out=$(jq -n --arg p "$1" '{tool_name:"start_session", tool_input:{target:"cloud", prompt:$p}}' | TOUCH_PRS="$T/prs.tsv" bash "$TOOLS/lane-preflight.sh" --hook); r=$?; }
hook "$BRIEF"$'\nTouches: prisma/schema.prisma'
ok "hook: a cloud start whose Touches: overlaps an open PR is denied with the reason" "$(echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny" and (.hookSpecificOutput.permissionDecisionReason | test("E10.*schema.prisma is changed by open PR #2001"))' >/dev/null 2>&1 && echo 1 || echo 0)" "$out"
hook "$BRIEF"$'\nTouches: product/tools/new-check.sh'; ok "hook: a Touches: list with no overlap passes" "$([ $r = 0 ] && [ -z "$out" ] && echo 1 || echo 0)" "$out"
TOUCH_PRS="$T/none.tsv"; out=$(jq -n --arg p "$BRIEF"$'\nTouches: x.ts' '{tool_name:"start_session", tool_input:{target:"cloud", prompt:$p}}' | TOUCH_PRS="$T/none.tsv" bash "$TOOLS/lane-preflight.sh" --hook)
ok "hook: unreadable open PRs deny the start" "$(echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny" and (.hookSpecificOutput.permissionDecisionReason | test("could not be read"))' >/dev/null 2>&1 && echo 1 || echo 0)" "$out"
grep -q 'check-touch-overlap.sh' "$TOOLS/check-lane-preflight.sh" && grep -q 'check-lane-preflight.sh' "$TOOLS/check-guards.sh"; ok "check-guards.sh runs this test (through check-lane-preflight.sh)" "$([ $? = 0 ] && echo 1 || echo 0)"
finish
