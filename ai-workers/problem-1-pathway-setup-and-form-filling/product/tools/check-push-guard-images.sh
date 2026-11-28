#!/usr/bin/env bash
# LR-162 (Lead 11, 28 Nov; LR-095): push-guard.sh runs image-size.sh --enforce, so the pre-push hook and CI's guard jobs
# refuse an image (png, jpg, jpeg, webp, gif) new to history and over IMAGE_MAX_KB (default 300). Each case runs in a
# throwaway git copy (with a bare "origin" for the pre-push form) under $TMPDIR, never in this repository. Run by
# check-guards.sh; with --mutate, guards.d/OS-0lr162.sh switches the call off and this test must fail. US$0, no network.
#   bash product/tools/check-push-guard-images.sh
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"
T=$(mktemp -d "${TMPDIR:-/tmp}/pg-images.XXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
pass=0; fail=0
ok() { if [ "$2" = 1 ]; then pass=$((pass + 1)); echo "PASS  $1"; else fail=$((fail + 1)); echo "FAIL  $1"; echo "      $3"; fi; }
R="$T/r"; G="$R/product/tools"; mkdir -p "$G"; cp "$TOOLS/push-guard.sh" "$TOOLS/bulk-delete-guard.sh" "$TOOLS/image-size.sh" "$G/"
g() { git -C "$R" -c user.email=t@example.invalid -c user.name=t -c commit.gpgsign=false "$@"; }
k=0; img() { k=$((k + 1)); mkdir -p "$(dirname "$R/$1")"; { printf '%08d' "$k"; head -c $(($2 - 8)) /dev/zero; } > "$R/$1"; }
g init -q -b main; echo root > "$R/README"; img shots/on-main-big.png 400000; g add -A; g commit -qm base
git init -q --bare "$T/origin.git"; g remote add origin "$T/origin.git"; g push -q origin main 2>/dev/null; g fetch -q origin
run() { (cd "$R" && bash product/tools/push-guard.sh "$@" > "$T/out" 2>&1); echo $?; }
has() { grep -qF -- "$1" "$T/out"; }

g checkout -qb big; img shots/new-big.png 350000; g add -A; g commit -qm big
ok "a range adding a 342 KB png is refused, the file named" "$([ "$(run main..big)" = 1 ] && has 'GUARD: image too big in main..big' && has 'shots/new-big.png (342 KB)' && echo 1 || echo 0)" "$(cat "$T/out")"
ok "... the pre-push form (--unpushed <sha> origin) refuses it too" "$([ "$(run --unpushed "$(g rev-parse big)" origin)" = 1 ] && has 'shots/new-big.png' && echo 1 || echo 0)" "$(cat "$T/out")"
ok "... IMAGE_MAX_KB=400 lets it through (clean)" "$([ "$(IMAGE_MAX_KB=400 run main..big)" = 0 ] && has 'push guard: clean' && echo 1 || echo 0)" "$(cat "$T/out")"

g checkout -qb small main; img shots/small.png 100000; img shots/sub/photo.JPG 300000; g add -A; g commit -qm small
ok "a 98 KB png and an exactly-300 KB JPG pass (clean)" "$([ "$(run main..small)" = 0 ] && has 'push guard: clean' && echo 1 || echo 0)" "$(cat "$T/out")"
ok "... and pass the pre-push form: the 391 KB image already on origin's main is not counted again" "$([ "$(run --unpushed "$(g rev-parse small)" origin)" = 0 ] && ! has on-main-big && echo 1 || echo 0)" "$(cat "$T/out")"

g checkout -qb shrink big; img shots/new-big.png 2000; g commit -qam shrink
ok "shrinking the big image in a later commit still refuses (history keeps it): amend instead" "$([ "$(run main..shrink)" = 1 ] && has 'shots/new-big.png (342 KB)' && echo 1 || echo 0)" "$(cat "$T/out")"

g checkout -qb mixed main; img shots/huge.webp 500000; printf 'note\n' > "$R/notes.txt"; g add -A; g commit -qm mixed
ok "a webp is checked too, and one bad file refuses the whole range" "$([ "$(run main..mixed)" = 1 ] && has 'shots/huge.webp (489 KB)' && has 'push guard: REFUSED' && echo 1 || echo 0)" "$(cat "$T/out")"

mv "$G/image-size.sh" "$T/hidden.sh"
ok "image-size.sh missing: refused, never clean (fail closed)" "$([ "$(run main..small)" = 1 ] && has 'image size could not be checked' && echo 1 || echo 0)" "$(cat "$T/out")"
mv "$T/hidden.sh" "$G/image-size.sh"
ok "a bad IMAGE_MAX_KB: refused, never clean" "$([ "$(IMAGE_MAX_KB=lots run main..small)" = 1 ] && has 'image size could not be checked' && echo 1 || echo 0)" "$(cat "$T/out")"
echo "$pass/$((pass + fail)) passed"
[ "$fail" = 0 ]
