# Break report: CS-W2 part filings (PR #3811, head 9d0b3417e)

Breaker, 26 Nov. Target: `prototype/studio/prisma/migrations/20261126090000_filings__csw2_firm_id/migration.sql`.
Method: scratch databases on 127.0.0.1:54329 (earlier migrations; seed: a sample-firm case (A, `…0003`), a sample-solo case
(B, `…0004`), two "ghost" cases whose key has no platform firm, an A case on an ended stage, rows in all nine tables; then
this migration), plus an isolated copy `rt_brk` on :4499 (PR suite, demo reset). Ids `u(n)` follow the suite's layout:
case 1 `u(11)` (A), case 2 `u(12)` (B), filing `u(40+n)`, assessment `u(60+n)`, applicant `u(70+n)`, item `u(80+n)`,
override `u(90+n)`. All dropped afterwards; no code edited.

## Major

**M1. Setting `firm_id` back to null lets a row through every composite key (MATCH SIMPLE), as the app's role, in one statement.**
The keys are `(parent_id, firm_id)` with the default MATCH SIMPLE, and `firm_id` is nullable in this part. PostgreSQL does
not check a composite foreign key when any of its columns is null. Nothing stops an UPDATE from setting a filled
`firm_id` back to null on the tables with no write-once guard: `filing_applicant`, `assessment_override`,
`assessment_review`, and `filing_item` / `filing` / `submission_group` while their stage is current. So a firm A row can
be moved under a firm B parent, which DW1.3 says is impossible. Every statement below succeeded (`UPDATE 1`), also after
`set local role xr_app`:
```sql
update filing_applicant set firm_id = null, filing_id = '<u(42): firm B filing>' where id = '<u(71): firm A applicant>';
update assessment_override set firm_id = null, assessment_id = '<u(62): firm B assessment>' where id = '<u(91)>';
update assessment_review set firm_id = null, assessment_id = '<u(62)>' where assessment_id = '<u(61)>';  -- after removing B's own review
update filing_item set firm_id = null, filing_id = '<u(42)>' where id = '<u(81): item of firm A case u(11)>';
-- control: the same item move without "firm_id = null" is refused by filing_item_filing_id_firm_id_fkey
```
Result: a firm A row under firm B's filing or assessment, with an empty firm (invisible to both firms once CS-W4's
policies land; CS-W1 part 2's NOT NULL then fails on it). "A child cannot point at another firm's parent" holds only until
the first `set firm_id = null`. The guarded tables (assessment, filing_change, filing_form_addition) are safe: their
guards refuse a value going back to null.

## Minor

**m1. A race leaves a row with no firm under a case that has one, for good.**
The fill reads the parent's firm without a lock. The follow cannot see a row that is not yet committed. Sequence:
session 1 runs `begin; update runtime_case set firm_id = '<A>' where id = '<ghost case u(14)>'; select pg_sleep(3); commit;`.
During the sleep, session 2 inserts into `assessment` under `u(14)`. The fill reads null. The foreign-key lock waits for
session 1, then passes, because a null firm skips the composite key. Result:
`select k.firm_id, a.firm_id from assessment a join runtime_case k on k.id = a.case_id where a.id = '<new>'`
gives `A | null`, and nothing fills it again. `case_firm_backfill()` only touches cases still empty, so the follow never
fires again, and `case_filings_firm_backfill()` is not called after the migration. Window: the start or demo backfill
running beside writes on a ghost-key case.

**m2. The fill-only exception compares jsonb values, not their text, so a frozen row's JSON can be rewritten once.**
`case_filings_firm_fill_only` uses jsonb `=`, which treats numbers by value. On the row m1 left behind:
```sql
update assessment set firm_id = '<A>', result_json = '{"score": 1.000}' where id = '<row from m1>';  -- passes assessment_frozen
-- the stored text changes from {"score": 1} to {"score": 1.000} (md5 c9a98d4e… -> cad6e281…); without firm_id it is refused
select case_filings_firm_fill_only('{"firm_id":null,"x":-0}','{"firm_id":"a","x":0}'),
       case_filings_firm_fill_only('{"firm_id":null,"x":1e2}','{"firm_id":"a","x":100}');  -- t | t
```
The same applies to `filing_form_addition.frozen`, which sits beside `frozen_sha256`, and to `filing_change.roles_*`.
Narrow: it needs a null-firm row under a case with a firm (m1, or M1). Comparing the text (minus firm_id) would close it.

