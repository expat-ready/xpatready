# Review: FO-7b part 1c (refunds of operating payments, and the choice on an extra), round 1

Independent reviewer (money row, P-278, P-423), Opus 5.5 at high effort, 22 Nov. **Commit reviewed: `5f49018bf62ef08e5e0cdccee260d5dd50770fc3`** on `claude/runtime-fo7b-1c` (draft PR #3036). Scope: `git diff bb83bcec7..5f49018bf`, which is 6 files and +417 lines. The prompt said 7 files, but the list it gave has 6 and the diff has 6.
Spec: `design/briefs/track-b/FO-7b-1c.md` (branch `lead-b/2026-11-22-track-b`), Lead B's comment 7077723592, and the builder's alignment comment 7077742708. Supporting sources: AG-6-23 and AG-6-21 (AG-06 v2.1); `money_refund_write` (FO-7a); `money_credit_entry_write`, `money_refund_credit_kept` and `money_credit_kept_holds` (FO-7ts); `money_trust_lock` (FO-7lk); part 1b's `record()` and `paymentView()`.
This row is API only, so there is no browser walk and no journey score (the coordinator's instruction).

**Branch switch.** For about 10 minutes the shared checkout was switched to part 1b's branch (builder's notice, about 10:45-10:55 UTC). So every result below was run again on a `git archive` copy of exactly 5f49018bf in `/tmp/fo7b1c-exact`. Results: the check passed 21/21 and the reviewer probes gave the same answers. The four source files I read are byte-identical to that commit (`cmp`). The checkout's HEAD is now `4e49b08b8`, which only adds the breaker's `break-report.md`.

## Runs
- `tsx studio/tests/check_fo7b_refunds.ts` gives **21 passed, 0 failed**, both on the shared checkout and on the exact-commit copy.
- `check_fo7lk_lock_order.ts` gives 16/0, and `check_pf12_walls.ts` gives 110/0.
- `tsc -p api/tsconfig.json --noEmit`: no errors in the new files. The errors it does report are older ones in other tests.
- Reviewer probes (P1-P8) run on a copy of the check under `/tmp`, on a scratch database on :54329 that was dropped afterwards. Results are cited below.
- CI on 5f49018bf: **`module-cards` failed** (see Minor 8). Most other jobs were skipped because the PR is a draft, so "full `ci` green" has not been shown yet.

## Blocker
None.

## Major
1. **A Refund choice whose idempotency key was already used by a plain refund answers as if the extra had been refunded. Nothing was refunded from the extra.** (`api/src/client-money/invoices/refunds.ts:60-63`)
   - Probe P4: an invoice of 100.00 and a payment of 120.00, so 20.00 is extra. `POST …/refunds {amountMinor: 500, key K, reason "Plain (Sample)"}` gives 201. Then `POST …/extra {choice: "REFUND", key K, same reason}` gives **201** `{choice: "REFUND", amountMinor: 500, waitingMinor: 1500}`.
   - So a money write reports a success that did not happen: the extra is still waiting. The breaker found the same thing independently (F1).
   - The brief's Done-when line says "the same idempotency key … with other data (409)". This earlier refund has other data: it was not taken from the extra, and it is not for the amount that was waiting.
   - Cause: the replay compares only `paymentId` and `reason`.
   - **Fix:** a choice replay is valid only when the stored refund was written by a choice. Check its audit line (`detail->>'fromExtra' = 'true'`), and compare method and reference too (see Minor 3). Anything else gives 409 KEY_USED. Add a failing case for this to the check.

## Minor
1. **An uncleared cheque's extra: Keep is refused, but Refund goes through** (`refunds.ts:43-46`, `66-71`).
   - Probe P1: a CHEQUE payment of 130.00 on an invoice of 100.00. Part 1b offers `REFUND, KEEP_AS_CREDIT`.
   - Keep gives 409 MONEY_RULE. That is right, and it is not a 500.
   - A Refund choice gives 201: 30.00 is paid back from a cheque that has not cleared. A plain refund of the same cheque is also allowed.
   - No source settles refunds of money that has not arrived, so this is not a request for a change. Put it to Lead B as "Question for the tech lead". The database refuses `KEPT` for the same reason ("credit is kept only from money that arrived").
2. **The database's refusal loses its reason and its remedy** (`refunds.ts:90`). The regex cuts everything from the first "(", so:
   - The cheque refusal (P1) reads "credit is kept only from money that arrived." It loses "(this cheque is not cleared yet)".
   - A refund after Keep (P2) reads "…must stay paid over by that much." It loses ": reverse the kept credit first".
   - Both still answer 409 and write nothing (P2: no refund row, no audit line, no event). That held.
   - Related: the OVER_REFUND precheck (`refunds.ts:44-45`) ignores kept credit, so its "left to refund" figure can be too high (the breaker's F4).
   - The check has no case that goes down the MONEY_RULE path at all. **Fix:** keep the database's text after the colon, and add the two P1/P2 cases.
3. **A replay ignores a changed method or reference** (`refunds.ts:40`, `62`).
   - Probe P3: the same key with method CASH and reference ZZZ999, after E_TRANSFER and AAA111, gives 200 `replayed: true`. The new method and reference are dropped without a word.
   - Both are stored in the refund's audit line. Part 1b's `record()` refuses a changed method (`money.ts:85`), and the brief's Done-when line says "with other data (409)".
4. **The two routes answer a replay differently** (`refund-routes.ts:18` vs `:21`, `refunds.ts:63`). `/refunds` answers 200 with `replayed: true`. `/extra` answers 201 with no replay flag, so a client cannot tell a replay from a new refund.
5. **Keep as credit with a reason is refused with 422** (`ports/client-money.ts:174`, a `strictObject` with no `reason`). The brief's shape is `{ choice, reason? }`. Either accept an optional reason for Keep (put it in the audit line), or say in the PR why it is refused.
6. **The departure from AG-6-23 r7 is now asserted as a pass** (`tests/check_fo7b_refunds.ts:142-143`).
   - The check asserts "Part paid with 30.00 due again". AG-6-23 r7 says a refund "does not make the invoice due again" (PARTIALLY_REFUNDED).
   - The departure is disclosed on the PR (comment 7077742708, point 2), and it follows the brief: facts.ts stays untouched and the status follows `invoiceStatus`.
   - But neither the row nor the check records a ruling, and the PR body still recommends following r7 (question 2). The Lead should rule on it in writing before the label.
   - Also a gap against AG-6-23 r2: an offline refund records amount, method and reference, but no date. A refund paid on an earlier day is dated the day it is entered.
7. **Check hygiene** (`tests/check_fo7b_refunds.ts`).
   - Every case is named "FO-7c …", and the scratch database is `xr_studio_fo7c_scratch_*` (line 29). FO-7c is the card row; this is FO-7b part 1c.
   - Left over from part 1b: unused imports and helpers (lines 19-25, 59-64, 102-116: `FakeClock`, `runContract`, the contracts, `MoneyDocuments`, `taxOf`, `stored`, `pdfText`, `auditN`, `events`).
   - Also left over: three cases that test no refund rule (lines 39-42 and 95-97).
   - The "one audit line per change" case (line 196) compares totals only. The per-refund count is checked once, at line 140.
8. **The PR body is out of date, and `module-cards` is red on CI.**
   - CI log: "module api-features: … `features/MODULE.md` not … put `Card unchanged: <reason>` in the PR body". Locally, `module-cards.py pr` on this diff gives the same FAIL for `client-money-refunds.ts`.
   - `features/MODULE.md` is not in the touch list, so the fix is a `Card unchanged:` line in the body. No code change is needed.
   - The body also still lists the old routes (`invoices/:id/payments/…`), an `amountMinor` on the choice, and "pending Lead B" cases. Rewrite it before the PR is made non-draft (P-683).

## What held
- **Lock order** (`refunds.ts:94-104`): the payment and invoice are read without a lock, then `money_trust_lock(firm, invoice party, currency)`, then the invoice row `FOR UPDATE`. This is the same as part 1b's `lock()`.
  - The database triggers then take the same advisory lock again (it is re-entrant) and touch only rows that are already locked. `check_fo7lk_lock_order` passes.
  - Two refunds at once, and Keep racing Refund at once: one wins and the other gets 409. Refunded plus kept never goes over the payment.
- **Idempotency** for a plain refund: a replay gives 200 with the same row, and a different amount gives 409 KEY_USED. The key is looked up under the lock. A P2002 on the key or on `refund_ordinal` maps to 409.
- **Over-refund:** 409 OVER_REFUND with `leftMinor`, and nothing written. The database's `money_refund_write` cap stands behind it.
- **Trust:** a payment received into trust is refused with the brief's words, "Money received into trust is refunded from the trust ledger" (TRUST_REFUND). The choice on its extra is refused (TRUST_EXTRA). Nothing is refunded or kept. This follows P-603.
- **The waiting extra** (`refunds.ts:111-120`): the `extraMinor` stored in the payment's one `payment.recorded` audit line, less net kept, less this payment's refunds, capped at `InvoiceView.extraMinor`.
  - That cap is net of all kept credit on the invoice (`facts.ts:37`).
  - Probe P6: after a plain refund of 10.00 out of a 30.00 extra, exactly 20.00 is kept.
  - Probe P7: with two payments on one invoice, when the other payment's extra was used up by a refund, the answer is NOTHING_WAITING.
- **A choice takes exactly what is waiting, once.** An amount sent gives 422. A second Keep or Refund gives 409 NOTHING_WAITING.
- **KEPT on the right holder:** the invoice's person or company and case, in the payment's currency, with `payment_id`. The database's holder check and overpaid cap agree.
- **Permissions:** a REFUND choice needs `agent/refund:create`. The service checks it, and the check proves it with the role's refund key removed (403 MISSING_PERMISSION). `/refunds` carries `agent/refund:create`, and Keep carries `agent/payment:record`. A Case Officer gets 403 (P8).
- **A database refusal is a 409, never a 500** (P1, P2).
- **Audit:** one audit line per refund (`payment.refunded`; it stores method, reference and reason) and one per Keep (`payment.extra_kept`), each with a `staff:<id>` actor. The outbox row `payment.refunded` is written last, and the payment row is never edited (BR-9).
- **Firm walls:** every query is scoped to the session's firm. Firm B gets 404 on both routes, and a malformed id gets 404. `check_pf12_walls` passes.
- **Input:** a hidden-character reason gives 422 at `reason` (`money_text_ok`), an unknown field gives 422, and method CARD gives 422 (`HandMethod`, so OFFLINE only).
- **Touch list:** the brief's six files only. `facts.ts`, `money.ts`, `drafts.ts` and `check_fo7b_invoices.ts` are untouched. `ports/client-money.ts` gets additive lines only (one `MONEY_EVENT` key and new shapes). The route registers in its own `features/client-money-refunds.ts` (P-214), and the row fragment is in `MODULE.rows/FO-7b-1c.md`.
- **Done-when lines:** each has a passing and a failing case, except where noted in Major 1 and Minor 3.
- **Readings** are labelled ("Unconfirmed: no accountant / no counsel", `refunds.ts:12` and the check's header). There are no personal names.

**Verdict: Block** on `5f49018bf62ef08e5e0cdccee260d5dd50770fc3`. To fix: Major 1 (a choice replay must have been written from the extra, otherwise 409, with a failing case). Minors 2, 3, 4, 7 and 8 are cheap to fix in the same round. Minors 1 and 6 go to Lead B as questions.

## Round 2 (diff 5f49018bf..872a2b8b5)

Independent reviewer, Opus 5.5, 22 Nov. **Commit reviewed: `872a2b8b5`** on `claude/runtime-fo7b-1c` (draft PR #3036). This was a diff-only read: `git diff 5f49018bf..872a2b8b5 -- prototype`, 7 files, +134/-70. It holds part 1c's round-1 fixes (`refunds.ts`, `refund-routes.ts`, `ports/client-money.ts`, `check_fo7b_refunds.ts`) and the merge of part 1b's batch fix `2311bc168` (`routes.ts`, `money.ts`, `check_fo7b_invoices.ts`). The row is API only, so there is no browser walk and no journey score.

### Runs
- `check_fo7b_refunds.ts`: **24 passed, 0 failed**.
- `check_fo7b_invoices.ts`: **107 passed, 0 failed**.
- `tsc -p api/tsconfig.json --noEmit`: no errors in any of the 7 files.
- Reviewer probes Q1-Q7 ran on a copy of the check under `/tmp/fo7b1c-r2`. The copy's clock can be shifted, and it used its own scratch database on :54329, which was dropped. Results are cited below.
- Not run: `check_pf28_inputs`, which needs an isolated running copy. The batch's CI run is what proves the #3016 fix.

### The `?dueDate` change (`2311bc168`, for #2953): **Approved**
- **Parse before lookup.** `issue()` now runs `parse(IssueIn, query ?? {})` before `idOf()` and before any read. Probe Q7c: a random UUID with `?dueDate=2026-02-30` gives 422, not 404.
- **The query is strict.** An unknown query field gives 422 and names it, even on a malformed id (the new case). A repeated `?dueDate=a&dueDate=b` gives 422 at `dueDate` (Q7b). An impossible date, or 0000-01-01, gives 422.
- **Nothing else changed.** `@Body` became `@Query`, and the comment on the route is new. Lock, numbering, due-date default and email are untouched. No other caller in `studio/` (web, tests, module cards) sends a body to `/issue`.
- **Note (no fix asked).** A body sent to `/issue` is now ignored without a word. Q7: a body of `{dueDate: +45 days}` gives 200 with the firm's default due date. Nothing sends one today. Word the PR body so that a later screen sends the query.
- Also a nit: the doc line on `IssueIn` (`ports/client-money.ts:87`) still reads as if it described a body.

### Part 1c's fixes, one by one
| Claim | Held? | Pass case | Fail case |
|---|---|---|---|
| `replay()`: one key is one request (route via the audit line's `fromExtra`, payment, amount, reason, method, reference, date) | Yes. The refund lookup is firm-scoped (`firmScope` and the unique index is `(firm_id, idempotency_key)`). It reads the one `payment.refunded` line for that refund in that firm (`entity = 'money_refund'`, `entity_key = refund id`). It runs after the lock. | `again` (200, replayed) | `crossA`, `crossB`, `otherMethod`, `otherRef` (all 409 KEY_USED, nothing written). The date part is proven only by probe Q5: the same date sent again gives 200 replayed; another date gives 409. |
| A replayed choice answers 200 `replayed` | Yes (`refund-routes.ts`, `ExtraChoiceView.replayed`) | `rxAgain` | `crossA` |
| Uncleared cheque: Refund gives 409 NOT_CLEARED | Yes on `/extra` | none (no "after it clears, Refund works" case) | `qRefund`, `qKeep` |
| The database's words in full | Yes. Q1 shows the full text with its remedy: "…the payment less its refunds: reverse the kept credit first." | — | **No case in the check reaches MONEY_RULE.** `afterKeep` stops at the app's own OVER_REFUND precheck (see Minor 4). |
| `leftToRefund` capped at the invoice's extra while credit is kept | It matches `money_credit_kept_holds` **rule 1**. `facts.extraMinor = paid − open − kept = −due − kept` (the same terms as `money_invoice_due`), so a refund R is allowed when R ≤ −due − kept. That is exactly the database's `kept ≤ greatest(-due, 0)` after the refund. **Rule 2** (per payment) is not mirrored: Minor 1. | stand-in (full refund, no credit kept) | `afterKeep` (left 0.00, `heldAsCreditMinor` 1500, the remedy named) |
| Keep takes `reason?` | Yes. It goes into the audit line `after.reason`. | the Keep inside the M1 case (201, 15.00) | none (see Minor 3) |
| A refund stores `refundedOn` | Yes. `after.refundedOn` is in the audit line. The default is the clock's day, and a future date or one before 2000 gives 422. | every audit line has it | `future` (422 at `refundedOn`) |
| `ExtraChoiceIn` is one strict object with a `superRefine` | Yes. Q3a: an unknown field is named. Q3d: Keep with `method` gives 422 "Only a Refund takes this." Q3b: a bare REFUND names `method`, `reason` and `idempotencyKey`. | — | `kAmt` (422) |
| Part 1a leftovers removed | **In part.** Only the "rule alone" block went (Minor 5). | | |

### Blocker
None.

### Major
None. Round 1's M1 is fixed. Probe P4 from round 1 is now case `crossA`: 409 KEY_USED, with the 15.00 extra still waiting and then kept.

### Minor
1. **`leftToRefund` overstates for a payment whose own extra was kept** (`refunds.ts:146-153`). It ignores `money_credit_kept_holds` rule 2: a payment less its refunds is never less than the credit kept from it.
   - Probe Q1: an invoice of 100.00. P1 pays 100.00. P2 pays 10.00, and that 10.00 is kept as credit. P3 pays 50.00, which is waiting.
   - A refund of 10.00 on P2 gives 409 **MONEY_RULE** from the database. Nothing is written, and the full words are shown, so this is money-safe.
   - But P2's OVER_REFUND answer says `leftMinor: 1000` (Q1c), and `leftToRefundMinor` in the views would say the same.
   - Fix: `own = amount − refunded − this.kept(tx, firm, p.id)`. The helper already exists. Then add Q1 to the check as the MONEY_RULE/OVER_REFUND case.
2. **A retry across midnight (UTC) that sends no date is refused as "a different refund"** (`refunds.ts:54-55`, `77-79`, `day()`).
   - When `refundedOn` is not sent, the request's date is filled in with today. `replay()` then compares that date with the stored one.
   - Probe Q4 (clock shifted one day, same body, same key) gives **409 KEY_USED** on both `/refunds` and `/extra`, not 200 `replayed`. UTC midnight is about 19:00 in Eastern Canada.
   - This is money-safe: nothing is written twice. But the answer is wrong.
   - Fix: compare `refundedOn` only when the request sent one.
3. **Keep's `reason` skips `money_text_ok`.** A refund's reason is checked in `writeRefund`; Keep's goes straight into the audit line.
   - Probe Q3c: `"Client‮ asked (Sample)"` gives 201, and the right-to-left override character is stored in `detail.reason_after`.
   - The brief's reasons are `money_text_ok`. Fix: run the same check before the KEPT write, and add a fail case.
4. **The NOT_CLEARED rule is applied on one door only, and its citation is stronger than its source.**
   - The code comment cites "AG-6-63 rule 7, MS-D23(3)" for "neither kept nor paid back". AG-6-63 r7 defines `cleared` and says "Applying uncleared money **warns**". It says nothing about refunds. So refusing is a reading, not the rule. Label it as a reading.
   - Probe Q2: a plain `/refunds` of 20.00 on the same uncleared cheque gives **201**. So the extra can still be paid back before the cheque arrives, by the other route.
   - Round 1's question stands for Lead B, now with both doors in view: refuse on both, or warn on both.
   - Also, the check has no pass case for "after the tick, Refund works".
5. **Check hygiene, still open from round 1, Minor 7.**
   - Unused imports and helpers remain: `taxForLine`, `FakeClock`, `runContract`, both contracts, `MoneyDocuments`/`documentText`/`invoiceData`, `throws`, `taxOf`, `stored`, `pdfText`, `auditN`, `events`.
   - The scratch database is still `xr_studio_fo7c_scratch_*`, and the keys are still `fo7c-refund-*`.
   - The header still speaks of "pending Lead B" cases.
   - No case reaches the MONEY_RULE mapping (see the table).
6. **Carried over, not code:** round 1's Minor 6 (the AG-6-23 r7 ruling) and Minor 8 (`module-cards` / `Card unchanged:`, and the PR body) stay with the Lead and the PR. They are not in this diff.

### Round 1's "held" list, still held
- **Lock order.** `lock()` only adds `p.cleared` to the select. The trust lock comes before the invoice `FOR UPDATE`, and both come before the key lookup.
- **Two refunds at once, and Keep racing Refund** (cases pass): never over the payment, and never both kept and refunded.
- **Trust.** TRUST_REFUND and TRUST_EXTRA still answer. A replay comes first, but a trust payment never has a stored refund.
- **Permissions.** The service still checks REFUND's `agent/refund:create` before any write. A Case Officer still gets 403.
- **Audit.** There is still one line per refund and per Keep, by a `staff:` actor, and the outbox row is written last. The payment row is never edited.
- **Firm walls.** Firm B gets 404, and every new query (the audit read, `money_invoice_credit`, `kept()`) is scoped to the firm.
- **Touch list.** Part 1c's own changes stay within the brief's files. `money.ts`, `routes.ts` and `check_fo7b_invoices.ts` change only through the merge of `2311bc168`. That drops out once #2953 lands with it.
- **`facts.ts` is untouched.**

**Verdict: Approve** on `872a2b8b5` (part 1c): no open Blocker or Major. Minors 1-3 are small and should go in the next push, each with its case. Minor 4 goes to Lead B as a question. Minor 5 is cleanup.
**The `?dueDate` change `2311bc168`: Approved** (for #2953).
