#!/usr/bin/env bash
# verify-plan.sh (OS-72): the nearest capabilities a builder's change touches, for the verify skill. Throwaway git
# copies with a local origin/main; select-suites.mjs, change-kind.sh and works-set.mjs are stand-ins that record what
# they read. US$0, no network.   bash product/tools/check-verify-plan.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/vplan.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
P=ai-workers/problem-1-pathway-setup-and-form-filling; SR="$P/prototype/studio"; PLAN="$TOOLS/../../prototype/studio/tools/verify-plan.sh"
printf 'const fs = require("fs"); fs.writeFileSync(process.env.T + "/sel-in", fs.readFileSync(0, "utf8"));\nif (process.env.SEL_FAIL) process.exit(2); process.stdout.write(fs.existsSync(process.env.T + "/packs") ? fs.readFileSync(process.env.T + "/packs", "utf8") : "");\n' > "$T/sel.js"
printf '#!/usr/bin/env bash\ncat > /dev/null; [ -n "${KIND_FAIL:-}" ] && exit 2; echo "${KIND_OUT:-code}"\n' > "$T/kind.sh"
printf 'export function baseScoring() { if (process.env.WS_FAIL) throw new Error("x"); return { dataOf: (c) => (c === "C6.9" ? "checkpoint" : "six") }; }\n' > "$T/ws.mjs"
fresh() { rm -rf "$T/c" "$T/packs" "$T/sel-in"; mkdir -p "$T/c/$SR/tools" "$T/c/$SR/engine" "$T/c/$SR/acceptance" "$T/c/$SR/tests"; cp "$PLAN" "$T/c/$SR/tools/"; echo a > "$T/c/$SR/engine/a.ts"
  for c in C1.3 C6.5 C6.5-screen C6.9 C10.2 C2.1 C2.2 C2.3 R1.54; do echo x > "$T/c/$SR/acceptance/$c.test.ts"; done; echo t > "$T/c/$SR/tests/t.ts"
  git -C "$T/c" init -q -b main && git -C "$T/c" add -A && git -C "$T/c" -c user.email=t@t -c user.name=t commit -qm base
  git -C "$T/c" update-ref refs/remotes/origin/main HEAD; git -C "$T/c" checkout -q -b work; }
run() { o=$(cd "$T/c" && T="$T" VERIFY_SELECT_SUITES="$T/sel.js" VERIFY_CHANGE_KIND="$T/kind.sh" VERIFY_WORKS_SET="$T/ws.mjs" bash "$T/c/$SR/tools/verify-plan.sh" "$@" 2>&1); rc=$?; }
has() { grep -qF -- "$1" <<<"$o"; }
pk() { printf '%s/%s\t%s\n' "$SR" "$1" "$2" >> "$T/packs"; }   # a pack and its chain

