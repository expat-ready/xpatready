#!/usr/bin/env bash
# A435 (founder 27 Nov; LR-158): the auto-queue's own cases stay. Routine PRs queue by themselves on the reviewer's
# Approve through main's queue gate; this test names the cases that prove it, in the tests that live with their scripts,
# and fails when any goes red or disappears: check-queue-gate.sh (queue-gate.sh label: a reviewed green head is
# labelled; a stale-head Approve, a forged Approve and every Lead-read path are refused) and check-label-sweep.sh (a
# label a workflow's token put on, the self-applied approval, comes off unless main's queue gate judges the PR
# eligible). The Lead-read side is check-lead-label.sh. US$0, no network.
#   bash product/tools/check-auto-queue-cases.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
need() {  # need <test> <grep -F line>...: the test is green and prints PASS for each
  local t=$1 o rc; shift; o=$(bash "$TOOLS/$t" 2>&1); rc=$?
  ok "$t is green" "$([ $rc = 0 ] && echo 1)" "exit $rc: $(tail -3 <<< "$o")"
  local c; for c in "$@"; do ok "  $t keeps: $c" "$(grep -qF "PASS  $c" <<< "$o" && echo 1)" "no such PASS line"; done; }
need check-queue-gate.sh \
  "label: the owner's \"Reviewer: Approve <head>\", ci green, no Lead-read path: labelled" \
  "label refused: the Approve names an older commit" \
  "label refused: an Approve from an account that is not the owner's nor a known reviewer" \
  "label refused: .github/workflows/x.yml keeps the Lead's read" \
  "label refused: .mergify.yml keeps the Lead's read" \
  "label refused: ai-workers/x/product/tools/queue-gate.sh keeps the Lead's read" \
  "label refused: .claude/skills/next/SKILL.md keeps the Lead's read" \
  "label refused: ai-workers/x/prototype/studio/prisma/schema/cases.prisma keeps the Lead's read" \
  "label refused: ai-workers/x/prototype/studio/api/src/permissions.ts keeps the Lead's read"
need check-label-sweep.sh \
  "19 Nov: a bot label queue-gate.sh refuses comes off" \
  "B194: a github-actions[bot] label on a PR queue-gate.sh judges eligible is kept"
finish
