#!/usr/bin/env bash
# Test of tools-on-main.sh (OS-11) on throwaway git copies (no network, US$0).   bash product/tools/check-tools-on-main.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/tools-main.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
D="$T/r/$PRODREL/tools"; mkdir -p "$D"; cp "$TOOLS/tools-on-main.sh" "$D/"; echo a > "$D/x.sh"
g() { git -C "$T/r" "$@"; }
g init -q -b main; g config user.email t@t; g config user.name t; g config commit.gpgsign false; g add -A; g commit -qm init
g update-ref refs/remotes/origin/main HEAD
run() { out=$(bash "$D/tools-on-main.sh" 2>&1); r=$?; }
run; ok "tools equal to origin/main: ok, exit 0" "$([ $r = 0 ] && echo "$out" | grep -q '^ok    tools' && echo 1)" "exit $r: $out"
echo b >> "$D/x.sh"; run
ok "an uncommitted edit in tools/: ACT naming the file, exit 1" "$([ $r = 1 ] && echo "$out" | grep -q '^ACT   tools: 1 file(s) .*(x.sh)' && echo 1)" "exit $r: $out"
g checkout -q -- .; g checkout -qb lead/old; g checkout -q main; echo c > "$D/y.sh"; g add -A; g commit -qm newer; g update-ref refs/remotes/origin/main HEAD
g checkout -q lead/old; run
ok "a branch copy behind main's tools: ACT naming the file and how far behind" "$([ $r = 1 ] && echo "$out" | grep -q 'y.sh' && echo "$out" | grep -q '1 commit(s) behind' && echo 1)" "exit $r: $out"
echo z > "$D/new.sh"; g checkout -q main; run
ok "an untracked new tool counts too" "$([ $r = 1 ] && echo "$out" | grep -q 'new.sh' && echo 1)" "exit $r: $out"
rm "$D/new.sh"; out=$(bash "$D/tools-on-main.sh" --ref no/such 2>&1); r=$?
ok "main not readable: ACT, never a silent ok" "$([ $r = 1 ] && echo "$out" | grep -q 'not readable' && echo 1)" "exit $r: $out"
grep -q 'tools-on-main.sh' "$TOOLS/lead-watch.sh"; ok "lead-watch.sh runs tools-on-main.sh" "$([ $? = 0 ] && echo 1)"
finish
