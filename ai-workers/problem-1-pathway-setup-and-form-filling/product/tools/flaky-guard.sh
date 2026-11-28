#!/usr/bin/env bash
# Flaky-test guard (LR-151, lab register; tech lead on #3908, 27 Nov; source: design/claude-docs-gap-research-2026-11-27.md
# row 15, from Anthropic's verification guidance that an agent "can't skip them, add sleeps or retry until they pass").
# A pull request that ADDS, to a test file, a fixed wait (waitForTimeout, sleep, setTimeout), a retry (retries:, .retry(,
# --retry) or a skip (test/it/describe .skip or .fixme, xit, xdescribe) fails, unless it says why: a line of its own in
# the PR body "Flaky-reason: <the cause found, or why the test goes>", or "Flaky-reason:" on the added line itself.
# The rule behind it: find the root cause, or delete the test and write down why; never hide a red.
# Only added lines count (the suites already hold about 1,400 waits; those are not judged here). A test file is a code
# file (js, ts and their c/m/x forms, py) under a tests/, test/, acceptance/ or __tests__/ folder or named *.test.* or
# *.spec.*, or a playwright/vitest/jest config (where retries are set).
#   flaky-guard.sh <base>..<head>     PR_BODY from the environment (CI passes the PR's body)
#   flaky-guard.sh --self-test        planted fixtures in a throwaway repository: fail, then pass with the reason
# Exit 0: nothing added, or every addition has a reason. Exit 1: an addition without a reason (each one named).
# Exit 2: git could not diff the range (nothing was judged).
set -uo pipefail

TEST_FILE='((^|/)(tests?|acceptance|__tests__)/.*|\.(test|spec))\.([cm]?[jt]sx?|py)$|(^|/)(playwright|vitest|jest)\.config\.[cm]?[jt]s$'
# Fixed waits, retries, skips. Word-bounded so "isleep(" or "retriesLeft" do not match.
PATTERN='waitForTimeout[[:space:]]*\(|(^|[^A-Za-z0-9_])((time|asyncio)\.)?sleep[[:space:]]*\(|setTimeout[[:space:]]*\(|(^|[^A-Za-z0-9_])retries[[:space:]]*[:=(]|\.retry[[:space:]]*\(|retryTimes[[:space:]]*\(|--retry([^A-Za-z0-9-]|$)|(^|[^A-Za-z0-9_])(test|it|describe)(\.describe)?(\.(serial|parallel))?\.(skip|fixme)[[:space:]]*\(|(^|[^A-Za-z0-9_])x(it|describe|test)[[:space:]]*\('

hits() {   # <base>..<head> → "file:line: text" for each added line that matches, in a test file, without its own reason
  local range="$1" f="" n=0 line diff
  # A diff git cannot make (a bad or unfetched range) is an error, never "nothing added" (review of #3921, minor 1).
  diff=$(git -c core.quotePath=false diff --no-renames -U0 "${range%%..*}...${range##*..}") || return 2
  printf '%s\n' "$diff" | while IFS= read -r line; do
    case "$line" in
      "+++ b/"*) f="${line#+++ b/}"; f="${f%$'\t'}";;   # git ends a path with a space by a tab (minor 3)
      "+++ /dev/null") f="";;
      "@@ "*) n=$(sed -E 's/^@@ -[0-9,]+ \+([0-9]+).*/\1/' <<< "$line");;
      "+"*)
        if [ -n "$f" ] && grep -qE "$TEST_FILE" <<< "$f" && grep -qE "$PATTERN" <<< "${line#+}" && ! grep -qE 'Flaky-reason:[[:space:]]*[^[:space:]]' <<< "$line"; then   # an empty reason is none (minor 5)
          echo "$f:$n: ${line#+}" | cut -c1-200
        fi
        n=$((n+1));;
    esac
  done
}

check() {
  local found
  found=$(hits "$1") || { echo "flaky guard: git could not diff $1: nothing judged" >&2; return 2; }
  if [ -z "$found" ]; then echo "flaky guard: no wait, retry or skip added to a test"; return 0; fi
  if printf '%s\n' "${PR_BODY:-}" | grep -qE '^[[:space:]]*Flaky-reason:[[:space:]]*[^[:space:]]'; then
    echo "flaky guard: waits, retries or skips added, with the PR's Flaky-reason line:"; printf '%s\n' "$found" | sed 's/^/  /'
    return 0
  fi
  echo "Flaky guard (LR-151): a wait, retry or skip was added to a test without a reason. Find the root cause, or delete"
  echo "the test and write down why. If one must stay, say why on a line of its own in the PR body: Flaky-reason: <why>"
  printf '%s\n' "$found" | sed 's/^/  /'
  return 1
}

