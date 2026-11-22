Reviewer: Approve 2fb4965eb66a08eb95a8e88a2efb0d2d265c8c6f

# Round 6b (diff-only, 4ac4e8b1a..2fb4965eb)

**What changed in the studio:** `git diff 4ac4e8b1a 2fb4965eb -- …/studio` shows two files, +4 lines each, and nothing else.
* `migration.sql:629-631, 641`: a 2-line PF-8b F4 comment, then `GRANT CREATE ON SCHEMA public TO xr_wall_reader;` right before `DO $readers$`, and `REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;` right after `$readers$;`.
* `rollback.sql:38-40, 50`: the same pair around its `$readers$` block.
* No function body, column, constraint or test changed.

**R6-1: closed.**
* The pair is the same form as `20261122020000_fo6_signing_tables:369-381`.
* The grant comes before the first `OWNER TO xr_wall_reader`, and the revoke comes after the last one. The order is right in both files.
* On a superuser cluster the pair is a no-op. The reader holds no CREATE grant of its own after F4, so grant-then-revoke leaves the ACL as it was. The rollback's "exact" result is therefore unchanged.
* In the rollback, both statements run inside its single `-1` transaction, so a refusal still undoes everything.
* **What I ran at 2fb4965eb:** `tests/check_pf8b_f4_migrations.ts` reads files only and starts no database. Result: **9/9 passed**, including "every migration after F4 that hands xr_wall_reader a function grants it CREATE on public first and revokes it after (6 later)".
* I did no database work, as asked. The FO-7ts suite re-runs at this head are the builder's evidence for the changed migration text.

**Nothing else is open:**
* Round 6's question-2 findings stand: there is no conflict with main's FO-7b, FO-7g or migrations.
* The FO-7g part 2 note does not block this PR.

**Verdict: Approve** for `2fb4965eb66a08eb95a8e88a2efb0d2d265c8c6f`. No Blocker, Major or Minor is open.

---

Round 6 line (superseded): Reviewer: Block 4ac4e8b1ab36a438ebdbeca28a6584f28e5b5c6d

# Round 6 (diff-only, head 4ac4e8b1a)

**Base:** a8f388459, the last code head I approved (fac444ff5 added only the round-5 records). Head 4ac4e8b1a is one merge commit: first parent fac444ff5, second parent origin/main 73c4e4dcd.

**What changed in this PR's own diff (checked):**
* `git diff -M a8f388459 4ac4e8b1a -- prisma/migrations/*fo7ts_part3*`:
  * `migration.sql` is a pure rename, 20261119170000 → 20261122040000 (similarity 100 %, SQL unchanged).
  * `rollback.sql` changes one line, its own path in the usage comment.
* I compared the PR's own diff before (23f68d924..a8f388459) with after (origin/main..4ac4e8b1a), with the stamp normalised. Besides the rename, the only differences are:
  * the `NEW3` constant;
  * the round-5 records in `review.md`;
  * `MODULE.md`, where context comes from main. The PR still adds exactly one rule line (the pick line). Main's FO-7b `taxForLine` line and the `Tables.` line are both kept.
* Nothing else in the PR changed, so a full re-review is not needed.
* The stamp is later than every migration on main: main's newest is 20261122033000_qa644_reserve_staging. No file still names the old folder.
* `module-cards.py tree` and `pr` pass.

## Blocker

**R6-1: the re-stamp puts this migration under PF-8b F4's hand-over rule, and the migration breaks it. `tests/check_pf8b_f4_migrations.ts` now fails.**
* **Where:** `prisma/migrations/20261122040000_fo7ts_part3/migration.sql:629-637`. The `$readers$` block runs `ALTER FUNCTION … OWNER TO xr_wall_reader` on the five functions, with no `GRANT CREATE ON SCHEMA public TO xr_wall_reader` before it and no `REVOKE` after it.
* **The rule** (main, `20261121230000_pf8b_f4_reader_create`): "A later migration that hands xr_wall_reader a function in public on RDS grants CREATE first and revokes it after." The test checks this for every folder stamped after `F4_STAMP = "20261121230000"` (`tests/check_pf8b_f4_migrations.ts:37-47`).
* **Why it shows up now:** under the old stamp, 20261119170000, this folder came before F4 and was exempt. The new stamp is what exposes it.
* **Evidence:** I ran it at 4ac4e8b1a. It reads files only and starts no database.
  ```
  FAIL every migration after F4 that hands xr_wall_reader a function grants it CREATE on public first and revokes it after (6 later): ["20261122040000_fo7ts_part3"]
  1 failed
  ```
  This suite is not quarantined, so the merge-queue / CI-PRE suite run goes red.
