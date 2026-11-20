# Brief: FO-7b part 1a, draft invoice lines with tax rounded per line, mixed currencies refused, and J-59 (R1.59's missing part; cloud builder lane; row owner Build Lead C)

Written by Build Lead C (4) at 15:0x IST on 20 Nov, at Lead 2 (series 3)'s ask (P-745, Wave 2). **Item:** Release 1 row **R1.59** ("Money arithmetic: integer cents with currency, per-line tax rounding by one stated rule, mixed currencies refused, a pass and a fail test per rule"). qa has it at Partial on 18 Nov (main 15c75cd52), with this reason: "FO-7b (tax rounded per line, QA-482) missing". This row closes **QA-482** and gives R1.59 its journey, **J-59**.

**Why a part 1a:** `FO-7b.md` part 1 (invoices and the payment route, Lead B amendments 1, 3, 6, 8) is larger than R1.59 needs and would likely pass 800 lines. This row takes **only the arithmetic**: draft invoice lines through the route, with their tax and totals. Issuing, the PDF, receipts, email, payments and credit notes stay in **FO-7b part 1b**, which is `FO-7b.md` part 1 minus what this row builds; it owns R1.56 and R1.60. **The rules in `FO-7b.md` ("What this page adds: QA-482" and the rulings of 18 Nov) apply here word for word.** Where this page differs, this page wins.

**PR title:** `runtime: FO-7b part 1a — draft invoice lines with tax rounded per line (QA-482); J-59 joined and walked`
**Model:** Opus 5.5, effort high (money). **Reviewer:** a fresh Opus at high effort. **Breaker:** yes, at high effort (money, P-278). The Lead reads `ports/client-money.ts` before the label (shared contract, P-423).

