# R1.32 reader verdict (P-303), main 2821fb787, 21 Nov

I am a fresh reader and ran nothing. I read: CAPABILITIES row R1.32, the previous round (`2026-11-21-r132-qa12.md` and its `reader-verdict.md`), BUGS rows QA-619 and QA-620, `prototype/studio/tests/journeys/j_32.ts` in full (after #2719), and the two W7 screenshots in this folder. I took the run ids as given and did not open them.

**Verdict: Works, provided the nightly set on main 2821fb787 (run 44893988642) is green.** If that pack is red on any R1.32 suite (check_fo10_assignment, check_fo10p2_sharing, check_fo4as_assign_browser), the verdict is Partial.

## What changed since the last round
The last round was Partial for one reason only: QA-619, because no walk by screens showed a lead following a rule. #2719 adds two steps to J-32:
* **W6** (j_32.ts:133-147): the Owner saves a rule through the API with their own session (`POST /api/front-office/assignment-rules`, web form + one service → the Case Officer). The walk asserts 200, an id, the right owner and `active`. An enquiry for no service then still lands in Unassigned leads with owner Nobody and no `assignmentRuleId`, which is the negative control. If the firm has no service yet, one Sample service is written by SQL as setup, the way J-72 does it.
* **W7** (:149-163): an enquiry for that service is sent through the public web form. It is absent from the Case Manager's Unassigned leads (counted after a reload, once the W6 lead is visible). It shows on the Case Officer's Mine with their name in the owner cell. In the DB, owner = Case Officer and `lead.created.assignmentRuleId` = the rule's id. The Case Officer opens it from Mine, and the walk ends on the lead's page with no Assign control.

The header (:3, :11-16) no longer says "no assignment rule yet". Counting the `ok(...)` calls gives 11 (setup, W1, W2 x2, W3, W4, W5, W6, W7 x2, no page error), which matches the reported 11/11.

## Screenshots (looked at)
* `w7-rule-lead-on-mine-1440.png`: the Case Officer's Leads screen with the Mine chip on. "Ravi… Sample", L-00004, interested in "Sample service (J-32)", source Website form, owner Case officer (Sample). Taro (W5's take) is there too. The sidebar badge "1 unassigned" fits W6's Ines lead still waiting.
* `w7-rule-lead-page-ends-1440.png`: the L-00004 lead page. Owner card says Case officer (Sample) with Engage and no Reassign. The Enquiry block shows the service. The Owner history reads only "Arrived" with its time (QA-620). Phone "Not given / Edit" is visible, which is where R1.33 starts.

## Clause by clause
| # | Clause | By screens | Met? |
|---|---|---|---|
| 1 | A new lead follows the rule | W7: web form by screens → on the rule person's Mine, not in Unassigned; DB names the rule. Rule set by API (no rules screen in this row: FO-12s/PF-20s, as the last reader accepted) | **Met** |
| 2 | ... or lands in Unassigned | W1 (no rule at all), and W6 (a rule exists but does not match) | Met |
| 3 | Take records who and when | W5: "<Case Officer> took it" in the owner history, with a time on each line | Met |
| 4 | Reassign records who and when | W2 (screen + audit line with actor, from nobody, `at`), W4 (both lines, oldest first) | Met |
| 5 | No key, no reassign | W3: no Assign/Reassign button and a real 403, owner unchanged; also check_fo4as AS2 | Met |

Gate A: on GitHub, walks.yml j_32 passed 11/11 twice on main 2821fb787 (runs 44893829112, 44893841111). The walk ends on the lead's page, which is R1.33's first step. Gate A is met. QA-619's expected result is met exactly as written: a rule set by API, a lead on the rule person's Mine, an end on the lead's page, and two walks.yml runs. It can be closed.

## Findings
* **QA-620 (UX · Minor, open, unchanged):** the screenshot confirms that a rule-placed lead's history says only "Arrived". Nothing on screen tells a person why the lead has its owner. Who and when for a rule placement is not asked by this Done when, so it does not hold R1.32.
* **Scaffolding · Minor (new observation, not a bug):** W7 proves "not in Unassigned" by counting rows (`inUnassigned === 0`), with no screenshot of the Unassigned list after the W7 enquiry. The W6 screenshot plus the badge "1 unassigned" in the W7 shots cover this well enough. If you want one more, add a shot `w7-unassigned-without-rule-lead` in a later tests PR. It does not hold the verdict.
* Carried, not holding (from the last reader): with sharing off, a Case Manager cannot reach Reassign (FO-10c, Major, outside this Done when); check_fo10's key test reads metadata only (the real 403 is in check_fo4as and J-32).
* I found no open Critical or Major in BUGS.md tied to R1.32 except QA-619, which this round's evidence resolves.

## Result
**Works**, conditional on the nightly run 44893988642 being green on the R1.32 suites. When it is: close QA-619 and record R1.32 Works on main 2821fb787 with walks 44893829112 / 44893841111.
