#!/usr/bin/env bash
# Row G-4 (P-611, P-615): seven prose rules made mechanical, each with a pass and a fail. GitHub is answered by stand-in
# curl and gh; git histories are real throwaway repos. Rule 4 (label only after "Reviewer: Approve <head sha>") is
# check-label-guard.sh's. US$0, no network.   bash product/tools/check-g4-rules.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
# ENF-803: a start brief's Duplicate check names the main sha and the exact IST time (brief-fresh.py); HEAD stands for main here
export BRIEF_MAIN=HEAD; FRESH_DUP="read main $(git rev-parse --short=9 HEAD) at $(TZ=Asia/Kolkata date +%H:%M) IST;"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
mkdir "$T/bin"; ROOTD="$(cd "$TOOLS/../../../.." && pwd)"; W="$ROOTD/.github/workflows/pr-rules.yml"
deny() { echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1 && echo 1; }

# (1) A PR is still open before a push to its branch.
printf '#!/bin/sh\n[ -n "$FX_DOWN" ] && exit 22\ncase "$*" in *"/repos/o/r/pulls?state=all&"*"head=o:lane/x"*) cat "$FX_PRS";; *) exit 22;; esac\n' > "$T/bin/curl"; chmod +x "$T/bin/curl"   # only the right question is answered
po() { echo "$1" > "$T/prs.json"; out=$(PATH="$T/bin:$PATH" FX_PRS="$T/prs.json" FX_DOWN="${2:-}" REPO=o/r GH_TOKEN=x bash "$TOOLS/pr-open-guard.sh" lane/x 2>&1); r=$?; }
po '[{"number":12,"state":"open","merged_at":null}]'; ok "(1) a branch with an open PR may be pushed" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
po '[]'; ok "(1) a new branch with no PR yet may be pushed" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
po '[{"number":12,"state":"closed","merged_at":"2026-11-15T01:00:00Z"},{"number":9,"state":"closed","merged_at":null}]'
ok "(1) a branch whose PRs merged or closed is refused, naming them" "$([ $r = 1 ] && echo "$out" | grep -q '#12 merged, #9 closed' && echo 1)" "exit $r: $out"
out=$(PATH="$T/bin:$PATH" FX_PRS="$T/prs.json" REPO=o/r GH_TOKEN=x bash "$TOOLS/pr-open-guard.sh" lead/2026-11-07-lead31 2>&1); r=$?
ok "(1) the tech lead's lead/* branch is not checked (its records go through records PRs)" "$([ $r = 0 ] && echo "$out" | grep -q 'tech-lead branch' && echo 1)" "exit $r: $out"
po '[]' down; ok "(1) GitHub unreadable: a warning, not a block" "$([ $r = 0 ] && echo "$out" | grep -q '^warn' && echo 1)" "exit $r: $out"
grep -q 'pr-open-guard.sh' "$ROOTD/.githooks/pre-push"; ok "(1) .githooks/pre-push runs pr-open-guard.sh" "$([ $? = 0 ] && echo 1)"

