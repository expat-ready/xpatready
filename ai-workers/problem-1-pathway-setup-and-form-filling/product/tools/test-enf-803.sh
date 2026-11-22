#!/usr/bin/env bash
# ENF-803 (P-803; founder 22 Nov: "make sure inbuilt a enforced mechanism in the lead agent that he doesn't take any stale
# information. Always verify the source of information and whether the information is up to date … Never assumes it").
# Self-test of the four parts, each refused case planted and each clean case passing, in throwaway git copies:
#   1. bulk-delete-guard.sh through the real hooks (.githooks/pre-commit, commit-msg, pre-push) and push-guard.sh
#   2. fresh-lib.sh stamps and the 10-minute cache refusal, and lead-watch.sh using them in every section
#   3. fresh-read.sh (origin/main after a fetch, the sha, a warning when the local copy differs)
#   4. brief-fresh.py through brief-check.sh --brief (main sha, exact time, qa notes against the newest merge)
# US$0, no network. Run it twice (Done when).   bash product/tools/test-enf-803.sh
#   bash product/tools/test-enf-803.sh --mutate   also proves the test goes red with each guard switched off
set -u
. "$(dirname "$0")/guard-test-lib.sh"
if [ "${1:-}" = --mutate ]; then
  bash "$0" || exit 1
  ROOTD="$(cd "$TOOLS/../../../.." && pwd)"; bad=0
  # file | sed edit that switches one guard off | name
  while IFS='|' read -r f e n; do
    M=$(mktemp -d "${TMPDIR:-/tmp}/enf803m.XXXXXXXX") || exit 2; mkdir -p "$M/$PRODREL" "$M/.githooks"
    cp -R "$TOOLS" "$M/$PRODREL/"; cp "$ROOTD"/.githooks/* "$M/.githooks/"; sed -i.bak "$e" "$M/$PRODREL/tools/$f"
    if cmp -s "$M/$PRODREL/tools/$f" "$M/$PRODREL/tools/$f.bak"; then echo "MUTATION NOT APPLIED  $n ($f)"; bad=1
    elif (cd "$M" && bash "$PRODREL/tools/test-enf-803.sh" >/dev/null 2>&1); then echo "STILL GREEN  $n: the test does not see this guard"; bad=1
    else echo "red without it  $n"; fi; rm -rf "$M"
  done <<'MUT'
bulk-delete-guard.sh|s/^  \[ "\$verdict" = ok \] \&\& return 0/  return 0/|temp index refusal
bulk-delete-guard.sh|s/^LIMIT=.*/LIMIT=99999/|bulk-delete limit
fresh-lib.sh|s/if \[ "\$age" -gt "\$max" \]; then/if false; then/|10-minute cache refusal
brief-fresh.py|s/^    elif not shas:/    elif False:/|main sha in the Duplicate check
brief-fresh.py|s/if q and int(q\[1\]) < lt:/if False:/|qa note older than the newest merge
fresh-read.sh|s/^  echo "WARN  local copy/  : "WARN  local copy/|local copy differs warning
brief-fresh.py|s/"--first-parent", "--format=%H %ct", MAIN, "--", \*row/"--format=%H %ct", MAIN, "--", *row/|merge time, not commit time
bulk-delete-guard.sh|s/ \&\& \$4 !~ \/^e69de29bb2d1d6434b8b29ae775ad8c2e48c5391\///g|empty file is no move
fresh-lib.sh|s/^fresh_now() { TZ=Asia\/Kolkata date/fresh_now() { TZ=UTC date/|IST clock
MUT
  exit $bad
fi
ROOTD="$(cd "$TOOLS/../../../.." && pwd)"
T=$(mktemp -d "${TMPDIR:-/tmp}/enf803.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
unset GIT_INDEX_FILE
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
gcfg() { git -C "$1" config commit.gpgsign false; git -C "$1" config core.hooksPath .githooks; }

# ---------- 1. bulk delete and the temp index, through the real hooks
R="$T/repo"; git init -q -b main "$R"; gcfg "$R"
mkdir -p "$R/$PRODREL/tools" "$R/.githooks" "$R/old" "$R/keep"
cp "$TOOLS/bulk-delete-guard.sh" "$TOOLS/push-guard.sh" "$R/$PRODREL/tools/"; cp "$ROOTD"/.githooks/{pre-commit,commit-msg,pre-push} "$R/.githooks/"
for i in $(seq 1 60); do echo "old file $i" > "$R/old/f$i.txt"; echo "kept $i" > "$R/keep/k$i.txt"; done
git -C "$R" add -A && git -C "$R" commit -qm "sixty files" || { echo "setup commit failed: nothing was checked"; exit 2; }
cm() { out=$(git -C "$R" commit "$@" 2>&1); r=$?; }
git -C "$R" rm -rq old; cm -m "tidy"
ok "1a a planted 60-file delete is refused by the commit-msg hook" "$([ $r != 0 ] && grep -q 'deletes 60 files (limit 50)' <<<"$out" && echo 1)" "exit $r: $out"
cm -m "tidy" -m "BULK-DELETE-OK: x"
ok "1b a BULK-DELETE-OK line with no real reason (under 3 characters) is refused" "$([ $r != 0 ] && echo 1)" "exit $r: $out"
cm -m "retire the old folder" -m "BULK-DELETE-OK: old/ replaced by keep/ (test)"
ok "1c the same delete with \"BULK-DELETE-OK: <reason>\" passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
git -C "$R" rm -q keep/k1.txt keep/k2.txt keep/k3.txt; cm -m "three files"
ok "1d a 3-file delete passes with no line" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
git -C "$R" mv keep kept; cm -m "move 57 files"
ok "1e a pure move of 57 files is not a delete: passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
echo x > "$R/new.txt"; git -C "$R" add new.txt
GIT_INDEX_FILE="$T/stale-index" git -C "$R" read-tree --empty
out=$(cd "$R" && GIT_INDEX_FILE="$T/stale-index" git commit -m "from a stale shell" 2>&1); r=$?
ok "1f a commit while GIT_INDEX_FILE is set to a temp index is refused (pre-commit)" "$([ $r != 0 ] && grep -q 'GIT_INDEX_FILE is set to' <<<"$out" && echo 1)" "exit $r: $out"
out=$(cd "$R" && GIT_INDEX_FILE="$T/stale-index" git commit --no-verify -m "stale, no hooks" 2>&1); r=$?
o=$(cd "$R" && bash "$PRODREL/tools/bulk-delete-guard.sh" range -n1 HEAD 2>&1); r2=$?
ok "1g ... with --no-verify it commits, and the range check refuses that commit" "$([ $r = 0 ] && [ $r2 = 1 ] && grep -q 'deletes 6[0-9] files' <<<"$o" && echo 1)" "commit exit $r, range exit $r2: $o"
o=$(cd "$R" && bash "$PRODREL/tools/push-guard.sh" HEAD~1..HEAD 2>&1); r=$?
ok "1h push-guard.sh (pre-push and CI's guard job) refuses the same commit" "$([ $r = 1 ] && grep -q 'REFUSED (ENF-803)' <<<"$o" && echo 1)" "exit $r: $o"
git init -q --bare "$T/remote.git"; git -C "$R" remote add origin "$T/remote.git"
out=$(git -C "$R" push -q origin HEAD:refs/heads/lane 2>&1); r=$?
ok "1i git push of that commit is refused by the pre-push hook" "$([ $r != 0 ] && grep -q 'REFUSED (ENF-803)' <<<"$out" && echo 1)" "exit $r: $out"
git -C "$R" reset -q --hard HEAD~1
out=$(git -C "$R" push -q origin HEAD:refs/heads/lane 2>&1); r=$?
ok "1j the clean history pushes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
echo y > "$R/y.txt"; git -C "$R" add y.txt; git -C "$R" commit -qm y
out=$(cd "$R" && GIT_INDEX_FILE="$T/stale-index" git push -q origin HEAD:refs/heads/lane 2>&1); r=$?
ok "1k a push from a shell with GIT_INDEX_FILE set to a temp index is refused" "$([ $r != 0 ] && grep -q 'GIT_INDEX_FILE is set to' <<<"$out" && echo 1)" "exit $r: $out"
echo z >> "$R/y.txt"; out=$(git -C "$R" commit -q -m "partial" y.txt 2>&1); r=$?
ok "1l git's own temporary index (a pathspec commit uses .git/next-index-*.lock) passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
# a merge that brings the other side's own (reasoned) 60-file delete is not a bulk delete of the merge
git -C "$R" checkout -qb side; for i in $(seq 1 60); do echo "s $i" > "$R/s$i.txt"; done; git -C "$R" add -A; git -C "$R" commit -qm "side files"
git -C "$R" checkout -q main; git -C "$R" merge -q --no-edit side >/dev/null 2>&1
git -C "$R" checkout -qb other main; git -C "$R" rm -q s*.txt; git -C "$R" commit -qm "drop side files" -m "BULK-DELETE-OK: test"
git -C "$R" checkout -q -b lane2 main; echo w > "$R/w.txt"; git -C "$R" add w.txt; git -C "$R" commit -qm w
out=$(git -C "$R" merge --no-edit other 2>&1); r=$?
ok "1m merging a branch whose own commit deleted 60 files (with its reason) passes the commit-msg hook" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
ok "1n ... and the range check counts the merge commit as 0 deletes" "$(cd "$R" && [ -n "$(git rev-list --merges -n1 HEAD)" ] && bash "$PRODREL/tools/bulk-delete-guard.sh" range -n1 HEAD >/dev/null 2>&1 && echo 1)" "refused, or HEAD is no merge"
git -C "$R" checkout -qb empties main; mkdir -p "$R/e"; for i in $(seq 1 60); do : > "$R/e/x$i"; done; git -C "$R" add -A; git -C "$R" commit -qm "sixty empty files"
git -C "$R" rm -rq e; : > "$R/one-empty"; git -C "$R" add one-empty; cm -m "drop the empty files"
ok "1o 60 empty files deleted and one empty file added is still a 60-file delete (an empty file is no move)" "$([ $r != 0 ] && grep -q 'deletes 60 files' <<<"$out" && echo 1)" "exit $r: $out"

# ---------- 2. freshness stamps and the 10-minute cache
. "$TOOLS/fresh-lib.sh"
w1=$(TZ=Asia/Kolkata date '+%H:%M'); o=$(fresh "GitHub (test)"); w2=$(TZ=Asia/Kolkata date '+%H:%M')
ok "2a fresh prints \"read HH:MM IST from <source>\" with the TZ=Asia/Kolkata time (never UTC or local)" "$(grep -qE "read ($w1|$w2) IST from GitHub \(test\)$" <<<"$o" && echo 1)" "$o (IST $w1-$w2)"
echo '{}' > "$T/cache.json"; python3 -I -c 'import os,sys,time; t=time.time()-15*60; os.utime(sys.argv[1],(t,t))' "$T/cache.json"
o=$(fresh_cache "$T/cache.json" "board (test)"); r=$?
ok "2b a cached answer 15 min old is refused, not printed" "$([ $r = 1 ] && grep -q '^REFUSED stale: board (test) cached 15 min ago' <<<"$o" && ! grep -q ' IST from ' <<<"$o" && echo 1)" "exit $r: $o"
python3 -I -c 'import os,sys,time; t=time.time()-2*60; os.utime(sys.argv[1],(t,t))' "$T/cache.json"
o=$(fresh_cache "$T/cache.json" "board (test)"); r=$?
ok "2c a cached answer 2 min old is stamped with its read time" "$([ $r = 0 ] && grep -qE 'read [0-2][0-9]:[0-5][0-9] IST from board \(test\) \(cached, 2 min old\)' <<<"$o" && echo 1)" "exit $r: $o"
o=$(fresh_cache "$T/none.json" "board (test)"); r=$?
ok "2d no cached answer is refused" "$([ $r = 1 ] && grep -q '^REFUSED stale' <<<"$o" && echo 1)" "exit $r: $o"
LW="$TOOLS/lead-watch.sh"
# a section or subsection heading ("# 2.", "# 2b.") that prints anything must also stamp it
miss=$(awk 'function chk() {if (s != "" && o && !f) print s} /^# [0-9]+[a-z]?\. / {chk(); s = $2; f = 0; o = 0; next}
  /^[^#]*(^|[ ;(])fresh(_cache)? / {f = 1; next} /^[^#]*(echo|say|ACT|tee|printf|python3)/ {o = 1} END {chk()}' "$LW" | paste -sd ' ' -)
ok "2e every numbered section and subsection of lead-watch.sh says when and from where it read (fresh / fresh_cache)" "$([ -z "$miss" ] && grep -q '^\. "$TOOLS/fresh-lib.sh"' "$LW" && echo 1)" "sections without a stamp: $miss"
ok "2f lead-watch.sh refuses a stale board answer: cockpit-data.py runs only after fresh_cache, known-failures reads the same" \
  "$(grep -q 'if bc=$(fresh_cache "$BOARD"' "$LW" && grep -q 'KF_BOARD="$BOARD"' "$LW" && ! grep -q 'cockpit-data.py" --watch "${COCKPIT_DATA' "$LW" && echo 1)" "the board block"
bad=$(grep -hn 'IST' "$LW" "$TOOLS/fresh-lib.sh" | grep -E '(^|[^-])\bdate\b' | grep -v '^[0-9]*:[[:space:]]*#' | grep -vE '(TZ=Asia/Kolkata date[^)]*\)[^$]*)+$' | grep -E '\$\(date [^-]|\$\(date \+' | head -3)
ok "2g every IST time lead-watch.sh and fresh-lib.sh print comes from TZ=Asia/Kolkata date" "$([ -z "$bad" ] && echo 1)" "$bad"
ok "2h flow-measure.py's cached answer follows FRESH_MAX_MIN (10 under lead-watch.sh), and fresh-lib.sh exports it" \
  "$(grep -q 'os.environ.get("FRESH_MAX_MIN")' "$TOOLS/flow-measure.py" && grep -q '^export FRESH_MAX_MIN="${FRESH_MAX_MIN:-10}"' "$TOOLS/fresh-lib.sh" && echo 1)" "no FRESH_MAX_MIN"
# the board block itself, run with a stale board: one ACT, nothing from the board printed, known-failures gets no board
step=$(awk '/^# 11\. What the founder/ {f=1} f && (/^# 12\. / || /^exit/) {exit} f' "$LW")
echo '{"first":{}}' > "$T/board.json"; python3 -I -c 'import os,sys,time; t=time.time()-20*60; os.utime(sys.argv[1],(t,t))' "$T/board.json"; mkdir -p "$T/st"
w=$(act=0; seen() { :; }; ACT() { act=$((act+1)); echo "ACT   $1"; }; STATE_DIR="$T/st"; COCKPIT_DATA="$T/board.json"; prs='[]'; caps=""; merged=""
    eval "$step"; echo "act=$act board=$BOARD")
ok "2i lead-watch step 11 with a board 20 min old: one ACT \"REFUSED stale\", the board not printed, BOARD=/dev/null for known-failures" \
  "$(grep -q '^ACT   board: REFUSED stale: the board.s data.json cached 20 min ago' <<<"$w" && grep -q '^act=1 board=/dev/null$' <<<"$w" && [ "$(grep -c . <<<"$w")" = 2 ] && echo 1)" "$w"

# ---------- 3. fresh-read.sh
O="$T/origin.git"; git init -q --bare -b main "$O"
W="$T/w"; git clone -q "$O" "$W" 2>/dev/null; gcfg "$W"; git -C "$W" config core.hooksPath /dev/null
mkdir -p "$W/cfg"; echo v1 > "$W/cfg/a.txt"; git -C "$W" add -A; git -C "$W" commit -qm v1; git -C "$W" push -q origin HEAD:main 2>/dev/null
U="$T/u"; git clone -q "$O" "$U"; gcfg "$U"; git -C "$U" config core.hooksPath /dev/null; echo v2 > "$U/cfg/a.txt"; git -C "$U" commit -qam v2; git -C "$U" push -q origin HEAD:main 2>/dev/null
want=$(git -C "$U" rev-parse HEAD)
o=$(cd "$W" && bash "$TOOLS/fresh-read.sh" cfg/a.txt 2>"$T/err"); r=$?; e=$(cat "$T/err")
ok "3a prints the file as on origin/main after a fetch (v2, though the local copy is v1)" "$([ $r = 0 ] && [ "$o" = v2 ] && echo 1)" "exit $r: $o"
ok "3b ... headed by the fetched sha and the IST time" "$(grep -qE "origin/main ${want:0:12} · fetched [0-9]{2} [A-Z][a-z]{2} [0-2][0-9]:[0-5][0-9] IST" <<<"$e" && echo 1)" "$e"
ok "3c ... and warns that the local copy differs" "$(grep -q '^WARN  local copy of cfg/a.txt differs from origin/main' <<<"$e" && echo 1)" "$e"
o=$(cd "$U" && bash "$TOOLS/fresh-read.sh" cfg/a.txt 2>"$T/err"); r=$?
ok "3d the same local copy: printed, no warning" "$([ $r = 0 ] && [ "$o" = v2 ] && ! grep -q WARN "$T/err" && echo 1)" "exit $r: $(cat "$T/err")"
o=$(cd "$W" && FRESH_REMOTE=nowhere bash "$TOOLS/fresh-read.sh" cfg/a.txt 2>"$T/err"); r=$?
ok "3e a failed fetch refuses (exit 2) and prints nothing from the old origin/main" "$([ $r = 2 ] && [ -z "$o" ] && grep -q '^REFUSED: git fetch' "$T/err" && echo 1)" "exit $r: $o $(cat "$T/err")"
o=$(cd "$W" && bash "$TOOLS/fresh-read.sh" cfg/missing.txt 2>"$T/err"); r=$?
ok "3f a path not on origin/main: exit 1, said" "$([ $r = 1 ] && grep -q '^NOT ON origin/main' "$T/err" && echo 1)" "exit $r: $(cat "$T/err")"
o=$(cd "$W/cfg" && bash "$TOOLS/fresh-read.sh" cfg/a.txt 2>"$T/err"); r=$?
ok "3g from a subfolder, a path from the repository root works too" "$([ $r = 0 ] && [ "$o" = v2 ] && echo 1)" "exit $r: $(cat "$T/err")"
o=$(cd "$W/cfg" && bash "$TOOLS/fresh-read.sh" a.txt 2>"$T/err"); r=$?
ok "3h ... and a path relative to the subfolder" "$([ $r = 0 ] && [ "$o" = v2 ] && echo 1)" "exit $r: $(cat "$T/err")"

# ---------- 4. brief freshness (brief-fresh.py, through brief-check.sh --brief)
B="$T/b"; git init -q -b main "$B"; gcfg "$B"; git -C "$B" config core.hooksPath /dev/null; mkdir -p "$B/app" "$B/p/qa/built"
cm4() { GIT_AUTHOR_DATE="$1" GIT_COMMITTER_DATE="$1" git -C "$B" commit -qm "$2"; }
echo a > "$B/app/rule.ts"; git -C "$B" add -A; cm4 "2026-11-17T10:00:00+05:30" app
echo note > "$B/p/qa/built/FO-5.md"; git -C "$B" add -A; cm4 "2026-11-18T10:00:00+05:30" "qa note"
echo b > "$B/app/rule.ts"; git -C "$B" add -A; cm4 "2026-11-20T10:00:00+05:30" "FO-5s merged"
git -C "$B" update-ref refs/remotes/origin/main HEAD; MS=$(git -C "$B" rev-parse --short=9 HEAD)
git -C "$B" checkout -qb lead; echo c > "$B/c.txt"; git -C "$B" add -A; cm4 "2026-11-21T10:00:00+05:30" "lead branch"; LS=$(git -C "$B" rev-parse --short=9 HEAD)
NOW=$(TZ=Asia/Kolkata date +%H:%M)
bf() { out=$(cd "$B" && printf '%s\n' "$1" | python3 -I "$TOOLS/brief-fresh.py" 2>&1); r=$?; }
bf "Duplicate check: read origin/main $MS at $NOW IST; none"
ok "4a a Duplicate check with the main sha and the exact time passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
out=$(cd "$B" && printf 'Row X-1. Model: Opus 5.5, effort: medium\nItem: R1.2\nDone when: check-x.sh exits 0\nDuplicate check: Lead 4 read open PRs at 14:5x IST\n' | bash "$TOOLS/brief-check.sh" --brief); r=$?
ok "4b brief-check.sh --brief refuses a brief whose Duplicate check names no main sha and no exact time" "$([ $r = 1 ] && grep -q 'names no main sha' <<<"$out" && grep -q 'names no exact time' <<<"$out" && echo 1)" "exit $r: $out"
bf "Duplicate check: read main $LS at $NOW IST; none"
ok "4c a sha from a lead branch, not on origin/main, is refused" "$([ $r = 1 ] && grep -q "sha $LS is not a commit on origin/main" <<<"$out" && echo 1)" "exit $r: $out"
bf "Duplicate check: read main deadbeef1 at $NOW IST; none"
ok "4d an unknown sha (unfetched) is refused" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
out=$(cd "$B" && printf 'Duplicate check: read main %s at 14:30 IST; none\n' "$MS" | BRIEF_NOW=$(date -d '2026-11-22T14:00:00+05:30' +%s 2>/dev/null || date -j -f '%Y-%m-%dT%H:%M:%S%z' '2026-11-22T14:00:00+0530' +%s) python3 -I "$TOOLS/brief-fresh.py"); r=$?
ok "4e a time 30 min ahead of the clock (a guess) is refused" "$([ $r = 1 ] && grep -q 'ahead of the clock (14:00 IST)' <<<"$out" && echo 1)" "exit $r: $out"
bf $'Duplicate check: read main '"$MS"$' at '"$NOW"$' IST; none\nTouches: app/rule.ts\nStart from p/qa/built/FO-5.md'
ok "4f a qa note older than the newest merge on the row's files is refused" "$([ $r = 1 ] && grep -q 'qa note p/qa/built/FO-5.md (last changed 18 Nov 10:00 IST' <<<"$out" && echo 1)" "exit $r: $out"
bf $'Duplicate check: read main '"$MS"$' at '"$NOW"$' IST; none\nTouches: app/rule.ts\nqa notes of 18 Nov list the gaps'
ok "4g \"qa notes of 18 Nov\" after a merge on 20 Nov is refused" "$([ $r = 1 ] && grep -q 'qa notes of 18 Nov are older' <<<"$out" && echo 1)" "exit $r: $out"
bf $'Duplicate check: read main '"$MS"$' at '"$NOW"$' IST; none\nStart from p/qa/built/FO-5.md'
ok "4h a qa note cited with no Touches: line is refused" "$([ $r = 1 ] && grep -q 'no "Touches:" line' <<<"$out" && echo 1)" "exit $r: $out"
git -C "$B" checkout -q main; echo newer > "$B/p/qa/built/FO-5.md"; git -C "$B" add -A; cm4 "2026-11-21T09:00:00+05:30" "qa re-read"; git -C "$B" update-ref refs/remotes/origin/main HEAD; MS=$(git -C "$B" rev-parse --short=9 HEAD)
bf $'Duplicate check: read main '"$MS"$' at '"$NOW"$' IST; none\nTouches: app/rule.ts\nStart from p/qa/built/FO-5.md'
ok "4i a qa note newer than the newest merge on the row's files passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
bf "Duplicate check: origin/main at $MS, read $NOW IST; none"
ok "4l natural wording (\"origin/main at <sha>\") is read" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
bf $'Duplicate check: read main '"$MS"$' at '"$NOW"$' IST; none\nSee p/qa/CAPABILITIES.md for the row'
ok "4m qa/CAPABILITIES.md is a register, not a qa note: no Touches: needed" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
git -C "$B" checkout -qb lanex "$MS~1"; echo lane > "$B/app/rule.ts"; git -C "$B" add -A; cm4 "2026-11-19T10:00:00+05:30" "lane work"
git -C "$B" checkout -q main; GIT_AUTHOR_DATE="2026-11-21T12:00:00+05:30" GIT_COMMITTER_DATE="2026-11-21T12:00:00+05:30" git -C "$B" merge -q --no-ff -X theirs -m "merge lanex" lanex
git -C "$B" update-ref refs/remotes/origin/main HEAD; MS=$(git -C "$B" rev-parse --short=9 HEAD)
bf $'Duplicate check: read main '"$MS"$' at '"$NOW"$' IST; none\nTouches: app/rule.ts\nStart from p/qa/built/FO-5.md'
ok "4n a lane committed 19 Nov but merged 21 Nov 12:00 is newer than a qa note of 21 Nov 09:00 (merge time counts)" "$([ $r = 1 ] && grep -q 'qa note p/qa/built/FO-5.md' <<<"$out" && echo 1)" "exit $r: $out"
bf $'Row X-1, no duplicate line here'
ok "4j a text with no Duplicate check line is left to brief-check.sh (exit 0)" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
out=$(cd "$B" && printf '## What\nRow X-1.\nDuplicate check: searched BACKLOG; none\n\nDone when: check-x.sh exits 0\n' | bash "$TOOLS/brief-check.sh"); r=$?
ok "4k a PR body (no --brief) is not held to the start-brief rule" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
finish
