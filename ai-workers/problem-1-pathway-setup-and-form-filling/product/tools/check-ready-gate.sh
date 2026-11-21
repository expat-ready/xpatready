#!/usr/bin/env bash
# Guard test for ready-gate.py (ENF-782a part 1, P-782 (2)): a PR saying "Completes: R1.n" with a part not merged fails
# naming the part; with every part merged (or the part in this PR's title) and the journey present it passes; a missing
# journey, pack or suite is named; "X part 2" in a merged title counts as X2; a part merged only inside a branch (not a
# PR merge on main) does not count; report-only for 2 hours after the gate reached main, then blocking; READY_GATE=report
# holds it off; pr-rules.yml runs it and .mergify.yml's product queue waits on it. Fixtures only: US$0, no network.
#   bash product/tools/check-ready-gate.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
eval "_ok() $(declare -f ok | tail -n +2)"   # several 1/0 results joined count as 1 only when all are 1
ok() { case "$2" in *0*|"") _ok "$1" 0 "${3:-}";; *) _ok "$1" 1 "${3:-}";; esac; }
G="$TOOLS/ready-gate.py"; ROOTD="$(cd "$TOOLS/../../../.." && pwd)"
F=$(mktemp -d "${TMPDIR:-/tmp}/rg.XXXXXXXX"); trap 'rm -rf "$F"' EXIT
R="$F/repo"; mkdir -p "$R" "$F/st/tests/journeys" "$F/st/acceptance" "$F/bl"
g() { git -C "$R" -c user.email=t@t -c user.name=t -c commit.gpgsign=false "$@"; }
g init -q -b main; g commit -q --allow-empty -m init
mpr() {  # $1 PR number, $2 title: a PR merge commit on main
  g checkout -q -b "b$1"; g commit -q --allow-empty -m "work $1"; g checkout -q main
  GIT_COMMITTER_DATE="${3:-2026-11-21T00:00:00Z}" g merge -q --no-ff "b$1" -m "Merge pull request #$1 from o/b$1" -m "$2"; }
mpr 101 "screens: FO-3sr — reschedule by link (R1.42)"
mpr 102 "runtime: FO-3a part 2a — the consult record"
mpr 103 "runtime: FO-3a part 2b — the read feed"
mpr 104 "screens: PF-19b3 delivery state"
mpr 106 "records: FO-3st3 concept and challenge"            # a concept is not the part (review M2)
mpr 107 "screens: FO-9q — the panel, after FO-3st3 lands"     # a mention past the leading segment is not the part
mpr 108 "migration — runtime: FO-7k part 1 — the table"       # the first segment naming an id leads (FO-7k1)
mpr 109 "runtime: FO-3st3x renamed work"                       # merged under another name: the body may say so
mpr 111 "runtime: FO-13i part 2 — an expired document is refused (QA-510)"   # a fixed bug id in brackets counts (m6)
mpr 112 "qa: capability R1.9 — Partial (QA-511 found)"                         # a qa verdict naming a bug is no fix
# A branch merge (not a PR merge on main) naming FO-3st3 must not count:
g checkout -q -b side; g commit -q --allow-empty -m x; g checkout -q main; g checkout -q -b b105; g merge -q --no-ff side -m "Merge FO-3st3 into b105"
g checkout -q main; g merge -q --no-ff b105 -m "Merge pull request #105 from o/b105" -m "runtime: FO-9z unrelated"
cat > "$F/bl/BACKLOG.md" <<'B'
| Row | Area | What | Done when |
|---|---|---|---|
| J-42 | join and walk (map row 42; P-606) | **Join and walk.** Parts it joins: FO-3sr · FO-3a parts 2a and 2b · FO-3st3 (QA-999). Walk: x. **Touch:** `tests/journeys/j_42.ts` | y |
| J-38 | join and walk (map row 38, 40; P-606) | **Join.** Parts it joins: FO-3sr. Walk: x. | y |
| J-9 | join and walk (map row 9; P-606) | **Join.** Parts it joins: FO-7k part 1 · QA-510. Walk: x. | y |
B
cat > "$F/focus.md" <<'B'
| Item | Rows a brief may name | Lead | Parts left |
|---|---|---|---|
| R1.48 | PF-19b3, J-48 | Lead B | J-48 |
B
cat > "$F/caps.md" <<'B'
| # | Map row: capability | Module | Status | Tested on | Case side | Done when (what qa tests) | Evidence |
|---|---|---|---|---|---|---|---|
| R1.42 | 42 Reschedule | FO | Partial | — | — | pack C4.2 green and check_fo3st_x.ts passes | — |
| R1.48 | 48 Sending | PF | Partial | — | — | j_48 green | — |
| R1.40 | 40 Invite files | FO | Partial | — | — | j_38 | — |
| R1.7 | 7 Nothing listed | PF | Partial | — | — | walk | — |
| R1.9 | 9 Migration part | PF | Partial | — | — | walk | — |
B
touch "$F/st/acceptance/C4.2.test.ts" "$F/st/tests/check_fo3st_x.ts" "$F/st/tests/journeys/j_42.ts" "$F/st/tests/journeys/j_48.ts" "$F/st/tests/journeys/j_7.ts" "$F/st/tests/journeys/j_9.ts"
export READY_ROOT="$R" READY_BASE=main READY_STUDIO="$F/st" READY_CAPS="$F/caps.md" WAVES_FOCUS="$F/focus.md" FOCUS_BACKLOG_DIR="$F/bl" READY_GATE=block
run() { out=$(printf '%s\n' "$2" | TITLE="$1" python3 -I "$G" 2>&1); rc=$?; }
has() { grep -qF -- "$1" <<<"$out" && echo 1 || echo 0; }
hasnt() { grep -qF -- "$1" <<<"$out" && echo 0 || echo 1; }

