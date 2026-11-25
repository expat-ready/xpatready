#!/usr/bin/env bash
# Guard 31 (ENF-763, founder 20 Nov; P-752, P-763): the Lead's turn may not end asking the founder to click on GitHub,
# claude.ai or a console, unless the same message names a step only the founder can do (P-551, P-387); lead-watch flags
# STATE's asks to the founder that are clicks. Feeds founder-click-guard.sh the Stop hook's JSON as Claude Code does, from
# a throwaway copy whose lane.sh answers FAKE_LANE. US$0, no network.
#   bash product/tools/check-founder-click-guard.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/fc.XXXXXXXX"); trap 'rm -rf "$T"' EXIT
git init -q "$T/copy" && mkdir -p "$T/copy/$PRODREL/tools" && printf '#!/bin/bash\necho "$FAKE_LANE"\n' > "$T/copy/$PRODREL/tools/lane.sh"
G="$TOOLS/founder-click-guard.sh"
stop() {  # $1 lane, $2 last assistant message, [$3 via=transcript] → block | pass
  local out j
  if [ "${3:-}" = transcript ]; then
    jq -nc --arg m "$2" '{type:"assistant",message:{content:[{type:"text",text:$m}]}}' > "$T/t.jsonl"
    j=$(jq -n --arg d "$T/copy" --arg t "$T/t.jsonl" '{hook_event_name:"Stop",stop_hook_active:false,cwd:$d,transcript_path:$t}')
  else j=$(jq -n --arg d "$T/copy" --arg m "$2" '{hook_event_name:"Stop",stop_hook_active:false,cwd:$d,last_assistant_message:$m}'); fi
  out=$(printf '%s' "$j" | FAKE_LANE="$1" bash "$G")
  if printf '%s' "$out" | jq -e '.decision == "block"' >/dev/null 2>&1; then echo block; else echo pass; fi; }
click='The shell call was refused. Please open #2413 on GitHub and click "Convert to draft", then add the label review: approved.'
r=$(stop lead "$click"); ok "a click ask ends no Lead turn" "$([ "$r" = block ] && echo 1)" "got $r"
r=$(stop lead "$click" transcript); ok "... read from the transcript when the hook sends no message" "$([ "$r" = block ] && echo 1)" "got $r"
r=$(stop lead 'Could you mark #2322 Ready for review?'); ok "a Ready for review ask is refused" "$([ "$r" = block ] && echo 1)" "got $r"
r=$(stop lead 'Two PRs left. Reopen #2210 when you can; I will label the rest.'); ok "an imperative reopen is refused" "$([ "$r" = block ] && echo 1)" "got $r"
r=$(stop lead 'Can you set the variable in the AWS console?'); ok "a console ask is refused" "$([ "$r" = block ] && echo 1)" "got $r"
r=$(stop lead 'GitHub signed the built-in browser out. Please sign in on github.com and click Continue; I will then add the label myself.')
ok "a sign-in ask passes (only the founder can, P-551)" "$([ "$r" = pass ] && echo 1)" "got $r"
r=$(stop lead 'Please click Approve on the 2FA prompt on your phone.'); ok "a 2FA ask passes" "$([ "$r" = pass ] && echo 1)" "got $r"
r=$(stop lead 'Widening the permission is yours (P-387): click Allow in settings.'); ok "a permission widening passes (P-387)" "$([ "$r" = pass ] && echo 1)" "got $r"
r=$(stop lead 'I clicked Convert to draft on #2413 in the built-in browser and added the label. #2322 is ready for review.')
ok "a report of what the Lead did itself passes" "$([ "$r" = pass ] && echo 1)" "got $r"
for m in 'Please add the `review: approved` label to #2413.' 'Please convert #2413 to a draft.' 'Please label #2413 review: approved.' \
         'Please merge #2413 on GitHub.' 'Go to github.com/expat-ready/xpatready/pull/1 and press Merge.'; do
  r=$(stop lead "$m"); ok "refused: $m" "$([ "$r" = block ] && echo 1)" "got $r"; done
