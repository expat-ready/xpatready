# R1.32 reader verdict (P-303), main a28b9c4f3, 21 Nov

Fresh reader (Opus, P-303). I only read files, git history and grep output. I ran nothing: no tests, no servers, no scripts. Live AI off, US$0. Paths are relative to `prototype/studio`.

**Verdict: Works, on one condition: the GitHub walks.yml run of j_32 must pass.** That means exit 0 with 11 PASS, 0 FAIL and 0 HELD, at a28b9c4f3 or at a head with the same studio tree. If it passes, the evidence proves all five clauses. QA-619 closes on that run. QA-620 stays open as a Minor.

## Tree match (ci-44868461971.md)
`git diff --name-only 4e745220c a28b9c4f3` lists 39 files. Only one is under `prototype/`: `studio/tests/journeys/j_32.ts`. The rest are product records and J-32 screenshots. So ci 44868461971 ran main's app code, and the claim holds. The app files that changed after the previous reader's head (a66044692) are in identity, observability, deploy/cdk and booking/service.ts. None is in `front-office/assignment`, `sales/arrival.ts`, `sales/public.ts`, `sales/leads.ts` or the lead web pages.

## Answers
**1. Do W6 and W7 prove "a new lead follows the rule" by screens, ending on R1.33's first step? Yes.**
* The real path is exercised. The visitor sends the public web form by screens and picks the service in "Interested in" (j_32.ts:68-79, :150). The server checks the service and passes `interestedInServiceId` to `arrive()` (api/src/front-office/sales/public.ts:106-110, :121-127). `arrive()` calls `placeNewLead` when no owner is set yet (sales/arrival.ts:110-117). `placeNewLead` picks the most specific active rule for the door and service (assignment/place.ts:52-61) and, for a rule naming one person, checks that the person can still work leads (:63-66). The `lead.created` line carries `assignmentRuleId` (arrival.ts:129). The walk injects nothing into the matcher.
* W6 (j_32.ts:146-147) is the negative control: an enquiry with no service matches no rule, waits in Unassigned leads with owner Nobody, and its `lead.created` line has no rule id.
* W7 (j_32.ts:157-158) checks four things: the DB owner is the Case Officer, the lead is absent from Unassigned leads, `lead.created` names *this* rule's id, and the row on the Case Officer's Mine chip shows them as owner. The Case Officer then opens the lead from Mine. The walk ends on `/front-office/leads/<id>` (j_32.ts:159-163), the lead's page where R1.33 (phone numbers) starts. That meets P-317.
* **The rule is set through the API, and that is still sound.** `grep -r "assignment-rules|lead-sharing" web/src` finds nothing, so no screen can set a rule. The route needs `agent/prospect:configure-source` (assignment/routes.ts:7, :18), and the walk calls it with the Owner's own session (j_32.ts:139). The Done when says "follows the rule", not "a firm sets a rule". The rules panel belongs to FO-12s / PF-20s.
* **The Sample service inserted by SQL is acceptable setup.** The service comes from SQL only when the firm has no active service (j_32.ts:136-137); otherwise the walk uses the firm's first active one. `combination_id` may be empty in the schema (prisma/schema/front-office-sales.prisma:565). The seed itself creates services in bulk with no audit line (api/src/front-office/firm-seed.ts:121). J-72 sets up a service the same way (j_72.ts:66-67). The row is labelled Sample, and the clause under test (placement) does not depend on how the service row was made.

**2. Vacuous or false-pass checks in W1-W7: none that holds the row.**
* A missing lead fails rather than passes. `send()` returns an empty id when nothing was stored (for example the honeypot path at public.ts:116), and an empty id fails `ownerOf(...) === "-"` and `=== O.id`.
* `ruleCreated()` gives an empty string when there is no `lead.created` line, so W6's `=== "-"` cannot pass without that line.
* W7 needs `rule.id` from the save response (rules.ts:163) to equal the DB value.
* `inUnassigned === 0` (j_32.ts:152) could undercount on its own: the Unassigned list is sorted oldest first and capped at 500 (sales/leads.ts:58). The DB owner check in the same assertion rules that out.
* The checks that no Assign button is shown (j_32.ts:109, :163) are not racy. The page renders nothing until the lead and the owners list have both loaded (web/src/modules/front-office/sales/lead-page.tsx:92). `mayAssign` (:107) controls the button (:152). W3 also requires a real 403.
* Weak but not false: W2's `at is not null` (j_32.ts:100) is always true. "When" is shown instead by the `<time>` element in every history line, and the local output shows the times.

