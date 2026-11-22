#!/usr/bin/env bash
# ENF-798 (founder 15:1x IST 22 Nov: "whatever I'm talking and learning, it should be enforced"): the three rules of 22 Nov,
# each check fired on a planted case and quiet on a clean one. No network, US$0.   bash product/tools/test-enf-798.sh
#   P-798 triggers at the 10-minute check: sle-watch.py (question 10, approved not queued 20, lane quiet 30), app-view.js
#         (a lane that ended its turn: next check), lead-queue.sh and local-lanes.sh defaults, step-age.py (a step over
#         twice its median today), and lead-watch.sh running them.
#   P-800 flow buffer: flow-buffer.py (under 2 days on a board, an open part with no lane, a Partial capability on no board).
#   P-801 sources: brief-check.sh (a domain value without "Source:", a founder question without "Sources checked:").
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"
T=$(mktemp -d "${TMPDIR:-/tmp}/enf798.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok() { if [ "$2" = 1 ]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1 — ${3:-}"; fi; }
has() { grep -qE -- "$2" <<<"$1"; }      # status only: chain with && and end with && echo 1
hasnt() { ! grep -qE -- "$2" <<<"$1"; }

# ---------- P-798: wait targets (sle-watch.py) ----------
NOW='"now":"2026-11-22T10:00:00Z","board_at":"2026-11-22T09:55:00Z"'
pr() { echo "{\"number\":$1,\"title\":\"row $1\",\"draft\":false,\"labels\":$2,\"head\":\"abc$1\",\"updated_at\":\"$3\",\"body\":\"\",\"comments\":$4,\"same_head\":[]${5:-}}"; }
sle() { printf '%s' "{$NOW,\"prs\":[$1]}" > "$T/s.json"; python3 -I "$TOOLS/sle-watch.py" --snapshot "$T/s.json"; }
Q() { echo "{\"at\":\"$1\",\"body\":\"Question for the tech lead: may I?\"}"; }
out=$(sle "$(pr 1 '[]' 2026-11-22T09:59:00Z "[$(Q 2026-11-22T09:48:00Z)]")")
ok "P-798 question unanswered 12 min is a MISS (was 30)" "$(has "$out" '^MISS +Q #1: .*12 min \(target 10\)' && echo 1)" "$out"
out=$(sle "$(pr 1 '[]' 2026-11-22T09:59:00Z "[$(Q 2026-11-22T09:52:00Z)]")")
ok "P-798 question 8 min old is only due" "$(hasnt "$out" '^MISS' && echo 1)" "$out"
CI=',"ci":[{"conclusion":"success","status":"completed","completed_at":"2026-11-22T09:00:00Z","run":"1","owner":null}]'
out=$(sle "$(pr 2 '["review: approved"]' 2026-11-22T09:59:00Z '[]' ",\"approved_at\":\"2026-11-22T09:35:00Z\"$CI")")
ok "P-798 approved 25 min, not queued is a MISS (was 60 in the skill, 30 in sle-watch)" "$(has "$out" '^MISS +A #2: approved 25 min.*target 20' && echo 1)" "$out"
out=$(sle "$(pr 2 '["review: approved"]' 2026-11-22T09:59:00Z '[]' ",\"approved_at\":\"2026-11-22T09:43:00Z\"$CI")")
ok "P-798 approved 17 min is no MISS" "$(hasnt "$out" '^MISS' && echo 1)" "$out"
out=$(sle "$(pr 3 '[]' 2026-11-22T09:25:00Z '[]')")
ok "P-798 a lane with work left quiet 35 min is a MISS (was 90)" "$(has "$out" '^MISS +L #3: quiet 35 min.*target 30' && echo 1)" "$out"
out=$(sle "$(pr 3 '[]' 2026-11-22T09:35:00Z '[]')")
ok "P-798 a lane quiet 25 min is no MISS" "$(hasnt "$out" '^MISS' && echo 1)" "$out"