**m3. The follow stamps a case firm that is not the case's key firm onto write-once rows, permanently.**
CS-W1 part 1 has no guard on updates to `runtime_case.firm_id`, so the app role can set any firm on a ghost-key case.
The follow then writes that firm through the guard exception into the frozen assessment, the append-only filing_change
and the filing_form_addition. After that, ON UPDATE RESTRICT and the guards stop it ever being undone:
```sql
begin; set local role xr_app; update runtime_case set firm_id = '<B>' where id = '<ghost case u(13), key ghost-firm>';
-- assessment, filing_change, filing_form_addition of u(13) now all carry B
update runtime_case set firm_id = null where id = '<u(13)>';  -- ERROR: violates RESTRICT … submission_group_case_id_firm_id_fkey
rollback;
```
Root cause: CS-W1 part 2's missing update guard; the follow checks only `NEW.firm_id IS NOT NULL`, not the key.

**m4. One cross-firm row under a ghost case makes the follow fail `case_firm_backfill()` for every case.** Allowed (null firm, keys skipped):
`insert into filing_item (…, case_id, filing_id, …) values (…, '<ghost case u(13)>', '<u(42): firm B filing>', …)`.
Then, once the ghost key gets its platform firm, `select case_firm_backfill()` fails with
`filing_item_filing_id_firm_id_fkey … CONTEXT: UPDATE filing_item SET firm_id = $1 WHERE case_id = $2 AND firm_id IS NULL`.
One row stops every case from getting its firm (`fillCaseFirmIdsOnStart` logs and carries on).

**m5. The pre-key check misses one parent being empty.** A filing of a sample-firm case placed under a ghost case's group passes the `DO $chk$` block, because it skips
`g.firm_id IS NULL`. The migration then stops in PostgreSQL's words, not the PR's:
`ERROR: … violates foreign key constraint "filing_submission_group_id_firm_id_fkey" DETAIL: Key (…)=(u(33), A) is not present`.
The same applies to an item or addition whose filing is empty and whose case is not.

**m6. Header and rollback name a follow trigger on `submission_group` that is never created** (that DROP would error).

**m7. An explicit null firm bypasses the session firm.**
With `set local app.firm_id = '<B>'`, an `insert into filing_change (…, firm_id) values (…, '<case u(11) of A>', …, null)`
gets firm A. The fill fills a null firm from the parent without looking at the setting. Only the column default (B) is
refused. CS-W1's function; CS-W4's policies will cover it, but DW1.2's claim holds only for the default.

## What held
* All twelve composite keys refuse a cross-firm parent on insert and on a plain update (with the fill disabled).
* The fill: unset setting (parent's firm), `''` (parent's firm), garbage or a padded uuid (refused,
  `invalid input syntax for type uuid`), another firm through the default (refused, 23514), and a named firm under a ghost
  case (refused).
* Guard exception: it cannot set a firm other than the parent's (`assessment_case_id_firm_id_fkey`,
  `filing_change_case_id_firm_id_fkey` refuse). It cannot empty a firm or carry any column change other than m2's
  number-text case. Removed additions, ended stages and append-only rows stay refused for every other update.
* Follow: no loop (case → filing → applicant; assessment → override/review). It only ever writes the parent's firm (the
  keys check it). ON UPDATE RESTRICT stops a case's firm moving while children name it.
* Migration on two firms plus ghost cases: 27 rows backfilled, ghost rows left empty, ended-stage and frozen rows filled.
  The DW1.1 "filing under the other firm's group" case stops with the PR's words. A second backfill run returns 0.
* Deletes of 1, 3 or all cases cascade through all nine tables; a group with filings stays RESTRICT. Isolated copy: PR
  suite 21/21, API-made rows carry the case's firm, demo reset with filings present 201 and 0 rows left.

Verdict: Changes 9d0b3417ececa13becaf9c94fa20315a2a6aa132
