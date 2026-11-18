# Brief: FO-7g part 1, tax by province on invoice lines, from a cited table (cloud builder lane; row owner Build Lead C)

Written 18 Nov by Build Lead C. **Approved for building (part 1).** The specification is the draft `product/design/briefs/FO-7g.md` on `main` (part 1's What to build, DW1-DW7, touch list); where this page differs, this page wins. Release 1 row **R1.56** (map 56; the end-to-end review of 18 Nov names it "needs a cited tax table (official source)"). Tax readings are **Unconfirmed: no accountant**; legal readings are **Unconfirmed: no counsel**.
**PR title:** `runtime: FO-7g part 1 — tax default by province from a cited table`
**Model:** Opus 5.5, effort high (money).

**Ready when:** **FO-7b part 1 is merged** (it creates `api/src/client-money/invoices/` and the invoice-line writes this part feeds), and **#2106 (FO-7ts part 1) is merged** (`tax_registered`). PF-12 is on `main` (`20261116013000_pf12_firm_walls`). No schema, so no `client-money.prisma` baton.
* Later parts, not in this PR: **part 2** (treatment and "Prices include tax") after part 1, FO-7ts part 3 (treatment columns) and FO-7b part 2. **Part 3** (the Bill-to's province) waits on a row that gives a person and a company an address; none exists.

**The cited table (read 18 Nov 2026; the builder re-reads each page and records any change in the PR):**

Source A, the Canada Revenue Agency, "GST/HST calculator (and rates)", https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/calculator.html (the page says "Date modified: 2025-04-01"). The quotes are rows of its table "Province | GST and HST | PST".

| Code | Province or territory | Tax | `ratePpm` | Quote (Source A) | Status |
|---|---|---|---|---|---|
| AB | Alberta | GST | 50000 | "Alberta \| 5% \| 0%" | Cited |
| BC | British Columbia | GST | 50000 | "British Columbia \| 5% \| 7%" | Cited (GST only; PST below) |
| MB | Manitoba | GST | 50000 | "Manitoba \| 5% \| 7%" | Cited (GST only; RST below) |
| NB | New Brunswick | HST | 150000 | "New Brunswick \| 15% \| N/A" | Cited |
| NL | Newfoundland and Labrador | HST | 150000 | "Newfoundland and Labrador \| 15% \| N/A" | Cited |
| NT | Northwest Territories | GST | 50000 | "Northwest Territories \| 5% \| 0%" | Cited |
| NS | Nova Scotia | HST | 140000, `effectiveFrom` 2025-04-01 | "Nova Scotia \| 14% \| N/A"; "As of April 1, 2025, the HST rate has decreased to 14% in Nova Scotia." | Cited |
| NU | Nunavut | GST | 50000 | "Nunavut \| 5% \| 0%" | Cited |
| ON | Ontario | HST | 130000 | "Ontario \| 13% \| N/A" | Cited |
| PE | Prince Edward Island | HST | 150000 | "Prince Edward Island \| 15% \| N/A" | Cited |
| QC | Quebec | GST | 50000 | "Quebec \| 5% \| 9.975%" | Cited (GST only; QST not computed, P-568 (1)) |
| SK | Saskatchewan | GST | 50000 | "Saskatchewan \| 5% \| 6%" | Cited (GST only; PST below) |
| YT | Yukon | GST | 50000 | "Yukon \| 5% \| 0%" | Cited |

The page does not name GST or HST per row. "HST" for the five rows whose PST column reads "N/A" is our reading of the page.

**Provincial taxes: read, and not computed in Release 1.**

| Province | Rate (official page) | Does it apply to immigration services? (official page) | In the table |
|---|---|---|---|
| BC | PST 7 %: "Generally, the rate of PST is 7% on the purchase or lease price of goods and services, with some exceptions." (https://www2.gov.bc.ca/gov/content/taxes/sales-taxes/pst, "Last updated on September 21, 2026") | Bulletin PST 106, Legal Services (Issued March 2013, Revised October 2026; https://www2.gov.bc.ca/assets/gov/taxes/sales-taxes/publications/pst-106-legal-services.pdf), under "Services That Are Not Legal Services": "Providing immigration or emigration services". | No |
| MB | RST 7 %: "The general sales tax rate is 7%." (https://www.gov.mb.ca/finance/taxation/taxes/retail.html, no date shown) | Bulletin No. 056, Legal Services (Issued April 2004, Revised January 2020; https://www.gov.mb.ca/finance/taxation/pubs/bulletins/056.pdf): "All services related to immigration and emigration are considered outside the practice of law and are not taxable." | No |
| SK | PST 6 %: "Provincial Sales Tax (PST) is a six per cent sales tax that applies to taxable goods and services consumed or used in Saskatchewan." (https://www.saskatchewan.ca/business/taxes-licensing-and-reporting/provincial-taxes-policies-and-bulletins/provincial-sales-tax, no date shown) | Bulletin PST-64, Lawyers (Issued June 2000, Revised May 2024; https://sets.saskatchewan.ca/rptp/wcm/connect/bfedca88-6aa7-4507-9cb1-b1eebf4b8d35/PST.064+Lawyers.pdf), section "E. Exempt Services": "Providing immigration or emigration services;". | No |
| QC | QST 9.975 %, read only on Source A ("Quebec \| 5% \| 9.975%"). Revenu Québec's page refused the automated read (403), so it is **not verified at Revenu Québec**. | Not read. Quebec is out of Release 1 (P-568 (1)). | No |

* The three bulletins are written for lawyers' legal services. Reading them as "an immigration firm charges no PST or RST on immigration services" is **Unconfirmed: no accountant; Unconfirmed: no counsel**. It is the reason part 1 computes GST/HST only.
* **No PST, RST or QST line is computed anywhere in Release 1.** `canada-gst-hst.ts` keeps one comment per BC, MB and SK entry naming its provincial page and the bulletin above, so the choice can be found later.
* Any value not in the first table is **Sample** and is not shipped as a default (AGENTS rule 4). No such value is needed for part 1.

**What to build:** the draft's Part 1, exactly, with the table above. Named here so nothing is missed:
* `api/src/client-money/tax/canada-gst-hst.ts`: `ProvinceTaxRate`, 13 entries keyed by two-letter code, each `{ taxName: "GST" | "HST", ratePpm, effectiveFrom?, source: { url, quote, readOn: "2026-11-18" } }`. Never basis points.
* `api/src/client-money/tax/defaults.ts`: `taxDefault({ firmProvince, partyProvince?, partyCountry?, registered })`, as the draft says. In part 1 `partyProvince` is never set, so the answer is `FIRM_PROVINCE` or `NONE`. Not registered → `ratePpm` 0.
* `GET /api/front-office/money/tax-default?partyKind=PERSON|COMPANY&partyId=`; key `agent/invoice:create`, the same as FO-7b's draft route. Another firm's party → 404.
* In FO-7b's draft step (the calls only): a new `FEE` or `DISBURSEMENT` line takes the default `ratePpm`; a `GOVERNMENT_FEE` line is 0, and any other rate is refused. On a draft a line may be set taxable or not taxable (`agent/invoice:edit`), which gives the default or 0, never another number. **The tax amount is FO-7b's `taxForLine`, round half to even per line (QA-482)**, never a second rounding.
* The firm's province comes from `platform_firm.business_address.province_state` (`prisma/schema/platform.prisma` line 67-69 on `main`; `samples/firms.json` uses `"province_state": "ON"`).

**Done when (P-606):**
* `tsx studio/tests/check_fo7g_tax_defaults.ts` exits 0 with the draft's **DW1-DW7** each passing and failing as named, and these three more:
  * **DW10 (the table matches this page):** each of the 13 `ratePpm` values equals the first table above; the five HST codes are exactly NB, NL, NS, ON, PE. Fail: a planted NS entry at 150000 (the rate before 1 April 2025) is caught.
  * **DW11 (no provincial tax):** a firm in BC, MB or SK gets the 5 % GST entry only (50000), and no entry or answer carries a PST, RST or QST rate. Fail: a planted BC entry at 120000 (GST + PST) is caught.
  * **DW12 (the default goes through QA-482's rounding):** a firm in Ontario, a 0.50 `FEE` line with the default → `tax_rate_ppm` 130000 and tax 0.06 (not 0.07).
* The PR body holds the table of each value with its URL, quote and read date (the builder's own read).
* Pass unchanged: `check_fo7b_invoices.ts`, `check_fo7a_money_schema.ts`, `check_fo7ts_money_settings.ts`, `check_pf12_walls.ts`; demo reset and checkpoint load; full `ci` green.

**Duplicate check:** `git grep -n -i "gst\|hst\|ratePpm\|canada-gst" origin/main -- prototype/studio/api/src prototype/studio/ports` (18 Nov): no tax code (`api/src/client-money/` holds only `MODULE.md`; the only matches are unrelated words containing "hst"). FO-7a's `tax_rate_ppm` column is schema only.

**Touch list:**
* new `api/src/client-money/tax/canada-gst-hst.ts` and `api/src/client-money/tax/defaults.ts`
* new `api/src/features/client-money-tax.ts` (the route)
* the tax calls in FO-7b's draft code in `api/src/client-money/invoices/` (calls only)
* new `tests/check_fo7g_tax_defaults.ts`
* `api/src/client-money/MODULE.md` (this part's line)

No schema, no migration, no screen, no `ports/` change.

**Review:** an Opus reviewer **and the breaker** (money, P-278). The breaker tries:
* a government-fee line taxed through a line edit;
* a rate typed in basis points (1300 for 13 %);
* a firm-set rate slipped in through the old `tax_rates` list or the request body;
* a party of another firm;
* a firm with no business address, or a `province_state` that is not one of the 13 codes;
* a table change after issue (FO-7a's freeze must keep the issued line).

**Holds:** `api/src/client-money/invoices/` (calls only) for the life of the PR. Order on that folder after FO-7b: **this part → FO-7t part 2 → FO-7r part 1**.

**Questions for the tech lead:**
1. **PST, RST and QST stay out of Release 1** on the three bulletins above. Confirm, or name the row that adds a second tax per line. A second tax would also bring back the one-cent slack in the line-tax check (see `FO-7b.md`, Question 2).
2. **An unknown `province_state`** (for example a typo or `QC` spelled out): recommended `source: "NONE"` and 0, with the warning "Your firm's province isn't set — tax is not added", never a guess.

**Standard rules:** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Build Lead C answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`.

**Audit actors (Lead 80, 18 Nov, after #2003 AUD-1a):** the audit trail refuses an actor word with no type. A test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people (`user-A/B/C/O/R/T/S` staff, `user-P/Q` clients), never a bare word like `test`. Once #2003 is on `main`, merge `main` before the first push.

**Build Lead C ruling (18 Nov):** no PST, RST or QST in Release 1. BC, MB and SK bulletins exclude immigration services, and Quebec is out (P-568). This reading is **Unconfirmed: no accountant, no counsel**. It goes to the founder through the current Lead before FO-7g merges.