for m in 'Founder: #2322 is ready for review and green.' 'You will see #2322 ready for review in a minute.' 'You can see #2322 is now ready for review.' \
         'The founder asked me to reopen #2210; done.' 'Open #2413 and you will see the green checks.' 'I merged #2413 and reopened #2210 myself.'; do
  r=$(stop lead "$m"); ok "a status line to the founder passes: $m" "$([ "$r" = pass ] && echo 1)" "got $r"; done
# 21 Nov (Lead 6, founder: "to add one line, please do yourself"): a link to open, Edit on a description, a line to add.
for m in 'Recommend: at 07:00, open https://github.com/expat-ready/xpatready/pull/2578, press Edit on the description, and add this line at the top:' \
         'Will you add the "Done when" line to #2578 at 07:00, or leave it parked?' 'Please edit the PR description of #2578.' \
         'Open https://claude.ai/code and press Return in the lane.'; do
  r=$(stop lead "$m"); ok "refused (21 Nov): $m" "$([ "$r" = block ] && echo 1)" "got $r"; done
for m in 'Next step: add the Done when line to #2578 (I will do it in the built-in browser).' 'I edited the PR description of #2578 in the built-in browser.' 'I added the Done when line to #2578 in the built-in browser.' 'The lane fixed one line in #2452.' 'Open https://github.com/expat-ready/xpatready/pull/2578 to see it merged.'; do
  r=$(stop lead "$m"); ok "passes (21 Nov): $m" "$([ "$r" = pass ] && echo 1)" "got $r"; done
