# FO-7w1 review: invoice from the signed retainer (independent reviewer)

**Reviewed:** PR #3654, head `ac93518c49fa49e5e622b61e04f6c81a21d75a3c` (branch `claude/funny-heisenberg-vl1m77`), diff `origin/main...ac93518c4` (14 files, +384/-9). API, schema and a shared port only: there is no screen, so this is judged against BACKLOG row FO-7w1 and AG-6-65 r1, AG-6-64 r2 and AG-6-61, not against a concept. **Verdict: Ship** (no Blocker or Major). **Journey score 8/10, pass**, in `journey-test-reviewer-2026-11-25.md`.

## What I ran (my own runs, not the builder's)
* `check_fo7w1_retainer_invoice.ts`: **25 passed, 0 failed**, run in the checkout and again in a scratch copy.
* j_56 on an isolated copy at **:4437** (runtime ports; never :4400): **17/18**. W1 passes (201, `FEE:150000:`). The only red step is W9's pay link (FO-7c, FO-7s2), which is out of scope. My run overwrote the two committed W9 screenshots, and I restored them to `ac93518c4`.
* Demo copy: I cloned `xr_studio_demo` as a template, then applied `migration.sql`, then `rollback.sql`, then `migration.sql` again. All three were clean, with 0 lines and 0 invoices changed. The demo has no retainers or invoices, so this proves only that the migration applies.
* `graph.mjs --check`: exit 0 (G1 0, G2 0).
* **Mutations** (scratch copy, one at a time): I removed the advisory lock, hard-coded the rate to 130000, and removed the MINOR_MAX check. **The check stayed at 25/25 for all three.** This is m1–m3 below.
* **Probes** (scratch copy):
  * A company retainer billed to its company gives 201. Billed to its signer as a person it gives 404.
  * In a BC firm, the retainer line and a typed line both come out `50000 ppm, 500` tax.
  * In a firm not registered for tax, the line has rate 0 and tax 0.
  * A fee row of 30,000,000.00 is refused with 422 at `feeRowIds`.
  * Deposit row plus fee row named, with the deposit id also sent in upper case: one line each, `deposit: true`.
  * Three requests at once on two rows (two without row ids, one naming row 2): the answers are `[201 with 2 lines, 201 with 0 lines, 409 ROW_ON_INVOICE]`.
  * A retainer with only a deposit row and a row with no amount, no ids named: 201 with 0 lines, `deposit: false`.

## The points I was asked to judge
* **Money:**
  * The rate comes from `taxDefault` → `lineRatePpm` → `this.tax` (`drafts.ts:232-239`). The probes show it is the same rate a typed line gets, including in BC and for an unregistered firm.
  * Amounts are integer cents end to end. The port's BigInt goes through `Number()`, which is safe because fo rows are at most 1e10.
  * A row above MINOR_MAX gets a 422 before the lock.
  * **Correct.** The only gap is the test (m1, m3).
* **Billed once:**
  * The lock is a transaction-scoped advisory lock on the retainer id (`:221`), taken before the billed-rows read. The app runs at READ COMMITTED (`core.ts:39`, no isolation option), so the waiter's next statement sees the first draft's committed lines.
  * The unique index `(firm_id, source_fee_row_id)` lets many NULLs through, which keeps typed lines free. If two inserts still collide, the P2002 becomes a 409 (`:243`).
  * **Correct.** The second of two at once gets 409 when it names the row, and an empty draft when it names no row, as the row says.
* **Deposit:**
  * An `ON_SIGNING` row is copied only when named (`:216`), and `deposit` is true exactly when an ON_SIGNING row was copied.
  * The column goes beyond the row's text, but the PR raises it openly as question 1. It fails safe: the trigger fixes it at creation, and only create sets it. If FO-7b later removes the deposit line, the invoice stays `deposit` and still gets no pay link.
  * Pay links do not exist on main yet (`reads/actions.ts:4`), so storing the flag is the whole of this row's share.
