#!/usr/bin/env bash
# Test of escape-map.py (LR-142: the layer map with escape counts per layer). Fixture runs of the scheduled nightly
# (attempts, a cancelled night, a hand-started run, a run before --since) and a throwaway git history with merges: a
# revert on main of a change that was on main, a revert merged by a PR of a change already on main, a revert inside a PR
# branch of that branch's own change (not an escape), a revert naming no commit, and a subject that only mentions Revert.
# The page block rewritten once; bad lines; exit codes. No network, US$0.   bash product/tools/check-escape-map.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/escmap.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
mkdir -p "$T/r/p"; cp "$TOOLS/escape-map.py" "$T/r/p/"; g() { git -C "$T/r" -c user.name=t -c user.email=t@t "$@"; }
c() { echo "$1" > "$T/r/${1// /-}"; g add -A; g commit -qm "$1"; g rev-parse HEAD; }
g init -q -b main; echo "p/" > "$T/r/.git/info/exclude"; A=$(c "change a"); B=$(c "change b")
g revert --no-edit "$A" >/dev/null; RA=$(g rev-parse HEAD)                                   # on main, a was on main: escape
g checkout -q -b pr1; g revert --no-edit "$B" >/dev/null; RB=$(g rev-parse HEAD)              # PR branch reverts b (on main): escape
g checkout -q main; g merge -q --no-ff pr1 -m "Merge pr1"
g checkout -q -b pr2; X=$(c "change x"); g revert --no-edit "$X" >/dev/null; RX=$(g rev-parse HEAD)   # x never reached main
g checkout -q main; g merge -q --no-ff pr2 -m "Merge pr2"
g commit -q --allow-empty -m 'Revert "something old"'; RN=$(g rev-parse HEAD)                  # names no commit: counted
g commit -q --allow-empty -m 'records: Revert note'
cat > "$T/runs.json" <<'J'
[{"id":1,"event":"schedule","created_at":"2026-11-10T01:00:00Z","conclusion":"failure"},
 {"id":2,"event":"schedule","created_at":"2026-11-11T01:00:00Z","conclusion":"success"},
 {"id":10,"event":"schedule","created_at":"2026-11-15T01:00:00Z","conclusion":"success","attempts":["failure"]},
 {"id":11,"event":"schedule","created_at":"2026-11-16T01:00:00Z","conclusion":"cancelled"},
 {"id":12,"event":"schedule","created_at":"2026-11-17T01:00:00Z","conclusion":"failure"},
 {"id":13,"event":"workflow_dispatch","created_at":"2026-11-17T09:00:00Z","conclusion":"success"},
 {"id":14,"event":"schedule","created_at":"2026-11-18T01:00:00Z","conclusion":"success"},
 {"id":20,"event":"schedule","created_at":"2026-11-19T01:00:00Z","conclusion":"failure"},
 {"id":21,"event":"schedule","created_at":"2026-11-20T01:00:00Z","conclusion":"success","attempts":["failure","failure"]},
 {"id":22,"event":"workflow_dispatch","created_at":"2026-11-20T05:00:00Z","conclusion":"failure"},
 {"id":23,"event":"schedule","created_at":"2026-11-21T01:00:00Z","conclusion":"success"},
 {"id":24,"event":"workflow_dispatch","created_at":"2026-11-22T05:00:00Z","conclusion":"failure"},
 {"id":25,"event":"schedule","created_at":"2026-11-23T01:00:00Z","conclusion":"failure"},
 {"id":26,"event":"workflow_dispatch","created_at":"2026-11-23T05:00:00Z","conclusion":"success"},
 {"id":27,"event":"schedule","created_at":"2026-11-24T01:00:00Z","conclusion":"failure"},
 {"id":28,"event":"schedule","created_at":"2026-11-25T01:00:00Z","conclusion":"success","attempts":["cancelled"]},
 {"id":29,"event":"schedule","created_at":"2026-11-26T01:00:00Z","conclusion":"failure"}]