self_test() {
  local bad=0 d out base
  ok() { if [ -n "$2" ]; then echo "PASS  $1"; else echo "FAIL  $1: $3"; bad=1; fi; }
  d=$(mktemp -d) || return 2
  ( cd "$d" && git init -q -b main && git config user.email t@t && git config user.name t && mkdir -p studio/tests studio/acceptance web/src \
    && printf 'await page.waitForTimeout(500);\nconst x = 1;\n' > studio/tests/check_a.ts \
    && printf 'test("a", async () => {});\n' > studio/acceptance/C1.1.test.ts && printf 'export const y = 1;\n' > web/src/app.ts \
    && git add -A && git commit -qm base ) || { rm -rf "$d"; return 2; }
  base=$(git -C "$d" rev-parse HEAD)
  plant() {   # <name> <file> <text to append> → a commit on a branch from base; prints its range
    git -C "$d" checkout -q -B "$1" "$base" && printf '%s\n' "$3" >> "$d/$2" && git -C "$d" add -A && git -C "$d" commit -qm "$1" && echo "$base..$(git -C "$d" rev-parse HEAD)"
  }
  run() { (cd "$d" && PR_BODY="$2" bash "$SELF" "$1" 2>&1); }
  local r
  r=$(plant wait studio/tests/check_a.ts 'await page.waitForTimeout(2000);')
  out=$(run "$r" ""); ok "a planted waitForTimeout fails" "$([ $? = 1 ] && grep -q 'check_a.ts:3' <<< "$out" && echo 1)" "$out"
  out=$(run "$r" $'Done when: x\nFlaky-reason: the upload has no ready event yet (QA-1)'); ok "the same with a Flaky-reason line in the body passes" "$([ $? = 0 ] && echo 1)" "$out"
  out=$(run "$r" "Flaky-reason:"); ok "an empty Flaky-reason line does not count" "$([ $? = 1 ] && echo 1)" "$out"
  r=$(plant retry studio/acceptance/C1.1.test.ts 'test.describe.configure({ retries: 2 });')
  out=$(run "$r" ""); ok "a planted retry (retries: 2) fails" "$([ $? = 1 ] && grep -q 'retries' <<< "$out" && echo 1)" "$out"
  r=$(plant skip studio/acceptance/C1.1.test.ts 'test.skip("b", async () => {});')
  out=$(run "$r" ""); ok "a planted test.skip fails" "$([ $? = 1 ] && echo 1)" "$out"
  r=$(plant sleep studio/tests/check_a.ts 'await new Promise((r) => setTimeout(r, 1000));')
  out=$(run "$r" ""); ok "a planted setTimeout sleep fails" "$([ $? = 1 ] && echo 1)" "$out"
  r=$(plant inline studio/tests/check_a.ts 'await sleep(300); // Flaky-reason: the mock clock ticks every 250 ms')
  out=$(run "$r" ""); ok "a reason on the added line itself passes" "$([ $? = 0 ] && echo 1)" "$out"
  r=$(plant app web/src/app.ts 'setTimeout(() => refresh(), 1000);')
  out=$(run "$r" ""); ok "a wait in app code (not a test) is not judged" "$([ $? = 0 ] && echo 1)" "$out"
  r=$(plant plain studio/tests/check_a.ts 'const retriesLeft = 3; const isleep = 1;')
  out=$(run "$r" ""); ok "look-alike names (retriesLeft, isleep) pass" "$([ $? = 0 ] && echo 1)" "$out"
  r=$(plant spaced studio/tests/check_a.ts 'await page.waitForTimeout (100); time.sleep(1); jest.retryTimes(3); xtest("c", () => {}); test.describe.serial.skip("d", () => {});')
  out=$(run "$r" ""); ok "spaced and other forms (waitForTimeout (, time.sleep, retryTimes, xtest, describe.serial.skip) fail" "$([ $? = 1 ] && echo 1)" "$out"
  mkdir -p "$d/web" && git -C "$d" checkout -q -B cfg "$base" && printf 'export default { retries: 2 };\n' > "$d/web/playwright.config.ts" && git -C "$d" add -A && git -C "$d" commit -qm cfg
  out=$(run "$base..$(git -C "$d" rev-parse HEAD)" ""); ok "retries set in a playwright config fail" "$([ $? = 1 ] && echo 1)" "$out"
  git -C "$d" checkout -q -B spacepath "$base" && mkdir -p "$d/web/a b" && printf 'await sleep(5);\n' > "$d/web/a b/x.spec.ts" && git -C "$d" add -A && git -C "$d" commit -qm sp
  out=$(run "$base..$(git -C "$d" rev-parse HEAD)" ""); ok "a spec file in a folder with a space is judged" "$([ $? = 1 ] && grep -q 'a b/x.spec.ts:1:' <<< "$out" && echo 1)" "$out"
  r=$(plant readme studio/tests/README.md 'Never add sleep( or waitForTimeout( to a suite.')
  out=$(run "$r" ""); ok "a README under tests/ is not judged" "$([ $? = 0 ] && echo 1)" "$out"
  r=$(plant emptyinline studio/tests/check_a.ts 'await sleep(300); // Flaky-reason:')
  out=$(run "$r" ""); ok "an empty inline Flaky-reason does not count" "$([ $? = 1 ] && echo 1)" "$out"
  out=$(run "0000000000000000000000000000000000000000..$base" ""); ok "a range git cannot diff exits 2, never 'nothing added'" "$([ $? = 2 ] && echo 1)" "$out"
  git -C "$d" checkout -q -B removed "$base" && sed -i '1d' "$d/studio/tests/check_a.ts" && git -C "$d" commit -qam removed
  out=$(run "$base..$(git -C "$d" rev-parse HEAD)" ""); ok "removing an old wait passes (only added lines count)" "$([ $? = 0 ] && echo 1)" "$out"
  rm -rf "$d"
  [ "$bad" = 0 ] && echo "all passed"; return $bad
}

SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
case "${1:-}" in
  --self-test) self_test;;
  *..*) check "$1";;
  *) echo "usage: flaky-guard.sh <base>..<head> | --self-test" >&2; exit 2;;
esac
