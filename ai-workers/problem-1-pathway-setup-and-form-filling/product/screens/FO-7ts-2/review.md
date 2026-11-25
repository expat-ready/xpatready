# FO-7ts part 2 — reviewer reports (Opus, high effort), rounds 1 to 5

---

<!-- p2-review.md -->
# Review: FO-7ts part 2 (the pre-case → case pair and the credit ledger, under the party lock)

Independent Opus review (money and schema, P-608). Branch `claude/trusting-fermat-ejsqdh-fo7ts2`, head **692ea4beedc7c36df2be48cafabc9d72c9ce15ac**, diff `c5d1bccd..692ea4be` (FO-7lk's approved head to this head). Briefs: `build-lead-c-briefs/FO-7ts-2.md` at a7014c0bb (this one wins, with P-634 and Build Lead C's ruling that a pair may run while the case is below zero), plus Part 2 of `design/briefs/FO-7ts.md` on `main`. Database only: no route, no screen.

**Journey test (journey-test skill, reviewer role): N/A, no score.** The row has no route and no screen, so there is no journey a person can walk. The skill's "read the database after each step" part is covered below by my own probes.

## What I ran (PostgreSQL 18.3 at 127.0.0.1:54329, detached worktree at 692ea4be, since removed)
* `check_fo7ts_money_settings.ts` **89/0** · `check_fo7lk_lock_order.ts` 16/0 · `check_fo7a2_ledger_rules.ts` 35/0 · `check_fo7a_money_schema.ts` 122/0 · `check_fo7mv_move_list.ts` 45/0 · `check_prisma_schema.ts` 8/0. I took `check_pf12_walls.ts` 100/0 on this head from the caller and did not re-run it. I compared the policy, FORCE RLS, the ACL and the `0_pf12_firm_first` trigger with `money_trust_entry`'s and `money_move_line`'s: they are the same.
* **Rollback is exact.** In a scratch database migrated through FO-7lk, I fingerprinted every public function (`pg_get_functiondef`, prosecdef, owner, proconfig, ACL), constraint, index, trigger, column, policy and view. I then applied part 2 and `rollback.sql` and fingerprinted again. The two fingerprints are identical (`431f6f36…`). The only exception is the enum value `MOVE_TO_CASE`, which PostgreSQL cannot drop, and the rollback says so.
* **`money_trust_entry_write` is FO-7lk's text, changed only for the pair.** A diff of the function against FO-7lk's shows three hunks: the two new variables, the new pair block (migration.sql:81-107), and `AND NOT moving` (:205). `rollback.sql` carries FO-7lk's text byte for byte.
* **Mutations.** I removed one rule at a time and re-ran the suite:
  * Pre-case cap removed: DW5 ×2, DW7 RC and DW21 FAIL.
  * Deferred pairing trigger removed: DW6 ×2 FAIL.
  * Same-transaction check removed: DW6 FAIL.
  * Party lock removed from the credit trigger (with `lock_timeout` set): DW13 ×2 and DW23 ×2 FAIL. Without a timeout the suite hangs (m3).
  * `moving` exemption removed: the suite crashes, exit 1, with no named FAIL (n3).
  * The per-payment KEPT cap removed: **89/0, nothing fails** (m4).
* **Probes in scratch databases (all dropped):**
  * A pair across released savepoints is accepted.
  * A + half in a savepoint that is rolled back: refused at commit.
  * `SET CONSTRAINTS ALL IMMEDIATE`: a lone − is refused at once.
  * A pair with the trust answer NO is accepted.
  * The probes behind m1, m2 and m5 are described under those findings.

## Rule by rule against the brief
* **The pair: met.**
  * The − half has no case and a negative amount (CHECK :58-60). It is at most the pre-case balance, read under the party lock, and is refused at zero or below: `-amount > pre` with amount < 0 refuses any `pre <= 0` (:86-92).
  * The + half names a − half on the same party and currency, with the opposite amount and a case, written in this transaction (:93-107; CHECK :59).
  * One + per −: the unique key `(firm_id, moved_from_entry_id)` (:46).
  * A lone − is refused at commit by the deferred constraint trigger (:217-226).
  * A CORRECTION naming either half is refused by FO-7a2's line (:157), proven by DW8.
* **Text compares: correct.** A new enum value cannot be used in the transaction that adds it, so the CHECKs cast with `"kind"::text` (:58, :63, :65). Function bodies resolve the literal at run time, after commit.
* **The balance exemption opens no hole.**
  * `moving` (:92, :205) and the CHECK's `kind::text = 'MOVE_TO_CASE'` (:65) exempt only rows the trigger writes.
  * The − half is capped by the pre-case balance, and commit is refused unless a + half of the same amount on the same party exists. So a committed pair always nets to zero on the party.
  * Between the halves, the party's running balance only makes later outflows in that transaction stricter.
  * At REPEATABLE READ, a stale `pre` comes with a stale `seq`, and FO-7a's `(firm, person, currency, seq)` unique index refuses it. DW7 RR passes.
  * Build Lead C's ruling is met and tested: case at −50.00, pre-case 150.00, the move is accepted and no shortfall is left (test :332).
* **The credit ledger: met at write time.**
  * Holder: the case, or the party with no case. Seq indexes per holder (:238-239).
  * Kinds and signs (:231), links (:232-233) and reasons (:234). Insert-only, including TRUNCATE (:240-241). Balance never below zero, in the trigger (:325) and the CHECK (:236).
  * KEPT: only from an operating payment on an invoice, for that invoice's holder. It never exceeds what was paid over (:279-286) or the payment less its refunds (:287).
  * APPLIED: same holder and currency, draft or issued, never more than is due (:292-301).
  * REVERSED: only on KEPT or APPLIED of the same holder, opposite sign, never more in all (:304-315).
  * Seq at REPEATABLE READ: a stale writer takes a taken seq and gets 23505 (DW13 RR).
* **Locking: met for every writer in this diff.** `money_trust_lock` is the first statement of the credit trigger (:263). It comes before the invoice `UPDATE` (:274, :292, :310), the same pattern as `money_issued_invoice`. The trust write's order is unchanged. See m2 for the one case where the lock is not the invoice party's.
* **Walls and DDL: met.** PF-12's policy, FORCE RLS, the gate trigger, and the trigger functions as `xr_wall_reader` (:336-347). `money_invoice_due` keeps the caller's rights (DW10). `migrate diff` is empty (DW10), and the rollback is exact (above).
* **Tests: met.** DW5-DW8, DW10, DW12-DW14 and DW21-DW24 are all present, and each passes and fails as named, except m3, m4 and n3.
* **`check_fo7a_money_schema.ts` unchanged: the builder's reading is right.** The `"11"` at :117 counts `*_minor` columns over that file's own `TABLES` list (:24-25), and `money_credit_entry` is not on it. Adding 2 would make the file fail. Adding the table to `TABLES` would change other assertions (:91, :125), which the touch list does not allow. The intent of the assertion still covers the new table through :116: every `money_*` `*_minor` column must be integer. Record the reading in the PR body.

