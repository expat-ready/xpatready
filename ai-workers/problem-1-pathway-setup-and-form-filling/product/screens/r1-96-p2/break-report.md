# R1.96 part 2: break report (payment plans: money and schema, API only)

PR #3721, exact head `ceb41501f`. The shared checkout moved to `545650f42` while I worked (it renames the migration folder,
nothing else), so I tested a `git archive` of `ceb41501f`. I used scratch databases on 127.0.0.1:54329 and dropped them afterwards. The Nest app
is built the way `tests/check_r196_plans.ts` builds it, plus the write-off and reversal features. Never :4400. US$0. The probe file is
`…/scratchpad/breaker2/src/…/studio/tests/brk_plans.ts`, outside the repo; logs are `run2.log` to `run4.log`. The PR's own check passes 22/22.
SQL probes ran twice: as `xr_app` with `app.firm_id` set, and as the owner `xr_studio`, a superuser.

## Findings

No Blocker and no Major. Every money invariant held under every attack below. The findings are about what the derived view
claims and how the edges behave.

**m1 (Minor): "Settled" counts money nobody paid, which departs from the brief.** The brief (`design/briefs/R1.96-shape.md:32`) says
an instalment is "paid by derivation (payments in order)". The code (`plan.ts:108`, explained at `plan.ts:7-8`) instead settles with
`plan amount − money_invoice_due now`, so credit notes, write-offs and uncleared cheques all count as settled.
Repros: issue 1,000.00, pay 100.00, plan 450.00 + 450.00, then a write-off (F6) → `settledMinor 90000`, both "Settled", though
nothing was paid after the plan; a 450.00 credit note (F5), or a 450.00 CHEQUE not yet cleared (F9) → instalment 1 "Settled".
It never claims more than the plan's amount (capped). It is never inconsistent with the invoice's own due. Either the brief or the
code should change, with the words made to match ("Settled" against "Paid").

**m2 (Minor): the plan silently stops covering what is due when due goes up.** Sum-equals-due holds only at creation. Nothing
says so later, and GET has no due or uncovered field.
Repro (F11): issue 1,000.00, pay 100.00, plan 450.00 + 450.00 (201), refund the 100.00 pre-plan payment (201). The invoice now has
1,000.00 due, but the ACTIVE plan schedules only 900.00. A new plan is refused with 409 PLAN_EXISTS until someone cancels the old one.
A related case (F2): pay 450.00 after the plan, then refund the 100.00 pre-plan payment. Instalment 1 reads "Part settled
350.00/450.00", even though 450.00 was paid after the plan. The remaining amount equals due, so it is consistent, but it is easy to misread.

**m3 (Minor): the database lets an instalment be due in the past.** `money_payment_plan_sums` (migration L126-145) checks count,
positions, rising dates and the sum, but not "today or later". Only the API checks that (`plan.ts:58`).
Repro (S5c), as `xr_app` and as the owner: `with p as (insert into money_payment_plan (firm_id, invoice_id, currency, created_by)
values (A, inv, 'CAD', 'x') returning id, firm_id) insert into money_instalment … values (1,'2020-01-01',15000),(2,'2020-02-01',15000)`.
It commits, and GET shows both instalments "Overdue". The migration header and the PR text call this out as a database rule for the other
checks, so this is a gap rather than a lie. Either add `due_date >= (created_at at time zone 'UTC')::date` or say it is API-only.

**m4 (Minor): "today" and "Overdue" use the UTC day, not the firm's.** `today = dayOf(clock.now())` (`facts.ts:14`, `plan.ts:55`).
Repro (E1, E2, E3) with the clock at `<tomorrow>T00:00:01Z`, which is 19:00 on today's date in Toronto: a plan whose first instalment is due
on Toronto-today gets 422 "An instalment is due today or later". A plan made at 23:59:59Z with instalment 1 due today shows
"Overdue" 2 seconds later, at 19:00 local time. This matches the rest of the money module's convention (it is pre-existing), but here it
becomes visible every evening.

**m5 (Minor): a nested `__proto__` is silently accepted.** The top-level rule refuses it (`drafts.ts:35`). Inside an instalment it
slips past `strictObject`.
Repro (B2): raw body `{"instalments":[{"dueDate":"<+1d>","amountMinor":50000,"__proto__":{"x":1}},{"dueDate":"<+31d>","amountMinor":50000}]}`
→ 201. It does no harm, because only the known keys are written, but it is inconsistent with the "never a field of ours" rule.

**m6 (Minor): a cancel reason containing a zero-width space is stored, although the error text promises no hidden characters.**
Repro (B14): `POST …/plan/cancel {"reason":"a​b"}` → 200. The stored bytes are `61 e2808b 62`. `"‮evil"` is refused with the message
"…with no hidden or direction-changing characters" (`plan.ts:94`). The shared `money_text_ok` only requires something visible, so
this is inherited, but the plan route's wording overclaims.

