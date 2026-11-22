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

# ---------- review round 1 (reviewer on 54b7ef4): live wiring and real phrasing ----------
# P-798: the saved app view lead-watch reads is fresh for one 10-min check plus grace (was 35 min).
export APP_VIEW_FILE="$T/app-view.txt"; AN=1763270000
printf 'app view 1 sessions · 1 flagged · rows=1\nFLAG  Lane asks · cloud · need_input · needs: x · d · idle 2 min · context ?\n' | NOW=$AN bash "$TOOLS/app-view-save.sh" >/dev/null
out=$(NOW=$((AN + 16 * 60)) bash "$TOOLS/app-view-check.sh"); rc=$?
ok "P-798 an app view 16 min old is an ACT (lead-watch would miss a waiting lane for 35 min before)" "$([ $rc = 1 ] && has "$out" '^ACT   app view not read in 16 min' && echo 1)" "exit $rc: $out"
out=$(NOW=$((AN + 9 * 60)) bash "$TOOLS/app-view-check.sh"); rc=$?
ok "P-798 a 9-min-old view passes its flag on: the lane waiting for input is an ACT" "$([ $rc = 1 ] && has "$out" '^ACT   app view: Lane asks' && echo 1)" "exit $rc: $out"
unset APP_VIEW_FILE
# P-798: sle-watch --grouped (lead-watch 2g): one ACT per target naming its PRs, the detail on sle lines.
printf '%s' "{$NOW,\"prs\":[$(pr 3 '[]' 2026-11-22T09:20:00Z '[]'),$(pr 4 '[]' 2026-11-22T09:25:00Z '[]'),$(pr 5 '[]' 2026-11-22T09:58:00Z "[$(Q 2026-11-22T09:45:00Z)]")]}" > "$T/s.json"
out=$(python3 -I "$TOOLS/sle-watch.py" --grouped --snapshot "$T/s.json")
ok "P-798 --grouped: one ACT for two quiet lanes, one for the question, detail lines start sle" "$([ "$(grep -c '^ACT' <<<"$out")" = 2 ] && has "$out" '^ACT   SLE L 2 over target \(P-798\): #3 #4$' && has "$out" '^ACT   SLE Q 1 over target' && has "$out" '^sle   miss L #3' && hasnt "$out" '^MISS' && echo 1)" "$out"
printf '%s' "{$NOW,\"prs\":[$(pr 5 '[]' 2026-11-22T09:58:00Z '[]')]}" > "$T/s.json"
out=$(python3 -I "$TOOLS/sle-watch.py" --grouped --snapshot "$T/s.json")
ok "P-798 --grouped clean: one sle ok line, no ACT (known-failures.tsv reads ^sle )" "$(has "$out" '^sle   ok SLE: every target met \(questions 10 min, approved to queued 20 min, lanes 30 min' && hasnt "$out" '^ACT' && echo 1)" "$out"
ok "lead-watch.sh runs sle-watch --grouped with a dump that step-age reads" "$(grep -q 'sle-watch.py" --grouped --dump "$STATE_DIR/sle.json"' "$TOOLS/lead-watch.sh" && grep -q 'step-age.py" .*--sle "$STATE_DIR/sle.json"' "$TOOLS/lead-watch.sh" && echo 1)"
# P-798 step age, live shapes: approval time from sle-watch's dump (gh pr list has no approvedAt); records PRs left out.
echo '{"start_to_proven":{"median_days":1.0},"approved_to_merged_min":{"n":4,"median":30}}' > "$T/flow.json"
echo '{"prs":[{"number":11,"approved_at":"2026-11-22T08:50:00Z"}]}' > "$T/sle.json"
echo "[$(P 11 'x' '' 2026-11-22T08:00:00Z '[{"name":"review: approved"},{"name":"queued"}]'),$(P 12 'lead: records 22 Nov' 'Item: R1.92' 2026-11-15T08:00:00Z '[]')]" > "$T/prs.json"
out=$(python3 -I "$TOOLS/step-age.py" --flow "$T/flow.json" --prs "$T/prs.json" --sle "$T/sle.json" --now 2026-11-22T10:00:00Z); rc=$?
ok "P-798 a queued PR approved 70 min ago (time from the sle dump) ACTs; a records PR naming R1.92 does not" "$([ $rc = 1 ] && has "$out" '^ACT   step approved→merged: #11 approved 70 min' && hasnt "$out" 'R1.92' && echo 1)" "exit $rc: $out"
ok "flow-measure --lead gives today's approved→merged median (step-age's second step)" "$(grep -q 'out\["approved_to_merged_min"\] = {"n": len(waits), "median"' "$TOOLS/flow-measure.py" && echo 1)"
# P-800: a capability named only in a board's prose is not on the board.
printf '# Lead A board\n\n## Day 1\n%s\n| 1 | R1.3 | p2 | #10 | none |\n## Day 2\n%s\n| 2 | R1.8 | p1 | lane 2 | none |\n\nNote: R1.7 waits for Track B.\n' "$HEAD" "$HEAD" > "$T/d3.md"; mkdir -p "$T/d3"; mv "$T/d3.md" "$T/d3/board-lead-a-2026-11-22.md"; cp "$T/d2/board-lead-b-2026-11-22.md" "$T/d3/"
sed -i 's/R1.7/R1.11/' "$T/d3/board-lead-b-2026-11-22.md"
out=$(python3 -I "$TOOLS/flow-buffer.py" --design "$T/d3" --caps "$T/caps.md"); rc=$?
ok "P-800 R1.7 named only in a board's prose counts as on no board" "$([ $rc = 1 ] && has "$out" 'Partial capability on no track board: R1.7:' && echo 1)" "exit $rc: $out"
# P-801 with the house's own citations and phrasing.
bc "$B
IMM 1294 asks for the passport.
Source: AG-6-4@374fb7a9 rule 1" --brief
ok "P-801 a requirement card (AG-6-4@374fb7a9) as Source: passes" "$([ $rc = 0 ] && echo 1)" "exit $rc: $out"
for fake in 'no market research done' 'see domain/ somewhere' 'https://example.com/x "anything" 2026-11-22'; do
  bc "$B
