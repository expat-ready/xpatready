#!/usr/bin/env bash
# Guard test for proof-read-watch.py (founder 20 Nov 23:1x IST, STATE hand-over Lead 4 -> Lead 5 item (3)): (a) a merged
# "Completes:" capability with no qa PR after 30 min is an ACT, a wait or a later qa PR is not, R1.5 is never proved by
# "R1.59"; (b) an approved, unlabelled, ready PR on a Lead-read path with no "Lead read the diff: <head>" is an ACT, over
# 24 h it joins one line; a failed read is an ACT. Fixtures only: US$0, no network.
#   bash product/tools/check-proof-read-watch.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
W="$TOOLS/proof-read-watch.py"
F=$(mktemp -d "${TMPDIR:-/tmp}/prw.XXXXXXXX"); trap 'rm -rf "$F"' EXIT
H=abcdef1234567890abcdef1234567890abcdef12; OLD=1111111222222233333334444444555555566666
NOW=2026-11-20T18:00:00Z
export PRW_PER_PAGE=10   # pages of 10, so the fixture's second page of closed PRs is read (review M1)
U=2026-11-20T17:59:00Z
cat > "$F/closed.json" <<J
[{"number":10,"merged_at":"2026-11-20T17:20:00Z","created_at":"2026-11-20T10:00:00Z","updated_at":"$U","title":"runtime: a","body":"Done\nCompletes: R1.59\n"},
 {"number":11,"merged_at":"2026-11-20T17:00:00Z","created_at":"2026-11-20T10:00:00Z","updated_at":"$U","title":"screens: b","body":"- Completes: R1.72"},
 {"number":12,"merged_at":"2026-11-20T17:20:00Z","created_at":"2026-11-20T10:00:00Z","updated_at":"$U","title":"runtime: c","body":"> Completes: R1.5"},
 {"number":13,"merged_at":"2026-11-20T16:00:00Z","created_at":"2026-11-20T10:00:00Z","updated_at":"$U","title":"runtime: d","body":"**Completes:** R1.8"},
 {"number":14,"merged_at":"2026-11-18T10:00:00Z","created_at":"2026-11-18T09:00:00Z","updated_at":"$U","title":"runtime: old","body":"Completes: R1.9"},
 {"number":15,"merged_at":null,"created_at":"2026-11-20T10:00:00Z","updated_at":"$U","title":"closed unmerged","body":"Completes: R1.11"},
 {"number":16,"merged_at":"2026-11-20T17:50:00Z","created_at":"2026-11-20T10:00:00Z","updated_at":"$U","title":"runtime: e","body":"Completes: R1.6"},
 {"number":17,"merged_at":"2026-11-20T16:00:00Z","created_at":"2026-11-20T10:00:00Z","updated_at":"$U","title":"runtime: f","body":"~~~\nCompletes: R1.12\n~~~\nWe Completes R1.14 in prose\nCompletes: R1.15 and more"},
 {"number":20,"merged_at":"2026-11-20T17:10:00Z","created_at":"2026-11-20T17:05:00Z","updated_at":"$U","title":"qa: capability R1.72 Works on main","body":""},
 {"number":21,"merged_at":null,"created_at":"2026-11-20T15:00:00Z","updated_at":"$U","title":"qa: capability R1.8 Partial","body":""}]
J
cat > "$F/closed_p2.json" <<J
[{"number":22,"merged_at":null,"created_at":"2026-11-20T17:40:00Z","updated_at":"2026-11-20T17:40:00Z","title":"qa: capability R1.50 Works","body":""},
 {"number":23,"merged_at":"2026-11-20T17:45:00Z","created_at":"2026-11-20T17:30:00Z","updated_at":"2026-11-20T17:45:00Z","title":"QA-610: fix R1.13 panel","body":""},
 {"number":24,"merged_at":"2026-11-20T15:00:00Z","created_at":"2026-11-20T10:00:00Z","updated_at":"2026-11-20T15:00:00Z","title":"runtime: g","body":"Completes: R1.13"},
$(for k in 60 61 62 63 64 65; do printf ' {"number":%s,"merged_at":null,"created_at":"2026-11-20T10:00:00Z","updated_at":"2026-11-20T12:00:00Z","title":"x","body":""},\n' $k; done)
 {"number":25,"merged_at":"2026-11-19T10:00:00Z","created_at":"2026-11-19T09:00:00Z","updated_at":"2026-11-19T10:00:00Z","title":"runtime: h","body":"Completes: R1.17"}]
