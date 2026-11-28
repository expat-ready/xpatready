# Review: R1.96 part 2, payment plans, ledger only (API and an add-only migration)

PR #3721 · reviewed head `ceb41501ff15aa3eb08bf3251ba184cbe87b705e` · reviewer: fresh session, did not build it · 25 Nov 2026, 14:0x IST.
Read: `design/briefs/R1.96-shape.md` part 2, BACKLOG FO-7p and the FO-7s4p note, the PR body and its "Rules settled:" list, the
diff (`git diff origin/main...ceb41501f`), part 1's `write-offs/write-off.ts` and `ledger-check.ts`, `money_invoice_due` (FO-7ts),
PF-12's walls, FO-7ts part 3's xr_wall_reader hand-off, `ports/client-money.ts` (`words()`, `WriteOffIn`).
Ran the check on a `git worktree` of the exact head, its own Prisma client, own scratch DBs on 127.0.0.1:54329 (never :4400):
`check_r196_plans.ts` **22/22, exit 0, 11 s**. Also green at this head: `check_pf12_walls` 110, `check_fo7a_money_schema` 122,
`check_prisma_schema` 8, `check_pf8b_f7_data_walls` 17, `check_pf8b_f4_migrations` 9, `check_fo7lk_lock_order` 16,
`check_features_registry` 27. Then 16 mutation runs (one rule removed each) and two break-it scripts of my own (scratchpad only).
The PR head has since moved to `b5eb87699`: `545650f42` renames the migration folder (R100, no content change) and the breaker's
report is added. This verdict is for `ceb41501f`; the next round is diff-only.

No screen in this part (FO-7s4 owns the plan dialog), so the BIC table, browser, keyboard, widths and zoom are N/A.

**Verdict: Rework (2 Major, 0 Blocker).** Journey score (API journey): **8.0 / 10, pass** (`journey-test-reviewer-2026-11-25.md`).

## What holds (evidence)
* **Exact sum at the API and at commit.** 1 cent short or over → 409 SUM_MISMATCH with `differenceMinor` ±1 and "add/remove CAD 0.01".
  In SQL as `xr_app` with firm A's session: `SET CONSTRAINTS ALL IMMEDIATE` with a short sum, or the plan alone → refused; a plan
  cancelled in its own transaction with 0 instalments → refused at commit; instalments added after the cancel, or in a later
  transaction → refused (`created_at = now()` gate, migration:114); `ALTER TABLE … DISABLE TRIGGER` → "must be owner";
  `session_replication_role` → permission denied. Given `amount_minor 1`, a 2020 `created_at`, `status CANCELLED` → reset to the due,
  now(), ACTIVE. Firm B's invoice from A's session → "no such invoice in this firm"; a firm-B row → RLS; A reads 0 of B's plans.
* **One ACTIVE plan:** a second by SQL → `money_payment_plan_one_active`; two API plans at once → one 201, one PLAN_EXISTS; revive
  or re-cancel → refused; two cancels at once → one 200, one 409 NO_PLAN, one audit line.
* **Lock order and races:** `lock()` (plan.ts:134-140) is part 1's: party trust lock, then the invoice `for update`; the trigger
  re-reads the due under the same lock. Plan vs payment ×6 and plan vs credit note ×4 at once → 201+201 or 409 SUM_MISMATCH+201,
  every invoice balanced, every plan's amount = its instalments.
* **C5 and keys:** a Case Officer holding `agent/invoice:issue` and `:show` but seeing no case or client → 404 on make, read and
  cancel, nothing written (my probe A1); no key 403, no session 401, firm B 404. Keys as the FO-7s4p note.
* **Migration:** add-only (two tables, one enum, five functions); every function `SECURITY DEFINER`, owner `xr_wall_reader`,
  `search_path` pinned, inside the GRANT/REVOKE CREATE pair as FO-7ts part 3; both tables ENABLE+FORCE RLS with `pf12_firm` and the
  `0_pf12_firm_first` gate; the header's rollback lines run clean on a migrated scratch DB and leave no function or table behind.
* **Audit:** `invoice.plan_created` (amount, count) and `invoice.plan_cancelled` (reason) with actor `staff:<id>`, in the transaction.
* **Settlement** is derived from `money_invoice_due` and capped: overpaid → both Settled at the plan amount; payments settle in order.

