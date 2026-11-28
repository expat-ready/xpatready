#!/usr/bin/env bash
# Test of top15-watch.py (LR-155): counts enforced rows of the audit's top 15 on a ref; owed rows are not a failure; an
# enforcer listed but gone (file removed, or its text no longer there) is "lost" and exit 1; a table without 15 rows is
# exit 2. A throwaway git repository holds the "main" files. No network, US$0.   bash product/tools/check-top15-watch.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/top15.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
mkdir -p "$T/r/p"; cp "$TOOLS/top15-watch.py" "$T/r/p/"; g() { git -C "$T/r" -c user.name=t -c user.email=t@t "$@"; }
printf 'calls hook-a.sh here\n' > "$T/r/watch.sh"; printf 'x\n' > "$T/r/other.sh"; g init -q; g add -A; g commit -qm one
tab() { { printf '# c\n#\trule\tenforcer\tmust contain\trow\n'; for i in $(seq 1 15); do case "$i" in 1) printf '1\tr1\twatch.sh\thook-a.sh\tLR-1\n';; 2) printf '2\tr2\tother.sh\tx\tLR-2\n';; *) printf '%s\tr%s\t\t\tLR-%s\n' "$i" "$i" "$i";; esac; done; } > "$T/t.tsv"; }
run() { (cd "$T/r/p" && python3 -I top15-watch.py --ref HEAD --table "$T/t.tsv"); }
tab; out=$(run); r=$?
ok "2 of 15 enforced, 13 owed, exit 0 (owed is progress, not a failure)" "$([ $r = 0 ] && grep -q '^top15  2/15 enforced on HEAD; owed: #3 (LR-3), #4 (LR-4)' <<< "$out" && echo 1)" "exit $r: $out"
printf 'calls nothing now\n' > "$T/r/watch.sh"; g commit -qam two; out=$(run); r=$?
ok "an enforcer's text gone from its file: lost, exit 1" "$([ $r = 1 ] && grep -q '^lost   #1 r1: watch.sh on HEAD no longer contains "hook-a.sh"' <<< "$out" && grep -q '^top15  1/15' <<< "$out" && echo 1)" "exit $r: $out"
g rm -q other.sh; g commit -qm three; out=$(run); r=$?
ok "an enforcer's file gone: lost, exit 1" "$([ $r = 1 ] && grep -q '^lost   #2 r2: other.sh is not on HEAD' <<< "$out" && echo 1)" "exit $r: $out"
head -n 10 "$T/t.tsv" > "$T/t2.tsv"; mv "$T/t2.tsv" "$T/t.tsv"; out=$(run); r=$?
ok "a table without 15 rows: exit 2" "$([ $r = 2 ] && grep -q 'must hold 15 rows' <<< "$out" && echo 1)" "exit $r: $out"
out=$( (cd "$T/r/p" && python3 -I top15-watch.py --ref HEAD --table "$T/none.tsv") ); r=$?
ok "a missing table: exit 2" "$([ $r = 2 ] && echo 1)" "exit $r: $out"
D="$TOOLS/../design/top15-enforcers.tsv"
if [ -f "$D" ] && git -C "$TOOLS" rev-parse -q --verify HEAD >/dev/null 2>&1; then   # mutation copies hold only product/tools
  out=$(python3 -I "$TOOLS/top15-watch.py" --ref HEAD); r=$?
  ok "this copy's table: 15 rows, no enforcer lost on this commit" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
fi
finish
