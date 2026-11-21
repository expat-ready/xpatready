#!/usr/bin/env bash
# The test of the repository clean-up checks (stage 0): check-pure-move.sh passes only a pure rename or deletion, and
# check-stale-paths.sh fails when a live file (never a record) names a listed old path. Each case runs in a throwaway
# git copy under $TMPDIR, never in this repository. US$0, no network.
#   bash product/tools/check-cleanup-checks.sh
set -u
unset REPO_ROOT   # a REPO_ROOT from the caller would point the cases at another copy
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/cleanup-checks.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }
trap 'rm -rf "$T"' EXIT
PM="$TOOLS/check-pure-move.sh"
repo() {  # $1 dir: a git copy with AGENTS.md, CLAUDE.md, a/x.txt, a/y.txt on main
  mkdir -p "$1/a" && git -C "$1" init -q -b main && git -C "$1" config user.email t@t && git -C "$1" config user.name t \
    && git -C "$1" config commit.gpgsign false && echo root > "$1/AGENTS.md" && echo one > "$1/CLAUDE.md" \
    && printf 'x\n' > "$1/a/x.txt" && printf 'y\n' > "$1/a/y.txt" && git -C "$1" add -A && git -C "$1" commit -qm base \
    && git -C "$1" checkout -qb pr
}
run() { ( cd "$R" && bash "$PM" "$@" > "$T/out" 2>&1 ); echo $?; }
fresh() { R="$T/r$1"; repo "$R"; }

fresh 1; git -C "$R" mv a b; git -C "$R" commit -qm mv
ok "a pure rename passes --move" "$([ "$(run --move --base main)" = 0 ] && echo 1 || echo 0)" "$(cat "$T/out")"
fresh 2; git -C "$R" mv a b; echo z >> "$R/b/x.txt"; git -C "$R" commit -qam mv
ok "a rename with an edit fails --move, naming the file" "$([ "$(run --move --base main)" = 1 ] && grep -q 'NOT PURE.*b/x.txt' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
fresh 3; git -C "$R" mv a b; echo new > "$R/c.txt"; git -C "$R" add -A; git -C "$R" commit -qm mv
ok "a rename plus an added file fails --move" "$([ "$(run --move --base main)" = 1 ] && echo 1 || echo 0)" "$(cat "$T/out")"
fresh 4; git -C "$R" rm -rq a; git -C "$R" commit -qm rm
ok "deletions only pass --delete" "$([ "$(run --delete --base main)" = 0 ] && echo 1 || echo 0)" "$(cat "$T/out")"
fresh 5; git -C "$R" rm -rq a; echo two > "$R/CLAUDE.md"; git -C "$R" commit -qam rm
ok "deletions plus CLAUDE.md fail --delete without --allow" "$([ "$(run --delete --base main)" = 1 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "... and pass with --allow CLAUDE.md" "$([ "$(run --delete --base main --allow CLAUDE.md)" = 0 ] && echo 1 || echo 0)" "$(cat "$T/out")"
fresh 6
ok "no change at all is no proof (exit 1)" "$([ "$(run --move --base main)" = 1 ] && grep -q 'nothing to check' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
ok "no mode is bad use (exit 2)" "$([ "$(run --base main)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "an unknown base is bad use (exit 2)" "$([ "$(run --move --base nope)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "--base with no value is bad use (exit 2)" "$([ "$(run --move --base)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "--allow with no value is bad use (exit 2)" "$([ "$(run --move --allow)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
fresh 7; printf '#!/bin/sh\n' > "$R/a/t.sh"; git -C "$R" add -A; git -C "$R" commit -qm t; git -C "$R" branch -f main
git -C "$R" mv a/t.sh a/u.sh; chmod +x "$R/a/u.sh"; git -C "$R" add -A; git -C "$R" commit -qm mv
ok "a rename that also sets the exec bit fails --move" "$([ "$(run --move --base main)" = 1 ] && grep -q 'NOT PURE: R100 mode 100644->100755' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
fresh 8; git -C "$R" rm -rq a; NA=$(printf 'caf\303\251.md'); printf 'n\n' > "$R/$NA"; git -C "$R" add -A; git -C "$R" commit -qm rm
ok "--allow matches a non-ASCII file name as written" "$([ "$(run --delete --base main --allow "$NA")" = 0 ] && echo 1 || echo 0)" "$(cat "$T/out")"

