#!/usr/bin/env bash
# E3 (P-772, B203 step 4): select-suites.mjs with SELECT_SUITES_GRAPH (test-graph.py's coverage graph, #2370). A fixture
# graph over real suite and file names: a covered app file picks the suites that ran it, not the path rules; a boot file
# picks every server suite; the unmapped suites run when the graph is used; anything the graph cannot speak for (a file it
# never saw, web/src, main.ts, a stale or broken graph) picks exactly what it picks without one. Runs no suite. US$0.
#   bash product/tools/check-select-graph.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
ROOT="$(git -C "$TOOLS" rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
T=$(mktemp -d "${TMPDIR:-/tmp}/selgraph.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
S=ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio
RT="$S/api/src/runtime.ts"; BOOT="$S/api/src/platform/firm-scope.ts"; WEB=$(ls "$S"/web/src/*.tsx | head -1); NEW="$S/api/src/not-in-graph-$$.ts"
for f in "$RT" "$BOOT" "$WEB"; do [ -f "$f" ] || { echo "fixture file $f is gone: update this test"; exit 2; }; done
mk() {  # $1 generated time → a schema 1 graph: runtime.ts ran by check_engine.ts only; firm-scope.ts at boot
  cat <<JSON
{"schema": 1, "generated": "$1", "commit": "x", "boot_baseline": true, "boot": {"$BOOT": ["f@1"]},
 "suites": {"check_a24_case_number_api.ts": {"server": true}, "check_engine.ts": {"server": false}, "check_w1_structure.ts": {"server": false}},
 "files": {"$RT": {"module": "m", "functions": 3, "hit": 1, "suites": ["check_engine.ts"]},
           "$S/api/src/main.ts": {"module": "m", "functions": 1, "hit": 1, "suites": ["check_engine.ts"]}},
 "unmapped": ["check_w1_structure.ts"]}
JSON
}
mk "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$T/g.json"; mk "2026-01-01T00:00:00Z" > "$T/old.json"; echo '{nope' > "$T/bad.json"
sel() { printf '%s\n' "$1" | node "$TOOLS/select-suites.mjs" ${3:-} 2>"$T/err"; }
gsel() { printf '%s\n' "$1" | SELECT_SUITES_GRAPH="$2" node "$TOOLS/select-suites.mjs" ${3:-} 2>"$T/err"; }
names() { cut -f1 <<< "$1" | sort; }
plain=$(sel "$RT"); g=$(gsel "$RT" "$T/g.json")
ok "a covered app file picks the suite that ran it, by the graph" "$(grep -qP '^check_engine\.ts\t.*coverage graph: runs runtime\.ts' <<< "$g" && echo 1)" "$(head -3 <<< "$g")"
ok "... and fewer suites than the path rules ($(grep -c . <<< "$g") with the graph, $(grep -c . <<< "$plain") without)" "$([ "$(grep -c . <<< "$g")" -lt "$(grep -c . <<< "$plain")" ] && echo 1)" "with $(grep -c . <<< "$g"), without $(grep -c . <<< "$plain")"
ok "... the unmapped suites run (no data, always runs)" "$(grep -qP '^check_w1_structure\.ts\t.*coverage graph: unmapped' <<< "$g" && echo 1)" "$g"
ok "... and the smoke set still runs" "$(grep -qP '^check_case_engine\.ts\t' <<< "$g" && echo 1)" "$g"
g=$(gsel "$BOOT" "$T/g.json")
ok "a boot file picks every server suite" "$(grep -qP '^check_a24_case_number_api\.ts\t.*runs at every server start' <<< "$g" && echo 1)" "$(head -3 <<< "$g")"
for f in "$NEW" "$WEB"; do
  ok "${f#$S/}: the graph cannot speak for it, so the pick is the path rules' exactly" "$([ "$(names "$(sel "$f")")" = "$(names "$(gsel "$f" "$T/g.json")")" ] && ! grep -q unmapped <<< "$(gsel "$f" "$T/g.json")" && echo 1)" "differs"
done
ok "main.ts still runs everything, graph or not" "$(gsel "$S/api/src/main.ts" "$T/g.json" | head -1 | grep -qP '^ALL\t' && echo 1)" "$(gsel "$S/api/src/main.ts" "$T/g.json" | head -1)"
ok "--direct uses the graph too" "$(gsel "$RT" "$T/g.json" --direct | grep -qP '^check_engine\.ts\t.*coverage graph' && echo 1)" "no graph pick"
for x in old bad; do g=$(gsel "$RT" "$T/$x.json")
  ok "a $x graph is ignored, said on stderr, and the pick is the path rules'" "$([ "$(names "$g")" = "$(names "$plain")" ] && grep -q 'coverage graph ignored' "$T/err" && echo 1)" "$(cat "$T/err")"; done
g=$(SELECT_GRAPH_MAX_DAYS=100000 gsel "$RT" "$T/old.json")
ok "SELECT_GRAPH_MAX_DAYS sets the age limit" "$(grep -q 'coverage graph: runs runtime.ts' <<< "$g" && echo 1)" "$(cat "$T/err")"
finish
