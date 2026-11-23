Reviewer: Approve 9f88b52c96df5a6cd91d0ff8495ae6a533f113ab

# Round 4 (diff only, c239c2175..9f88b52c9): the merge of main and the CI `types` fix

Reviewer (Opus 5.5; I did not build it), 23 Nov. **Verdict: Approve** (Ship). No open Blocker or Major; the round 3 Minors stand as written.

* **The merge 58ecdbece** (origin/main `d8e6c7959`, which includes #3042) was clean: `git show --cc 58ecdbece` is empty, so no conflict was resolved by hand. The newest migrations on the head are `20261123010000_fo9b_person_merge`, then ours, `20261123020000_fo7g3_bill_to_province`, so the P-600 order holds.
* **The fix 9f88b52c9** is one file, +2/-2. `drafts.ts:9` imports `MoneyLineKind` from `@prisma/client`, and `drafts.ts:149` changes `kind: { not: "GOVERNMENT_FEE" }` to `{ not: MoneyLineKind.GOVERNMENT_FEE }`. The query is the same at runtime and only the type changes.
* **The PR's own diff stayed the same:** I compared `git diff origin/main HEAD -- prototype/studio` with `git diff 73455f04f c239c2175 -- prototype/studio`, with the index lines removed. The only differences are those two lines (one hunk header moved with the import). `git diff origin/main...HEAD --stat` lists the same 14 files: 11 studio files and 3 records.
* **Interplay with #3042 (FO-9b):** FO-9b's DW2 column scan matches `(^|_)(person|company)_id$`, foreign keys and FO_PERSON subjects. `bill_to_province` matches none of these, so it needs no classification. When a merge re-points an invoice's person, it does not change `bill_to_province`, so our gate lets it through.
* **Runs on the head:**
  * `node product/tools/typecheck.mjs`: PASS, "no new type errors (15 known, 0 fixed)" (api 15 known, web 0).
  * `check_fo7g3_bill_to.ts`: 23/0.
  * `check_pf8b_f4_migrations.ts`: 9/9.
  * I did not re-run `check_fo7b_invoices.ts`, `check_fo7g_tax_defaults.ts` or `check_fo9b_*`. The builder reports fo7b 108/0 and fo7g 76/0, and this diff does not touch what those checks cover.

Reviewer: Approve 9f88b52c96df5a6cd91d0ff8495ae6a533f113ab

---
Reviewer: Approve 1b58c679aae69f2f1e350bd27b301324d0812ef0

# Round 3 (diff only: `git diff 207ef0f83 1b58c679a -- prototype/studio`; 2 files, +51/-14): Lead B's re-rate

Reviewer (Opus 5.5; I did not build it), 23 Nov. **Verdict: Approve** (Ship). No open Blocker or Major. Minors R3-1 to R3-4 are below.

## Runs (PG 127.0.0.1:54329; no app started; never :4400)
| Run | Result |
|---|---|
| `check_fo7g3_bill_to.ts` at 1b58c679a | **23/0** |
| `check_fo7b_invoices.ts` at 1b58c679a | **108/0** |
| Mutant a (scratch worktree): no `taxRatePpm: from.ratePpm` filter, so every non-government line is re-rated | 22/1: B7 pass fails (the 0 % FEE goes to 15 %) |
| Mutant b: the re-rated tax is `Math.round(...) + 1` instead of `this.tax` | 20/3 (B2 pass, B2 fail, B7 pass) |
| Mutant c: no re-rate at all | 19/4 (B2 pass, B2 fail, B7 pass, B7 fail) |
| My probe: a copy of the check in the scratchpad with 4 extra cases, on its own scratch database, dropped at the end | all 4 pass, listed below |
Probe cases:
* 1,100.00 credit applied (by SQL) to a 1,130.00 ON draft, then Bill-to AB: **409 `CREDIT_APPLIED`**; lines, Bill-to (ON) and audit (0) unchanged. The regex matches the trigger's text through Prisma's model `update`, and the HttpException rolls back the Bill-to write already made.
* The same draft, then Bill-to NB: 200, and the line is at 15 %.
* AB → NT (both 5 %): no line touched, NT stored, one audit line with `linesReRated` 0.
* Firm switched to unregistered after a 13 % line, then Bill-to NB: nothing re-rated (from and to are both 0).
The probe's only failure was the final "draft_created = invoice count" line, caused by the issued invoice my probe inserted by SQL.

## Correctness, point by point (`drafts.ts:130-166`)
* **Which lines count as "at the old default":** lines where `tax_rate_ppm = from.ratePpm` and the kind is not GOVERNMENT_FEE. `addLine` only ever stores 0 or the default (a sent rate other than these is 422, `:105-108`), so on any draft written after this part a rate equal to the old default is always a default line, never a person's choice. A 0 % line stays at 0, as Lead B's read says (B7, mutant a). The kind filter is a second guard: a government fee is always 0, so the rate filter already excludes it while from > 0.
* **Stored value null (drafts from before this part):** `from` falls back to the firm's *current* province, as `addLine` does. See R3-2.
* **Unregistered firm:** from and to are both 0, so nothing moves and the audit line records 0 → 0 (probe 4). **Same rate** (AB/NT/NU/YT/QC/BC/MB/SK at 5 % in the cited GST/HST table): no line is written, the province is stored, the audit says 0 lines (probe 3).
* **from = 0 with a province now chosen** (registered firm with no province, so lines were stored at 0, NONE): `from.ratePpm > 0` is false, so those lines stay at 0 while new lines take the new rate. That is the read word for word ("0 % lines … stay at 0"). See R3-1.
* **Rounding:** `this.tax`, the same injected `taxForLine` (half to even, per line) as `addLine`, on `amount_minor`. Quantity is already in the amount.
* **Lock order:** the invoice is taken `for update` first (`:135`). Then the facts read, then the Bill-to write, then the line updates. Each line update fires `money_invoice_line_credit`, which holds the invoice FOR SHARE (already covered by our FOR UPDATE) and `money_credit_kept_holds`. That is exactly `addLine`'s order (invoice lock, then a line write), so no new lock order and no deadlock with `addLine`. A concurrent `addLine` waits and then reads the new Bill-to.
* **CREDIT_APPLIED:** the per-row AFTER trigger can refuse partway through. A re-rate moves every line in the same direction, so if the trigger refuses after one row, the full change would be refused too. The whole transaction rolls back (probe 1).
* **Audit:** one line per change. `before`/`after` carry the province and the rate. `detail` holds flat counts and sums only (`linesReRated`, `taxBeforeMinor`, `taxAfterMinor`), within AuditDetail's limits. The same value returns before any read or write (B2 fail).
* **Scope:** no route, field or migration change. `money_invoice_line_write` refuses only on issued invoices, so the `LINES_TAXED` branch correctly does not exist.

## Issues (Minor)
* **R3-1 (for the Lead, no change asked):** a registered firm whose province was not set shows "Your firm's province isn't set — tax is not added", and its lines are stored at 0. Setting a Bill-to leaves those lines at 0, and only new lines are taxed. This follows the read literally, but the biller may expect the untaxed lines to be taxed. Lead B may want to confirm that, or ask that 0 lines stored under NONE move too.
* **R3-2:** on a draft from before this part (stored null) whose firm changed province after a line was added, that line's old rate no longer equals `from` and is not re-rated. This affects legacy data only. It ties to round 1 Minor 2, which is with the Lead.
* **R3-3 (test strength):** the `CREDIT_APPLIED` mapping has no case in `check_fo7g3_bill_to.ts` (my probe 1 shows it works). The re-rate amounts (1,000.00 at 5/13/15 %) are exact, so a half-up for half-even swap inside the loop would not be caught. Fix: add probe 1 as a case, and one odd-cent line, for example 0.50 at 5 % (taxForLine 0.02 vs half-up 0.03).
* **R3-4 (records):** the BACKLOG row's B2 text ("leaves existing lines' stored tax unchanged") is now superseded by Lead B's read on #3156. The check's header says so. The row, or a DECISIONS line, should say so too, so that the record and the code agree (that is the Lead's file).

Reviewer: Approve 1b58c679aae69f2f1e350bd27b301324d0812ef0

---
Reviewer: Approve 91c33c747aef60d8ee58e8d657e8ba7206789aaa

# Round 2 (diff only: `git diff 8de8403af 91c33c747 -- prototype/studio`; 7 files, +22/-8)

Reviewer (Opus 5.5; I did not build it), 22 Nov. **Verdict: Approve** (Ship). No open Blocker or Major.

## What I ran (PG 127.0.0.1:54329; no app started; never :4400)
| Run | Result |
|---|---|
| `check_fo7g3_bill_to.ts` at 91c33c747 | **21/0**, exit 0 |
| `check_pf8b_f4_migrations.ts` | 9/9 |
| Mutant 1, in a scratch worktree (removed afterwards): the gate back to `IF OLD.issued_at IS NOT NULL AND …` | **20/1**: only the new "B3 fail (break m1)" case fails, so that case catches its own rule |
| Mutant 2, same worktree: `billToProvince` ignores `stored` | **17/4**: B5 unit, B1 pass, B1 fail and B2 pass fail. This confirms the round 1 claim by running it |
I did not re-run `check_fo7b_invoices.ts` (database-backed, not in the allowed list). The builder's 108/0 and the breaker's 101/7 → 108/0 stand as reported. I read the change line by line.

## Each change
* **Round 1 Minor 1, fixed:** `drafts.ts:108` now says "comes from this invoice's Bill-to province (HST 15 %)". This is correct in every case: when nothing is stored, the fallback (the firm's province) is what was stored as the draft's Bill-to.
* **Round 1 Minor 5, fixed:**
  * `ports/client-money.ts:82`: `z.enum(BILL_TO_PROVINCES).nullable()`. It is declared at `:34`, before its use, and the column's CHECK guarantees `InvoiceView.parse` cannot throw on stored data.
  * `read()`'s comment is back at `drafts.ts:146`.
* **Round 1 Minor 3, addressed in words:** `rollback.sql:3-5` now says that every invoice's value, issued ones included, is lost, and that the audit lines keep the province. This is acceptable: "recorded rollback" is met, and the issued figures are unaffected.
* **Break m1 (gate):** `migration.sql:23` now also refuses when `NEW.issued_at IS NOT NULL`, so the issuing statement cannot change the province its lines were taxed in.
  * Ordinary draft edits still pass, because `issued_at` stays null there.
  * Issuing without touching the column passes. B3 pass still sees NB kept.
  * `coalesce(OLD.number, 'an invoice being issued')` gives a readable message, because `OLD.number` is null while the invoice is being issued.
  * The function owner, SECURITY DEFINER, `search_path` and the F4 pair are unchanged. 21/0 includes the gate-owner case.
  * Side effect, recorded for the Lead: filling a null Bill-to at issue (round 1 Minor 2) would now also need this gate's condition changed. The PR comment hands Minor 2 to the Lead with that reasoning, which I accept. It stays Minor and open with the Lead, not a finding against this PR.
* **`check_fo7b_invoices.ts:117,158` (breaker M1):** `taxOf` and R8 now start the draft inside `atRate`, so the draft's Bill-to is the province whose rate the case sends. This is setup only. Every assertion, figure and message is unchanged (compared line by line). It is the right fix: the suite was out of date against P-797's "a draft keeps its Bill-to", and the product is not at fault.
* **Scope:** no new route, field or table. The only migration edit is the gate's condition and message, in this PR's own unmerged migration (not an applied one).

## My round 1 miss, stated
At 8de8403af I approved without running `check_fo7b_invoices.ts`. The breaker found it red (101/7): a Major I should have caught by reasoning about existing rate cases that move the firm after the draft starts. It is fixed at c915fffe1.

## Still open (Minor, no change needed in this PR)
* Round 1 Minor 2 (null frozen at issue): with the Lead.
* Round 1 Minor 4 (B3 issues by SQL): unchanged, test strength only.
* Round 1 Minor 6: the `j_56.ts:120` route shape is now told to qa in the PR comment.

Reviewer: Approve 91c33c747aef60d8ee58e8d657e8ba7206789aaa

---
# Round 1

Reviewer: Approve 8de8403af60f4878ac89b36ee228565ef7ab8a46

# Review: FO-7g part 3 (R1.56, money; API only): the Bill-to province (P-797)

Reviewer (Opus 5.5; I did not build it), 22 Nov, round 1 (full: new PR #3156). Code reviewed: head `8de8403af`, `git diff origin/main...8de8403af` (10 files, +259/-17). `origin/main` (`73455f04f`) is an ancestor of the head.
Spec: BACKLOG row "FO-7g part 3" and its six cases; P-797; AG-6-4 rules 1, 4 and 7, §8 and edge case 12 (`trace-requirements.py --brief FO-7g`); the Lead's instructions (`billToProvince` is the one function to change; stamp after 20261123010000; F7 lift for any data statement; F4 pair for any definer function). Tax readings: Unconfirmed: no accountant.

**Verdict: Approve** (Ship). No Blocker and no Major. Minors 1 to 6 are listed below; Minor 1 is a one-string fix worth making in this PR.

## What I ran (and what I didn't)
The caller said suites were running on :54329 with scratch databases and asked for no database drops, so I ran no database-backed check. `check_fo7g3_bill_to.ts` creates its own scratch database and drops it, so I did not run it either. I ran only the pure check `tests/check_pf8b_f4_migrations.ts`: **9/9**, including "every migration after F4 that hands xr_wall_reader a function grants CREATE first and revokes it after (14 later)". Everything else below is from reading the code, the migrations and the check.

## Done when: the six cases (`tests/check_fo7g3_bill_to.ts`), read statically
| Case | Pass / fail present | Does it fail when the rule is removed? |
|---|---|---|
| B1 Ontario firm, Bill-to NB → 15 %, not 13 % (`:100-104`) | both | yes: if `billToProvince` ignores `stored`, the line is stored at 130000 and both B1 lines fail |
| B2 an edit changes new lines and leaves existing tax (`:107-114`) | both | yes: under the same mutant, line 2 is ON, so the pass line fails. The fail line (no recompute, same value writes nothing) is independent of the mutant |
| B3 no change after issue (`:121-128`) | 2 fails + 1 pass | yes: drop the gate, and the raw `update … set bill_to_province` succeeds, because `money_invoice_write`'s fixed list (fo7ts_part3 migration) does not name the column. Drop the 409, and the route returns 200 |
| B4 code outside the 13 → 422 (`:131-137`) | 2 fails + 1 pass | yes: zod enum, unknown key, and the database CHECK each asserted |
| B5 no address, no edit → firm's province (`:89-97`) | both, plus the unit line | yes: the unit line `billToProvince(…, "NB") === "NB"` fails under the mutant (4 failing lines in total, as the builder says) |
| B6 firm A on firm B's invoice → 404 (`:140-145`) | both | the 404 is held by the `firm_id` filter at `drafts.ts:135` and by PF-12's RLS. Either one alone keeps it green (the same two layers as 1w's Minor 1) |
There are 20 `ok()` calls, which matches the builder's 20/0 (I did not re-run it).

## Correctness of the money and tax path
* **Draft create (`drafts.ts:68-74`):** `platform_firm` is read by the session's firm id, the same query `addLine` already runs under PF-12's walls. `provinceCode(billToProvince(...))` can only give one of the 13 codes or null (`tax/defaults.ts:29-35`), so the CHECK can't reject a create. The audit `after` carries `billToProvince`.
* **addLine (`drafts.ts:93,104`):** `bill_to_province` is read in the same `select … for update` that locks the invoice. `setBillTo` takes the same row lock (`:135`), so a line and an edit run one after the other: a line uses either the old or the new value, never a mix. The stored value wins, and null falls back to the firm's province (rows from before this part).
* **setBillTo (`drafts.ts:130-145`):** a malformed id gives 404 before parsing. The body is parsed (422 at `province`). The lock, then: not found → 404, issued → 409 `ISSUED` with the number. The same value writes no row and no audit. A change writes one row and one audit line with before and after. The key `agent/invoice:edit` matches AG-6-4 §8. Issue racing an edit: the `for update` re-reads `issued_at` after the issue commits → 409, and the gate stands behind it.
* **The gate (migration `:20-28`):** it fires only when `OLD.issued_at IS NOT NULL`, so issuing itself (`OLD.issued_at` null) passes and keeps the value. On a draft it can be written freely. `IS DISTINCT FROM` refuses null→code and code→null after issue. It is SECURITY DEFINER, owned by `xr_wall_reader`, with `search_path=pg_catalog, public, pg_temp` (the exact text `check_pf12_walls.ts:101` asks for). The F4 grant is before the hand-over and the revoke after it. `REVOKE ALL … FROM PUBLIC` is fine for a trigger function: EXECUTE is not checked when a trigger fires.
* **F7 / P-600:** there is no data statement, so no lift is needed, and no function is replaced. Stamp `20261123020000` is after main's newest (`20261122180000`) and #3042's `20261123010000`. The check's stamp line asserts that it is unique and the latest.
* **InvoiceView's new required field:** its only producer is `invoiceFacts` (`facts.ts:34`; Prisma `include` returns every scalar). The consumers (`documents.ts`, `money.ts`, `refunds.ts`, the `IssuedView`/refund views) read named fields only. `ClientMoneyPort` (`hasMoney`) and its contract are untouched, no web code calls the invoice routes, and no test compares the view's exact key set. Nothing breaks.
* **Scope:** everything changed is on the row's list. No screen. The party-address step is a comment (no row gives parties an address; the row says so).

## Issues, ranked (all Minor)
1. **Should fix: wrong words since this change.** At `drafts.ts:108` the refusal still says "The tax rate comes from your firm's province (HST 15 %)". With Bill-to NB on an Ontario firm, that is false: the rate is the Bill-to province's. Fix: "comes from this invoice's Bill-to province (NB: HST 15 %)", or name the source correctly in each case.
2. **An invoice can issue with no Bill-to.** Drafts from before this part, and drafts of a firm with no province, keep null through issue, and the gate then freezes null. FO-7ts part 3 resolves its own nullable `tax_treatment` at issue. Fix (optional): in `money_invoice_bill_to_frozen`, when `OLD.issued_at IS NULL AND NEW.issued_at IS NOT NULL AND NEW.bill_to_province IS NULL`, set it from the firm's `province_state` code. The definer can read `platform_firm`.
3. **The rollback drops issued invoices' values without warning.** `rollback.sql:7` does this, whereas the FO-7ts part 3 rollback refuses when recorded data would be lost. Fix: refuse when any issued invoice has a non-null `bill_to_province`, or say plainly that it is lost.
4. **B3 issues by raw SQL** (`check_fo7g3_bill_to.ts:122,127`), not through `POST …/issue`. The issue route does not touch the column, so this is test strength only.
5. **ports/client-money.ts:82:** `billToProvince: z.string().nullable()`. `z.enum(BILL_TO_PROVINCES).nullable()` would state the contract. At `drafts.ts:126`, the old `/** GET …/:id. */` doc now sits above `setBillTo`'s doc, and `read()` has lost it.
6. **Records:** the PR body says "Checks and results: to follow" and then "full ci is green". Put the numbers in the body. `journeys/j_56.ts:120` reads the edit as `PATCH …/invoices/:id {billToProvince}`. Tell qa that the built route is `PUT …/:id/bill-to`. W3 stays red in any case until parties have an address (source `PARTY_PROVINCE`).

## AG-6-4 against the row
* Rule 1, edge case 12, rule 7 and §8 are met as above.
* Rule 4 (outside Canada): not reachable on main. The column holds the 13 codes only, and no party has an address. The row's sentence "Outside Canada: no tax line, the rule 4 hint" conflicts with P-797's "tax shown as the firm's province until confirmed" (Sample). The PR raises this openly as Question 1 and follows P-797, which outranks the row. That is correct, and it is for the Lead to rule. Not a finding.
* Note for FO-7s1, not this PR: `GET …/tax-default` (`tax/routes.ts:33`) is per party and answers the firm's province. Once a Bill-to is edited, a screen must take the invoice's `billToProvince`, not that route, as the line default.

## Screen-review items
No screen and no concept, so D1-D20 and BIC-01 to BIC-20 do not apply (N/A). I did not run the graph tool, because it rewrites `qa/GRAPH.md` and I write only this file and the journey report. The route's test is named in `MODULE.rows/FO-7g-3.md`.

## Journey test (API, reviewer role): **8/10, pass** (simulated from code and the check; not walked)
See `journey-test-reviewer-2026-11-22.md` in this folder.

## Could not check
I re-ran no database-backed check (`check_fo7g3_bill_to`, `fo7b`, `fo7g`, `fo7a`, `pf12`, `f7`), as instructed. I did no mutation run and measured no timings. There is no accountant, so the tax readings stay Unconfirmed.

**Verdict: Approve.** No open Blocker or Major.

Reviewer: Approve 8de8403af60f4878ac89b36ee228565ef7ab8a46