# ---------- P-798: a lane that ended its turn or waits for input (app-view.js) ----------
av() { node -e 'const v=require(process.argv[1]); console.log(v.lines(JSON.parse(process.argv[2]), Date.parse("2026-11-22T10:00:00Z")))' "$TOOLS/app-view.js" "$1"; }
sess() { echo "{\"title\":\"$1\",\"environment_kind\":\"cloud\",\"updated_at\":\"$3\",\"external_metadata\":{\"post_turn_summary\":{\"status_category\":\"$2\"}}}"; }
if command -v node >/dev/null; then
  out=$(av "{\"data\":[$(sess 'Lane ended' review_ready 2026-11-22T09:48:00Z)]}")
  ok "P-798 a lane that ended its turn 12 min ago with work left is flagged (was 90)" "$(has "$out" '^FLAG  Lane ended.*idle 12 min with work left' && echo 1)" "$out"
  out=$(av "{\"data\":[$(sess 'Lane ended' review_ready 2026-11-22T09:55:00Z)]}")
  ok "P-798 a lane quiet 5 min is not flagged" "$(has "$out" '^ok    Lane ended' && echo 1)" "$out"
  out=$(av "{\"data\":[$(sess 'Lane asks' need_input 2026-11-22T09:58:00Z)]}")
  ok "P-798 a lane waiting for input is flagged at once" "$(has "$out" '^FLAG  Lane asks.*need_input' && echo 1)" "$out"
else ok "node present for app-view.js" 0 "node missing"; fi
ok "P-798 lead-queue.sh: an un-acked lane report ACTs after 10 min (was 45)" "$(grep -q 'LEAD_QUEUE_ACT:-10}' "$TOOLS/lead-queue.sh" && echo 1)"
ok "P-798 local-lanes.sh: an idle local lane ACTs after 10 min (was 45)" "$(grep -q 'IDLE_MIN="${IDLE_MIN:-10}"' "$TOOLS/local-lanes.sh" && echo 1)"

# ---------- P-798: a step older than twice its median today (step-age.py) ----------
echo '{"start_to_proven":{"median_days":1.0},"approved_to_merged_min":{"median":30}}' > "$T/flow.json"
P() { echo "{\"number\":$1,\"title\":\"$2\",\"body\":\"$3\",\"headRefName\":\"claude/x$1\",\"createdAt\":\"$4\",\"labels\":$5${6:-}}"; }
sa() { echo "[$1]" > "$T/prs.json"; python3 -I "$TOOLS/step-age.py" --flow "${2:-$T/flow.json}" --prs "$T/prs.json" --now 2026-11-22T10:00:00Z; }
out=$(sa "$(P 10 'part one' 'Item: R1.10' 2026-11-19T10:00:00Z '[]')"); rc=$?
ok "P-798 R1.10 open 3 d against a 1 d median ACTs" "$([ $rc = 1 ] && has "$out" '^ACT   step start→Proven: R1.10 open 3.0 d since #10' && echo 1)" "exit $rc: $out"
out=$(sa "$(P 10 'R1.10 part one' '' 2026-11-21T22:00:00Z '[]')"); rc=$?
ok "P-798 R1.10 open 0.5 d stays quiet" "$([ $rc = 0 ] && has "$out" '^ok    step-age' && echo 1)" "exit $rc: $out"
out=$(sa "$(P 11 'x' '' 2026-11-22T08:00:00Z '[{"name":"review: approved"}]' ',"approvedAt":"2026-11-22T08:50:00Z"')"); rc=$?
ok "P-798 approved 70 min against a 30 min median ACTs" "$([ $rc = 1 ] && has "$out" '^ACT   step approved→merged: #11 approved 70 min' && echo 1)" "exit $rc: $out"
out=$(sa "$(P 11 'x' '' 2026-11-22T08:00:00Z '[{"name":"review: approved"}]' ',"approvedAt":"2026-11-22T09:20:00Z"')"); rc=$?
ok "P-798 approved 40 min stays quiet" "$([ $rc = 0 ] && echo 1)" "exit $rc: $out"
echo '{"start_to_proven":{"median_days":null}}' > "$T/nomed.json"
out=$(sa "$(P 10 'R1.10' '' 2026-11-10T10:00:00Z '[]')" "$T/nomed.json"); rc=$?
ok "P-798 no median today is a warn, never an ok" "$([ $rc = 0 ] && has "$out" '^warn' && hasnt "$out" '^ok' && echo 1)" "exit $rc: $out"
echo 'not json' > "$T/bad.json"
out=$(sa "" "$T/bad.json"); rc=$?
ok "P-798 an unreadable flow-measure answer is an ACT" "$([ $rc = 1 ] && has "$out" '^ACT   step-age did not run' && echo 1)" "exit $rc: $out"
for s in flow-buffer.py sle-watch.py step-age.py; do
  ok "lead-watch.sh runs $s and counts its ACT lines" "$(grep -E "\"\\\$TOOLS/$s\"" "$TOOLS/lead-watch.sh" | grep -q "grep -c '\^ACT'" && echo 1)"
