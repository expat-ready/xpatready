#!/usr/bin/env bash
# verify-plan.sh (OS-72): the capabilities a builder's change touches, for the verify skill. Throwaway git copies with a
# local origin/main; select-suites.mjs and change-kind.sh are stand-ins that record what they read. US$0, no network.
#   bash product/tools/check-verify-plan.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/vplan.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
P=ai-workers/problem-1-pathway-setup-and-form-filling; SR="$P/prototype/studio"; PLAN="$TOOLS/../../prototype/studio/tools/verify-plan.sh"
printf 'const fs = require("fs"); const got = fs.readFileSync(0, "utf8"); fs.writeFileSync(process.env.T + "/sel-in", got);\nif (process.env.SEL_FAIL) process.exit(2); process.stdout.write(fs.existsSync(process.env.T + "/packs") ? fs.readFileSync(process.env.T + "/packs", "utf8") : "");\n' > "$T/sel.js"
printf '#!/usr/bin/env bash\ncat > /dev/null; [ -n "${KIND_FAIL:-}" ] && exit 2; echo "${KIND_OUT:-code}"\n' > "$T/kind.sh"
fresh() { rm -rf "$T/c" "$T/packs" "$T/sel-in"; mkdir -p "$T/c/$SR/tools" "$T/c/$SR/engine"; cp "$PLAN" "$T/c/$SR/tools/"; echo a > "$T/c/$SR/engine/a.ts"
  git -C "$T/c" init -q -b main && git -C "$T/c" -c user.email=t@t -c user.name=t commit -qm base --allow-empty && git -C "$T/c" add -A && git -C "$T/c" -c user.email=t@t -c user.name=t commit -qm files
  git -C "$T/c" update-ref refs/remotes/origin/main HEAD; git -C "$T/c" checkout -q -b work; }
run() { o=$(cd "$T/c" && T="$T" VERIFY_SELECT_SUITES="$T/sel.js" VERIFY_CHANGE_KIND="$T/kind.sh" bash "$T/c/$SR/tools/verify-plan.sh" "$@" 2>&1); rc=$?; }
has() { grep -qF -- "$1" <<<"$o"; }
packs() { printf '%s\n' "$@" | sed "s#^#$SR/#; s#\$#\tvia#" > "$T/packs"; }

fresh; run; ok "nothing changed: no walk, exit 0" "$([ "$rc" = 0 ] && has 'nothing changed since origin/main' && grep -qx 'CAPS' <<<"$o" && echo 1)" "$o"
fresh; echo b >> "$T/c/$SR/engine/a.ts"; KIND_OUT=records run; ok "records only: no walk, exit 0, no graph read" "$([ "$rc" = 0 ] && has 'records only' && grep -qx 'CAPS' <<<"$o" && [ ! -e "$T/sel-in" ] && echo 1)" "$o"
fresh; echo b >> "$T/c/$SR/engine/a.ts"; packs acceptance/C6.5-screen.test.ts acceptance/C6.5.test.ts acceptance/C10.2.test.ts acceptance/C1.3.test.ts tests/check_x_browser.ts tests/unit_y.test.ts; run
ok "packs become capabilities: parts collapse, sorted by number" "$([ "$rc" = 0 ] && grep -qx 'CAPS C1.3 C6.5 C10.2' <<<"$o" && echo 1)" "$o"
ok "the RUN line is gate B on the default port 4690, never 4400" "$(grep -qF 'RUN cd '"$SR"' && GATE_B_NO_DIFF=1 GATE_B_JOBS=1 GATE_B_PORT=4690 GATE_B_NAME=verify node tools/gate-b.mjs --title "verify: C1.3 C6.5 C10.2" --kind code' <<<"$o" && echo 1)" "$o"
ok "a touched browser test is an ALSO line; a unit test is not" "$(has "ALSO $SR/tests/check_x_browser.ts" && ! has unit_y && echo 1)" "$o"
fresh; echo b >> "$T/c/$SR/engine/a.ts"; git -C "$T/c" add -A; git -C "$T/c" -c user.email=t@t -c user.name=t commit -qm c1; echo s > "$T/c/$SR/engine/staged.ts"; git -C "$T/c" add -A; echo n > "$T/c/$SR/engine/new.ts"; packs acceptance/C1.3.test.ts; run
ok "the change is commits, staged and new files since origin/main" "$(grep -qx "$SR/engine/a.ts" "$T/sel-in" && grep -qx "$SR/engine/staged.ts" "$T/sel-in" && grep -qx "$SR/engine/new.ts" "$T/sel-in" && grep -q '3 changed file' <<<"$o" && echo 1)" "$(cat "$T/sel-in"; echo "$o")"
fresh; echo b >> "$T/c/$SR/engine/a.ts"; : > "$T/packs"; run; ok "code no pack reads: no walk, said so" "$([ "$rc" = 0 ] && has 'no acceptance pack reads them' && grep -qx 'CAPS' <<<"$o" && ! has RUN && echo 1)" "$o"
fresh; echo b >> "$T/c/$SR/engine/a.ts"; SEL_FAIL=1 run; ok "select-suites failing: exit 2, never an empty plan" "$([ "$rc" = 2 ] && has 'select-suites.mjs --packs failed' && ! has CAPS && echo 1)" "$o"
fresh; echo b >> "$T/c/$SR/engine/a.ts"; KIND_FAIL=1 run; ok "change-kind failing: exit 2" "$([ "$rc" = 2 ] && has 'change-kind.sh failed' && echo 1)" "$o"
fresh; echo b >> "$T/c/$SR/engine/a.ts"; packs acceptance/C1.3.test.ts; run --port 4400; ok "port 4400 (the demo): refused" "$([ "$rc" = 2 ] && has 'never 4400' && echo 1)" "$o"
run --port '46; rm -rf /'; ok "a port that is not 4000-4999: refused" "$([ "$rc" = 2 ] && echo 1)" "$o"
run --port 4692; ok "a lane's own port goes into the RUN line" "$(has 'GATE_B_PORT=4692' && echo 1)" "$o"
fresh; git -C "$T/c" update-ref -d refs/remotes/origin/main; run; ok "no origin/main: exit 2, says to fetch" "$([ "$rc" = 2 ] && has 'git fetch origin main' && echo 1)" "$o"
# the skill: present, short, off by default
SK="$TOOLS/../../prototype/studio/.claude/skills/verify"
# check-guards --mutate copies the tools folders only: there the skill is absent, and these cases say so
if [ -d "$SK" ]; then
  ok "the verify skill is under 100 lines and names verify-plan.sh, lanes.txt and the 3-round cap" "$([ "$(wc -l < "$SK/SKILL.md")" -lt 100 ] && grep -q '^name: verify$' "$SK/SKILL.md" && grep -q 'verify-plan.sh' "$SK/SKILL.md" && grep -q 'lanes.txt' "$SK/SKILL.md" && grep -q 'At most 3 rounds' "$SK/SKILL.md" && echo 1)" "$(head -3 "$SK/SKILL.md")"
  ok "lanes.txt exists; its lines are lane names or # comments" "$([ -f "$SK/lanes.txt" ] && ! grep -vE '^(#.*|screens|forms|runtime|evidence|)$' "$SK/lanes.txt" | grep -q . && echo 1)" "$(cat "$SK/lanes.txt")"
else echo "SKIP  the verify skill: not in this copy (the mutation harness copies tools only)"; fi
finish
