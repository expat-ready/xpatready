# FO-7ts part 2 — breaker reports (Opus, high effort), rounds 1 to 5

---

<!-- p2-break-report.md -->
# Break report: FO-7ts part 2 (head 692ea4be), database only

Breaker, 18 Nov. PostgreSQL 18.3 at 127.0.0.1:54329. I applied all 109 migrations with `psql -1 -f` into `xr_studio_bp2_tpl`, then attacked copies of it (`xr_studio_bp2_a`, `_r0`, `_r1`, `_rd`, `_rc`). All of them were dropped at the end. Scripts are in `/tmp/claude-0/-home-user-xpatready/bcb2f4a2-3196-5aff-b031-2c36e7d7b722/scratchpad/breakp2/`:
* `h.mjs` holds the helpers.
* `a_pair.mjs`, `b_credit.mjs`, `c_more.mjs`, `d_walls.mjs`, `e_seed.mjs` and `f_vol.mjs` hold the attacks.
* `fp.sql` is the catalog fingerprint.

Run each attack script with `DB=<db> node <script>`.
"M:" means `migration.sql` at 692ea4be.

## Findings

### Blocker

**B5. Reversing an APPLIED entry creates credit nobody paid (M:302-315).**
* Repro: KEPT 300 from invoice I0. Apply the 300 to draft I (total 1,000), so 700 is due. Issue I. The client pays 1,000 into operating, so I is paid over by 300, and KEPT 300 is taken from that payment. Then write `REVERSED +300` of the APPLIED entry with the reason "Applied in error".
* Expected: refused, because I would no longer be paid over while 300 is still kept from it.
* Actual: accepted. I's due is now 0 (paid exactly), and the holder's credit is **600**. It should be 300, since the client paid 1,000 on a 1,000 invoice and held 300 before.
* Why: the REVERSED branch checks only "never more than the entry". It never re-checks the brief's rule "KEPT on one payment, net of its REVERSED, never exceeds what that payment left over after its invoice" for the invoice it re-opens.

**B8. Applied credit does not pin the draft's holder or currency (M:290-301 runs only on the credit insert; `money_invoice_write` allows the changes on a draft).**
* Repro: apply client P's CAD credit to P's draft. Then run `update money_invoice set person_id = Q`. On another draft, run `set case_id = <other case>`. On a third, set the invoice and then its line to `currency = 'USD'`, and issue it (it becomes INV-0002).
* Expected: refused (AG-6-21 rule 5: "APPLIED only to an invoice of the same holder and currency").
* Actual: all three are accepted. P's credit now pays Q's invoice and another case's invoice. CAD 50 counts as USD 50 on an issued USD invoice.

### Major

