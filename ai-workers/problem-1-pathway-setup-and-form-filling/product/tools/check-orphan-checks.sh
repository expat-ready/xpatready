#!/usr/bin/env bash
# The test of orphan-checks.sh (LR-044, lab bundle A2, OS-34): the repository lists 0 orphan check-*.sh; in a throwaway
# copy, each kind of coverage (a TESTS line, a guards.d TESTS line, an extra test, a mutation row's file, a workflow step)
# counts, and a check-*.sh named nowhere, or only in a comment, is listed and fails. US$0, no network.
#   bash product/tools/check-orphan-checks.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
O="$TOOLS/orphan-checks.sh"
out=$(bash "$O" 2>&1); r=$?
ok "the repository lists 0 orphan check-*.sh" "$([ $r = 0 ] && grep -q '^orphan-checks: 0 orphan' <<< "$out" && echo 1)" "exit $r; $(grep ORPHAN <<< "$out" | head -3 | tr '\n' ' ')"
S=$(mktemp -d "${TMPDIR:-/tmp}/orphans.XXXXXXXX") && [ -d "$S" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$S"' EXIT
D="$S/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools"; mkdir -p "$D/guards.d" "$S/.github/workflows"; cp "$O" "$D/"
printf 'TESTS="check-a.sh"\nfor t in $TESTS check-x.sh; do :; done\n' > "$D/check-guards.sh"
printf "# a row: check-v.sh|x|y|z\nMUT=\"\$MUT\"'\nG1|product/tools/check-b.sh|s/a/b/|check-a.sh'\n" > "$D/guards.d/000-base.sh"
printf 'TESTS="$TESTS check-c.sh"   # not check-z.sh\n' > "$D/guards.d/OS-1.sh"
printf 'jobs:\n  j:\n    steps:\n      - run: bash check-d.sh   # not check-y.sh\n# check-w.sh\n' > "$S/.github/workflows/w.yml"
for f in a b c d x; do : > "$D/check-$f.sh"; done
run() { out=$(bash "$D/orphan-checks.sh" "$S" 2>&1); r=$?; }
run; ok "a TESTS line, a guards.d TESTS line, an extra test, a row's file and a workflow step each cover a check (0 orphans, exit 0)" "$([ $r = 0 ] && grep -q ': 0 orphan' <<< "$out" && echo 1)" "exit $r; $out"
for f in e w y z v; do : > "$D/check-$f.sh"; done
run; for f in e w y z v; do
  case $f in e) why="named nowhere";; w) why="named only in a workflow comment line";; y) why="named only after # on a workflow step";; z) why="named only in a guards.d comment";; v) why="named only in a commented-out row";; esac
  ok "check-$f.sh, $why, is listed as an orphan" "$(grep -q "^ORPHAN  check-$f.sh:" <<< "$out" && echo 1)" "$out"
done
ok "with orphans the exit is 1 and the count is said" "$([ $r = 1 ] && grep -q ': 5 orphan' <<< "$out" && echo 1)" "exit $r; $(tail -1 <<< "$out")"
rm "$D/check-guards.sh"; run; ok "no check-guards.sh: exit 2, never a silent pass" "$([ $r = 2 ] && echo 1)" "exit $r; $out"
finish
