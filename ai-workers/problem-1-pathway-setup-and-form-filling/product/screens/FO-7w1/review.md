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