**Ready when:** FO-7ts parts 1 and 2 are on `main` (#2106 and #2204 merged; checked 20 Nov). FO-7a's tables are on `main` (`20261115042334_fo7a_client_money_tables`). This row writes **no schema**, so it does not wait for FO-7ts part 3 (#2368, open), and it runs beside it. It must not touch the files #2368 touches.

**Build:**
1. **`api/src/client-money/invoices/tax-round.ts` `taxForLine(amountMinor, ratePpm)`** exactly as `FO-7b.md` states:
   * integers only (`BigInt`);
   * per line, round half to even to the minor unit (AG-6-4a, BR-4, AG-06 v2.1 §Totals);
   * never a float, never `Math.round` or `toFixed`.
   * `ratePpm` is an integer from 0 to 1,000,000; anything else is refused with 400 at the field.
2. **Draft routes** under the money key, firm-scoped (PF-12), each through a zod parse:
   * `POST /api/client-money/invoices` makes a draft for a client in one currency, ISO 4217 as FO-7a stores it.
   * `POST /api/client-money/invoices/:id/lines` adds a line `{ kind: FEE | GOVERNMENT_FEE | DISBURSEMENT, description, quantity, unitMinor, ratePpm? }`.
   * `GET /api/client-money/invoices/:id` reads the draft back with its lines and totals.
   * The route computes `amount_minor` and `tax_minor = taxForLine(...)`. **A tax sent by the client is ignored.**
   * A `GOVERNMENT_FEE` line's tax is always 0.
   * The total is the sum of the stored lines (FO-7a's `money_invoice_total`).
   * **A line in another currency** is refused with 400 in plain words ("This invoice is in CAD; a line in USD can't be added. Nothing was saved."), checked before the database's own check (migration line 870). A 500 is a fail.
   * **While "Prices include tax" is on,** a draft is refused in words until FO-7g part 2 (ruling of 18 Nov).
   * Each write gets one audit line through AuditPort with a typed actor.
3. **`ports/client-money.ts`:** only what these routes need. The rest of the port arrives with part 1b (FO-7b amendment 5).
4. **J-59:** `tests/journeys/j_59.ts` in the `j_72.ts` pattern, API steps labelled "API step: the invoice has no screen yet".
   * **W1:** a draft in CAD.
   * **W2:** AG-06's example, 850.00 FEE at 13 % → tax 110.50, total 960.50.
   * **W3:** two 0.50 lines at 13 % → 0.06 + 0.06 = 0.12.
   * **W4:** a 255.00 GOVERNMENT_FEE line beside 1,000.00 FEE at 13 % → 130.00 tax.
   * **W5:** a USD line on the CAD draft → 400, and nothing saved.
   * **DW:** firm B gets 404 on firm A's draft; a client-sent `taxMinor` is ignored.
   * Each with its stand-in (pass and fail).
   * PR body: `Completes: R1.59` only if qa's other R1.59 rules (integer cents with currency) already pass on `main`. Otherwise `Item: R1.59`, and qa decides.

**Done when (P-606):**
* `tsx studio/tests/check_fo7b_invoices.ts` exits 0 with `FO-7b.md`'s **R1–R8 and R10**, each through the route and read back from `money_invoice_line`, including R2's and R7's planted fails (half-up `Math.round`, tax on the subtotal). Also:
  * **R11:** USD on CAD → 400, not 500, and no row written.
  * **R12:** `ratePpm` 1300 sent where 130000 was meant is stored as 1300 ppm, not "corrected". `ratePpm` −1 and 1,000,001 → 400.
  * **R13:** a client-sent `taxMinor` is ignored.
  * **R14:** "Prices include tax" on → refused in words.
* R9 (PDF, receipt and payload show the same figure) moves to part 1b.
* `tests/journeys/j_59.ts` exits 0 twice on fresh isolated copies.
* These pass unchanged: `check_fo7a_money_schema.ts`, `check_fo7a2_ledger_rules.ts`, `check_fo7ts_money_settings.ts`, `check_pf12_walls.ts`, `check_csv1_inputs.ts` (zod on every body), `check_case_feed.ts`.
* Demo reset and checkpoint load are unchanged. Full `ci` green.
* QA-482 is marked fixed in the PR body as "Fixes: QA-482".

**Touch list:**
* new `api/src/client-money/invoices/tax-round.ts`, `invoices/drafts.ts` and `invoices/routes.ts`
* new `api/src/features/client-money-invoices.ts`
* new `ports/client-money.ts`
* new `tests/check_fo7b_invoices.ts` and `tests/journeys/j_59.ts`
* `api/src/client-money/MODULE.rows/FO-7b-1a.md` through the card tool
* the `.mergify.yml` scope only if the module-card or mergify-scope check asks for it (name it in the PR)

No schema, no migration, no screen.

**Size:** about 500–700 lines with tests. Over 800 → stop and ask first in a PR comment (P-610).

**Breaker tries:**
* a half-cent line at each of 5 %, 13 %, 14 % and 15 %;
* a rate in basis points;
* a client-sent tax;
* a float total;
* two lines added at once to one draft (the total stays the sum);
* a line in another currency;
* a firm id from the request;
* a draft of another firm's client.

**Duplicate check:** at 15:0x IST on 20 Nov, `git grep -n -i "taxForLine\|half.even\|ratePpm" origin/main -- prototype/studio/api/src` returned 0 lines. `api/src/client-money/` holds only `MODULE.md` and `MODULE.rows/FO-7ts-2.md`, and `ports/client-money.ts` does not exist. No open PR has "invoice" in its title. #2368 (FO-7ts part 3) builds no invoice code. QA-482 is open.

**Holds:** `api/src/client-money/invoices/` for the life of the PR. Then the order is FO-7b part 1b → FO-7g part 1 → FO-7t part 2 → FO-7r part 1.

**Standard rules (P-644):**
* Branch from `origin/main`. One part, one session, one PR.
* P-683: get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. The Lead applies the label after the P-423 read.
* Merge `main` only on a conflict (P-270).
* Run suites only on an isolated copy (`tools/isolated.sh`). Push after every step (P-557).
* Live AI off, US$0, never a priced button, no real keys (P-175). Times only from the clock port (P-607).
* Audit actors are typed words only.
* GST/HST only, at CRA rates (P-701). A rate used in a test is labelled Sample unless it is cited.
* Questions go on the PR as "Question for the tech lead: …"; Build Lead C answers within 30 minutes.
* Report to the current Lead (`tools/current-lead.sh`) and to Build Lead C (`claude/build-lead-c-647b40`).
