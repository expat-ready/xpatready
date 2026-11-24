#!/usr/bin/env bash
# A351 C2 (founder 24 Nov): checks-changed.py lists the existing checks a PR removes or changes, and warns when the body does
# not say why. Pass and fail case for each, on made-up changes. US$0, no network.   bash product/tools/check-checks-changed.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/cc.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
P=ai-workers/problem-1-pathway-setup-and-form-filling; D="$P/prototype/studio/tests"; K="$P/product/tools"; R="$T/r"
g() { git -C "$R" -c user.email=t@t -c user.name=t -c commit.gpgsign=false "$@"; }
git init -q -b main "$R"; mkdir -p "$R/$D" "$R/$K" "$R/$P/prototype/studio/api/src"
base() {
cat > "$R/$D/check_a.ts" <<'F'
// ok("a comment is no check", true)
ok("A1 pass: three rows", rows.length === 3, rows);
ok("A2 fail: refused (403)", /\)$/.test(s) && res.status === 403 &&
  res.body.code === "NO_KEY",
  res);
  await step("A3 the page opens", async () => {
    await page.goto("/x");
  });
const helper = (x) => x + 1;
F
printf 'ok("B1 pass: one", one === 1);\n' > "$R/$D/check_b.ts"; printf 'expect(x).toBe(1);\n' > "$R/$P/prototype/studio/acceptance/C1.1.test.ts"
printf 'ok "S1 pass: exit 0" "$([ $r = 0 ] &&\n  [ "$n" = 3 ] && echo 1)" "$o"\n[ $r = 0 ] || { echo "FAIL x"; fail=1; }\n' > "$R/$K/check-s.sh"
printf 'b = f()\nassert b == 2\nt("seven", 7)\n' > "$R/$P/prototype/tests/check_p.py"
printf '1|product/tools/x.sh|s/a/b/|check-s.sh\n' > "$R/$K/check-guards.sh"; printf 'ok() { [ "$2" = 1 ]; }\n' > "$R/$K/guard-test-lib.sh"
printf 'needs\t2\nwindow\t7\n' > "$R/$K/flaky-ledger.tsv"; printf 'SKIP="check_z.ts"\nQUARANTINE="check_a.ts check_b.ts"\n' > "$R/$K/run-suites.sh"; echo 'ok("not a test file", true)' > "$R/$P/prototype/studio/api/src/x.ts"
}
mkdir -p "$R/$P/prototype/studio/acceptance" "$R/$P/prototype/tests" "$R/$D/qa"
mkdir -p "$R/packages/xfa/src/__tests__" "$R/$D/journeys" "$R/$P/prototype/studio/deploy/cdk/test"
echo 'expect(a).toBe(1);' > "$R/packages/xfa/src/__tests__/a.test.ts"; echo 'expect(b).toBe(1);' > "$R/$P/prototype/studio/deploy/cdk/test/s.test.ts"; echo 'ok("J1 walk", w === 1);' > "$R/$D/journeys/j_1.ts"
base; printf '16 batch word|../../.github/x.yml|s/a/b/|check-s.sh\n' >> "$R/$K/check-guards.sh"; g add -A; g commit -qm base; g tag b0
start() { g checkout -q -f b0; g clean -qfd; mkdir -p "$R/$D/qa"; }
run() { g add -A; g commit -qm x --allow-empty; : > "$T/sum"; o=$(cd "$R" && printf '%s\n' "${1:-}" | python3 -I "$TOOLS/checks-changed.py" --base b0 --summary "$T/sum" 2>&1; echo "rc=$?"); }
has() { grep -qF -- "$1" <<<"$o" && echo 1; }
none() { start; eval "$2"; run; ok "pass: $1" "$([ "$(has 'no existing test line removed or changed')" = 1 ] && has rc=0)" "$o"; }
lists() { start; eval "$2"; run; ok "fail: $1" "$([ "$(has '::warning title=Checks changed (A351 C2)::')" = 1 ] && [ "$(has "$3")" = 1 ] && [ "$(has "$4")" = 1 ] && has rc=0)" "$o"; }
A="$R/$D/check_a.ts"; B="$R/$D/check_b.ts"; sub() { python3 -I -c 'import sys; f,a,b=sys.argv[1:]; t=open(f).read(); assert a in t; open(f,"w").write(t.replace(a,b,1))' "$@"; }
none "an app file only" 'echo y >> "$R/$P/prototype/studio/api/src/x.ts"'
none "a new check beside the old ones" 'echo "ok(\"A9 new\", true);" >> "$A"'
none "a new check inside a step" 'sub "$A" "    await page.goto" "    ok(\"A3b\", true);
    await page.goto"'
