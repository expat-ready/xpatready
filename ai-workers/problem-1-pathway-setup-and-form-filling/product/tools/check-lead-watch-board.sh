#!/usr/bin/env bash
# Test for lead-watch.sh's board step (B201, founder A117 16 Nov; P-639): the 30-minute check prints the board's own Today
# card and Stuck panel (cockpit-data.py --watch reads data.json › first, built by first_screen) and checks each against
# its primary source. Fake board data and a fake qa file; no network, US$0.
#   bash product/tools/check-lead-watch-board.sh      (exit 0 = every case as expected)
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"
T=$(mktemp -d "${TMPDIR:-/tmp}/lwb.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
fail=0
ok() { echo "PASS $1"; }; no() { echo "FAIL $1 :: $2"; fail=$((fail+1)); }
run() {  # data-json [extra args]: prints the board step's lines into $out
  printf '%s' "$1" > "$T/d.json"; shift
  out=$(python3 -I "$TOOLS/cockpit-data.py" --watch "$T/d.json" --open-prs "$T/prs.json" --caps-main "$T/caps.md" \
        --now 2026-11-16T06:00:00Z --no-lookup "$@"); rc=$?
}
# qa's file on main: R1.2 and R1.5 read Works, R1.7 Not built, R1.9 Built, awaiting qa
cat > "$T/caps.md" <<'EOF'
| ID | Capability | Module | Status | Main | C | Done when | Note |
|---|---|---|---|---|---|---|---|
| R1.2 | 2 Database | Platform | Works | x | — | x | x |
| R1.5 | 5 Sign-in | Platform | **Works** | x | — | x | x |
| R1.7 | 7 Roles | Platform | Not built | x | — | x | x |
| R1.9 | 9 Audit | Platform | Built, awaiting qa | x | — | x | x |
EOF
echo '[{"number":1901,"title":"a"},{"number":1902,"title":"b"}]' > "$T/prs.json"
TODAY='"today":{"goal":10,"by":"2026-11-17T02:30:00Z","proven":2,"short":8,"waiting":2,"state":"off track"}'
REL='"release":{"proven_ids":[2,5],"waiting_ids":[7,9]}'
FR='"freshness":{"generated_at":"2026-11-16T05:30:00Z"}'
S_LQ='{"what":"2 pull requests wait for the Lead'"'"'s answer","items":["#1901 row a (2 h)","#1902 row b (5 h)"],"owner":"current Lead","since":"oldest 5 h","next":"answer each"}'
S_NB='{"what":"1 Built capabilities that qa'"'"'s file still reads Not built","items":["R1.7 Roles"],"owner":"qa","since":"since their parts merged","next":"qa re-checks each"}'

# 1. Two Stuck entries: two stuck ACT lines carrying the board's own counts; the oldest item first; the sources agree.
run "{$FR,\"first\":{$TODAY,$REL,\"stuck\":[$S_LQ,$S_NB]}}"
n=$(grep -c '^ACT   stuck: ' <<<"$out")
[ "$n" = 2 ] && grep -q "^ACT   stuck: 2 pull requests wait for the Lead's answer — #1902 row b (5 h); #1901 row a (2 h)" <<<"$out" \
  && grep -q "^ACT   stuck: 1 Built capabilities that qa's file still reads Not built — R1.7 Roles" <<<"$out" \
  && ok "two Stuck entries give two ACT lines, board counts, oldest first" || no "two Stuck entries" "$out"
grep -q '^ACT   board vs source disagree' <<<"$out" && no "sources agree: no disagree line" "$out" || ok "sources agree: no disagree line"
grep -q '^board vs source: 4 checked · 0 disagree$' <<<"$out" && ok "summary counts 4 checks, 0 disagree" || no "summary" "$out"

# 2. Empty Stuck: no stuck ACT line at all.
run "{$FR,\"first\":{$TODAY,$REL,\"stuck\":[]}}"
grep -q '^ACT   stuck' <<<"$out" && no "empty Stuck prints no ACT" "$out" || ok "empty Stuck prints no ACT"

# 3. The today line equals the board's Today card (proven, goal, by, short, waiting).
grep -qx 'today  2 of 10 Proven by 17 Nov, 08:00 IST, 8 short, 2 Built waiting for qa' <<<"$out" \
  && ok "today line equals the Today card" || no "today line" "$out"

# 4. P-639: the board says a PR waits for the Lead, but GitHub shows it merged: one disagree ACT naming both sides.
echo '{"1902":"merged"}' > "$T/states.json"
echo '[{"number":1901,"title":"a"}]' > "$T/prs.json"
run "{$FR,\"first\":{$TODAY,$REL,\"stuck\":[$S_LQ]}}" --pr-states "$T/states.json"
[ "$(grep -c '^ACT   board vs source disagree' <<<"$out")" = 1 ] \
  && grep -q "^ACT   board vs source disagree: #1902 waits for the Lead's answer — board says open and waiting, source says merged — fix the script or the board row" <<<"$out" \
  && grep -q '· 1 disagree' <<<"$out" && ok "board says waits, source says merged: one disagree ACT" || no "merged PR disagree" "$out"

# 5. Today's Proven differs from qa's file on main: one disagree ACT; a waiting capability qa already reads Works: another.
run "{$FR,\"first\":{\"today\":{\"goal\":10,\"by_text\":\"08:00 IST\",\"proven\":3,\"short\":7,\"waiting\":1},\"release\":{\"waiting_ids\":[5]},\"stuck\":[]}}"
grep -q '^ACT   board vs source disagree: Today Proven — board says 3, source says 2 R1 rows read Works' <<<"$out" \
  && grep -q '^ACT   board vs source disagree: R1.5 Built waiting for qa — board says waiting for qa, source says qa reads Works' <<<"$out" \
  && ok "Today numbers checked against qa's file" || no "today vs qa's file" "$out"

# 5b. P-639 cost: a PR the board lists that is neither open nor known merged, with its state not read, is "not checked", never a disagree.
run "{$FR,\"first\":{$TODAY,$REL,\"stuck\":[$S_LQ]}}"
! grep -q 'disagree:' <<<"$out" && grep -q 'not checked here: #1902 not open and state not read' <<<"$out" \
  && ok "an unread PR state is not checked, not a disagree" || no "unread PR state" "$out"

# 5c. M1 (review): the check never passes blind. A missing board file and a board over 2 h old are each an ACT.
out=$(python3 -I "$TOOLS/cockpit-data.py" --watch "$T/none.json" --no-lookup); grep -q '^ACT   board data not read' <<<"$out" \
  && ok "missing board data is an ACT" || no "missing board" "$out"
run "{\"freshness\":{\"generated_at\":\"2026-11-16T01:00:00Z\"},\"first\":{$TODAY,$REL,\"stuck\":[]}}"
grep -q '^ACT   board data 5.0 h old (over 2 h): refresh the board' <<<"$out" && ok "a board over 2 h old is an ACT" || no "stale board" "$out"

# 6. A board older than P-636 (no first screen): one plain line, no ACT, exit 0.
run '{"freshness":{"generated_at":"2026-11-16T05:30:00Z"}}'
[ "$rc" = 0 ] && ! grep -q '^ACT' <<<"$out" && grep -q 'no first screen' <<<"$out" && ok "old board: said, no ACT" || no "old board" "$out"

# 7. Cap: 40 Stuck entries stay within 40 lines, the cut is said as an ACT; and the step runs under 3 s.
many=$(for i in $(seq 1 40); do printf '{"what":"idle %s","items":["x"],"since":"1 h","next":"wake"},' "$i"; done)
ms_now() { python3 -I -c 'import time; print(time.time_ns() // 1000000)'; }   # macOS date has no %N
t0=$(ms_now); run "{$FR,\"first\":{$TODAY,$REL,\"stuck\":[${many%,}]}}"; ms=$(( $(ms_now) - t0 ))
[ "$(wc -l <<<"$out")" -le 40 ] && grep -q '^ACT   board: .* more lines cut' <<<"$out" && ok "40 entries capped at 40 lines" || no "cap" "$(wc -l <<<"$out") lines"
[ "$ms" -lt 3000 ] && ok "board step ran in ${ms} ms (under 3 s)" || no "run time" "${ms} ms"

# 8. The wiring: lead-watch.sh's own step 11, run with the data steps 2 and 5 hold, adds its ACT lines to the exit count
# (a merged PR the board still lists comes from step 2's merged list, so no GitHub call is needed).
step=$(awk '/^# 11\. What the founder/ {f=1} f && (/^# 12\. / || /^exit/) {exit} f' "$TOOLS/lead-watch.sh")   # awk: same on BSD (Mac) and GNU
FRESH="\"freshness\":{\"generated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"   # step 11 reads the real clock: the board is fresh now
printf '%s' "{$FRESH,\"first\":{$TODAY,$REL,\"stuck\":[$S_LQ]}}" > "$T/board.json"; mkdir -p "$T/st"
w=$(act=0; seen() { :; }; . "$TOOLS/fresh-lib.sh"; STATE_DIR="$T/st"; COCKPIT_DATA="$T/board.json"; prs='[{"number":1901,"title":"a"}]'; caps=$(cat "$T/caps.md")
    merged=$'#1902 row b merged\n#1500 other'; eval "$step"; echo "act=$act")
grep -q '^ACT   stuck: 2 pull requests' <<<"$w" && grep -q 'disagree: #1902 .* source says merged' <<<"$w" && grep -q '^act=2$' <<<"$w" \
  && ok "lead-watch step 11 prints the board and counts its 2 ACT lines" || no "lead-watch wiring" "$w"

[ "$fail" = 0 ] && echo "lead-watch board: all cases as expected" || echo "lead-watch board: $fail case(s) failed"
exit "$fail"
