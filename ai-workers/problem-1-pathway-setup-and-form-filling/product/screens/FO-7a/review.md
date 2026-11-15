# FO-7a review: client-money tables (independent reviewer, P-303)

**Reviewed:** commit `6e19e4ef24a672304e35987b22298ac1ae5a5ca6`, branch `claude/affectionate-thompson-m1w7kd`, PR #1758; diff `origin/main...6e19e4ef2` (4 files, +1914). Schema only: no route and no screen, so there is no UI journey. **Journey score: N/A.** The caller ruled out a UI walk, and the journey-test report is not written for that reason. In its place I ran break-it probes in SQL on my own scratch database (`xr_studio_fo7a_review_probe` on :54329, dropped afterwards). I did not touch `xr_studio_demo` or :4400.
**Judged against:** the brief (`lead-b-briefs/FO-7a.md`), row FO-7a (BACKLOG line 308), the rev 13 lines and the FO-7t/FO-7r rows, contracts §0, §2.5, §7 (§2.5 trust) and §8, the AG-06 cards (AG-6-1, -4, -19, -44, -46, -59, -60, -61, -63, -69, -73, -76), and the FO-1b and PF-3 migrations.

## What I ran
* `npx tsx tests/check_fo7a_money_schema.ts`: **88 passed, 0 failed** (25 s). `tests/check_prisma_schema.ts`: **8 passed, 0 failed**.
* My own probes on real connections at READ COMMITTED (RC), REPEATABLE READ (RR) and SERIALIZABLE. Results are under "Concurrency".

