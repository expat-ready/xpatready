#!/usr/bin/env bash
# The test of cleanup-pr-check.sh (enforcement plan row E5): a "Clean-up:" PR must be pure, a PR that edits
# stale-paths.txt or moves BULK files needs that line, every PR runs the stale-path check, and pr-rules.yml calls it.
# Each case runs in a throwaway git copy under $TMPDIR, never in this repository. US$0, no network.
#   bash product/tools/check-cleanup-pr.sh
set -u
unset REPO_ROOT CLEANUP_BULK
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/cleanup-pr.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }
trap 'rm -rf "$T"' EXIT
ROOTD="$(cd "$TOOLS/../../../.." && pwd)"; P1=ai-workers/problem-1-pathway-setup-and-form-filling; TL="$P1/product/tools"
fresh() {  # $1 name: a git copy with the tools, AGENTS.md, CLAUDE.md, olddir/x.txt, olddir/y.txt on main, then branch pr
  R="$T/$1"; mkdir -p "$R/$TL" "$R/olddir" "$R/docs" "$R/.github"
  cp "$TOOLS/cleanup-pr-check.sh" "$TOOLS/check-pure-move.sh" "$TOOLS/check-stale-paths.sh" "$TOOLS/repo-root.sh" "$R/$TL/"
  printf '# none yet\n' > "$R/$TL/stale-paths.txt"; echo root > "$R/AGENTS.md"; echo one > "$R/CLAUDE.md"; echo '# moved' > "$R/docs/PATHS-MOVED.md"
  printf 'x\n' > "$R/olddir/x.txt"; printf 'y\n' > "$R/olddir/y.txt"; echo "run: bash olddir/x.txt" > "$R/.github/ci.yml"
  git -C "$R" init -q -b main && git -C "$R" config user.email t@t && git -C "$R" config user.name t \
    && git -C "$R" config commit.gpgsign false && git -C "$R" add -A && git -C "$R" commit -qm base && git -C "$R" checkout -qb pr
}
run() {  # $1 body, rest: arguments → exit code; output in $T/out
  ( cd "$R" && printf '%s\n' "$1" | bash "$R/$TL/cleanup-pr-check.sh" --base main "${@:2}" > "$T/out" 2>&1 ); echo $?
}
y() { [ "$1" = "$2" ] && echo 1 || echo 0; }
DONE=$'Done when: x\nDuplicate check: none'

fresh r1; echo z > "$R/olddir/z.txt"; git -C "$R" add -A; git -C "$R" commit -qm add
ok "an ordinary PR passes and still runs the stale-path check" "$([ "$(run "$DONE")" = 0 ] && grep -q 'stale paths: ' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"

fresh r2; git -C "$R" mv olddir newdir; echo "run: bash newdir/x.txt" > "$R/.github/ci.yml"; printf 'olddir/\n' >> "$R/$TL/stale-paths.txt"; git -C "$R" commit -qam mv
ok "a move that lists its old path but has no Clean-up line fails" "$([ "$(run "$DONE")" = 1 ] && grep -q 'NO CLEAN-UP LINE: this PR edits' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
ok "... and passes with 'Clean-up: move; allow: .github/ci.yml'" "$(y "$(run "$DONE"$'\nClean-up: move; allow: .github/ci.yml')" 0)" "$(cat "$T/out")"
ok "... but fails with 'Clean-up: move' alone (the ci.yml edit is not pure)" "$([ "$(run "$DONE"$'\nClean-up: move')" = 1 ] && grep -q 'NOT PURE.*ci.yml' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"

fresh r3; git -C "$R" mv olddir newdir; echo edit >> "$R/newdir/x.txt"; git -C "$R" commit -qam mv
ok "a Clean-up: move with an edit inside a moved file fails, naming it" "$([ "$(run "$DONE"$'\nClean-up: move')" = 1 ] && grep -q 'NOT PURE.*newdir/x.txt' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"

fresh r4; printf 'olddir/\n' >> "$R/$TL/stale-paths.txt"; git -C "$R" rm -q olddir/y.txt; git -C "$R" commit -qam rm
ok "a Clean-up: delete whose old path a live file still names fails the stale-path check" "$([ "$(run "$DONE"$'\nClean-up: delete')" = 1 ] && grep -q 'STALE (olddir/): .github/ci.yml:1' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
git -C "$R" rm -q olddir/x.txt .github/ci.yml; git -C "$R" commit -qm rm2
ok "... and passes once nothing live names it" "$(y "$(run "$DONE"$'\nClean-up: delete')" 0)" "$(cat "$T/out")"

fresh r5; for i in 1 2 3; do echo $i > "$R/olddir/f$i.txt"; done; git -C "$R" add -A; git -C "$R" commit -qm more; git -C "$R" branch -qf main
git -C "$R" rm -q olddir/f1.txt olddir/f2.txt olddir/f3.txt; echo edit >> "$R/olddir/x.txt"; git -C "$R" commit -qam bulk
ok "a bulk delete (at the limit) with no Clean-up line fails" "$([ "$(CLEANUP_BULK=3 run "$DONE")" = 1 ] && grep -q '3 files renamed or deleted (limit 3)' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
ok "... under the limit it passes" "$(y "$(CLEANUP_BULK=4 run "$DONE")" 0)" "$(cat "$T/out")"

fresh r6; git -C "$R" rm -q olddir/y.txt; git -C "$R" commit -qm rm
ok "an unreadable Clean-up line fails, saying how to write it" "$([ "$(run "$DONE"$'\nClean-up: tidy')" = 1 ] && grep -q 'cannot be read' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
echo two > "$R/CLAUDE.md"; git -C "$R" commit -qam claude
ok "a Clean-up line with a CR line end (a pasted body) is read, its allow list too" "$(y "$(run "$DONE"$'\nClean-up: delete; allow: CLAUDE.md\r')" 0)" "$(cat "$T/out")"
ok "an unknown base is bad use (exit 2)" "$(y "$(run "$DONE" --base nope)" 2)" "$(cat "$T/out")"
ok "--base with no value is bad use (exit 2)" "$(y "$( cd "$R" && printf 'x\n' | bash "$R/$TL/cleanup-pr-check.sh" --base > "$T/out" 2>&1; echo $? )" 2)" "$(cat "$T/out")"
rm "$R/$TL/stale-paths.txt"
ok "a missing stale-path list is bad use, never a pass (exit 2)" "$(y "$(run "$DONE")" 2)" "$(cat "$T/out")"

W="$ROOTD/.github/workflows/pr-rules.yml"
grep -q 'cleanup-pr-check.sh" --base HEAD^1' "$W"; ok "pr-rules.yml runs cleanup-pr-check.sh against the merge commit's first parent" "$([ $? = 0 ] && echo 1 || echo 0)"
grep -q 'fetch-depth: 2' "$W"; ok "pr-rules.yml fetches two commits, so HEAD^1 exists" "$([ $? = 0 ] && echo 1 || echo 0)"
grep -q 'check-cleanup-checks.sh check-cleanup-pr.sh' "$TOOLS/check-guards.sh"; ok "check-guards.sh runs both clean-up tests" "$([ $? = 0 ] && echo 1 || echo 0)"
finish
