#!/usr/bin/env bash
# The test of deps-line-check.sh (enforcement plan row E16, STANDARDS §1): a PR that adds a package to any package.json
# needs a "STANDARDS §1:" line; a version change, a removal or a moved file needs none; pr-rules.yml runs it.
# Each case runs in a throwaway git copy under $TMPDIR, never in this repository. US$0, no network.
#   bash product/tools/check-deps-line.sh
set -u
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/deps-line.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }
trap 'rm -rf "$T"' EXIT
ROOTD="$(cd "$TOOLS/../../../.." && pwd)"
fresh() {  # $1 name: a git copy with app/package.json (react 19, vitest 3) on main, then branch pr
  R="$T/$1"; mkdir -p "$R/app"
  printf '{"name":"app","dependencies":{"react":"19.0.0"},"devDependencies":{"vitest":"3.0.0"}}\n' > "$R/app/package.json"
  git -C "$R" init -q -b main && git -C "$R" config user.email t@t && git -C "$R" config user.name t \
    && git -C "$R" config commit.gpgsign false && git -C "$R" add -A && git -C "$R" commit -qm base && git -C "$R" checkout -qb pr
}
pj() { printf '%s\n' "$2" > "$R/$1"; git -C "$R" add -A; git -C "$R" commit -qm c; }
run() { ( cd "$R" && printf '%s\n' "$1" | bash "$TOOLS/deps-line-check.sh" --base main "${@:2}" > "$T/out" 2>&1 ); echo $?; }
y() { [ "$1" = "$2" ] && echo 1 || echo 0; }
B=$'Done when: x\nDuplicate check: none'

fresh r1; pj app/package.json '{"name":"app","dependencies":{"react":"19.0.0","left-pad":"1.3.0"},"devDependencies":{"vitest":"3.0.0"}}'
ok "a new dependency without the line fails, naming it and its file" "$([ "$(run "$B")" = 1 ] && grep -q 'ADDED: left-pad (app/package.json)' "$T/out" && grep -q 'NO STANDARDS §1 LINE' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
ok "... and passes with 'STANDARDS §1: <reason>'" "$(y "$(run "$B"$'\nSTANDARDS §1: no padding helper in the stack; options x, y; smallest')" 0)" "$(cat "$T/out")"
ok "... an empty 'STANDARDS §1:' line is no reason (fails)" "$(y "$(run "$B"$'\nSTANDARDS §1:   ')" 1)" "$(cat "$T/out")"
ok "... the line with a CR line end (a pasted body) is read" "$(y "$(run "$B"$'\nSTANDARDS §1: gap x\r')" 0)" "$(cat "$T/out")"
ok "... a 'STANDARDS §1:' inside a sentence does not count" "$(y "$(run "$B"$'\nsee STANDARDS §1: later')" 1)" "$(cat "$T/out")"

fresh r2; pj app/package.json '{"name":"app","dependencies":{"react":"19.0.0"},"devDependencies":{"vitest":"3.0.0","stryker":"8.0.0"}}'
ok "a new devDependency counts too" "$([ "$(run "$B")" = 1 ] && grep -q 'ADDED: stryker' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
fresh r3; pj app/package.json '{"name":"app","dependencies":{"react":"19.1.0"},"devDependencies":{"vitest":"3.0.0"}}'
ok "a version change needs no line" "$(y "$(run "$B")" 0)" "$(cat "$T/out")"
fresh r11; pj app/package.json '{"name":"app","dependencies":{"react":"npm:preact@10.0.0"},"devDependencies":{"vitest":"3.0.0"}}'
ok "an old name pointed at another package (npm: alias) counts as added" "$([ "$(run "$B")" = 1 ] && grep -q 'ADDED: react (now npm:preact@10.0.0)' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
fresh r12; pj app/package.json '{"name":"app","dependencies":{"react":"github:someone/react"},"devDependencies":{"vitest":"3.0.0"}}'
ok "... a github: spec too" "$(y "$(run "$B")" 1)" "$(cat "$T/out")"
for v in 'preactjs/preact' './vendor/preact' '/opt/preact.tgz' 'NPM:preact@10'; do
  fresh "r14$(printf '%s' "$v" | tr -c 'a-z' '_')"; pj app/package.json '{"name":"app","dependencies":{"react":"'"$v"'"},"devDependencies":{"vitest":"3.0.0"}}'
  ok "... '$v' (another package to npm) counts too" "$(y "$(run "$B")" 1)" "$(cat "$T/out")"; done