* **Scoping and status codes:**
  * C5 runs first, through the existing `partyInScope` (`drafts.ts:75`).
  * The port is firm-scoped. The party match (`:206`) makes another client's retainer, a consultation and firm B's retainer all 404, with no leak before the signed check.
  * 409 `RETAINER_NOT_SIGNED` and 409 `ROW_ON_INVOICE` are used for state. 422 is used for field problems: currency, no amount, a row not on the retainer, MINOR_MAX.
  * The choices are consistent and match the row.
* **Audit:**
  * There is one `invoice.draft_created` line per draft. Its detail names `retainerId`, `feeRowIds` and `deposit`, plus `*_after` values for line sources, amounts and tax. A refusal writes none (R9).
  * The shape is weaker than `addLine`'s (m4).
* **Trigger:**
  * There is one function on both tables, BEFORE UPDATE FOR EACH ROW, using `IS DISTINCT FROM`, so both null→value and value→null are refused. The nested IF means NEW's other-table field is never evaluated.
  * Other UPDATEs pass: Bill-to, description, issue, and the existing `*_frozen`, `*_pinned` and `*_write` triggers (R10, and j_56 W3 and W7, which retax and issue a retainer line).
  * The SECURITY DEFINER and owner hand-over follow PF-12.
  * **Correct for every UPDATE on both tables.**
* **Tests:** each rule has a pass and a fail, and removing the rule turns its test red for: ON_SIGNING, party, kind, signed state, currency, skip, named 409, deposit flag, unique index and trigger. Three rules have no failing test (m1–m3).

## D1–D20 (API-only row)
* **D1** Requirement fit: 5. Every clause of the row maps to code and a test.
* **D2** Data integrity: 5. Billed once is proven at once and in sequence, and the database refuses a duplicate.
* **D3** Reuse: 5. The tax path and text rule are reused, and fo data is read only through the port.
* **D4** Rule integrity: N/A.
* **D5** Stability: 4. A double click leaves a second, empty draft. That is what the row says, and the create route is not idempotent on main.
* **D6** Governance: 4. One audit line (see m4).
* **D7** AI trust: N/A, no AI.
* **D8–D14:** N/A, no screen.
* **D15** Speed: 4. Two round trips per row while holding the lock (m5).
* **D16** Testability: 3. Three mutations survive.
* **D17** First-use intuitiveness: simulated only.
* **D18** Provenance: 5. `sourceFeeRowId` is on the line and in the view.
* **D19** Capability closure: 4. j_56 is 17/18, and W9 belongs to the next PR.
* **D20** User pain solved: simulated only.

**BIC-01–BIC-20:** N/A, because there is no case-side screen. FO-7s1 and FO-7s2 carry the button.

## Issues (none Blocker or Major)
**Minor (Should):**
* **m1.** `tests/check_fo7w1_retainer_invoice.ts:107`: the claim "taxed at the draft's default" holds only at one point, where the default equals 13 %. With the rate hard-coded to 130000 the check still passes. **Fix:** add one case where the default is not ON 13 %, such as firm B unregistered (expect 0) or a BC firm (expect 50000 ppm), and compare it with a line typed on the same draft.
* **m2.** `tests/check_fo7w1_retainer_invoice.ts:150-151`: the "three at once" step accepts 201 or 409 from every request, so removing the lock at `drafts.ts:221` stays green. Without the lock, the waiter gets 409 where the row says it is skipped. **Fix:** assert one draft with the line, exactly one empty draft for the request without row ids, and 409 for the request that names the row. That is what I observed with the lock in place.
* **m3.** `drafts.ts:219-220` (MINOR_MAX) has no test. Fee rows reach 1e10 (`fo_retainer_fee_row_amount_check`), so this case is reachable. **Fix:** add one row above 2,147,483,647 → 422 at `feeRowIds`, with nothing written.
* **m4.** `drafts.ts:89`: the audit `after` holds parallel arrays of source, amount and tax, but not each line's description, kind, quantity or rate. `addLine`'s audit records the whole line, while here the lines come with no `invoice.line_added` of their own. **Fix:** put the lines in `after` as they were written (`copyRows` already returns `taxRatePpm` and has the description), for example one `lines` list of objects.
* **m5.** `drafts.ts:237,241`: one `money_text_ok` query and one insert per row (up to 50 rows, so up to 100 round trips) while holding the retainer lock. **Fix:** check every label in one query and write the lines with one `createMany`, keeping the P2002 mapping.
* **m6.** `ports/retainer-fees.ts:9`: `RETAINER_FEES_PORT` is never used. The factory passes the adapter directly (`features/client-money-invoices.ts:20`). **Fix:** remove the token and its comment, or bind through it.
* **m7.** Test gap: company retainers are not tested. Probing shows the right behaviour (company 201, signer as a person 404). **Fix:** add the pair to R5.
* **m8.** `drafts.ts:243`: the 409 from a unique-index collision has no `feeRowIds`, but the pre-check's 409 at `:224` has it. **Fix:** add the row id, so both shapes are the same.