## Dimensions (1-5)
D1 Requirement fit 4: FO-7p's ledger rules and the shape's part 2 met; "settled" wider than the shape's "payments in order" (m1) ·
D2 Data integrity 5: no way found to break the sum, the one-ACTIVE rule, the walls or insert-only · D3 Reuse 3: lock, scope, error
mapping reused, but not the house reason rule `words()` (M1) · D4 Rule integrity 4: every rule held in the database too, past dates
API-only (m4) · D5 Stability 3: a lone surrogate or NUL reason is a 500 (M1) · D6 Governance 4: audit who, what, why; view lacks
`cancelledAt` (m3) · D7 AI N/A · D8, D9, D12-D14 N/A (no screen) · D10 Language 4: refusals plain and say "Nothing was saved.";
newline gets the hidden-characters text (m6) · D11 Feedback 3: cancelled plans' instalments still read Due/Overdue; no due or
uncovered figure (m2, m3) · D15 Speed 5: GET 19 ms, POST 41 ms, no per-row queries · D16 Testability 2: 13 of 16 rules removed
one at a time leave the check green (M2) · D17, D20 simulated only (no intended user walked it) · D18 Provenance 4: 12 is
Sample, cited to FO-7p · D19 Closure 4: cancel leaves payments as they were; a new plan covers what is still due.

## Issues
1. **Major (Must): a cancel reason with a lone surrogate or a NUL is a 500.** `plan.ts:31` re-implements the reason rule (trim,
   1-200) instead of the house `words("The reason", 200)` (`ports/client-money.ts:90`, used by part 1's `WriteOffIn`, :109), which
   part 1 adopted for this exact bug (its round 1 Major 3). Scenario: plan an invoice, then `POST …/plan/cancel
   {"reason":"Small \ud800 balance"}` → **500** "Internal server error"; `"Client\u0000asked"` → **500**; the plan stays ACTIVE.
   Fix: `CancelIn = z.strictObject({ reason: words("The reason", 200) })` (export `words`, or put `CancelIn` in
   `ports/client-money.ts` next to `WriteOffIn`), and P6 fail cases for both characters.
2. **Major (Must): most rules' tests stay green when the rule is removed** (STANDARDS §3.10, skill check 5; the test header says
   "Each rule a pass and a fail"). Removed one at a time, each left `check_r196_plans.ts` at **22/22**: C5 `invoiceInScope` on all
   three routes (plan.ts:63, 83, 91); in the commit trigger the 2-12 count and the 1..n positions (migration:134) and rising dates
   (:137); the instalment's currency (:117) and the plan's (:71); "only an ACTIVE plan takes instalments" (:114); nothing due
   (:75); the one-ACTIVE index (:38); the cancel audit line (plan.ts:98); the cancel reason's text check (plan.ts:94). Only the sum,
   the late-insert gate and the draft refusal are proved at the database. Fix: in P4 one SQL fail each (1 instalment, positions
   1 and 3, falling dates, a USD instalment, a cancelled plan, a fully paid invoice, a second ACTIVE plan); a C5 fail like part 1's
   WO10 for make, read and cancel; an audit count after cancel; an RTL-override reason → 422.
3. Minor (Should): "Settled" counts credit notes and write-offs, not only payments (plan.ts:7-8, 108). The shape (line 32) says
   "payments in order". A 300.00 credit note on a 1,000.00 plan with nothing paid → instalment 1 "Settled". Get the tech lead's
   ruling on the reading (or change the code) and add one credit-note case to P5.
4. Minor (Should): the plan can stop covering what is due. Pay 100.00, plan 900.00, refund the 100.00 → due 1,000.00, unsettled
   instalments 900.00, and GET has no due or uncovered field (plan.ts:105-111). Add `dueMinor` to the view, or say so on the PR.
5. Minor (Should): a CANCELLED plan's instalments still read "Due"/"Overdue" (plan.ts:110; probe A12), and the view has no
   `cancelledAt` or `createdAt`. A plan that is cancelled has no instalment due any more.
6. Minor (Should): the database accepts past-dated instalments (probe D17: 2001 dates commit). "Today or later" is API-only
   (plan.ts:58). Say so in the migration header, or add the check.
7. Minor (Should): the body rules run before C5. An unseeing officer posting a past date gets 422, not 404 (plan.ts:56-63 vs
   CS-MV2 "404 before any lock, body rule"). It leaks nothing, since the answer is the same for any id, and part 1 does the same
   (write-off.ts:37).
8. Minor (Should): a newline or tab gets "no hidden or direction-changing characters", and a zero-width space is stored
   (plan.ts:94). Issue 1's fix gives "One line, no tabs" for the first case.
9. Minor (Should): the test's words overclaim. P4 "a given 1 is replaced" gives no 1 (check_r196_plans.ts:150-152). P5's "nothing
   is stored as paid" is asserted only by `insts() >= 3` (:161).
