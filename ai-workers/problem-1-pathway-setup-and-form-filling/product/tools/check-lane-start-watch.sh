#!/usr/bin/env bash
# Test of LR-171 (founder A455, 28 Nov): every lane in STATE's "Lanes running" line whose session activity (the saved app
# view) and pushes (a branch it names) are both over 90 min old is one ACT in lead-watch; a 10-min lane is none; a push
# counts as activity; a lane missing from the view is an ACT; no saved view is one ACT for the unwatched lanes. Fixture
# STATE, app view and a throwaway repository; no network, US$0.   bash product/tools/check-lane-start-watch.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/lanestart.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
NOW=1800000000; W="$TOOLS/lane-start-watch.py"
cat > "$T/STATE.md" <<'S'
# State
**Lanes running (cloud, started 12:5x):** fast-route session_01AAAAAAAAAAAAAAAAAAAAAA, ship-security session_01BBBBBBBBBBBBBBBBBBBBBB, cleanup (+ glossary) session_01CCCCCCCCCCCCCCCCCCCCCC branch claude/cleanup-x; lab-prover (batch hourly).
S
view() {  # view <age of the view in min> <lines...>
  local a=$1; shift; { printf 'saved 28 Nov 13:00 IST epoch %s\napp view %s sessions · 0 flagged · rows=%s\n' "$((NOW - a * 60))" "$#" "$#"; printf '%s\n' "$@"; } > "$T/view.txt"; }
ln() { echo "ok    $1 · cloud · running · needs: none · no detail · idle $2 min · context 10k (1%) · id $3"; }
git init -q "$T/repo"; git -C "$T/repo" commit -q --allow-empty -m a
run() { out=$(python3 -I "$W" --state "$T/STATE.md" --view "$T/view.txt" --repo "$T/repo" --now "$NOW"); }
# the founder's Done when: a 91-min-idle lane gives exactly one ACT, a 10-min lane none
view 0 "$(ln fast-route 91 session_01AAAAAAAAAAAAAAAAAAAAAA)" "$(ln ship-security 10 session_01BBBBBBBBBBBBBBBBBBBBBB)" "$(ln cleanup 5 session_01CCCCCCCCCCCCCCCCCCCCCC)"
run
ok "a 91-min-idle lane gives exactly one ACT, naming it" "$([ "$(grep -c '^ACT' <<<"$out")" = 1 ] && grep -q '^ACT   lane start: fast-route (session_01AAAAAAAAAAAAAAAAAAAAAA) quiet 91 min' <<<"$out" && echo 1)" "$out"
ok "... the 10-min lane none, and the summary counts STATE's three lanes with a session" "$(! grep -q 'ship-security' <<<"$out" && grep -q '^lanes running: 3 in STATE, 1 quiet over 90 min' <<<"$out" && echo 1)" "$out"
view 0 "$(ln fast-route 90 session_01AAAAAAAAAAAAAAAAAAAAAA)" "$(ln ship-security 10 session_01BBBBBBBBBBBBBBBBBBBBBB)" "$(ln cleanup 5 session_01CCCCCCCCCCCCCCCCCCCCCC)"
run; ok "exactly 90 min is not over 90: no ACT" "$(! grep -q '^ACT' <<<"$out" && echo 1)" "$out"
# the view's own age adds to the idle minutes
view 30 "$(ln fast-route 61 session_01AAAAAAAAAAAAAAAAAAAAAA)" "$(ln ship-security 10 session_01BBBBBBBBBBBBBBBBBBBBBB)" "$(ln cleanup 5 session_01CCCCCCCCCCCCCCCCCCCCCC)"
run; ok "idle 61 min in a view saved 30 min ago is 91 min: one ACT" "$(grep -q 'fast-route .* quiet 91 min' <<<"$out" && echo 1)" "$out"
# a lane missing from the view, with no push: an ACT
view 0 "$(ln fast-route 5 session_01AAAAAAAAAAAAAAAAAAAAAA)" "$(ln cleanup 5 session_01CCCCCCCCCCCCCCCCCCCCCC)"
run; ok "a lane missing from the app view, with no push: an ACT" "$(grep -q '^ACT   lane start: ship-security .* is not in the app view and shows no push' <<<"$out" && echo 1)" "$out"
# a push counts: the cleanup lane's branch pushed 5 min ago, its session idle 200 min
git -C "$T/repo" update-ref refs/remotes/origin/claude/cleanup-x "$(GIT_COMMITTER_DATE="@$((NOW - 300)) +0000" git -C "$T/repo" commit-tree "$(git -C "$T/repo" rev-parse HEAD^{tree})" -m p)"
view 0 "$(ln fast-route 5 session_01AAAAAAAAAAAAAAAAAAAAAA)" "$(ln ship-security 10 session_01BBBBBBBBBBBBBBBBBBBBBB)" "$(ln cleanup 200 session_01CCCCCCCCCCCCCCCCCCCCCC)"
run; ok "a lane whose named branch was pushed 5 min ago is not quiet, whatever its session says" "$(! grep -q '^ACT' <<<"$out" && echo 1)" "$out"
git -C "$T/repo" update-ref refs/remotes/origin/claude/cleanup-x "$(GIT_COMMITTER_DATE="@$((NOW - 100 * 60)) +0000" git -C "$T/repo" commit-tree "$(git -C "$T/repo" rev-parse HEAD^{tree})" -m p)"
run; ok "... pushed 100 min ago and idle 200 min: an ACT saying both" "$(grep -q 'cleanup (+ glossary) (session_01CCCCCCCCCCCCCCCCCCCCCC) quiet 100 min (session 200 min, push 100 min' <<<"$out" && echo 1)" "$out"
# no app view saved: one ACT for the unwatched lanes
rm -f "$T/view.txt"; git -C "$T/repo" update-ref -d refs/remotes/origin/claude/cleanup-x
run; ok "no saved app view: one ACT naming the lanes not watched" "$([ "$(grep -c '^ACT' <<<"$out")" = 1 ] && grep -q 'no app view saved, so 3 lane(s)' <<<"$out" && echo 1)" "$out"
# lead-watch runs it and counts its ACT lines; app-view.js writes the id it matches
ok "lead-watch.sh runs lane-start-watch.py and counts its ACT lines" "$(grep -q 'lsw=$(python3 -I "$TOOLS/lane-start-watch.py"' "$TOOLS/lead-watch.sh" && grep -q '^echo "$lsw"; act=$((act + $(grep -c .^ACT. <<<"$lsw")))' "$TOOLS/lead-watch.sh" && echo 1)"
if command -v node >/dev/null; then
  l=$(node -e 'const v=require(process.argv[1]); console.log(v.lines({data:[{id:"session_01AAAAAAAAAAAAAAAAAAAAAA",title:"fast-route",status:"running",last_event_at:new Date(1800000000000-5*60000).toISOString(),post_turn_summary:{status_category:"working"}}]}, 1800000000000, 0, 1))' "$TOOLS/app-view.js" 2>&1)
  ok "app-view.js ends each session line with its id (what lane-start-watch.py matches)" "$(grep -q ' · id session_01AAAAAAAAAAAAAAAAAAAAAA$' <<<"$l" && echo 1)" "$l"
else ok "app-view.js ends each session line with its id (node missing: read the source)" "$(grep -q '`id ${clean(s.id' "$TOOLS/app-view.js" && echo 1)"; fi
finish