fresh r15; pj app/package.json '{"name":"app","dependencies":{"react":"^19.1 || 20.x"},"devDependencies":{"vitest":"latest"}}'
ok "a changed semver range or a dist-tag needs no line" "$(y "$(run "$B")" 0)" "$(cat "$T/out")"
fresh r16; pj app/package.json '{"name":"app","dependencies":{"react":"npm:preact@10"},"peerDependencies":{"react":"19.0.0"},"devDependencies":{"vitest":"3.0.0"}}'
ok "a name listed in two sections is judged in each (the alias in dependencies is seen)" "$(y "$(run "$B")" 1)" "$(cat "$T/out")"
fresh r13; printf '\357\273\277{"name":"app","dependencies":{"react":"19.0.0","left-pad":"1.3.0"},"devDependencies":{"vitest":"3.0.0"}}\n' > "$R/app/package.json"; git -C "$R" commit -qam bom
ok "a package.json with a byte-order mark is read (npm accepts it)" "$([ "$(run "$B")" = 1 ] && grep -q 'ADDED: left-pad' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
fresh r4; pj app/package.json '{"name":"app","dependencies":{"react":"19.0.0"}}'
ok "a removal needs no line" "$(y "$(run "$B")" 0)" "$(cat "$T/out")"
fresh r5; pj app/package.json '{"name":"app","dependencies":{"vitest":"3.0.0"},"devDependencies":{"react":"19.0.0"}}'
ok "a package moved between sections of the same file needs no line" "$(y "$(run "$B")" 0)" "$(cat "$T/out")"
fresh r6; mkdir -p "$R/lib"; pj lib/package.json '{"name":"lib","peerDependencies":{"zod":"3.0.0"}}'
ok "a new package.json's packages count (here a peerDependency)" "$([ "$(run "$B")" = 1 ] && grep -q 'ADDED: zod (lib/package.json)' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
fresh r7; pj package.json '{"name":"root","optionalDependencies":{"fsevents":"2.0.0"}}'
ok "the root package.json is read (optionalDependencies)" "$([ "$(run "$B")" = 1 ] && grep -q 'ADDED: fsevents (package.json)' "$T/out" && echo 1 || echo 0)" "$(cat "$T/out")"
fresh r8; git -C "$R" mv app web; git -C "$R" commit -qm mv
ok "a moved package.json with the same packages needs no line" "$(y "$(run "$B")" 0)" "$(cat "$T/out")"
fresh r9; echo x > "$R/app/README.md"; git -C "$R" add -A; git -C "$R" commit -qm readme
ok "a PR touching no package.json passes" "$(y "$(run "$B")" 0)" "$(cat "$T/out")"
fresh r10; pj app/package.json '{"name":"app", broken'
ok "a package.json that is not JSON is bad use, never a pass (exit 2)" "$(y "$(run "$B")" 2)" "$(cat "$T/out")"
ok "an unknown base is bad use (exit 2)" "$(y "$(run "$B" --base nope)" 2)" "$(cat "$T/out")"

W="$ROOTD/.github/workflows/pr-rules.yml"
grep -q 'deps-line-check.sh" --base HEAD^1' "$W"; ok "pr-rules.yml runs deps-line-check.sh against the merge commit's first parent" "$([ $? = 0 ] && echo 1 || echo 0)"
grep -q 'fetch-depth: 2' "$W"; ok "pr-rules.yml fetches two commits, so HEAD^1 exists" "$([ $? = 0 ] && echo 1 || echo 0)"
grep -q 'check-deps-line.sh' "$TOOLS/check-guards.sh"; ok "check-guards.sh runs this test" "$([ $? = 0 ] && echo 1 || echo 0)"
finish