## Findings

### Major
* **M1. Size is over P-610's 800 (brief "Standard rules"; `tools/pr-size.sh`).** The diff is **814 changed lines** (807 added + 7 deleted; `git diff --numstat c5d1bccd 692ea4be`). That is before the review and breaker records, which GitHub also counts (P-654 counted 163 lines of records). `pr-size.sh` refuses the PR unless the body names a size-exception row. The brief says: "under 800 changed lines with tests (P-610); if it must split, ask first". P-654 says a row that will pass 800 "asks before the last fix, not after". The build notes do not mention size.
  * **Fix:** ask the tech lead now for a `Size exception: P-NNN` row, or trim under 800 with room for the records. Reverting m5 saves 2 lines.
  * The code itself is otherwise approvable. This is the only finding that blocks.

### Minor
* **m1. The credit caps hold only when the credit entry is written; later writes in other modules can break them.**
  * **Probe:** invoice 1,500, operating payment 1,700, KEPT 200. A `money_refund` of the full 1,700 is then accepted: due is back to 1,500 and the credit is still 200.
  * The same happens when a trust correction returns money from a withdrawal on that invoice.
  * The builder lists the refund case as a contract gap. FO-7a's refund trigger is outside this row's touch list, and no route writes KEPT yet, so nothing is exposed today.
  * **Fix:** name it in the PR as a "Question for the tech lead", and carry it as a binding DW to the row that first writes KEPT, or to FO-7v ("a refund or reversal of a payment takes back the credit kept from it first", Lead 61 5c).
* **m2. On case-held credit, the entry's party is not tied to anything.**
  * **Probe:** case C credit kept from P1's invoice. An APPLIED entry naming P2 on C's invoice billed to P1 is accepted. A REFUNDED entry naming an unrelated company on C is also accepted.
  * The balance never forks: the per-case seq index refuses the second writer with 23505.
  * The lock is the entry's party's, not the invoice's party's (migration.sql:263, :294-296). So the rule "credit and trust writes on one party run in turn" fails when the parties differ. Example: one transaction that applies credit as P2 and then withdraws P1's trust to the same invoice holds the invoice row before P1's lock, the wrong order.
  * **Smallest fix:** for APPLIED, require `(NEW.person_id, NEW.company_id) = (i.person_id, i.company_id)`. The holder is still the case, and the lock then matches the invoice's trust writers. Otherwise, state the reading in the PR.
* **m3. DW13's planted-wrong-order case hangs instead of failing (test :411-416).** If the credit trigger loses its party lock, `cb`'s APPLIED waits on `ca`'s invoice row forever. `ca` rolls back only after `Promise.all`, so the suite never reaches a FAIL. I had to terminate the backend. **Fix:** set `lock_timeout` (for example 5 s) on `ca` and `cb`. The fail then shows as 55P03 and DW23 is reached.
* **m4. The per-payment KEPT cap has no test (migration.sql:287).** With it removed the suite passes 89/0, because DW12's "150 + 60 on one payment" case is refused by the per-invoice cap (:284).
  * **A case that needs it:** invoice 100.00, credit note 100.00, payment A 200.00, payment B 10.00 (paid over: 210.00). KEPT 210.00 from B must be refused, because B is only 10.00.
  * **Fix:** add a case like this to DW12.
* **m5. The FO-7lk review record was rewritten by this branch.** `product/screens/FO-7lk/review.md:7` changed `20261118190000_fo7ts_ledgers` to `20261118220000_fo7ts_ledgers` in merge commit dd27cd500, apparently a side effect of the re-stamp. That line records what FO-7lk's reviewer saw at the time, so the edit changes a fact (AGENTS.md rule 8). It is also outside the touch list. **Fix:** revert it (−2 lines toward M1).
* **m6. The rollback overclaims.** `rollback.sql:1-2` says it refuses "before any MOVE_TO_CASE entry or credit entry exists that must be kept (it refuses otherwise)". The guard (:6-10) checks only moves. `DROP TABLE "money_credit_entry"` (:12) silently drops credit rows; the insert-only TRUNCATE trigger does not fire on DROP. **Fix:** add the same refusal when `money_credit_entry` has rows.

### Nit
* **n1. Draft edits can leave applied credit over the invoice.** A draft with 200.00 credit applied, whose line is then edited down to 50.00, gives `money_invoice_due` = −150.00 (probe). `money_invoice_line_write` is FO-7a's and takes no party lock; the build notes list it under the order exception. Carry "re-check applied credit on draft edit or at issue" to the Apply-credit route row.
* **n2. DW23 does not show the move pair waiting on the deposit's lock** (test :439-442). The pair runs only after the deposit commits. That the pair uses the shared lock is shown only by the source-text check, which is sound because the lock is the first statement of `money_trust_entry_write`. A one-line wait check on the pair would match the brief's words exactly.
* **n3. Some fail cases crash the suite instead of naming the failure.** With the `moving` exemption removed, the Build Lead C ruling case throws from `sql(...)` (test :332) and the suite exits 1 with no FAIL line. Wrap it so it reports as a FAIL.
* **n4. The trigger fires for more rows than it needs.** The deferred trigger's `WHEN` (migration.sql:226) fires for every pre-case withdrawal and refund, not only for moves. `NEW.kind::text = 'MOVE_TO_CASE'` in the `WHEN` would avoid a deferred event per outflow.
* **n5. `api/src/client-money/MODULE.md`'s "Tables." line does not list `moneyCreditEntry`.**
* **n6. A theoretical gap in the same-transaction check.** The check builds an xid8 from the current epoch and the row's 32-bit `xmin` (migration.sql:95). For a row from an earlier epoch this is meaningless, but it only matters after more than 2^32 transactions, and the unique key already refuses a second + half. Record it, no change.

## Verdict
The pair, the credit ledger, the lock order, the walls, `migrate diff` and the rollback all meet the brief, and the builder's readings are sound: a KEPT entry only from an operating payment, APPLIED capped at what is due, and `check_fo7a_money_schema.ts` left unchanged. The one blocker is size: 814 changed lines against 800 before any records, with no exception asked (M1). After a size exception or a trim, with m5 reverted and the other Minors answered, a diff-only re-review can approve.

Reviewer: Changes requested 692ea4beedc7c36df2be48cafabc9d72c9ce15ac

---

<!-- p2-review-r2.md -->
# Review round 2 (diff-only, P-277): FO-7ts part 2