run "evidence: J-42 walk" "Done when: x
Completes: R1.42"
ok "a missing part fails (exit 1)" "$([ $rc = 1 ] && echo 1 || echo 0)" "rc=$rc $out"
ok "the failure names the missing part FO-3st3" "$(has 'FAIL  R1.42: part FO-3st3 (listed in its J-row) has not merged')" "$out"
ok "a branch-only merge naming FO-3st3 does not count" "$(hasnt 'part FO-3st3 merged')" "$out"
ok "\"FO-3a part 2a\" in a merged title counts as FO-3a2a" "$(has 'ok    R1.42: part FO-3a2a merged in #102')" "$out"
ok "\"parts 2a and 2b\" does not ask for all of FO-3a" "$(hasnt 'part FO-3a ')" "$out"
ok "a (parenthesis) on the parts line is a note, not a part" "$(hasnt 'QA-999')" "$out"
ok "a records PR naming FO-3st3 and a later mention of it do not count (review M2)" "$(hasnt 'FO-3st3 merged in #106')$(hasnt 'FO-3st3 merged in #107')" "$out"

run "evidence: J-42 — after FO-3st3" "Completes: R1.42"
ok "a title that only mentions a part past its leading segment is not that part" "$([ $rc = 1 ] && echo 1 || echo 0)$(hasnt 'FO-3st3 is this PR')" "rc=$rc $out"
run "evidence: J-42" "Completes: R1.42
Part FO-3st3 merged in #109"
ok "\"Part X merged in #N\" with #N's merge on main counts, and says so (review m1)" "$([ $rc = 0 ] && echo 1 || echo 0)$(has 'part FO-3st3 merged in #109 (the body says so')" "rc=$rc $out"
run "evidence: J-42" "Completes: R1.42
Part FO-3st3 merged in #999"
ok "...a PR number with no merge on main does not" "$([ $rc = 1 ] && echo 1 || echo 0)" "rc=$rc $out"

run "screens: FO-3st3 — booking types (R1.42)" "Completes: R1.42"
ok "every part merged or this PR's title, journey present: passes" "$([ $rc = 0 ] && echo 1 || echo 0)" "rc=$rc $out"
ok "the part in the title is this PR" "$(has 'ok    R1.42: part FO-3st3 is this PR')" "$out"
ok "the pass line names the journey" "$(has 'PASS  R1.42: every listed part')" "$out"

run "x" "Completes: R1.48"
ok "the J-row part J-48 counts as its journey j_48.ts; merged PF-19b3 counts" "$([ $rc = 0 ] && echo 1 || echo 0)$(has 'part J-48 is its journey tests/journeys/j_48.ts')$(has 'part PF-19b3 merged in #104')" "$out"
rm "$F/st/tests/journeys/j_48.ts"; run "x" "Completes: R1.48"
ok "...and fails when j_48.ts is missing, naming J-48 and the journey" "$([ $rc = 1 ] && echo 1 || echo 0)$(has 'part J-48 (listed in focus-list.md)')$(has 'its journey tests/journeys/j_48.ts is not on main')" "$out"

