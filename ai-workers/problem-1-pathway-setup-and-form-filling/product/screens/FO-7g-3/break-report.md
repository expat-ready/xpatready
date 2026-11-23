# FO-7g part 3: break report (money, schema). PR #3156

The pass was asked for at head 8de8403af. While it ran, the branch moved to **c915fffe1** (review round 1: wording, the view typed as the 13 codes, the rollback comment, check_fo7b_invoices). `migration.sql` is the same in both commits. The API attacks ran on c915fffe1. Database attacks ran on the migration file, which is the same in both. Scratch database `xr_studio_brk7g3_<pid>` on :54329 (dropped). Isolated copy `brk7g3` on :4737, started and stopped in the same command (`tools/isolated.sh … start --ttl 30 PLATFORM_IDENTITY=local …`). A throwaway PostgreSQL 18 cluster on :15491 for the RDS-shaped runner (removed). The harnesses were kept outside the repo, in the scratchpad (`attack.mjs`, `attack2.mjs`, `rds.sh`). Nothing was committed.

## Findings

| # | Sev | What | Evidence |
|---|-----|------|----------|
| M1 | **Major** (at 8de8403af; **fixed in c915fffe1**) | `tests/check_fo7b_invoices.ts` went red: **101 passed, 7 failed** (R4, R4b, R5, R8). Its rate cases started a draft while the firm was in ON, then moved the firm to NB/NS/AB and sent that rate. Now the draft keeps the Bill-to it was started with (ON), so the line is refused with 422 "HST 13 %". The product behaves as P-797 intends; the suite was out of date, and the merge queue would have failed. | `npx tsx … check_fo7b_invoices.ts` at 8de8403af gave 101/7. At c915fffe1 it gives **108/0**: `taxOf` now starts the draft inside `atRate` (tests/check_fo7b_invoices.ts:117). Also reproduced over the API (T1 below). |
| m1 | Minor | The gate lets **the issuing UPDATE itself** change the Bill-to. `OLD.issued_at` is null in that statement, so `update money_invoice set issued_at=now(), issued_by=…, due_date=…, bill_to_province='QC'` on an NB draft issues INV-0002 with QC. Its lines keep NB's rate. Only reachable by direct SQL: `POST …/issue` never writes the column. money_invoice_write's other frozen columns behave the same way. | migration.sql:22; the scratch DB returned `INV-0002\|QC` (rolled back). |
| m2 | Minor | On a draft written before this part (`bill_to_province` null), `GET …/invoices/:id` shows `billToProvince: null`. Its new lines still follow the firm's **live** province: line 1 took ON's 13 %, and after the firm moved to NB, line 2 took 15 %. Nothing in the view says which province applies. This is what the migration comment says will happen; a later screen must read null as "the firm's province". | attack2 "GET null draft shows: null"; T2 lines `1:130000,2:150000,3:50000` (after PUT AB). |

No Blocker.

## Attempts that held (command → result)

**Inputs** (`attack.mjs` I*, PUT `…/bill-to` on an ON draft; after each attempt the stored value was read back with psql):
* Refused with **422 at `province`**, value unchanged: `on`, `" ON"`, `"ON "`, fullwidth `ＯＮ`, Cyrillic `ОN`, `ON​`, `ON\u0000`, `["ON"]`, `{"code":"ON"}`, `true`, `13`, `null`, `{}`, an empty body, no body, text/plain, `Ontario`, `XX`, `CA`, `NY`, and a 100,000-character string.
* Other refusals: `{"province":"QC","country":"CA"}` gave 422 at `country`. `{"Province":…}` gave 422. A top-level array gave 422 at `body`. `__proto__` gave 422 at `__proto__`. `constructor` gave 422.
* `"QC"`, `null` and malformed JSON gave **400 BODY_NOT_JSON**. A 6 MB body gave **413 BODY_TOO_LARGE**.
* Duplicate keys: the last one wins (standard JSON), giving 200 QC. `?province=QC` in the query is ignored; the body wins. An urlencoded `province=QC` is accepted (200), because the app takes urlencoded bodies everywhere. Bearer auth and the strict schema still hold, so this is not a finding.
* Audit lines on that draft: 6, one per real change. Every refused attempt wrote none.

**Walls and roles:**
* Firm A's token on firm B's invoice, by lower-case and by upper-case id: **404**. B's value stays AB.
* Malformed ids (`not-an-id`, `%00`, 5,000 characters, `../`, the nil UUID): **404**. Our own draft by upper-case id: 200.
* Case Officer `user-O` on their own draft: **403**. They can still start the draft (Bill-to ON) and add a line (201). `user-T` on R's draft: 403.
* No token: **401**. A bad token: 401. GET or PATCH on `/bill-to`: 404.

