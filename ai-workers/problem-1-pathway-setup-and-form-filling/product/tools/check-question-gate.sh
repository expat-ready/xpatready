#!/usr/bin/env bash
# ENF-778a E-a (P-778): question-gate.py refuses a Lead turn's end while a product question for the tech lead waits over
# 20 min, or a tooling one over 60, with no Lead answer since; a missing or stale SLE dump refuses nothing. And
# stop-check.sh runs it in the Lead's copy only. Fixture dumps as sle-watch.py --dump writes them. US$0, no network.
#   bash product/tools/check-question-gate.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/qgate.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
Q="$TOOLS/question-gate.py"
[ -f "$Q" ] || { ok "question-gate.py exists (P-778 E-a)" 0 "no $Q"; finish; }
NOW=2026-11-25T06:00:00Z
dump() {  # dump <taken at> <number> <title> <comment at> <comment body> [<comment at> <body>]... → $T/sle.json
  local at=$1 n=$2 t=$3; shift 3; local cs='[]'
  while [ $# -ge 2 ]; do cs=$(jq -c --arg a "$1" --arg b "$2" '. + [{at: $a, body: $b}]' <<< "$cs"); shift 2; done
  jq -n --arg now "$at" --argjson n "$n" --arg t "$t" --argjson cs "$cs" '{now: $now, prs: [{number: $n, title: $t, comments: $cs}]}' > "$T/sle.json"; }
run() { out=$(python3 -I "$Q" --sle "${1:-$T/sle.json}" --now "${2:-$NOW}" 2>&1); r=$?; }
QQ="Question for the tech lead: which date?"
dump 2026-11-25T05:58:00Z 101 "runtime: R1.10 — x" 2026-11-25T05:35:00Z "$QQ"; run
ok "a product question 25 min unanswered: refused" "$([ $r = 0 ] && grep -q '^- #101: a product question for the tech lead is unanswered 25 min (over 20' <<< "$out" && echo 1)" "exit $r: $out"
dump 2026-11-25T05:58:00Z 101 "runtime: R1.10 — x" 2026-11-25T05:45:00Z "$QQ"; run
ok "a product question 15 min unanswered: not yet" "$([ -z "$out" ] && echo 1)" "$out"
dump 2026-11-25T05:58:00Z 102 "pipeline: P-822 — x" 2026-11-25T05:10:00Z "$QQ"; run
ok "a tooling question 50 min unanswered: not yet (60 min)" "$([ -z "$out" ] && echo 1)" "$out"
dump 2026-11-25T05:58:00Z 102 "pipeline: P-822 — x" 2026-11-25T04:50:00Z "$QQ"; run
ok "a tooling question 70 min unanswered: refused" "$(grep -q '^- #102: a tooling question .* 70 min (over 60' <<< "$out" && echo 1)" "$out"
for t in "tooling: x" "guards: x" "records: x" "qa: x" "rules: x"; do
  dump 2026-11-25T05:58:00Z 103 "$t" 2026-11-25T05:30:00Z "$QQ"; run
  ok "\"${t%%:*}:\" is tooling (30 min passes)" "$([ -z "$out" ] && echo 1)" "$out"; done
for t in "screens: x" "forms: x" "evidence: x" "migration: x" "A bare title"; do
  dump 2026-11-25T05:58:00Z 104 "$t" 2026-11-25T05:30:00Z "$QQ"; run
  ok "\"$t\" is product (30 min refused)" "$(grep -q '^- #104: a product' <<< "$out" && echo 1)" "$out"; done
dump 2026-11-25T05:58:00Z 101 "runtime: x" 2026-11-25T05:30:00Z "$QQ" 2026-11-25T05:40:00Z "Tech lead (Lead 4): use 12 Dec."; run
ok "a Lead answer after the question: nothing refused" "$([ -z "$out" ] && echo 1)" "$out"
dump 2026-11-25T05:58:00Z 101 "runtime: x" 2026-11-25T05:20:00Z "Lead 4: earlier note" 2026-11-25T05:30:00Z "$QQ"; run
ok "a Lead comment before the question is not an answer" "$(grep -q '^- #101' <<< "$out" && echo 1)" "$out"
dump 2026-11-25T05:58:00Z 101 "runtime: x" 2026-11-25T05:30:00Z "Reviewer: Approve abc"; run
ok "no question: nothing refused" "$([ -z "$out" ] && echo 1)" "$out"
dump 2026-11-25T05:00:00Z 101 "runtime: x" 2026-11-25T04:00:00Z "$QQ"; run
ok "a dump 60 min old: a note, nothing refused (never traps the Lead)" "$(grep -q '^note: .*60 min old' <<< "$out" && ! grep -q '^- ' <<< "$out" && echo 1)" "$out"
run "$T/none.json"
ok "no dump: a note, nothing refused" "$([ $r = 0 ] && grep -q '^note: .*no readable SLE dump' <<< "$out" && ! grep -q '^- ' <<< "$out" && echo 1)" "exit $r: $out"
echo '{"prs": [' > "$T/bad.json"; run "$T/bad.json"
ok "a broken dump: a note, exit 0" "$([ $r = 0 ] && grep -q '^note:' <<< "$out" && echo 1)" "exit $r: $out"
# stop-check.sh part (6): the Lead's copy only, the refusal joined as a block reason, a note when stale
S="$TOOLS/stop-check.sh"
ok "stop-check.sh runs question-gate.py in the Lead's copy only, with lead-watch's dump" "$(grep -q '^if \[ "\$LANE" = lead \]; then$' "$S" && grep -q 'question-gate.py" --sle "${LEAD_WATCH_STATE_DIR:-/private/tmp/claude-$(id -u)/lead-watch}/sle.json"' "$S" && echo 1)" "$(grep -n question-gate "$S")"
C="$T/c"; mkdir -p "$C/$PRODREL/tools" && git init -q "$C" && cp "$S" "$Q" "$TOOLS/sle-watch.py" "$C/$PRODREL/tools/"
printf '#!/bin/bash\necho "$FAKE_LANE"\n' > "$C/$PRODREL/tools/lane.sh"
for f in check-docs.sh founder-click-guard.sh resource-claim-guard.sh; do printf '#!/bin/bash\nexit 0\n' > "$C/$PRODREL/tools/$f"; done
git -C "$C" add -A && git -C "$C" -c user.email=t@t -c user.name=t commit -qm x && git -C "$C" update-ref refs/remotes/origin/main HEAD
mkdir -p "$T/lw"; now=$(date -u +%FT%TZ); q=$(date -u -d '-30 min' +%FT%TZ)
jq -n --arg now "$now" --arg q "$q" --arg b "$QQ" '{now: $now, prs: [{number: 7, title: "runtime: x", comments: [{at: $q, body: $b}]}]}' > "$T/lw/sle.json"
st() { printf '{"cwd":"%s"}' "$C" | FAKE_LANE=$1 LEAD_WATCH_STATE_DIR="$T/lw" bash "$C/$PRODREL/tools/stop-check.sh" 2>/dev/null; }
o=$(st lead); ok "stop-check: the Lead's turn with a product question 30 min unanswered is blocked, naming it" "$(jq -e '.decision == "block" and (.reason | contains("#7: a product question"))' <<< "$o" >/dev/null && echo 1)" "$o"
o=$(st screens); ok "stop-check: a builder copy is untouched by the question gate" "$(! jq -e '.decision == "block"' <<< "$o" >/dev/null 2>&1 && echo 1)" "$o"
o=$(printf '{"cwd":"%s","stop_hook_active":true}' "$C" | FAKE_LANE=lead LEAD_WATCH_STATE_DIR="$T/lw" bash "$C/$PRODREL/tools/stop-check.sh" 2>/dev/null)
ok "stop-check: the next stop after a block passes (stop_hook_active: never a loop)" "$([ -z "$o" ] && echo 1)" "$o"
rm -f "$T/lw/sle.json"; o=$(st lead); ok "stop-check: no dump in the Lead's copy is a note, not a block" "$(jq -e '(.decision // "") != "block" and (.systemMessage | contains("no readable SLE dump"))' <<< "$o" >/dev/null && echo 1)" "$o"
finish
