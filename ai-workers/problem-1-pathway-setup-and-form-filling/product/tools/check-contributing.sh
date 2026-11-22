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
# Every markdown link target (not a web address; an anchor is cut off, a bare anchor skipped) exists, relative to the root.
missing=$(grep -oE '\]\([^)]+\)' "$C" | sed -E 's/^\]\(//; s/\)$//; s/#.*//' | grep -vE '^([a-z]+://|$)' | while read -r l; do [ -e "$ROOTD/$l" ] || echo "$l"; done)
ok "every link in CONTRIBUTING.md names a file or folder that exists" "$([ -z "$missing" ] && echo 1)" "missing: $missing"
n=$(grep -oE '\]\([^)]+\)' "$C" | wc -l | tr -d ' '); ok "CONTRIBUTING.md has links to follow (at least 15)" "$([ "$n" -ge 15 ] && echo 1)" "$n links"
for f in AGENTS.md WAY-OF-WORKING.md RULES.md BACKLOG.md lead-read-paths.txt .mergify.yml pr-rules.yml push-guard.sh pull_request_template.md; do
  ok "CONTRIBUTING.md points to $f" "$(grep -qF "$f)" "$C" && echo 1)"; done
ok "CONTRIBUTING.md says how to ask (Question for the tech lead)" "$(grep -q 'Question for the tech lead' "$C" && echo 1)"
ok "CONTRIBUTING.md names the read line the hook and the gate accept (Lead read the diff: <full head SHA>)" "$(grep -q 'Lead read the diff: <full head SHA>' "$C" && echo 1)"
ok "CONTRIBUTING.md names the reviewer line the label guard reads (Reviewer: Approve <full head SHA>)" "$(grep -q 'Reviewer: Approve <full head SHA>' "$C" && echo 1)"
ok "CONTRIBUTING.md follows P-683: the Approve on the branch first, then the PR opened not as a draft (Lead 2, 22 Nov)" "$(grep -q 'P-683' "$C" && grep -qi 'Approve on the branch first, then open the PR, not as a draft' "$C" && grep -qi 'draft never joins the queue' "$C" && echo 1)"
ok "CONTRIBUTING.md stays one page (under 60 lines)" "$([ "$(wc -l < "$C")" -lt 60 ] && echo 1)" "$(wc -l < "$C") lines"
for l in '^\*\*Done when:\*\*' '^Duplicate check:' '^\*\*Before and after:\*\*' '^\*\*On the demo:\*\*' '^\*\*Cost:\*\*' '^\*\*Questions\*\*'; do
  ok "the template carries the line $l" "$(grep -qE "$l" "$TPL" && echo 1)"; done
ok "the template's last two lines are Done when then Duplicate check (brief-check reads nothing else as the Done when; review m10)" "$(tail -3 "$TPL" | grep -v '^$' | head -1 | grep -qx '\*\*Done when:\*\*' && tail -1 "$TPL" | grep -qx 'Duplicate check:' && echo 1)"
out=$(bash "$TOOLS/brief-check.sh" < "$TPL" 2>&1); r=$?
ok "an unfilled template fails pr-rules' body check (brief-check.sh exits 1)" "$([ "$r" = 1 ] && echo 1)" "exit $r: $out"
ok "... naming both the Done when and the Duplicate check line" "$(grep -q 'Done when' <<< "$out" && grep -q 'Duplicate check' <<< "$out" && echo 1)" "$out"
filled=$(sed -E 's/^\*\*Done when:\*\*$/**Done when:** `bash product\/tools\/check-x.sh` exits 0./; s/^Duplicate check:$/Duplicate check: searched BACKLOG.md and open PRs; none/' "$TPL")
out=$(printf '%s\n' "$filled" | bash "$TOOLS/brief-check.sh" 2>&1); r=$?
ok "the same template with its Done when and Duplicate check filled passes brief-check.sh" "$([ "$r" = 0 ] && echo 1)" "exit $r: $out"
IP="$ROOTD/ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/tools/item-proof.mjs"
d=$(printf '%s\n' "$filled" | node "$IP" detect 2>&1); r=$?
ok "the template as it stands claims no item and has no bad Completes: line (item-proof.mjs detect)" "$([ "$r" = 0 ] && grep -q '"items":\[\]' <<< "$d" && grep -q '"bad":\[\]' <<< "$d" && echo 1)" "exit $r: $d"
# Review M1: each example, typed as the template says (the text inside its backticks, on its own line), is read by the
# real parser of its check.
form() { grep -oE "\`$1[^\`]*\`" "$TPL" | head -1 | tr -d '\`'; }
c=$(form 'Completes: '); d=$(printf '%s\n' "$filled" "$c" | node "$IP" detect 2>&1)
ok "the Completes: example, typed out, is read as a claim by item-proof.mjs detect ($c)" "$(grep -q '"items":\["R1.77"\]' <<< "$d" && echo 1)" "$d"
c=$(form 'Card unchanged: ' | sed 's/<the reason>/the change keeps every entry point/')
ok "the Card unchanged: example, typed out with a reason, is read by module-cards.py's own pattern" "$(printf '%s\n' "$filled" "$c" | python3 -I -c '
import re, sys
src = open(sys.argv[1]).read(); pat = re.search(r"reason = re\.search\(r\"(.+?)\", body, re\.M\)", src).group(1)
m = re.search(pat, sys.stdin.read(), re.M); print(1 if m and re.search(r"\w", m.group(1)) else 0)' "$TOOLS/module-cards.py")" "$c"
c=$(form 'STANDARDS §1: ' | sed 's/<.*>/the gap, two options, this one is smallest/')
ok "the STANDARDS §1: example, typed out, is read by deps-line-check.sh's own pattern" "$(printf '%s\n' "$filled" "$c" | tr -d '\r' | sed -nE "$(grep -oE "s/\^STANDARDS §1:[^']*" "$TOOLS/deps-line-check.sh" | head -1)" | grep -q . && echo 1)" "$c"
c=$(form 'Size exception: ')
ok "the Size exception: example has the form pr-size.sh reads (Size exception: P-<digits> once filled)" "$(sed 's/NNN/779/' <<< "$c" | grep -qE 'Size exception:[[:space:]]*P-[0-9]+' && echo 1)" "$c"
finish