**B7. A draft's lines can change after credit is applied to it (`money_invoice_line_write` never reads credit).**
* Repro: apply 200 to a 300 draft. Cut the line to 50, then delete the line.
* Expected: refused (the builder's own reading: APPLIED ≤ what is due).
* Actual: both accepted. Due is −200, so 200 of credit sits on a 0.00 draft. Deleting the draft is refused (RESTRICT), so that part held.
* This is the brief's named attack. "Apply credit" is offered on the next draft, so editing after applying is the normal flow.

**B4. An operating refund after KEPT pays the same 200 out twice (M:287 is checked only at KEPT time; `money_refund_write` never reads credit).**
* Repro: invoice 1,500, paid 1,700, KEPT 200. Then `money_refund` of 200 on that payment (route OFFLINE), then APPLIED −200 to a new draft.
* Expected: one of the three is refused.
* Actual: all accepted. The client got 200 back, and the same 200 also paid a draft.
* The builder lists this as a known gap ("FO-7a's refund trigger is outside this touch list"), but the brief's invariant fails.

**B6. Trust returned after KEPT counts the 200 twice (same class as B4; not in the builder's notes).**
* Repro: invoice 1,500 paid 1,500 from trust plus 200 into operating, KEPT 200. Then a CORRECTION of +1,500 naming the withdrawal (money returned to trust).
* Expected: refused, or the kept credit limited.
* Actual: accepted. The invoice owes 1,300 (so the 200 counts as paid), the credit is 200, and trust is 1,500.

**R1. The rollback note silently destroys the credit ledger (`rollback.sql`:6-11).**
* Its header says to run it "before any MOVE_TO_CASE entry or credit entry exists that must be kept (it refuses otherwise)". The guard checks only MOVE_TO_CASE.
* Repro: a copy with one KEPT row and no moves, then `psql -1 -f rollback.sql`.
* Actual: exit 0, and `money_credit_entry` is dropped along with its rows. On a copy that has a move it does refuse, correctly.

### Minor

**B13. A trust withdrawal can pay an invoice that credit already paid in full.**
* Repro: a 300 draft, APPLIED 300, issue, then `WITHDRAWAL_TO_INVOICE −300`.
* Actual: accepted, and due is −300.
* Control: the same happens today with an invoice paid into operating (FO-7a2's trust cap counts only credit notes and write-off). So credit is one more payment source the trust guard does not see. This needs a ruling from the tech lead (Code s. 32), not a fix in this row.

**B15. Saving a draft line and applying credit in one transaction deadlocks (40P01) against another credit write on the same party and draft.**
* This is the builder's known order exception (`money_invoice_line_write` share-locks the invoice before the party lock). It is confirmed live.

**R2. The migration cannot be re-applied after `rollback.sql`.**
* The enum value stays, as documented, but the migration's line 21 is a plain `ALTER TYPE ... ADD VALUE 'MOVE_TO_CASE'` (no `IF NOT EXISTS`). Re-applying fails with "enum label already exists".
* Otherwise the catalog after rollback matches the pre-migration copy exactly (6,395 fingerprint lines; the only difference is the enum label).

**B11b. Any party on a case can refund that case's credit.**
* Repro: credit kept for case C from P's payment. Party Q writes `REFUNDED −200` on case C.
* Actual: accepted. The holder is the case, as the brief says, so this may be the route's job (who may be paid back). Noted only.

Note, not a finding (outside the brief): KEPT is accepted from an uncleared operating cheque, and the credit can be applied at once (B12).

## What held
* **A1, split pair:** a − half alone is refused at commit (23514). A + half on a second connection naming an open − half waits on the party lock and never pairs.
* **A2, abusing the − half's exemption:**
  * `SET CONSTRAINTS ... IMMEDIATE` (before the pair, or after a lone − half): refused.
  * A + half rolled back to a savepoint: refused at commit.
  * Two − halves sharing one +: refused.
  * A − half in a released savepoint with the + half after it: correctly accepted.
  * Party balance unchanged throughout.
* **A3, moving from a party below zero:** pre-case −50 is refused ("Only CAD 0.00"). With the party at −20 (pre-case +30, case −50), moving 30 is accepted per Build Lead C's ruling, and a further 0.01 is refused.
* **A4, correcting a move:** a CORRECTION of either half, including as RECORDED_BY_MISTAKE, is refused.
* **A5, mismatched pairs:**
  * Refused: a + half in another firm (23503), a company + on a person −, and a USD move with only CAD held.
  * USD 40 of 40 and a company pair are accepted; 0.01 more is refused.
* **A6, A6b, concurrent moves (READ COMMITTED and REPEATABLE READ):**
  * A move over pre-case while a deposit lands is refused, and the balance stays exact.
  * With 5 connections each moving 100 of 300: at RC 3 commit and 2 get 23514; at RR 1 commits and 4 get 23505. Pre-case never goes below 0, and no seq is duplicated.
* **A7, A8:**
  * Two parties pairing onto one case at once: both accepted, as expected.
  * A pair of the integer maximum is accepted; −2^31 is refused (22003).
* **B1, applying one credit twice (RC and RR):** with two drafts, or 150 + 150 on one draft, one commits and the other gets 23514, 23505 or 40001. Credit never goes below 0.
* **B2, credit applied while the KEPT is being reversed (RC and RR):** one commits, and the credit ends at 0.
* **B3, KEPT limits:**
  * KEPT from a trust payment: refused.
  * Two payments on one invoice: the cap is per invoice (150, then 100 refused, then 50).
  * KEPT on payments A and B at once (RR): 40001.
* **B9, applying to the wrong invoice:** another party's, another case's, CAD credit to a USD draft, USD with no USD credit, and a person/company mix are all refused.
* **B10, reversal limits:** REVERSED of a REVERSED or of a REFUNDED, a reversal over the entry, one by another party, and one on a case are all refused. A reversal up to the entry is accepted.
* **B11, two parties on one case (RC and RR):** one commits (23514 or 23505 on `money_credit_entry_case_seq`). No seq fork.
* **B14, text and database-set values:** reasons that are empty, spaces only, or 201 characters are refused; a non-English reason is accepted. A reason on APPLIED is refused, and a blank `created_by` is refused. Supplied `seq`, balance and time are replaced by the database's.
* **B16, deadlocks:** 10 rounds of 5 writers at once (credit APPLIED, trust withdrawal, credit note, move batch line, credit REVERSED) on one party and invoice produced no 40P01.
* **DW13 ordering inside the triggers:** party lock first, then the invoice row.
* **W1, PF-12 walls as xr_app:**
  * Reading another firm's rows returns 0.
  * Refused: inserting rows of another firm or with no firm set (42501), and naming another firm's payment, entry or invoice (23503).
  * Refused: UPDATE, DELETE and TRUNCATE; disabling the trigger; `session_replication_role`.
  * `money_invoice_due` called on another firm's invoice returns 0.
  * Switching `app.firm_id` between the halves: refused.
* **Volume:**
  * A pair after 2,000 entries on one party: 2.2 ms.
  * APPLIED after 2,000 credit entries: 1.6 ms (the trigger takes 1.0 ms).
  * Both seq lookups use the partial indexes.

Breaker: fail 692ea4be

---

<!-- p2-break-report-r2.md -->
# Break report, round 2: FO-7ts part 2 (head 736346af), database only

Breaker, 18 Nov. PostgreSQL 18.3 at 127.0.0.1:54329.
* I exported `prisma/` at 736346af into `breakp2/r2/src/` and applied all 108 migrations with `psql -1 -f` into `xr_studio_bp2r2_tpl`.
* `xr_studio_bp2r2_pre` holds every migration except this row's, as the control.
* I attacked copies (`_a`, `_b`, `_r0`, `_r1`, `_rc`). Every `xr_studio_bp2r2_*` database was dropped at the end.
* The round-1 scripts are in `/tmp/claude-0/-home-user-xpatready/bcb2f4a2-3196-5aff-b031-2c36e7d7b722/scratchpad/breakp2/`, run unchanged. The new ones are in `.../breakp2/r2/s/`: `g_recheck`, `h_new`/`h_new2`, `i_legit`/`i_legit2`, `j_pre`, `k_b8`, `m_cn`.
* "M:" means `20261118220000_fo7ts_ledgers/migration.sql` at 736346af. "FO-7a:" means `20261115042334_fo7a_client_money_tables/migration.sql`.

## Round-1 findings, re-run
| Finding | Result now |
|---|---|
| B5 (Blocker) | **Fixed.** Reversing the APPLIED is refused (23514, "must stay paid over"), and the credit stays 300. |
| B8 (Blocker) | **Fixed.** Changing the draft's party, case, currency (invoice first or line first), or person to company of the same uuid: all refused. |
| B7 (Major) | **Fixed at READ COMMITTED.** Cutting or deleting the line is refused. **Not fixed at REPEATABLE READ** (N4 below). |
| B4 (Major) | **Fixed.** Refunding 200 and then 0.01 is refused. After REVERSED of the KEPT, the refund is accepted. With 1,800 paid, 100 of refund passes and 0.01 more is refused. |
| B6 (Major) | **Fixed.** The trust return is refused while 200 is kept. |
| R1 (Major) | **Fixed.** The rollback on a copy with one KEPT row raises "credit entries are recorded", and the row stays. |
| R2 (Minor) | **Fixed.** Rollback, then re-apply: exit 0. After the rollback the catalog matches `_pre` (6,395 fingerprint lines; the only difference is the enum label). After the re-apply it matches the template (6,476 lines). |
| Uncleared cheque (note) | **Fixed.** KEPT is refused until the cheque clears. |
| B13 (Minor, for the tech lead) | Still accepted, as recorded. N6 below adds credit notes and write-offs. |
| B15 (Minor, known) | Still 40P01. |
| B11b (noted) | Still accepted; it is a route rule, as recorded. |

## New findings

### Major

**N9. The new refund trigger takes the party lock *after* FO-7a's payment-row lock, so refunds now deadlock (40P01) with credit and with FO-7a's own flows.**
* Where: M:371-382 (`money_refund_credit_kept`, AFTER INSERT, party lock) and FO-7a:1051 (`money_refund_write`, payment row `FOR UPDATE`).
* A KEPT insert takes the party lock (M:258), and then its foreign-key check takes `FOR KEY SHARE` on the same payment row (M:44). So "party lock, then payment row" and "payment row, then party lock" both exist now. DW13's "one lock order" no longer holds.
* N9d: KEPT 100 and a 50 refund of one payment (300 paid over), one statement each, started together. Result: **40P01 in 99 of 100 rounds** (RC and RR alternating). This is the B4 pair itself. No money goes wrong, but the writer gets a deadlock instead of a clean refusal.
* N9a, N9c: T1 writes to the party (KEPT from invoice 1, or a trust REFUND_TO_CLIENT). T2 refunds a payment of that party. T1 then keeps from that payment. Result: 40P01 at RC and RR.
* **This blocks legitimate FO-7a flows with no credit at all:**
  * N9e: T1 writes a credit note on J and then refunds J's payment, while T2 refunds that payment in between.
  * N9b: T1 refunds payment 1 and then payment 2 of one party, while T2 refunds payment 2.
  * Both give 40P01 at RC and RR. On `_pre` the same steps only wait; there T1 queues behind T2's row lock and no deadlock is detected.

**N4. B7 still breaks at REPEATABLE READ: credit applied to a draft whose line was cut or deleted under it.**
* Where: M:290-298 and M:394-407; FO-7a:830.
* Repro: T1 (APPLIED 200) and T2 (line cut to 50, or line deleted) both take their snapshot. T2 writes and commits first, then T1 inserts the APPLIED.
* Expected: one of them is refused.
* Actual: both commit. The draft's total is 0.00 (or 50.00) with 200 applied, and its due is −200.00 (or −150.00).
* Why: FO-7a's line writer only share-locks the invoice row (FO-7a:830). The APPLIED's `UPDATE money_invoice` therefore finds a row that was locked but not changed, and no 40001 is raised. `money_invoice_due` then reads T1's old snapshot.
* The other order, and both orders at RC, held.

### Minor

**N6. A credit note or a write-off is accepted on an invoice that applied credit already paid.**
* Repro: invoice 300 paid in full by APPLIED 300, then a full credit note of 300. Due is −300.00, and the 300 of credit sits on a cancelled invoice. A write-off of 100 on a 100 invoice paid by credit gives due −100.00.
* This is the same class as B13: FO-7a's `money_issued_invoice` open amount sees neither credit nor operating payments. REVERSED of the APPLIED recovers the credit.
* For the tech lead, with B13.

**L5. The pin outlives the credit: a draft that ever held credit can never change client or be deleted.**
* Where: M:412-414 counts entries already reversed; M:45 is RESTRICT.
* Repro: apply 200 to P's draft, then REVERSED +200 ("Wrong client"). Changing the client to Q is refused (23514). Deleting the lines and then the draft is refused (23001, `money_credit_entry_firm_id_invoice_id_fkey`).

Note, not a finding (no route yet): on a draft holding credit, a "replace the lines" save must insert before it deletes. Delete-then-insert in one transaction is refused row by row (M:407 is not deferred). Insert-then-delete is accepted.

## What held
* **The new triggers, attacked directly:**
  * A REVERSED of a KEPT whose credit is already applied: refused.
  * A line moved to another draft: refused (FO-7a).
  * A credit note after KEPT, then a refund of the credited 300: accepted, and 0.01 more is refused (N7).
* **Multi-row and CTE writes:** two 60 refunds in one INSERT; refund plus APPLIED in a CTE, both orders; refund plus KEPT in a CTE, both orders. All refused, and kept never exceeds what was paid over (N8).
* **A payment's `invoice_id`, `received_into` or amount after KEPT:** cannot change (FO-7a; only the Cleared tick may change).
* **Races at RC and RR:**
  * N1: KEPT against the trust return, both orders. One is refused (23514 or 40001), because the return touches the invoice row.
  * N2: KEPT against a refund, both orders.
  * N3: REVERSED of the APPLIED against KEPT on the same invoice.
  * N10: APPLIED against a change of the draft's client, both orders.
  * N4 held at RC in both orders, and at RR when the APPLIED goes first.
* **Legitimate flows:**
  * L1, FO-7a with no credit: add, edit and delete draft lines, delete the draft, issue, pay, a full refund, a credit note, a write-off.
  * L2, FO-7a2 with KEPT 200: trust paid, then moved to operating (FO-7mv), then a credit note with OVERPAID_TO_TRUST and with OVERPAID_REFUND.
  * L3, FO-7mv: undoing a move batch on an invoice with KEPT.
  * L4: issue a draft that holds credit, change its due date, pay the rest, reverse the applied credit.
  * All accepted.
* **The round-1 matrix re-run unchanged:**
  * Held: A1-A8 (the move pair, including RC and RR concurrency), B1-B3, B9, B10, B11 (RC and RR), B14, and the PF-12 walls W1.
  * B16: 10 rounds of 5 writers produced no 40P01.
* **Volume:**
  * 400 lines on a draft holding credit: 1.0 ms per line insert, and one UPDATE of all 400 lines takes 149 ms.
  * 99 refunds on an invoice with 100 payments and a KEPT: 2.4 ms each.
  * APPLIED after 2,000 credit entries: 1.5 ms.

Breaker: fail 736346af

---

<!-- p2-break-report-r3.md -->
# Break report, round 3: FO-7ts part 2 (head 5397b60b), database only

Breaker, 18 Nov. PostgreSQL 18.3 at 127.0.0.1:54329.
* I exported `prisma/` at 5397b60b into `breakp2/r3/src/` and applied all 108 migrations in order with `psql -1 -f` into `xr_studio_bp2r3_tpl`.
* `xr_studio_bp2r3_pre` holds every migration except this row's, as the FO-7a control.
* `xr_studio_bp2r3_old` is the template with `money_credit_entry_write` put back to its 736346af body (no line lock), as the control for the N4 change.
* I attacked copies (`_a` to `_g`, `_r0`, `_r1`). Every `xr_studio_bp2r3_*` database was dropped at the end.
* The round-1 and round-2 scripts were run unchanged. The new ones are in `.../breakp2/r3/s/`: `h3`, `n_r3` (T1-T8), `o_fo7a` (O1-O6), `p_one`, `q_vol`. Their output is in `.../breakp2/r3/out/`.
* "M:" means `20261118220000_fo7ts_ledgers/migration.sql` at 5397b60b. "FO-7a:" means `20261115042334_fo7a_client_money_tables/migration.sql`.

## Round-2 findings, re-run
| Finding | Result now |
|---|---|
| N9 (Major) | **Fixed.** Over 300 rounds of a KEPT racing a refund of one payment, single statements, no 40P01 and kept was never more than paid over: N9d 0/100, T1 0/100 at RC (51 both commit, 49 refused 23514) and 0/100 at RR (each round one refused 40001). N9a, N9b, N9c and N9e (credit note, then refunds) gave no 40P01 at RC or RR. At RR the stale second refund is refused 23505 by FO-7a's ordinal, as the build notes say. |
| N4 (Major) | **Fixed.** The line cut and the line delete were each raced against APPLIED, at RC and RR, in both orders. One side is always refused (23514 or 40001), and due stays ≥ 0. |
| N6, L5 (Minor) | Still accepted, as recorded for the tech lead: due −300.00 and −100.00; the client change is refused 23514; the delete is refused 23001. |

## Round-1 findings and the matrix, re-run
* **Fixed, and still fixed:**
  * B5, B6, B7, B8 / B8c, B4 / B4b, and B12 (the uncleared cheque).
  * R1: the rollback with one KEPT row raises "credit entries are recorded", and the row stays.
  * R2: after the rollback, the catalog has 6,395 fingerprint lines, the same as `_pre` apart from the `MOVE_TO_CASE` enum label. After the re-apply it is identical to the template (6,477 lines; one more than round 2, the new trigger).
* **Still as recorded:** B13 accepted (for the tech lead); B15 still 40P01 (known); B11b accepted (a route rule).
* **Held:**
  * A1-A8, B1-B3, B9, B10, B11 (RC and RR), B14, B16 (no 40P01), and the W1 walls.
  * N1, N2, N3, N5, N7, N8 and N10 (RC and RR, both orders).
  * The legitimate flows L1-L4 and L6. In i_legit's L6 my script keeps more than the payment, so it fails; I used i_legit2's fixed copy, as in round 2.

## New finding

### Major

**N11. APPLIED's new line lock runs in the opposite order to FO-7a's line writer. Applying credit to a draft while its lines are saved now deadlocks (40P01).**
* Where:
  * M:295 runs `PERFORM 1 FROM money_invoice_line ... FOR SHARE` after M:291, which updates `money_invoice` (the draft row).
  * FO-7a's line UPDATE or DELETE locks the line first: PostgreSQL locks the old row before a BEFORE ROW trigger runs. Then `money_invoice_line_write` takes `FOR SHARE` on the draft row (FO-7a:830).
  * So the two locks are taken as "draft row, then line" in APPLIED and "line, then draft row" in the line writer.
* **Random race, two sessions** (`p_one`, `n_r3 t8`): APPLIED 100 and one line save on the same draft, single statements started together, 100 rounds each:

| Race (100 rounds each) | 5397b60b | `_old` |
|---|---|---|
| One-line update, RC | 40P01 in 6 | 0 |
| Two-line update, RC | 40P01 in 13 | 0 |
| Two-line update, RR | 40P01 in 8 (other rounds 40001) | 0 |
| Delete one of two lines, RC | 40P01 in 1 | 0 |
| With issue added, RC | 40P01 in 8 | 0 |
| With a header save added, RC | 40P01 in 6 | 0 |
| Line insert | 0 | 0 |

  No round left due below 0, so no money goes wrong. But the draft editor's save, or the Apply-credit save, gets a deadlock instead of a wait. This is the same class as round 2's N9.
* **Deterministic repro, three sessions at RC** (`n_r3 t7`):
  1. T3 holds the draft row: a header save (`UPDATE money_invoice SET due_date`) or FO-7a's issue step, not yet committed.
  2. T1 inserts APPLIED 100, which queues on the draft row.
  3. T2 updates the draft's line, which locks the line and queues.
  4. T3 commits.
  * Expected: one waits, or there is a clean refusal.
  * Actual: T2 gets **40P01**, in both the header case and the issue case.
  * On `_old` the same steps give "both accepted" (header) or a clean 23514 "issued invoices can't be edited" (issue).
  * If T2 queues before T1, it holds. At RR, both T1 and T2 get 40001.
* A possible direction, not tested: share-lock the lines *before* the draft row, the same order as FO-7a's line writer.

## New attacks that held
* **T3, a refund racing a reversal of the APPLIED** (RC and RR, both orders). Setup: J is paid over by 300 and 200 of that is kept. One transaction reverses 100 of the APPLIED and the other refunds 100. One side is always refused (23514 at RC, 40001 at RR), and kept stays ≤ paid over.
* **T4, a refund racing a reversal of the KEPT** (RC and RR, both orders): no 40P01, and kept stays ≤ paid over. At RR, a refund on a stale snapshot is refused (23514), which is safe.
* **T5, APPLIED against line changes** (RC and RR, both orders), with steps in open transactions:
  * Line insert: accepted, or 40001 at RR.
  * Delete one of two lines: one side refused.
  * Insert then delete: one side refused.
  * Line moved to another invoice: refused by FO-7a.
  * Due stayed ≥ 0, and there was no 40P01.
* **T6, APPLIED against FO-7a's issue step** (RC and RR, both orders): both commit at RC; one is refused 40001 at RR; no 40P01. Issue reads the lines without a lock, so the share lock does not block it.
* **FO-7a's refund flows (O1-O6), compared with `_pre`; the same results unless noted:**
  * A CARD refund with a `re_` id; a CARD refund of an e-transfer refused; an offline refund of a card payment; an over-refund refused.
  * Three refunds up to the full amount, then 0.01 refused; an idempotent retry refused 23505; a refund of an operating payment with no invoice.
  * Three 150 refunds of one 300 payment at once, 30 rounds each: never over-refunded, no 40P01, the same refusals as `_pre`.
  * O5 (one transaction refunds p1 then p2, the other p2 then p1) is now better: ok,ok at RC; ok,23505 at RR. `_pre` gives 40P01 at both.
  * Note, not a finding: O6. Refunds on two *different* invoices of one party now wait for each other (426 ms here against 20 ms on `_pre`), because every refund of an operating payment on an invoice takes the party lock, even with no credit. That is DW13's design.
* **Volume:**
  * 400 lines on a draft holding credit: 1.5 ms per insert, and the 400-row update takes 94 ms.
  * 99 refunds on an invoice with 100 payments and a KEPT: 2.3 ms each.
  * APPLIED after 2,000 entries: 2.5 ms.
  * APPLIED on a 500-line draft (the most lines a draft can have): 2.6-3.8 ms, against 2.7-6.0 ms on `_old`.

Breaker: fail 5397b60b

---

<!-- p2-break-report-r4.md -->
# Break report, round 4: FO-7ts part 2 (head c3bb10de), database only

Breaker, 18 Nov. PostgreSQL 18.3 at 127.0.0.1:54329. I ignored the partial round-4 files on db1162d1.
* **Setup.** I exported `prisma/` at c3bb10de into `breakp2/r4b/src/` and applied all 108 migrations in order with `psql -1 -f` into `xr_studio_bp2r4b_tpl`. The only stderr was NOTICEs.
* **Controls.** `_pre` has every migration except this row's. The others are the template with `money_credit_entry_write` swapped:
  * `_r3`: the 5397b60b body.
  * `_d1`: the db1162d1 body.
  * `_old`: the 736346af body, with no line lock.
  * `_alt`: my untested direction, described under N12.
* **Housekeeping.** Every script ran on its own copy. All 66 `xr_studio_bp2r4b_*` databases are dropped, along with the leftover `bp2r4_*` databases from the stopped run. The repository is untouched.
* **Scripts and output.** The new scripts are `.../breakp2/r4b/s/u_r4b.mjs` (U1-U8) and the runners `run_*.sh`. Output is in `.../breakp2/r4b/out/`. "M:" means `20261118220000_fo7ts_ledgers/migration.sql` at c3bb10de. 55P03 is lock_not_available and is counted apart from 40P01 (deadlock).

## The re-runs you asked for
* **N11 (Major): fixed in the cases it named.** These are 100-round races of APPLIED against a line write, single statements started together (`p_one`, `n_r3 t8`, U1):

| Race (100 rounds each) | 5397b60b (r3) | c3bb10de, RC | c3bb10de, RR |
|---|---|---|---|
| One-line update | 40P01 in 6 | 0 | 0 (55P03 in 100) |
| Two-line update | 40P01 in 13 (RR: 8) | 0 | 0 (55P03 99, 40001 1) |
| Delete one of two | 40P01 in 1 | 0 | 0 (55P03 97, 40001 3) |
| Line insert | 0 | 0 | 0 (40001 3) |
| With issue added | 40P01 in 8 | 0 (23514 86) | 0 (40001 91, 55P03 98) |
| With a header save added | 40P01 in 6 | 0 | 0 (40001 104, 55P03 88) |

  * In the three-session repro (`n_r3 t7`), all 8 cases hold.
  * At RC: header, both accepted; issue, a clean 23514.
  * At RR: 40001 or 55P03 on the apply, and 40001 on the line.
* **The reviewer's D2 (U2): holds.** T1 saves the header (or issues), T2's line update or delete waits, then T1 applies 200 and commits.
  * At RC: no 40P01 in 4 of 4. T1 commits; T2 is ok or refused with 23514; due is never below 0.
  * At RR: T1 gets 55P03 in 4 of 4, T2 commits, and there is no 40P01.
  * On `_r3` and `_d1`, the same case gives 40P01 in 8 of 8.
  * Note: at RR, `_old` commits T1 (and T2 fails 40001). Now T1's whole transaction (its header save or its issue) is lost to 55P03. One side fails either way.
* **N4: holds at RC and RR, in both orders.**
  * U3 cuts the line in open transactions:
    * RC: apply-first gives 23514 on the cut; cut-first gives 23514 on the apply.
    * RR: apply-first gives 40001 on the cut; cut-first gives 55P03 on the apply.
    * Stale snapshot: 23514 at RC and 40001 at RR.
  * `n_r3 t5` (insert, delete, insert then delete, move): all 16 cases held.
  * U7, 100 rounds each, where APPLIED 200 and the line change together break the rule:

| U7 (100 rounds each) | c3bb10de | `_old` |
|---|---|---|
| RC (cut one line, delete one of two, cut both) | one side refused, 23514 in every round | the same |
| RR | 55P03 72-83 and 40001 17-28 a run; both accepted 0; due < 0 in 0 | both accepted 68-80 a run, due < 0 |

* **N9: holds.**
  * T1 at RC: 51 rounds both commit and 49 are refused with 23514. At RR: 100 refused with 40001. There is no 40P01, and the invariant was never broken.
  * T3 and T4 held, and the `r2` N9 scripts (`h_new`, `h_new2`, `g_recheck`, `j_pre` on `_pre`) gave the same verdicts.
* **The whole matrix: every verdict is the same as round 3.** That covers a_pair, b_credit, c_more, d_walls, f_vol and all the `r2/s` scripts.
  * Some differences are only which racer wins.
  * In the RR N4 cut-first and delete-first cases, the refusal changed from 40001 to 55P03.
  * Still as recorded: B13 accepted, B15 40P01 (known), N6 and L5 accepted, and i_legit's script bug.
* **The rest held.**
  * R1: the rollback with one KEPT row raises "credit entries are recorded", and the row stays.
  * R2: after the rollback the catalog matches `_pre` (6,395 lines) apart from the `MOVE_TO_CASE` enum label. After the re-apply it is identical to the template (6,477 lines).
  * T6 held at RC and RR.
  * O1-O6 matched `_pre`. O5 is ok,ok at RC and ok,23505 at RR, where `_pre` gives 40P01. O6 took 611 ms against 32 ms, which is DW13's design.
  * Volume: APPLIED on a 500-line draft takes 2.7-6.3 ms at RC. In U8 (500 lines, draft or issued, RC or RR, run under load) the times were 10-42 ms, the same range as `_old`.

## New finding

### Major

**N12. The line lock now runs before the row, so a REPEATABLE READ apply deadlocks a normal draft save. The build notes' "55P03, never 40P01" is not true.**
* **Where:** M:292-293 take `FOR SHARE NOWAIT` on the lines, then M:295 updates the draft row (the order from db1162d1). NOWAIT stops the *apply* from waiting on the lines. But once the apply holds them, it waits on the row, and a draft save that already holds the row then waits on the lines.
* **Deterministic, two sessions (U5).** The steps:
  1. T2 is a draft save at RC or RR: a header save, or a line insert, which share-locks the row.
  2. T1 applies 100 at RR.
  3. T2 then updates or deletes an existing line.
  * Expected: T1 waits, then 40001 or ok; or a clean 55P03.
  * Actual: T1 is accepted and **T2 gets 40P01 in 8 of 8** cases.
  * On `_r3` and `_old`: no 40P01 in 8 of 8. The apply gets 40001, or both commit.
* **Random, 100 rounds (U6).** An RR apply races a two-statement draft save, started together:

| Save | c3bb10de | `_d1` | `_r3` | `_old` |
|---|---|---|---|---|
| RC, header then line | 40P01 in **84** | 78 | 0 | 0 |
| RC, insert then line | 40P01 in **72** | 75 | 0 | 0 |
| RR, header then line | 40P01 in **89** | 94 | 0 | 0 |
| RR, insert then line | 40P01 in **89** | 82 | 0 | 0 |

  * Due was never below 0, so no money goes wrong. But the draft editor's save is killed by a deadlock: the class of N9 and N11.
  * At RC (the lock is skipped) there was no 40P01 anywhere.
* **A possible direction, which I tested only in scratch (`_alt`).** It is 5397b60b's order (row first, then lines) with this head's `IF <> 'read committed' ... FOR SHARE NOWAIT`. Results:
  * U6: 40P01 in 0 of 400.
  * U5: 0 of 8 (the apply gets 40001).
  * D2 at RR: 55P03 on T1. At RC: as on this head.
  * N11 (U1, `t7`, `t8`): 0 deadlocks.
  * N4 (U3, U7, `t5`): held.
  * U4's rolled-back holders: the apply commits.

### Minor
**N13. At RR, NOWAIT refuses an apply that would have succeeded.** In U4, T1 (RR) applies while another transaction has a line update or delete open, and that transaction then **rolls back**.
* This head: T1 gets 55P03.
* `_r3`, `_d1`, `_old` and `_alt`: T1 waits, then commits. Nothing changed, yet the apply is refused.
* With an open header save, issue step or other apply, the result is 40001 on every version, the same as before. With an open line insert, T1 commits.
* 55P03 is a new code for the future route to retry or explain; no API writer exists yet.

Breaker: fail c3bb10de

---

<!-- p2-break-report-r5.md -->
# Break report, round 5: FO-7ts part 2 (head b5202cc1), database only

Breaker, 18 Nov. PostgreSQL 18.3 at 127.0.0.1:54329.
* **Setup.** I exported `prisma/` at b5202cc1 into `breakp2/r5/src/` and applied all 108 migrations in order with `psql -1 -f` into `xr_studio_bp2r5_tpl`. The only stderr was NOTICEs. `_pre` has every migration except this row's.
* **Controls.** Each is the template with `money_credit_entry_write` swapped, then re-marked SECURITY DEFINER with its search_path; owner and settings match the template.
  * `_c3`: the c3bb10de body. Its md5 is identical to c3bb10de's own build.
  * `_r3`: 5397b60b. `_d1`: db1162d1. `_old`: 736346af, with no line lock.
  * `_alt`: my round-4 direction. The head's body is `_alt` plus the comment and the wider guard; it is otherwise identical.
* **Housekeeping.** Every script ran on its own copy. All 78 `xr_studio_bp2r5_*` databases are dropped, and no `xr_studio_bp2*` database is left. The repository is untouched.
* **Scripts and output.** `.../breakp2/r5/s/` holds the round-4 scripts, plus `v_r5.mjs` (V1-V4: the build's N12 check, SERIALIZABLE, READ UNCOMMITTED) and `w_r5.mjs` (V5, V6). The runner is `run_all.sh`, and output is in `.../breakp2/r5/out/`.
* **Counting.** 55P03 (lock_not_available) is counted apart from 40P01 (deadlock) throughout.

## The re-runs you asked for
* **N12 (Major in round 4): fixed.** No 40P01 on the head in any of these runs; `_c3` reproduces it each time.

| Attack | b5202cc1 | `_c3` (c3bb10de) | `_alt` | `_r3` / `_old` |
|---|---|---|---|---|
| U5: RC or RR save (header or insert, then a line update or delete), RR apply between | 0 of 8; apply 40001, save ok | 40P01 in 8 of 8 | 0 of 8 | 0 of 8 / 0 of 8 |
| U6: 100 rounds × 4 (RC/RR save; header+line, insert+line) | 40P01 in 0 of 400 (40001 85, 68, 100, 100) | 40P01 in 82, 80, 85, 82 | 0 of 400 | 0 / 0 |
| V1: the build's check (editor header; apply waits on Lock; editor line update, delete or insert; commit) at RR and SERIALIZABLE | 6 of 6: save ok, apply 40001 | 40P01 in 4 of 6 (update and delete) | n/a | `_old`: same as head |
| V2: U6 with the apply at SERIALIZABLE (4 × 100) | 0 of 400 (40001 86, 66, 100, 100) | 40P01 in 86, 66, 97, 89 | n/a | `_old`: 0 |

* **The new guard (`NOT IN ('read committed', 'read uncommitted')`): holds.** At READ UNCOMMITTED, V1 gives save ok and apply ok. V2 gives 40P01 in 0 of 400.
  * `_c3`, whose guard was `<> 'read committed'`, took the lock at READ UNCOMMITTED. There it gave 40P01 in 98-100 of each 100, and in 2 of 3 V1 cases. The new guard removes that.
  * V3 (cut at READ UNCOMMITTED): 23514 in 300 of 300 rounds, with both accepted 0. V4 (stale snapshot at READ UNCOMMITTED): 23514.
* **U1-U8 on the head:**
  * U1, RC: no 40P01 in 600 rounds; "+issue" gives a clean 23514 in 61.
  * U1, RR: no 40P01 in 600 rounds. One-line update: 40001 84, 55P03 16. Two-line update: 40001 85, 55P03 15. Delete one of two: 40001 95, 55P03 5. Insert: 40001 13. +issue: 40001 152, 55P03 8. +header: 40001 168, 55P03 3. Due was never below 0.
  * U2 (the reviewer's D2), RC: T1 ok in 4 of 4; T2 ok once and 23514 three times; due ≥ 0.
  * U2, RR: T1 55P03 and T2 ok, 4 of 4, with no 40P01. `_r3` and `_d1` give 40P01 in 8 of 8, and `_old` commits T1 (T2 40001). This is unchanged from round 4.
  * U3 (N4 cut), RC: apply-first gives 23514 on the cut; cut-first gives 23514 on the apply; stale gives 23514.
  * U3, RR: apply-first gives 40001 on the cut. Cut-first and stale give 40001 on the apply; on c3bb10de cut-first gave 55P03.
  * U7 (100 rounds × 3): at RC, 23514 in every round. At RR, 40001 64-80 and 55P03 20-36 a run. Both accepted 0, due < 0 in 0, no 40P01. `_old` at RR: both accepted 68, 84 and 74 times, with due < 0.
  * U8 (500 lines, five applies each, run under load): 9-30 ms on the head, 9-19 ms on `_old`, 10-42 ms in round 4.
* **N13 (Minor): fixed in the case it named.** U4 has a line update or delete held open at RC or RR, then rolled back.
  * On the head, the RR apply waits on the row and **commits**. `_c3` gives 55P03 for the same case.
  * Line update committed, header, issue, or another apply: the result is 40001 on the head, `_alt` and `_old`.
  * 55P03 is now left only where a line writer is already waiting behind the apply's own transaction (U2 at RR). There, waiting would deadlock.
* **N11: holds.** `p_one`, `n_r3 t7` (8 of 8) and `t8` give no 40P01. The `t8` RR refusals moved from mostly 55P03 to mostly 40001.
* **N4: holds at RC and RR, in both orders.** U3, U7, `n_r3 t5` (16 of 16) and V3/V4 at SERIALIZABLE all held.
  * SERIALIZABLE: V3 has both accepted 0 (40001 70-76, 55P03 24-30). V4 stale gives 40001.
  * On `_old`, SERIALIZABLE stale is accepted with due -150.00, the original N4, now covered.
  * In `t5`'s "move" case the apply is now accepted, and the move is refused by "a line never moves to another invoice or firm". Due 100.00.
* **N9: holds.** `n_r3 t1`, `t3` and `t4` are all held, and so are the r2 `g_recheck`, `h_new`, `h_new2` and `j_pre` (on `_pre`).
* **The whole matrix: every verdict is the same as round 4.** The verdict sets of all 25 outputs hash identically. That covers a_pair, b_credit, c_more, d_walls, f_vol, n_t1-t8, o_f, o_pre, p_one, q_vol and all of r2/s.
  * Value differences are only which racer wins, timings, and 55P03 → 40001 in the RR refusals (`h_new`, `h_new2`, `k_b8`, `t5`, `t7`).
  * Still as recorded: B13 accepted, B15 40P01 (known), N6 and L5 accepted, and i_legit's script bug (exit 1, the same line).
* **Rollback and catalog: hold.**
  * R1: rolling back with one KEPT row raises "credit entries are recorded", and the row stays.
  * R2: after the rollback the catalog matches `_pre` (6,395 lines) apart from the `MOVE_TO_CASE` enum label. After the re-apply it is identical to the template (6,477 lines).
  * The template catalog differs from c3bb10de's only in the md5 of `money_credit_entry_write`.
  * O1-O6 matched `_pre`.
* **Other probes that held.**
  * V5: one INSERT with two APPLIED rows (50 + 120 on a 150 draft) is refused with 23514 at RC and RR; due stays 150.

## New finding

### Minor
**N14. The build notes misstate what happens after a 55P03.** Where: `screens/FO-7ts-2/build-notes.md:107`.
* The notes say "busy.ts retries 55P03". `api/src/busy.ts:10-21` only classifies 40P01 or 55P03 as "Busy", meaning try again, and it serves X2b's bulk apply. Nothing retries, and no money writer uses it.
* The same line records N13 as still open. Measured above, it no longer happens.
* No money is affected; the notes are only wrong.

### Seen, not counted (the same on every version)
* **V6.** T1 applies to draft D1. An editor saves D2's header. T1 then applies to D2 and waits. The editor saves a line on D1.
  * Result: the editor gets 40P01 at RC and RR.
  * The result is identical on `_old` and `_r3`. It is a crossing of two invoice rows, not this change, and no API writer touches two invoices yet.

Breaker: pass b5202cc1