Independent Opus review (money and schema, P-608). Branch `claude/trusting-fermat-ejsqdh-fo7ts2`. Diff `692ea4be..736346af38eb3c16ccb4dc74a38ac4cadb968187` (my round-1 head to this head). Inputs: my round-1 report, the breaker's round-1 report (B5, B8, B7, B4, B6, R1 and Minors), and the builder's account at the end of `product/screens/FO-7ts-2/build-notes.md`.

**Journey test (journey-test skill, reviewer role): N/A, no score.** As in round 1, the row has no route and no screen, so no person can walk a journey. My database probes below stand in for the skill's "read the database after each step".

## What I ran (PostgreSQL 18.3 at 127.0.0.1:54329; detached worktree at 736346af, since removed; every scratch database dropped)
* **Suites on the head:** `check_fo7ts_money_settings.ts` **98/0** · `check_fo7lk_lock_order.ts` 16/0 · `check_fo7a2_ledger_rules.ts` 35/0 · `check_fo7a_money_schema.ts` 122/0 · `check_fo7mv_move_list.ts` 45/0 · `check_prisma_schema.ts` 8/0. I took `check_pf12_walls.ts` 100/0 on this head from the caller and did not re-run it.
* **Rollback is still exact.**
  * I migrated a database through FO-7lk and took the breaker's 6,395-line catalog fingerprint (`fp.sql`: functions with their owner, settings and ACL, columns, constraints, indexes, triggers, policies, RLS).
  * I applied part 2, ran `rollback.sql` and took the fingerprint again. The only difference is the enum label `MOVE_TO_CASE`, which the rollback says stays.
  * I re-applied the migration: it works ("already exists, skipping"), so R2 is fixed.
* **`\ir` is sound.**
  * psql resolves `\ir` against the directory of the file it is running. `psql -1 -f <absolute path>/rollback.sql` run from `/` gives exit 0 and the same fingerprint.
  * Piping the file on stdin fails with "No such file or directory" (exit 3). With `-1` that fails closed: `money_credit_entry` is still there. The header gives the `-f` form, which is the form the test uses.
  * FO-7lk's migration is all `CREATE OR REPLACE FUNCTION` plus its readers `DO` block, so it is safe to run again.
* **Mutations.** I undid one fix at a time and re-ran `check_fo7ts_money_settings.ts`:
  * B6 check removed: B6 FAILs.
  * B4 check removed: B4 FAILs.
  * B5 check removed: B5 FAILs.
  * B7 check removed: B7 FAILs.
  * B8 check removed: B8 FAILs.
  * `cleared` check removed: the uncleared-cheque case FAILs.
  * Party lock removed from the credit trigger: DW13 ×2 and DW23 ×2 FAIL in 34 s, with no hang (m3 is fixed).
  * **Rollback credit guard removed: 98/0, nothing fails** (m-b below).
  * **m2 fix reverted: 98/0** (m-c).
  * **The per-payment branch of `money_credit_kept_holds` disabled: 98/0** (m-d).
* **Probes** (script `rv2/p.mjs` in the session scratchpad) for each flow the caller named:
  * **FO-7a refunds with no credit: accepted.** This covers a refund on an invoice, a refund with no invoice, and the full rest of a payment.
  * **FO-7a2 money returned to trust with no credit: accepted.**
  * **A partial return that leaves the invoice paid over by the kept 200.00: accepted.** One more cent is refused with the new message.
  * **"Move back to trust" is not refused falsely.** `money_credit_note_owed_back` is an AFTER trigger, so the credit note row is visible when the return's check reads `money_invoice_due`. The net change to what is due is −credit note + returned, which is ≤ 0.
  * **A draft with no credit:**
    * adding, editing and deleting lines are accepted;
    * changing its due date, pay link and party is accepted;
    * deleting the draft is accepted.
  * **With credit:**
    * a due-date or pay-link change on the draft and on the issued invoice: accepted;
    * raising the draft's line: accepted;
    * replacing its lines in one statement: accepted;
    * issuing it: accepted (due 200.00 = 400.00 − 200.00 applied).
  * **Reversing an application, then the kept credit, then refunding: all accepted.** Credit ends at 0 and due at 0.
  * **REPEATABLE READ:** B4 and B6 hold in both orders (40001), and B5 bumps the invoice row like the others.

## Fix by fix
* **B5 (`money_credit_entry_holds`): fixed and proven.** A REVERSED of an APPLIED entry re-checks, under the party lock and the invoice row taken by the BEFORE trigger, that the kept credit is still paid over.
* **B8 (`money_invoice_credit_pinned`): fixed and proven.** It compares only party, case and currency, so a due-date or pay-link change and the credit trigger's own `updated_at` bump pass.
  * The race with APPLIED is closed by the invoice row lock: at READ COMMITTED the later writer re-reads, and the RETURNING row carries the new party.
* **B7 (`money_invoice_line_credit`): fixed at READ COMMITTED and proven.** At REPEATABLE READ it is not closed (m-e).
* **B4 (`money_refund_credit_kept`): fixed and proven.** It opens a new deadlock (M2).
* **B6 (`money_trust_entry_credit_kept`): fixed and proven.** It holds at RC and at RR.
* **R1: fixed, but not proven** (m-b).
* **R2: fixed and proven.**
* **Uncleared cheque: fixed and proven.**
  * It is a reading beyond the brief, so state it in the PR.
  * It is safe that the invoice cap still counts uncleared payments. An operating cheque that bounces can be recorded only as a refund, and that refund is now refused while the credit relies on it.
* **m2: fixed, but not proven** (m-c). The fix blocks nothing legitimate: case credit can still pay another party's invoice on the case, by naming that party on the APPLIED entry.
* **m3: fixed and proven.**
* **m4: fixed and proven.** 150.00 kept from a 100.00 payment is refused, though the invoice is paid over by 200.00.
* **m5: fixed.** FO-7lk's `review.md` reads `20261118190000` again.
* **n4: correct.** `WHEN (kind::text = 'MOVE_TO_CASE' AND moved_from_entry_id IS NULL)` is the same condition the function tests. The CHECK makes every such row a − half, and the text compare is safe in the transaction that adds the label. DW6 still passes.
* **n5: fixed.**
* **Left for the tech lead (B13, B15, B11b): correctly recorded.** Each needs a ruling or a route, not this row.

## Findings

### Major
* **M1 (round 1, still open). The size is over 800 as CI counts it.**
  * `pr-rules.yml` (P-610 reading, Lead 58) counts every file except `product/screens/` and `product/qa/`. `api/src/client-money/MODULE.md` counts.
  * `git diff --numstat c5d1bccd 736346af`, excluding screens and qa, gives **802**. The builder's 799 excludes every `*.md`.
  * `pr-size.sh` refuses at 802 unless the PR body names a `Size exception: P-NNN` row. The M2 fix and the tests below add lines.
  * **Fix:** ask the tech lead for a size-exception row now (P-654: ask before the last fix). Trimming alone cannot also carry M2's fix.
