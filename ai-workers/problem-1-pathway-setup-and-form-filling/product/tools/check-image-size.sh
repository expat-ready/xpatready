#!/usr/bin/env bash
# The test of image-size.sh (repository clean-up stage 8): each case runs in a throwaway git copy under $TMPDIR, never
# in this repository. US$0, no network.
#   bash product/tools/check-image-size.sh
set -u
TOOL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/image-size.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/image-size.XXXXXX") || exit 1; trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok() { if [ "$2" = 1 ]; then pass=$((pass + 1)); echo "PASS  $1"; else fail=$((fail + 1)); echo "FAIL  $1"; echo "      $3"; fi; }
R="$T/r"; mkdir -p "$R/shots"
g() { git -C "$R" -c user.email=t@t -c user.name=t -c commit.gpgsign=false "$@"; }
# Distinct content per file (a counter in the first bytes), so two files of one size are two blobs.
k=0; bytes() { k=$((k + 1)); mkdir -p "$(dirname "$R/$1")"; { printf '%08d' "$k"; head -c $(($2 - 8)) /dev/zero; } > "$R/$1"; }
g init -q -b main; echo root > "$R/AGENTS.md"; bytes shots/old-big.png 400000; bytes shots/keep.png 1000; g add -A; g commit -qm base
run() { ( cd "$R" && bash "$TOOL" "$@" > "$T/out" 2>&1 ); echo $?; }
has() { grep -qF -- "$1" "$T/out"; }

g checkout -qb work
bytes shots/small.png 100000; bytes shots/big.PNG 350000; bytes shots/big.jpg 310000; bytes notes.txt 900000; g add -A; g commit -qm add
ok "report-only: images over 300 KB are listed and the exit is 0" "$([ "$(run main..work)" = 0 ] && has 'OVER 300 KB: shots/big.PNG (342 KB)' && has 'OVER 300 KB: shots/big.jpg' && echo 1 || echo 0)" "$(cat "$T/out")"
ok "... a small image, a large non-image and an image already in the base are not listed" "$(grep -qE 'small.png|notes.txt|old-big' "$T/out" && echo 0 || echo 1)" "$(cat "$T/out")"
ok "... the total line counts the 3 new images and the 2 over the limit" "$(has 'image files new to history: 3 (743 KB); over 300 KB: 2 (645 KB)' && echo 1 || echo 0)" "$(cat "$T/out")"
ok "--enforce fails (exit 1) when an image is over the limit" "$([ "$(run --enforce main..work)" = 1 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "IMAGE_MAX_KB raises the limit: nothing over 400 KB, --enforce passes" "$([ "$(IMAGE_MAX_KB=400 run --enforce main..work)" = 0 ] && has 'over 400 KB: 0' && echo 1 || echo 0)" "$(cat "$T/out")"

g checkout -qb shrink; bytes shots/big.PNG 2000; g rm -q shots/big.jpg; g commit -qam shrink
ok "a big image shrunk or deleted by a later commit still counts: history keeps it (--enforce fails)" "$([ "$(run --enforce main..shrink)" = 1 ] && has 'shots/big.PNG (342 KB)' && has 'shots/big.jpg' && echo 1 || echo 0)" "$(cat "$T/out")"
ok "... measured from the commit after it, only the shrink is new and passes" "$([ "$(run --enforce work..shrink)" = 0 ] && has 'new to history: 1 (2 KB)' && echo 1 || echo 0)" "$(cat "$T/out")"

g checkout -qb ren main; g mv shots/old-big.png shots/moved-big.png; g rm -q shots/keep.png; g commit -qm ren
ok "a rename of an image already in history adds nothing, and deleting a base image is fine (--enforce passes)" "$([ "$(run --enforce main..ren)" = 0 ] && has 'new to history: 0 (0 KB)' && echo 1 || echo 0)" "$(cat "$T/out")"

g checkout -qb side main; g checkout -q main; bytes shots/main-only.png 500000; g add -A; g commit -qm main-moves
g checkout -q side; bytes shots/side.png 1000; g add -A; g commit -qm side
ok "base moved on after the branch was cut: an image only main added is not the branch's" "$([ "$(run --enforce main..side)" = 0 ] && ! has main-only && has 'new to history: 1 (1 KB)' && echo 1 || echo 0)" "$(cat "$T/out")"

g checkout -qb copy side; g show main:shots/main-only.png > "$R/shots/copy.png"; g add -A; g commit -qm copy
ok "bytes main already holds (base not an ancestor of head) are not new under another name" "$([ "$(run --enforce main..copy)" = 0 ] && ! has copy.png && echo 1 || echo 0)" "$(cat "$T/out")"
S="$T/shallow"; git clone -q --depth 1 --branch side "file://$R" "$S" 2>/dev/null && git -C "$S" fetch -q --depth 1 origin main:refs/remotes/origin/main 2>/dev/null
ok "a depth-1 clone (CI's checkout) counts only what the branch adds, not the whole tree" "$( (cd "$S" && bash "$TOOL" origin/main..HEAD > "$T/out" 2>&1); has 'new to history: 1 (1 KB)' && ! has old-big && echo 1 || echo 0)" "$(cat "$T/out")"

g checkout -qb edge main; head -c 307200 /dev/urandom > "$R/shots/at-limit.png"; head -c 307201 /dev/urandom > "$R/shots/one-over.png"
bytes "shots/sub dir/café é.webp" 320000; g add -A; g commit -qm edge
ok "exactly 300 KB passes, one byte more is listed" "$([ "$(run main..edge)" = 0 ] && ! has at-limit && has 'shots/one-over.png (301 KB)' && echo 1 || echo 0)" "$(cat "$T/out")"
ok "a name with a space and accented letters is listed as written" "$(has 'shots/sub dir/café é.webp (313 KB)' && echo 1 || echo 0)" "$(cat "$T/out")"

g checkout -qb feat main; bytes shots/feat.gif 330000; g add -A; g commit -qm feat
g checkout -qb merged main; bytes shots/m2.png 1000; g add -A; g commit -qm m2; g merge -q --no-edit feat
ok "an image that came in through a merge in the range is listed" "$([ "$(run main..merged)" = 0 ] && has 'shots/feat.gif (323 KB)' && echo 1 || echo 0)" "$(cat "$T/out")"

g checkout -qb link main; ln -s keep.png "$R/shots/link.png"; g add -A; g commit -qm link; rm "$R/shots/link.png"; bytes shots/link.png 400000; g add -A; g commit -qm typechange
ok "a symlink turned into a big image is listed" "$([ "$(run main..link)" = 0 ] && has 'shots/link.png (391 KB)' && echo 1 || echo 0)" "$(cat "$T/out")"

ok "a bad IMAGE_MAX_KB is bad use (exit 2)" "$([ "$(IMAGE_MAX_KB=3x run main..work)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "no range is bad use (exit 2)" "$([ "$(run)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "a three-dot range is bad use (exit 2)" "$([ "$(run main...work)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "an unknown head is exit 2, never a pass" "$([ "$(run main..nosuch)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "an unknown base is exit 2, never a pass" "$([ "$(run nosuch..work)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "an empty base or head is bad use (exit 2), never a pass on an empty range" "$([ "$(run ..work)" = 2 ] && [ "$(run main..)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "an unknown flag is bad use (exit 2)" "$([ "$(run --strict main..work)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
echo "$pass/$((pass + fail)) passed"
[ "$fail" = 0 ]