## Could not check, and notes
* There is no screen, so I did no browser walk, screen reader check or BIC scorecard. D17 and D20 stay with the founder.
* The migration was never run on a demo copy that holds retainers or invoices, because the demo has none. The change only adds columns, so it is data-safe by construction.
* Note for the tech lead (not a finding, Unconfirmed: no counsel or accountant): a named ON_SIGNING row is taxed like any FEE line, which is what the row says. Whether a trust deposit is taxed before it is applied is a tax question for AG-6-61 and FO-7c.

Verdict: Approve

Reviewer: Approve ac93518c49fa49e5e622b61e04f6c81a21d75a3c

## Re-review c5e9aede5 (diff only)
**Scope:** `git diff ac93518c4 c5e9aede5` only: `drafts.ts` (+25/-10), the check (+47/-5) and the two reports. Same reviewer role; I did not build it. **Verdict: Approve** (no Blocker or Major; 5 Minors below, r1 and r2 best fixed in this PR, one regex each). **Journey 8/10, pass** (appended to `journey-test-reviewer-2026-11-25.md`).

**What I ran:**
* The check in the checkout: **31/31**. In a scratch copy: 31/31 four more times (no flake in the 5-round race).
* `typecheck.mjs` at 12 GB: api 15 known errors, 0 new, 0 fixed; web 0. `graph.mjs --check`: exit 0.
* j_56 on an isolated scratch copy at **:4436** (never :4400): 17/18. W1 passes; W9's pay link is FO-7c/FO-7s2, as before. Copy stopped, database dropped, repo tree clean.
* 9 mutants of `drafts.ts` (scratch) and 14 probes added to a scratch copy of the check.

**Each fix:**
* **Break m1 (409 NOTHING_TO_BILL), correct.** It runs after the lock and before the create, so the rollback leaves no draft and no audit line (probe). It reuses the issue route's code and shape (`money.ts:33,62`: 409 "Not possible now"). It fits the row's "skipped" rule: a part-billed retainer still skips. Probe: row 1 named → 201; unnamed → 201 with row 2 only; again → 409. Naming still wins (ROW_ON_INVOICE first). The race case now allows only "201 with the line" or "409 NOTHING_TO_BILL" from an unnamed start, which is right under the lock. The PR body names the change openly.
* **Break m3 (total), correct; same tax as stored.** `planned` computes `taxMinor` once with `this.tax(amount, ratePpm)`, and that same value is written. Issue checks the stored lines' total against MINOR_MAX (`money.ts:63`). Boundary at ON 13 %: one row of 1,900,428,006 totals exactly 2,147,483,647 → 201, and it issues (200). 1,900,428,007 → 422 at `feeRowIds`, nothing written. With the tax left out of the sum, the mutant is caught.
* **Break m4 (CAD), correct.** An explicit USD on a retainer is still 422 at `currency`, and a plain draft keeps the firm's USD default. The hard-coded "CAD" mirrors `fo_retainer_fee_row_currency_check`, so it must change if that check ever widens (noted only).
* **Break m2 (labels), safe but too wide:** r1, r2.
* **Review m1 (rate), m2 (lock), m8 (row id), and the types:** correct. The m1 and m2 cases catch their mutants (the lock 4 of 4 runs).
* **Review m3 (per-row limit):** the case passes, but see r3(c).