# (2) Reviewers and breakers on Opus high: the agent files, and launches.
mkdir "$T/ag"; printf -- '---\nname: screen-reviewer\nmodel: opus\neffort: high\n---\nbody model: sonnet\n' > "$T/ag/screen-reviewer.md"
out=$(AGENTS_DIR="$T/ag" bash "$TOOLS/agent-model-guard.sh"); ok "(2) a reviewer file pinned to Opus high passes" "$([ $? = 0 ] && echo 1)" "$out"
printf -- '---\nname: screen-breaker\ntools: Read\n---\nmodel: opus\neffort: high\n' > "$T/ag/screen-breaker.md"
out=$(AGENTS_DIR="$T/ag" bash "$TOOLS/agent-model-guard.sh"); r=$?
ok "(2) a breaker file with model and effort only outside its front matter fails" "$([ $r = 1 ] && echo "$out" | grep -q 'screen-breaker.md has no "model: opus"' && echo "$out" | grep -q 'no "effort: high"' && echo 1)" "exit $r: $out"
out=$(bash "$TOOLS/agent-model-guard.sh"); ok "(2) this repository's reviewer and breaker files pass" "$([ $? = 0 ] && echo 1)" "$out"
ah() { out=$(jq -n --arg s "$1" --arg d "$2" --arg m "$3" --arg e "$4" '{tool_name:"Agent",tool_input:({subagent_type:$s,description:$d}+(if $m=="" then {} else {model:$m} end)+(if $e=="" then {} else {effort:$e} end))}' | bash "$TOOLS/agent-model-guard.sh" --hook); }
ah screen-reviewer "Review screen 41" sonnet ""; ok "(2) hook: a reviewer launched on Sonnet is denied" "$(deny)" "$out"
ah general-purpose "Breaker for PF-25" opus medium; ok "(2) hook: a breaker launched at medium effort is denied" "$(deny)" "$out"
ah screen-reviewer "Review screen 41" opus high; ok "(2) hook: a reviewer on Opus high passes" "$([ -z "$out" ] && echo 1)" "$out"
ah Explore "Break down the routes" haiku ""; ok "(2) hook: other agents keep their model" "$([ -z "$out" ] && echo 1)" "$out"
jq -e '[.hooks.PreToolUse[] | select(.matcher == "^(Agent|Task)$") | .hooks[].command | select(test("agent-model-guard.sh --hook"))] | length == 1' "$ROOTD/.claude/settings.json" >/dev/null
ok "(2) settings.json runs the hook on Agent and Task" "$([ $? = 0 ] && echo 1)"
grep -q 'agent-model-guard.sh"' "$W"; ok "(2) pr-rules.yml checks the agent files" "$([ $? = 0 ] && echo 1)"

# (3) "Done when" naming its test, and "Duplicate check:", in every PR body and brief.
GOOD=$'## What\nRow X-1.\nDuplicate check: searched BACKLOG, open PRs; none\n\nDone when: check-x.sh exits 0 with a pass and a fail'
bc() { out=$(printf '%s' "$1" | bash "$TOOLS/brief-check.sh" ${2:-}); r=$?; }
bc "$GOOD"; ok "(3) a body with a testable Done when and a Duplicate check passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
bc "${GOOD/Duplicate check:/Duplicates}"; ok "(3) a body with no Duplicate check line fails" "$([ $r = 1 ] && echo "$out" | grep -q 'no "Duplicate check:"' && echo 1)" "exit $r: $out"
bc $'Done when: it looks nice\nDuplicate check: searched BACKLOG; none'; ok "(3) a Done when that names no test fails, a Duplicate check after it does not count" "$([ $r = 1 ] && echo "$out" | grep -q 'names no test' && echo 1)" "exit $r: $out"
bc $'## Done when\n\n- check-x.sh exits 0\n\nDuplicate check: none'; ok "(3) a Done when heading with a test in its list passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
bc $'Duplicate check: none'; ok "(3) a body with no Done when fails" "$([ $r = 1 ] && echo "$out" | grep -q 'no "Done when"' && echo 1)" "exit $r: $out"
! grep -qE 'types:.*labeled' "$W"; ok "(3) pr-rules.yml never re-runs on a label (the queue waits on it)" "$([ $? = 0 ] && echo 1)"
grep -q 'brief-check.sh"$' "$W" && grep -q 'types: \[opened, edited,' "$W"; ok "(3) pr-rules.yml checks every body, again on each edit" "$([ $? = 0 ] && echo 1)"

