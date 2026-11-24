# qa capability R1.104 after #3420: consultation agreement signed before the first consult (24 Nov)

**Run:** `/qa capability R1.104`, qa 6 (cloud qa copy, Opus 5.5 medium), under Lead 24. Live AI off, US$0, SigningPort's fake, local mail only. Tested on main 872275102, which is #3420 (QA-772) merged. Isolated copies only; :4400 not touched. Unconfirmed: no counsel.

**Verdict: Partial, with one item left: QA-777 (Bug, Major, filed on #3451).** Every named part is on main, and QA-772 is now fixed and closed.

## Evidence
| What | Where | Result |
|---|---|---|
| j_104 (`walk.mjs`) | isolated copies on 872275102, twice | 20 PASS, 0 FAIL, exit 0, both times |
| `check_fo3c2_consultation_agreement.ts` (#3420's check: the four "none yet" causes) | `run-suites.sh --only`, 872275102 | 55 passed, 0 failed |
| `check_fo3st1_consult_browser.ts` (the panel's words, C8 at 1440 px) | same | 23/23 |
| `tests/qa/check_qa777_consult_door_not_bound.ts` | main 3af5fc4b0, twice (#3451) | 3/5: the door is not bound to a browser |
| GitHub walk | not dispatched | a cloud lane cannot (P-439), and there is no Works claim to prove |

## QA-772: closed
A booking whose type needs the agreement, with no agreement yet, is now held. The answer is 409 `AGREEMENT_NOT_SIGNED` with its causes: `NO_CLIENT_EMAIL`, `NO_TEMPLATE`, `NO_LICENSED` or `SENDING`. The panel names the missing piece and says to reschedule. The source is Code SOR/2022-128 s. 23(1), per Lead 22's ruling on #3414. The row has moved to `qa/BUGS-CLOSED.md`.

## Why not Works
**QA-777** (Major) names R1.104. FO-3c's public door keeps the code check on the signer, not on the browser. So for 30 minutes after the client types the code, anyone holding the forwarded link gets the signing link with no code. A forwarded link alone also records the client's consent before any code. An open Major keeps the capability Partial (P-305, gate B P-317). The fix was ruled on #3433: FO-3c moves onto FO-6 part 4's `door-code.ts` after 4b.

## Next step to Works
1. QA-777 is fixed, and its check passes 5/5.
2. j_104 runs green on main's head on GitHub's runners (walks.yml, dispatched by the Lead).
3. A fresh reader agrees.