**Mutants** (red = the check catches it):

| Mutant | Result |
|---|---|
| No NOTHING_TO_BILL | 3 red |
| No mark strip | 1 red |
| No total check | 1 red |
| Total without tax | 1 red |
| Firm-default currency | 1 red |
| No advisory lock | 1 red, 4/4 runs |
| Rate fixed at 130000 | 1 red |
| No per-row MINOR_MAX | **31/31**, survives |
| P2002 409 without `feeRowIds` | **31/31**, survives |

**Minor (Should):**
* **r1. The stripped set is wider than what `money_text_ok` refuses** (`drafts.ts:240`).
  * `money_text_ok` refuses only `[[:cntrl:]\u0085  ‪-‮⁦-⁩]` (migration `20261115042334_fo7a_client_money_tables`, line 527). The new class also strips characters it accepts: U+00AD, U+061C, U+180E, U+200B–U+200F, U+2060–U+2065 and U+FEFF.
  * Probes, each `money_text_ok = t` and each copied exactly at ac93518c4 (break report, "Text"):
    * Persian "حق‌الزحمه (Sample)" becomes "حقالزحمه (Sample)": the ZWNJ is lost and the letters now join.
    * "Family 👨‍👩‍👧 fee" becomes three separate emoji.
    * The LRM, soft hyphen and ZWSP are dropped.
  * It is safe: only invisible format characters go, it never adds a refused one, and amounts are untouched. But the signed label is no longer copied as written, and the comment "(which money_text_ok refuses)" is not accurate.
  * **Fix:** strip only `[‪-‮⁦-⁩]`.
* **r2. C1 controls still block the whole unnamed bill** (`drafts.ts:240`).
  * U+0080–U+009F (for example NEL U+0085, CSI U+009B) pass `fo_retainer_text_ok`, which refuses only C0, DEL and U+2028/9. `money_text_ok` refuses them as `[[:cntrl:]]`.
  * Probe: 422, "Fee row 2 ("FeeSample") …". The refusal now names the row, but the raw control character is quoted inside the detail.
  * **Fix:** add `\u0080-\u009f` to the first, to-space class.
* **r3. Test gaps.** The PR says every fix has a failing case; three don't:
  * (a) The "names its row" refusal has no case. A label of only "‮" or one C1 label reaches it.
  * (b) m8 has no case (its mutant survives).
  * (c) Review m3's case no longer proves the per-row check. Any row above MINOR_MAX also fails the new total check, with the same 422 at `feeRowIds`. Behaviour stays safe. **Fix:** assert the per-row words, or drop the check as redundant.
* **r4. The NOTHING_TO_BILL words** (`drafts.ts:86`).
  * "every fee with an amount is already on an invoice" is said even when nothing was ever billed: only open-amount rows, no rows, or only a deposit (probes).
  * **Fix:** for example, "Nothing left to bill from this retainer without naming rows: its fees with an amount are already on an invoice, or it has none. A deposit ("On signing") is billed only when named. Nothing was saved."
* **r5. The module row and the doc comment are stale.** `MODULE.rows/FO-7w1.md` and the `retainerRows` comment list the codes without 409 `NOTHING_TO_BILL` and without the total's 422. **Fix:** add both.

**Nits:**
* Check line 121: "so no draft can never be issued".
* The review-m1 case leaves firm B's address in BC. Later firm-B cases check status only.

**Dimension changes:**
* D5 Stability: 4 → 5 (no empty drafts).
* D16 Testability: 3 → 4 (7 of 9 mutants are caught; r3 covers the rest).
* All other dimensions are as before.

**Could not check:** a screen (there is none). The breaker's m5 is left to the tech lead, as stated.

Verdict: Approve

Reviewer: Approve c5e9aede52d6648a2b116f89e584575f576cb501