# (5) Every branch ahead of main with no open PR and no LANE-REPORT is listed.
O="$T/origin.git"; R="$T/repo"; git init -q --bare -b main "$O"; git init -q -b main "$R"
g() { git -C "$R" "$@"; }; g config user.email t@t; g config user.name t; g config commit.gpgsign false; g remote add origin "$O"
g commit -q --allow-empty -m base; g push -q origin main 2>/dev/null
for b in lane/none lane/open lane/merged lane/after lane/reported lane/even lane/closed; do g checkout -q -b "$b" main; [ $b = lane/even ] || g commit -q --allow-empty -m "$b"; done
merged=$(g rev-parse lane/merged); closed=$(g rev-parse lane/closed); after=$(g rev-parse lane/after); g checkout -q lane/after; g commit -q --allow-empty -m "after merge"
g push -q origin --all 2>/dev/null; g fetch -q origin
echo "[{\"headRefName\":\"lane/open\",\"headRefOid\":\"x\",\"state\":\"OPEN\"},{\"headRefName\":\"lane/merged\",\"headRefOid\":\"$merged\",\"state\":\"MERGED\"},{\"headRefName\":\"lane/after\",\"headRefOid\":\"$after\",\"state\":\"MERGED\"},{\"headRefName\":\"lane/closed\",\"headRefOid\":\"$closed\",\"state\":\"CLOSED\"}]" > "$T/all.json"
echo '[{"id":"G-9","branch":"lane/reported"}]' > "$T/items.json"; printf '#!/bin/sh\ncase "$*" in *"--state all"*) cat "%s";; *) echo "[]";; esac\n' "$T/all.json" > "$T/bin/fakegh"
out=$(cd "$R" && SWEEP_GH="sh $T/bin/fakegh" ITEMS="$T/items.json" SWEEP_STATE_DIR="$T/sweep" bash "$TOOLS/branch-sweep.sh"); r=$?
ok "(5) a branch ahead with no PR and no report is listed" "$(echo "$out" | grep -q '^ACT   lane/none: 1 commit' && echo 1)" "$out"
ok "(5) a branch whose PR closed unmerged is listed" "$(echo "$out" | grep -q '^ACT   lane/closed' && echo 1)" "$out"
ok "(5) a branch pushed after its PR merged is listed" "$(echo "$out" | grep -q '^ACT   lane/after: 2 commit' && echo 1)" "$out"
ok "(5) open PR, merged head, LANE-REPORT item and no new commits are not listed; exit = ACT count" "$([ $r = 3 ] && ! echo "$out" | grep -qE 'lane/(open|merged|reported|even)' && echo 1)" "exit $r: $out"
grep -q 'branch-sweep.sh' "$TOOLS/lead-watch.sh"; ok "(5) lead-watch.sh 3b runs branch-sweep.sh" "$([ $? = 0 ] && echo 1)"

# (6) PRs over 800 changed lines, tests included, fail unless the body names a recorded exception.
printf '| P-1 | 1 Oct | the folder layout |\n| P-610 | 15 Nov | PRs under 800 lines |\n' > "$T/DEC.md"
ps() { out=$(printf '%s' "$3" | DECISIONS="$T/DEC.md" bash "$TOOLS/pr-size.sh" "$1" "$2" ${4:+"$4"}); r=$?; }
ps 600 200 ""; ok "(6) 800 changed lines pass" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
ps 601 200 ""; ok "(6) 801 changed lines fail" "$([ $r = 1 ] && echo "$out" | grep -q '801 changed lines, over 800' && echo 1)" "exit $r: $out"
ps 900 100 "Size exception: P-610"; ok "(6) over 800 with a recorded exception passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
ps 900 100 "Size exception: P-999"; ok "(6) an exception that is not a DECISIONS row fails" "$([ $r = 1 ] && echo "$out" | grep -q 'P-999 is not a size row' && echo 1)" "exit $r: $out"
ps 3000 0 "" yes; ok "(6) a records-only PR over 800 passes (P-686)" "$([ $r = 0 ] && echo "$out" | grep -q 'records only (P-686)' && echo 1)" "exit $r: $out"
ps 3000 0 "" no; ok "(6) a PR that is not records only, over 800, still fails" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
grep -q 'records-only.sh" is-records --files' "$W"; ok "(6) pr-rules.yml asks records-only.sh whether the PR is records only (P-686)" "$([ $? = 0 ] && echo 1)"
ps 900 100 "Size exception: P-1"; ok "(6) an exception naming a row that is not about size fails" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
# Held by Lead 58 (15 Nov): the product queue's `check-success = pr-rules` gate waits for a separate small PR after lanes have seen pr-rules for a day (as module-cards, #1817); its test returns with it.
grep -q 'pr-size.sh" "$CODE" 0' "$W" && grep -q 'contents: read' "$W" && grep -q 'screens|qa' "$W"; ok "(6) pr-rules.yml runs pr-size.sh on code and test lines only (records under screens/ and qa/ not counted), contents: read" "$([ $? = 0 ] && echo 1)"