**Races:**
* R1: 20 PUTs at once with 10 different codes. All 200, 20 audit lines. The audit lines' before→after values chain into one unbroken path from ON to YT, and the stored value is YT. No change was lost and none was invisible.
* R2a: a psql transaction held the invoice row lock. A PUT NB was queued first, then a line. The line took **15 %**.
* R2b: same set-up, the line queued first, then PUT AB. The line took **NB's 15 %**, the rate before the PUT. Stored value AB. Both orders are consistent under `for update` (drafts.ts:93, :134).
* R2c: 15 line adds and 15 PUTs (NB/AB alternating) at once. Only 200/201 came back, no 500 and no deadlock. 15 distinct positions; rates only 150000 or 50000.
* R3a: a direct issuing `UPDATE … set issued_at` was held uncommitted while a PUT NB waited. The PUT returned **409 ISSUED**; stored ON, 0 audit lines.
* R3b: `PUT NB` against `POST …/issue`, 10 times. Either the PUT won (200/200; issued with NB, 1 audit line) or the issue won (409/200; ON, 0 audit lines). Never a 500, and never a value changed after issue.
* R4: a PUT QC racing a firm move ON→NB gave stored QC, and the next line took QC's 5 %. A draft racing a firm move ON→SK stored one whole code (SK).

**Database directly** (scratch DB, `xr_studio` superuser):
* CHECK: refuses `on`, `' ON'`, `'ON '`, fullwidth, Cyrillic, `''` and `XX`, on UPDATE and on INSERT. NULL is accepted on a draft.
* Gate: on an issued invoice, code→code and code→NULL are refused ("INV-0001 is fixed"). NULL→NULL and unrelated updates are allowed. Un-issuing and changing in one statement is refused. An issued row cannot be INSERTed (money_invoice_write).
* The trigger is enabled (`O`). The function belongs to `xr_wall_reader`, is SECURITY DEFINER with search_path fixed, and `xr_app` cannot EXECUTE it.
* The migration applied over 1 draft and 1 issued invoice. Both stayed NULL and both totals stayed 113000.
* `rollback.sql` in one transaction: the catalog was **identical** to the state before the migration (columns, constraints, triggers, function hashes, ACLs, schema ACL). Re-applying worked. A second apply refuses ("already exists").

**RDS-shaped runner** (`rds.sh`: PG 18, `xr_admin` NOSUPERUSER CREATEROLE, migrations before this one applied with BYPASSRLS, then a draft and an issued invoice added, then NOBYPASSRLS; the runner sees 0 invoices through row-level security):
* `prisma migrate deploy` exits **0**, and `migrate status` reports the schema up to date. The rows stay NULL with totals unchanged.
* The function is owned by `xr_wall_reader`, and `xr_wall_reader` holds no CREATE on public afterwards.
* As `xr_app` with the firm set: the draft takes QC; the issued invoice is refused by the gate. With no firm set: UPDATE 0.
* `rollback.sql` as `xr_admin` succeeded: column and function gone. Deleting the `_prisma_migrations` row and running `migrate deploy` again exits 0, and the gate works again.

**Tax:**
* T3: an existing line stayed `1:130000:13000` through 3 PUTs.
* R3c: an issued invoice with lines at 13 % and 15 %. Three PUTs gave 409; a direct SQL write was refused by the gate. The PDF's sha256 was the same before and after, and the total stayed 228000 → 228000.
* T4: an unregistered firm with Bill-to NB charges 0 %. T5: a firm with no province: the draft's Bill-to is null and its line gets 0 %. After PUT NB, the next line gets 15 %.
* A firm province of `" on "` makes the draft store `ON`. `Ontario` stores null; nothing is guessed.

**Other suites:**
* At 8de8403af: check_fo7g3_bill_to 20/0, check_fo7g_tax_defaults 76/0, check_fo7a_money_schema 122/0, check_pf8b_f4_migrations 9/9, check_pf8b_f6_pg18_nobypass 26/26, check_pf8b_f7_data_walls 17/17.
* At c915fffe1: check_fo7b_invoices 108/0, check_fo7g3 20/0.

At c915fffe1 the one Major (M1) is fixed and two Minors remain. 8de8403af alone would fail on M1.

Verdict: pass