# Stale paths: a copy of the tools in a throwaway repository with one live file and one record.
S="$T/s"; P1=ai-workers/problem-1-pathway-setup-and-form-filling; mkdir -p "$S/$P1/product/tools" "$S/$P1/product/qa" "$S/.github"
cp "$TOOLS/check-stale-paths.sh" "$TOOLS/repo-root.sh" "$S/$P1/product/tools/"
echo root > "$S/AGENTS.md"; printf '# none yet\n' > "$S/$P1/product/tools/stale-paths.txt"
echo "run: bash old/place/tool.sh" > "$S/.github/ci.yml"; echo "Moved from old/place/tool.sh (record)." > "$S/$P1/product/qa/r.md"
git -C "$S" init -q -b main && git -C "$S" add -A && git -C "$S" -c user.email=t@t -c user.name=t -c commit.gpgsign=false commit -qm base
st() { ( cd "$T" && bash "$S/$P1/product/tools/check-stale-paths.sh" "$@" > "$T/out" 2>&1 ); echo $?; }
ok "an empty list passes" "$([ "$(st)" = 0 ] && echo 1 || echo 0)" "$(cat "$T/out")"
printf 'old/place/  # stage X\n' >> "$S/$P1/product/tools/stale-paths.txt"
ok "a live file naming a listed path fails, naming file and line" "$([ "$(st)" = 1 ] && grep -q 'STALE (old/place/): .github/ci.yml:1' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
ok "... and the record naming it is not read" "$(grep -q 'qa/r.md' "$T/out" && echo 0 || echo 1)" "$(cat "$T/out")"
echo "run: bash new/place/tool.sh" > "$S/.github/ci.yml"; git -C "$S" add -A
ok "once the live file names the new path, it passes" "$([ "$(st)" = 0 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "a missing list is bad use (exit 2)" "$([ "$(st --list "$T/none.txt")" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "--list with no value is bad use (exit 2)" "$([ "$(st --list)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
echo "run: bash old/place/tool.sh" > "$S/.github/ci.yml"; git -C "$S" add -A
printf '  old/place/\n' > "$T/indented.txt"
ok "a listed path with leading spaces still hits" "$([ "$(st --list "$T/indented.txt")" = 1 ] && echo 1 || echo 0)" "$(cat "$T/out")"
mkdir -p "$T/ng/.github"; echo root > "$T/ng/AGENTS.md"; echo "run: bash old/place/tool.sh" > "$T/ng/.github/ci.yml"
ok "a root that is no git copy is bad use, never a pass (exit 2)" "$([ "$(REPO_ROOT="$T/ng" st)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "a relative REPO_ROOT is refused (exit 2)" "$([ "$(REPO_ROOT=ng st)" = 2 ] && grep -q 'absolute' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
ok "a REPO_ROOT with .. is refused (exit 2)" "$([ "$(REPO_ROOT="$S/a/.." st)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
mkdir -p "$T/nomark"
ok "a REPO_ROOT without AGENTS.md is refused (exit 2)" "$([ "$(REPO_ROOT="$T/nomark" st)" = 2 ] && echo 1 || echo 0)" "$(cat "$T/out")"
ok "a REPO_ROOT with a trailing slash is the same root" "$([ "$(REPO_ROOT="$S/" st)" = 1 ] && grep -q 'STALE (old/place/): .github/ci.yml:1' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
mkdir -p "$S/$P1/prototype/p9"; echo "old/place/tool.sh" > "$S/$P1/prototype/p0-revision-manifest.sha256"; echo "see old/place/" > "$S/$P1/prototype/p1-review-handoff-2026-10-19.md"
echo "run: bash new/place/tool.sh" > "$S/.github/ci.yml"; git -C "$S" add -A
ok "the October manifests and hand-over notes at the prototype/ root are records, not read" "$([ "$(st)" = 0 ] && echo 1 || echo 0)" "$(cat "$T/out")"
echo "import old/place/tool.sh" > "$S/$P1/prototype/p9/run.py"; echo "old/place/" > "$S/$P1/prototype/p9/x-handoff-1.md"; git -C "$S" add -A
ok "... but prototype code, and a hand-over name below the root, still are" "$([ "$(st)" = 1 ] && grep -q 'prototype/p9/run.py:1' "$T/out" && grep -q 'p9/x-handoff-1.md' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
finish
