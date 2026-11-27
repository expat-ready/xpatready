#!/usr/bin/env bash
# Bundle A4 "Review converges" (LR-130, LR-133, LR-135, LR-121; lab triage 27 Nov §3): a review ends in at most two rounds
# with a clear verdict, round 2 reads only the diff (P-277), findings carry a severity, and a start brief carries a stop
# rule next to its "Done when". Proves (1) brief-check.sh's stop rule on fixed texts (its --self-test), (2) the reviewer
# agent and /next carry the rules, (3) the root REVIEW.md holds them (only in a checkout with a commit: the mutation copy
# of check-guards.sh copies .claude/ but not REVIEW.md). US$0, no network.   bash product/tools/check-review-converges.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
ROOTD="$(cd "$TOOLS/../../../.." && pwd)"
has() { grep -qF -- "$2" "$1" 2>/dev/null; }

# (1) LR-121: the stop rule, on fixed texts
out=$(bash "$TOOLS/brief-check.sh" --self-test 2>&1); r=$?
ok "(1) brief-check.sh --self-test passes (a brief with Done when and no stop rule is refused)" "$([ $r = 0 ] && echo 1)" "exit $r: $(printf '%s' "$out" | grep -m1 '^FAIL')"
out=$(printf 'Row X-1.\nDone when: x.sh exits 0.\n' | bash "$TOOLS/brief-check.sh" --stop-only 2>&1); r=$?
ok "(1) --stop-only refuses a Done when with no stop rule, naming LR-121" "$([ $r = 1 ] && printf '%s' "$out" | grep -q 'LR-121' && echo 1)" "exit $r: $out"

# (2) The reviewer agent and /next carry the rules (LR-135, LR-133, P-277)
A="$ROOTD/.claude/agents/screen-reviewer.md"; S="$ROOTD/.claude/skills/next/SKILL.md"
for w in 'REVIEW.md' '**Important**' '**Nit** (at most 3)' '**Pre-existing**' 'never repeat a finding' 'git diff <that sha>..HEAD' 'one-line reason' 'never a third round without' 'Lead allows round 3:'; do
  has "$A" "$w"; ok "(2) screen-reviewer.md says: $w" "$([ $? = 0 ] && echo 1)" "missing in $A"
done
has "$A" 'model: opus' && has "$A" 'effort: medium'; ok "(2) screen-reviewer.md stays on Opus medium (P-788)" "$([ $? = 0 ] && echo 1)"
L="$ROOTD/.claude/skills/lead/SKILL.md"
has "$L" 'with a stop rule ("stop after N tries", LR-121'; ok "(2) lead/SKILL.md: every brief's Done when carries a stop rule (LR-121, the brief template)" "$([ $? = 0 ] && echo 1)" "missing in $L"
for w in 'REVIEW.md' 'Stop rule (LR-121)' 'stop after N tries' 'reads only the diff since (P-277)' 'Fix every Important'; do
  has "$S" "$w"; ok "(2) next/SKILL.md says: $w" "$([ $? = 0 ] && echo 1)" "missing in $S"
done

# (3) REVIEW.md (LR-130): severities, nit cap, skips, count-first summary, verdict line, risky PRs, two rounds
if git -C "$ROOTD" rev-parse -q --verify HEAD >/dev/null 2>&1; then
  R="$ROOTD/REVIEW.md"
  for w in '| **Important** |' '**At most 3**' '| **Pre-existing** |' 'Lockfiles, generated files' '`N Important, N Nit, N Pre-existing`' \
           '`Reviewer: <Approve|Changes|Block> <full head SHA>`' 'fixed, or resolved with a one-line reason' '**Round 2: diff only.**' '`git diff <reviewed-sha>..HEAD`' '**Stop.**' 'bug class' 'it is round 3 and needs the tech' 'touches none of the PR'"'"'s files keeps the approval' 'an Important still open after round 2 is a Block'; do
    has "$R" "$w"; ok "(3) REVIEW.md says: $w" "$([ $? = 0 ] && echo 1)" "missing in $R"
  done
  n=$(wc -l < "$R" 2>/dev/null || echo 999); ok "(3) REVIEW.md stays short (under 80 lines: an instruction file, AGENTS.md rule 8)" "$([ "$n" -lt 80 ] && echo 1)" "$n lines"
else echo "skip  (3) REVIEW.md: not a checkout with a commit (the mutation copy)"; fi
finish
