#!/usr/bin/env bash
# A438 cut 2 (founder 27 Nov 14:3x IST, "Yes, all three"): weakening.py decides from a pipeline file's diff whether the
# Lead must read it first. Its own cases (--self-test: a new tool, test or step passes; a removed assertion, mutation
# row, guard line or workflow line, a gate change, an allow-list entry, pull_request_target, a secret, write permission,
# an agent's effort, a settings allow rule or removed hook all weaken), then the command line: GitHub's file-list form,
# paths on stdin, a path missing from the list and an unreadable list fail closed. US$0, no network.
#   bash product/tools/check-weakening.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
W="$TOOLS/weakening.py"; T=$(mktemp -d "${TMPDIR:-/tmp}/weak.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
out=$(python3 -I "$W" --self-test 2>&1); r=$?
ok "weakening.py --self-test: every case as decided" "$([ $r = 0 ] && grep -q '^all passed' <<< "$out" && echo 1)" "$(grep FAIL <<< "$out" | head -3)"
G=$PRODREL/tools
cat > "$T/files.json" <<JSON
[{"filename": "$G/check-new.sh", "status": "added", "patch": "@@ -0,0 +1 @@\n+ok \"x\" 1", "changes": 1},
 {"filename": "$G/check-guards.sh", "status": "modified", "patch": "@@ -1,2 +1 @@\n x\n-15 ci|product/tools/queue-gate.sh|s/a/b/|check-queue-gate.sh", "changes": 1},
 {"filename": ".github/workflows/ci.yml", "status": "modified", "patch": "@@ -1 +1,3 @@\n x\n+      - name: lint\n+        run: bash lint.sh", "changes": 2},
 {"filename": "$G/push-guard.sh", "status": "renamed", "previous_filename": "$G/old-guard.sh", "patch": "", "changes": 0}]
JSON
out=$(printf '%s\n' "$G/check-new.sh" "$G/check-guards.sh" ".github/workflows/ci.yml" "$G/old-guard.sh" "$G/not-there.sh" | python3 -I "$W" --files "$T/files.json"); r=$?
ok "a new test and a new workflow step: not weakening" "$([ $r = 0 ] && ! grep -q 'check-new.sh' <<< "$out" && ! grep -q 'ci.yml' <<< "$out" && echo 1)" "$out"
ok "a removed mutation row: weakening, with the row named" "$(grep -q "^$G/check-guards.sh	removes or changes a test assertion or mutation row: 15 ci" <<< "$out" && echo 1)" "$out"
ok "a guard renamed: weakening by its old name too" "$(grep -q "^$G/old-guard.sh	renamed from" <<< "$out" && echo 1)" "$out"
ok "a path missing from the file list: weakening (fails closed)" "$(grep -q "^$G/not-there.sh	not in the PR's file list" <<< "$out" && echo 1)" "$out"
out=$(python3 -I "$W" --files "$T/files.json" ".github/workflows/ci.yml"); ok "paths as arguments: one judged, nothing printed when it does not weaken" "$([ -z "$out" ] && echo 1)" "$out"
echo '{not json' > "$T/bad.json"; python3 -I "$W" --files "$T/bad.json" x >/dev/null 2>&1; r=$?
ok "an unreadable file list: exit 2 (the callers then read every pipeline path first)" "$([ $r = 2 ] && echo 1)" "exit $r"
python3 -I "$W" --files "$T/none.json" x >/dev/null 2>&1; r=$?
ok "a missing file list: exit 2" "$([ $r = 2 ] && echo 1)" "exit $r"
echo '{"message": "Not Found"}' > "$T/obj.json"; python3 -I "$W" --files "$T/obj.json" x >/dev/null 2>&1; r=$?
ok "GitHub's error object instead of a list: exit 2" "$([ $r = 2 ] && echo 1)" "exit $r"
# Wiring: both gates call it on the "# --- pipeline" section of the one list, and fail closed when it cannot run
L="$TOOLS/lead-read-paths.txt"
ok "lead-read-paths.txt: a \"# --- pipeline\" line after the always-first lines and before \"# --- records-exempt\", holding .github/, .mergify.yml, product/tools/, .githooks/, .claude/" \
  "$(awk '/^# --- pipeline/ {p = 1} /^# --- records-exempt/ {exit} p && !/^#/' "$L" | tr '\n' ' ' | grep -q '\^\\\.github/ \^\\\.mergify\\\.yml\$ /product/tools/ /product/screens/B119/ \^\\\.githooks/ \^\\\.claude/' && awk '/^# --- pipeline/ {exit} !/^#/' "$L" | grep -q 'platform/identity' && echo 1)" "$(grep -n '^# ---' "$L")"
ok "queue-gate.sh and lead-read-gate.sh both read the pipeline section and call weakening.py" "$(grep -q 'weakening.py' "$TOOLS/queue-gate.sh" && grep -q 'weakening.py' "$TOOLS/lead-read-gate.sh" && grep -q '/^# --- pipeline/ {f = 1}' "$TOOLS/queue-gate.sh" && grep -q '/^# --- pipeline/ {f = 1}' "$TOOLS/lead-read-gate.sh" && echo 1)"
finish