done
ok "lead-watch.sh step-age reads flow-measure.py --json" "$(grep -q 'flow-measure.py" --since today --lead --json' "$TOOLS/lead-watch.sh" && echo 1)"

# ---------- P-800: flow buffer (flow-buffer.py) ----------
HEAD='| # | Capability | Left to build | Lane / PR | Waits on |
|---|---|---|---|---|'
mkdir -p "$T/d1" "$T/d2"
cat > "$T/caps.md" <<'EOF'
| # | Map row: capability | Module | Status | Tested on |
|---|---|---|---|---|
| R1.3 | three | M | Partial | x |
| R1.7 | seven | M | Partial | x |
| R1.8 | eight | M | Works | x |
EOF
printf '# Lead A board: the cycle 22 Nov\n\n%s\n| 1 | R1.3 three | p2 | #10 building | none |\n| 2 | R1.9 nine | the invite screen | none yet | none |\n' "$HEAD" > "$T/d1/board-lead-a-2026-11-22.md"
printf '# Lead A board, old\n\n## Day 1\n%s\n| 1 | R1.3 | none | x | none |\n## Day 2\n%s\n| 2 | R1.7 | p1 | lane 4 | none |\n' "$HEAD" "$HEAD" > "$T/d1/board-lead-a-2026-11-20.md"
out=$(python3 -I "$TOOLS/flow-buffer.py" --design "$T/d1" --caps "$T/caps.md"); rc=$?
ok "P-800 the newest board (22 Nov, not the clean 20 Nov) with 1 day ACTs" "$(has "$out" '^ACT   buffer: board-lead-a-2026-11-22.md lists 1 day' && echo 1)" "$out"
ok "P-800 an open part with no lane ACTs" "$(has "$out" '^ACT   buffer: board-lead-a-2026-11-22.md R1.9: open part "the invite screen" has no lane' && echo 1)" "$out"
ok "P-800 a track with no board ACTs" "$(has "$out" '^ACT   buffer: Track B has no board' && echo 1)" "$out"
ok "P-800 a Partial capability on no board ACTs, naming it (R1.7), not one on a board (R1.3)" "$(has "$out" '^ACT   buffer: 1 Partial capability on no track board: R1.7:' && echo 1)" "$out"
ok "P-800 planted: exit = 4 ACT lines" "$([ $rc = 4 ] && echo 1)" "exit $rc"
printf '# Lead A board\n\n## Day 1: 22 Nov\n%s\n| 1 | R1.3 | p2 | #10 building | none |\n\n## Day 2: tomorrow\n%s\n| 2 | R1.9 | invite screen | brief ready, lane 6 | none |\n| 3 | R1.8 | none (proof only) | | none |\n' "$HEAD" "$HEAD" > "$T/d2/board-lead-a-2026-11-22.md"
printf '# Lead B board\n\n## Day 1\n%s\n| 1 | R1.7 | p1 | lane 4 | none |\n## Day 2\n%s\n| 2 | R1.11 | p1 | lane 5 | none |\n## Day 3\n%s\n| 3 | R1.12 | p1 | lane 5 | none |\n' "$HEAD" "$HEAD" "$HEAD" > "$T/d2/board-lead-b-2026-11-22.md"
out=$(python3 -I "$TOOLS/flow-buffer.py" --design "$T/d2" --caps "$T/caps.md"); rc=$?
ok "P-800 clean: 2 and 3 days, lanes named, Partial on boards: exit 0" "$([ $rc = 0 ] && has "$out" '^ok    buffer' && has "$out" 'board-lead-a-2026-11-22.md: 2 day' && has "$out" 'board-lead-b-2026-11-22.md: 3 day' && echo 1)" "exit $rc: $out"
printf '# Lead B board\nBuffer: 3 days\n%s\n| 1 | R1.7 | p1 | lane 4 | none |\n' "$HEAD" > "$T/d2/board-lead-b-2026-11-23.md"
out=$(python3 -I "$TOOLS/flow-buffer.py" --design "$T/d2" --caps "$T/caps.md"); rc=$?
ok "P-800 a \"Buffer: 3 days\" line is text, never counted" "$([ $rc = 1 ] && has "$out" 'board-lead-b-2026-11-23.md lists 1 day' && echo 1)" "exit $rc: $out"

