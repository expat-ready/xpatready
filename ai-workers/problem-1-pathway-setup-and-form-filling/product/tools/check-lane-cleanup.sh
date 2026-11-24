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
for b in done dirty ahead never demo-main me; do wt "lane/$b" $b; done
for b in done dirty ahead demo-main me; do com $b; done
merge lane/done 101; merge lane/dirty 102; merge lane/ahead 103; merge lane/demo-main 104; merge lane/me 105
echo z > "$R/.claude/worktrees/dirty/new"; echo z > "$R/.claude/worktrees/ahead/more"; git -C "$R/.claude/worktrees/ahead" add -A; git -C "$R/.claude/worktrees/ahead" -c user.email=t@t -c user.name=t -c commit.gpgsign=false commit -qm more
NOW=1800000000; av() { printf '%s\n' "$1" "app view 8 sessions · 2 flagged · rows=8" "${@:2}" > "$T/av"; }
good() { av "read epoch $((NOW - 600))" \
  'ok    Lane A · cloud · completed · needs: none · #101 merged · idle 90 min · context ?' \
  'ok    Lane B · cloud · completed · needs: none · #101 merged, #250 open · idle 90 min · context ?' \
  'ok    Lane C · cloud · completed · needs: none · no detail · idle 90 min · context ?' \
  'FLAG  Lane D #102 · cloud · need_input · needs: read #103 · x · idle 90 min · context ? -> need_input' \
  'ok    Lane E · mac · completed · needs: none · #101 · idle 90 min · context ?' \
  'ok    Lane F · cloud · working · needs: none · rebasing on #101 · idle 90 min · context ?' \
  'ok    Lane G · cloud · completed · needs: none · #101 · idle 5 min · context ?' \
  'ok    Lane H after #101 · cloud · completed · needs: none · opened pull request 390 · idle 90 min · context ?' \
  'ok    Lane I · cloud · completed · needs: none · https://github.com/o/r/pull/391 after #101 · idle 90 min · context ?' \
  'ok    Lane J · cloud · completed · needs: read it · #101 · idle 90 min · context ?'; }
run() { o=$(python3 -I "$TOOLS/lane-cleanup.py" --repo "$R/.claude/worktrees/me" --ref main --app-view "${1:-$T/av}" --now "$NOW" 2>&1); }
has() { grep -qF -- "$1" <<<"$o" && echo 1; }; not() { ! grep -qF -- "$1" <<<"$o" && echo 1; }
good; touch -t 202001010000 "$R/.claude/worktrees/done/fdone"; inode() { ls -i "$(git -C "$R/.claude/worktrees/done" rev-parse --git-path index)"; }; i0=$(inode); run
ok "no lane's index is rewritten (its own git command may be running)" "$([ "$(inode)" = "$i0" ] && echo 1)"
ok "the counts: 1 of 4 mac, 1 of 9 cloud, no ACT" "$([ "$(not ACT)" = 1 ] && has 'lanes to clean up: 1 of 4 mac, 1 of 9 cloud')" "$o"
ok "pass: a clean worktree whose PR merged is listed" "$(has 'clean  mac    done · lane/done · merged #101')" "$o"
ok "fail: uncommitted work is never listed" "$(not 'mac    dirty')" "$o"
ok "fail: a commit after the merge is never listed" "$(not 'mac    ahead')" "$o"
ok "fail: a clean worktree at main that no PR merged from is never listed" "$(not 'mac    never')" "$o"
ok "the demo's copy and the worktree this runs in are never listed" "$([ "$(not 'mac    demo-main')" = 1 ] && not 'mac    me')" "$o"
ok "pass: a completed, idle cloud lane whose every PR merged is listed" "$(has 'cloud  Lane A · completed · idle 90 min · merged #101')" "$o"
for x in 'B:one PR still open' 'C:names no PR' 'D:it needs the Lead' 'E:a mac session is no cloud lane' 'F:a working lane that names a merged PR' 'G:idle under an hour' 'H:an open PR written in words' 'I:an open PR written as a link' 'J:completed but it needs something'; do ok "fail: Lane ${x%%:*}, ${x#*:}" "$(not "Lane ${x%%:*}")" "$o"; done
unused() { ok "fail: $1: said, and no cloud lane is listed" "$([ "$(has "no cloud lane judged: the app view cannot be used, $2")" = 1 ] && [ "$(not 'clean  cloud')" = 1 ] && has 'clean  mac    done')" "$o"; }
run "$T/none"; unused "no app view" 'there is none'
good; sed -i.b "1s/.*/read epoch $((NOW - 1000))/" "$T/av"; run; unused "read 16 min ago" 'it was read 17 min ago (over 15)'
: > "$T/av"; run; unused "an empty one" 'it carries no time'
good; sed -i.b '2s/.*/UNREADABLE signed out/' "$T/av"; run; unused "unreadable" 'it is not whole'
good; sed -i.b '2s/$/\
WARNING: list may be cut (50 of 50)/' "$T/av"; run; unused "cut" 'it is not whole'
good; sed -i.b '2s/ · rows=8//' "$T/av"; run; unused "no rows=N" 'it is not whole'
o=$(python3 -I "$TOOLS/lane-cleanup.py" --repo "$R" --ref nope 2>&1); ok "fail: an unreadable main is an ACT" "$(has 'ACT   lane clean-up list not read')" "$o"
ok "the worktrees and branches are all still there" "$([ "$(g worktree list | wc -l)" -eq 7 ] && [ "$(g branch | wc -l)" -eq 7 ] && echo 1)"
g worktree lock "$R/.claude/worktrees/dirty"; mv "$R/.claude/worktrees/dirty" "$T/moved"; good; run; ok "fail: one worktree that cannot be read is one ACT, the others are still judged" "$([ "$(grep -c '^ACT' <<<"$o")" = 1 ] && [ "$(has 'ACT   lane clean-up list: worktree dirty not read')" = 1 ] && has 'clean  mac    done')" "$o"
sed -n '/^# 10c\. Lane clean-up/,/^$/p' "$TOOLS/lead-watch.sh" > "$T/step.sh"; mkdir -p "$T/t"
step() { printf 'print("""%s""")\n' "$1" > "$T/t/lane-cleanup.py"; o=$( ( TOOLS="$T/t"; act=0; ACT() { act=$((act + 1)); echo "ACT   $1"; }; seen() { echo "seen: $1"; }; fresh() { :; }; . "$T/step.sh"; echo "acts=$act" ) 2>&1 ); }
step 'lanes to clean up: 0'; ok "lead-watch.sh prints the list, no ACT counted" "$([ "$(has 'seen: lanes to clean up')" = 1 ] && has 'acts=0')" "$o"
step 'ACT   lane clean-up list not read'; ok "lead-watch.sh counts its ACT line" "$(has 'acts=1')" "$o"
step Traceback; ok "fail: a lane-cleanup.py that dies is an ACT" "$(has 'ACT   lane clean-up list: lane-cleanup.py did not run')" "$o"
finish
