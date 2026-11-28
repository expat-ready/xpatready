#!/usr/bin/env bash
# Test of escape-map.py (LR-142: the layer map with escape counts per layer). A throwaway git repository with two
# reverts, a fixture runs file (a ci episode of two failed runs ended by a green one, a cancelled run inside a nightly
# episode, an older episode before --since), fixture layer and escape files; the page block rewritten once; a page
# without markers or unreadable runs writes nothing; the real files on this copy parse. No network, US$0.
#   bash product/tools/check-escape-map.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/escmap.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
E="$TOOLS/escape-map.py"
mkdir -p "$T/r/p"; cp "$E" "$T/r/p/"; E2="$T/r/p/escape-map.py"; g() { git -C "$T/r" -c user.name=t -c user.email=t@t "$@"; }
g init -q; echo a > "$T/r/a"; g add -A; g commit -qm "a change"; g commit -q --allow-empty -m 'Revert "a change"'
g commit -q --allow-empty -m 'records: Revert note (not a revert)'; g commit -q --allow-empty -m 'Revert "another"'
mapfile -t R < <(g log --format=%h --grep='^Revert "' | cut -c1-9)
cat > "$T/runs.json" <<'J'
[{"workflow":"ci","id":1,"created_at":"2026-11-10T01:00:00Z","conclusion":"failure"},
 {"workflow":"ci","id":2,"created_at":"2026-11-10T02:00:00Z","conclusion":"success"},
 {"workflow":"ci","id":10,"created_at":"2026-11-20T01:00:00Z","conclusion":"failure"},
 {"workflow":"ci","id":11,"created_at":"2026-11-20T02:00:00Z","conclusion":"failure"},
 {"workflow":"ci","id":12,"created_at":"2026-11-20T03:00:00Z","conclusion":"success"},
 {"workflow":"nightly","id":20,"created_at":"2026-11-21T01:00:00Z","conclusion":"failure"},
 {"workflow":"nightly","id":21,"created_at":"2026-11-22T01:00:00Z","conclusion":"cancelled"},
 {"workflow":"nightly","id":22,"created_at":"2026-11-23T01:00:00Z","conclusion":"failure"},
 {"workflow":"other","id":30,"created_at":"2026-11-23T01:00:00Z","conclusion":"failure"}]