* **Effect at runtime:** none today. The five functions are already owned by `xr_wall_reader`:
  * `money_invoice_write` since `20261118200000:251`;
  * the other four since `20261118210000:354`.
  CREATE OR REPLACE keeps the owner, and PostgreSQL skips the owner checks, including CREATE on the schema, when the owner does not change. So the hand-over is a no-op even on RDS. It is still a red required suite and a written rule not followed.
* **Fix (migration text only):** wrap lines 629-637 the way `20261122020000_fo6_signing_tables:369-381` does: `GRANT CREATE ON SCHEMA public TO xr_wall_reader;` before the `DO $readers$` block, and `REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;` after it, with the same PF-8b F4 comment.
  * Dropping the `OWNER TO` line would also pass, but keep the PF-12 pattern.
  * `rollback.sql:38-46` has the same hand-over. The test does not scan rollbacks, and there it is also a no-op. Wrapping it the same way would be consistent; it is optional.
* **Re-check:** after the fix, re-run `check_pf8b_f4_migrations` and `check_fo7ts_money_settings` (the migration text changes). Then a diff-only Approve is enough.

## What main adds and this PR meets (question 2): no conflict found
* **No function is overwritten.**
  * No migration on main later than 20261119170000 touches any of the five functions, `money_invoice`, `money_trust_entry`, `money_invoice_line` or any tax object. Only two mention "money", and only in comments (`csdl3_case_milestone:13`, `fo3a1e_firm_timings:13`).
  * Main did not change `client-money.prisma`.
  * This PR's CREATE OR REPLACE bodies replace the latest versions: `money_invoice_write` from 20261118200000, the rest from 20261118210000 / 20261119080000. The rollback reads those same files.
* **Main edited two applied migrations** (PF-8b F4: `pf12_firm_walls`, `csw1_firm_id`). Both changes are about role attributes and RDS. They touch no money object. The only interaction is R6-1.
* **Tax: no second source of truth.**
  * Main's FO-7b part 1a (`invoices/drafts.ts:73-97`, `tax-round.ts`) stores each line's *amount*: `tax_rate_ppm`, and `tax_minor` from `taxForLine`.
  * Main's FO-7g part 1 (`tax/defaults.ts`, `canada-gst-hst.ts`, `tax/routes.ts`) gives the *default rate* from the firm's province.
  * This PR stores the invoice's *classification* (Taxable / Zero-rated / Exempt). It is null on a draft, and at issue it is fixed to the invoice's own value, else the party's, else Taxable (`migration.sql:397-402`).
  * That is the split the FO-7g brief draws (`design/briefs/FO-7g.md:7, 32`): part 2 "the draft takes the invoice's treatment, else the party's, else Taxable … Zero-rated and Exempt give 0 on every line … the schema is FO-7ts's".
  * The PR keeps a draft's own choice, because it fills only when null. That matches "the invoice wins".
  * Nothing on main reads or writes `tax_treatment` or `money_party_tax_treatment` (grep of api/src, ports, web/src, tests).
* **Invoice issuing on main still works.**
  * Main has no issue route. The only code that issues is `check_fo7g_tax_defaults.ts:271`, a raw `update money_invoice set due_date…, issued_at = now(), issued_by…`.
  * Under this PR's trigger, that update gets `tax_treatment = 'TAXABLE'` (the party has no row) and is not refused. Its DW5 then compares only lines and frozen rates, which this PR does not touch.
  * `check_fo7b_invoices.ts` never issues an invoice.
  * Prisma's `moneyInvoice.create` in `drafts.ts:61` is unaffected, because `taxTreatment` is optional (`client-money.prisma:296`).
