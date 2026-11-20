#!/usr/bin/env bash
# Repository clean-up stage 8 (product/design/repo-cleanup-plan-2026-11-17.md §3; proposal in
# product/design/screenshot-growth-2026-11-20.md): lists every image (png, jpg, jpeg, webp, gif) that a commit range adds
# or changes whose size at the range tip is over the limit (IMAGE_MAX_KB, default 300). Report-only by default (exit 0,
# so it slows no lane); with --enforce, exit 1 on any such image. It is wired into nothing yet: whether and where it
# blocks is the tech lead's decision. Exit 2 on bad use or when git cannot read the range (never a pass). US$0.
#   bash product/tools/check-image-size.sh [--enforce] <base>..<head>
# Test: product/tools/check-image-size-test.sh.
set -u -o pipefail
enforce=0; range=""
for a in "$@"; do
  case "$a" in
    --enforce) enforce=1;;
    -*) echo "unknown argument: $a" >&2; exit 2;;
    *) [ -z "$range" ] || { echo "one range only" >&2; exit 2; }; range="$a";;
  esac
done
case "$range" in *...*) echo "a two-dot range only (base..head)" >&2; exit 2;; *..*) ;; *) echo "usage: check-image-size.sh [--enforce] <base>..<head>" >&2; exit 2;; esac
max_kb="${IMAGE_MAX_KB:-300}"
[[ "$max_kb" =~ ^[1-9][0-9]{0,5}$ ]] || { echo "IMAGE_MAX_KB must be a whole number of KB (got $max_kb)" >&2; exit 2; }
max=$((max_kb * 1024))
base="${range%%..*}"; head="${range#*..}"
[ -n "$base" ] && [ -n "$head" ] || { echo "name both ends of the range (base..head; got $range)" >&2; exit 2; }
for r in "$base" "$head"; do git rev-parse --verify -q "$r^{commit}" >/dev/null || { echo "cannot read $r" >&2; exit 2; }; done
files=$(git diff --name-only --diff-filter=AMRC -z "$range" 2>/dev/null | tr '\0' '\n') || { echo "git cannot read the range $range" >&2; exit 2; }
n=0; over=0; total=0; over_total=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  case "$(printf '%s' "$f" | tr '[:upper:]' '[:lower:]')" in *.png|*.jpg|*.jpeg|*.webp|*.gif) ;; *) continue;; esac
  s=$(git cat-file -s "$head:$f" 2>/dev/null) || { echo "cannot read $head:$f" >&2; exit 2; }
  n=$((n + 1)); total=$((total + s))
  if [ "$s" -gt "$max" ]; then
    over=$((over + 1)); over_total=$((over_total + s))
    printf '  OVER %s KB: %s (%d KB)\n' "$max_kb" "$f" $(((s + 1023) / 1024))
  fi
done <<< "$files"
printf '  images added or changed: %d (%d KB); over %s KB: %d (%d KB)\n' "$n" $(((total + 1023) / 1024)) "$max_kb" "$over" $(((over_total + 1023) / 1024))
[ "$enforce" = 1 ] && [ "$over" -gt 0 ] && exit 1
exit 0
