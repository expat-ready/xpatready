#!/usr/bin/env bash
# E3 (P-772, B203 step 4): select-suites.mjs with SELECT_SUITES_GRAPH (test-graph.py's coverage graph, #2370). A fixture
# graph shaped as test-graph.py writes it (suites named without .ts/.cjs, every suite listed) over real suite and file
# names: a covered app file picks the suites that ran it, the api/src scanners, the unmapped and unlisted suites, not the
# path rules; a boot file picks every server suite and its direct runners; anything the graph cannot speak for (a file it
# never saw, web/src, main.ts, a stale or broken graph) picks exactly what it picks without one. Runs no suite. US$0.
#   bash product/tools/check-select-graph.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
ROOT="$(git -C "$TOOLS" rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
T=$(mktemp -d "${TMPDIR:-/tmp}/selgraph.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
S=ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio
RT="$S/api/src/runtime.ts"; BOOT="$S/api/src/platform/firm-scope.ts"; WEB=$(ls "$S"/web/src/*.tsx | head -1); NEW="$S/api/src/not-in-graph-$$.ts"
for f in "$RT" "$BOOT" "$WEB" "$S/tests/check_engine.ts" "$S/tests/check_a24_case_number_api.ts" "$S/tests/check_w1_structure.ts" "$S/tests/runtime/check_case_engine.ts" "$S/tests/runtime/check_runtime_r1a.ts" "$S/tests/check_screen01_api.ts"; do
  [ -f "$f" ] || { echo "fixture file $f is gone: update this test"; exit 2; }; done
# mk <generated> [left out]: every studio suite listed by its stem (as test-graph.py's collect keys it), not server,
# except check_a24_case_number_api (server); runtime.ts ran by check_engine and check_runtime_r1a; firm-scope.ts at boot
# and ran directly by check_screen01_api; check_w1_structure unmapped; the stem in $2 left out (a suite newer than the graph).
mk() { python3 -I - "$1" "${2:-}" "$S" "$RT" "$BOOT" <<'PY'
import glob, json, os, sys
gen, out, S, rt, boot = sys.argv[1:6]
stems = sorted({os.path.basename(f).rsplit(".", 1)[0] for f in glob.glob(S + "/tests/check_*.ts") + glob.glob(S + "/tests/check_*.cjs") + glob.glob(S + "/tests/runtime/check_*.*")} - {out})
print(json.dumps({"schema": 1, "generated": gen, "commit": "x", "boot_baseline": True, "boot": {boot: ["f@1"]},
  "suites": {s: {"server": s == "check_a24_case_number_api"} for s in stems},
  "files": {rt: {"module": "m", "functions": 3, "hit": 1, "suites": ["check_engine", "check_runtime_r1a", "check_gone_suite"]},
            boot: {"module": "m", "functions": 2, "hit": 1, "suites": ["check_screen01_api"]},
            S + "/api/src/main.ts": {"module": "m", "functions": 1, "hit": 1, "suites": ["check_engine"]}},
  "unmapped": ["check_w1_structure"]}))
PY
}
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mk "$now" > "$T/g.json"; mk "2026-01-01T00:00:00Z" > "$T/old.json"; echo '{nope' > "$T/bad.json"
mk "$now" check_case_engine > "$T/newer.json"
sel() { printf '%s\n' "$1" | node "$TOOLS/select-suites.mjs" ${3:-} 2>"$T/err"; }
gsel() { printf '%s\n' "$1" | SELECT_SUITES_GRAPH="$2" node "$TOOLS/select-suites.mjs" ${3:-} 2>"$T/err"; }
names() { cut -f1 <<< "$1" | sort; }
has() { grep -qP "^$(sed 's/\./\\./g' <<< "$2")\t.*$3" <<< "$1"; }
plain=$(sel "$RT"); g=$(gsel "$RT" "$T/g.json")
ok "a covered app file picks the suite that ran it, the graph's stem mapped to the file name" "$(has "$g" check_engine.ts 'coverage graph: runs runtime.ts' && echo 1)" "$(head -3 <<< "$g")"
ok "... an R1 suite in the graph brings its two partners (one copy, in order)" "$(has "$g" check_runtime_r1a.ts 'coverage graph' && has "$g" check_runtime_r1c.cjs '' && has "$g" check_runtime_r1d.ts '' && echo 1)" "$(grep runtime_r1 <<< "$g")"
ok "... a name that matches no suite is dropped" "$(! grep -q check_gone_suite <<< "$g" && echo 1)" "$g"
ok "... fewer suites than the path rules ($(grep -c . <<< "$g") with the graph, $(grep -c . <<< "$plain") without)" "$([ "$(grep -c . <<< "$g")" -lt "$(grep -c . <<< "$plain")" ] && echo 1)" "with $(grep -c . <<< "$g"), without $(grep -c . <<< "$plain")"
ok "... the unmapped suites run (no data, always runs)" "$(has "$g" check_w1_structure.ts 'coverage graph: unmapped' && echo 1)" "$g"
ok "... the api/src scanners still run (they read source as text: coverage cannot see them)" "$(d=$(grep -P '\treads every file in api/src' <<< "$plain" | cut -f1 | sort); [ -n "$d" ] && [ "$(comm -23 <(echo "$d") <(names "$g"))" = "" ] && echo 1)" "a scanner the path rules pick is missing"
ok "... and the smoke set still runs" "$(has "$g" check_case_engine.ts '' && echo 1)" "$g"
g=$(gsel "$RT" "$T/newer.json")
ok "a suite the graph does not list (newer than it) always runs" "$(has "$g" check_case_engine.ts 'not in the graph' && echo 1)" "$(grep check_case_engine <<< "$g")"
g=$(gsel "$BOOT" "$T/g.json")
ok "a boot file picks every server suite" "$(has "$g" check_a24_case_number_api.ts 'runs at every server start' && echo 1)" "$(head -3 <<< "$g")"
ok "... and the suites that ran it directly" "$(has "$g" check_screen01_api.ts 'coverage graph: runs firm-scope.ts' && echo 1)" "$(grep screen01 <<< "$g")"
for f in "$NEW" "$WEB"; do
  ok "${f#$S/}: the graph cannot speak for it, so the pick is the path rules' exactly" "$([ "$(names "$(sel "$f")")" = "$(names "$(gsel "$f" "$T/g.json")")" ] && ! grep -q unmapped <<< "$(gsel "$f" "$T/g.json")" && echo 1)" "differs"
done
ok "main.ts still runs everything, graph or not" "$(gsel "$S/api/src/main.ts" "$T/g.json" | head -1 | grep -qP '^ALL\t' && echo 1)" "$(gsel "$S/api/src/main.ts" "$T/g.json" | head -1)"
ok "--direct uses the graph too" "$(has "$(gsel "$RT" "$T/g.json" --direct)" check_engine.ts 'coverage graph' && echo 1)" "no graph pick"
for x in old bad; do g=$(gsel "$RT" "$T/$x.json")
  ok "the $x graph is ignored, said on stderr, and the pick is the path rules'" "$([ "$(names "$g")" = "$(names "$plain")" ] && grep -q 'coverage graph ignored' "$T/err" && echo 1)" "$(cat "$T/err")"; done
g=$(SELECT_GRAPH_MAX_DAYS=100000 gsel "$RT" "$T/old.json")
ok "SELECT_GRAPH_MAX_DAYS sets the age limit" "$(grep -q 'coverage graph: runs runtime.ts' <<< "$g" && echo 1)" "$(cat "$T/err")"
g=$(SELECT_GRAPH_MAX_DAYS=x gsel "$RT" "$T/old.json")
ok "a SELECT_GRAPH_MAX_DAYS that is not a number falls back to 14 days" "$(grep -q 'coverage graph ignored (.* over 14)' "$T/err" && echo 1)" "$(cat "$T/err")"
finish
