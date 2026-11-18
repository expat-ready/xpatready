# Brief: FO-7b, invoices, receipts, offline payments, credit notes and refunds, with tax rounded per line by one rule (QA-482) (cloud builder lane; row owner Build Lead C)

Written 18 Nov by Build Lead C. **Approved for building.** **The specification is Lead B's brief:** `product/design/lead-b-briefs/FO-7b.md` on branch `lead-b-front-office` (rev 16.95, commit ddf0317b8, 17 Nov 07:36 IST), with its amendments 1-10 and its split into part 1 and part 2 (amendment 10). Read it with `git show origin/lead-b-front-office:ai-workers/problem-1-pathway-setup-and-form-filling/product/design/lead-b-briefs/FO-7b.md`. This page does not rewrite it. It adds one rule, **QA-482: tax rounded per line by one stated rule**, and states where this page wins. Release 1 rows **R1.56, R1.59, R1.60** (map 56, 59, 60).
**PR titles:** `runtime: FO-7b part 1 — …` and `runtime: FO-7b part 2 — …` (amendment 10).
**Model:** Opus 5.5, effort high (money).

**Ready when:**
* **Part 1:** **FO-7ts part 2 is merged** (amendment 7: it needs the trust answer, the credit ledger and the two methods), and the rows in Lead B's first line are on `main`. Checked on `main` 18 Nov: FO-7a, PF-12 (`20261116013000_pf12_firm_walls`), FO-5 (`api/src/front-office/retainers/`), `ports/mail.ts`, `ports/render.ts`, `ports/files.ts`, `ports/jobs.ts` and `ports/clock.ts` are there. FO-7b writes no schema, so it does not wait for FO-7ts part 3; it may run while part 3 is open.
* **Part 2:** part 1 merged (amendment 10).