**3. Are the other clauses still proven on this head? Yes.**
* Lands in Unassigned: W1 (j_32.ts:89) and W6.
* Take records who and when: W5 (j_32.ts:131) reads "Case officer (Sample) took it" with a time (j32-local-a.txt).
* Reassign records who and when: W2 (j_32.ts:99-100) checks the screen and the audit line (who, to whom, from nobody). W4 (j_32.ts:120) shows both lines, oldest first.
* A person without the key cannot reassign: W3 (j_32.ts:107-109) shows no `[data-assign-open]` and a real POST returning 403, with the owner unchanged.
* The pack is green in ci 44868461971: check_fo10_assignment 42/42 (shard 14), check_fo10p2_sharing, check_fo4as_assign_browser and check_fo2_leads_prospects. None of these suites changed since a66044692. qa's two local re-runs on a28b9c4f3: j_32 11/11, check_fo10_assignment 42/42, check_fo10p2_sharing 37/37.

**4. QA-619 and QA-620.**
* **QA-619: close it once the GitHub walk passes.** The step it asked for exists and matches its Expected (BUGS.md:272). The walk also waits for the owner history on the rule-placed lead (j_32.ts:161). Its last condition is the walks.yml runs on main, which have not run yet.
* **QA-620: still open, and Minor is correct.** The owner history still shows a rule-placed lead as "Arrived" only (web/src/modules/front-office/sales/lead-owner.tsx:78). The audit summary names the owner as "staff <uuid>" (sales/arrival.ts:55, used at :128). This is beyond the Done when, which asks for who and when only on take and reassign.

## Findings (new)
1. **Evidence · Minor.** QA-620's evidence lines are wrong. BUGS.md:273 cites `arrival.ts:306, :309`, but sales/arrival.ts has 136 lines, both here and at a66044692. The right lines are arrival.ts:51-56 (`placedWords`; "staff ${p.ownerStaffId}" at :55) and :128. Fix the row's references. The previous reader-verdict.md also has wrong line numbers ("arrival.ts:370 → place.ts:187"), but it is a record and stays as written.
2. **Evidence · Nit.** The command in ci-44868461971.md (`git diff --name-only 4e745220c a28b9c4f3 -- prototype/`) uses a path relative to the problem folder. Run from the repo root, it lists nothing. The claim is true when checked with the full path (see Tree match above). The full path should be written.
3. **Test strength · Minor (goes with QA-620).** W7 only waits for `[data-owner-history]` (j_32.ts:161) and never reads its text. When QA-620 is fixed, the walk should assert the line, e.g. "assigned to <Case Officer> by the rule", so that a regression shows on screens.
4. **Note, not a defect.** Both local runs used the same kept copy: run b's lead is L-00008 (j32-local-b.txt). The upsert keeps the second rule save working (rules.ts:152-156), so this also shows that a re-run passes. It does not show two runs on fresh copies. The GitHub walk will be a fresh copy.

## What I could not check
* The walks.yml run of j_32 (gate A): not run yet. I also could not see whether #2719's own PR run of journeys (walks.yml runs on a PR that changes `tests/journeys/**`) took place or what it returned.
* The CI job logs, the shard assignment and the job ids in ci-44868461971.md: taken as written. Only shard 14's log was quoted.
* The local outputs (j32-local-a/b, check_*-a/b): read, not reproduced. The screenshots under screens/J-32/screenshots: not opened.
* How the web form renders the service picker for a service with no combination: inferred only from W7's PASS line ("Sample service (J-32)" shown in the row).