* **DW27 (refund method and date required on REFUND_TO_CLIENT):** no route, port, screen or acceptance file writes REFUND_TO_CLIENT. The only tests that do are fo7a, fo7a2, fo7mv (already adjusted in round 1) and this PR's own. Main has not changed any of them since a8f388459.

## Note for FO-7g part 2 (not this PR's scope; does not block)
* Until FO-7g part 2 lands, the database accepts an issued invoice whose treatment is Exempt or Zero-rated while its lines carry `tax_minor > 0`.
* Main's `addLine` takes the line's `ratePpm` from the request and does not read the treatment.
* Today nothing can produce that state: no route writes a party treatment or issues an invoice.
* FO-7g part 2's brief should name who enforces "Zero-rated and Exempt give 0 on every line" at issue: the route, or a trigger, which would need a schema owner since that part "writes no schema". It should also name a test with a fail case: an Exempt party whose draft has a 13 % line is issued.

**Screen review and journey test:** not applicable, as in round 1. This part has no route, screen or `ports/` change. No journey score is given.

**Verdict: Block** for `4ac4e8b1ab36a438ebdbeca28a6584f28e5b5c6d`. Fix R6-1, the GRANT/REVOKE pair around `migration.sql:629-637`. Nothing else is open. After that, a diff-only check of that change is enough to Approve.

---

Round 5 line (superseded): Reviewer: Approve a8f388459601623315cf15285b87cf43f8bd25d8

# Round 5: diff-only re-read of a15e5f7ec..a8f388459 (one commit: the test only, plus the round-4 records)

**What changed:** in this part's code, only `tests/check_fo7ts_money_settings.ts` (+8/−1). No migration, rollback or schema file changed.

**R4-1: closed.**
* A new case (`check_fo7ts_money_settings.ts:702-708`) spends the pre-case money on the party's own invoice first, so pre-case holds 0.00 and only the cap can refuse. It then asserts that the 500.00 bounce on K is refused with `/takes from a case at most what was moved there \(CAD 1\.00\)/` (23514), and that 1.00 on K is accepted.
* In the R2-M1 case, the 1.01 assertion now names only the cap's words.
* **A correction to my round-4 note:** as built, the cap refuses that 1.01 before the deposit-total check runs. My `cap.mjs` run showed this. The deposit limit refuses it only once the cap is removed, which is why the old alternation hid the mutation. The builder's reading is right.

**What I ran at a8f388459:**
* The suite passed 155, failed 0.
* **Mutation check:** I copied the studio's migrations and this test to a scratch folder and replaced the cap's condition with `IF false`. The suite gave 153 passed, 2 failed, and exactly the two cap cases failed (R2-M1/R3-m2 and R4-1). The cap is now guarded by its tests. The copy and its scratch databases are deleted.

**Verdict: Approve** for `a8f388459601623315cf15285b87cf43f8bd25d8`. No Blocker, Major or Minor of mine is open.

---

Round 4 line (superseded): Reviewer: Approve a15e5f7ece04fbc91c335d34724e8dd62ebd8104

# Round 4: diff-only re-read of fce13845d..a15e5f7ec (one commit)

**What I ran at a15e5f7ec:**
* `check_fo7ts_money_settings` passed 154, failed 0.
* fo7a2 35/0, fo7a 122/0, fo7mv 45/0, fo7lk 16/0, prisma 8/0.
* I wrote a mutation script (`rv/cap.mjs`). Its scratch database is dropped.

## What this commit closes
* **R3-1: closed.** The `money_move_line_write` comment (`migration.sql:542-545`), the header note before the FO-7lk functions (`migration.sql:415`), and the notes in `FO-7t.md` and `FO-7m.md` now all say that the route takes every lock its lines need before the first line, sorted: each line's party and each pick line's invoice party. They say sorting the lines is not enough. That is the rule my `moveline2.mjs` case needs.
* **The breaker's R3-m2: closed.**
  * A pre-case deposit's correction on a moved-to case is refused while the party holds anything before a case (`migration.sql:258-264`). The check is read under the party's lock, in the correction branch, and the error message names the amount held there.
  * The check is sound. A returned cheque now comes off pre-case money first, then off the case, which can take more than one row.
  * My `bounce.mjs` case (pre-case at 0 after the move) is unaffected, because the booking on K is still allowed.

