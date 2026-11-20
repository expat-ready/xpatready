#!/usr/bin/env bash
# The test of check-image-size.sh (repository clean-up stage 8): each case runs in a throwaway git copy under $TMPDIR,
# never in this repository. US$0, no network.
#   bash product/tools/check-image-size-test.sh
set -u
TOOL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/check-image-size.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/image-size.XXXXXX") || exit 1; trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok() { if [ "$2" = 1 ]; then pass=$((pass + 1)); echo "PASS  $1"; else fail=$((fail + 1)); echo "FAIL  $1"; echo "      $3"; fi; }
R="$T/r"; mkdir -p "$R/shots"
g() { git -C "$R" -c user.email=t@t -c user.name=t -c commit.gpgsign=false "$@"; }
bytes() { head -c "$2" /dev/zero > "$R/$1"; }
g init -q -b main; echo root > "$R/AGENTS.md"; bytes shots/old-big.png 400000; g add -A; g commit -qm base
run() { ( cd "$R" && bash "$TOOL" "$@" > "$T/out" 2>&1 ); echo $?; }

g checkout -qb work
bytes shots/small.png 100000; bytes shots/big.PNG 350000; bytes shots/big.jpg 310000; bytes notes.txt 900000; g add -A; g commit -qm add
ok "report-only: images over 300 KB are listed and the exit is 0" "$([ "$(run main..work)" = 0 ] && grep -q 'OVER 300 KB: shots/big.PNG (342 KB)' "$T/out" && grep -q 'OVER 300 KB: shots/big.jpg' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
ok "... a small image, a large non-image and an image the range did not touch are not listed" "$(grep -qE 'small.png|notes.txt|old-big' "$T/out" && echo 0 || echo 1)" "$(cat "$T/out")"
ok "... the total line counts the 3 images and the 2 over the limit" "$(grep -q 'images added or changed: 3 (743 KB); over 300 KB: 2 (645 KB)' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
ok "--enforce fails (exit 1) when an image is over the limit" "$([ "$(run --enforce main..work)" = 1 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "IMAGE_MAX_KB raises the limit: nothing over 400 KB, --enforce passes" "$([ "$(IMAGE_MAX_KB=400 run --enforce main..work)" = 0 ] && grep -q 'over 400 KB: 0' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
g checkout -qb shrink; bytes shots/big.PNG 200000; g rm -q shots/big.jpg; g commit -qam shrink
ok "a later commit that shrinks one image and deletes the other passes --enforce over the whole range" "$([ "$(run --enforce main..shrink)" = 0 ] && echo 1 || echo 0)" "$(cat "$T/out")"
g checkout -qb ren main; g mv shots/old-big.png shots/moved-big.png; g commit -qm ren
ok "a renamed image over the limit is listed under its new name" "$([ "$(run main..ren)" = 0 ] && grep -q 'OVER 300 KB: shots/moved-big.png' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
ok "a bad IMAGE_MAX_KB is bad use (exit 2)" "$([ "$(IMAGE_MAX_KB=3x run main..work)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "no range is bad use (exit 2)" "$([ "$(run)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "a three-dot range is bad use (exit 2)" "$([ "$(run main...work)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "an unknown head is exit 2, never a pass" "$([ "$(run main..nosuch)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "an unknown base is exit 2, never a pass" "$([ "$(run nosuch..work)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "an empty base or head is bad use (exit 2), never a pass on an empty range" "$([ "$(run ..work)" = 2 ] && [ "$(run main..)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "an unknown flag is bad use (exit 2)" "$([ "$(run --strict main..work)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
echo "$pass/$((pass + fail)) passed"
[ "$fail" = 0 ]
