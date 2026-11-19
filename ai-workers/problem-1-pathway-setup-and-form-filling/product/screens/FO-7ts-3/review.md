Reviewer: Changes requested e70a2c44e581fd2501bfccedc04c53ce725e9a46

# FO-7ts part 3: Opus review (independent, high effort, P-608, P-278)

**Which commit.** I was asked to review `738531142067de2d88c428d01af98b44a9eec81a`. While I was reviewing, the builder pushed `e70a2c44e` (the breaker's round-1 fixes) to the branch. I reviewed both. The verdict above is for the current head, `e70a2c44e`. `738531142` is **Changes requested** as well: Major 1 and Major 3 below apply to it, along with the breaker's M1-M3.
**Scope.** Only this part's diff against `origin/claude/trusting-fermat-ejsqdh-fo7ts2`: the migration folder `20261119170000_fo7ts_part3`, `client-money.prisma`, `check_fo7ts_money_settings.ts`, the fixture helpers in the fo7a, fo7a2 and fo7mv tests, and `MODULE.md` with its row. The specification, in order: Build Lead C's `FO-7ts-3.md` brief, then Part 3 of `FO-7ts.md`, then `pick-guard-plan.md` with Lead 95's read.
**Screen review and journey test: not applicable.** This part adds no route, screen or `ports/` change (the brief says so), so there is nothing to walk. No journey score is given, and no journey report was written.

## What I ran (Postgres 18 on :54329, Node 24.21)
* At `738531142`: `check_fo7ts_money_settings` passed 140, failed 0. At `e70a2c44e`: passed 145, failed 0.
* Unchanged suites, passing at both heads: fo7a2 (35/0), fo7a_money_schema (122/0), fo7mv (45/0), fo7lk_lock_order (16/0), prisma_schema (8/0), pf12_walls (100/0, run with `--tsconfig api/tsconfig.json` as CI does).
* **Rollback exactness:** on a scratch database I took a catalog fingerprint up to part 2, applied part 3, then ran `rollback.sql` from the studio folder. The fingerprint covered columns, constraints, indexes, function md5, owner, SECURITY DEFINER and search_path, triggers, policies, enums, RLS and ACLs. It was identical before and after.
* I wrote two scratch scripts of my own: a lock-order race (Major 1) and a returned cheque after a move (Major 2). Every scratch database (`rv_fo7ts3_*`) was dropped.

## Findings

**Major 1: a pick and a "Move back to trust" credit note take the two party locks in opposite orders, which deadlocks (40P01).**
* The pick takes the smaller party id first (`migration.sql:122-130`).
* `money_credit_note_write` (OVERPAID_TO_TRUST) takes the withdrawal's party first, then the invoice's party through `money_issued_invoice` (`20261118210000_fo7lk_trust_lock/migration.sql:168-177`). Its comment says the withdrawal is "of the invoice's party", which a pick makes false. It takes the lock even when its own checks refuse the note a moment later.
* **Reproduced** with B < A: a pick by A on B's invoice raced against a credit note naming an earlier pick.
  * At `738531142`: 74 of 200 races ended in 40P01.
  * At `e70a2c44e`: 53 of 100.
  * With the order forced: the credit note's backend holds A and waits on B, and the pick fails with 40P01 every time.
* **Why Major and not Minor (I disagree with the breaker's m1):**
  * FO-7lk exists to keep one lock order with no 40P01.
  * The brief says "the party lock order is unchanged".
  * The plan Lead 95 accepted says "the lock is the payer's only".
  * This part brings in a two-party order that the Lead has not read, and FO-7lk's own review (break B-1) had refused exactly this kind of order.
* The same cause applies to `money_move_batch_owed_back`. I found this by reading the code and did not reproduce it. The batch locks each line's payer, then updates the invoice row without the invoice party's lock. A batch with a pick line from C on X, followed by a line from D > C, can deadlock against a pick by D on X.
* **Fix:** the brief forbids editing `money_credit_note_write`, so this needs the Lead's written leave (P-423).
  * Change that function's one lock line to take `least`/`greatest` of the withdrawal's party and the invoice's party.
  * Ask about `money_move_batch_owed_back` in the same ruling.
  * Add a DW26 race: a pick against an OVERPAID_TO_TRUST credit note, 20 runs, no 40P01.
  * Until the Lead rules, the label waits.

**Major 2 (new in `e70a2c44e`): the M2 fix puts a returned cheque on the wrong case once its money has moved, and that reopens a way round the per-case limit.**
* `migration.sql:237-240` now requires every correction to sit on the case of the entry it corrects.
* A deposit made before any case has `case_id` null, so its reversal is forced onto the pre-case bucket, even after a `MOVE_TO_CASE` pair has moved that money to case K.
* **Reproduced** (`rv/bounce.mjs`):
  * A pays a 100.00 cheque before any case, moves it to K, and also holds 500.00 on J.
  * The cheque is returned. Booking the return on K is refused ("a correction is on the case of the entry it corrects"). Booking it with no case is accepted.
  * The balances are now J = 500, K = 100, pre-case = −100.
  * A pick of 100.00 on K for B's invoice is **stored**. A's money on J has paid B's invoice on K, which is the exact case proposal 3 exists to refuse. The pre-case bucket also shows a shortfall that is not real.
* **Fix:**
  * Keep the equal-case rule for corrections that add money (`NEW.amount_minor > 0`, a return from a withdrawal), which was the breaker's M2.
  * Let a reversal of a no-case deposit sit on its own case, or on a case that received a `MOVE_TO_CASE` + half from that party's pre-case money.
  * Add a DW case: a cheque paid before any case, moved to K and returned, is booked on K, and the pick on K is then refused.

**Major 3: DW28, DW29 and DW30 are missing.**
* The brief's Done-when lists them, added from Lead 91's P-423 read of #2204: the move route stays within one party and currency, a REFUNDED credit names its payout, and the − half is not shown as a shortfall.
* The test header (`check_fo7ts_money_settings.ts:9`) lists DW10, DW15-18 and DW25-27 plus DW31. No case, question or challenge note covers DW28-30.
* Some of them may not fit "no route, no screen" (DW28 needs the move route; DW30 needs a ledger read or a screen). That is a reason to ask the tech lead, not to leave them out without a word.
* **Fix:** build DW29 here if it is schema (a payout link on REFUNDED credit entries, with a CHECK). For DW28 and DW30, get Build Lead C's written ruling moving them to the item that owns the route or read. Record it in the PR and in `challenge.md`.

**Minor 1: DW26 as named cannot hold, and the test quietly names another party.**
* The brief and the plan say "a pick from A and a deposit to B do not wait". When B is the invoice's party, the deposit does wait: FO-7lk's `money_issued_invoice` takes B's lock, and part 3 now takes it up front.
* `tests/check_fo7ts_money_settings.ts:704` uses C instead, a party not on the invoice.
* **Fix:** record this for the Lead's code read, and add the true case: a deposit to B waits on A's pick, then commits.

**Minor 2: suites the brief says must pass unchanged were edited.**
* The fixture helpers in `check_fo7a2_ledger_rules.ts:71`, `check_fo7mv_move_list.ts:80` and `check_fo7a_money_schema.ts:401` were changed. The fo7a change also goes beyond the date list.
* This is necessary: DW27 makes the method and date required. It is not a weakening: only REFUND_TO_CLIENT inserts gain two columns, and no assertion changed.
* **Fix:** state the deviation and its reason in the PR body (never deviate silently).

**Minor 3: `money_party_tax_treatment.updated_at` never changes on update.**
* `client-money.prisma:580` has `@default(now())` without `@updatedAt`, so an updated row keeps its creation time. Every other updatable money table uses `@updatedAt` (for example line 263).
* **Fix:** `@default(now()) @updatedAt`, or a trigger that sets `now()` on UPDATE, plus a pass/fail case.

**Minor 4: the migration's refusal over existing trust refunds is untested.**
* The "bad" database (`migration.sql:15-22`) covers part 1 only.
* **Fix:** add a fail case: with a REFUND_TO_CLIENT recorded before part 3, the migration refuses in its words and changes nothing.

**Minor 5: the database does not check that the payer is on the case** (the breaker's m5, which I agree with). "Same case" compares two `case_id` values the caller supplies. The route (FO-7t part 2) must prove that the payer is on the case, and its brief should name a test with an unrelated payer tagged with the case.

**Nit 1: doc comments are attached to the wrong items in `client-money.prisma:132-136` and `567-572`.** MoneyCreditKind's `///` block now documents `MoneyTaxTreatment`, and MoneyCreditEntry's block ("Insert-only") now documents `MoneyPartyTaxTreatment`, which is an updatable table. Move each new `///` block directly above its own enum or model.

**Nit 2: the DW26 "fail (planted)" case (`tests:714`) proves too little.** It only shows that two advisory locks taken in opposite orders deadlock, plus a regex on the function text. A stronger fail: replace the function with a copy that lacks the pre-lock, show that the crossing race gives 40P01, then restore it.

**Nit 3: DW17 has no case with no case on both sides.** The code refuses it (the guard requires a non-null case), but there is no test row for it.

## What held (checked by me)
* **The pick guard** accepts another party only when all three pick fields are set, the currency is the same, and the entry and the invoice share one non-null case. This matches the plan's SQL.
* **Refusals in words:**
  * "nothing to pick" (proposal 2);
  * the same party on another case is accepted with or without a pick (proposal 1);
  * the per-case limit is read under the payer's lock (proposal 3);
  * #1991's words for below zero, including a payer already below zero (DW25);
  * a pick never pays more than is due (M3 fix, after the invoice row).
* **The pick's CHECK:** all three fields together, on WITHDRAWAL_TO_INVOICE only, with by = created_by and a reason that passes `money_text_ok`. The time is always the database's.
* **Refunds:** the refund CHECK and the refusal of CARD and CARD_TERMINAL in words (Build Lead C's ruling). A payee other than the party needs a reason; the party itself needs none. Other kinds carry none of these columns.
* **Issued invoices:** `money_invoice_write` freezes the column list from part 1 plus `tax_treatment`; I diffed it, and that is the only change. The treatment is set at issue from the party's row, else Taxable. Invoices issued before this part are set to Taxable before the freeze names the column.
* **PF-12 walls on `money_party_tax_treatment`:** forced RLS, the `pf12_firm` policy, the firm-first trigger and the same ACL as `money_credit_entry`. The trigger functions are re-owned by `xr_wall_reader`.
* **Index:** `(firm_id, issued_at DESC, id)`, created with IF NOT EXISTS under Prisma's name. `migrate diff` is empty.
* **Rollback:** it refuses when facts are recorded, refuses when run from the wrong folder, and is exact otherwise. The migration applies again after a rollback.
* **Size and stamp:** the part's diff is 692 lines, under P-610's 800. The stamp is later than every migration on `main` as of today.

**Verdict: Changes requested.** Before Approve: Major 1 (the Lead's ruling, then the one-line sort and a DW race), Major 2 (the correction-case rule) and Major 3 (DW28-30 built, or moved by a written ruling). I recommend fixing the Minors in the same round.