## What held (attempt → result)

* **Wrong sum, through the API:** 1 cent short or over → 409 SUM_MISMATCH with ±1 difference. Negative + overshoot, 0, -1, 1.5, 1e9+1, 1e300,
  2^53 and `"50000"` → 422 each.
* **Wrong sum, in SQL (app and owner):**
  * `SET CONSTRAINTS ALL IMMEDIATE` first; IMMEDIATE then DEFERRED; a savepoint, then IMMEDIATE raising, then `ROLLBACK TO` (the
    event is re-fired at commit) → refused.
  * An exact plan checked IMMEDIATE, then a 3rd instalment added in the same transaction (both modes) → refused at commit.
  * Two plans on two invoices in one transaction, instalments cross-attached so the totals line up (S16b) → refused.
  * Switching `app.firm_id` to firm B before commit → the sum check still fires and refuses.
* **Positions and dates:** a gap (1,3), (2,3), 13, 0, a duplicate position, 1 instalment, 0 instalments → refused. A duplicate date or
  falling dates → refused. 30 Feb, 29 Feb 2027, 13th month, 31 Nov, ISO datetime, leading space, full-width digits, `+02027`,
  `99999` and a number → 422. 29 Feb 2028 and 9999-12-31 are accepted and stored exactly.
* **Amounts and currency:** 0 or negative → CHECK. 2^31 → integer out of range. An invoice exactly at INT_MAX (21,474,836.47) is planned
  fine over 3 instalments. Larger invoices are refused at issue (TOTAL_TOO_LARGE). A USD plan or instalment on a CAD invoice →
  refused. A USD invoice's plan is USD.
* **Database-set fields:** given `status CANCELLED`, `amount_minor 1` and a 2020 `created_at` → reset to ACTIVE, the due amount, now().
* **Two ACTIVE plans:** none, ever. In one transaction → unique index. 10 races of plan against plan → one 201, one PLAN_EXISTS.
  8 rounds of cancel‖cancel‖plan‖plan → 0 invoices with more than one ACTIVE. Plan, cancel, plan in one transaction is allowed.
* **Cancelling and changing:**
  * Cancel twice → 409 NO_PLAN.
  * Un-cancel, or re-cancel with a new reason (app and owner) → refused. Cancel with an empty reason → CHECK. No reason, blank, bidi,
    201 characters or a number → 422.
  * 200 emoji, and Arabic plus Chinese text → 200, stored whole.
  * UPDATE, DELETE, upsert and late INSERT of an instalment; DELETE of a plan; TRUNCATE → refused.
  * `ALTER TABLE … DISABLE TRIGGER` and `session_replication_role` as `xr_app` → refused. Only the superuser owner with the
    replica role can bypass, which is outside the threat model.
* **Invoice states:** draft → 409 DRAFT. Paid, overpaid (due -100.00), written off and fully credited → 409 NOTHING_DUE, and the same in
  SQL. Part credited → the plan covers exactly the 400.00 left.
* **Races (10-15 each):** plan against a payment or credit note → 201+201 or 409 SUM_MISMATCH+201; against a write-off → 201+201
  or NOTHING_DUE; against cancel → fine. No 500 anywhere; every plan's instalments sum to its amount (0 of about 100 off).
* **Settlement:** in order; capped at the plan's amount when overpaid. A refund of a post-plan payment brings instalments back to
  "Due"; cancelling leaves payments untouched. Reversals don't move due ("invoicesStayPaid"; operating payments → NOT_YET).
* **Walls and keys:**
  * Firm B make/read/cancel → 404. No session → 401. A forged token → 401.
  * A Case Officer without `invoice:issue` → 403 on make and cancel; with `invoice:show` → 200 on GET; without it → 403.
  * C5 (the party's prospect removed) → 404 on all three, and nothing changed.
  * A bad UUID, a zero UUID or a payment id → 404. An uppercase id works.
  * PUT, DELETE or PATCH on `/plan` → 404.
  * In SQL, firm A cannot write an instalment on B's plan (RLS, or "no such plan in this firm"), cannot plan B's invoice, and reads 0
    of B's plans. With no firm set, it reads 0.
* **Body shapes:** top-level `__proto__`, `constructor` and extra fields at the top or nested → 422. An array or text/plain body → 422.
  `null` or broken JSON → 400.
* **Ledger check:** balanced after every scenario and firm-wide for A and B at the end. One audit line per plan write (103 created,
  23 cancelled). Speed: GET averages 16 ms; fifteen 12-instalment plans were all made.

**Verdict: Minor.** No way was found to make a plan's sum wrong, to get two ACTIVE plans, to change or un-cancel a plan, or to cross a wall. m1 (settled ≠ paid, against the brief) and m2 (coverage drifts after due rises) are the ones worth settling before part 3.