fresh; run --lane runtime; ok "nothing changed: no walk, exit 0" "$([ "$rc" = 0 ] && has 'nothing changed since origin/main' && grep -qx 'CAPS' <<<"$o" && echo 1)" "$o"
fresh; echo b >> "$T/c/$SR/engine/a.ts"; KIND_OUT=records run --lane runtime; ok "records only: no walk, no graph read" "$([ "$rc" = 0 ] && has 'records only' && grep -qx 'CAPS' <<<"$o" && [ ! -e "$T/sel-in" ] && echo 1)" "$o"
fresh; echo b >> "$T/c/$SR/tests/t.ts"; echo b >> "$T/c/$SR/acceptance/C1.3.test.ts"; run --lane runtime; ok "tests and packs only: no walk (CI runs them)" "$([ "$rc" = 0 ] && has 'tests only (2 file(s))' && grep -qx 'CAPS' <<<"$o" && echo 1)" "$o"
fresh; echo b >> "$T/c/$SR/engine/a.ts"
pk acceptance/C10.2.test.ts 'a.ts ← x.ts ← C10.2.test.ts'; pk acceptance/C6.5-screen.test.ts 'a.ts ← C6.5-screen.test.ts'; pk acceptance/C6.5.test.ts 'a.ts ← y ← z ← C6.5.test.ts'
pk acceptance/C2.1.test.ts 'a.ts ← q ← r ← C2.1.test.ts'; pk acceptance/C2.2.test.ts 'a.ts ← q ← r ← C2.2.test.ts'; pk acceptance/C6.9.test.ts 'a.ts ← C6.9.test.ts'
pk acceptance/C2.3.test.ts 'a.ts ← q ← r ← s ← C2.3.test.ts'; pk tests/check_x_browser.ts 'a.ts ← check_x_browser.ts'; pk tests/unit_y.test.ts 'a.ts ← unit_y.test.ts'; run --lane runtime
ok "nearest first, parts collapse, at most 4 in CAPS" "$([ "$rc" = 0 ] && grep -qx 'CAPS C6.5 C6.9 C10.2 C2.1' <<<"$o" && echo 1)" "$o"
ok "the rest are LEFT to CI, nearest first" "$(grep -qx 'LEFT C2.2 C2.3' <<<"$o" && echo 1)" "$o"
ok "RUN: gate B from the studio's absolute path, the lane's port and name, each row's scoring data" "$(grep -qF "RUN cd '$T/c/$SR' && GATE_B_NO_DIFF=1 GATE_B_JOBS=1 GATE_B_PORT=4438 GATE_B_NAME=verify_runtime GATE_B_DATA_OF='C6.5=six C6.9=checkpoint C10.2=six C2.1=six' node tools/gate-b.mjs --title 'verify: C6.5 C6.9 C10.2 C2.1' --kind code" <<<"$o" && echo 1)" "$o"
ok "a touched browser test is an ALSO line; a unit test is not" "$(has "ALSO $SR/tests/check_x_browser.ts" && ! has unit_y && echo 1)" "$o"
run --lane forms --max 2; ok "--max 2 and the forms lane's port 4458" "$(grep -qx 'CAPS C6.5 C6.9' <<<"$o" && has 'GATE_B_PORT=4458 GATE_B_NAME=verify_forms' && echo 1)" "$o"
WS_FAIL=1 run --lane runtime; ok "scoring data unreadable: exit 2, no RUN" "$([ "$rc" = 2 ] && has 'scoring data could not be read' && ! has RUN && echo 1)" "$o"
: > "$T/packs"; pk acceptance/R1.54.test.ts 'a.ts ← R1.54.test.ts'; pk acceptance/C7.7.test.ts 'a.ts ← C7.7.test.ts'; run --lane screens
ok "a non-C pack and a deleted pack are named, never in CAPS" "$([ "$rc" = 0 ] && has 'R1.54.test.ts is not a C<n.n> pack' && has 'C7.7.test.ts was deleted' && grep -qx 'CAPS' <<<"$o" && echo 1)" "$o"
fresh; echo b >> "$T/c/$SR/engine/a.ts"; git -C "$T/c" add -A; git -C "$T/c" -c user.email=t@t -c user.name=t commit -qm c1; echo s > "$T/c/$SR/engine/staged.ts"; git -C "$T/c" add -A; echo n > "$T/c/$SR/engine/new one.ts"; echo u >> "$T/c/$SR/tools/verify-plan.sh"; run --lane runtime
ok "the change is commits, staged, unstaged and new files (a name with a space)" "$(grep -qx "$SR/engine/a.ts" "$T/sel-in" && grep -qx "$SR/engine/staged.ts" "$T/sel-in" && grep -qx "$SR/engine/new one.ts" "$T/sel-in" && grep -qx "$SR/tools/verify-plan.sh" "$T/sel-in" && echo 1)" "$(cat "$T/sel-in"; echo "$o")"
fresh; echo b >> "$T/c/$SR/engine/a.ts"; SEL_FAIL=1 run --lane runtime; ok "select-suites failing: exit 2, never an empty plan" "$([ "$rc" = 2 ] && has 'select-suites.mjs --packs failed' && ! has CAPS && echo 1)" "$o"
KIND_FAIL=1 run --lane runtime; ok "change-kind failing: exit 2" "$([ "$rc" = 2 ] && has 'change-kind.sh failed' && echo 1)" "$o"
run --lane lead; ok "a lane that is not a builder's: refused" "$([ "$rc" = 2 ] && has 'must be screens, forms, runtime or evidence' && echo 1)" "$o"
run; ok "no --lane: refused" "$([ "$rc" = 2 ] && echo 1)" "$o"
run --lane runtime --max 0; ok "--max 0: refused" "$([ "$rc" = 2 ] && echo 1)" "$o"
git -C "$T/c" checkout -q --detach; run --lane runtime; ok "a detached HEAD still plans" "$([ "$rc" = 0 ] && has 'changed file' && echo 1)" "$o"
fresh; git -C "$T/c" update-ref -d refs/remotes/origin/main; run --lane runtime; ok "no origin/main: exit 2, says to fetch" "$([ "$rc" = 2 ] && has 'git fetch origin main' && echo 1)" "$o"
# the skill (the mutation harness copies the root .claude/skills; a copy without it says so)
SK="$TOOLS/../../../../.claude/skills/verify"
if [ -f "$SK/SKILL.md" ]; then
  ok "the verify skill is short and names the plan, the lanes gate, the 3-run cap and the evidence line" "$([ "$(wc -l < "$SK/SKILL.md")" -lt 100 ] && grep -q '^name: verify$' "$SK/SKILL.md" && grep -q 'verify-plan.sh --lane' "$SK/SKILL.md" && grep -q 'lanes.txt' "$SK/SKILL.md" && grep -q 'at most 3 verify runs' "$SK/SKILL.md" && grep -q '^`Verify: <short sha>' "$SK/SKILL.md" && echo 1)" "$(head -3 "$SK/SKILL.md")"
  ok "lanes.txt: only lane names or # comments (a missing file is off too)" "$([ ! -f "$SK/lanes.txt" ] || ! grep -vE '^(#.*|screens|forms|runtime|evidence|)$' "$SK/lanes.txt" | grep -q . && echo 1)" "$(cat "$SK/lanes.txt" 2>&1)"
else echo "SKIP  the verify skill: not in this copy"; fi
finish
