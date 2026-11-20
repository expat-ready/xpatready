#!/usr/bin/env bash
# E15 (P-772; P-254, P-74): decision-impact.sh exempts a DECISIONS row tagged "Kind: tooling." (as workflow and scope),
# refuses a new ID in its frozen EXEMPT list (it ends at P-764), and fails a row from P-773 on that states no impact (the
# word "Impact", or all of time, cost and quality). Fixture pages in a throwaway copy, US$0, no network.
#   bash product/tools/check-decision-impact.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
P="$T/p"; mkdir -p "$P/tools" "$P/decisions" "$P/qa"; cp "$TOOLS/decision-impact.sh" "$P/tools/"; DI="$P/tools/decision-impact.sh"
printf '| C1.1 | A capability (P-770). | Works |\n' > "$P/qa/CAPABILITIES.md"; printf '| B9 | runtime | a backlog row (P-771, P-776) |\n' > "$P/BACKLOG.md"
printf '| P-60 | 1 Oct | older than the first checked row |\n' > "$P/decisions/P-60-old.md"
dec() { { printf '| # | Date | Decision |\n|---|---|---|\n'; cat; } > "$P/DECISIONS.md"; }
run() { out=$(bash "$DI" 2>&1); r=$?; }
printf '| P-770 | 21 Nov | A product ruling. Impact: time 0, cost 0, quality up. |\n| P-771 | 21 Nov | Built later. Time none, cost US$0, quality same. |\n' | dec; run
ok "rows tied to a capability or a backlog row, with their impact stated, pass" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
printf '| P-772 | 21 Nov | A tooling ruling. Kind: tooling. Impact: none. |\n| P-773 | 21 Nov | A workflow ruling. Kind: workflow. Impact: time saved. |\n' | dec; run
ok "a row tagged Kind: tooling. is exempt by itself, as Kind: workflow. (E15)" "$([ $r = 0 ] && echo "$out" | grep -q 'P-772 → workflow, tooling or scope (Kind: tag)' && echo 1)" "exit $r: $out"
printf '| P-772 | 21 Nov | A tooling ruling, no tag. Impact: none. |\n' | dec; run
ok "an untagged row with nothing a person can see still fails (NO CAPABILITY)" "$([ $r = 1 ] && echo "$out" | grep -q 'NO CAPABILITY: P-772' && echo 1)" "exit $r: $out"
printf '| P-773 | 21 Nov | A workflow ruling. Kind: workflow. |\n| P-774 | 21 Nov | Kind: scope. It costs time. |\n| P-775 | 21 Nov | Kind: tooling. Its time, cost and quality are unchanged. |\n' | dec; run
ok "from P-773 a row with no Impact and not all of time, cost and quality fails, naming each" "$([ $r = 1 ] && echo "$out" | grep -q 'NO IMPACT: P-773' && echo "$out" | grep -q 'NO IMPACT: P-774' && ! echo "$out" | grep -q 'NO IMPACT: P-775' && echo 1)" "exit $r: $out"
printf '| P-772 | 21 Nov | Kind: tooling. No impact words. |\n| ~~P-776~~ | 21 Nov | ~~Withdrawn. Kind: workflow.~~ |\n' | dec; run
ok "rows before P-773 and struck-through rows are not impact-checked" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
printf '| P-777 | 21 Nov | Kind: workflow. The big-impact choice. |\n' | dec; run
ok "a lower-case impact inside another word is not the Impact statement" "$([ $r = 1 ] && echo "$out" | grep -q 'NO IMPACT: P-777' && echo 1)" "exit $r: $out"
sed -i 's/^EXEMPT=" P-764 /EXEMPT=" P-780 P-764 /' "$DI"; printf '| P-780 | 21 Nov | Kind: workflow. Impact: none. |\n' | dec; run
ok "a new ID added to the frozen EXEMPT list fails (E15: tag the row instead)" "$([ $r = 1 ] && echo "$out" | grep -q 'EXEMPT FROZEN: P-780' && echo 1)" "exit $r: $out"
finish
