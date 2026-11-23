#!/usr/bin/env bash
# P-611, P-615 (row G-3): check-docs.sh fails a RULES.md register row with no enforced-by field (a hook, CI step,
# script, or "prose"), an enforcer file it names that is not on the branch (E7, P-772) and a RULES.md over 25 KB, so every rule says what enforces it and the start read stays small.
# Fixture pages in a throwaway copy, US$0, no network.
#   bash product/tools/check-rule-register.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
docs_copy "$T/c"; P="$T/c/$PRODREL"; CD="$P/tools/check-docs.sh"
run() { out=$(bash "$CD" 2>/dev/null); r=$?; }
printf '| # | Date | Decision |\n|---|---|---|\n| P-9 | 15 Nov | test |\n' > "$P/DECISIONS.md"
page() { { echo '# Rule register (as of **P-9**, test)'; echo; echo '| ID | Rule | Enforced by | As of |'; echo '|---|---|---|---|'; cat; } > "$P/RULES.md"; }
mkdir -p "$P/tools/x" "$T/c/.github/workflows"; : > "$P/tools/a.sh"; : > "$T/c/.github/workflows/b.yml"; : > "$P/tools/x/c.sh"   # E7: named enforcers exist
printf '| P-1 | A rule. | hook: a.sh | 15 Nov |\n| P-2 | A rule. | CI: b.yml | 15 Nov |\n| P-3 | A rule. | script: c.sh | 15 Nov |\n| P-4 | A rule. | prose | 15 Nov |\n' | page; run
ok "a register whose rows all name an enforcer passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
printf '| P-1 | A rule. | hook: a.sh | 15 Nov |\n| P-5 | A rule with no enforcer. |  | 15 Nov |\n' | page; run
ok "a row with an empty enforced-by fails and names the row" "$([ $r = 1 ] && echo "$out" | grep -q 'RULES REGISTER: P-5 has no enforced-by' && echo 1)" "exit $r: $out"
printf '| P-6 | A rule. | someone remembers | 15 Nov |\n' | page; run
ok "an enforced-by that is not hook, CI, script or prose fails" "$([ $r = 1 ] && echo "$out" | grep -q 'RULES REGISTER: P-6 has no enforced-by' && echo 1)" "exit $r: $out"
printf '| P-7 | A rule missing a cell. | 15 Nov |\n' | page; run
ok "a row with three cells fails" "$([ $r = 1 ] && echo "$out" | grep -q 'needs exactly 4 cells' && echo 1)" "exit $r: $out"
printf '| P-1 | A rule. | prose | 15 Nov |\n| P-1 | Again. | prose | 15 Nov |\n' | page; run
ok "a rule ID used twice fails" "$([ $r = 1 ] && echo "$out" | grep -q 'rule ID P-1 appears twice' && echo 1)" "exit $r: $out"
{ printf '| P-1 | A rule. | prose | 15 Nov |\n\n## Compass\n| Number | Healthy |\n|---|---|\n| Burn | 3%% |\n'; } | page; run
ok "a different table after the register is not read as rows" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
printf '| P-8 | A rule. | hook: | 15 Nov |\n| P-9 | A rule. | prosecco | 15 Nov |\n' | page; run
ok "a bare 'hook:' and a word that only starts with prose fail" "$([ $r = 1 ] && echo "$out" | grep -q 'P-8 has no enforced-by' && echo "$out" | grep -q 'P-9 has no enforced-by' && echo 1)" "exit $r: $out"
printf '| P-1 | A rule. | prose | 15 Nov |\n\n| ID | Rule | Enforced-by | As of |\n|---|---|---|---|\n| P-2 | Unchecked. |  | 15 Nov |\n' | page; run
ok "a misspelt register header fails" "$([ $r = 1 ] && echo "$out" | grep -q 'not spelled exactly' && echo 1)" "exit $r: $out"
printf '# Rules in force (as of **P-9**, test)\n\n* A long paragraph rule, no register.\n' > "$P/RULES.md"; run
ok "a page with no register table fails" "$([ $r = 1 ] && echo "$out" | grep -q "RULES REGISTER: RULES.md has no" && echo 1)" "exit $r: $out"
{ printf '| P-1 | A rule. | prose | 15 Nov |\n'; for i in $(seq 10 260); do printf '| P-%s | %0100d | prose | 15 Nov |\n' "$i" 0; done; } | page; run
ok "a page over 25 KB fails" "$([ $r = 1 ] && echo "$out" | grep -q 'RULES TOO BIG' && echo 1)" "exit $r: $out"
printf '| P-1 | A rule. | prose | 15 Nov |\n' | page; printf '| P-13 | 15 Nov | test |\n' >> "$P/DECISIONS.md"; run
ok "the 3-rows-behind check still works on a register page" "$([ $r = 1 ] && echo "$out" | grep -q 'RULES LAG: RULES.md is as of P-9 but DECISIONS reaches P-13' && echo 1)" "exit $r: $out"
# E7 (P-772, P-611a): an enforcer file named in the Enforced by cell must be on the branch.
printf '| # | Date | Decision |\n|---|---|---|\n| P-9 | 15 Nov | test |\n' > "$P/DECISIONS.md"
printf '| P-1 | A rule. | script: gone.py via check-docs.sh and a.sh | 15 Nov |\n' | page; run
ok "E7: a named enforcer file that does not exist fails, naming the row and the file" "$([ $r = 1 ] && echo "$out" | grep -q 'RULES REGISTER: P-1 is enforced by gone.py, but no such file' && ! echo "$out" | grep -qE 'by (check-docs|a)\.sh' && echo 1)" "exit $r: $out"
printf '| P-1 | A rule. | script: x/c.sh (part); CI: .github/workflows/b.yml | 15 Nov |\n' | page; run
ok "E7: an enforcer named with a path passes when that path ends a real file" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
printf '| P-1 | A rule. | script: y/c.sh | 15 Nov |\n| P-2 | A rule. | script: c.sh.bak.py | 15 Nov |\n' | page; run
ok "E7: a path whose folder differs, or a look-alike name, fails" "$([ $r = 1 ] && echo "$out" | grep -q 'P-1 is enforced by y/c.sh' && echo "$out" | grep -q 'P-2 is enforced by c.sh.bak.py' && echo 1)" "exit $r: $out"
: > "$P/tools/xa.sh"; rm -f "$P/tools/a.sh"; printf '| P-1 | A rule. | hook: a.sh | 15 Nov |\n' | page; run
ok "E7: a file whose name only ends in the enforcer's name (xa.sh for a.sh) does not count" "$([ $r = 1 ] && echo "$out" | grep -q 'P-1 is enforced by a.sh' && echo 1)" "exit $r: $out"
printf '| P-1 | A rule. | script: later.sh (owed) | 15 Nov |\n| P-2 | A rule. | prose (rules/x.md, gate.mjs owed) | 15 Nov |\n' | page; run
ok "E7: a cell that says owed claims nothing yet and passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
printf '| P-690 | A rule. | script: plan-watch.py via check-docs.sh | 15 Nov |\n| IDX-23 | Rows stand. | hook: resource-claim-guard.sh | 15 Nov |\n' | page; run
ok "E7: the cells known stale when the check landed (P-690, IDX-23) wait for the tech lead's RULES.md fix" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
: > "$P/tools/new.sh"; printf '| P-1 | A rule. | script: new.sh | 15 Nov |\n' | page; run
ok "E7: a new enforcer file not yet committed counts (a builder runs check-docs before the commit)" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
printf 'ignored.sh\n' > "$T/c/.gitignore"; : > "$P/tools/ignored.sh"; printf '| P-1 | A rule. | script: ignored.sh | 15 Nov |\n' | page; run
ok "E7: an ignored file is not on the branch and fails" "$([ $r = 1 ] && echo "$out" | grep -q 'P-1 is enforced by ignored.sh' && echo 1)" "exit $r: $out"
finish
