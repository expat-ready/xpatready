#!/usr/bin/env bash
# ENF-733 (a), guard 26 (founder 19 Nov, P-733 (1), P-734 (2): "should not become a line in the rule. It should be
# enforced by hooks"): focus-check.py and its place in lane-preflight.sh --hook. A builder brief naming an R1 item or a
# build row that is not on the focus list is refused with the reason and the list's path; one for a listed item passes;
# tooling, qa, Lead and no-row briefs pass untouched; no list refuses a builder brief. Throwaway list and backlog, then
# the real product/focus-list.md against the two Leads' own lane lines. No network, US$0.
#   bash product/tools/check-focus-list.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
# ENF-803: a start brief's Duplicate check names the main sha and the exact IST time (brief-fresh.py); HEAD stands for main here
export BRIEF_MAIN=HEAD; FRESH_DUP="read main $(git rev-parse --short=9 HEAD) at $(TZ=Asia/Kolkata date +%H:%M) IST;"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
cat > "$T/focus-list.md" <<'L'
# Focus list (test)
| Item | Rows a brief may name | Lead | Parts left |
|---|---|---|---|
| R1.37 | J-37 | Lead B | J-37 |
| R1.30, R1.31 | FO-4 | Lead B | FO-4 part 2a |
| R1.48 | PF-19b, J-48, QA-495 | Lead B | PF-19b part 3, then J-48 |
| R1.80 | - | Build Lead C | none |
L
cat > "$T/BACKLOG.md" <<'B'
| Row | Area | What |
|---|---|---|
| ENF-733 | tooling (P-734 (2)) | the focus order is enforced |
| QA-9 | qa (after-merge) | a qa row |
| REC-1 | records (the Lead) | a records row |
| X-9 | runtime (case side) | a build row that is not on the list |
| B25 | Lead form: the sales lead form | a build row whose area starts with the word Lead |
| PF-19b | runtime (platform: sending) | one sending path |
B
M="Model: Opus 5.5, effort: medium."
fc() { out=$(printf '%s\n' "$1" | FOCUS_LIST="${2-$T/focus-list.md}" FOCUS_BACKLOG_DIR="$T" python3 -I "$TOOLS/focus-check.py" 2>&1); r=$?; }
fc "$M Build J-37 per lead-b-briefs/J-rows.md §J-37, from main; one PR (R1.37)."
ok "a brief for a listed item and its row passes" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "exit $r: $out"
fc "$M R1.31 with R1.30: build FO-4 part 2a from main."
ok "two items on one list line both pass" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
fc "$M Start R1.76 notes from main; one PR."
ok "a brief for an off-list R1 item is refused, naming it" "$([ $r = 1 ] && echo "$out" | grep -q '^OFF THE FOCUS LIST: this brief is for R1.76,' && echo 1)" "exit $r: $out"
ok "the refusal gives the reason (P-733, P-734) and the list's path" "$(echo "$out" | grep 'P-733 (1)' | grep 'P-734' | grep -q "$T/focus-list.md" && echo 1)" "$out"
fc "$M Start R1.760 from main; R1.37 is nearly done."
ok "R1.760 is not R1.76 or R1.7: refused by its full number" "$([ $r = 1 ] && echo "$out" | grep -q 'is for R1.760,' && echo 1)" "exit $r: $out"
fc "$M Build CS-NT1 part 1 from CS-NT1-1.md, branched from main."
ok "an off-list build row with no R1 item in the brief is refused (family id)" "$([ $r = 1 ] && echo "$out" | grep -q 'is for CS-NT1,' && echo 1)" "exit $r: $out"
fc "$M /next runtime X-9. Done when: check-x.sh exits 0."
ok "an off-list backlog row of a build area is refused" "$([ $r = 1 ] && echo "$out" | grep -q 'is for X-9,' && echo 1)" "exit $r: $out"
fc "$M Build J-37 (R1.37). Clash: the mail swap is shared with CS-NT1 and X-9; Duplicate check: BK-13 no."
ok "a listed item's brief may name other rows as context (clash, duplicate check)" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
fc "$M R1.76 notes, part 1, from main; J-37 is its neighbour."
ok "what the brief names first is what it is for: an off-list item first is refused" "$([ $r = 1 ] && echo "$out" | grep -q 'is for R1.76,' && echo 1)" "exit $r: $out"
fc "$M After J-37 merges, build CS-NT1 part 1 from main."
ok "a row after build is what the brief is for, wherever it stands" "$([ $r = 1 ] && echo "$out" | grep -q 'is for CS-NT1,' && echo 1)" "exit $r: $out"
fc "$M J-37 is merged. /next runtime X-9. Done when: check-x.sh exits 0."
ok "the row after /next is what the brief is for, whatever is named first" "$([ $r = 1 ] && echo "$out" | grep -q 'is for X-9,' && echo 1)" "exit $r: $out"
fc "$M Build J-37 (R1.37), then CS-NT1 part 1 (R1.76 notes), back to back in one lane."
ok "the second item of a chained line (then) is checked too" "$([ $r = 1 ] && echo "$out" | grep -q 'is for CS-NT1,' && echo 1)" "exit $r: $out"
fc "$M Build J-37 per J-rows.md from main; after it merges, X-9 in its own PR."
ok "... and so is the one after \"merges,\"" "$([ $r = 1 ] && echo "$out" | grep -q 'is for X-9,' && echo 1)" "exit $r: $out"
fc "$M Read CS-NT1-1.md; merge origin/main into claude/notes-lane; diff-only Approve; open the PR as non-draft."
ok "a brief named only by its brief file (Read CS-NT1-1.md) is for that file's row" "$([ $r = 1 ] && echo "$out" | grep -q 'is for CS-NT1,' && echo 1)" "exit $r: $out"
fc "$M On claude/notes-lane: follow its resume steps, open the PR per build-lead-c-briefs/X-9.md."
ok "... also behind a folder, after per" "$([ $r = 1 ] && echo "$out" | grep -q 'is for X-9,' && echo 1)" "exit $r: $out"
fc "$M Read \`CS-NT1-1.md\`; merge origin/main; open the PR as non-draft."
ok "... with the file name in backticks" "$([ $r = 1 ] && echo "$out" | grep -q 'is for CS-NT1,' && echo 1)" "exit $r: $out"
fc "$M On claude/notes-lane: follow its recorded resume steps, merge origin/main, open the PR (build-lead-c-briefs/CS-NT1-1.md)."
ok "a brief naming nothing but a brief file in brackets is for that file's row" "$([ $r = 1 ] && echo "$out" | grep -q 'is for CS-NT1,' && echo 1)" "exit $r: $out"
fc "$M Follow J-37.md and X-9.md; open both PRs."
ok "... every file it cites: one off the list refuses" "$([ $r = 1 ] && echo "$out" | grep -q 'is for X-9,' && echo 1)" "exit $r: $out"
fc "$M On claude/j37-journey: merge origin/main, open the PR (lead-b-briefs/J-37.md)."
ok "... and a listed row's file passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
fc "$M Read J-37.md and CS-NT1-1.md; merge origin/main; open both PRs."
ok "a second brief file joined by and is checked too" "$([ $r = 1 ] && echo "$out" | grep -q 'is for CS-NT1,' && echo 1)" "exit $r: $out"
fc "$M Run /next runtime J-37; afterwards open the PR per CS-NT1-1.md."
ok "a listed row does not cover an off-list brief file after per" "$([ $r = 1 ] && echo "$out" | grep -q 'is for CS-NT1,' && echo 1)" "exit $r: $out"
fc "$M Build J-37 from main; also read \`CS-NT1-1.md\` and open its PR."
ok "... nor one in backticks after read" "$([ $r = 1 ] && echo "$out" | grep -q 'is for CS-NT1,' && echo 1)" "exit $r: $out"
fc "$M Read J-48.md; open the PR per lead-b-briefs/PF-19b3.md, from J-37-2.md."
ok "brief files of listed rows pass (PF-19b3.md is PF-19b's part 3, J-37-2.md is J-37)" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
fc "$M FO-9 is on main. Run /next runtime J-37 and take one row."
ok "with a /next row, a finished row named before it is context" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
fc "$M Per REC-1's gate and ENF-733, build CS-NT1 part 1 (R1.76) from main."
ok "a tooling or records row named first does not exempt a builder brief" "$([ $r = 1 ] && echo "$out" | grep -q 'is for CS-NT1,' && echo 1)" "exit $r: $out"
fc "$M Build CS-NT1 part 1."$'\n'"/lead-watch reads it; report back to /lead, /qa walks it."
ok "/lead-watch, or /lead and /qa inside a sentence, do not exempt a builder brief" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
fc "$M /next screens B25 and also CS-NT1 for R1.76."
ok "an area that only starts with the word Lead (\"Lead form\") is a build area" "$([ $r = 1 ] && echo "$out" | grep -q 'is for B25,' && echo 1)" "exit $r: $out"
fc "$M On claude/intelligent-mayer-ymi4sl: open the PF-19b part 3 PR (lead-b-briefs/PF-19b3.md), then J-48 per J-48.md; QA-495 after #2181; P-733 and SHA-256 are not rows."
ok "file names, PR numbers, decision ids and other hyphenated words are not rows" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
fc "$M Run /next runtime ENF-733. R1.6 took 10 PRs; R1.76 has 4 parts; CS-NT1 waits."
ok "a tooling brief passes untouched, whatever it mentions" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
fc "$M Row REC-1: fold the records; R1.76 is named in them."
ok "a records brief passes untouched" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
fc "/qa capability R1.76: test CS-NT1 like a person. $M"
ok "a qa brief passes untouched" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
fc "/lead: take over as Lead 92; R1.76 and CS-NT1 are in the hand-over. $M"
ok "a Lead brief passes untouched" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
fc "You are Lead B. $M Shape CS-NT1 and X-9 for later; keep your list for R1.76 current."
ok "a Lead's own start (You are Lead B) passes untouched" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
fc "Records only: fold R1.76 and CS-NT1 into CAPABILITIES; no code. $M"
ok "a records-only brief with no row of its own passes untouched" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
fc "Run qa after-merge for #2235, then capability R1.76 (CS-NT1). $M"
ok "a qa start written without the slash passes untouched" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
fc "$M You are a standby. Wait for the Lead's message."
ok "a brief naming no R1 item and no row is not checked" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
fc "$M Build J-37 (R1.37) from main." "$T/none.md"
ok "no focus list: a builder brief is refused, with the path it looked at" "$([ $r = 1 ] && echo "$out" | grep -q "no focus list could be read at $T/none.md" && echo 1)" "exit $r: $out"
fc "$M Run /next runtime ENF-733." "$T/none.md"
ok "no focus list: a tooling brief still passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
# The hook, fed the JSON Claude Code sends on start_session and create_session (lane-preflight.sh --hook).
G4=$'\nDuplicate check: '"$FRESH_DUP"$' searched BACKLOG; none\nDone when: check-x.sh exits 0'
# B204: each hook brief carries its Item line; a throwaway waves list puts R1.37 and R1.76 in the active wave, so the focus list is what is tested here.
printf '| # | Map row | Status |\n|---|---|---|\n| R1.37 | x | Partial |\n| R1.76 | x | Partial |\n| R1.1 | x | Partial |\n| R1.2 | x | Partial |\n' > "$T/caps.md"
printf 'R1.37\t1\tJ5\nR1.76\t1\tJ7\nR1.1\t1\tJ0\nR1.2\t1\tJ0\n' > "$T/waves.tsv"; export WAVES_TSV="$T/waves.tsv" WAVES_CAPS="$T/caps.md"
hook() { out=$(jq -n --arg n "$1" --arg p "$2$G4"$'\nItem: '"$3" '{tool_name:$n, tool_input:{target:"cloud", prompt:$p}}' | FOCUS_LIST="$T/focus-list.md" FOCUS_BACKLOG_DIR="$T" bash "$TOOLS/lane-preflight.sh" --hook 2>&1); r=$?; }
hook start_session "Row CS-NT1. $M R1.76 notes, part 1." R1.76
ok "hook: a start for an off-list item is denied with the reason and the list's path" "$(echo "$out" | jq -e --arg f "$T/focus-list.md" '.hookSpecificOutput.permissionDecision == "deny" and (.hookSpecificOutput.permissionDecisionReason | test("CS-NT1") and test("P-733") and contains($f))' >/dev/null 2>&1 && echo 1)" "$out"
hook mcp__ccr__create_session "Row CS-NT1. $M R1.76 notes, part 1." R1.76
ok "hook: a cloud create_session for an off-list item is denied too" "$(echo "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1 && echo 1)" "$out"
hook start_session "Row J-37. $M R1.37 booking page." R1.37
ok "hook: a start for a listed item passes" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "exit $r: $out"
hook start_session "Row ENF-733. $M Tooling; R1.76 is mentioned." "none (tooling)"
ok "hook: a tooling start passes" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "exit $r: $out"
# The real list (the mutation copy carries it too): readable, and the two Leads' own lane lines of 19 Nov pass.
REAL="$TOOLS/../focus-list.md"
out=$(python3 -I "$TOOLS/focus-check.py" --list 2>&1); r=$?
ok "product/focus-list.md is there and lists items and rows" "$([ -f "$REAL" ] && [ $r = 0 ] && echo "$out" | grep -q '^items: R1\.' && echo "$out" | grep -q '^rows: .*J-' && echo 1)" "exit $r: $out"
real() { out=$(printf '%s\n' "$1" | python3 -I "$TOOLS/focus-check.py" 2>&1); r=$?; }
n=0; badl=""
while IFS= read -r l; do [ -n "$l" ] || continue; n=$((n + 1)); real "$M $l"; [ $r = 0 ] || badl="$badl [$l → $out]"; done <<'LINES'
On claude/vibrant-meitner-3t1yfe: merge origin/main, diff-only re-review, open the J-109 PR (lead-b-briefs/J-rows.md §J-109).
Build J-37 per lead-b-briefs/J-rows.md §J-37, from main; one PR; reviewer Approve.
On claude/intelligent-mayer-ymi4sl: merge origin/main, diff-only re-review, open the PF-19b part 3 PR (lead-b-briefs/PF-19b3.md); after it merges, J-48 per build-lead-c-briefs/J-48.md in its own PR.
On claude/screens-fo3st2: follow its recorded resume steps (#2103 is on main), merge origin/main, split to ≤800 lines per P-610 with J-41 (lead-b-briefs/J-rows.md §J-41) in the last PR; reviewer Approve each.
Build FO-4 part 2a from main per lead-b-briefs/wave1-sales.md (row 2, §FO-4 parts 2a), starting from the resume note on claude/screens-fo4p2a-resume; its J-test in the same PR; reviewer and breaker.
Build FO-9a's phone part per lead-b-briefs/FO-9a.md (19 Nov amendment) with J-33 in the same PR, from main after #2181; reviewer.
Build PF-5s part 1 per lead-b-briefs/PF-5s1.md with J-19 (lead-b-briefs/J-rows.md §J-19) in the same PR, from main after #1959; Stripe on its recorded answers.
Build J-28 per lead-b-briefs/J-rows.md §J-28 from main after #2196; one PR; reviewer.
Build J-38 per lead-b-briefs/J-rows.md §J-38 from main on the FO-3w screens and the demo inbox (check_r138_r140_booking_page_walk.ts shows the path); one PR; reviewer.
Read J-77.md; merge origin/main into claude/j77-journey; diff-only Approve; open the PR as non-draft.
Build CS-DL1b with J-74 inside, from CS-DL1b.md, branched from main.
Build CS-D1t with J-67 inside, from CS-D1t.md, branched from main.
Build AUD-1m part 2a, then 2b with J-8 inside, from AUD-1m-2.md, back to back in one lane.
LINES
ok "the real list passes Lead B's and Build Lead C's $n lane lines of 19 Nov" "$([ $n = 13 ] && [ -z "$badl" ] && echo 1)" "$badl"
real "$M Build CS-NT1 part 1 for R1.76 notes from CS-NT1-1.md."
ok "the real list refuses CS-NT1 (R1.76 notes, four parts left), naming product/focus-list.md" "$([ $r = 1 ] && echo "$out" | grep 'CS-NT1' | grep -q 'ai-workers/problem-1-pathway-setup-and-form-filling/product/focus-list.md' && echo 1)" "exit $r: $out"
finish