## 1. Done-when and rev 13 lines: pass and fail cases
| Line | Pass | Fail | Proves its label? |
|---|---|---|---|
| Migration on empty and demo-data copies; `migrate diff` empty | yes (`:82-101`) | yes (`:80`, `:86`) | Yes. The diff is filtered to money lines because of 5 known differences elsewhere, which `check_prisma_schema` holds. "Demo-data" means demo-shaped rows plus `seedSampleFirms`, not a copy of the live demo. That is acceptable. |
| Issued invoice: lines, tax, party, currency, number frozen | `:167`, `:177` | `:169-176` | Yes, for writes one after another. No race test of a line write against an issue (my probe below shows the rule holds). |
| INV/CN/R/DR: no repeat, no skip under 20 parallel writers | `:191-196`, `:245`, `:253`, `:262` | `:197`, `:205` | Yes, at RC. A rollback gives the number back (`:195`). |
| Payment intent id or idempotency key used twice → refused | `:211`, `:216` | `:213` | Yes. |
| Trust entries refuse update and delete | n/a | `:284` | Yes, including truncate. |
| Trust withdrawal without an invoice → refused | `:292` | `:288` | Yes. |
| Trust balance never below zero, under parallel withdrawals | `:299-309` | `:294` | Yes, at RC (exactly 6 of 10 succeed) and at RR (forks refused). |
| Every amount is an integer | `:107` | `:164` | Yes. |
| `firm_id` first in every index | `:104` | `:105` | Yes. Primary keys on `id` are exempt, which is the FO-1b and PF-3 pattern. |
| Rev 13: second write-off; write-off update/delete; move-line update; undo without a reason or without its batch | `:314`, `:339` | `:315-317`, `:330`, `:337` | Yes. |
| Parallel ticking of one line → one batch (FO-7t's rev 13 test, supported here) | `:346` | same | Yes, at RC. I confirmed it at RR myself. |

## 2. Concurrency (my probes)
* **Numbers:** one row-locking `UPDATE` on the series row. At RC the second writer waits and then takes the next number. At RR the second writer gets 40001. Numbers never repeat and never skip, and a savepoint rollback also returns the number. **Holds.**
* **Freeze against concurrent line writes:** line vs issue, both orders, 5 rounds each. At RC the line is refused (23514); at RR it gets 40001. No line ever landed after issue. **Holds.**
* **Trust balance:** 6 parallel withdrawals of 100 from a 300 company balance at RC, RR and SERIALIZABLE. Never below 0, seq stays dense. **Holds.** The guard is the advisory lock plus the unique `(firm, party, currency, seq)` index.
* **A move source in at most one live batch:** 4 batches ticking one withdrawal at RR. 1 succeeds, 3 get 23505. **Holds.**
* **Credit notes over the total:** at RR the second writer gets 40001. This only works because every credit note also updates the CN series row. The comment at `migration.sql:752-753` credits the `FOR UPDATE` lock, which does not protect at RR. The result is safe; the reason given is wrong.
* **Refunds over the payment:** **not safe at RR** (Major 1).
* **One Stripe account per firm:** **not safe at RR** (Minor 1).

## 3. Holes found
### Major
1. **`migration.sql:895-912` (`money_refund_write`): refunds can exceed the payment at REPEATABLE READ.**
   * **Scenario (reproduced):** a payment of 1000. Two transactions at RR each refund 700. Both commit, and `sum(money_refund.amount_minor)` is 1400. `FOR UPDATE` on a payment row that the other transaction only locked (and did not update) raises no serialisation error, so the stale `sum` passes. Nothing else catches it: refunds take no number, so no series row serialises them.
   * **Impact:** money leaves the firm beyond what was paid. The comment "refunds of one payment are written one at a time" does not hold at RR.
   * **Fix:** use the backstop the trust ledger and move lines already use. Add a database-set `refund_ordinal` (count of earlier refunds + 1) with a unique index on `(firm_id, payment_id, refund_ordinal)`, so a stale read at RR fails with 23505. Alternatively, refuse writes when `current_setting('transaction_isolation') <> 'read committed'`. Either way, add an RR race test.

### Minor
1. **`migration.sql:633-645`: Stripe account id uniqueness as a trigger fails at RR** (the builder's choice 5h; reproduced: two firms at RR both hold `acct_RR1`).
   * **Why it matters:** webhooks are routed by account (contracts §2.5), so a duplicate could send one firm's payments to another firm.
   * **Why the trigger is not needed:** "firm_id first" is a tenancy rule for firm-scoped lookups. A global external id is not a firm-scoped lookup, and webhook routing needs a lookup with no firm. PF-3 already keeps global unique indexes on external ids (`platform_subscription.stripe_subscription_id`, `platform_staff.identity_subject`).
   * **Fix:** a unique index on `stripe_account_id`, exempted in the index check by name. Or keep the trigger and add the isolation guard.
2. **`migration.sql:945-961`: a deposit from a payment against an invoice (AG-6-69 "Trust first", received into TRUST) is not checked against the invoice's party.** Reproduced: credited to another person.
   * **Fix:** when `payment.invoice_id` is set, require the entry's party and currency to match the invoice's, as is already done for trust requests.
3. **`migration.sql:916-931`: one Trust-first payment gets two receipts** (a PAYMENT receipt on the payment and a TRUST receipt on its deposit; reproduced R-0001 and R-0002). AG-6-69 rule 5 says the receipt for such a payment is a payment receipt.
   * **Fix:** refuse a TRUST receipt for a deposit whose payment has an `invoice_id`, or refuse the PAYMENT receipt when a receipt already exists for its deposit.
4. **`migration.sql:968-976`: a withdrawal is not capped by its invoice.** Reproduced: 400.00 withdrawn to a 100.00 invoice. FO-7t's row owns "never more than the open amount", and only part of that can be a database rule.
   * **Fix:** a cheap backstop is that net withdrawals on one invoice never exceed its total. Withdrawals on an invoice are already serialised by the party lock, so this check is safe under concurrency.
5. **`migration.sql:1029-1035`: lines can be added to a batch after it was recorded, including to an already undone batch.** Reproduced: a line written into an undone batch counts as never moved.
   * **Impact:** this edits a recorded batch (AG-6-73 rule 6: "never edited").
   * **Fix:** refuse a line whose batch has an undo, and refuse a line whose batch was not written in the same transaction (batch `xmin` = `pg_current_xact_id()`).
6. **`migration.sql:1049`: `CARD_FEE_ON_TRUST` accepts any payment received into trust.** Reproduced: a cheque.
   * **Fix:** also require `method = 'CARD'`. That makes this kind unusable until card into trust is allowed (contracts §7), which is the correct state.
7. **`migration.sql:895-912` with `:942`: a refund of a payment received into TRUST leaves the ledger untouched**, and no entry links to a refund. Reproduced: a 500.00 trust payment fully refunded while its deposit still counts in the balance.
   * **Fix:** refuse `money_refund` on TRUST payments (trust money goes back by a `REFUND_TO_CLIENT` entry), or add `refund_id` to the entry and require it.
8. **`migration.sql:1038`: a TRUST_APPLIED line must be the whole withdrawal, and a CORRECTION cannot be a move source.** So a trust application that is partly returned (for example by a part credit note) cannot be moved net, which FO-7t and FO-7r will need.
   * **Fix:** allow `amount_minor <= -withdrawal`, or allow a CORRECTION entry as the source of an OPERATING_TO_TRUST line.
9. **`client-money.prisma:250-283`: no place for FO-7t's "optional evidence file through `FilesPort`"** on a trust deposit. Rev 13 says FO-7t needs no schema of its own, and FO-7t's Touch list has no migration.
   * **Fix:** add a nullable file-key column on `money_payment` now, or record in the PR that FO-7t adds it.
10. **`migration.sql:1054-1062`: the move-line lookup on `coalesce(source_trust_entry_id, source_payment_id)` scans every line of the firm and kind** (EXPLAIN confirms) while it holds the advisory lock.
    * **Fix:** two branches on the indexed column, as `money_trust_entry_write` already does.
11. **Test gaps (`check_fo7a_money_schema.ts`):** no race test for line write against issue, and none at RR for refunds, credit notes or the Stripe account. Each would have caught the rows above.

## 4. P-600
* Own area file and own migration folder: yes.
* Only additive changes: `platform.prisma` gains one back-relation line, as FO-1b did. PF-0p is not on `main`, so its slot line will replace this one later.
* All 21 functions and all triggers are named `money_`.
* Stamp `20261114131305` is later than `main`'s newest (`20261114120000_fo1b_booking_tables`), and `main` is an ancestor of the commit.
* Case-side tables are untouched.

## 5. The builder's choices (brief silent)
* **Firm anchor `money_payment_settings`:** sound. It makes the settings row a precondition, so FO-7b must create it on first use.
* **`gen_random_uuid()` defaults:** fine.
* **Credit-note and receipt numbers nullable in Prisma, with a check refusing null:** fine. FO-7b code will see `string | null`.
* **Per-party, per-currency ledger with stored balance and seq:** follows the row ("per party") and contracts §7 ("per-client"). AG-6-60 wants per case, but `case_id` is stored. Not a finding against this row.
* **A deposit must name a trust payment:** sound.
* **Card never into trust:** matches §7.
* **Undo batch carries no lines:** sound.
* **Stripe id uniqueness as a trigger:** wrong; see Minor 1.
* **Note for FO-1k:** the person and company keys it adds must be composite `(firm_id, person_id)`, so no row can point at another firm's party.

## Not checked
CI on the PR. The real demo database copy. FO-7b, FO-7t, FO-7r and FO-7c code, which does not exist yet.

**Fix list before Approve:** Major 1. Minors are advised. Minors 2, 3, 5 and 7 are cheap now and harder once FO-7b and FO-7t write rows.

Verdict: Changes needed

## Round 2 (diff only, P-277): `6e19e4ef2..1863c935a`
Head `1863c935a9e5ae331815e7d152146a2a0a53ff87`.
* `check_fo7a_money_schema.ts`: 111/111. `check_prisma_schema`: 8/8.
* Probes ran on my own scratch database (`xr_studio_fo7a_review_probe2` on :54329, dropped afterwards). Line numbers below refer to the new `migration.sql`.

### Round 1 findings and break-report items, checked again
| Item | Status | Evidence |
|---|---|---|
| Major 1 / B-2: refunds at RR | **Closed** | 700 + 700 on a 1,000 payment. RC: one written, the other refused (23514). RR: one written, the other refused (23505, `refund_ordinal`). Sum 700 in both. |
| m1 / B-3: Stripe account across firms | **Closed** | Two firms at RR: one written, the other refused (23505). Global unique index (`:309`), as PF-3 does. |
| m2: "Trust first" deposit party | **Closed** | A deposit on another person is refused (`:1051`). |
| m3: double receipt | **Closed** | `:1013-1015`, and the test. |
| m4 / B-5 / B-8: caps | **Closed as built**, with one new hole (R2-Major 2) | Credit note 80 against trust 80 on a 100 invoice at RR: one written, the other fails (40001). |
| m5 / B-7: lines only with their batch | **Closed**, with one false refusal (R2-m5) | `:1146-1153`. |
| m6 / B-11, m7, m9, m10, m11 | **Closed** | `:1175`, `:983`, `:570`, `:1180-1190`; tests added. |
| m8: net move | **Half closed, accepted** | A line may be less than its withdrawal (`:1163`). A CORRECTION as a move source stays out by choice; that is fine, since a net TRUST_APPLIED line covers the case. |
| B-1 (a)-(f): unseen rows | **Closed** | All six CTE and multi-row shapes from the break report now refuse with 23503 (`money_missing`). |
| B-4: request paid while it changes | **Closed at RC, open at RR** | See R2-m1. |
| B-6: series gap and prefix | **Mostly closed** | Shared prefix and digits in a prefix are refused. Gaps are still open (R2-m3), and a new refusal appears (R2-m4). |
| B-9, B-10 | **Closed** | `money_text_ok` refuses U+3000, RLM, U+202E and U+2028. Issue, send, cancel and record times are set by the database. |
| Not fixed, by choice: uncleared-cheque withdrawal; CARD_FEE_ON_TRUST unusable | **Accepted** | AG-6-68 rule 5 says warn, never block. Card into trust waits (contracts §7). |

### New in this diff
**Major**
1. **`migration.sql:554` (`money_invoice_line_tax_check`): Quebec tax cannot be invoiced.**
   * **What the check does:** it requires `tax_minor = round(amount × tax_rate_bp / 10000)` with an integer basis-point rate.
   * **Why Quebec fails:** AG-6-4 rule 1, a card the row cites, uses GST 5 % + QST 9.975 %. That is 1,497.5 bp, which is not an integer, and each tax is rounded on its own.
   * **Reproduced:** a 1,000.00 line with tax 149.75 is refused at 1,498 bp and at 1,497 bp. `money_payment_settings.tax_rates` also refuses `rateBp: 997.5` (`:511`). That second part is from round 1 and I missed it then.
   * **Fix:** drop the equality and keep the bounds (`0 ≤ tax_minor ≤ amount_minor`; `tax_rate_bp = 0` implies `tax_minor = 0`). Hold the rate in a finer unit, for example `tax_rate_ppm` and a ppm `rate` in the settings list, so 9.975 % fits. Add a pass case for a Quebec line.
2. **`migration.sql:1089-1093`: trust can never pay an invoice again after a return.**
   * **What the check does:** `applied` is minus the sum of the WITHDRAWAL_TO_INVOICE entries on the invoice. A return is a CORRECTION that cannot carry `invoice_id` (`:602`), so it never reduces `applied`.
   * **Reproduced:** an invoice of 100.00. Apply 60.00 by mistake, return 60.00 (`corrects_entry_id` set). Applying 100.00 is then refused ("10000 open … 6000 already paid from trust"), although nothing is applied.
   * **Who hits it:** FO-7t's dispute and credit-note returns, and any mistake, all leave the invoice permanently short.
   * **Fix:** subtract the CORRECTION entries whose `corrects_entry_id` names a withdrawal on that invoice. Add a test for apply, return and re-apply.

**Minor**
1. **`:900-906`, `:943`: B-4 is still open at RR.**
   * **Reproduced:** the payment on a sent request commits first. Then an RR transaction whose snapshot is older changes the request's amount to 1, and it commits. FOR SHARE leaves no row change behind, so the stale updater gets no 40001, and its EXISTS reads the old snapshot.
   * **Fix:** the payment touches the request row (`UPDATE … SET updated_at = now()`), as `money_issued_invoice` does for invoices.
2. **`:1079` vs `:1088`: the locks are taken in different orders, which deadlocks.**
   * A withdrawal locks the invoice row first and the party lock second. A deposit takes the party lock.
   * "Trust first" (AG-6-69 rule 5) writes the deposit, then the withdrawal, in one transaction. Against a concurrent withdrawal on the same invoice and party this gives 40P01 every time (6 of 6).
   * **Fix:** take the party advisory lock before `money_issued_invoice`.
3. **`:695-702`: the series still skips, and a first number cannot be corrected.**
   * **Reproduced:** a hand-written `UPDATE … SET next_number = next_number + 1`, run twice, skipped INV-0006 and INV-0007.
   * **Reproduced:** a receipt series written at 1, with nothing taken yet, refuses 2500. AG-6-44 rule 2 needs this.
   * **Fix:** let only `money_take_number` move `next_number` (a transaction-local `set_config` flag), and allow any raise while no number has been taken.
4. **`:312` with `:680-682`: one kind's prefix can block another kind entirely.**
   * **Reproduced:** with no credit note yet, the invoice prefix set to `CN-` is accepted. Every credit note is then refused: `money_take_number`'s insert hits the `(firm_id, prefix)` index, which its `ON CONFLICT (firm_id, kind)` does not cover.
   * **Fix:** refuse a prefix equal to another kind's default, or write all four series rows with the settings row.
5. **`:1146`: a batch written inside a savepoint refuses its own lines in the same transaction.**
   * Its `xmin` is the subtransaction's id, not `pg_current_xact_id()`.
   * **Fix:** store `pg_current_xact_id()` in a batch column and compare against that.
6. **Not a finding (scope):** the trust cap is total less credit notes less write-off. Payments are not counted, so trust can still pay an invoice already settled by card. The coordinator's description says the cap is built this way, and FO-7t owns "never more than the open amount".
7. **Typo-level:** duplicated comment lines at `:828-829` and `:1114-1115`.

Not checked: CI on this head; the breaker's own round 2.

**Fix list before Approve:** R2-Major 1 and R2-Major 2. R2-m1 and R2-m2 are advised, and are cheap now.

Verdict: Changes needed

## Round 3 (diff only, P-277): `1863c935a..3c88ac486`
Head `3c88ac48603dc89a3427b38429e7583ca4241c11`.
* `check_fo7a_money_schema.ts`: 119/119.
* Probes ran on my own scratch database (`xr_studio_fo7a_review_probe3` on :54329, dropped afterwards). Line numbers below refer to the new `migration.sql`.

### Round 2 findings, checked again
| Item | Status | Evidence |
|---|---|---|
| R2-Major 1: Quebec tax | **Closed** | A 1,000.00 line at 149,750 ppm with tax 149.75 is accepted. A 0.33 line with GST and QST rounded apart (tax 0.05 against 0.049) is accepted. Tax 149.77 on 1,000.00 is refused. Settings accept `ratePpm` 50000 and 99750. |
| R2-Major 2: re-apply after a return | **Closed** | Apply 60, return 60: a further return of 0.01 is refused. Re-applying the full 1,150.13 is accepted, and 0.01 more is refused. Two returns of 80 on one 100 application: RR gives one written and the other refused (23505); RC refuses both new returns (23514, after one earlier written). Sum 80. |
| R2-m1: B-4 at RR | **Closed** | The payment commits first, then a stale RR amount change: 40001, and the amount stays 1,000. |
| R2-m2: deposit-then-withdraw deadlock | **Closed** | 4 of 4 rounds: both commit. |
| R2-m3: series gap; first number | **Closed** | A direct `+1` after a number is taken is refused. Before any number is taken, the first number can be raised, lowered or the row deleted. `numbers_taken` given at insert is refused. |
| R2-m4: another kind's default prefix | **Closed** | Invoice prefix `CN-` is refused by `money_number_series_default_prefix_check`; `TOR-` is accepted. |
| R2-m5: batch written in a savepoint | **Closed** | A line after `RELEASE SAVEPOINT` is accepted. A line on a batch from an earlier transaction is refused, also after `VACUUM (FREEZE)`. On `pg_xact_status`: an unfrozen tuple older than the clog cannot exist (clog is truncated only up to the frozen horizon), so NULL cannot slip through. A batch from before an epoch wrap gives an error, never acceptance. Writing `IF b.mine IS NOT TRUE` would make the NULL case explicit (nit). |
| R2-m6: duplicate comment | **Closed** | |

### New in this diff
**Major:** none.

**Minor**
1. **`:812` (`money_issued_invoice`) with `:1060`: moving the party lock first opened a new lock-order deadlock.**
   * **Order now:** a withdrawal takes the party lock, then the invoice row. A credit note (or write-off) takes the invoice row, and a return in the same transaction then takes the party lock.
   * **Who hits it:** "Credit note, then return the trust applied to it" (AG-6-48; AG-6-73 rule 4) in one transaction, against a concurrent withdrawal on the same invoice and party.
   * **Reproduced:** 40P01, 4 of 4. Round 2's order did not deadlock here.
   * **Impact:** one transaction is aborted and can be retried; no data is wrong.
   * **Fix:** in `money_issued_invoice`, read the invoice's party and currency first without a lock, take that party's lock, then touch the row. Every path then locks party first, invoice row second.
2. **The `money.taking_number` setting (`:692`, `:718`); the coordinator asked whether it matters.**
   * **Reproduced:** `set_config('money.taking_number','on',true)`, then a direct update to 5000, is accepted.
   * **In my view it does not matter as a threat:** the app role owns these tables and can `DISABLE TRIGGER` anyway, and nobody sets a namespaced setting by accident. The triggers guard against app mistakes, not against a hostile owner.
   * **Cheap hardening (optional):** while the setting is on, also require `next_number = OLD.next_number + 1` and `numbers_taken = OLD.numbers_taken + 1`. A bypass could then only ever take numbers one by one.
   * **The real fix is PF-12's:** a non-owner app role and a `SECURITY DEFINER` number function.

**Not in this diff (noted for FO-7t; outside this diff, not a finding):**
* A negative CORRECTION takes money out of trust without naming an invoice, which is s. 32(f) by the back door. This includes a −60 correction naming a 60 return. Reproduced: after that chain, 1,210.13 was taken from trust for a 1,150.13 invoice.
* This existed from round 1: CORRECTION may be either sign, and the row lists it.
* **Fix later:** FO-7t should write a negative correction only against a deposit (a bounced cheque, a wrong party). A database rule could require a negative CORRECTION to name a DEPOSIT or a positive correction that is not a return.

Not checked: CI on this head; the breaker's round 3; the isolated-copy C10.1 and demo-reset results the coordinator reports (I did not re-run them).

**No Blocker and no Major is open.** Round 3 Minor 1 (the new deadlock) is advised before FO-7t, which will write credit-note returns.

Verdict: Approve

## Round 4 (diff only, P-277, P-303): `6f48fe29e..35b028dae`
Head `35b028dae8ee889e46f3eb07f4b4620755d87967`. Scope: the tech lead's go (PR comment, 14 Nov 14:25 UTC), P-603, Lead B's AG-6-73 mapping, and break round 3 B-12 to B-17.
* `check_fo7a_money_schema.ts`: 133/133 on :54329.
* Probes ran on my own scratch database (`xr_studio_fo7a_review_probe4` on :54329). I applied every migration in order and dropped the database afterwards. Live AI was off, cost US$0, and port 4400 was not used.
* Line numbers refer to the re-stamped `migration.sql` (`20261115042334_fo7a_client_money_tables`).
* The re-stamp (P-600) has content identical to the old path, apart from the round-4 hunks (`git diff -M`: 90 % similarity, a rename).

### Round 3 findings and break items, checked again
| Item | Status | Evidence |
|---|---|---|
| R3-m1 / B-14: credit note then return, deadlock | **Closed** | `:828-831`: `money_issued_invoice` takes the party lock (the same key text as `:1083`) before the row. The builder's parallel test passes (credit note then withdrawal, and credit note then return, beside a withdrawal: all `ok`). |
| R3-m2 / B-13: `money.taking_number` | **Closed** | The setting is gone. A direct `money_take_number` call, also from a `DO` block, is refused (42501). `proacl` is `{xr_studio=X/xr_studio}`. Once a number is taken, these direct updates are refused: `+1/+1`, a reset to `1/0`, `numbers_taken = 0`, and a delete. Issuing the next invoice still gives INV-0002 (series 3:2). Before the first number, 500 → 10 is accepted and 0 is refused by `next_check`. |
| B-12: a correction of a return | **Closed in the ledger** | A correction naming a correction is refused, and so is one naming a refund. A REFUND naming an entry is refused (`corrects_check`). So is a correction naming nothing, one naming itself, one naming another party's deposit, and a positive correction of a deposit. The ledger loop now stops at 100.00 applied. **The move list does not stop: see Major 1.** |
| B-15: `b.mine IS NOT TRUE` | **Closed** | `:1220`. |
| B-16: a line after an undo in the same transaction | **Closed** | These are all refused: an undo then a line; a CTE with the undo first; a CTE with the line first (by the BEFORE trigger); and the CTE with `SET CONSTRAINTS money_move_line_not_undone IMMEDIATE` (at statement end). A legitimate undo in a later transaction, then a new move of the same source, works (ordinal 2). |
| B-17: more invisible characters | **Closed as listed** | U+2800, U+E0020, U+E0001, U+1F3FB alone and U+FE0F alone are refused. An emoji with a skin tone is accepted. The remaining gaps are under Minor 2. |
| Deposit corrections (P-603) | **Closed** | The builder's RC and RR races hold the sum at most the deposit. I checked the bounds by hand. |

### Builder's choices
1. **Accepted:** setting the first number lower or higher while `numbers_taken = 0`. This is AG-6-44 rule 2, and "never down" applies once numbers are taken.
2. **Accepted:** a direct `+1/+1` update is refused (it moves only at `pg_trigger_depth() > 1`, `:731`). The owner can still write its own trigger, but that is PF-12's non-owner role, as in round 3.
3. **Accepted, fail-safe.** I reproduced it: T1 updates an issued invoice's due date, then withdraws; T2 withdraws in between. T2 gets 40P01 and T1 commits, with one entry written. Nothing is wrong, and a retry works.
4. **Accepted.** Undoing a batch with lines inside its own transaction makes no sense (roll back instead), and refusing it costs nothing.

### Major
1. **`:1230-1235` (TRUST_APPLIED) with `:1137-1145` (returns): money still leaves trust through the move list, beyond what the ledger applied. This is B-12 moved from the ledger to the bank. It breaks P-603 and Lead B's AG-6-73 mapping.**
   * **What the check does:** a TRUST_APPLIED line may move up to `-withdrawal.amount_minor`. It never subtracts the returns (positive corrections) of that withdrawal, although the header at `:1203` says "up to its withdrawal (less what was returned before moving)".
   * **Reproduced (scratch database):**
     * Deposit 500.00. Issue invoice 601 for 100.00.
     * W1 −100.00, then return +100.00. Move W1 TRUST_APPLIED 100.00: accepted.
     * W2 −100.00 (the trust cap is open again). Move W2 100.00: accepted.
     * Return W2 +100.00 *after* its move: accepted. The move stays live.
     * W3 −100.00. Move W3 100.00: accepted.
   * **Result:** 300.00 moved trust → operating against a 100.00 invoice. The ledger shows 100.00 applied, and the party's balance is 399.00 (one 1-cent withdrawal on a second invoice). The loop has no bound: each round adds a new withdrawal as a new move source.
   * **Fix:**
     * At move time, cap a TRUST_APPLIED line at `−withdrawal − sum(its returns)`.
     * Refuse a return on a withdrawal when its returns plus its live (not undone) TRUST_APPLIED amount would exceed what was applied. The person undoes the move batch first.
     * Take the party's trust lock in `money_move_line_write` for TRUST_APPLIED, so a move and a return of the same withdrawal serialise. They take different locks now (`money_move:` against `money_trust:`).
   * **Fail tests needed:**
     * Return then move: refused above the remainder.
     * Move then return: refused while the move is live, and accepted after the batch is undone.
     * The withdraw, return, withdraw loop moves at most 100.00 for a 100.00 invoice.
   * **Why I did not raise it before:** it existed from round 1, and I missed it in rounds 1 to 3. It is in scope now because round 4's own requirement is that trust→operating moves map onto the ledger kinds. Its test only checks the *source kind* of a TRUST_APPLIED line, never its amount after returns.

### Minor
1. **`:1248-1252`: a bounced-cheque correction also opens a wrong-account move out of trust.**
   * **Reproduced:** a 30.00 cheque deposit, then a −30.00 correction "Cheque bounced". A WRONG_ACCOUNT TRUST_TO_OPERATING move of 30.00 is then accepted. That money never arrived, so the move would take other clients' money.
   * **Why the database cannot tell:** P-603 gives one negative kind for "bounced" and for "wrong account", and the reason is free text.
   * **Not new scope:** FO-7t should write the wrong-account correction and its move together, and offer no move after a "bounced" correction. A schema fix would need a new column, so I list it only so it is not lost.
2. **`:505-509`: B-17's deny list still lets through some invisible format characters.**
   * Accepted as the whole reason: U+FFF9 to U+FFFB (interlinear annotation), U+1BCA0 to U+1BCA3 (shorthand format controls) and U+13430 (Egyptian format controls).
   * **Fix (cheap):** add `￹-￻\U0001bca0-\U0001bca3\U00013430-\U0001343f`. A deny list will always trail Unicode. The lasting fix is a visible-character allow test when an ICU collation or ctype is available.

**Not checked:** CI on this head; the breaker's round 4.

**Fix list before Approve:** Major 1, with its fail tests. Minor 2 is cheap to add in the same commit. Minor 1 goes to FO-7t.

Verdict: Changes needed

## Round 5 (diff-only, `12b7236f9..73a93e32c`)
Head `73a93e32c5d56c6fd5ad548801000a1cc9eb41ba`. The release holder ordered this pass: diff only, high effort, no new rules. I checked the move-list removal (`ecca4d110`), B-20 (`d62c189e9`), B-21 (`33926119a`), the merge of main (`bc4993b2e`) and the `check_pf0p_ports.ts` line (`73a93e32c`).
* **Journey score: N/A.** The row is schema only: no screen and no route, as in round 1. In its place I ran SQL probes on my own scratch database, `xr_studio_fo7a_review5` on :54329. I applied all 93 migrations in name order and dropped the database at the end. I did not use port 4400 or `xr_studio_demo`. Cost: US$0.
* **Commands, all exit 0:**
  * `npx tsx tests/check_fo7a_money_schema.ts`: 123/123, including `migrate diff` empty on the empty copy and on the demo-data copy.
  * `npx tsx tests/check_pf0p_ports.ts`: 113/113.
  * `npx tsx tests/check_prisma_schema.ts`: 8/8.
* Line numbers below refer to `20261115042334_fo7a_client_money_tables/migration.sql` at the head.

### 1. Removal of `money_move_batch` and `money_move_line`: complete and clean
* **The diff:** both tables are gone, along with:
  * the enums `MoneyMoveKind` and `MoneyMoveDirection`;
  * 5 indexes, 5 foreign keys and 3 checks;
  * the insert-only and no-truncate triggers;
  * `money_move_batch_write`, `money_move_line_write` and `money_move_line_not_undone` (24 functions → 21; the suite asserts 21);
  * the back-relations `moveBatches` (settings) and `moveLines` (payment, trust entry);
  * the 16 move tests;
  * `transfer_date` from the "only dates" assertion; the `_minor` column count drops 11 → 10.
* **Repo-wide search:** `git grep` at the head finds no `money_move`, `MoneyMove`, `moveLines` or `moveBatches` outside BACKLOG history rows and the FO-7a reports. The header (`:10-11`) and `client-money.prisma:8` point to FO-7mv. AG-6-73 is dropped from the source lists.
* **Live database:** no relation, type, function, trigger, constraint or index names the money move tables. The only `%move%` objects are FO-1a's `fo_stage_move`, which is unrelated.
* **Nothing kept depended on the move list.** No remaining trust-entry, payment or refund function reads the move tables. The round-4 review already noted that returns never read the move list. The P-603 deposit-correction rules stay in `money_trust_entry_write`.
* **The rollback comment matches.** I ran the comment's statements as written (`:18-28`) in a transaction on the migrated scratch database:
  * they completed without error;
  * afterwards no `money_%` relation, no `money_%` function and no `Money%` type was left (0 / 0 / 0);
  * the counts it names agree with the migration: 12 tables, 21 functions, 9 types.

### 2. B-20 (a reused prefix prints one number twice): closed
* **Design (`:628-685`):**
  * When a series that has given numbers leaves a non-default prefix, the old prefix goes into `used_prefixes`, which is the database's on insert and update.
  * Another kind taking a prefix in that list is refused (23514).
  * Each prefix-changing write first touches the firm's `money_payment_settings` row.
* **The break report's case, reproduced:** firm B prints `XA-0001` on an invoice. Then:
  * the invoice series moves to `INV-` (`used_prefixes = {XA-}`);
  * `INSERT … ('CREDIT_NOTE','XA-')` is refused (23514);
  * `ON CONFLICT DO UPDATE SET prefix='XA-'` on a receipt series is refused (23514);
  * a default `DR-` series renamed to `XA-` is refused (23514);
  * writing `used_prefixes` directly (NULL, `'{}'`, or a value on insert) is refused (23514).
* **Concurrent writers, `psql` sessions, two runs at each level:**

| Race | READ COMMITTED | REPEATABLE READ |
|---|---|---|
| T1 moves the invoices off `Qx-` (holding 1.5 s) while T2 inserts a credit-note series `Qx-` | T2 waits on the settings row, then is refused (23514) | T2 gets 40001 at the touch |
| T1 issues the **first** invoice under `QZ-` (0 → 1 numbers) while T2 renames the series to `INV-` | T2 waits on the series row, reads `numbers_taken = 1` and records `{QZ-}` | T2 gets 40001; a retry records `{QZ-}` |

  In every case, a credit-note series `QZ-` taken afterwards is refused. Two reasons hold this together:
  * the unique `(firm_id, prefix)` index covers the live prefixes;
  * the defaults are reserved by `money_number_series_default_prefix_check`, so the default-prefix first use (which takes no lock) cannot collide.
* **The settings touch is cheap.** It takes FOR NO KEY UPDATE, which does not block the FOR KEY SHARE that foreign-key checks take, and nothing else locks that row. At REPEATABLE READ, a concurrent edit of the settings row makes a prefix change fail with 40001, which is fail-safe.
* **AG-6-44 rule 2 holds:** with no number taken, `next_number` 1 → 500 → 10, together with a prefix change to `XD-`, is accepted. After a number, a reset to 1 is refused (23514).
* **Rule 5 holds:** a prefix change applies to the next number only, issued numbers are stored text, and a series may return to its own earlier prefix (`XA-` → `INV-` → `XA-`) without a duplicate entry in the list.
* **The tests would catch a removal.** The `TOR-` cases at `check_fo7a_money_schema.ts:281-284` name the refusal message, so they fail without the fix. The race case alone would not always catch a removal, because the order in which the two writers run decides it; the sequential case covers that.

### 3. B-21 (invisible text passes `money_text_ok`): closed as reported
* **How the check works now (`:441-444`):** the listed invisible characters are removed, and what is left must match `[[:alnum:][:punct:]]` under `pg_c_utf8`. Under PostgreSQL 18 (Unicode 16.0), the posix "punct" class is Unicode punctuation or symbol, excluding letters.
* **Refused:** all 21 break-report characters (the suite), plus U+2062, U+180E, U+3164, U+FFA0, U+115F, U+0080 alone, U+1D455 and U+2FFFE.
* **Accepted (real text in many scripts):** Thai, Inuktitut syllabics, Cherokee, Hangul (precomposed and conjoining jamo), Ethiopic, Mongolian, Tifinagh, a Roman numeral (Nl), mathematical bold A, a ZWJ family emoji, a Canadian flag, keycap 1, `-`, `°` and `123`.
* **`pg_c_utf8` is not new to main.** PF-21's migration (`20261114234500_pf21_complaints:115`) already uses it, so the PostgreSQL 16 fallback in `tools/new-machine.sh` already fails on main. That belongs to the tech lead, not this row.

### 4. Merge of main and `check_pf0p_ports.ts`: correct
* **`platform.prisma` against main** (`d52b7274e`, still main's head after `git fetch`):
  * The only difference is the one line `moneySettings MoneyPaymentSettings?`, now under `// back-relation slot: money (FO-7a)` in `PlatformFirm`, as Lead B ruled.
  * The old free-standing line is gone.
  * `PlatformStaff`'s money slot stays empty.
  * The migration stamp `20261115042334` is still later than main's newest (`20261115013000_fo13_compliance_tables`).
* **`check_pf0p_ports.ts:803`:** I ran both the old and the new mutation against the head file, with the slot filled and with it emptied.
  * Filled slot: the old mutation finds nothing (so the case FAILs), while the new one finds exactly one problem ("touches the slot above").
  * Empty slot: both mutations find exactly one problem.
  * So the new form works for a filled or an empty slot, and the case still fails when the rule is broken.

### Builder's choices
1. **`pg_c_utf8` needs PostgreSQL 17 or later: accepted.** Main already depends on it (PF-21). CI (`deploy/compose.test.yml`, `postgres:18.3`) and this machine run 18.
2. **Text made only of non-ASCII digits is refused: accepted as a Minor.** See m2.
3. **"A prefix is recorded only after numbers were taken under it": accepted, but the wording is not exact.** The code records an old prefix whenever the series has given any number, not only numbers under that prefix. Reproduced: `INV-` with numbers → `QM-` (prints nothing) → `QN-` gives `used_prefixes ∋ QM-`, and a credit-note series `QM-` is then refused. That over-reserves an unused prefix, which is safe and breaks neither AG-6-44 rule 2 nor rule 5. It is not a finding.

### Findings
No Blocker. No Major.

**m1 (Minor, B-21 residue): two Egyptian blank letters still pass alone.**
* `money_text_ok(U&'\+013441', 200)` and `money_text_ok(U&'\+013442', 200)` are both true. They are EGYPTIAN HIEROGLYPH FULL BLANK and HALF BLANK, letters (Lo) that render as empty space.
* They are the only blank letters, symbols or punctuation marks I found outside the strip list. The rest of Unicode's default-ignorable set is listed or unassigned.
* Fix, the same rule, one range: add `\U00013441-\U00013442` to the strip list at `:443`, with the two characters in the `b21` test array. It can wait for FO-7b.

**m2 (Minor, builder's choice 2, more cases than listed): real text made only of digits or numbers outside ASCII is refused.** Each of these alone is false:
* full-width `１２３`, the realistic case: a cheque `reference` typed with a Japanese IME;
* Arabic-Indic `١٢٣` and Devanagari `१२`;
* `½`, `²` and `①`.

With any letter, ASCII digit or symbol beside them, they pass. The columns concerned include `reference` (200) and `tax_number` (40). No change is asked of this row. FO-7b can normalise input with NFKC, which turns full-width digits into ASCII, and show the field error.

**Not checked:** CI on this head; the breaker's B-20/B-21 pass; Lead B's review of the area file; the tech lead's ruling on the PR size question.

Verdict: Approve
