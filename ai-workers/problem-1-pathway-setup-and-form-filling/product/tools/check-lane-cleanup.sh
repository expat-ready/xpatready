#!/usr/bin/env bash
# A348 (founder 24 Nov): lane-cleanup.py, the list of sessions whose pull requests have all merged. Pass and fail case for
# each rule, on a made-up repository and app view. US$0, no network.   bash product/tools/check-lane-cleanup.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/lc.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
R="$T/r"; g() { git -C "$R" -c user.email=t@t -c user.name=t -c commit.gpgsign=false "$@"; }
git init -q -b main "$R"; echo .claude > "$R/.gitignore"; g add -A; g commit -qm x
wt() { g worktree add -q -b "$1" "$R/.claude/worktrees/$2" main; }
merge() { g checkout -q main; g merge -q --no-ff -m "Merge pull request #$2 from o/$1" "$1"; }
com() { echo "$1" > "$R/.claude/worktrees/$1/f$1"; git -C "$R/.claude/worktrees/$1" add -A; git -C "$R/.claude/worktrees/$1" -c user.email=t@t -c user.name=t -c commit.gpgsign=false commit -qm w; }
for b in done dirty ahead never demo-main; do wt "lane/$b" $b; com $b; done
merge lane/done 101; merge lane/dirty 102; merge lane/ahead 103; merge lane/demo-main 104
echo z > "$R/.claude/worktrees/dirty/new"; echo z > "$R/.claude/worktrees/ahead/more"; git -C "$R/.claude/worktrees/ahead" add -A; git -C "$R/.claude/worktrees/ahead" -c user.email=t@t -c user.name=t -c commit.gpgsign=false commit -qm more
cat > "$T/av" <<'V'
app view 5 sessions
ok    Lane A · cloud · completed · needs: none · #101 merged · idle 90 min · context ?
FLAG  Lane B · cloud · review_ready · needs: none · #101 merged, #250 open · idle 90 min · context ? -> idle
ok    Lane C · cloud · completed · needs: none · no detail · idle 90 min · context ?
FLAG  Lane D #102 · cloud · need_input · needs: read #103 · x · idle 3 min · context ? -> need_input
ok    Lane E · mac · completed · needs: none · #101 · idle 3 min · context ?
V
run() { o=$(python3 -I "$TOOLS/lane-cleanup.py" --repo "$R" --ref main --app-view "${1:-$T/av}" 2>&1); }
has() { grep -qF -- "$1" <<<"$o" && echo 1; }; not() { ! grep -qF -- "$1" <<<"$o" && echo 1; }
run
ok "the counts: 1 of 4 mac, 2 of 4 cloud, no ACT" "$([ "$(not ACT)" = 1 ] && has 'lanes to clean up: 1 of 4 mac, 2 of 4 cloud')" "$o"
ok "pass: a clean worktree whose PR merged is listed" "$(has 'clean  mac    done · lane/done · merged #101')" "$o"
ok "fail: uncommitted work is never listed" "$(not 'mac    dirty')" "$o"
ok "fail: a commit after the merge is never listed" "$(not 'mac    ahead')" "$o"
ok "fail: a branch no PR merged from is never listed" "$(not 'mac    never')" "$o"
ok "the demo's copy is never listed" "$(not 'mac    demo-main')" "$o"
ok "pass: a cloud lane whose every PR merged is listed" "$(has 'cloud  Lane A · completed · needs: none · merged #101')" "$o"
ok "fail: one PR still open" "$(not 'Lane B')" "$o"
ok "fail: a lane that names no PR" "$(not 'Lane C')" "$o"
ok "an asking lane shows what it needs" "$(has 'cloud  Lane D #102 · need_input · needs: read #103 · merged #102 #103')" "$o"
ok "a mac session of the app view is not counted as cloud" "$(not 'Lane E')" "$o"
run "$T/none"; ok "no app view: said, never 0 of 0" "$(has '0 of no app view, none of the cloud')" "$o"
o=$(python3 -I "$TOOLS/lane-cleanup.py" --repo "$R" --ref nope 2>&1); ok "fail: an unreadable main is an ACT" "$(has 'ACT   lane clean-up list not read')" "$o"
ok "the worktrees and branches are all still there" "$([ "$(g worktree list | wc -l)" -eq 6 ] && [ "$(g branch | wc -l)" -eq 6 ] && echo 1)"
sed -n '/^# 10c\. Lane clean-up/,/^$/p' "$TOOLS/lead-watch.sh" > "$T/step.sh"; mkdir -p "$T/t"
step() { printf 'print("""%s""")\n' "$1" > "$T/t/lane-cleanup.py"; o=$( ( TOOLS="$T/t"; act=0; ACT() { act=$((act + 1)); echo "ACT   $1"; }; seen() { :; }; fresh() { :; }; . "$T/step.sh"; echo "acts=$act" ) 2>&1 ); }
step 'lanes to clean up: 0'; ok "lead-watch.sh prints the list, no ACT counted" "$([ "$(has 'lanes to clean up')" = 1 ] && has 'acts=0')" "$o"
step 'ACT   lane clean-up list not read'; ok "lead-watch.sh counts its ACT line" "$(has 'acts=1')" "$o"
step Traceback; ok "fail: a lane-cleanup.py that dies is an ACT" "$(has 'ACT   lane clean-up list: lane-cleanup.py did not run')" "$o"
finish
