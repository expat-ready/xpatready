#!/usr/bin/env bash
# Test of qa-due.sh on a throwaway git history (no network, US$0).   bash product/tools/check-qa-due.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/qa-due.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
S=ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio
g() { git -C "$T/r" "$@"; }
git init -q -b main "$T/r"; g config user.email t@t; g config user.name t; g config commit.gpgsign false
echo x > "$T/r/README"; g add -A; g commit -qm init
n=100
merge() {  # $1 path to touch, $2 PR title
  n=$((n + 1)); g checkout -qb "b$n"; mkdir -p "$T/r/$(dirname "$1")"; echo "$n" >> "$T/r/$1"; g add -A; g commit -qm "change $n"
  g checkout -q main; g merge -q --no-ff "b$n" -m "Merge pull request #$n from o/b$n" -m "$2"; }
run() { out=$(bash "$TOOLS/qa-due.sh" --ref main --no-open-check 2>&1 < /dev/null); r=$?; }
qamerge() {  # a qa round: its branch merges main first, then (optionally) more app code lands on main, then qa merges
  n=$((n + 1)); local q=$n; g checkout -qb "q$q"; echo "$q" >> "$T/r/qa.md"; g add -A; g commit -qm "qa report $q"
  g checkout -q main; [ -n "${3:-}" ] && merge "$3" "runtime: landed during the round"
  g merge -q --no-ff "q$q" -m "Merge pull request #$q from o/q$q" -m "$2"; }
cd "$T/r"
run; ok "no merges at all: NONE" "$([ $r = 0 ] && echo "$out" | grep -q '^NONE' && echo 1)" "exit $r: $out"
merge "$S/api/src/a.ts" "runtime: R1.1 — a route"; run
ok "an app-code merge and no qa round: DUE naming it" "$([ $r = 0 ] && echo "$out" | grep -q '^DUE .* #101 runtime: R1.1' && echo 1)" "exit $r: $out"
qamerge x "qa: capability R1.1 — Works"; run
ok "a capability qa merge covers nothing: still DUE (#101)" "$([ $r = 0 ] && echo "$out" | grep -q '^DUE .* #101' && echo 1)" "exit $r: $out"
qamerge x "qa: after-merge 27 Nov — R1.1 Works"; run
ok "an after-merge round after it: NONE, naming the round" "$([ $r = 0 ] && echo "$out" | grep -q '^NONE .*#103' && echo 1)" "exit $r: $out"
merge "ai-workers/problem-1-pathway-setup-and-form-filling/product/STATE.md" "records: P-900 (records only)"; run
ok "a records-only merge after the round: still NONE" "$([ $r = 0 ] && echo "$out" | grep -q '^NONE' && echo 1)" "exit $r: $out"
merge "$S/tests/x.test.ts" "tests: a flaky test fixed"; run
ok "a tests-only merge is not app code: NONE" "$([ $r = 0 ] && echo "$out" | grep -q '^NONE' && echo 1)" "exit $r: $out"
qamerge x "records: qa 1 after-merge 27 Nov — R1.2" "$S/web/src/b.tsx"; run
ok "app code that landed while a round ran (not in its branch): DUE, though the round merged after it" "$([ $r = 0 ] && echo "$out" | grep -q '^DUE .* #107 runtime: landed during the round' && echo "$out" | grep -q 'after qa [0-9a-f]\{9\} #106' && echo 1)" "exit $r: $out"
n=$((n + 1)); g checkout -qb "q$n"; g merge -q main -m "merge main"; echo "$n" >> "$T/r/qa.md"; g add -A; g commit -qm "qa report $n"; g checkout -q main
g merge -q --no-ff "q$n" -m "Merge pull request #$n from o/q$n" -m "qa: after-merge 28 Nov — R1.2"; run
ok "a round whose branch merged main covers it: NONE" "$([ $r = 0 ] && echo "$out" | grep -q '^NONE .*#108' && echo 1)" "exit $r: $out"
out=$(bash "$TOOLS/qa-due.sh" --ref nosuchref --no-open-check 2>&1); r=$?
ok "an unreadable ref: exit 2, never a silent NONE" "$([ $r = 2 ] && echo 1)" "exit $r: $out"
merge "$S/prisma/schema.prisma" "migration — runtime: R1.4"
mkdir "$T/bin"; printf '#!/bin/sh\nexit 1\n' > "$T/bin/gh"; chmod +x "$T/bin/gh"
gh_run() { out=$(PATH="$T/bin:$PATH" bash "$TOOLS/qa-due.sh" --ref main 2>&1); r=$?; }
gh_run; ok "the open-PR search failing: BUSY, never a blind second round" "$([ $r = 0 ] && echo "$out" | grep -q '^BUSY .*search failed' && echo 1)" "exit $r: $out"
printf '#!/bin/sh\necho "77 %s"\n' "$(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ)" > "$T/bin/gh"; gh_run
ok "an open after-merge PR updated in the last 12 h (any age): BUSY" "$([ $r = 0 ] && echo "$out" | grep -q '^BUSY open after-merge qa PR #77' && echo 1)" "exit $r: $out"
printf '#!/bin/sh\necho "66 %s"\n' "$(date -u -d '30 hours ago' +%Y-%m-%dT%H:%M:%SZ)" > "$T/bin/gh"; gh_run
ok "an open after-merge PR idle for 30 h is stale: DUE, naming it" "$([ $r = 0 ] && echo "$out" | grep -q '^DUE .* #109' && echo "$out" | grep -q 'stale .*#66' && echo 1)" "exit $r: $out"
printf '#!/bin/sh\ntrue\n' > "$T/bin/gh"; gh_run
ok "no open after-merge PR: DUE" "$([ $r = 0 ] && echo "$out" | grep -q '^DUE .* #109' && echo 1)" "exit $r: $out"
finish
