#!/usr/bin/env bash
# ENF-733 (b), guard 27 (founder 19 Nov, P-734 (1), (2)): check-docs.sh refuses a DECISIONS row newer than P-734, dated
# 19 to 22 Nov, that changes the workflow (a row in decision-impact.sh's EXEMPT, or one only tooling, qa, records or Lead backlog rows carry), unless its text carries the word fix
# and "Broken: <what is broken>". Throwaway copies, US$0.
#   bash product/tools/check-workflow-lock.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
docs_copy "$T/c"; P="$T/c/$PRODREL"; CD="$P/tools/check-docs.sh"
exempt() { printf '#!/bin/bash\nEXEMPT=" %s "   # workflow rows (test)\n' "$*" > "$P/tools/decision-impact.sh"; }
decs() { { echo '| # | Date | Decision |'; echo '|---|---|---|'; printf '%s\n' "$@"; echo '| P-734 | 19 Nov | **One engine to the evening of 22 Nov.** Workflow row. |'; } > "$P/DECISIONS.md"; }
run() { out=$(bash "$CD" 2>/dev/null); r=$?; }
lock() { echo "$out" | grep -q "^WORKFLOW LOCK: $1 "; }
exempt P-736 P-735 P-734 P-733
decs '| P-735 | 20 Nov | **Lanes pick their own next item (founder).** A new way to order work. |'; run
ok "a workflow row after P-734 dated 20 Nov with no fix is refused" "$([ $r = 1 ] && lock P-735 && echo "$out" | grep -q 'P-734 (1)' && echo 1)" "exit $r: $out"
decs '| P-735 | 20 Nov | **Batches of two (founder).** A fix. Broken: 19 of 32 batches failed on 20 Nov (flow-measure.py). |'; run
ok "the same row with the word fix and what is broken passes" "$([ $r = 0 ] && ! lock P-735 && echo 1)" "exit $r: $out"
decs '| P-735 | 21 Nov | **Batches of two (founder).** This fixes the queue. |'; run
ok "the word fix without what is broken is refused" "$([ $r = 1 ] && lock P-735 && echo 1)" "exit $r: $out"
decs '| P-735 | 21 Nov | **Batches of two (founder).** Broken: the queue. A prefix is not the word: fixture. |'; run
ok "what is broken without the word fix is refused" "$([ $r = 1 ] && lock P-735 && echo 1)" "exit $r: $out"
for d in 19 22; do decs "| P-736 | $d Nov | **A new review step (founder).** |"; run
  ok "dated $d Nov is inside the lock" "$([ $r = 1 ] && lock P-736 && echo 1)" "exit $r: $out"; done
decs '| P-735 | 23 Nov | **Lanes pick their own next item (founder).** |'; run
ok "a workflow row dated 23 Nov passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
decs '| P-737 | 20 Nov | **The booking page shows the time zone (founder).** A product row, not in EXEMPT. |'; run
ok "a capability row (not in decision-impact.sh's EXEMPT) dated 20 Nov passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
# A workflow row outside EXEMPT that decision-impact.sh passes on a tooling backlog row (as P-618 on B192) is still a workflow row.
mkdir -p "$P/qa"; echo '| C1.1 | a capability | P-740 |' > "$P/qa/CAPABILITIES.md"
bl() { { echo '| Row | Area | What |'; printf '%s\n' "$@"; } > "$P/BACKLOG.md"; }
decs '| P-738 | 20 Nov | **Labels need a second click (founder).** Enforced by B300. |'
bl '| B300 | tooling (P-738; Lead) | a label step |'; run
ok "a row carried only by a tooling backlog row is refused" "$([ $r = 1 ] && lock P-738 && echo 1)" "exit $r: $out"
bl '| B300 | tooling (P-738; Lead) | a label step |' '| B301 | screens (booking) | the page a person sees, P-738 |'; run
ok "the same row also carried by a build row passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
decs '| P-740 | 20 Nov | **A capability decision.** Tooling in B300. |'; bl '| B300 | tooling (P-740; Lead) | its tooling |'; run
ok "a row a capability row carries passes, whatever tooling row names it" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
rm -f "$P/BACKLOG.md"
decs '| ~~P-735~~ | 20 Nov | ~~**Lanes pick their own next item.**~~ Withdrawn. |'; run
ok "a struck-through row is not checked" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
decs; run
ok "P-734 itself and earlier rows are not checked" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
decs '| P-735 | 20 Nov | **Lanes pick their own next item (founder).** |'; rm "$P/tools/decision-impact.sh"; run
ok "no readable EXEMPT list: a new row dated 20 Nov is refused, not waved through" "$([ $r = 1 ] && lock P-735 && echo "$out" | grep -q 'could not be read' && echo 1)" "exit $r: $out"
finish