## New (does not block)
**Minor R4-1: the R2-M1 cap is no longer pinned by any test. Reproduced by mutation.**
* The reordered test (`check_fo7ts_money_settings.ts:698-701`) checks the cap's refusals with `/at most the deposit|at most what was moved there/`.
* In that sequence, 499.00 is first corrected before a case, so the deposit-limit check refuses 1.01 on K anyway.
* I removed the cap block (`IF -NEW.amount_minor > on_case …`, `migration.sql:269-271`) from the live function in a scratch database:
  * the builder's sequence gives the same pass/fail pattern;
  * a case that does reach the cap gets through. That case: the pre-case money is spent on the party's own invoice first, then the whole 500.00 bounce is booked on K. As built it is refused ("at most what was moved there (CAD 1.00)"); with the cap removed it is **stored**.
* The test before this commit had pinned the cap with `bounce(50000, Kg)` → `/(CAD 1\.00)/`.
* **Fix (test only):** add that case, a cheque with 1.00 moved to K whose pre-case money is then spent on the party's own invoice. Assert that the whole bounce on K is refused with `/takes from a case at most what was moved there \(CAD 1\.00\)/`. Then drop the `at most the deposit|` alternative from the two cap assertions.

**Verdict: Approve** for `a15e5f7ece04fbc91c335d34724e8dd62ebd8104`. No Blocker or Major is open; the cap's database code is correct as built. Fix R4-1 in a follow-up, or in this PR as a test-only push, which would then need a diff-only check.

---

Round 3 line (superseded): Reviewer: Approve fce13845d0cea57092eb0cc1fa4277fa738c1777

# Round 3: diff-only re-review of 73adf83e5..fce13845d

**Scope.** I read only this part's files: the `20261119170000_fo7ts_part3` migration and its rollback, `check_fo7ts_money_settings.ts`, the three fixture helpers, `challenge.md`, and the lock-order notes in `design/briefs/FO-7t.md` and `FO-7m.md`. The merge of `origin/main` (4ecee277e) is out of scope. Main's newest migration, `20261119144500`, is still earlier than this part's stamp.

**What I ran at fce13845d:**
* `check_fo7ts_money_settings` passed 154, failed 0.
* fo7a2 35/0, fo7a 122/0, fo7mv 45/0, fo7lk 16/0, prisma 8/0, and pf12_walls 100/0 (run with `--tsconfig api/tsconfig.json`).
* The rollback catalog fingerprint, now covering five functions, is identical before part 3 and after part 3 plus its rollback.
* I re-ran my scratch scripts:
  * `deadlock.mjs`: 0 of 100 races deadlocked;
  * `bounce.mjs`: the pick on K is still refused;
  * `moveline2.mjs`: results below.
* All `rv_fo7ts3_*` scratch databases are dropped. No test was weakened: the only deleted `ok(` lines are rewordings that now name the extra function, and the fixture dates moved to `current_date` because of the new lower bound on refund dates.

