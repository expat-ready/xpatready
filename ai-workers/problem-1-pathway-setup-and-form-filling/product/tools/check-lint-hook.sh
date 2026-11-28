#!/usr/bin/env bash
# Test for lint-hook.sh (LR-181): the edit-time hook lints an edited studio source file and skips every other file; it
# never blocks on its own trouble (no eslint, a crash, a timeout). A stand-in eslint covers the logic anywhere (CI
# included); when the studio's node_modules are there, the real eslint also runs on a planted studio file (else those
# two lines print SKIP, never PASS). US$0, no network.   bash product/tools/check-lint-hook.sh
set -u
cd "$(dirname "$0")"
ROOT="$(cd ../../../.. && pwd)"; S="$ROOT/ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio"
D="$(mktemp -d "${TMPDIR:-/tmp}/check-lint-hook.XXXXXXXX")" && [ -d "$D" ] || { echo "check-lint-hook: no temp folder under ${TMPDIR:-/tmp}; nothing was checked"; exit 2; }
P="$S/web/src/__lint_hook_check_$$.tsx"
cleanup() { rm -f "$P"; rm -rf "$D"; }
trap cleanup EXIT
pass=0; fail=0; skip=0
ok() { if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "PASS  $1"; else fail=$((fail + 1)); echo "FAIL  $1"; fi; }
# fake eslint: records its arguments, prints a finding, exits with FAKE_RC
cat > "$D/eslint" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_LOG"; echo "  3:7  error  'x' is assigned a value but never used  no-unused-vars"; exit "${FAKE_RC:-1}"
SH
chmod +x "$D/eslint"
hook() { printf '{"tool_name":"Edit","tool_input":{"file_path":"%s"}}' "$1" | CLAUDE_PROJECT_DIR="$ROOT" LINT_HOOK_ESLINT="${2:-$D/eslint}" \
  FAKE_LOG="$D/log" FAKE_RC="${3:-1}" bash ./lint-hook.sh > "$D/out" 2> "$D/err"; echo $?; }
echo 'export const a = 1;' > "$P"
echo 'export const b = 1;' > "$D/outside.ts"   # a real .ts file outside the studio: skipped for its place, not its kind
: > "$D/log"
for f in "$D/outside.ts" "$ROOT/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/lint-hook.sh" "$S/DEVELOPING.md" \
         "$S/node_modules/x/index.js" "$S/web/src/types.d.ts" "$S/evidence/a.ts"; do
  [ "$(hook "$f")" = 0 ] && [ ! -s "$D/err" ]; ok "skips $(basename "$(dirname "$f")")/$(basename "$f"): exit 0, nothing printed" $?
done
[ ! -s "$D/log" ]; ok "eslint never ran for a skipped file" $?
[ "$(hook "$P")" = 2 ] && grep -q "new problems in web/src/__lint_hook_check_$$.tsx" "$D/err" && grep -q no-unused-vars "$D/err"; ok "an edited studio file with a finding: exit 2, the finding on stderr for the agent" $?
grep -q -- "--config eslint.hook.config.js --pass-on-unpruned-suppressions" "$D/log" && grep -q -- "-- web/src/__lint_hook_check_$$.tsx" "$D/log"; ok "it runs the hook config with the bulk suppressions, on that one file" $?
[ "$(hook "$P" "$D/eslint" 0)" = 0 ] && [ ! -s "$D/err" ]; ok "clean file: exit 0, nothing printed" $?
[ "$(hook "$P" "$D/eslint" 2)" = 0 ] && [ ! -s "$D/err" ]; ok "eslint crash (exit 2): the hook does not block" $?
[ "$(hook "$P" /nonexistent/eslint)" = 0 ]; ok "no studio node_modules (no eslint): exit 0" $?
[ "$(printf 'not json' | CLAUDE_PROJECT_DIR="$ROOT" LINT_HOOK_ESLINT="$D/eslint" FAKE_LOG="$D/log" bash ./lint-hook.sh >/dev/null 2>&1; echo $?)" = 0 ]; ok "unreadable hook input: exit 0" $?
cat > "$D/slow" <<'SH'
#!/usr/bin/env bash
sleep 5; exit 1
SH
chmod +x "$D/slow"
[ "$(printf '{"tool_input":{"file_path":"%s"}}' "$P" | CLAUDE_PROJECT_DIR="$ROOT" LINT_HOOK_ESLINT="$D/slow" LINT_HOOK_TIMEOUT=1 bash ./lint-hook.sh >/dev/null 2>&1; echo $?)" = 0 ]; ok "eslint over the timeout: exit 0" $?
# The real eslint, when the studio's node_modules are there.
if [ -x "$S/node_modules/.bin/eslint" ]; then
  printf 'export function f() {\n  const unused = 1;\n  return 2;\n}\n' > "$P"
  [ "$(hook "$P" "$S/node_modules/.bin/eslint")" = 2 ] && grep -q "no-unused-vars" "$D/err"; ok "real eslint: a planted unused variable in a studio file is reported (exit 2)" $?
  printf 'export function f(): number {\n  return 2;\n}\n' > "$P"
  [ "$(hook "$P" "$S/node_modules/.bin/eslint")" = 0 ] && [ ! -s "$D/err" ]; ok "real eslint: the same file fixed is clean (exit 0)" $?
else
  skip=2; echo "SKIP  real eslint (2 checks): no $S/node_modules; run npm ci there to include them"
fi
echo "check-lint-hook: $pass passed, $fail failed, $skip skipped"
[ "$fail" = 0 ]
