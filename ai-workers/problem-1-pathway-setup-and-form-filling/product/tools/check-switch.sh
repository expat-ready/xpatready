#!/usr/bin/env bash
# Test of switch.sh (OS-86 / LR-143, founder A417): a simulated account change prints the checklist and blocks a lane
# start until the baseline; the 4-in-15-min and 12-in-2-h caps; close-prep at a fake 94% writes the ledger row; close
# needs the row complete. Throwaway state, rules copy and git copies; no network, US$0.
#   bash product/tools/check-switch.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/switch.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
S="$TOOLS/switch.sh"; RF="$TOOLS/../rules/account-switch.md"
cp "$RF" "$T/rules.md"
export SWITCH_DIR="$T/state" CLAUDE_JSON="$T/claude.json" SWITCH_RULES="$T/rules.md" NOW=1800000000
acct() { jq -n --arg u "$1" '{oauthAccount: {accountUuid: $u, emailAddress: "x@example.com"}}' > "$CLAUDE_JSON"; }
run() { out=$(bash "$S" "$@" 2>&1); r=$?; }
rows() { grep -c '^| 20' "$SWITCH_RULES"; }
run detect; ok "no ~/.claude.json: silent, exit 0" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "exit $r: $out"
acct aaaa-1111; run detect; ok "first account seen: silent, its hash kept (never the id)" "$([ $r = 0 ] && [ -z "$out" ] && [ -s "$SWITCH_DIR/account" ] && ! grep -q aaaa "$SWITCH_DIR/account" && echo 1)" "exit $r: $out"
run detect; ok "the same account again: silent" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "$out"
run gate; ok "no switch open: a start passes, silent" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "$out"
acct bbbb-2222; run detect
ok "a simulated account change: ACCOUNT SWITCH DETECTED and the checklist AS-1..AS-11" "$([ $r = 0 ] && grep -q '^ACCOUNT SWITCH DETECTED' <<< "$out" && grep -q '^  AS-1 (' <<< "$out" && grep -q '^  AS-11 (' <<< "$out" && [ "$(grep -c '^  AS-' <<< "$out")" = 11 ] && echo 1)" "$out"
run gate; ok "... and a lane start is refused until the baseline, naming switch.sh baseline" "$([ $r = 1 ] && grep -q 'switch.sh baseline' <<< "$out" && echo 1)" "exit $r: $out"
jq -n '{tool_name:"create_session", tool_input:{prompt:"Model: Opus 5.5, effort: medium. You are a standby."}}' > "$T/in.json"
hk=$(bash "$TOOLS/lane-preflight.sh" --hook < "$T/in.json" 2>&1)
ok "... the lane-start hook (lane-preflight.sh --hook) denies it with that reason" "$(jq -e '.hookSpecificOutput.permissionDecision == "deny" and (.hookSpecificOutput.permissionDecisionReason | test("switch.sh baseline"))' <<< "$hk" >/dev/null && echo 1)" "$hk"
run detect; ok "the next session on the same account reminds: switch open, no baseline" "$(grep -q '^ACCOUNT SWITCH OPEN' <<< "$out" && echo 1)" "$out"
run baseline 101; ok "baseline 101: refused (0-100)" "$([ $r = 2 ] && echo 1)" "$out"
n0=$(rows); run baseline 3
ok "baseline 3%: recorded, a new ledger row with the minute-0 meter" "$([ $r = 0 ] && [ "$(rows)" = $((n0 + 1)) ] && tail -1 "$SWITCH_RULES" | grep -q '| 3% (' && echo 1)" "exit $r: $out / $(tail -1 "$SWITCH_RULES")"
for i in 1 2 3 4; do NOW=$((NOW + i * 60)) bash "$S" gate >/dev/null; done
out=$(NOW=$((NOW + 300)) bash "$S" gate 2>&1); r=$?; ok "4 starts in 15 min: the 5th is refused" "$([ $r = 1 ] && grep -q '4 lanes started in the last 15 min' <<< "$out" && echo 1)" "exit $r: $out"
for i in 1 2 3 4; do NOW=$((NOW + 1000 + i * 60)) bash "$S" gate >/dev/null; done; for i in 1 2 3 4; do NOW=$((NOW + 2000 + i * 60)) bash "$S" gate >/dev/null; done
out=$(NOW=$((NOW + 3000)) bash "$S" gate 2>&1); r=$?; ok "12 starts in the first 2 h: the 13th is refused" "$([ $r = 1 ] && grep -q '12 lanes already started' <<< "$out" && echo 1)" "exit $r: $out"
out=$(NOW=$((NOW + 7300)) bash "$S" gate 2>&1); r=$?; ok "after 2 h: starts pass again" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
out=$(NOW=$((NOW + 7400)) bash "$S" close 9 2>&1); r=$?
ok "close at 2 h: burn and lanes filled, refused while Work lost and Lesson are empty" "$([ $r = 1 ] && grep -q '"Work lost"' <<< "$out" && grep -q '"Lesson"' <<< "$out" && tail -1 "$SWITCH_RULES" | grep -q '6 points (3% → 9%) | 12 |' && echo 1)" "exit $r: $out / $(tail -1 "$SWITCH_RULES")"
python3 - "$SWITCH_RULES" <<'PY'
import sys; f = sys.argv[1]; L = open(f).read().split("\n"); i = max(k for k, l in enumerate(L) if l.startswith("| 20"))
c = [x.strip() for x in L[i].strip("|").split("|")]; c[1] = "not recorded"; c[5] = "none"; c[6] = "waves of 4 held the burn to 6 points"; L[i] = "| " + " | ".join(c) + " |"; open(f, "w").write("\n".join(L))
PY
out=$(NOW=$((NOW + 7500)) bash "$S" close 2>&1); r=$?; ok "... with the row complete: switch closed" "$([ $r = 0 ] && grep -q 'switch closed' <<< "$out" && [ ! -e "$SWITCH_DIR/open" ] && echo 1)" "exit $r: $out"
# close-prep, the old side, in a git copy with an upstream
git init -q -b main "$T/up.git" --bare 2>/dev/null || git init -q --bare "$T/up.git"; git clone -q "$T/up.git" "$T/c" 2>/dev/null
P="$T/c/$PRODREL"; mkdir -p "$P/tools" "$P/rules"; cp "$S" "$P/tools/"; cp "$RF" "$P/rules/account-switch.md"; echo s > "$P/STATE.md"; echo r > "$P/RESUME-ON-NEW-ACCOUNT.md"
git -C "$T/c" -c user.email=t@t -c user.name=t add -A; git -C "$T/c" -c user.email=t@t -c user.name=t commit -qm init; git -C "$T/c" push -q origin HEAD 2>/dev/null; git -C "$T/c" branch -q -u origin/"$(git -C "$T/c" branch --show-current)"
cp2() { out=$(SWITCH_RULES="$P/rules/account-switch.md" SWITCH_DIR="$T/old" bash "$P/tools/switch.sh" close-prep "$@" 2>&1); r=$?; }
cp2 93; ok "close-prep at 93%: not yet, nothing written" "$([ $r = 0 ] && grep -q 'not yet' <<< "$out" && [ "$(grep -c '^| 20' "$P/rules/account-switch.md")" = 1 ] && echo 1)" "$out"
echo changed >> "$P/STATE.md"; cp2 94
ok "close-prep at a fake 94%: the ledger row is written (old meter 94%), and an unpushed STATE is named, exit 1" "$([ $r = 1 ] && grep -q 'ledger row written' <<< "$out" && grep -q 'STATE.md has uncommitted changes' <<< "$out" && tail -1 "$P/rules/account-switch.md" | grep -q '(prep) | 94% (' && echo 1)" "exit $r: $out"
git -C "$T/c" -c user.email=t@t -c user.name=t commit -qam records; git -C "$T/c" push -q 2>/dev/null; cp2 95
ok "... pushed: close-prep done, exit 0, and the row is not written twice" "$([ $r = 0 ] && grep -q 'close-prep: done' <<< "$out" && [ "$(grep -c '(prep)' "$P/rules/account-switch.md")" = 1 ] && echo 1)" "exit $r: $out"
# Review of #3923 (Major): the guard tests never touch the machine's real switch state.
FH="$T/home"; mkdir -p "$FH/.claude/xr-switch"; printf 'opened=1\n' > "$FH/.claude/xr-switch/open"
sd=$(env -u SWITCH_DIR HOME="$FH" bash -c ". '$TOOLS/guard-test-lib.sh'; echo \$SWITCH_DIR")
hk=$(env -u SWITCH_DIR HOME="$FH" bash -c ". '$TOOLS/guard-test-lib.sh'; bash '$TOOLS/lane-preflight.sh' --hook" < "$T/in.json" 2>&1)
ok "guard-test-lib.sh gives every test its own switch state: a real open switch in HOME neither refuses a hook test nor counts its start" "$([ -n "$sd" ] && [ "${sd#"$FH"}" = "$sd" ] && ! grep -q 'deny' <<< "$hk" && [ ! -e "$FH/.claude/xr-switch/starts" ] && echo 1)" "SWITCH_DIR=$sd hook=$hk"
acct cccc-3333; run detect; ok "a new switch clears the old week's close-prep mark (the next row gets written)" "$([ ! -e "$SWITCH_DIR/prepped" ] && echo 1)" "$(ls "$SWITCH_DIR")"
grep -q 'switch.sh" detect' "$TOOLS/session-start.sh"; ok "session-start.sh runs switch.sh detect" "$([ $? = 0 ] && echo 1)"
grep -q 'switch.sh" close-prep' "$TOOLS/lead-watch.sh"; ok "lead-watch.sh runs close-prep at LEAD_WEEKLY" "$([ $? = 0 ] && echo 1)"
finish
