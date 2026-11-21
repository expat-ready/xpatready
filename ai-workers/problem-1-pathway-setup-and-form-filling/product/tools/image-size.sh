#!/usr/bin/env bash
# Repository clean-up stage 8 (product/design/repo-cleanup-plan-2026-11-17.md §3; proposal in
# product/design/screenshot-growth-2026-11-20.md): lists every image file (png, jpg, jpeg, webp, gif, any case) that is
# new to git history in a range and over the limit (IMAGE_MAX_KB, default 300). "New" means a file content reachable
# from <head> and not from <base> (git rev-list --objects), so it counts what the range adds to history: a large image
# shrunk by a later commit still counts (PRs merge with merge commits, so every commit stays), a file main changed
# after the branch was cut does not, and a rename of an existing image adds nothing. Report-only by default (exit 0, so
# it slows no lane); with --enforce, exit 1 on any such image. Wired into nothing yet: whether and where it blocks is
# the tech lead's decision. --objects-edge-aggressive also leaves out every file in the base commit itself, so a
# shallow clone (CI's default checkout) or a base that is not an ancestor of head never counts the whole tree. An image
# deleted before the base and later restored counts as new (rare; errs toward reporting). Exit 2 on bad use or when git cannot read the range (never a pass). US$0, no network.
#   bash product/tools/image-size.sh [--enforce] <base>..<head>
# Test: product/tools/check-image-size.sh.
set -u -o pipefail
enforce=0; range=""
for a in "$@"; do
  case "$a" in
    --enforce) enforce=1;;
    -*) echo "unknown argument: $a" >&2; exit 2;;
    *) [ -z "$range" ] || { echo "one range only" >&2; exit 2; }; range="$a";;
  esac
done
case "$range" in
  *...*) echo "a two-dot range only (base..head: what head adds to history)" >&2; exit 2;;
  *..*) ;;
  *) echo "usage: image-size.sh [--enforce] <base>..<head>" >&2; exit 2;;
esac
max_kb="${IMAGE_MAX_KB:-300}"
[[ "$max_kb" =~ ^[1-9][0-9]{0,5}$ ]] || { echo "IMAGE_MAX_KB must be a whole number of KB (got $max_kb)" >&2; exit 2; }
max=$((max_kb * 1024))
base="${range%%..*}"; head="${range#*..}"
[ -n "$base" ] && [ -n "$head" ] || { echo "name both ends of the range (base..head; got $range)" >&2; exit 2; }
for r in "$base" "$head"; do git rev-parse --verify -q "$r^{commit}" >/dev/null || { echo "cannot read $r" >&2; exit 2; }; done
# Every blob new to the range with the first path git saw it under, then its size. Held in a variable, so a git error
# ends the run (pipefail) instead of reading as "no images".
list=$(git rev-list --objects-edge-aggressive "$head" --not "$base" \
  | git cat-file --batch-check='%(objecttype) %(objectsize) %(rest)') || { echo "git cannot read the range $range" >&2; exit 2; }
n=0; over=0; total=0; over_total=0
while IFS= read -r line; do
  case "$line" in "blob "*) ;; *) continue;; esac
  rest="${line#blob }"; s="${rest%% *}"; f="${rest#* }"
  [ "$f" != "$rest" ] && [ -n "$f" ] || continue   # a blob with no path (cannot happen from rev-list --objects)
  case "$(printf '%s' "$f" | tr '[:upper:]' '[:lower:]')" in *.png|*.jpg|*.jpeg|*.webp|*.gif) ;; *) continue;; esac
  n=$((n + 1)); total=$((total + s))
  if [ "$s" -gt "$max" ]; then
    over=$((over + 1)); over_total=$((over_total + s))
    printf '  OVER %s KB: %s (%d KB)\n' "$max_kb" "$f" $(((s + 1023) / 1024))
  fi
done <<< "$list"
printf '  image files new to history: %d (%d KB); over %s KB: %d (%d KB)\n' "$n" $(((total + 1023) / 1024)) "$max_kb" "$over" $(((over_total + 1023) / 1024))
[ "$enforce" = 1 ] && [ "$over" -gt 0 ] && exit 1
exit 0