none "a new test file" 'echo "ok(\"N1\", true);" > "$R/$D/check_n.ts"'
none "re-indented and re-wrapped" 'sub "$A" "res.status === 403 &&
  res.body" "res.status === 403 && res.body"'
none "moved to another changed file" 'sub "$A" "ok(\"A1 pass: three rows\", rows.length === 3, rows);
" ""; echo "  ok(\"A1 pass: three rows\", rows.length === 3, rows);" >> "$B"'
none "a suite renamed to another the runner reads" 'mv "$B" "$R/$D/check_c.ts"'
none "a comment changed" 'sub "$A" "a comment is no check" "another comment"'
none "a suite taken out of quarantine" 'sub "$R/$K/run-suites.sh" " check_b.ts" ""'
lists "a check removed" 'sub "$A" "ok(\"A1 pass: three rows\", rows.length === 3, rows);
" ""' '1 existing test lines removed or changed (1 look like checks)' 'was: ok("A1 pass: three rows"'
lists "its condition loosened" 'sub "$A" "rows.length === 3" "rows.length >= 1"' '1 existing test lines' 'now: ok("A1 pass: three rows", rows.length >= 1, rows);'
lists "a change on a later line, after a bracket in a regex" 'sub "$A" "\"NO_KEY\"" "undefined"' '1 existing test lines' 'was: res.body.code === "NO_KEY",'
lists "a check commented out" 'sub "$A" "ok(\"A1 pass" "// ok(\"A1 pass"' '1 existing test lines' 'A1 pass: three rows'
lists "a check behind if (false)" 'sub "$B" "ok(\"B1" "if (false) ok(\"B1"' '1 switched off' 'switched off? prototype/studio/tests/check_b.ts'
lists "a shell check behind false &&" 'sub "$R/$K/check-s.sh" "[ \$r = 0 ] ||" "false && [ \$r = 0 ] ||"' '1 existing test lines' 'check-s.sh'
lists "the second line of a shell check" 'sub "$R/$K/check-s.sh" "[ \"\$n\" = 3 ]" "true"' '1 existing test lines' 'check-s.sh'
lists "an inline shell FAIL" 'sub "$R/$K/check-s.sh" "fail=1" ":"' '1 existing test lines' 'now: [ $r = 0 ] || { echo "FAIL x"; :; }'
lists "a bare Python assert" 'sub "$R/$P/prototype/tests/check_p.py" "b == 2" "True"' '1 existing test lines' 'was: assert b == 2'
lists "a Python t()" 'sub "$R/$P/prototype/tests/check_p.py" "\"seven\", 7" "\"seven\", None"' '1 existing test lines' 'was: t("seven", 7)'
lists "an acceptance expect" 'sub "$R/$P/prototype/studio/acceptance/C1.1.test.ts" "toBe(1)" "toBeDefined()"' '1 existing test lines' 'was: expect(x).toBe(1);'
lists "a guard row emptied" ': > "$R/$K/check-guards.sh"' '2 existing test lines' 'was: 1|product/tools/x.sh'
lists "the test library" 'sub "$R/$K/guard-test-lib.sh" "[ \"\$2\" = 1 ]" "true"' '1 existing test lines' 'guard-test-lib.sh'
lists "a skip added" 'sub "$A" "const helper" "it.skip(\"x\");
const helper"' '1 switched off' 'switched off? prototype/studio/tests/check_a.ts: it.skip("x");'
lists "an early exit added" 'sub "$A" "const helper" "process.exit(0);
const helper"' '1 switched off' 'process.exit(0)'
lists "a suite quarantined" 'sub "$R/$K/run-suites.sh" "check_b.ts" "check_b.ts check_q.ts"' '1 quarantine or ledger' 'run-suites.sh QUARANTINE gains: check_q.ts'
lists "a suite added to SKIP" 'sub "$R/$K/run-suites.sh" "check_z.ts" "check_z.ts check_y.ts"' '1 quarantine or ledger' 'run-suites.sh SKIP gains: check_y.ts'
lists "the ledger's threshold" 'printf "needs\t1\nwindow\t7\n" > "$R/$K/flaky-ledger.tsv"' '2 quarantine or ledger' 'flaky-ledger.tsv added: needs 1'
lists "a test file deleted" 'g rm -q "$D/check_b.ts"' '1 suites left the run' 'left the run: prototype/studio/tests/check_b.ts (deleted, or renamed with edits)'
lists "a guard with no line it knows, deleted" 'g rm -q "$K/check-guards.sh"' '1 suites left the run' 'left the run: product/tools/check-guards.sh (deleted, or renamed with edits)'
lists "a suite moved where the runner does not read" 'mv "$B" "$R/$D/qa/check_b.ts"' '1 suites left the run' '(now prototype/studio/tests/qa/check_b.ts)'
lists "a suite renamed so the runner skips it" 'mv "$B" "$R/$D/off_b.ts"' '1 suites left the run' '(now prototype/studio/tests/off_b.ts)'
lists "a weakened check in a file git calls binary" 'sub "$A" "rows.length === 3" "true"; printf "// \000\n" >> "$A"' '1 existing test lines' 'A1 pass: three rows'
lists "a weakened check behind -diff" 'sub "$A" "rows.length === 3" "true"; printf "*.ts -diff\n" > "$R/.gitattributes"' '1 existing test lines' 'A1 pass: three rows'
lists "a check moved to a file the runner does not read" 'sub "$A" "ok(\"A1 pass: three rows\", rows.length === 3, rows);
" ""; echo "ok(\"A1 pass: three rows\", rows.length === 3, rows);" > "$R/$D/qa/off.ts"' '1 existing test lines' 'was: ok("A1 pass: three rows"'
lists "a condition line that also stands in a new check" 'sub "$A" "  res);" "  true);"; printf "ok(\"N2 new thing here\",\n  res);\n" >> "$B"' '1 existing test lines' 'was: res);'
lists "a block comment opened above a check" 'sub "$A" "ok(\"A1" "/*
ok(\"A1"; sub "$A" "const helper" "*/
const helper"' '1 switched off' 'check_a.ts: /*'
lists "a Python if False" 'sub "$R/$P/prototype/tests/check_p.py" "assert b == 2" "if False:
    assert b == 2"' '1 switched off' 'if False:'
lists "a shell here-document round a check" 'sub "$R/$K/check-s.sh" "[ \$r = 0 ] ||" ": <<\"OFF\"
[ \$r = 0 ] ||"' '1 switched off' ': <<'
lists "skip: true" 'sub "$A" "await step(\"A3 the page opens\"," "await step(\"A3 the page opens\", { skip: true },"' '1 switched off' 'skip: true'
lists "a condition on a continuation line" 'sub "$A" "/\\)\$/.test(s) && res.status === 403 &&" "true &&"' '1 existing test lines removed or changed (1 look like checks)' 'A2 fail: refused'
lists "QUARANTINE added to" 'printf "QUARANTINE+=\x27 check_w.ts\x27\n" >> "$R/$K/run-suites.sh"' '1 quarantine or ledger' 'QUARANTINE gains: check_w.ts'
lists "words run together inside a string" 'sub "$B" "B1 pass: one" "B1 pass:one"' '1 existing test lines' 'now: ok("B1 pass:one"'
start; sub "$B" 'ok("B1 pass: one", one === 1);' 'ok("B0 something new", z === 0);
ok("B1 pass: one", true);'; run; ok "the old line is shown beside its own new text, not the line above it" "$(has 'now: ok("B1 pass: one", true);')" "$o"
lists "a guard row with a three-word name" 'sub "$R/$K/check-guards.sh" "16 batch word|../../.github/x.yml|s/a/b/|check-s.sh
" ""' '(1 look like checks)' 'was: 16 batch word'
lists "a package test" 'sub "$R/packages/xfa/src/__tests__/a.test.ts" "toBe(1)" "toBeDefined()"' '(1 look like checks)' 'was: expect(a).toBe(1);'
lists "a deploy test" 'sub "$R/$P/prototype/studio/deploy/cdk/test/s.test.ts" "toBe(1)" "toBeDefined()"' '(1 look like checks)' 'was: expect(b).toBe(1);'
lists "a journey moved out" 'mv "$R/$D/journeys/j_1.ts" "$R/$D/qa/j_1.ts"' '1 suites left the run' 'left the run: prototype/studio/tests/journeys/j_1.ts'
lists "an acceptance pack renamed so it does not run" 'mv "$R/$P/prototype/studio/acceptance/C1.1.test.ts" "$R/$P/prototype/studio/acceptance/C1.1.off.ts"' '1 suites left the run' 'C1.1.test.ts'
none "a quoted path and a line end of another kind" 'printf "ok(\"é one\", true);\r\n" > "$R/$D/check_é.ts"'
start; for i in $(seq 5); do sub "$A" "x + 1" "x + 1"; done; sub "$A" "const helper = (x) => x + 1;" "const helper = (x) => x + 2;"; sub "$A" "rows.length === 3" "true"; run; ok "checks come first in the list, and the summary holds every line" "$([ "$(grep -n 'A1 pass' <<<"$o" | head -1 | cut -d: -f1)" -lt "$(grep -n 'const helper' <<<"$o" | head -1 | cut -d: -f1)" ] && grep -q 'const helper' "$T/sum" && echo 1)" "$o"
start; sub "$A" "x + 1" "x + 2"; run; ok "a helper line is listed and does not warn" "$([ "$(has 'ok    checks: 1 existing test lines removed or changed (0 look like checks)')" = 1 ] && [ "$(has 'was: const helper = (x) =&gt;')" != 1 ] && grep -q 'const helper' "$T/sum" && echo 1)" "$o"
start; sub "$A" "rows.length === 3, rows" "rows.length === 3, $(printf 'y%.0s' $(seq 400))1"; g add -A; g commit -qm y; g tag -f b1 >/dev/null; sub "$A" "y1" "y2"; g add -A; g commit -qm z; o=$(cd "$R" && echo | python3 -I "$TOOLS/checks-changed.py" --base b1 2>&1); ok "a long line shows its difference" "$(grep -q 'was: .*y1);' <<<"$o" && grep -q 'now: .*y2);' <<<"$o" && echo 1)" "$o"
start; sub "$A" "rows.length === 3" "true"; run 'Checks changed: the list is paged now (P-801)'; ok "pass: the reason is on the body's line" "$([ "$(has 'ok    checks: 1 existing')" = 1 ] && [ "$(has 'reason given: the list is paged now')" = 1 ] && ! grep -q '::warning' <<<"$o" && echo 1)" "$o"
ok "the list and the reason are in the run's summary" "$(grep -q 'A1 pass: three rows' "$T/sum" && grep -q 'Reason given: the list is paged now' "$T/sum" && echo 1)"
for b in 'Checks changed:' 'Checks changed: <reason>' 'Checks changed: none.' '<!-- Checks changed: because I say so -->' '> Checks changed: because I say so' '```
Checks changed: because I say so
```' 'We changed. Checks changed: later we say'; do start; sub "$A" "rows.length === 3" "true"; run "$b"; ok "fail: '$(head -1 <<<"$b")' gives no reason" "$(has '::warning title=Checks changed')" "$o"; done
start; sub "$A" "rows.length === 3, rows" 'rows, "::error title=x::y ##[stop-commands]z <b>'; run; ok "no workflow command and no markup can be made of a line" "$(! grep -qE '::error|##\[' <<<"$o" && ! grep -q '<b>' "$T/sum" && echo 1)" "$o"
start; python3 -I -c 'import sys; open(sys.argv[1],"w").write("".join("ok(\"L%d before\", true);\n" % i for i in range(800)))' "$B"; g add -A; g commit -qm y; g tag -f b1 >/dev/null; sed -i.k 's/before/after words/' "$B"; mv "$B.k" "$T/k"; g add -A; g commit -qm z; s=$(date +%s); o=$(cd "$R" && python3 -I -c 'print("\n" * 65000)' | python3 -I "$TOOLS/checks-changed.py" --base b1 2>&1); e=$(( $(date +%s) - s )); ok "800 reworded checks and a body of 65,000 empty lines: under 15 s (was over 90)" "$([ $e -lt 15 ] && has '800 existing test lines')" "${e}s"
o=$(cd "$R" && echo | python3 -I "$TOOLS/checks-changed.py" --base nope 2>&1; echo "rc=$?"); ok "fail: a change that cannot be read is said, exit 2, never none" "$([ "$(has 'not read')" = 1 ] && has rc=2)" "$o"
# the step of pr-rules.yml, run as written
W="$TOOLS/../../../../.github/workflows/pr-rules.yml"; awk '/existing checks this PR removes or changes/ {on = 1} on {print} on && /run: / {exit}' "$W" > "$T/step.yml"
ok "pr-rules.yml runs it on every PR that is not records only" "$(grep -qxF "        if: \"\${{ !cancelled() && steps.rec.outputs.records != 'yes' }}\"" "$T/step.yml" && echo 1)" "$(cat "$T/step.yml")"
sed -n 's/^ *run: //p' "$T/step.yml" > "$T/step.sh"; step() { o=$(cd "$R" && BODY="$1" GITHUB_STEP_SUMMARY="$T/sum2" T="${2:-$TOOLS}" bash "$STEP" 2>&1; echo "rc=$?"); }; STEP="$T/step.sh"
start; sub "$A" "rows.length === 3" "true"; g add -A; g commit -qm y; step x; ok "the step warns and exits 0" "$([ "$(has '::warning title=Checks changed (A351 C2)::1 existing test lines')" = 1 ] && has rc=0)" "$o"
ok "and writes the summary" "$(grep -q 'A1 pass: three rows' "$T/sum2" && echo 1)"
step x /nowhere; ok "fail: a check that cannot run is a warning" "$([ "$(has 'could not run')" = 1 ] && has rc=0)" "$o"
ok "the step has a time limit, so a slow read never holds the job" "$(grep -q "timeout 30 python3 -I" "$T/step.yml" && echo 1)"
finish