J
echo '[{"number":26,"merged_at":"2026-11-20T15:00:00Z","created_at":"2026-11-20T10:00:00Z","updated_at":"2026-11-20T15:00:00Z","title":"x","body":"Completes: R1.18"}]' > "$F/closed_p3.json"   # in the window: read only if paging failed to stop
pr() { printf '{"number":%s,"draft":%s,"title":"pr %s","head":{"ref":"%s","sha":"%s"},"labels":[%s]}' "$1" "$2" "$1" "$3" "$4" "$5"; }
echo "[$(pr 30 false b30 $H ''),$(pr 31 false b31 $H ''),$(pr 32 false b32 $H ''),$(pr 33 false b33 $H ''),$(pr 34 false b34 $H '{"name":"review: approved"}'),$(pr 35 true b35 $H ''),$(pr 36 false b36 $H ''),$(pr 37 false b37 $H ''),$(pr 38 false mergify/x $H ''),$(pr 39 false b39 $H '')]" > "$F/open.json"
echo "[$(pr 40 false b40 $H ''),$(pr 41 false b41 $H ''),$(pr 42 false b42 $H ''),$(pr 43 false b43 $H ''),$(pr 44 false b44 $H '')]" > "$F/open_p2.json"

ap() { printf '{"created_at":"%s","author_association":"%s","body":"%s"}' "$1" "${3:-MEMBER}" "$2"; }
MIG='[{"filename":"ai-workers/x/prototype/studio/prisma/migrations/2026/migration.sql"}]'
for n in 30 31 32 34 35 36 37 38 39 40 41 42; do echo "$MIG" > "$F/files_$n.json"; done
echo '[{"filename":"ai-workers/x/prototype/studio/web/src/page.tsx"}]' > "$F/files_33.json"
echo '[{"filename":".claude/skills/lead/SKILL.md"}]' > "$F/files_43.json"
echo '[{"filename":"ai-workers/x/studio/web/src/moved.ts","previous_filename":"ai-workers/x/studio/prisma/migrations/1/migration.sql"}]' > "$F/files_44.json"
echo "[$(ap 2026-11-20T17:00:00Z "Reviewer: Approve $H")]" > "$F/comments_30.json"
echo "[$(ap 2026-11-20T17:00:00Z "Reviewer: Approve $H"),$(ap 2026-11-20T17:10:00Z "Lead read the diff: ${H:0:9} (Lead 5)")]" > "$F/comments_31.json"
echo "[$(ap 2026-11-20T17:00:00Z "Reviewer: Approve $OLD")]" > "$F/comments_32.json"
for n in 33 34 35 38 43 44; do cp "$F/comments_30.json" "$F/comments_$n.json"; done
echo "[$(ap 2026-11-19T10:00:00Z "Reviewer: Approve $H")]" > "$F/comments_36.json"
echo "[$(ap 2026-11-20T17:00:00Z "**Reviewer:** Approve \`$H\`")]" > "$F/comments_37.json"
echo "[$(ap 2026-11-20T17:00:00Z "Reviewer: Approve $H"),$(ap 2026-11-20T17:20:00Z "Reviewer: Changes requested on ${H:0:9}: M1")]" > "$F/comments_39.json"
echo "[$(ap 2026-11-20T17:00:00Z "Reviewer: Approve $H" CONTRIBUTOR)]" > "$F/comments_40.json"
echo "[$(ap 2026-11-20T17:00:00Z "Reviewer: Approve $H"),$(ap 2026-11-20T17:10:00Z "Lead read the diff: ${H:0:9}" CONTRIBUTOR)]" > "$F/comments_41.json"
echo "[$(ap 2026-11-20T16:00:00Z "Reviewer: Approve $H"),$(ap 2026-11-20T17:30:00Z "Reviewer: Approved $H")]" > "$F/comments_42.json"

out=$(python3 -I "$W" --fixture "$F" --now "$NOW"); rc=$?
has() { grep -qF -- "$1" <<<"$out" && echo 1 || echo 0; }
hasnt() { grep -qF -- "$1" <<<"$out" && echo 0 || echo 1; }
ok "(a) merged 40 min ago with no qa PR is an ACT naming the command" "$(has 'ACT   R1.59 merged in #10')" "$out"
ok "(a) the ACT says what to type" "$(has '"/qa capability R1.59"')" "$out"
ok "(a) a qa PR opened after the merge proves it" "$(hasnt 'ACT   R1.72')" "$out"
ok "(a) under 30 min it waits, no ACT" "$(hasnt 'ACT   R1.6 ')" "$out"
ok "(a) a quoted Completes: line counts and R1.5 is never proved by \"R1.50\"" "$(has 'ACT   R1.5 merged in #12')" "$out"
ok "(a) a list-item Completes: line counts (R1.72 proved, not unread)" "$(has 'proof R1.72: qa PR #20')" "$out"
ok "(a) fenced, colon-less and unreadable Completes: lines are no claim" "$( [ "$(has 'R1.12')$(has 'R1.14')$(has 'R1.15')" = 000 ] && echo 1 || echo 0)" "$out"
ok "(a) a QA-<n>: builder fix is no proof; page 2 is read" "$(has 'ACT   R1.13 merged in #24')" "$out"
ok "(a) paging stops once a page reaches outside 24 h" "$(hasnt 'R1.18')" "$out"
ok "(a) a qa PR opened before the merge does not count" "$(has 'ACT   R1.8 merged in #13')" "$out"
ok "(a) outside 24 h and unmerged PRs are ignored" "$( [ "$(has 'R1.9 ')$(has 'R1.11')" = 00 ] && echo 1 || echo 0)" "$out"
ok "(b) approved on head, migration, no read is an ACT with its age" "$(has 'ACT   #30 approved at abcdef123 60 min ago')" "$out"
ok "(b) a Lead read on the head clears it" "$(hasnt '#31 ')" "$out"
ok "(b) an Approve on an older head does not count" "$(hasnt '#32 ')" "$out"
ok "(b) no Lead-read path, no ACT" "$(hasnt '#33 ')" "$out"
ok "(b) labelled, draft and mergify PRs are skipped" "$( [ "$(has '#34 ')$(has '#35 ')$(has '#38 ')" = 000 ] && echo 1 || echo 0)" "$out"
ok "(b) bold and backticked Approve lines count" "$(has 'ACT   #37 approved')" "$out"
ok "(b) a later Changes requested on the head clears it" "$(hasnt '#39 ')" "$out"
ok "(b) an Approve from a non-writer does not count" "$(hasnt '#40 ')" "$out"
ok "(b) a Lead read from a non-writer does not clear it; open page 2 is read" "$(has 'ACT   #41 approved')" "$out"
ok "(b) Approved counts and the age runs from the first Approve on the head" "$(has 'ACT   #42 approved at abcdef123 120 min ago')" "$out"
ok "(b) a .md on a Lead-read path counts, as queue-gate holds it (SKILL.md)" "$(has 'ACT   #43 approved')" "$out"
ok "(b) a rename out of a Lead-read path counts (previous_filename)" "$(has 'ACT   #44 approved')" "$out"
ok "(b) over 24 h joins one line" "$(has '1 approved PR(s) waiting over 24 h on the Lead'"'"'s P-423 read: #36 (32 h)')" "$out"
ok "exit code is the ACT count (11)" "$( [ "$rc" = 11 ] && echo 1 || echo 0)" "rc=$rc; $out"
echo '{not json' > "$F/open.json"
out=$(python3 -I "$W" --fixture "$F" --now "$NOW"); rc=$?
ok "a failed read is an ACT and exit 1, never a silent pass" "$( [ "$rc" = 1 ] && has 'ACT   proof/read watch could not run' || echo 0)" "$out"
grep -qF "proof-read-watch.py\" 2>&1); echo \"\$pw\"; act=\$((act + \$(grep -c '^ACT' <<<\"\$pw\"))); seen \"\$pw\"" "$TOOLS/lead-watch.sh"
ok "lead-watch.sh 2d runs proof-read-watch.py and adds its ACT lines to the count" "$([ $? = 0 ] && echo 1 || echo 0)"
finish