J
printf '# map\nlayer\tcatches\tmisses\nCI\tthe PR checks\tskipped suites <slow>\nqa\tcapabilities\ttooling\n' > "$T/layers.tsv"
esc() { printf '# escapes\nid\tkind\tdate\tlayer\twhat\tsource\n' > "$T/esc.tsv"; [ $# -gt 0 ] && printf '%s\n' "$@" >> "$T/esc.tsv"; }
run() { (cd "$T/r/p" && python3 -I escape-map.py --since "${SINCE:-2026-11-14}" --runs "$T/runs.json" --layers "$T/layers.tsv" --escapes "$T/esc.tsv" --ref main "$@"); }
s9() { echo "${1:0:9}"; }
esc; out=$(run); r=$?
ok "2 nightly episodes: a re-run that went green still opens one (id 10); the cancelled night does not close it; exit 0" "$([ $r = 0 ] && grep -q '^unnamed nightly:10 (2026-11-15)' <<< "$out" && ! grep -q 'nightly:12 ' <<< "$out" && echo 1)" "exit $r: $out"
ok "... a first-attempt green closes it (14), the next red opens another (20), and its green re-run (21) does not close it" "$(grep -q '^unnamed nightly:20 (2026-11-19)' <<< "$out" && ! grep -q 'nightly:21 \|nightly:1 \|nightly:13\|nightly:22' <<< "$out" && echo 1)" "$out"
ok "reverts: on main of a main change, and by a PR of a main change, are escapes" "$(grep -q "^unnamed revert:$(s9 "$RA") " <<< "$out" && grep -q "^unnamed revert:$(s9 "$RB") " <<< "$out" && echo 1)" "$out"
ok "... a revert inside a PR of that PR's own change is not; one naming no commit is; a mention is not" "$(! grep -q "revert:$(s9 "$RX")" <<< "$out" && grep -q "^unnamed revert:$(s9 "$RN") " <<< "$out" && [ "$(grep -c '^unnamed revert:' <<< "$out")" = 3 ] && echo 1)" "$out"
ok "hand-started runs neither open (24) nor close (26) an episode; a green after a cancelled first attempt (28) does not close one" "$(grep -q '^unnamed nightly:25 (2026-11-23)' <<< "$out" && ! grep -q 'nightly:24\|nightly:27\|nightly:29' <<< "$out" && echo 1)" "$out"
ok "... 6 escapes in all" "$(grep -q '^escapes 6 since 2026-11-14: 0 named, 6 not named$' <<< "$out" && echo 1)" "$out"
esc "nightly:10	main-red	2026-11-15	CI	x	y" "revert:$(s9 "$RA")	revert	2026-11-28	qa	x	y"; out=$(run)
ok "named escapes count against their layer; the rest stay unnamed" "$(grep -qE '^layer CI +1$' <<< "$out" && grep -qE '^layer qa +1$' <<< "$out" && grep -q '2 named, 4 not named$' <<< "$out" && echo 1)" "$out"
esc "nightly:10	main-red	2026-11-15	Linting	x	y" "nightly:99	main-red	2026-11-20	CI	x	y" "nightly:20	main-red	2026-11-19	CI	x	y" "nightly:20	main-red	2026-11-19	CI	x	y" "revert:$(s9 "$RA")	main-red	2026-11-28	qa	x	y"; out=$(run); r=$?
ok "bad lines: a layer not in the map, an id that is not an escape, an id named twice, a kind that does not match" "$(grep -q "^bad   nightly:10: layer 'Linting'" <<< "$out" && grep -q '^bad   nightly:99: not an escape' <<< "$out" && grep -q '^bad   nightly:20: named twice' <<< "$out" && grep -q "^bad   revert:$(s9 "$RA"): kind 'main-red' does not match" <<< "$out" && grep -qE '^layer CI +1$' <<< "$out" && [ $r = 0 ] && echo 1)" "exit $r: $out"
out=$(run --strict); r=$?
ok "--strict: exit 1 with unnamed or bad lines" "$([ $r = 1 ] && echo 1)" "exit $r"
esc "nightly:10	main-red	x	CI	x	y" "nightly:20	main-red	x	CI	x	y" "nightly:25	main-red	x	CI	x	y" "revert:$(s9 "$RA")	revert	x	qa	x	y" "revert:$(s9 "$RB")	revert	x	qa	x	y" "revert:$(s9 "$RN")	revert	x	qa	x	y"; out=$(run --strict); r=$?
ok "--strict: exit 0 when every escape is named" "$([ $r = 0 ] && grep -q '6 named, 0 not named' <<< "$out" && echo 1)" "exit $r: $out"
printf '<h2>x</h2>\n<!-- escape-map -->\nold\n<!-- /escape-map -->\n<p>after</p>\n' > "$T/page.html"; esc "nightly:10	main-red	x	CI	x	y"
out=$(run --page "$T/page.html"); r=$?
ok "--page: a row per layer (escaped), its escapes, the unnamed count; text around kept" "$([ $r = 0 ] && ! grep -q '^old$' "$T/page.html" && grep -q '^<p>after</p>$' "$T/page.html" && grep -q '<tr><td>CI</td><td>the PR checks</td><td>skipped suites &lt;slow&gt;</td><td class="pct">1</td></tr>' "$T/page.html" && grep -q '<b>Not named yet</b></td><td></td><td></td><td class="pct">5</td>' "$T/page.html" && echo 1)" "exit $r: $(cat "$T/page.html")"
cp "$T/page.html" "$T/once.html"; run --page "$T/page.html" >/dev/null
ok "... a second run changes nothing" "$(cmp -s "$T/page.html" "$T/once.html" && echo 1)" "$(diff "$T/once.html" "$T/page.html")"
printf '<p>none</p>\n' > "$T/bare.html"; cp "$T/bare.html" "$T/bare0.html"; out=$(run --page "$T/bare.html"); r=$?
ok "a page without the markers: exit 2, nothing written" "$([ $r = 2 ] && cmp -s "$T/bare.html" "$T/bare0.html" && echo 1)" "exit $r: $out"
echo "{not json" > "$T/bad.json"; out=$( (cd "$T/r/p" && python3 -I escape-map.py --runs "$T/bad.json" --layers "$T/layers.tsv" --escapes "$T/esc.tsv" --ref main --page "$T/once.html") ); r=$?
ok "unreadable runs: exit 2, the page untouched" "$([ $r = 2 ] && cmp -s "$T/once.html" "$T/page.html" && echo 1)" "exit $r: $out"
out=$(SINCE="14 Nov" run); r=$?
ok "a --since that is not YYYY-MM-DD: exit 2" "$([ $r = 2 ] && echo 1)" "exit $r: $out"
printf 'id\tkind\n' > "$T/nohead.tsv"; out=$( (cd "$T/r/p" && python3 -I escape-map.py --runs "$T/runs.json" --layers "$T/nohead.tsv" --escapes "$T/esc.tsv" --ref main) ); r=$?
ok "a layer file whose first line is not the header: exit 2" "$([ $r = 2 ] && grep -q "must be the header" <<< "$out" && echo 1)" "exit $r: $out"
D="$TOOLS/../design"
if [ -f "$D/layer-map.tsv" ] && [ -f "$D/escapes.tsv" ]; then   # check-guards' mutation copies hold only product/tools
  out=$(cd "$T/r/p" && python3 -I escape-map.py --runs "$T/runs.json" --layers "$D/layer-map.tsv" --escapes "$D/escapes.tsv" --ref main); r=$?
  ok "this copy's layer-map.tsv has the eight layers and escapes.tsv reads, names only layers in it" "$([ $r = 0 ] && [ "$(grep -c '^layer ' <<< "$out")" = 8 ] && ! grep -q "is not in layer-map" <<< "$out" && echo 1)" "exit $r: $out"
fi
finish
