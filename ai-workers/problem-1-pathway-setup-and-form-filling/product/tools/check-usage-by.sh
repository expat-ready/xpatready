#!/usr/bin/env bash
# Test for usage-by.py (LR-128): tokens by skill and by subagent from fixture transcripts, the window, a subagent's skill
# from its spawn, and unreadable lines counted, never dropped. Fixture files only: no network, US$0.
#   bash product/tools/check-usage-by.sh
set -u
cd "$(dirname "$0")"
D="$(mktemp -d)"; trap 'rm -rf "$D"' EXIT
pass=0; fail=0
ok() { if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "PASS  $1"; else fail=$((fail + 1)); echo "FAIL  $1"; fi; }
S="$D/p/s1"; mkdir -p "$S/subagents"
u() { printf '{"input_tokens":%s,"cache_creation_input_tokens":0,"cache_read_input_tokens":%s,"output_tokens":0}' "$1" "$2"; }
cat > "$D/p/s1.jsonl" <<J
{"type":"assistant","timestamp":"2026-11-28T05:00:00Z","message":{"role":"assistant","usage":$(u 100 0),"content":[{"type":"text","text":"hi"}]}}
{"type":"user","timestamp":"2026-11-28T05:01:00Z","message":{"role":"user","content":"<command-name>/next</command-name>"}}
{"type":"assistant","timestamp":"2026-11-28T05:02:00Z","message":{"role":"assistant","usage":$(u 200 100),"content":[{"type":"tool_use","id":"t1","name":"Agent","input":{}}]}}
{"type":"assistant","timestamp":"2026-11-28T05:03:00Z","message":{"role":"assistant","usage":$(u 50 0),"content":[{"type":"tool_use","id":"t2","name":"Skill","input":{"skill":"verify"}}]}}
{"type":"assistant","timestamp":"2026-11-28T05:04:00Z","message":{"role":"assistant","usage":$(u 400 0),"content":[]}}
{"type":"assistant","timestamp":"2026-11-20T05:04:00Z","message":{"role":"assistant","usage":$(u 9999 0),"content":[]}}
not json
J
cat > "$S/subagents/agent-a1.jsonl" <<J
{"type":"assistant","timestamp":"2026-11-28T05:02:30Z","message":{"role":"assistant","usage":$(u 250 0),"content":[]}}
J
printf '%s' '{"agentType":"general-purpose","toolUseId":"t1"}' > "$S/subagents/agent-a1.meta.json"
j=$(python3 -I ./usage-by.py --root "$D" --days 1 --until 2026-11-28T06:00:00+00:00 --json)
q() { python3 -c 'import json,sys;d=json.loads(sys.argv[1]);print(eval(sys.argv[2]))' "$j" "$1"; }
[ "$(q 'd["by_skill"].get("(none)")')" = 100 ]; ok "before any skill: (none)" $?
[ "$(q 'd["by_skill"].get("next")')" = 600 ]; ok "after a typed /next: its calls (cache reads counted) and its subagent's go to next" $?
[ "$(q 'd["by_skill"].get("verify")')" = 400 ]; ok "a Skill tool call moves the skill (its own call counted under the skill before it)" $?
[ "$(q 'd["by_subagent"].get("main")')" = 850 ] && [ "$(q 'd["by_subagent"].get("general-purpose")')" = 250 ]; ok "by subagent: main and the subagent's agentType" $?
[ "$(q 'sum(d["by_skill"].values())')" = 1100 ]; ok "the call outside the window is left out" $?
[ "$(q 'd["unreadable"].get("lines")')" = 1 ]; ok "an unreadable line is counted" $?
l=$(python3 -I ./usage-by.py --root "$D" --days 1 --until 2026-11-28T06:00:00+00:00)
grep -qE '^usage 0\.0M tokens; by skill: next [0-9]+%, verify [0-9]+%, \(none\) [0-9]+%; by subagent: main [0-9]+%, general-purpose [0-9]+%; unreadable 1 lines, 0 files$' <<<"$l"; ok "one line: shares by skill and subagent, unreadable named ($l)" $?
l=$(python3 -I ./usage-by.py --root "$D/none")
grep -q 'usage unreadable (no transcripts at' <<<"$l"; ok "no transcripts folder: unreadable, never a zero" $?
echo "check-usage-by: $pass passed, $fail failed"
[ "$fail" = 0 ]
