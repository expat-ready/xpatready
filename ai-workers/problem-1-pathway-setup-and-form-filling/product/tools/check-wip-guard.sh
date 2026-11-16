#!/usr/bin/env bash
# B193 part 2 (e), P-622 (1), P-623 (1): wip-guard.py refuses starting a build row in a module group with 2 capabilities
# waiting for qa (files in qa/built/) or one waiting over 24 h, unless the prompt names an open qa bug; other groups
# and tooling rows start freely. A throwaway git copy holds the qa/built/ files, committed at set times. US$0.
#   bash product/tools/check-wip-guard.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/wip.XXXXXXXX"); trap 'rm -rf "$T"' EXIT
C="$T/copy"; B="$C/$PRODREL/qa/built"; NOW=1763240000
git init -q -b main "$C" && git -C "$C" config user.email t@t && git -C "$C" config user.name t && git -C "$C" config commit.gpgsign false
mkdir -p "$B"; printf '| QA-500 | Bug · Major | x |\n' > "$C/$PRODREL/qa/BUGS.md"; echo readme > "$B/README.md"
add() {  # $1 capability, $2 hours ago
  echo "$1" > "$B/$1.md"; git -C "$C" add -A; GIT_COMMITTER_DATE="@$((NOW - $2 * 3600)) +0000" GIT_AUTHOR_DATE="@$((NOW - $2 * 3600)) +0000" git -C "$C" commit -qm "$1"; }
add PF-23r 30               # platform: one, over 24 h (full)
add FO-3 5; add FO-3f 4     # front office: two (full)
add CS-C1b 3; add BK-11 2   # case side: two (full) until qa scores BK-11 below
G="$TOOLS/wip-guard.py"
start() {  # $1 prompt → allow | deny
  local out; out=$(jq -n --arg p "$1" --arg d "$C" '{tool_name:"mcp__claude-code-remote__create_session", tool_input:{prompt:$p, title:"lane"}, cwd:$d}' | NOW=$NOW python3 -I "$G")
  if printf '%s' "$out" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null 2>&1; then echo deny; else echo allow; fi; }
r=$(start "/next forms PF-6 — the shared register"); ok "platform with one capability waiting over 24 h: a new row is refused" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(start "/next screens FO-5s booking page"); ok "front office with two waiting: refused" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(start "/next screens FO-7b invoices"); ok "client money (FO-7*, nothing waiting) starts" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(start "/next forms FO-5s: fix QA-500 (qa bug) on the booking page"); ok "a qa bug fix may start in a full group" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(start "/next forms FO-5s: see QA-999"); ok "... but only for an open qa bug" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(start "/next forms FO-5s; QA-500 noted"); ok "an open qa bug merely named (not fixed) does not let a row through" "$([ "$r" = deny ] && echo 1)" "got $r"
r=$(start "Row B193 part 3: PR norms in CI (P-619); pass G-4 rule"); ok "a tooling row starts freely; other IDs in the text are context" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(start "/next screens FO-7b invoices, after FO-3 and PF-23r"); ok "only the row started is judged (FO-7b), not the rows it mentions" "$([ "$r" = allow ] && echo 1)" "got $r"
r=$(start "Row PF-6: the shared register"); ok "a brief naming its row as Row X-1 is judged too" "$([ "$r" = deny ] && echo 1)" "got $r"
for q in "/next screens PF-30 then /qa after-merge tests it" "QA-5 closed. /next screens PF-30" "Row PF-30 fix layout, QA-500 context"; do
  r=$(start "$q"); ok "no way round the limit: $q" "$([ "$r" = deny ] && echo 1)" "got $r"; done
for q in "/qa capability FO-3" "/qa after-merge (PF-23w, PF-6b just merged)"; do
  r=$(start "$q"); ok "a qa session is never limited (it empties the group): $q" "$([ "$r" = allow ] && echo 1)" "got $r"; done
r=$(start "/next screens AS-3 case list"); ok "the case side with two waiting: refused" "$([ "$r" = deny ] && echo 1)" "got $r"
git -C "$C" rm -q "$B/BK-11.md" && git -C "$C" commit -qm "qa scored BK-11"
r=$(start "/next screens AS-3 case list"); ok "... once qa scores one, the case side (one waiting 3 h) starts" "$([ "$r" = allow ] && echo 1)" "got $r"
out=$(jq -n --arg p "/next forms PF-6" --arg d "$C" '{tool_input:{prompt:$p}, cwd:$d}' | NOW=$NOW python3 -I "$G")
ok "the refusal names the group and what waits" "$(echo "$out" | jq -e '.hookSpecificOutput.permissionDecisionReason | test("platform: PF-23r 30 h")' >/dev/null && echo 1)" "$out"
o=$(NOW=$NOW python3 -I "$G" --status "$C"); rc=$?
ok "--status lists the full groups and exits 1" "$([ $rc = 1 ] && grep -q '^FULL  front_office' <<< "$o" && grep -q '^ok    case_side' <<< "$o" && echo 1)" "$o"
same=$(python3 -I - "$TOOLS/wip-guard.py" "$TOOLS/cockpit-data.py" <<'P'
import ast, sys
get = lambda f: next(ast.literal_eval(n.value) for n in ast.parse(open(f).read()).body if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "COMP_PREFIX")
print(1 if get(sys.argv[1]) == get(sys.argv[2]) else 0)
P
)
ok "the row → module group table equals cockpit-data.py's COMP_PREFIX" "$same"
finish