r=$(stop qa "$click"); ok "a non-Lead copy is untouched" "$([ "$r" = pass ] && echo 1)" "got $r"
r=$(stop unbound "$click"); ok "... and an unbound copy" "$([ "$r" = pass ] && echo 1)" "got $r"
out=$(jq -n --arg d "$T/copy" --arg m "$click" '{cwd:$d,last_assistant_message:$m}' | FAKE_LANE=lead bash "$G")
ok "the refusal says the fix text: do it in the built-in browser (P-752) (P-778 E-c)" "$(jq -e '.reason | contains("do it in the built-in browser (P-752")' <<<"$out" >/dev/null && echo 1)" "$out"
# ENF-778a E-c (P-778): close, archive, reopen, label, dispatch, "Run workflow", merge and press, in a message or an ask line
for m in 'Please close #2413, it is superseded.' 'Could you archive the session of lane forms-2?' 'You need to merge the PR when green.' \
         'Please press Run workflow on the nightly.' 'Can you dispatch the nightly workflow?' 'Please hit Run workflow on lead-watch.' \
         'Reopen #2210 please.' 'Please label it review: approved.' 'Could you press the green button?'; do
  r=$(stop lead "$m"); ok "refused (E-c): $m" "$([ "$r" = block ] && echo 1)" "got $r"; done
for m in 'I closed #2413 and archived the forms-2 session in the built-in browser.' 'I dispatched the nightly myself (run 4551).' \
         'The merge queue merged #2413.' 'I pressed Run workflow on the nightly; it is running.'; do
  r=$(stop lead "$m"); ok "passes (E-c, the Lead's own report): $m" "$([ "$r" = pass ] && echo 1)" "got $r"; done
# Review of #3665: a verb needs its own object (no false block on a report), and the E-c verbs as plain commands
for m in 'Press coverage is fine for now.' 'Dispatching the qa lane now, so you need not wait.' 'No need for you to press anything; I did it in the built-in browser.' \
         'You should see the nightly dispatch result by 03:00.' 'Merge conflicts on the branch were fixed.' 'I will dispatch it next.' \
         'Run workflow was pressed by the Lead.' 'Could you confirm the wording? I will merge the PR after that.'; do
  r=$(stop lead "$m"); ok "passes (#3665 review, a report): $m" "$([ "$r" = pass ] && echo 1)" "got $r"; done
for m in 'Archive the forms-2 session.' 'Merge #2413.' 'Dispatch the nightly.' 'Run workflow on the nightly.' 'Label #2413 blocked.' \
         'Please archive it.' 'Could you merge it?' 'Please label the issue blocked.' 'Please run the workflow.' 'Could you dispatch it?'; do
  r=$(stop lead "$m"); ok "refused (#3665 review): $m" "$([ "$r" = block ] && echo 1)" "got $r"; done
for m in 'Merge of #2413 landed at 10:02.' 'Dispatch of the nightly finished; run 4551 is green.' 'Would you like me to merge it now?' \
         'You should not merge it yourself; the queue merges it on green.'; do
  r=$(stop lead "$m"); ok "passes (#3665 review 2, a report or an offer): $m" "$([ "$r" = pass ] && echo 1)" "got $r"; done
for m in 'Can you archive the two old forms sessions?' 'Please archive both stale forms-2 and runtime-1 sessions.' 'Please dispatch lead-watch by hand.' \
         'Could you trigger the nightly from the Actions tab?'; do
  r=$(stop lead "$m"); ok "refused (#3665 review 2): $m" "$([ "$r" = block ] && echo 1)" "got $r"; done
printf '%s\n' '**Needs you:** archive the forms-2 session; dispatch the nightly' '- ask: Run workflow on lead-watch by hand' '| A300 | the Lead archives its own lanes | not an ask |' > "$T/STATE2.md"
out=$(bash "$G" --state "$T/STATE2.md")
ok "lead-watch (E-c): Needs you and ask lines with archive, dispatch, Run workflow are flagged" "$([ "$(grep -c '^ACT' <<<"$out")" -ge 3 ] && grep -q 'archive the forms-2' <<<"$out" && grep -q 'dispatch the nightly' <<<"$out" && grep -q 'Run workflow on lead-watch' <<<"$out" && ! grep -q A300 <<<"$out" && echo 1)" "$out"
# lead-watch: STATE's asks to the founder that are clicks.
cat > "$T/STATE.md" <<'EOF'
**For the founder (open):** (a) R1.20 vs PF-4c invite rule: done; (b) close #2088; (c) sign in to claude.ai again (signed out)
(4) **Founder asks open:** staging domain answered; click Ready for review on #2372
| A219 | 20 Nov: close #2026 when green | Lead's own row, not an ask to the founder |
EOF
out=$(bash "$G" --state "$T/STATE.md")
ok "lead-watch counts STATE's click asks to the founder" "$(grep -q 'clicks: 2 ' <<<"$out" && echo 1)" "$out"
ok "... and flags each one" "$([ "$(grep -c '^ACT' <<<"$out")" = 2 ] && grep -q 'close #2088' <<<"$out" && grep -q '#2372' <<<"$out" && echo 1)" "$out"
ok "... a sign-in ask and a row not addressed to the founder are not flagged" "$(! grep -qE 'sign in|#2026' <<<"$out" && echo 1)" "$out"
ROOTD="$(cd "$TOOLS/../../../.." && pwd)"
grep -q 'founder-click-guard.sh" --state "$TOOLS/../STATE.md"' "$TOOLS/lead-watch.sh" && grep -q "grep -c '^ACT' <<<\"\$fc\"" "$TOOLS/lead-watch.sh"
ok "lead-watch.sh runs the STATE count and counts its ACT lines" "$([ $? = 0 ] && echo 1)"
grep -q '^\[ "\$LANE" = lead \] && { fc=$(printf .%s. "\$input" | bash "\$PH/tools/founder-click-guard.sh"' "$TOOLS/stop-check.sh"
ok "stop-check.sh runs the guard in the Lead's copy" "$([ $? = 0 ] && echo 1)"
jq -e '[.hooks.Stop[].hooks[].command | select(test("stop-check.sh"))] | length == 1' "$ROOTD/.claude/settings.json" >/dev/null
ok "settings.json runs stop-check.sh on Stop" "$([ $? = 0 ] && echo 1)"
finish
