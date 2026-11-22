#!/usr/bin/env bash
# P-785 (2) step 4 (founder 22 Nov: "anybody can come into my lab and start"): CONTRIBUTING.md at the root and the PR
# template stay true. Every link in CONTRIBUTING.md names a file or folder that exists; it names the rule files it
# points to; the template carries every line pr-rules and the label guard read (Done when, Duplicate check, Completes,
# Card unchanged, Size exception, STANDARDS §1); an unfilled template FAILS brief-check.sh (pr-rules' body check), so a
# PR opened from it cannot pass by accident, and the same template filled in passes. US$0, no network.
#   bash product/tools/check-contributing.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
ROOTD="$(cd "$TOOLS/../../../.." && pwd)"; C="$ROOTD/CONTRIBUTING.md"; TPL="$ROOTD/.github/pull_request_template.md"
[ -f "$C" ] || { ok "CONTRIBUTING.md exists at the repository root" 0 "no $C"; finish; }
[ -f "$TPL" ] || { ok ".github/pull_request_template.md exists" 0 "no $TPL"; finish; }
# Every markdown link target (not a web address, not an anchor) exists, relative to the root.
missing=$(grep -oE '\]\([^)#]+\)' "$C" | sed -E 's/^\]\(//; s/\)$//' | grep -vE '^[a-z]+://' | while read -r l; do [ -e "$ROOTD/$l" ] || echo "$l"; done)
ok "every link in CONTRIBUTING.md names a file or folder that exists" "$([ -z "$missing" ] && echo 1)" "missing: $missing"
n=$(grep -cE '\]\([^)#]+\)' "$C"); ok "CONTRIBUTING.md has links to follow (at least 15)" "$([ "$n" -ge 15 ] && echo 1)" "$n links"
for f in AGENTS.md WAY-OF-WORKING.md RULES.md BACKLOG.md lead-read-paths.txt .mergify.yml pr-rules.yml pull_request_template.md; do
  ok "CONTRIBUTING.md points to $f" "$(grep -qF "$f)" "$C" && echo 1)"; done
ok "CONTRIBUTING.md says how to ask (Question for the tech lead)" "$(grep -q 'Question for the tech lead' "$C" && echo 1)"
ok "CONTRIBUTING.md names the read line the hook and the gate accept (Lead read the diff: <full head SHA>)" "$(grep -q 'Lead read the diff: <full head SHA>' "$C" && echo 1)"
ok "CONTRIBUTING.md names the reviewer line the label guard reads (Reviewer: Approve <full head SHA>)" "$(grep -q 'Reviewer: Approve <full head SHA>' "$C" && echo 1)"
ok "CONTRIBUTING.md stays one page (under 60 lines)" "$([ "$(wc -l < "$C")" -lt 60 ] && echo 1)" "$(wc -l < "$C") lines"
for l in '^\*\*Done when:\*\*' '^Duplicate check:' '`Completes: R1\.77`' '`Card unchanged: ' '`Size exception: P-NNN`' '`STANDARDS §1: ' '^\*\*On the demo:\*\*' '^\*\*Cost:\*\*' '^\*\*Questions\*\*'; do
  ok "the template carries the line $l" "$(grep -qE "$l" "$TPL" && echo 1)"; done
out=$(bash "$TOOLS/brief-check.sh" < "$TPL" 2>&1); r=$?
ok "an unfilled template fails pr-rules' body check (brief-check.sh exits 1)" "$([ "$r" = 1 ] && echo 1)" "exit $r: $out"
ok "... naming both the Done when and the Duplicate check line" "$(grep -q 'Done when' <<< "$out" && grep -q 'Duplicate check' <<< "$out" && echo 1)" "$out"
filled=$(sed -E 's/^\*\*Done when:\*\*$/**Done when:** `bash product\/tools\/check-x.sh` exits 0./; s/^Duplicate check:$/Duplicate check: searched BACKLOG.md and open PRs; none/' "$TPL")
out=$(printf '%s\n' "$filled" | bash "$TOOLS/brief-check.sh" 2>&1); r=$?
ok "the same template with its Done when and Duplicate check filled passes brief-check.sh" "$([ "$r" = 0 ] && echo 1)" "exit $r: $out"
d=$(printf '%s\n' "$filled" | node "$ROOTD/ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/tools/item-proof.mjs" detect 2>&1); r=$?
ok "the template's Completes: example is not read as a claim or a bad line (item-proof.mjs detect exits 0, no items)" "$([ "$r" = 0 ] && grep -q '"items":\[\]' <<< "$d" && echo 1)" "exit $r: $d"
finish