* **M2 (new). The refund trigger opens a new deadlock: payment row → party lock → invoice row.**
  * `money_refund_write` (FO-7a's, BEFORE) takes the payment row `FOR UPDATE`. Only after it does the new AFTER trigger take the party lock. Every other writer takes the party lock first, and the brief asks for "one lock order for every money write".
  * **Probe, invoice of party P, no credit anywhere:**
    * T1 refunds payment A.
    * T2 refunds payment B and waits on P's lock while holding B's row.
    * T1 then refunds payment B: **40P01**.
  * **Probe, the flow the new message tells the user to follow:**
    * T1 reverses the kept credit, which takes P's lock.
    * T2 refunds the same payment and holds its row.
    * T1 then refunds: **40P01**.
  * **Control:** the same two schedules with the trigger dropped (as at 692ea4be): no deadlock.
  * **Sketch of the fix:** take the party lock in a BEFORE INSERT trigger that fires before `money_refund_write`. A name that sorts before "money_refund_write" does it, for example by making `money_refund_credit_kept` fire BEFORE for the lock and keeping the AFTER check. With that, both schedules give no deadlock. Add a DW13-style case for it.

### Minor
* **m-b. The R1 test does not prove the credit guard.** The test's database holds moves, so the move guard refuses first, and the regex matches both messages. With the credit guard deleted, the suite still gives 98/0. **Fix:** run the refusal on a copy that has credit rows and no move, and match "credit entries are recorded".
* **m-c. The m2 fix has no test.** Reverting it still gives 98/0. **Fix:** add one case: case-held credit, and an APPLIED naming another party on that case's invoice is refused.
* **m-d. The per-payment branch of `money_credit_kept_holds` has no test.** Disabling it still gives 98/0.
  * **A case that needs it:** invoice 100.00, payment A 200.00, payment B 50.00, KEPT 50.00 from B. A refund of 50.00 on B must be refused. The invoice-level check passes that case, because the invoice is still paid over by 100.00.
* **m-e. B7 holds at READ COMMITTED only.**
  * **Probe:** T1 at REPEATABLE READ takes its snapshot. T2 cuts the draft's line to 50.00 and commits. T1 then applies 200.00: **accepted**, and the draft's due is −150.00.
  * The line writer only share-locks the invoice row, so T1's APPLIED meets no serialization failure. It is the same family as n1 and B15 (FO-7a's line writer takes no party lock).
  * **Fix:** record it in the PR and carry it to the Apply-credit route row: run at RC, or re-check applied credit at issue.

### Nit
* **n-a. A delete-then-insert save of a draft's lines is refused on a draft holding credit,** because the row trigger fires at the DELETE (probe). A one-statement replace is accepted. Record it for the draft-editor route.
* **n-b. The B8 case's name claims more than it tests.** It says "an issued invoice with kept credit too", but only a draft is tested. FO-7a's `money_invoice_write` already fixes issued invoices.
* **n-c. Running FO-7lk's migration again also resets FO-7lk's four other functions.** That is exact only while no later migration edits them, and today none does. Running it after a later migration would undo that migration's change. One header line would say so.

## Verdict
Every breaker and reviewer finding from round 1 is fixed in the code. The rollback is exact and re-runnable, and `\ir` is sound under `psql -f`. No legitimate FO-7a or FO-7a2 flow I tried is now refused. Two Majors remain:
* M1: 802 changed lines as CI counts them, with no exception asked.
* M2: the refund trigger takes the party lock after the payment row, which gives a new 40P01 that the control shows is not there without it.

Three fixes have no failing test (m-b, m-c, m-d). After M2's BEFORE-lock fix with a test, a size-exception row, and m-b to m-d, a diff-only re-review can approve.

Reviewer: Changes requested 736346af38eb3c16ccb4dc74a38ac4cadb968187

---

<!-- p2-review-r3.md -->
# Review round 3 (diff-only, P-277): FO-7ts part 2

Independent Opus review (money and schema, P-608). Branch `claude/trusting-fermat-ejsqdh-fo7ts2`. Diff `736346af..5397b60b1b93e46834d43918a25a09f93a35e203` (my round-2 head to this head): 4 files.
* `migration.sql`: +8/−4.
* `rollback.sql`: +1.
* `check_fo7ts_money_settings.ts`: +19/−2.
* `build-notes.md`: +25.

Inputs:
* my round-2 report (M1, M2, m-b to m-e, n-a to n-c);
* the breaker's round-2 report on 736346af (fail: N9 = my M2, N4 = B7 at REPEATABLE READ = my m-e);
* the builder's account at the end of `product/screens/FO-7ts-2/build-notes.md`.

**Journey test (journey-test skill, reviewer role): N/A, no score.** The row still has no route and no screen, so nobody can walk a journey. The database probes below stand in for the skill's "read the database after each step".

## What I ran
Setup: PostgreSQL at 127.0.0.1:54329, in a detached worktree at 5397b60b, which I have since removed. I dropped every scratch database I made.