**What this page adds: QA-482, tax rounded per line (part 1)**
* **The rule (from the requirements; not a Sample):** "Tax SHALL be computed **per line, rounded to the currency minor unit by round-half-to-even, then summed**; … the rounding rule SHALL be identical across compute, display, receipt, and export" (**AG-6-4a**; and **BR-4**: "rounding is per-line round-half-to-even then summed"; `domain/requirements-2026-11-02/01-techno-functional/05-Doc-3-Agent-Console.md` lines 2750 and 2811). The functional card agrees: "Tax is rounded per line, then summed. *Example:* 850 taxable at 13% → 110.50; total 960.50" (AG-06 v2.1 §Totals, `…/02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md` line 334). Round half to even is also called banker's rounding. It is **not** round half up.
* **How:** one pure function, `taxForLine(amountMinor, ratePpm)`, in `api/src/client-money/invoices/tax-round.ts`. It works in **integers only** (`BigInt`, or exact integer division): exact = `amountMinor × ratePpm`; q = exact ÷ 1,000,000 rounded down, r = the remainder. If r > 500,000 → q + 1; r = 500,000 → q if q is even, else q + 1; r < 500,000 → q. Never a float, never `Math.round` or `toFixed`: in JavaScript `Math.round(50 * 0.13)` is 7, which is round half up.
* **One path:** every line write (draft from fee rows, by hand, edit) stores `tax_minor = taxForLine(amount_minor, tax_rate_ppm)`. The invoice total is the sum of the stored lines (`amount_minor + tax_minor`), as FO-7a's `money_invoice_total` already sums. The PDF, the receipt and the email print the stored `tax_minor`; they never recompute it (AG-6-4a "identical across compute, display, receipt, and export"; CP-5 BR-11 "the portal never re-rounds or re-sums").
* **A government-fee line** is always 0 (FO-7a's `money_invoice_line_government_fee_untaxed`).
* **The database:** FO-7a's `money_invoice_line_tax_check` (`20261115042334_fo7a_client_money_tables/migration.sql` lines 583-584) accepts any tax within one cent of amount × rate. That stays as it is in this row (FO-7b writes no schema). The test below is the guard. Making the check exact is Question 2.

**Done when (P-606):** Lead B's Done when, in `tests/check_fo7b_invoices.ts`, for the part being built, **and** for part 1 these named cases, each through the route (`POST` a draft line), then read back from `money_invoice_line`:
* **FO-7b R1 (AG-06's example):** a CAD 850.00 `FEE` line at 13 % (`ratePpm` 130000) → tax 110.50, total 960.50.
* **FO-7b R2 (a half cent goes to even, down):** 0.50 at 13 % (exact 6.5 cents) → **0.06**. **Fail:** a half-up implementation (planted as `Math.round`) gives 0.07, and the case catches it.
* **FO-7b R3 (a half cent goes to even, up):** 1.50 at 13 % (exact 19.5 cents) → **0.20**.
* **FO-7b R4 (HST 15 %):** 0.30 at 15 % (exact 4.5 cents) → **0.04**; 0.10 at 15 % (exact 1.5 cents) → **0.02**.
* **FO-7b R5 (GST 5 %):** 0.10 at 5 % (exact 0.5 cents) → **0.00**; 0.30 at 5 % (exact 1.5 cents) → **0.02**.
* **FO-7b R6 (not a half):** 0.51 at 13 % (6.63) → 0.07; 0.49 at 13 % (6.37) → 0.06.
* **FO-7b R7 (per line, then summed):** two lines of 0.50 at 13 % → tax 0.06 + 0.06 = **0.12**. **Fail:** tax on the subtotal (1.00 × 13 % = 0.13) is caught.
* **FO-7b R8 (large and exact):** quantity 1, unit 21,474,836.47 at 15 % → 3,221,225.47 (exact 322,122,547.05 cents, not a half, down). The test asserts the exact integer, so any float drift fails.
* **FO-7b R9 (one rule everywhere):** for R2's line, the invoice PDF text, the receipt text and the `invoice.issued` payload show the same 0.06 and total as the stored row.
* **FO-7b R10 (government fee):** a 255.00 `GOVERNMENT_FEE` line beside a 1,000.00 `FEE` line at 13 % → tax only on the fee line (130.00) (AG-6-4 §11's example).
* Pass unchanged: `check_fo7a_money_schema.ts`, `check_fo7a2_ledger_rules.ts`, `check_fo7mv_move_list.ts`, `check_fo7ts_money_settings.ts`, `check_fo5_retainers.ts`, `check_pf12_walls.ts`; demo reset and checkpoint load; full `ci` green.

**Duplicate check:** `git grep -n -i "invoice\|receipt\|credit.note\|half.even\|ratePpm" origin/main -- prototype/studio/api/src` (18 Nov): no client-money code (`api/src/client-money/` holds only `MODULE.md`); the matches are the case side's fee-table words and unrelated names. QA-482 is open in `product/qa/BUGS.md`; this row closes it.

**Touch list:** Lead B's list as amended (amendments 5 and 9: new `api/src/client-money/invoices/*.ts`, the adapter `api/src/client-money/port.ts`, new `ports/client-money.ts`, `api/src/features/client-money-invoices.ts`, `tests/check_fo7b_invoices.ts`, the wording under `samples/`, the operating-details route). The rounding function is one of the `invoices/*.ts` files. No schema, no migration.

**Review:** an Opus reviewer **and the breaker** (money, P-278). The breaker adds to Lead B's list:
* a half-cent line at each of 5 %, 13 %, 14 % and 15 %;
* a rate typed in basis points (1300 for 13 %);
* a line whose tax is sent by the client (it must be ignored and recomputed);
* the PDF or receipt total recomputed from a float.

The Lead reads `ports/client-money.ts` (a shared contract, amendment 5; P-423).

**Holds:** `api/src/client-money/invoices/` for the life of the PR. After it, the order on that folder is FO-7g part 1 → FO-7t part 2 → FO-7r part 1 (FO-7g's parallel-safety line).

**Where this page wins over Lead B's text:**
* Lead B's line "Rates are the firm's own settings; our defaults are Sample until cited" is out of date: FO-7ts part 1 drops the firm's `tax_rates` list (AG-6-4 §3, §13). Until FO-7g part 1 lands, a line's `ratePpm` is what the draft request sends (0 when absent). FO-7g then fills the default from its cited table.
* Lead B's "within one cent" sentence describes what the database accepts. What FO-7b **writes** is exactly `taxForLine`.

**Questions for the tech lead:**
1. **"Prices include tax"** (`prices_include_tax`, added by #2106) is FO-7g part 2's rule. Until then, should FO-7b refuse a draft when the firm has it on? Recommended: yes, in plain words ("Prices that include tax come later"), never a silent tax on top.
2. **An exact database check** (round half to even, in SQL) would make QA-482 hold even for a writer that skips `taxForLine`. Recommended: add it in the next `client-money.prisma` migration after FO-7b part 1. R1 has one tax per line (Quebec is out, P-568 (1); see `FO-7g.md` on PST), so "two taxes rounded apart" no longer needs the one-cent slack.
3. **A part credit note's tax share** (AG-6-48) is not stated in the sources read for this page. Recommended: credit notes carry the gross amount, as FO-7a's table does; any tax split is Sample until a source says otherwise. Unconfirmed: no accountant.

**Standard rules:** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Build Lead C answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`.

**Audit actors (Lead 80, 18 Nov, after #2003 AUD-1a):** the audit trail refuses an actor word with no type. A test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people (`user-A/B/C/O/R/T/S` staff, `user-P/Q` clients), never a bare word like `test`. Once #2003 is on `main`, merge `main` before the first push.

**Build Lead C rulings (18 Nov):**
* Confirmed: FO-7b starts when FO-7ts parts 1-2 are on `main`, as Lead B's amendment 7 says. It does not wait for part 3.
* Rounding: per line, round half to even, then sum. The source is Doc 3 Agent Console line 2648 ("Tax rounding rule (gap-closed)").
* The database check on line tax becomes exact in a follow-up after FO-7b part 1, not in this PR.
* While "Prices include tax" is on, FO-7b refuses to save a draft, in words, until FO-7g part 2.
* A part credit note mirrors the lines it credits. Tax is recomputed on each credited line with the same rule, and the credit note is never more than what the line charged. Each of these gets a test case.
