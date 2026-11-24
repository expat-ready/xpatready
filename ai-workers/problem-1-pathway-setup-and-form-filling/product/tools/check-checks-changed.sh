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
ok("A2 fail: refused (403)", res.status === 403 &&
  res.body.code === "NO_KEY",
  res);
  await step("A3 the page opens", async () => {
    await page.goto("/x");
  });
F
printf 'ok("B1 pass: one", one === 1);\n' > "$R/$D/check_b.ts"
printf 'ok "S1 pass: exit 0" "$([ $r = 0 ] && echo 1)" "$o"\nif true; then\n  case_ "S2 size" size ok x\nfi\n' > "$R/$K/check-s.sh"
printf 'class T:\n    def test_x(self):\n        self.assertEqual(L["t"], "one")\n' > "$R/$K/test_t.py"
printf '# ledger\n' > "$R/$K/flaky-ledger.tsv"; echo 'ok("not a test file", true)' > "$R/$P/prototype/studio/api/src/x.ts"
}
base; g add -A; g commit -qm base; g tag b0
start() { g checkout -q -f b0; g clean -qfd; }
run() { g add -A; g commit -qm x --allow-empty; o=$(cd "$R" && printf '%s\n' "${1:-}" | python3 -I "$TOOLS/checks-changed.py" --base b0 --summary "$T/sum" 2>&1; echo "rc=$?"); }
has() { grep -qF -- "$1" <<<"$o" && echo 1; }
none() { start; eval "$2"; run; ok "pass: $1" "$([ "$(has 'no existing check removed or changed')" = 1 ] && has rc=0)" "$o"; }
lists() { start; eval "$2"; run; ok "fail: $1" "$([ "$(has '::warning title=Checks changed')" = 1 ] && [ "$(has "$3")" = 1 ] && [ "$(has "$4")" = 1 ] && has rc=0)" "$o"; }
A="$R/$D/check_a.ts"; B="$R/$D/check_b.ts"; sub() { python3 -I -c 'import sys; f,a,b=sys.argv[1:]; t=open(f).read(); assert a in t; open(f,"w").write(t.replace(a,b))' "$@"; }
none "an app file only" 'echo y >> "$R/$P/prototype/studio/api/src/x.ts"'
none "a new check beside the old ones" 'echo "ok(\"A9 new\", true);" >> "$A"'
none "a new test file" 'echo "ok(\"N1\", true);" > "$R/$D/check_n.ts"'
none "re-indented and re-wrapped" 'sub "$A" "res.status === 403 &&
  res.body" "res.status === 403 && res.body"'
none "moved to another changed file" 'sub "$A" "ok(\"A1 pass: three rows\", rows.length === 3, rows);
" ""; echo "  ok(\"A1 pass: three rows\", rows.length === 3, rows);" >> "$B"'
none "a whole file renamed" 'mv "$B" "$R/$D/check_c.ts"'
none "a comment changed" 'sub "$A" "a comment is no check" "another comment"'
lists "a check removed" 'sub "$A" "ok(\"A1 pass: three rows\", rows.length === 3, rows);
" ""' '1 removed, 0 changed' '- removed: `prototype/studio/tests/check_a.ts`: A1 pass: three rows'
lists "its condition loosened" 'sub "$A" "rows.length === 3" "rows.length >= 1"' '0 removed, 1 changed' 'now: `ok("A1 pass: three rows", rows.length >= 1, rows);`'
lists "a change on a later line of the statement" 'sub "$A" "\"NO_KEY\"" "undefined"' '0 removed, 1 changed' 'A2 fail: refused (403)'
lists "a step body emptied" 'sub "$A" "    await page.goto(\"/x\");
" ""' '0 removed, 1 changed' 'A3 the page opens'
lists "a label reworded is changed, not removed" 'sub "$A" "A1 pass: three rows\", rows.length === 3" "A1 pass: two rows\", rows.length === 2"' '0 removed, 1 changed' 'was: `ok("A1 pass: three rows"'
lists "a check commented out" 'sub "$A" "ok(\"A1 pass" "// ok(\"A1 pass"' '1 removed' 'A1 pass: three rows'
lists "a second copy that is weaker" 'sub "$B" "one === 1" "true"' '0 removed, 1 changed' 'now: `ok("B1 pass: one", true);`'
lists "a shell check removed" 'sub "$R/$K/check-s.sh" "  case_ \"S2 size\" size ok x" "  :"' '1 removed' 'check-s.sh`: S2 size'
lists "a Python assertion changed" 'sub "$R/$K/test_t.py" "\"one\"" "\"two\""' '0 removed, 1 changed' 'test_t.py'
lists "a skip added" 'sub "$A" "await step(" "await step.skip("' '1 skips' 'skip or only added: `prototype/studio/tests/check_a.ts`'
lists "a quarantine row added" 'printf "check_a.ts\t2026-11-24\n" >> "$R/$K/flaky-ledger.tsv"' '1 quarantined' 'quarantine row added'
lists "a test file deleted" 'g rm -q "$D/check_b.ts"' '1 removed' '- test file deleted: `prototype/studio/tests/check_b.ts`'
start; sub "$A" "rows.length === 3" "true"; run 'Checks changed: the list is paged now (P-801)'; ok "pass: the reason is on the body's line" "$([ "$(has 'ok    checks: 0 removed, 1 changed')" = 1 ] && [ "$(has 'reason given: the list is paged now')" = 1 ] && ! grep -q '::warning' <<<"$o" && echo 1)" "$o"
ok "the list and the reason are in the run's summary" "$(grep -q 'A1 pass: three rows' "$T/sum" && grep -q 'Reason given: the list is paged now' "$T/sum" && echo 1)"
for b in 'Checks changed:' '<!-- Checks changed: because I say so -->' 'We changed. Checks changed: later we say'; do start; sub "$A" "rows.length === 3" "true"; run "$b"; ok "fail: '$b' gives no reason" "$(has '::warning title=Checks changed')" "$o"; done
o=$(cd "$R" && echo | python3 -I "$TOOLS/checks-changed.py" --base nope 2>&1; echo "rc=$?"); ok "fail: a change that cannot be read is said, exit 2, never none" "$([ "$(has 'not read')" = 1 ] && has rc=2)" "$o"
# the step of pr-rules.yml, run as written
W="$TOOLS/../../../../.github/workflows/pr-rules.yml"; awk '/existing checks this PR removes or changes/ {on = 1} on {print} on && /run: / {exit}' "$W" > "$T/step.yml"
ok "pr-rules.yml runs it on every PR that is not records only" "$(grep -qxF "        if: \"\${{ !cancelled() && steps.rec.outputs.records != 'yes' }}\"" "$T/step.yml" && echo 1)" "$(cat "$T/step.yml")"
sed -n 's/^ *run: //p' "$T/step.yml" > "$T/step.sh"; step() { o=$(cd "$R" && BODY="$1" GITHUB_STEP_SUMMARY="$T/sum2" T="${2:-$TOOLS}" bash "$STEP" 2>&1; echo "rc=$?"); }; STEP="$T/step.sh"
start; sub "$A" "rows.length === 3" "true"; g add -A; g commit -qm y; step x; ok "the step warns and exits 0" "$([ "$(has '::warning title=Checks changed (A351 C2)::0 removed, 1 changed')" = 1 ] && has rc=0)" "$o"
ok "and writes the summary" "$(grep -q 'A1 pass: three rows' "$T/sum2" && echo 1)"
step x /nowhere; ok "fail: a check that cannot run is a warning" "$([ "$(has 'could not run')" = 1 ] && has rc=0)" "$o"
finish