IMM 1294 asks for the passport.
Source: $fake" --brief
  ok "P-801 a fake Source: ($fake) is refused" "$([ $rc = 1 ] && has "$out" 'neither a requirement path or card' && echo 1)" "exit $rc: $out"
done
bc "$B
* **FO-3c — question for the founder:** which wording?" --brief
ok "P-801 a founder question in the middle of a line is seen" "$([ $rc = 1 ] && has "$out" 'Sources checked' && echo 1)" "exit $rc: $out"
bc "$B
Question for the founder: no-code or code for the intake?" --brief
ok "P-801 'Question for the founder: no-code ...' is a question, not 'no'" "$([ $rc = 1 ] && has "$out" 'Sources checked' && echo 1)" "exit $rc: $out"
bc "$PRB
## Questions for the founder
None."
ok "P-801 a 'Questions for the founder' heading with 'None.' under it passes" "$([ $rc = 0 ] && echo 1)" "exit $rc: $out"
bc "$B
Make CI flake rate under 2%; rate limiting at 100%; keep lead-watch logs 30 days (retention).
Sample fee on the demo: CAD 1,500 (Sample)." --brief
ok "P-801 tooling rates, a log retention and a Sample amount are no domain values" "$([ $rc = 0 ] && echo 1)" "exit $rc: $out"
mkdir -p "$T/fc"; cp "$TOOLS/brief-check.sh" "$T/fc/"; printf 'import sys\nsys.exit(5)\n' > "$T/fc/source-check.py"
out=$(printf '%s\nIMM 1294.\n' "$B" | bash "$T/fc/brief-check.sh" --brief); rc=$?
ok "P-801 fails closed: a source check that cannot run refuses the brief" "$([ $rc = 1 ] && has "$out" 'source check could not run' && echo 1)" "exit $rc: $out"

# review round 2: a quoted mention of the rule asks nothing; ID@hash must be a requirement card; Sample keeps form names.
bc "$PRB
This PR makes brief-check refuse a \"Question for the founder\" with no Sources checked: line, and \`question for the founder\` in backticks too."
ok "P-801 a quoted or backticked mention of the rule is no founder question (round 2, N1)" "$([ $rc = 0 ] && echo 1)" "exit $rc: $out"
bc "$B
IMM 1294 asks for the passport.
Source: ENF-798@54b7ef4" --brief
ok "P-801 a backlog id with a commit (ENF-798@54b7ef4) is no requirement card" "$([ $rc = 1 ] && has "$out" 'neither a requirement path or card' && echo 1)" "exit $rc: $out"
bc "$B
IMM 5257 on the demo (Sample fee CAD 100)." --brief
ok "P-801 a form named on a Sample line still needs a Source:, its Sample amount does not" "$([ $rc = 1 ] && has "$out" 'form' && hasnt "$out" 'fee' && echo 1)" "exit $rc: $out"

echo "test-enf-798: $pass passed, $fail failed"
[ "$fail" = 0 ]