## Round 2, now closed
* **R2-1 (Major): closed by Lead 96's ruling 4.**
  * `money_move_line_write` (`migration.sql:506-617`) differs from FO-7lk's text only in reading the invoice's party and taking the two locks smaller id first. I diffed it.
  * The lock is taken only for a TRUST_APPLIED line whose source has an invoice, and only withdrawals have one. So an entry that the checks then refuse still takes no extra lock (FO-7lk's B-1 is kept).
  * My round-2 reproduction (B < A < D) now ends with both sides committing, where it ended in 40P01 before. The builder's race of 100 gives 0 deadlocks.
  * `rollback.sql` restores the function from FO-7lk, and its guard now matches code tokens.
* **Nits R2-1 and R2-2: closed.** The `money_credit_note_write` comment is rewritten, and the guard matches `FOR p IN SELECT DISTINCT` instead of comment text.
* **The breaker's round-2 fixes**, checked:
  * **R2-M1:** the moved-to-case correction is capped at what was moved there, less earlier corrections of pre-case deposits booked there (`migration.sql:255-265`). It is tested with a pass and a fail.
  * **R2-m2:** the other party's lock is taken only for a pick, or for a correction of the party's own withdrawal in the same currency (`migration.sql:119-125`). It is tested: the correction is refused without waiting on the lock.
  * **Refund date:** a refund is never dated before the party's first trust entry, minus one day, read under the party's lock (`migration.sql:146-150`). It is tested.

## New (does not block)
**Minor R3-1: the "sorted by party" rule for the move route is not enough on its own. Reproduced.**
* The function comment (`migration.sql:534-537`) offers "insert lines sorted by party … or take every line's locks first". `FO-7t.md`'s note offers the same "or".
* Sorting lines by the payer still deadlocks when a pick line's invoice party falls between two payers.
* **Reproduction** (`rv/moveline2.mjs f,1,5`), with payers A < D and invoice party B where A < D < B:
  1. The batch's first line (A's pick on X) takes A's lock, then B's, then X's row.
  2. D's pick on X takes D's lock, then waits on B.
  3. The batch's second line (D's own withdrawal) waits on D.
  4. Result: **40P01**.
* **Fix:** in `FO-7t.md`'s note and the function comment, make the route lock every party a batch touches before its first line, in one sorted pass. That covers each line's payer and each pick line's invoice party. Drop "sorted by party" as a stand-alone choice, or say it is safe only when the batch holds no pick line. This is guidance for FO-7t part 3's route and its 100-race test, not a defect in this PR's database code.

## P-610
* Lead 96 granted the exception for about 886 lines, which agrees with my round-2 view.
* About 155 of those lines are the three FO-7lk function bodies copied in full for `CREATE OR REPLACE`; their changed lines number about 20.

**Verdict: Approve** for `fce13845d0cea57092eb0cc1fa4277fa738c1777`. No Blocker or Major is open. Minor R3-1 can be fixed in this PR's brief note, or carried to FO-7t part 3's brief before that route is built.

---

Round 2 line (superseded): Reviewer: Changes requested 73adf83e5c19d82d86517ccf037ac5ce86909856

# Round 2: diff-only re-review (P-277) of e70a2c44e..73adf83e5

**What I ran at 73adf83e5:**
* `check_fo7ts_money_settings` passed 150, failed 0.
* fo7a2 35/0, fo7a 122/0, fo7mv 45/0, fo7lk 16/0, prisma 8/0, and pf12_walls 100/0 (run with `--tsconfig api/tsconfig.json`).
* The rollback catalog fingerprint (round 1's method, now including the two FO-7lk functions) is identical before part 3 and after part 3 plus its rollback.
* I re-ran my round-1 scratch scripts and wrote one new one (`rv/moveline.mjs`). All `rv_fo7ts3_*` scratch databases are dropped.

## Round-1 findings

* **Major 1: closed.**
  * The diff against FO-7lk's text is only the lock lines.
    * `money_credit_note_write` (`migration.sql:388-454`) reads the invoice's party and takes the smaller id first.
    * `money_move_batch_owed_back` (`migration.sql:456-490`) locks every line party and every invoice party, sorted, before any invoice row.
  * My race (pick against an OVERPAID_TO_TRUST credit note) went from 53 of 100 deadlocks to **0 of 100**.
  * The builder's two DW26 races of 100 each pass.
  * `rollback.sql` restores both functions from FO-7lk's text, and the restored-text guard covers them.
* **Major 2: closed.**
  * A no-case deposit's correction may now sit on a case its party moved money to (`migration.sql:242-246`). Money returned from a withdrawal stays on its case, and a deposit's reversal can only take money out, so neither direction can inflate a case.
  * My `bounce.mjs` scenario: the returned cheque is booked on K, and the pick on K is refused ("Only CAD 0.00 is available on it"). The new test covers this as a pass and a fail.
* **Major 3: closed by ruling.** Lead 96's written ruling, recorded in `challenge.md`, moves DW28 and DW30 to FO-7t part 2 and DW29 to the next `client-money.prisma` PR. Build Lead C may still overrule it.
* **Minor 1: closed.** DW26 now proves that a deposit to the invoice's party waits, then commits.
* **Minor 3: closed** (`@updatedAt`).
* **Minor 4: closed.** The refusal over an existing trust refund is tested, and the test confirms nothing changed.
* **Minors 2 and 5: closed.** Both are recorded in `challenge.md` and go in the PR body.
* **Nits 1 and 3: closed.** Nit 2 (the DW26 planted fail) is still weak, but it is outweighed by the new race tests and the builder's mutation numbers (41 and 78 deadlocks with FO-7lk's text put back).

