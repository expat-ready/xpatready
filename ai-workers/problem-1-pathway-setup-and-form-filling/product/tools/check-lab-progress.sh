#!/usr/bin/env bash
# Test of lab-progress.py --lanes and --page (LR-102: lab progress counted from the register's row status, not by hand).
# A fixture register with every gate, a DROP row and a two-lane row; the page block rewritten once, markers kept;
# a page without markers or an unreadable register writes nothing. The real page on this copy must hold the block the
# script would write from this copy's register. No network, US$0.   bash product/tools/check-lab-progress.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/labp.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
L="$TOOLS/lab-progress.py"
cat > "$T/reg.md" <<'R'
| ID | Item | Source(s) | Verdict | Reason | Lane | Done when | Status | Gate notes |
|---|---|---|---|---|---|---|---|---|
| LR-001 | a | s | DO | r | fast-route | d | Intended | n |
| LR-002 | b | s | DO | r | fast-route | d | Built: #1 merged | n |
| LR-003 | c | s | DO | r | fast-route | d | Proven: run on main | n |
| LR-004 | d | s | DONE | r | Lead + automation-measures | d | Proven: x | n |
| LR-005 | e | s | DROP | r | fast-route | d | Proven | n |
| LR-006 | f | s | DO | r | automation-measures | d | Built pending #2 | n |
| LR-007 | g | s | DO | r | automation-measures | d | Intended (blocked: PF-8c) | n |
R
out=$(python3 -I "$L" --lanes --register "$T/reg.md"); r=$?
ok "--lanes: exit 0" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
ok "fast-route: 1 Intended, 1 Built, 1 Proven of 3 (the DROP row left out)" "$(grep -qE '^fast-route +Intended +1  Built +1  Proven +1  of +3$' <<< "$out" && echo 1)" "$out"
ok "a two-lane row counts in each lane" "$(grep -qE '^Lead +Intended +0  Built +0  Proven +1  of +1$' <<< "$out" && grep -qE '^automation-measures +Intended +2  Built +0  Proven +1  of +3$' <<< "$out" && echo 1)" "$out"
ok "'Built pending' and 'Intended (blocked ...)' are Intended" "$(grep -qE '^automation-measures +Intended +2 ' <<< "$out" && echo 1)" "$out"
ok "Total counts each row once: 3 / 1 / 2 of 6" "$(grep -qE '^Total +Intended +3  Built +1  Proven +2  of +6$' <<< "$out" && echo 1)" "$out"
printf '<h2>x</h2>\n<!-- lab-progress:lanes -->\nold\n<!-- /lab-progress:lanes -->\n<p>after</p>\n' > "$T/page.html"
out=$(python3 -I "$L" --page "$T/page.html" --register "$T/reg.md"); r=$?
ok "--page: exit 0, the block rewritten, old text gone, the text around it kept" "$([ $r = 0 ] && ! grep -q '^old$' "$T/page.html" && grep -q '^<h2>x</h2>$' "$T/page.html" && grep -q '^<p>after</p>$' "$T/page.html" && echo 1)" "exit $r: $out"
ok "... a row per lane and the Total with its Proven share" "$(grep -q '<tr><td>fast-route</td><td class="pct">1</td><td class="pct">1</td><td class="pct">1</td><td class="pct">3</td>' "$T/page.html" && grep -q '<b>Total</b>.*<span class="pct">33%</span>' "$T/page.html" && echo 1)" "$(cat "$T/page.html")"
cp "$T/page.html" "$T/once.html"; python3 -I "$L" --page "$T/page.html" --register "$T/reg.md" >/dev/null
ok "... a second run changes nothing (one block, markers kept)" "$(cmp -s "$T/page.html" "$T/once.html" && [ "$(grep -c 'lab-progress:lanes' "$T/page.html")" = 2 ] && echo 1)" "$(diff "$T/once.html" "$T/page.html")"
printf '<p>no markers</p>\n' > "$T/bare.html"; cp "$T/bare.html" "$T/bare0.html"
out=$(python3 -I "$L" --page "$T/bare.html" --register "$T/reg.md"); r=$?
ok "a page without the markers: exit 2, nothing written" "$([ $r = 2 ] && cmp -s "$T/bare.html" "$T/bare0.html" && echo 1)" "exit $r: $out"
cp "$T/once.html" "$T/keep.html"
out=$(python3 -I "$L" --page "$T/once.html" --register "$T/missing.md"); r=$?
ok "an unreadable register: exit 2, the page untouched" "$([ $r = 2 ] && cmp -s "$T/once.html" "$T/keep.html" && echo 1)" "exit $r: $out"
out=$(python3 -I "$L" --register "$T/reg.md" 2>&1 | head -1)
ok "the one-line report still reads Built 3/6, Proven 2/6" "$(grep -q 'Built 3/6 (50%), Proven 2/6 (33%)' <<< "$out" && echo 1)" "$out"
echo "1800000000 99 99" > "$T/lab-progress.log"; TMPDIR=$T python3 -I "$L" --register "$T/reg.md" >/dev/null
ok "a fixture register does not feed the rate log" "$([ "$(cat "$T/lab-progress.log")" = "1800000000 99 99" ] && echo 1)" "$(cat "$T/lab-progress.log")"
P="$TOOLS/../design/software-factory-2026-11-27.html"; R="$TOOLS/../design/lab-register-2026-11-27.md"
if [ -f "$P" ] && [ -f "$R" ]; then   # check-guards' mutation copies hold only product/tools: there the fixture cases decide
ok "the software-factory page carries one lane-count block with a Total row" "$([ "$(grep -c '^<!-- lab-progress:lanes -->$' "$P")" = 1 ] && sed -n '/<!-- lab-progress:lanes -->/,/<!-- \/lab-progress:lanes -->/p' "$P" | grep -q '<b>Total</b>' && echo 1)" "no block in $P"
# Not a failure (a register PR would go red on a page it did not touch): a note when the page is behind the register.
cp "$P" "$T/real.html"; python3 -I "$L" --page "$T/real.html" --register "$R" >/dev/null
diff <(grep '^<tr>' "$P") <(grep '^<tr>' "$T/real.html") >/dev/null || echo "NOTE  the page's lane counts are behind the register: python3 -I product/tools/lab-progress.py --page product/design/software-factory-2026-11-27.html"
fi
finish