J
printf 'layer\tcatches\tmisses\nCI\tthe PR checks\tskipped suites <slow>\nqa\tcapabilities\ttooling\n' > "$T/layers.tsv"
esc() { printf '# escapes\nid\tkind\tdate\tlayer\twhat\tsource\n' > "$T/esc.tsv"; [ $# -gt 0 ] && printf '%s\n' "$@" >> "$T/esc.tsv"; }
run() { (cd "$T/r/p" && python3 -I "$E2" --since 2026-11-14 --runs "$T/runs.json" --layers "$T/layers.tsv" --escapes "$T/esc.tsv" --ref HEAD "$@"); }
esc; out=$(run); r=$?
ok "4 escapes: one ci episode (two failures, one id), one nightly episode across a cancelled run, two reverts; exit 0" "$([ $r = 0 ] && grep -q '^escapes 4 since 2026-11-14: 0 named, 4 not named$' <<< "$out" && echo 1)" "exit $r: $out"
ok "... ids ci:10, nightly:20, revert:<sha>; the 10 Nov episode (before --since) and 'other' left out" "$(grep -q '^unnamed ci:10 (2026-11-20)' <<< "$out" && grep -q '^unnamed nightly:20 ' <<< "$out" && grep -q "^unnamed revert:${R[0]} " <<< "$out" && grep -q "^unnamed revert:${R[1]} " <<< "$out" && ! grep -q 'ci:1 \|other' <<< "$out" && echo 1)" "$out"
ok "... a subject that only mentions Revert is not a revert" "$([ "$(grep -c '^unnamed revert:' <<< "$out")" = 2 ] && echo 1)" "$out"
esc "ci:10	main-red	2026-11-20	CI	x	y" "revert:${R[0]}	revert	2026-11-28	qa	x	y"; out=$(run)
ok "named escapes count against their layer; the rest stay unnamed" "$(grep -qE '^layer CI +1$' <<< "$out" && grep -qE '^layer qa +1$' <<< "$out" && grep -q '^escapes 4 since 2026-11-14: 2 named, 2 not named$' <<< "$out" && echo 1)" "$out"
esc "ci:10	main-red	2026-11-20	Linting	x	y" "ci:99	main-red	2026-11-20	CI	x	y"; out=$(run); r=$?
ok "a layer not in the map, or an id that is not an escape: bad lines, not counted" "$(grep -q "^bad   ci:10: layer 'Linting' is not in layer-map.tsv" <<< "$out" && grep -q '^bad   ci:99: not an escape' <<< "$out" && grep -qE '^layer CI +0$' <<< "$out" && [ $r = 0 ] && echo 1)" "exit $r: $out"
out=$(run --strict); r=$?
ok "--strict: exit 1 with unnamed or bad lines" "$([ $r = 1 ] && echo 1)" "exit $r"
esc "ci:10	main-red	2026-11-20	CI	x	y" "nightly:20	main-red	2026-11-21	CI	x	y" "revert:${R[0]}	revert	2026-11-28	qa	x	y" "revert:${R[1]}	revert	2026-11-28	qa	x	y"; out=$(run --strict); r=$?
ok "--strict: exit 0 when every escape is named" "$([ $r = 0 ] && grep -q '4 named, 0 not named' <<< "$out" && echo 1)" "exit $r: $out"
printf '<h2>x</h2>\n<!-- escape-map -->\nold\n<!-- /escape-map -->\n<p>after</p>\n' > "$T/page.html"; esc "ci:10	main-red	2026-11-20	CI	x	y"
out=$(run --page "$T/page.html"); r=$?
ok "--page: the block rewritten with a row per layer, its escapes, and the unnamed count; text around kept" "$([ $r = 0 ] && ! grep -q '^old$' "$T/page.html" && grep -q '^<p>after</p>$' "$T/page.html" && grep -q '<tr><td>CI</td><td>the PR checks</td><td>skipped suites &lt;slow&gt;</td><td class="pct">1</td></tr>' "$T/page.html" && grep -q '<b>Not named yet</b></td><td></td><td></td><td class="pct">3</td>' "$T/page.html" && echo 1)" "exit $r: $(cat "$T/page.html")"
cp "$T/page.html" "$T/once.html"; run --page "$T/page.html" >/dev/null
ok "... a second run changes nothing" "$(cmp -s "$T/page.html" "$T/once.html" && echo 1)" "$(diff "$T/once.html" "$T/page.html")"
printf '<p>none</p>\n' > "$T/bare.html"; cp "$T/bare.html" "$T/bare0.html"; out=$(run --page "$T/bare.html"); r=$?
ok "a page without the markers: exit 2, nothing written" "$([ $r = 2 ] && cmp -s "$T/bare.html" "$T/bare0.html" && echo 1)" "exit $r: $out"
echo "{not json" > "$T/bad.json"; out=$( (cd "$T/r/p" && python3 -I "$E2" --runs "$T/bad.json" --layers "$T/layers.tsv" --escapes "$T/esc.tsv" --ref HEAD --page "$T/once.html") ); r=$?
ok "unreadable runs: exit 2, the page untouched" "$([ $r = 2 ] && cmp -s "$T/once.html" "$T/page.html" && echo 1)" "exit $r: $out"
D="$TOOLS/../design"
if [ -f "$D/layer-map.tsv" ] && [ -f "$D/escapes.tsv" ]; then   # check-guards' mutation copies hold only product/tools
  out=$(cd "$T/r/p" && python3 -I "$E2" --runs "$T/runs.json" --layers "$D/layer-map.tsv" --escapes "$D/escapes.tsv" --ref HEAD)
  ok "this copy's layer-map.tsv has the eight layers, and escapes.tsv names only layers in it" "$([ "$(grep -c '^layer ' <<< "$out")" = 8 ] && ! grep -q "is not in layer-map" <<< "$out" && echo 1)" "$out"
fi
finish