# (7) A lane start brief with no model and effort line is refused by lane-preflight.sh --hook (cloud starts too).
# The stand-in row X-1 is a real backlog row: a throwaway focus list holds it, so ENF-733's focus-check.py (test: check-focus-list.sh) is not what (7) sees.
printf '| R1.1 | X-1 | test | test |\n' > "$T/focus-list.md"
lp() { out=$(jq -n --arg t "$1" --arg p "$2" '{tool_name:$t,tool_input:{prompt:$p}}' | FOCUS_LIST="$T/focus-list.md" bash "$TOOLS/lane-preflight.sh" --hook); }
lp mcp__claude-code-remote__create_session "$GOOD"; ok "(7) a brief with no model and effort line is refused" "$(deny)" "$out"
lp mcp__claude-code-remote__create_session "${GOOD/Duplicate check: /Duplicate check: $FRESH_DUP }"$'\nModel: Opus 5.5, effort: medium\nItem: R1.2'; ok "(7) a brief naming model and effort starts (R1.2 is Proven: wave 0, always open)" "$([ -z "$out" ] && echo 1)" "$out"
lp mcp__claude-code-remote__create_session "/qa after-merge"$'\nModel: Opus 5.5, effort: medium'; ok "(7) a start naming no row (qa, standby) needs only the model and effort line" "$([ -z "$out" ] && echo 1)" "$out"
lp mcp__claude-code-remote__create_session $'/next screens B124\nModel: Opus 5.5, effort: medium'; ok "(7) a /next brief naming a row (B124) still needs Done when and Duplicate check" "$(deny)" "$out"
lp mcp__claude-code-remote__create_session "/qa after-merge"; ok "(7) ... and is refused without it" "$(deny)" "$out"
jq -e '[.hooks.PreToolUse[] | select(.matcher | test("create_session")) | .hooks[].command | select(test("lane-preflight.sh --hook"))] | length == 1' "$ROOTD/.claude/settings.json" >/dev/null
ok "(7) settings.json runs the preflight hook on create_session too" "$([ $? = 0 ] && echo 1)"

# (8) P-388 as a hook (LR-105): AskUserQuestion is refused while the away flag exists, and only then.
aw() { out=$(echo '{"tool_name":"AskUserQuestion","tool_input":{}}' | AWAY_FLAG="$T/away" bash "$TOOLS/away-guard.sh" --hook); }
rm -f "$T/away"; aw; ok "(8) no away flag: the question goes through" "$([ -z "$out" ] && echo 1)" "$out"
touch "$T/away"; aw; ok "(8) away flag set: the question is refused, naming STATE and P-388" "$([ "$(deny)" = 1 ] && echo "$out" | grep -q 'P-388' && echo "$out" | grep -q 'STATE' && echo 1)" "$out"
jq -e '[.hooks.PreToolUse[] | select(.matcher == "^AskUserQuestion$") | .hooks[].command | select(test("away-guard.sh --hook"))] | length == 1' "$ROOTD/.claude/settings.json" >/dev/null
ok "(8) settings.json runs the away hook on AskUserQuestion" "$([ $? = 0 ] && echo 1)"
finish