* **Suites on the head:**
  * `check_fo7ts_money_settings.ts` **103/0**
  * `check_fo7a_money_schema.ts` **122/0** (unchanged, so FO-7a's two-refund check passes)
  * `check_fo7lk_lock_order.ts` 16/0
  * `check_fo7a2_ledger_rules.ts` 35/0
  * `check_fo7mv_move_list.ts` 45/0
  * `check_prisma_schema.ts` 8/0
  * I took `check_pf12_walls.ts` 100/0 from the caller and did not re-run it.
* **Rollback is still exact.**
  * Method: I migrated a copy through FO-7lk and took the catalog fingerprint (`fp.sql`). I applied part 2, ran `psql -1 -f rollback.sql` and took the fingerprint again.
  * Result: the two fingerprints match. Re-applying the migration works. The new `DROP TRIGGER money_refund_credit_lock` is in place.
* **Trigger order on `money_refund`, BEFORE INSERT:** `0_pf12_firm_first`, then `money_refund_credit_lock`, then `money_refund_write`. So the party lock is taken before FO-7a locks the payment row.
* **Mutations.** I undid one fix at a time and re-ran `check_fo7ts_money_settings.ts`:

  | Fix undone | Result |
  |---|---|
  | BEFORE lock (round-2 code: lock in the AFTER trigger) | N9 FAILs in every run. The "review M2" check FAILs in 3 of 4 runs (n-d). |
  | Line `FOR SHARE` in APPLIED | N4 FAILs |
  | Rollback credit guard | R1 FAILs (m-b closed) |
  | m2 party check | m-c FAILs (m-c closed) |
  | Per-payment branch of `money_credit_kept_holds` | m-d FAILs (m-d closed) |

* **Probes** (script `rv3/p3.mjs` in the session scratchpad). I ran each probe on the head, at READ COMMITTED and at REPEATABLE READ. I also ran each one on a **control** copy: the head with 736346af's `money_credit_entry_write` and `money_refund_credit_kept` and no BEFORE trigger.

## Fix by fix

### M2 / N9: fixed and proven
| Schedule | Head, RC | Head, RR | Control, RC and RR |
|---|---|---|---|
| L1: T1 refunds A then B; T2 refunds B in between (no credit) | ok / ok | ok / 23505 | **40P01** |
| L2: T1 reverses KEPT then refunds; T2 refunds that payment in between | ok / ok | ok / 23505 | **40P01** |
| L3 (N9a): T1 KEPT from invoice 1, then KEPT from p2; T2 refunds p2 in between | ok / ok | ok / 40001 | **40P01** |

* The lock order is now party lock → payment row (`money_refund_write`) → invoice row (AFTER). KEPT takes party lock → invoice row → payment `FOR KEY SHARE` (its FK). One party lock serialises the two, so their different second and third locks never meet.
* No other writer takes a payment row and then a party lock. `money_payment_write` and `money_payment_returned_not_cleared` take no party lock, so the new order opens no cycle.
* The BEFORE branch returns `NEW` on both paths. The old `RETURN NULL` would have skipped the row in a BEFORE trigger, so changing every return to `NEW` is right. The party read in BEFORE takes no lock. That is safe because `payment.invoice_id` never changes, and the party of an issued invoice is fixed by FO-7a.

### KEPT and refund racing, both orders
Setup: invoice 100.00, payment 300.00, so the invoice is paid over by 200.00. KEPT 200.00 plus a refund of 150.00 is the breaking pair. KEPT 100.00 plus a refund of 100.00 is a pair that can both go through.

| | RC | RR |
|---|---|---|
| KEPT first, both in flight | refund refused 23514 (held as credit) | refund 40001 |
| KEPT first, refund's snapshot older than KEPT's commit | refund refused 23514 | refund 40001 |
| Refund first, both in flight | KEPT refused 23514 (only 50.00 not kept) | KEPT 40001 |
| Refund first, KEPT's snapshot older | KEPT refused 23514 | KEPT 40001 |
| The pair that can both go through | both accepted | second 40001 (normal at RR; the same on the control) |

The money is never wrong. At RR the second writer always meets the invoice row the first one bumped.

### FO-7a's refund flows are unchanged
* Two refunds of 700.00 on a 1,000.00 payment, both in flight and one after the other: 23514 at RC and **23505** (the ordinal) at RR, the same on head and control. `check_fo7a_money_schema.ts` passes unchanged.
* With no credit, these are accepted: a refund on an invoice, a refund with no invoice, and the full rest of a payment. 0.01 more is refused with FO-7a's own message.

### N4 / m-e: fixed at REPEATABLE READ, but the fix opens a new deadlock (M3)
Correctness:

| Schedule | Head, RR | Control, RR | RC (head and control) |
|---|---|---|---|
| Line cut commits, then a stale APPLIED 200.00 | 40001 | **accepted, due −150.00** | refused 23514 |
| Line deleted, then a stale APPLIED | 40001 | **accepted, due −200.00** | refused 23514 |
| APPLIED commits, then a stale line cut | 40001 | 40001 | refused 23514 |

The cost is a new lock-order cycle; see M3.

### Minors and nits from round 2
* **m-b, m-c, m-d: fixed and proven** (mutations above).
  * The R1 test now removes the moves inside a rolled-back `-1` run and matches only "credit entries are recorded". The count check afterwards shows both kinds of row are still there.
* **n-b: fixed.** B8 now also covers an issued invoice.
* **n-a and n-c: recorded** in `build-notes.md`. The breaker's N6 and L5 are recorded for the tech lead, which is correct: each needs a ruling, not this row.

## Findings

### Major
* **M3 (new). The N4 fix opens a new deadlock: invoice row → draft lines.**
  * **The cycle:**
    * APPLIED takes the party lock, then the invoice row (its `UPDATE … updated_at`), then **every line of the draft `FOR SHARE`** (migration line 295).
    * FO-7a's line writer runs the other way. PostgreSQL locks the line row before the BEFORE trigger fires, and then `money_invoice_line_write` takes the invoice row `FOR SHARE` (FO-7a:830).
    * So the two writers take the same two rows in opposite orders. That breaks the migration's own header, "one lock order: … the party lock first …, then any invoice row", and the brief's "one lock order for every money write".
  * **Probes, with the control (round-2 code, no line lock) alongside:**

    | Probe | Head | Control |
    |---|---|---|
    | D2: T1 changes the draft's due date and then applies credit, in one transaction; T2 edits a line in between | **40P01**, RC and RR | ok / ok at RC; ok / 40001 at RR |
    | D4: APPLIED and a line edit of the same draft started together, one statement each, 40 rounds | **9 of 40 rounds 40P01 at RC**; 2 of 40 at RR | 0 of 40 at RC; 0 at RR (7 × 40001) |

  * **Severity:**
    * No money goes wrong. `busy.ts` retries 40P01.
    * It is still a new 40P01 at READ COMMITTED, the level the app runs at (`default_transaction_isolation` is read committed). The control shows the fix added it. That is the same class as M2, which was Major.
    * The line lock is not needed at RC. The control copy refuses all three N4 schedules correctly at RC: APPLIED waits on the line writer's share lock on the invoice row, and its reads after that wait are fresh.
  * **Fix sketch, tried on a scratch copy:** take the line lock only when the transaction is not READ COMMITTED, and with `NOWAIT`:
    ```sql
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      PERFORM 1 FROM "money_invoice_line" l WHERE l.firm_id = NEW.firm_id AND l.invoice_id = NEW.invoice_id FOR SHARE NOWAIT;
    END IF;
    ```
  * **Results of that sketch:**
    * At RC: no 40P01 in D2 or D4 (40 of 40 rounds ok/ok), and N4 is refused correctly in all three schedules.
    * At RR: N4 gives 40001 in all three schedules. D4 gives 40 of 40 rounds 40001 and no 40P01. D2 gives 55P03 ("could not obtain lock"), which `busy.ts` retries, and no 40P01.
    * The legitimate flows (G1 to G3) are all still accepted.
    * Without `NOWAIT`, RR still gave 40P01 in 3 to 16 of 40 rounds, so `NOWAIT` is the part that removes the wait.
  * **What to add with the fix:** a DW13-style check that a line edit and an APPLIED of one draft, started together at RC, never give 40P01. D4 is the shape. Keep the N4 RR check. Update the header line about lock order to name the line locks.
  * Another order would also do, if the builder prefers one, as long as the control check above passes. Taking the lines before the invoice row is not enough on its own: it closes D4 but not D2, and it opens a cycle with a draft editor that saves lines one by one in one transaction.

### Size (M1): pending the size exception, not a finding to fix
* Measure: `git diff --numstat c5d1bccd 5397b60b`, excluding `product/screens/` and `product/qa/`.
* Result: **824** changed lines. CI's `pr-size.sh` refuses this unless the PR body names a `Size exception: P-NNN` row. The builder has asked the tech lead for one. `build-notes.md` gives 815, which was the count at that commit; give 824, or the final count, in the PR and in the exception request.
* The M3 fix adds about 3 lines.

### Nit
* **n-d. The "review M2" check depends on timing.**
  * With the BEFORE lock undone, it failed in 3 of 4 runs. In the other run, T1's two refunds finished before T2 started.
  * The N9 check (10 rounds) failed in every run, so the fix is guarded.
  * To make the M2 check certain, hold T1 open after its first refund, the way the probes do: T1 refunds A; T2 refunds B; then T1 refunds B.

## Verdict
* **Fixed and proven:** M2/N9, N4 at REPEATABLE READ, m-b, m-c, m-d and the B8 issued case.
* **Behaving as expected:** FO-7a's refund flows and its REPEATABLE READ ordinal check are unchanged. A KEPT and a refund racing in either order are refused cleanly (23514 at RC, 40001 at RR), and the money is never wrong. The rollback is exact and can be run again.
* **Still blocking:** one Major, M3. The N4 line lock is taken after the invoice row, so APPLIED and FO-7a's line writer now deadlock at READ COMMITTED (9 of 40 rounds when started together, and certainly with "change the draft, then apply"). The control shows the deadlock is new.
* **What is needed:** the M3 fix with a test that fails without it, plus the size exception. A diff-only re-review can then approve, subject to the size exception.

Reviewer: Changes requested 5397b60b1b93e46834d43918a25a09f93a35e203

---

<!-- p2-review-r4.md -->
# Review round 4 (diff-only, P-277): FO-7ts part 2

This is the independent Opus review of the money and schema work (P-608).
* **Branch:** `claude/trusting-fermat-ejsqdh-fo7ts2`.
* **Diff:** `5397b60b..c3bb10dec87e95a79152bb83464520e51493cf3a`, from my round-3 head to this head. It has two commits and touches 3 files:
  * `migration.sql`: +5/−1.
  * `check_fo7ts_money_settings.ts`: +26/−1.
  * `build-notes.md`: +17.
* **Commits:**
  * db1162d1 moves the N11/M3 line lock ahead of the invoice row.
  * c3bb10de takes that lock only above READ COMMITTED, with `NOWAIT`. It also adds a D2 check and puts the M2 refund check in a fixed order (n-d).
* **Nothing else changed.** The diff has no edits to rollback, schema, API or the other suites.
* **Size:** I treat size as resolved by the tech lead's size exception (19 Nov). It is not a finding.

**Journey test (journey-test skill, reviewer role): N/A, no score.** The row still has no route and no screen, so there is no journey to walk. The database probes below stand in for the skill's "read the database after each step".

## What I ran
I worked in a detached worktree at c3bb10de, against PostgreSQL at 127.0.0.1:54329. I have removed the worktree and dropped both scratch databases I made. The `xr_studio_bp2r4b_*` databases are not mine and I left them alone.

* **Suites on the head:**

  | Suite | Result |
  |---|---|
  | `check_fo7ts_money_settings.ts` | **105/0** |
  | `check_fo7a_money_schema.ts` | 122/0 |
  | `check_fo7lk_lock_order.ts` | 16/0 |
  | `check_fo7a2_ledger_rules.ts` | 35/0 |
  | `check_fo7mv_move_list.ts` | 45/0 |
  | `check_prisma_schema.ts` | 8/0 |
  | `check_pf12_walls.ts` | 100/0, from the caller's run in the main copy; I did not re-run it |

* **Mutations.** I undid one change at a time and re-ran `check_fo7ts_money_settings.ts`:

  | Change | Result |
  |---|---|
  | A: lock always taken (no isolation guard), `NOWAIT` kept | review M3 (D2) FAILs: `["55P03","ok"]` |
  | B: lock always taken, no `NOWAIT` (the db1162d1 shape) | review M3 (D2) FAILs: `["ok","40P01"]` |
  | C: 5397b60b's order (lock after the invoice row, always, waiting) | break N11 **and** review M3 FAIL with 40P01 |
  | D: no line lock at all | break N4 (REPEATABLE READ) FAILs: `"ok"` |
  | E: the M2 BEFORE lock undone (round-2 code) | review M2 and break N9 FAIL, **2 of 2 runs** |

  * A to D show that each part of the new lock is guarded by a test.
  * E shows n-d is closed: the M2 check is now fixed-order and no longer depends on timing.
* **Probes.**
  * **Round 3's probe set (`rv3/p3.mjs`), re-run on the head:**
    * At READ COMMITTED: D2 ok/ok and D4 40 of 40 ok/ok. N4 is refused with 23514 in all three schedules. The KEPT-and-refund races and FO-7a's refund flows are as in round 3.
    * At REPEATABLE READ: N4 gives 40001 in all three schedules. D4 gives 36 × 55P03/ok and 4 × ok/40001, with no 40P01. D2 gives 55P03.
    * The legitimate flows G1 to G3 are all accepted.
  * **New probes (`rv4/p4.mjs`):** I ran them at each isolation level. They cover the "normal REPEATABLE READ flow" question; the results are in the next section.

## Fix by fix
* **M3: closed at READ COMMITTED, the level the app runs at.**
  * At RC the trigger takes no line lock, so APPLIED behaves like the round-2 control. That control refused N4 correctly at RC, and it still does: three of three schedules give 23514.
  * D2, D4, N11 (P7) and P1 to P6 give no 40P01 at RC.
  * The new D2 check fails without the guard (mutations A and B).
* **N11: closed.**
  * At RC all three sessions finish.
  * At REPEATABLE READ and SERIALIZABLE, the header save commits first and then APPLIED and the line save both get 40001. That is normal at RR: both read a row the header save changed after their snapshot.
  * The N11 check fails with 5397b60b's order (mutation C).
* **N4 at REPEATABLE READ: closed.**
  * All three schedules give 40001 and the money is never wrong (mutation D guards it).
  * **A gap I checked, safe:** a line *added* after APPLIED's snapshot is not seen by the line lock. That is safe because `money_invoice_line_amount_check` keeps every line ≥ 0, so a new line only raises what is due. P6 shows it: APPLIED of the stale 500.00 is accepted, and 10.00 is left due.
* **n-d: closed** (mutation E, 2 of 2 runs).

## Is NOWAIT's 55P03 acceptable at REPEATABLE READ?
**Yes.**
* **When it happens:** 55P03 comes only when a line of that draft is being changed by a transaction that has not finished. If that transaction commits, waiting would have ended in 40001 anyway. `busy.ts` retries 55P03 like 40001 and 40P01.
* **What it is compatible with:** two APPLIED on one draft both share-lock the lines, which is compatible. FK checks take `FOR KEY SHARE`, also compatible. So P2 (two APPLIED in flight) gives 40001 for the second, not 55P03.
* **Uncontended:** APPLIED at RR and at SERIALIZABLE is accepted (P3).
* **No app path uses it:** `default_transaction_isolation` is read committed. No money code in `api/src` sets an isolation level; the only RepeatableRead is a read-only `case-prepare.ts` transaction.

**But the lock's position (before the invoice row) makes two REPEATABLE READ flows fail spuriously.** See m-f.

## Findings

### Minor
* **m-f. At REPEATABLE READ and above, the line lock's position (before the invoice row) causes a 40P01 and a spurious 55P03. Moving it after the row removes both.**
  * **P1, the problem:** an editor saves the draft's header and then a line, in one transaction (the normal "save the whole draft" shape), while APPLIED arrives in between.
    * On the head at RR and at SERIALIZABLE, APPLIED takes the line share locks and then waits on the invoice row, which the editor holds. The editor then waits on its own line, so the two deadlock.
    * The **editor** gets 40P01 after `deadlock_timeout`, a save that would otherwise succeed. APPLIED is accepted.
    * At 5397b60b and on the round-2 control, the editor is accepted and APPLIED gets 40001. So this 40P01 is new.
    * It also contradicts the new migration comment and the build notes: "NOWAIT: 55P03, never 40P01".
  * **P4, the second effect:** a line edit is in flight and then **rolls back**. On the head at RR and SERIALIZABLE, APPLIED gets 55P03, although waiting would have succeeded.
  * **The fix, which I tried:** keep the guarded `FOR SHARE NOWAIT` block exactly as it is, but move it from before the `UPDATE "money_invoice"` to just before `due := money_invoice_due(...)`. That is my round-3 sketch's position. `NOWAIT` never waits, so taking the lines after the row adds no waiting edge. The lines-first order from db1162d1 is no longer needed once `NOWAIT` is there.

    | Check on the moved variant (`rv4/migration-F.sql`) | Result |
    |---|---|
    | `check_fo7ts_money_settings.ts` | 105/0 |
    | P1 at RR and SERIALIZABLE | editor ok, APPLIED 40001 (as on the control) |
    | P4 at RR and SERIALIZABLE | ok/ok |
    | D2 and P5 | still 55P03 |
    | D4 | 15 × 55P03/ok, 24 × 40001/ok, 1 × ok/40001, no 40P01 |
    | N4 at RR | 40001 in all three schedules |
    | RC results | unchanged |
    | G1 to G3 | accepted |

  * **Why Minor, not Major:** it happens only above READ COMMITTED, which no app path uses. `busy.ts` retries it, and no money goes wrong. This follows round 2, where the RR-only N4 was the minor m-e, and M3 was Major only because it was at RC.
  * **What to add with the fix:** a P1-shape check at REPEATABLE READ that fails on the head, for example "header save, APPLIED, line save in the first transaction: no 40P01". Then fix the comment ("share the lines first, the line writer's order") to match.

### Nit
* **n-e.** `current_setting('transaction_isolation') <> 'read committed'` also takes the lock at `read uncommitted`, which PostgreSQL runs as READ COMMITTED. There, P1 gives 40P01 and P4 and P5 give 55P03, where RC gives ok. `NOT IN ('read committed', 'read uncommitted')` would make the two behave the same. Nobody uses that level, so this is cosmetic.
* **n-f.** The migration header (line 9) still says "the party lock first …, then any invoice row". Round 3 asked for the line locks to be named there; for example, "… then any invoice row, then (above READ COMMITTED, NOWAIT) its lines".
* **Build notes.** "With the lock always taken, it gets 40P01" holds for the waiting lock (mutation B). With `NOWAIT` but no guard it gets 55P03 (mutation A). Both fail the check, so this is only a wording point.

## Verdict
* **Closed and proven at the level the app runs (READ COMMITTED):** M3, N11 and n-d. N4 is closed at REPEATABLE READ. No 40P01 appears at RC in any probe, and FO-7a's flows are unchanged.
* **NOWAIT's 55P03 at RR is acceptable.** It is retried, it stands in for a 40001 that would come anyway, and it gives no 40P01.
* **Open, not blocking:** one Minor, m-f, about the lock's position. At RR and above, a "header then line" draft save that meets an APPLIED gets 40P01, and an APPLIED next to an edit that rolls back gets a spurious 55P03. Moving the 3-line block after the party check fixes both, and I tried it: 105/0 and every probe clean. I recommend doing it in this PR, with a P1 check. It does not block: there is no Blocker or Major.
* **Not a finding:** size, covered by the tech lead's exception (19 Nov); the DECISIONS row is being added.

**Verdict: Approve.** Fix m-f, n-e and n-f in this PR if you can; m-f carries the most weight.

Reviewer: Approve c3bb10dec87e95a79152bb83464520e51493cf3a

---

<!-- p2-review-r5.md -->
# Review round 5 (diff-only, P-277): FO-7ts part 2

This is the independent Opus review of the money and schema work (P-608).
* **Branch:** `claude/trusting-fermat-ejsqdh-fo7ts2`.
* **Diff:** `c3bb10de..b5202cc141ede386aba025f7fcbc044f5b92e8e5`, from my round-4 Approve head to this head. It is one commit (b5202cc1) and touches 3 files:
  * `migration.sql`: +7/−6.
  * `check_fo7ts_money_settings.ts`: +11.
  * `build-notes.md`: +9.
* **Nothing else changed.** The diff has no edits to `rollback.sql`, the Prisma schema, the API or the other suites.
* **The code matches the variant I tested in round 4** (`rv4/migration-F.sql`). The only differences are n-e (`NOT IN ('read committed', 'read uncommitted')`) and the comments.
* **Size:** this is resolved by the tech lead's size exception (19 Nov). It is not a finding.

**Journey test (journey-test skill, reviewer role): N/A, no score.** The row still has no route and no screen, so there is no journey to walk. The database probes below stand in for the skill's "read the database after each step".

## What I ran
I worked in a detached worktree at b5202cc1, against PostgreSQL at 127.0.0.1:54329. I built two scratch databases from the head's migrations, one of them mutated. I dropped both, removed the worktree, and the main copy is untouched.

### Suites on the head

| Suite | Result |
|---|---|
| `check_fo7ts_money_settings.ts` | **106/0** |
| `check_fo7a_money_schema.ts` | 122/0 |
| `check_fo7lk_lock_order.ts` | 16/0 |
| `check_fo7a2_ledger_rules.ts` | 35/0 |
| `check_fo7mv_move_list.ts` | 45/0 |
| `check_prisma_schema.ts` | 8/0 |
| `check_pf12_walls.ts` | 100/0, from the caller's run in the main copy; I did not re-run it |

### Mutations
I undid one change at a time and re-ran `check_fo7ts_money_settings.ts` (`rv5/mut.sh`).

| Change | Result |
|---|---|
| G: the guarded `NOWAIT` block put back before the invoice row (c3bb10de's position), run twice | the new N12 check FAILs, `["ok","40P01"]`, **2 of 2 runs**. This matches the builder's claim. |
| A: the isolation guard removed, `NOWAIT` kept | the break N11 and review M3 checks FAIL: `["55P03","ok"]` |
| B: guarded, but a waiting `FOR SHARE` (no `NOWAIT`) at the new position | **106/0, nothing fails.** See n-g. |
| D: no line lock at all | the break N4 (REPEATABLE READ) check FAILs: `"ok"` |

### Probes on a database built from the head
* **Round 4's set (`rv5/p5.mjs`, P1 to P7), run at each isolation level:**
  * **READ UNCOMMITTED and READ COMMITTED:** every probe gives ok. N11 (P7) gives ok/ok/ok, and the D2 shape (P5) gives ok/ok. So READ UNCOMMITTED now behaves like READ COMMITTED (n-e).
  * **REPEATABLE READ and SERIALIZABLE:**
    * P1, the m-f shape, now gives editor ok and APPLIED 40001. On c3bb10de it gave 40P01.
    * P4, an edit that rolls back, gives ok/ok. On c3bb10de it gave a spurious 55P03.
    * P5 (D2) gives 55P03, and P7 (N11) gives 40001/40001/ok.
    * P6 is ok/ok at REPEATABLE READ and 40001 at SERIALIZABLE, which is SSI and safe.
    * No probe gives 40P01.
* **The breaker's U5 shapes (`rv5/p6.mjs`), 8 of 8:**
  * The draft save runs at READ COMMITTED or REPEATABLE READ. It starts with a header save or a line insert, then updates or deletes an existing line, while an APPLIED at REPEATABLE READ arrives in between.
  * Every case gives **save ok, APPLIED 40001**. There is no 40P01.
* **Round 3's set (`rv5/p3.mjs`), re-run on the head:**
  * **At READ COMMITTED:**
    * D1 to D3 give ok/ok, and D4 gives 40 of 40 ok/ok.
    * N4 is refused with 23514 in all three schedules.
    * The kept-credit and refund races (K, K', K-legit), L1 to L3, and FO-7a's two-refund flow (A) match round 4.
  * **At REPEATABLE READ:**
    * N4 gives 40001 in all three schedules.
    * D2 gives 55P03.
    * D4 gives 27 × 40001/ok, 12 × 55P03/ok and 1 × ok/40001, with no 40P01.
    * L1, L2, K and A match rounds 3 and 4.
  * **The legitimate flows** G1 to G3 are all accepted.

## Fix by fix
* **m-f / N12: closed.**
  * The lock now comes after the invoice row and the party check, just before the due read.
  * The new check is deterministic: it waits until APPLIED is blocked on the row. It fails on c3bb10de's order (mutation G, 2 of 2) and passes on the head.
  * The probes show no 40P01 in P1 or in U5 (8 of 8). P4's spurious 55P03 is gone.
* **n-e: closed.** Probes at READ UNCOMMITTED now match READ COMMITTED exactly.
* **n-f: partly done (Nit, below).**
* **Earlier fixes still hold:**
  * **M3 / D2 at READ COMMITTED:** the check passes, the probe gives ok/ok, and D4 gives 40/40. Mutation A still fails it.
  * **N11:** the check passes, and P7 is clean at every level.
  * **N4:** 23514 at READ COMMITTED and 40001 at REPEATABLE READ, in all schedules. Mutation D still fails it.
  * **M2 and N9:** their checks pass, and the refund-lock code and `rollback.sql` are not in the diff.
* **Build notes:**
  * The round-3 wording correction (40P01 for the waiting lock, 55P03 with `NOWAIT` and no guard) is accurate; it matches my round-4 mutations A and B.
  * N13 is recorded as Minor: the leftover REPEATABLE READ 55P03, retried by `busy.ts`. That is consistent with my round-4 view that `NOWAIT`'s 55P03 at REPEATABLE READ is acceptable.

## Findings
There is no Blocker, Major or Minor.

### Nit
* **n-g. No check pins `NOWAIT` at its new position.**
  * With a waiting `FOR SHARE` in place of `FOR SHARE NOWAIT`, the suite still gives 106/0 (mutation B).
  * But on that variant the D2 shape (P5) at REPEATABLE READ and SERIALIZABLE gives **40P01**. That is the outcome the new comment rules out ("55P03; never 40P01").
  * The M3/D2 check runs only at READ COMMITTED, where the lock is not taken, so it cannot see this.
  * **Suggested fix:** copy the M3 check at REPEATABLE READ and expect 55P03 (or, as the comment says, "not 40P01").
  * **Why a Nit:** this is a test gap above READ COMMITTED, a level no app path uses. The code is right.
* **n-f (left over).**
  * The new sentence is in the "kept and applied credit stay true" section header (line 339-340).
  * The file header's lock-order bullet (line 9) still says only "the party lock first …, then any invoice row". Round 3 and round 4 asked for the line lock to be named there.
  * So the build notes' "The migration header now names the line lock" is only half true. This is cosmetic.

## Verdict
* **m-f and N12 are closed.** The new check fails on c3bb10de's order with 40P01, as the builder said, and passes on the head. No probe at any level gives 40P01.
* **n-e is closed.**
* **M3, N11, D2, N4 (READ COMMITTED and REPEATABLE READ), M2 and N9 still hold.** The suites pass and mutations A and D still catch regressions.
* **Nothing else changed** beyond the three files listed.
* **Open, not blocking:** two Nits, n-g (a REPEATABLE READ check for `NOWAIT`) and n-f (the file header's line 9).
* **Not a finding:** size, covered by the tech lead's exception (19 Nov).

**Verdict: Approve.** The two Nits can be done in this PR or the next.

Reviewer: Approve b5202cc141ede386aba025f7fcbc044f5b92e8e5
