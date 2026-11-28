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
# safety.yml stays a warning (LR-045, LR-074, LR-161: warning before it refuses). Read with a YAML parser (review R4-1,
# P-1 on #4044: a line count let an extra checkout, or a step starting with `run:` or `if:`, skip the rule): in every
# job, step 1 is the checkout and every later step has `continue-on-error: true` (the value true, never an expression).
if [ -f "$WF" ]; then
  soft=$(python3 -I - "$WF" <<'PY' 2>&1
import sys, yaml
w = yaml.safe_load(open(sys.argv[1], encoding="utf-8")); bad = []; n = 0
for name, job in (w.get("jobs") or {}).items():
    steps = job.get("steps") or []
    if not steps or not str(steps[0].get("uses", "")).startswith("actions/checkout@"): bad.append(f"{name}: step 1 is not the checkout")
    for i, st in enumerate(steps[1:], 2):
        n += 1
        if str(st.get("uses", "")).startswith("actions/checkout@"): bad.append(f"{name}: step {i} is a second checkout")
        if st.get("continue-on-error") is not True: bad.append(f"{name}: step {i} ({st.get('name') or st.get('uses') or st.get('run', '')[:30]}) is not continue-on-error: true")
print(f"ok {n}" if not bad else "; ".join(bad))
PY
)
  ok "safety.yml: in every job, step 1 is the checkout and every later step is continue-on-error: true (${soft#ok })" "$(case "$soft" in "ok "*) echo 1;; esac)" "$soft"
  ok "safety.yml: job walk runs the route walk's self-test and the walk (LR-161)" "$(grep -q 'route-walk.ts --self-test' "$WF" && grep -q 'route-walk.ts 4612 xr_studio_safety_walk' "$WF" && echo 1)"
  ok "safety.yml: runs both self-tests and both checks" "$(grep -q 'migration-check.py" --self-test' "$WF" && grep -q 'migration-check.py" --base HEAD^1' "$WF" && grep -q 'route-sweep.ts --self-test' "$WF" && grep -q 'npx tsx tools/safety/route-sweep.ts > ' "$WF" && echo 1)"
else ok "safety.yml exists" 0 "no $WF"; fi
if [ -x "$STUDIO/node_modules/.bin/tsx" ] && [ -d "$STUDIO/tests/lib" ]; then
  out=$(cd "$STUDIO" && node_modules/.bin/tsx tools/safety/route-sweep.ts --self-test 2>&1); r=$?
  ok "LR-074: route-sweep.ts's planted guarded and unguarded writes are each judged right (self-test exit 0)" "$([ $r = 0 ] && echo 1)" "$(printf '%s\n' "$out" | grep -m3 '^FAIL\|Error')"
else echo "note  route-sweep.ts not run here: the studio's packages are not installed (safety.yml runs it)"; fi
finish
