# R1.32 reader verdict (P-303), main a66044692, 21 Nov

Fresh reader; read only, ran nothing. S = `prototype/studio`. Verified: `git diff --stat 933615d7f a66044692 -- prototype` is empty, so ci 44858269013 (the #2622 merge batch) ran main's head studio tree. Its shard table (ci-44858269013.md) and qa's local re-runs (42/42, 37/37 twice; J-32 8/8 twice) were read, not re-run.

**Verdict: Partial.** The pack is green on GitHub for all five clauses. What holds it is gate A (P-317): no walk by screens shows clause 1, and J-32 has no walks.yml run on main's head.

## Clause by clause

| # | Clause | Pack (GitHub ci 44858269013) | Walk by screens (J-32) | Holds? |
|---|---|---|---|---|
| 1 | A new lead follows the rule | Yes. check_fo10_assignment.ts (shard 14): round robin in turn :239-240; 20 parallel :246-248; service beats door :267-269; booking rule :280. check_fo10p2_sharing.ts (shard 5): the sharing setting as default rule :134-145; booking host :115. All go through the one arrival path (arrival.ts:370 → place.ts:187) | **No.** j_32.ts:3 still says "no assignment rule yet: FO-10, #2476, adds 'follows the rule'". No step sets a rule or shows a rule-placed lead | **No (gate A)** |
| 2 | ... or lands in Unassigned | Yes: no rule :218-220; inactive owner :281-283; nobody eligible :262-263; rule off :288; possible match (p2) :105 | Yes: W1 j_32.ts:77-82 (Unassigned list, owner Nobody, DB owner null) | Yes, once walks.yml records it |
| 3 | Take records who and when | Yes: check_fo10:322-324 (actor + fromUnassigned; the time is not asserted: the audit `at` column always has one); check_fo4as AS4 :134 (screen "took it") | Yes: W5 j_32.ts:116-124, "<Case Officer> took it" in the owner history, where every line has a `<time>` (lead-owner.tsx:91) | Yes |
| 4 | Reassign records who and when | Yes: check_fo10:318-320 (actor, previous, new, `at`); check_fo4as AS1 :102 (who, whom, a year in the text), AS3 :117, :124 (a stale owner is refused) | Yes: W2 :92-93 (screen + audit line with actor, from nobody, `at`); W4 :113 (both lines, oldest first) | Yes |
| 5 | A person without the key cannot reassign | check_fo10:321 reads only route metadata and the role's keys (no guard call). The real HTTP 403 and the missing button are in check_fo4as AS2 :109 (shard 4, green) | Yes: W3 j_32.ts:100-102 (no `[data-assign-open]` on screen, POST gives 403, owner unchanged) | Yes: screen and server both shown |

## The two named points

**(a) J-32 has no step where a lead follows a rule.** This is what holds R1.32. The rule may be set up through the API (`POST /api/front-office/assignment-rules`, routes.ts:236, with an Owner's token) or `PUT lead-sharing` (routes.ts:252), as other journeys write setup. The clause itself must then show on screens. Example: a web enquiry arrives, the rule's person finds it under Mine with themselves as owner (and not in Unassigned leads), and the DB `lead.created` line carries `assignmentRuleId`. The walk then ends on the lead's page (R1.33's first step).

**(b) No screen lets a firm set rules.** `grep -r "assignment-rules\|lead-sharing" web/src` finds nothing. routes.ts:219-220 and rules.ts:5-6 defer the panel, and the FO-10 row puts it in automation settings (FO-12s / PF-20s, not built). The Done when says "follows the rule", not "a firm sets a rule". Setup a person cannot yet do by screens may go through the API in a walk. So the panel belongs to FO-12s/PF-20s and does **not** hold R1.32. The CAPABILITIES row should say this, so the next scorer does not count it as a gap here.

**Who and when for rule placements:** the Done when asks who and when only for take and reassign. The pack does show the rule on the `lead.created` line (check_fo10:241, :269, :283; the timeline API :284-285). On screen, though, the owner history shows a rule-placed lead only as "Arrived" (lead-owner.tsx:78). It never names the rule or who got the lead. The line's summary names the owner as "staff <uuid>" (arrival.ts:306, :309), and no screen shows it. This is UX, beyond this Done when (see bug 3).

**FO-10c:** none of it is needed by R1.32's Done when. Duplicate goes to the existing owner, least recently assigned, booking host and sharing default are already built in part 2: p2 :105 (a possible match waits in Unassigned, which satisfies "or lands in Unassigned"), :82-98, :115-126, :134-145. FO-10c changes *which* rule applies, not *whether* a rule or Unassigned applies. Skip me, weekly count, reset notice, the duplicate's owner being told, ownerSetBy and notices are all beyond R1.32. One item is close to the edge: "with sharing off a Case Manager cannot reach Reassign". That is a person *with* the key, in one sharing mode. It does not contradict clause 5, and the Done when names no sharing mode, so it does not hold R1.32. Log it as its own bug (bug 4). The FO-10 row's "needs you" item for an inactive rule person is also not built (rules.ts:6). That is beyond R1.32 too ("lands in Unassigned" is met).

## Bugs proposed

1. **Gap · Major · evidence.** J-32 does not show "a new lead follows the rule". Expected: J-32 (or a J-32b) sets a round-robin or one-person rule through the API as setup. It then sends the web form by screens and shows the lead owned by the rule's person on that person's Mine (and absent from Unassigned leads), with the DB `lead.created` line naming the rule, ending on the lead's page. Actual: j_32.ts:3 says no rule exists, and W1-W5 show only Unassigned, Assign, Reassign and Take. The header comment needs updating too.
2. **Gap · Major · evidence (dispatch by the Lead).** Gate A is not recorded on GitHub. Expected: a walks.yml run of J-32 (with bug 1's step) on main's head, with its run id. Actual: only j32-local-a/b (8/8 each, isolated copies here); no walks.yml run on a66044692.
3. **UX · Minor · screens + runtime.** A rule-placed lead does not say on screen who got it or why. Expected: the owner history reads e.g. "Arrived, assigned to <name> by round robin" with its time. Actual: "Arrived" only (lead-owner.tsx:78). The audit summary names the owner as "staff <uuid>" (arrival.ts:306, :309), so it cannot be shown as written. This is beyond R1.32's Done when. It fits the FO-10 row's own "every assignment on the timeline with its rule", which today only the API shows.
4. **Bug · Major · screens/runtime (already in FO-10c).** With sharing off, a Case Manager who holds `agent/prospect:assign` cannot reach Reassign on a lead someone else owns. Expected: the assigner can open and reassign any lead of the firm. Actual: per the FO-2 finding quoted in FO-10c, the lead is out of their reach. check_fo4as AS7 :201 covers only assigning away from a lead they can already see. Does not hold R1.32.
5. **Minor · evidence (test strength).** check_fo10:321 proves clause 5 by metadata only, and :324 asserts no time for Take. Expected: the pack itself makes one real guarded call (403) and checks the take line's `at`. Actual: the real 403 is only in check_fo4as AS2 and J-32 W3, and the take's time is shown only because the `<time>` element is always there. Does not hold R1.32, because check_fo4as is in the same green run.

## What turns Partial into Works

Bug 1 added to J-32, then bug 2: a green walks.yml run of J-32 on main's head with its run id, ending on the lead's page (R1.33). No product code change is needed for the Done when.