# ---------- P-801: sources (brief-check.sh) ----------
B='Model: Opus 5.5, effort: medium'
bc() { out=$(printf '%s\n' "$1" | bash "$TOOLS/brief-check.sh" ${2:-}); rc=$?; }
bc "$B
Build the study permit intake: IMM 1294 asks for the passport." --brief
ok "P-801 a brief naming a form and a program with no Source: is refused" "$([ $rc = 1 ] && has "$out" 'domain value .*(form|program).*no "Source:" line' && echo 1)" "exit $rc: $out"
bc "$B
Show the processing fee of CA\$ 150 for the visa." --brief
ok "P-801 a brief stating a fee with no Source: is refused" "$([ $rc = 1 ] && has "$out" 'fee' && echo 1)" "exit $rc: $out"
bc "$B
Biometrics are valid for 10 years; the refund comes within 30 days." --brief
ok "P-801 a brief stating a day count with no Source: is refused" "$([ $rc = 1 ] && has "$out" 'day count' && echo 1)" "exit $rc: $out"
bc "$B
Ontario applicants need the OINP nomination." --brief
ok "P-801 a brief stating a province rule with no Source: is refused" "$([ $rc = 1 ] && has "$out" 'province rule|program' && echo 1)" "exit $rc: $out"
bc "$B
Charge HST at 13% on invoices; CLB 7 is the minimum." --brief
ok "P-801 a brief stating a rate and a threshold with no Source: is refused" "$([ $rc = 1 ] && has "$out" 'rate' && has "$out" 'threshold' && echo 1)" "exit $rc: $out"
bc "$B
IMM 1294 asks for the passport.
Source: just trust me" --brief
ok "P-801 a Source: line that is no requirement, official quote or market research is refused" "$([ $rc = 1 ] && has "$out" 'neither a requirement path' && echo 1)" "exit $rc: $out"
bc "$B
IMM 1294 asks for the passport.
Source: ai-workers/problem-1-pathway-setup-and-form-filling/domain/requirements-2026-11-01/forms.md" --brief
ok "P-801 a requirement path as Source: passes" "$([ $rc = 0 ] && echo 1)" "exit $rc: $out"
bc "$B
Biometrics are valid for 10 years.
Source: https://www.canada.ca/en/immigration-refugees-citizenship/campaigns/biometrics.html \"valid for 10 years\" read 22 Nov 2026" --brief
ok "P-801 an official URL with a quote and a date as Source: passes" "$([ $rc = 0 ] && echo 1)" "exit $rc: $out"
bc "$B
Show the consultation fee of CA\$ 150.
Source: market research note design/market-research-2026-11.md" --brief
ok "P-801 a market-research note as Source: passes" "$([ $rc = 0 ] && echo 1)" "exit $rc: $out"
bc "$B
Make lead-watch ACT at 10 min; context over 45% is a hand-over; the run cost US\$0; plan 2-3 days of capability." --brief
ok "P-801 clean: a tooling brief with minutes, a context share, US\$0 and planning days passes" "$([ $rc = 0 ] && echo 1)" "exit $rc: $out"
bc "$B
Question for the founder: which tax rate applies?" --brief
ok "P-801 a Question for the founder with no Sources checked: is refused" "$([ $rc = 1 ] && has "$out" 'no "Sources checked:" line' && echo 1)" "exit $rc: $out"
bc "$B
Question for the founder: which colour for the button?
Sources checked: requirements (none), competitors' pages (two use blue), no official rule" --brief
ok "P-801 a Question for the founder with Sources checked: passes" "$([ $rc = 0 ] && echo 1)" "exit $rc: $out"
PRB='Done when: bash product/tools/test-enf-798.sh exits 0
Duplicate check: searched open PRs; none'
bc "$PRB
## Question for the founder
Which colour?"
ok "P-801 a PR body with a founder question and no Sources checked: is refused" "$([ $rc = 1 ] && has "$out" 'Sources checked' && echo 1)" "exit $rc: $out"
bc "$PRB
Questions for the founder: none
The study permit pack (IMM 1294) is unchanged."
ok "P-801 clean PR body: \"Questions for the founder: none\" and a form name (PR bodies are not briefs) pass" "$([ $rc = 0 ] && echo 1)" "exit $rc: $out"

echo "test-enf-798: $pass passed, $fail failed"
[ "$fail" = 0 ]
