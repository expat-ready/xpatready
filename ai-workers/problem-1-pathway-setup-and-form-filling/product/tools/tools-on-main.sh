#!/usr/bin/env bash
# OS-11 (OS P1, design/os-manual-enforcement-2026-11-26.md: "the Lead has run stale tools (2,900 commits behind), giving
# false jams"): the tools a check runs must be main's. Compares this copy's product/tools/ (working tree, so uncommitted
# edits count) with origin/main's. Prints "ok    tools: ..." (exit 0) or one "ACT   tools: ..." line naming up to 5
# differing files and how far HEAD is behind (exit 1). Run by lead-watch.sh step 1d after its git fetch, so the Lead no
# longer compares shas by hand. Git only, no network. Usage: bash product/tools/tools-on-main.sh [--ref origin/main]
# Test: check-tools-on-main.sh.
set -u
REF=origin/main; [ "${1:-}" = --ref ] && REF=$2
D="$(cd "$(dirname "$0")" && pwd)"; R=$(git -C "$D" rev-parse --show-toplevel 2>/dev/null) || { echo "ACT   tools: $D is not in a git copy (OS-11)"; exit 1; }
git -C "$R" rev-parse -q --verify "$REF^{commit}" >/dev/null || { echo "ACT   tools: $REF is not readable here: git fetch origin main (OS-11)"; exit 1; }
rel=${D#"$R"/}
files=$( { git -C "$R" diff --name-only "$REF" -- "$rel"; git -C "$R" ls-files --others --exclude-standard -- "$rel"; } | sort -u)
behind=$(git -C "$R" rev-list --count "HEAD..$REF" 2>/dev/null || echo "?")
if [ -z "$files" ]; then echo "ok    tools: this copy's tools/ match $REF ($(git -C "$R" rev-parse --short=9 "$REF"))"; exit 0; fi
n=$(printf '%s\n' "$files" | grep -c .)
list=$(printf '%s\n' "$files" | head -5 | sed "s#^$rel/##" | paste -sd ',' - | sed 's/,/, /g')
echo "ACT   tools: $n file(s) in this copy's tools/ differ from $REF ($list$([ "$n" -gt 5 ] && echo ', …')); HEAD is $behind commit(s) behind: run the check from a main checkout (git worktree add <dir> $REF), not this branch's copy (OS-11)"
exit 1
