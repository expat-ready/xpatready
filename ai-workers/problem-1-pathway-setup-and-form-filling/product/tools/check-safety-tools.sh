#!/usr/bin/env bash
# Bundle A5 (LR-045, LR-074): the product safety checks keep working and stay report-only. guards.d/OS-36.sh switches
# each rule of studio/tools/safety/migration-check.py off in turn, and the report-only wiring of safety.yml, and this test
# must then fail. The route sweep (route-sweep.ts) needs the studio's TypeScript, which the guards job does not install:
# its planted cases run in safety.yml (and here, when the studio's packages are present). US$0, no network.
#   bash product/tools/check-safety-tools.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
STUDIO="$TOOLS/../../prototype/studio"; WF="$TOOLS/../../../../.github/workflows/safety.yml"
out=$(python3 -I "$STUDIO/tools/safety/migration-check.py" --self-test 2>&1); r=$?
ok "LR-045: migration-check.py's planted good and bad migrations are each judged right (self-test exit 0)" "$([ $r = 0 ] && echo 1)" "$(printf '%s\n' "$out" | grep -m3 '^FAIL\|Error')"
v=$(printf 'ALTER TABLE "Case" DROP COLUMN "note";\n' > "${TMPDIR:-/tmp}/os36-$$.sql"; python3 -I "$STUDIO/tools/safety/migration-check.py" --files "${TMPDIR:-/tmp}/os36-$$.sql"; echo "exit $?"); rm -f "${TMPDIR:-/tmp}/os36-$$.sql"
ok "LR-045: a planted DROP COLUMN is reported as a warning and exits 1" "$(printf '%s' "$v" | grep -q '^::warning::destructive' && printf '%s' "$v" | grep -q 'exit 1' && echo 1)" "$v"
# safety.yml stays a warning (LR-045, LR-074: warning before it refuses): every step after checkout continues on error.
if [ -f "$WF" ]; then
  steps=$(grep -cE '^      - (name|uses|id):' "$WF"); soft=$(grep -cE '^        continue-on-error: true$' "$WF")
  ok "safety.yml: every step after checkout is continue-on-error: true ($soft of $((steps - 1)))" "$([ "$soft" -eq $((steps - 1)) ] && ! grep -q 'continue-on-error: false' "$WF" && echo 1)" "steps $steps, soft $soft"
  ok "safety.yml: runs both self-tests and both checks" "$(grep -q 'migration-check.py" --self-test' "$WF" && grep -q 'migration-check.py" --base HEAD^1' "$WF" && grep -q 'route-sweep.ts --self-test' "$WF" && grep -q 'npx tsx tools/safety/route-sweep.ts > ' "$WF" && echo 1)"
else ok "safety.yml exists" 0 "no $WF"; fi
if [ -x "$STUDIO/node_modules/.bin/tsx" ] && [ -d "$STUDIO/tests/lib" ]; then
  out=$(cd "$STUDIO" && node_modules/.bin/tsx tools/safety/route-sweep.ts --self-test 2>&1); r=$?
  ok "LR-074: route-sweep.ts's planted guarded and unguarded writes are each judged right (self-test exit 0)" "$([ $r = 0 ] && echo 1)" "$(printf '%s\n' "$out" | grep -m3 '^FAIL\|Error')"
else echo "note  route-sweep.ts not run here: the studio's packages are not installed (safety.yml runs it)"; fi
finish
