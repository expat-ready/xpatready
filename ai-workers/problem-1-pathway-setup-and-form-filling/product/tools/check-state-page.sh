#!/usr/bin/env bash
# Guards 6 and 7 (founder, 6 Nov ~03:00 IST). 6: check-docs.sh fails when STATE.md is over 12 KB (it reached 34 KB and
# every Lead re-read it); the earlier page goes to product/history/. 7 (E9, P-302, now a failure): check-docs.sh fails when
# STATE's "updated:" time (HH:MM or HH:Mx IST) is more than 30 minutes from its commit time, or cannot be read, and this
# branch wrote it; a time already on the base only warns (times are read, not guessed). Throwaway copies, US$0.
#   bash product/tools/check-state-page.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
docs_copy "$T/c"; S="$T/c/$PRODREL/STATE.md"; CD="$T/c/$PRODREL/tools/check-docs.sh"
run() { out=$(bash "$CD" 2>/dev/null); r=$?; }
# 6. Size.
head -c 12000 /dev/zero | tr '\0' 'x' >> "$S"; git -C "$T/c" commit -qam big; run
ok "STATE at 12 KB passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
head -c 400 /dev/zero | tr '\0' 'x' >> "$S"; git -C "$T/c" commit -qam bigger; run
ok "STATE over 12 KB fails and names product/history/" "$([ $r = 1 ] && echo "$out" | grep -q 'STATE TOO BIG.*product/history/' && echo 1)" "exit $r: $out"
# 7. Time (E9). docs_copy has no origin/main, so its STATE commit is this branch's own.
docs_copy "$T/d"; S="$T/d/$PRODREL/STATE.md"; CD="$T/d/$PRODREL/tools/check-docs.sh"; run
ok "an 'updated:' time read at commit passes, with no warning" "$( ! echo "$out" | grep -qE 'WARN|STATE TIME' && [ $r = 0 ] && echo 1)" "exit $r: $out"
ist() { TZ=Asia/Kolkata date -d "$1" '+%Y-%m-%d %H:%M' 2>/dev/null || TZ=Asia/Kolkata date -v"$2" '+%Y-%m-%d %H:%M'; }
put() { sed -i.bak "s/^updated: .* IST/updated: $1 IST/" "$S"; rm -f "$S.bak"; }
old=$(ist '-2 hours' -2H); put "$old"; git -C "$T/d" commit -qam guessed; run
ok "a committed 'updated:' time 2 hours from its commit fails, naming both times" "$([ $r = 1 ] && echo "$out" | grep -q "STATE TIME: STATE.md says updated $old IST.*min apart" && echo 1)" "exit $r: $out"
out=$(STATE_TIME_BASE=HEAD bash "$CD" 2>/dev/null); r=$?
ok "... the same time already on the base only warns (exit 0)" "$([ $r = 0 ] && echo "$out" | grep -q "^WARN  STATE.md says updated $old IST.*already on HEAD" && echo 1)" "exit $r: $out"
out=$(STATE_TIME_BASE=nope bash "$CD" 2>/dev/null); r=$?
ok "... a base that does not exist counts as this branch's (fails)" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
soon=$(ist '+20 minutes' +20M); put "$soon"; run
ok "uncommitted STATE is compared with now; 20 minutes passes" "$( ! echo "$out" | grep -qE 'WARN|STATE TIME' && [ $r = 0 ] && echo 1)" "exit $r: $out"
far=$(ist '-3 hours' -3H); put "$far"; out=$(STATE_TIME_BASE=HEAD bash "$CD" 2>/dev/null); r=$?
ok "uncommitted STATE 3 hours off fails even when its last commit is on the base" "$([ $r = 1 ] && echo "$out" | grep -q 'STATE TIME' && echo 1)" "exit $r: $out"
x=$(ist '-12 minutes' -12M); x="${x%?}x"; put "$x"; run
ok "an 'HH:Mx' time within its ten minutes passes" "$( ! echo "$out" | grep -q 'STATE TIME' && [ $r = 0 ] && echo 1)" "exit $r: $out"
ox="${old%?}x"; put "$ox"; run
ok "an 'HH:Mx' time 2 hours off fails (the form is read, not skipped)" "$([ $r = 1 ] && echo "$out" | grep -q "STATE TIME: STATE.md says updated $ox IST" && echo 1)" "exit $r: $out"
sed -i.bak "s/^updated: .* IST/updated: $(TZ=Asia/Kolkata date '+%d %b %H:%M') IST/" "$S"; rm -f "$S.bak"; run
ok "an 'updated:' line in neither form fails, saying how to write it" "$([ $r = 1 ] && echo "$out" | grep -q 'STATE TIME: .*cannot be read' && echo 1)" "exit $r: $out"
sed -i.bak '/^updated:/d' "$S"; rm -f "$S.bak"; run
ok "a STATE with no 'updated:' line is not judged here" "$( ! echo "$out" | grep -q 'STATE TIME' && [ $r = 0 ] && echo 1)" "exit $r: $out"
# Fixed commit dates (E9 review): the x window, a base that exists, and CI's test merge of a PR and a main that both changed STATE.
docs_copy "$T/e"; G="git -C $T/e"; S="$T/e/$PRODREL/STATE.md"; CD="$T/e/$PRODREL/tools/check-docs.sh"; $G branch -q base
at() { put "$1"; GIT_COMMITTER_DATE="$2" GIT_AUTHOR_DATE="$2" $G commit -qam "$3"; }
rb() { out=$(STATE_TIME_BASE="$1" bash "$CD" 2>/dev/null); r=$?; }
at "2026-11-20 10:0x" "2026-11-20T10:39:00+05:30" x39; rb base
ok "'10:0x' committed at 10:39 passes: the x window counts its ten minutes (30 min from 10:09)" "$([ $r = 0 ] && ! echo "$out" | grep -q 'STATE TIME' && echo 1)" "exit $r: $out"
echo "a later line" >> "$S"; at "2026-11-20 10:0x" "2026-11-20T10:40:00+05:30" x40; rb base
ok "... committed at 10:40 fails (31 min), with a base that exists and STATE changed after it" "$([ $r = 1 ] && echo "$out" | grep -q 'STATE TIME: .*10:0x IST.*31 min apart' && echo 1)" "exit $r: $out"
$G checkout -qb pr base; at "2026-11-20 10:0x" "2026-11-20T10:05:00+05:30" pr
$G checkout -qb main2 base; echo "a line main added" >> "$S"; GIT_COMMITTER_DATE="2026-11-20T10:30:00+05:30" $G commit -qam main
$G checkout -q --detach main2; $G merge -q --no-edit pr >/dev/null; rb main2
ok "CI's test merge (dated now) of a PR's STATE and main's STATE is judged by the PR's commit, not the merge" "$([ $r = 0 ] && ! echo "$out" | grep -q 'STATE TIME' && echo 1)" "exit $r: $out"
finish