## New in round 2

**Major R2-1: a move batch's line for a pick touches the invoice row without the invoice party's lock, so it deadlocks with a pick on that invoice (40P01). Reproduced.**
* This is the same class as round-1 Major 1, in the third writer that a pick turns into a two-party writer.
* `money_move_line_write` (FO-7lk, `20261118210000_fo7lk_trust_lock/migration.sql`, the function from line 244; its lock is on line 272) locks only the line's party, the payer. It then runs `UPDATE money_invoice` on the source withdrawal's invoice (FO-7lk's rule: party lock before any invoice row).
* **Reproduction** (`rv/moveline.mjs`, at 73adf83e5), with parties B (the invoice's) < A < D:
  1. T1, a trust-to-operating batch, writes a line for A's pick on B's invoice X. T1 now holds A's lock and X's row.
  2. T2, a pick by D on X, takes B's lock, then D's, then waits on X's row.
  3. T1 writes its next line, for D's own withdrawal, and waits on D.
  4. Result: **40P01**.
* A batch covering many payers is the normal monthly transfer, so this order is reachable, though it needs a concurrent pick on the same invoice.
* The brief's Holds forbid editing `money_move_line_write`. The fix is also not fully in the database: lines arrive one statement at a time, so the line-to-line order is set by the caller.
* **Fix, either is enough:**
  * **(a)** With the Lead's leave, `money_move_line_write` takes the line's party and the invoice's party smaller id first before the row, and the move route (FO-7m) inserts lines sorted by party, or locks every party up front. Add a DW26 race.
  * **(b)** A written ruling in `challenge.md` that records this as a known retry, owned by the move route's item, with that item's brief naming the sorted-insert and pre-lock rule.
* I keep this at Major for the same reason as round 1: it breaks FO-7lk's one lock order. A recorded ruling is enough to clear it.

**Nit R2-1:** the FO-7lk comment kept in `money_credit_note_write` (`migration.sql:396-400`, "an entry the checks below refuse takes no lock of another party … that would be a new two-party order") now contradicts the code below it. Shorten it to point at the part 3 note.

**Nit R2-2:** the rollback's restored-text guard for `money_move_batch_owed_back` (`rollback.sql:31`) checks for the comment text '%FO-7ts part 3%'. That works, but it is fragile. Matching a code token (for example `FOR p IN`) would be sturdier.

## P-610 size: I support the exception
* The part's own diff is now 841 added and 11 removed, about 852 lines.
* About 110 of those lines are the full bodies of the two FO-7lk functions. `CREATE OR REPLACE` needs the whole text, and the change in them is about 12 lines.
* Splitting the fix into its own PR would either leave a known 40P01 on `main` between the two merges, or need a second migration and a second pass of the baton for 12 lines.
* Without the copied text, the part is about 740 lines.

**Verdict: Changes requested** on `73adf83e5`, for R2-1 only. Everything from round 1 is closed. Once R2-1 is resolved by (a) or (b) with nothing else changed, an Approve needs only a diff check of that change.

---

# Round 1 (kept as the record)

Round 1 line (superseded): Reviewer: Changes requested e70a2c44e581fd2501bfccedc04c53ce725e9a46

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
