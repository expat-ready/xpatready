#!/usr/bin/env bash
# B193 part 5 (P-619 step 6; P-188, P-611): a rule triage never loses a rule. check-docs.sh reads each
# rules/rule-id-map-*.tsv (every ID the register had before the triage and where it went) and fails when a kept ID is
# not a RULES.md row, a merged or retired row is not word for word in the paired side file, a merged row's target is gone,
# or an old ID is missing from the map. Fixture pages in a throwaway copy, US$0, no network.
#   bash product/tools/check-rule-triage.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
docs_copy "$T/c"; P="$T/c/$PRODREL"; CD="$P/tools/check-docs.sh"; mkdir -p "$P/rules"
run() { out=$(bash "$CD" 2>/dev/null); r=$?; }
sha() { printf '%s' "$1" | sha256sum | cut -c1-16; }
printf '| # | Date | Decision |\n|---|---|---|\n| P-1 | 16 Nov | test |\n| P-9 | 16 Nov | test |\n' > "$P/DECISIONS.md"
L1='| P-1 | A kept rule. | hook: a.sh | 16 Nov |'; L2='| P-2 | The same as P-1, said again. | prose | 16 Nov |'; L3='| P-3 | A one-time step, done. | prose | 16 Nov |'
reg() { { echo '# Rule register (as of **P-9**, test)'; echo; echo '| ID | Rule | Enforced by | As of |'; echo '|---|---|---|---|'; printf '%s\n' "$@"; } > "$P/RULES.md"; }
side() { { echo '# Moved rows'; echo; echo '| ID | Rule | Enforced by | As of |'; echo '|---|---|---|---|'; printf '%s\n' "$@"
  echo; echo '| ID | Outcome | Into | Was in section | Why |'; echo '|---|---|---|---|---|'; echo '| P-2 | merged | P-1 | Test | same |'; } > "$P/rules/merged-and-retired-t.md"; }
map() { { echo "# old_rows=${OLD:-3}"; echo 'id	outcome	where	line_sha'; printf '%s\n' "$@"; } > "$P/rules/rule-id-map-t.tsv"; }
good() { reg "$L1"; side "$L2" "$L3"; OLD=3 map "P-1	kept	RULES.md	-" "P-2	merged	P-1	$(sha "$L2")" "P-3	retired	P-1	$(sha "$L3")"; }

good; run
ok "a triage whose every old ID is kept, merged or retired with its line passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
good; reg; run
ok "a kept ID that is no longer a RULES.md row fails, naming it" "$([ $r = 1 ] && echo "$out" | grep -q 'RULE MAP: P-1 is kept but is not a RULES.md row' && echo 1)" "exit $r: $out"
good; reg '| IDX-6 | Moved rulings (P-1) stand as recorded; word for word in the side file. | prose | 17 Nov |'; run
ok "a kept ID moved under an IDX row that names it in parentheses passes (P-686)" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
good; reg '| IDX-6 | Moved rulings stand as recorded; P-1 is mentioned outside brackets. | prose | 17 Nov |'; run
ok "an IDX row naming the ID outside parentheses does not count" "$([ $r = 1 ] && echo "$out" | grep -q 'RULE MAP: P-1 is kept but is not a RULES.md row' && echo 1)" "exit $r: $out"
good; side "$L3"; run
ok "a merged row missing from the side file fails" "$([ $r = 1 ] && echo "$out" | grep -q 'RULE MAP: P-2 is merged but its old line is not word for word' && echo 1)" "exit $r: $out"
good; side "$L2" '| P-3 | A one-time step, reworded. | prose | 16 Nov |'; run
ok "a retired row whose text was changed fails (word for word)" "$([ $r = 1 ] && echo "$out" | grep -q 'RULE MAP: P-3 is retired but its old line is not word for word' && echo 1)" "exit $r: $out"
good; OLD=3 map "P-1	kept	RULES.md	-" "P-2	merged	P-1	$(sha "$L2")"; run
ok "an old ID missing from the map fails on the count" "$([ $r = 1 ] && echo "$out" | grep -q 'lists 2 IDs but the register had old_rows=3' && echo 1)" "exit $r: $out"
good; reg '| P-4 | Another. | prose | 16 Nov |'; OLD=3 map "P-4	kept	RULES.md	-" "P-2	merged	P-1	$(sha "$L2")" "P-3	retired	P-1	$(sha "$L3")"; run
ok "a merged row whose target left RULES.md fails" "$([ $r = 1 ] && echo "$out" | grep -q 'RULE MAP: P-2 is merged into P-1, which is not a RULES.md row' && echo 1)" "exit $r: $out"
good; OLD=3 map "P-1	kept	RULES.md	-" "P-2	merged	P-1	$(sha "$L2")" "P-3	dropped	-	-"; run
ok "an outcome other than kept, merged or retired fails" "$([ $r = 1 ] && echo "$out" | grep -q 'RULE MAP: P-3 has outcome "dropped"' && echo 1)" "exit $r: $out"
good; OLD=3 map "P-1	kept	RULES.md	-" "P-1	kept	RULES.md	-" "P-3	retired	P-1	$(sha "$L3")"; run
ok "an ID listed twice fails" "$([ $r = 1 ] && echo "$out" | grep -q 'RULE MAP: P-1 is listed twice' && echo 1)" "exit $r: $out"
good; sed -i 's/^# old_rows=3$/# old_rows=3x/' "$P/rules/rule-id-map-t.tsv"; run
ok "a map the check cannot read (old_rows=3x) fails, never passes unchecked" "$([ $r = 1 ] && echo "$out" | grep -q 'RULE MAP: the check of rule-id-map-t.tsv stopped with an error' && echo 1)" "exit $r: $out"
finish