rm "$F/st/acceptance/C4.2.test.ts" "$F/st/tests/check_fo3st_x.ts" "$F/st/tests/journeys/j_42.ts"
run "screens: FO-3st3" "Completes: R1.42"
ok "a missing journey, pack and suite are each named" "$(has 'journey tests/journeys/j_42.ts is not on main')$(has 'acceptance pack C4.2')$(has 'suite tests/check_fo3st_x.ts')" "$out"
ok "...and fail" "$([ $rc = 1 ] && echo 1 || echo 0)" "rc=$rc"

run "x" "Completes: R1.40"
ok "R1.40 is walked by j_38.ts (item-proof's SHARED_JOURNEY) and J-38's parts (map row 38, 40) apply" "$(has 'its journey tests/journeys/j_38.ts is not on main')$(has 'part FO-3sr merged in #101')" "$out"

run "x" "Completes: R1.9"
ok "\"migration — runtime: FO-7k part 1 — ...\" leads with FO-7k1" "$([ $rc = 0 ] && echo 1 || echo 0)$(has 'part FO-7k1 merged in #108')" "rc=$rc $out"
ok "a fixed bug id in a title's brackets counts (QA-510 in #111, review m6)" "$(has 'part QA-510 merged in #111')" "$out"
sed -i 's/QA-510\. Walk/QA-511. Walk/' "$F/bl/BACKLOG.md"; run "x" "Completes: R1.9"
ok "...a bug id named only by a qa: verdict PR does not" "$([ $rc = 1 ] && echo 1 || echo 0)$(has 'part QA-511 (listed in its J-row)')" "rc=$rc $out"
run "x" "Completes: R1.7"
ok "no part list: a warning names the gap, journey present passes" "$([ $rc = 0 ] && echo 1 || echo 0)$(has 'R1.7 has no line in focus-list.md and no J-row')" "$out"
run "x" "Done when: no claim"
ok "no Completes: line passes" "$([ $rc = 0 ] && echo 1 || echo 0)" "$out"

# The switch: report-only until 2 h after ready-gate.py reached main, then blocking.
unset READY_GATE
run "x" "Completes: R1.48"
ok "auto, gate not on main: report-only (exit 0, a warning)" "$([ $rc = 0 ] && echo 1 || echo 0)$(has 'report-only')" "rc=$rc $out"
# Review M1: the gate's own commit is dated 05:41 on its branch and reaches main by a merge at 10:00: the window starts at 10:00.
g checkout -q -b gate; mkdir -p "$R/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools"; echo x > "$R/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/ready-gate.py"
g add -A; GIT_COMMITTER_DATE=2026-11-21T05:41:00Z g commit -q -m "gate"; g checkout -q main
GIT_COMMITTER_DATE=2026-11-21T10:00:00Z g merge -q --no-ff gate -m "Merge pull request #110 from o/gate" -m "tooling: ready gate"
READY_NOW=2026-11-21T11:59:00Z run "x" "Completes: R1.48"
ok "auto, 1 h 59 min after it reached main: still report-only" "$([ $rc = 0 ] && echo 1 || echo 0)$(has 'report-only until 2026-11-21 12:00 UTC')" "rc=$rc $out"
READY_NOW=2026-11-21T12:00:00Z run "x" "Completes: R1.48"
ok "auto, 2 h after: blocking (exit 1)" "$([ $rc = 1 ] && echo 1 || echo 0)$(has 'blocking since 2026-11-21 12:00 UTC')" "rc=$rc $out"
READY_GATE=report READY_NOW=2026-11-21T12:00:00Z run "x" "Completes: R1.48"
ok "the kill switch READY_GATE=report holds it off" "$([ $rc = 0 ] && echo 1 || echo 0)" "rc=$rc $out"

# Wiring: pr-rules runs it with main's history; the product queue waits on its check.
W="$ROOTD/.github/workflows/pr-rules.yml"
ok "pr-rules.yml has the job completes-ready running ready-gate.py" "$(grep -q '^  completes-ready:' "$W" && grep -q 'ready-gate.py' "$W" && echo 1 || echo 0)"
ok "the job reads main's full history (fetch-depth: 0)" "$(awk '/^  completes-ready:/{f=1} f&&/fetch-depth: 0/{print 1; exit}' "$W" | grep -q 1 && echo 1 || echo 0)"
ok "the job passes the kill switch vars.READY_GATE" "$(grep -q 'READY_GATE: "\${{ vars.READY_GATE }}"' "$W" && echo 1 || echo 0)"
ok ".mergify.yml's product queue waits on completes-ready" "$(awk '/- name: product/{f=1} /- name: pipeline/{f=0} f&&/-check-failure = completes-ready/{print 1; exit}' "$ROOTD/.mergify.yml" | grep -q 1 && echo 1 || echo 0)"
finish
