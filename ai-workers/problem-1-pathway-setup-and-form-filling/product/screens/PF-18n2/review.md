# PF-18n part 2: independent review (PR #3289)

**Head reviewed:** `c97b85ca34d04c7a55ecbad8240885a977027814` (branch `claude/screens-pf18n2-lead-notices`, draft). **Diff:** `git diff origin/main...HEAD` (6201f2f39..c97b85ca3).
**Reviewer:** a fresh session that did not build this row, 23 Nov. US$0, live AI off. No code was edited.
**Scope:** back-end row, no screen. It serves `screens/PF-18ns/concept.md` §0 M-1..M-4 and challenge M2 (at dce37c249, PR #3279), and Lead 10's Done when on #3279.
**Not reviewed:** uncommitted edits that appeared in the working tree during this review: 30 added lines in `tests/check_pf18n2_lead_notices.ts` ("break report (r1)"). Only the commit counts.
**Skill verdict:** Ship after fixes. Journey score **8.5/10** (`journey-test-reviewer-2026-11-23.md`).

## What I ran
* `check_pf18n2_lead_notices.ts`: **24 passed, 0 failed**. `check_pf18n_notifications.ts`: 34/34. `check_fo10_assignment.ts`: 42/42.
* `typecheck.mjs`: PASS. No new type errors: api has 15 known, web has 0.
* `module-cards.py tree`: PASS.
* **`module-cards.py pr`: FAIL**, and GitHub's `module-cards` check on c97b85ca3 is also a failure (M2).
* **Walls.** An isolated copy on :4445 (screens ports, `PLATFORM_IDENTITY=local`), where the API runs as `xr_app`:
  * the public web form, with a rule to O, gave O 1 row, and a repeat post gave no second row;
  * Assign R→T gave T 1 row, labelled "Walk Sample (L-00001)", with link `/front-office/leads/<id>` and zone America/Toronto. Opening it marked it read; the count went 1→0;
  * a reassign T→O with everyone-sees-all off: T's row has `label` and `link` null, the body never contains the name, and T's GET is 404;
  * O cannot see T's row, and marking it read is 404.
  * The copy is stopped and its database dropped.
* `graph.mjs`: G3 lists `GET /platform/me/notifications/items` (also on main: the tool misses `/api/...` calls, the same tool limit PF-18n1's review noted). The new suite calls the controller directly.

## Asked checks
* **Who is notified.** Correct in every case.
  * Rule placement: `arrival.ts:143`, `owner && !a.ownerStaffId`.
  * One-user firm: the same line, since the owner comes from X-4. **Not tested** (m7).
  * Manual add: not notified, because `ownerStaffId` is the adder.
  * Assign: `leads.ts:195`. Assign to self: skipped. A refused Assign: the 409 or 422 is raised before the notify, in the locked transaction.
  * Booking host: **never told**. `booking/runtime-ports.ts:19` builds `PrismaArrival` without a port (m1).
  * Every notify runs on `tx`. In Assign it runs before the audit line (`leads.ts:257`).
* **`withFirm` inside a request.**
  * `withFirm` changes only the async-local firm that `notify` reads. Its queries run on the transaction's connection, which keeps the firm it opened with (`firm-scope.ts:53-54`, `WalledPool.connect`).
  * So under `xr_app`, a firm mismatch is refused by the walls and rolls back. It can never write into another firm.
  * It sets no bypass and keeps `route`. Both callers pass the scope's own firm: `ctx.firmId`, or the door's resolved `a.firmId`.
  * The residual risk is m6.
* **Labels.** `LeadNotificationLabels.of` is `visibilityOf` + `sees`, with an inactive owner counted as Unassigned. This is exactly `leads.ts` `visible` (lines 109-118).
  * It is checked by DW3: reassigned-away is null, the new owner is named, a deactivated owner is named again for a view.all holder.
  * The breaker's table of seven cases agrees with GET leads/:id in every case.
  * The words are name + number only; no email, phone or note.
  * A labeller failure is logged by kind only.
  * One query per kind, so no N+1.
* **Fences.** `platform/notifications/labels.ts` imports only `ports/` and `identity/keys`, and `store.ts` adds no import. The platform imports nothing from the front office; the front office registers into the platform, as the find door does.
* **Answer shape.** The change is additive: `label` on each item and `zone` at the top level. `web/src` has no reader of `me/notifications/items`. Home reads `needs-you` (unchanged) and `:id/read`. The PF-18n part 1 suite is updated for `label`.
* **Push-guard alias.** `NOTIFICATION_PORT as NOTES` (`front-office-sales.ts:19`) avoids the guard's `token: <16+ chars>` secret pattern (`push-guard.sh:16`). It is commented and harmless. The name is terse, but it is not a finding.

## Issues (ranked)
1. **M1 Major (Must). DW5's rollback line cannot fail.**
   * In `arrive`, the audit line is written first (`arrival.ts:132`), and `tellAssigned` comes later (`:143`). With the broken audit the test injects (`check_pf18n2_lead_notices.ts:164`), the notify never runs.
   * So the line passes even if `notify` wrote outside the transaction. This breaks STANDARDS §7 [M] "a rule's test fails when the rule is removed".
   * Fix: fail *after* the notify, then assert 0 rows and the owner unchanged. Either use Assign with the broken audit (`change()` audits after `fn`), or a port that notifies and then throws.
2. **M2 Major (Must). CI red at this head: `module-cards`.**
   * `api/src/features/` changed (2 files), but its card was not updated, and the body has no `Card unchanged:` (STANDARDS §7 [M], P-615 (3)).
   * Fix: add a `features/MODULE.rows/PF-18n2.md`, or a `Card unchanged: <reason>` line.
3. **m1 Minor (Must, words only). The card and comment claim a booking host is told.**
   * `front-office/MODULE.rows/PF-18n2.md` ("booking-host") and `arrival.ts:140-141` say so, but the booking door passes no port.
   * The PR body correctly lists it as "Not in this PR", and Lead 10's Done when names only rule and hand. That is why I rate it Minor, not the breaker's Major.
   * Fix: correct the card and comment, and record the follow-up row. A staff booking where the host is the booker must not notify.
4. **m2 Minor (Should). A long valid name drops the label and the link for the lead's owner.**
   * `labels.ts:38` caps labels at 200 characters. Names of 100 + 100 characters plus " (L-00002)" reach 211.
   * Seen on :4445: O's row had `label` and `link` null, while O's GET answered 200.
   * Fix: shorten the name part in the labeller and keep the number.
5. **m3 Minor (Should, latent). The labeller does not require `agent/prospect:show`**, the key GET leads/:id asks for (`sales/routes.ts:82`). All six roles hold it today.
6. **m4 Minor (Should). `PAGE` (`labels.ts:17`) accepts protocol-relative links (`//host/x`)**, against its own "never an outside link" comment. Fix: `/^\/(?!\/)…/`.
7. **m5 Minor (Should, latent). Case items are labelled without the reader's case scope.**
   * The case link predates this PR, but the new `NotificationView` comment says "null when the reader may no longer open it". That is true for leads only.
   * Fix: reword the comment, or filter by `caseScope`.
8. **m6 Minor (Should). `tellAssigned` silently overrides an in-scope firm.**
   * Outside the walls (suites, owner-role tools) it writes firm A from a firm-B scope, which the breaker probed.
   * Fix: if `currentFirm()` is set and differs, throw; otherwise `withFirm`.
9. **m7 Minor (Should). The one-user-firm notice has no pass test.** The suite even adds a helper to firm B to avoid that case (`:70`).

## Dimensions (D1-D20; back end, no screen)
| D | Score | Evidence |
|---|---|---|
| D1 | 4 | M-1..M-4 met for rule and hand. The booking-host claim is false (m1) |
| D2 | 4 | One row per lead (unique upsert); a repeat post or refused Assign adds none. m2's null label |
| D3 | 5 | One visibility rule, reused; registry as the find door |
| D4 | 4 | Label visibility resolves exactly as GET leads/:id (DW3; breaker's 7 cases) |
| D5 | 4 | The rollback is right (breaker's throwing-port probe); its test is vacuous (M1) |
| D6, D7 | N/A | No content values, no AI |
| D8, D9, D12-D14 | N/A | No screen (PF-18ns) |
| D10 | 4 | Labels read "Walk Sample (L-00001)": no ids or jargon |
| D11 | 4 | `readAt`, the count and `zone` answered |
| D15 | 5 | List 13-37 ms and Assign 47 ms on :4445; no per-row query |
| D16 | 3 | Pass and fail tests for DW1-DW4 and DW6; DW5 vacuous (M1); one-user firm untested (m7) |
| D17, D20 | simulated only | No intended user walked it |
| D18 | 4 | The label and link come from the record on read; nothing is stored stale |
| D19 | 3 | The back end closes M-1..M-4. The bell (PF-18ns) and the booking door are not done |

**Scorecard BIC-01..20:** N/A. This is a platform back-end row, outside the case-side §6 scope (concept §4c).

## Could not check
* The browser, axe and keyboard: there is no screen.
* An intended user's walk (D17, D20).
* The full CI suite: the PR is draft, so only guard and module-cards ran.

**Verdict: Block**: 2 Majors open, and both are small fixes. On the skill's scale this is "Ship after fixes". Fix M1 and M2 to approve; m1 is words only and should go in the same push. m2-m7 should be fixed or answered in the PR.