10. Minor (Should): the contract lives in the API (`PlanIn`, `CancelIn`, `PlanView` in plan.ts:32-39), not in
   `ports/client-money.ts` (STANDARDS §6 contract first). FO-7s4p's dialog will need it. The shape's touch list leaves ports out,
   so record where it goes.
11. Minor: `graph.mjs`: the three plan routes show `testedBy: []` (G3), because the graph does not resolve the `raw()` helper's
   base. Part 1's write-off route shows the same. Part 3's j_96 should name them.

The "today" and "Overdue" day is UTC (`facts.ts:14`), as in the rest of the money module. That is not a finding of this part.

## Could not check
A card webhook payment racing a plan (no Stripe in scope). `check_aud1a_insert_only` (needs an isolated app copy; the builder
reports 42 green). A real user's walk (D17/D20 stay with the founder).

**Verdict: Block** — fix 1 and 2. Minors 3-11: fix them or list them in the PR.

Reviewer: Block ceb41501ff15aa3eb08bf3251ba184cbe87b705e

## Round 2 (diff only: `git diff ceb41501f..d3ccb560b`)
Head `d3ccb560b7bfd2e5a11b2fc55825b687d55c58f5`. `545650f42` is a pure rename (R100) to `20261125120000_client-money__r196_payment_plans`.
`b5eb87699` adds the breaker's report. `d3ccb560b` holds the fixes (plan.ts, ports/client-money.ts, the migration's
`money_instalment_write`, the check). I ran a new worktree of the exact head with its own Prisma client and scratch DBs on 54329.
* `check_r196_plans.ts` **38/38, exit 0, run twice**. Also green: `check_fo7b_invoices` 108, `check_fo7b_refunds` 29,
  `check_fo7g3_bill_to` 30 (all three import the ports file), `check_r196_write_offs` 40, `check_pf12_walls` 110,
  `check_fo7a_money_schema` 122, `check_fo7lk_lock_order` 16, `check_features_registry` 27, `check_prisma_schema` 8.
  `tsc --noEmit` reports nothing in the changed files.
* **M1 closed.** `PlanCancelIn = { reason: words("The reason", 200) }` and `PlanIn` (`day`, `whole(…, 1, MINOR_MAX)`) are in
  `ports/client-money.ts` beside `WriteOffIn`. P6 sends a lone surrogate, a NUL, a line break and a zero-width-only reason, and
  each gets 422 on `reason` ("One line…" for the break), never 500, with the plan left ACTIVE.
* **M2 closed.** I repeated the mutations at this head, removing one rule at a time. **All 22 runs turn the check red.**
  * Database (12): the count, positions 1..n, rising dates, the sum, the instalment's and the plan's currency, ACTIVE-only
    instalments, the late-insert gate, nothing due, the one-ACTIVE index, the new past-date rule, and the draft rule.
  * API (10): C5 removed separately from make, from read and from cancel; the cancel audit line; the cancel text check;
    `words()` put back to trim-only; the API sum; the API past date; "Cancelled"; `uncoveredMinor`.
* **Minors.**
  * 4 fixed: `dueNowMinor` and `uncoveredMinor` are in the view, tested after a refund of the pre-plan payment (100.00 uncovered).
  * 5 fixed: a cancelled plan reads "Settled,Cancelled,Cancelled" and has `cancelledAt`.
  * 6 fixed: `money_instalment_write` refuses a due date before the UTC day, the same day the API uses (migration:120-123).
    One edge: a request that crosses UTC midnight between the API's day and the transaction's `now()` gets 409 MONEY_RULE, not a 500.
  * 8 fixed: the line-break wording. A zero-width space inside visible text is still stored; this is the shared
    `money_text_ok` (breaker m6) and not this part's to change.
  * 9 and 10 fixed: the test labels; the inputs are in ports. `PlanView` stays a TS type in plan.ts, which is acceptable for an API part.
  * 3 open: asked of the Lead on the PR.
  * 7 and 11 open: unchanged, and stay listed as before.
* New Minor 12 (Should): the new database rows in P4 share one invoice (`i7`) and assert `plans7() === 0`. When one rule is missing,
  every later row and the exact pass fail too (e.g. removing the count rule fails 12 rows). Detection is right, but the report
  names more rules than are broken. Give each row its own invoice (check_r196_plans.ts:160-175).

No Blocker or Major is open. Minors 3, 7, 11 and 12: fix them or list them in the PR.

**Verdict: Ship (Approve).**

Reviewer: Approve d3ccb560b7bfd2e5a11b2fc55825b687d55c58f5
