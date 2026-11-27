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
cd "$T/r"
run; ok "no merges at all: NONE" "$([ $r = 0 ] && echo "$out" | grep -q '^NONE' && echo 1)" "exit $r: $out"
merge "$S/api/src/a.ts" "runtime: R1.1 — a route"; run
ok "an app-code merge and no qa merge: DUE naming it" "$([ $r = 0 ] && echo "$out" | grep -q '^DUE .* #101 runtime: R1.1' && echo 1)" "exit $r: $out"
merge "ai-workers/problem-1-pathway-setup-and-form-filling/product/qa/CAPABILITIES.md" "qa: capability R1.1 — Works"; run
ok "a qa merge after it: NONE, naming the qa merge" "$([ $r = 0 ] && echo "$out" | grep -q '^NONE .*#102' && echo 1)" "exit $r: $out"
merge "ai-workers/problem-1-pathway-setup-and-form-filling/product/STATE.md" "records: P-900 (records only)"; run
ok "a records-only merge after qa: still NONE" "$([ $r = 0 ] && echo "$out" | grep -q '^NONE' && echo 1)" "exit $r: $out"
merge "$S/tests/x.test.ts" "tests: a flaky test fixed"; run
ok "a tests-only merge is not app code: NONE" "$([ $r = 0 ] && echo "$out" | grep -q '^NONE' && echo 1)" "exit $r: $out"
merge "$S/web/src/b.tsx" "screens: R1.2 — a page"; merge "$S/engine/c.ts" "runtime: R1.3 — engine"; run
ok "two app-code merges after qa: DUE names the newest" "$([ $r = 0 ] && echo "$out" | grep -q '^DUE .* #106 runtime: R1.3' && echo "$out" | grep -q 'after qa [0-9a-f]\{9\} #102' && echo 1)" "exit $r: $out"
merge "ai-workers/problem-1-pathway-setup-and-form-filling/product/qa/BUGS.md" "records: qa 1 after-merge — R1.2, R1.3"; run
ok "a \"records: qa\" merge counts as qa: NONE" "$([ $r = 0 ] && echo "$out" | grep -q '^NONE .*#107' && echo 1)" "exit $r: $out"
out=$(bash "$TOOLS/qa-due.sh" --ref nosuchref --no-open-check 2>&1); r=$?
ok "an unreadable ref: exit 2, never a silent NONE" "$([ $r = 2 ] && echo 1)" "exit $r: $out"
merge "$S/prisma/schema.prisma" "migration — runtime: R1.4"
mkdir "$T/bin"; printf '#!/bin/sh\nexit 1\n' > "$T/bin/gh"; chmod +x "$T/bin/gh"
out=$(PATH="$T/bin:$PATH" bash "$TOOLS/qa-due.sh" --ref main 2>&1); r=$?
ok "the open-qa-PR search failing: BUSY, never a blind second round" "$([ $r = 0 ] && echo "$out" | grep -q '^BUSY .*search failed' && echo 1)" "exit $r: $out"
printf '#!/bin/sh\necho 1\n' > "$T/bin/gh"
out=$(PATH="$T/bin:$PATH" bash "$TOOLS/qa-due.sh" --ref main 2>&1); r=$?
ok "an open qa PR from the last 6 h: BUSY" "$([ $r = 0 ] && echo "$out" | grep -q '^BUSY 1 open qa PR' && echo 1)" "exit $r: $out"
printf '#!/bin/sh\necho 0\n' > "$T/bin/gh"
out=$(PATH="$T/bin:$PATH" bash "$TOOLS/qa-due.sh" --ref main 2>&1); r=$?
ok "no open qa PR: DUE" "$([ $r = 0 ] && echo "$out" | grep -q '^DUE .* #108' && echo 1)" "exit $r: $out"
finish
