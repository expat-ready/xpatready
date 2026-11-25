# Break report: FO-7r part 1 (R1.111): money summary and statement reads (API only)

Adversarial breaker, 25 Nov 2026. **Head `432fba2023523f8952f0aa7c85684ebd5e252426`**, branch `claude/sweet-mccarthy-irx5y6`, PR #3634. The branch moved while I worked (`c1d89d7`, `8af841c`). To test exactly 432fba2 I used `git archive` to unpack it into the scratchpad, linked its node_modules and ran my harness there. That harness is the setup of `tests/check_fo7r_statement.ts` (scratch database, every migration, Nest app with PF-4's guard and the firm walls) plus SQL fixtures written **with triggers on**, so the database's own checks apply. I used an ephemeral port, never :4400, and dropped each scratch database. No product code was edited.

**Verdict: Block**

The suite gives 29/29 on this head. One Blocker (a 500 within the claimed budget's scale) and two Majors.

## Breaks

**Blocker 1. 10,000 invoices plus about 2,000 credit entries anywhere in the firm: the statement takes 9 s, then HTTP 500**
* **Where:** statement.ts:69 and :72, `join inv i on (i.id = e.invoice_id or i.id = p.invoice_id)`. An OR join cannot hash, so Postgres pairs every invoice of the client with every APPLIED entry of the firm. The service's `$transaction` has Prisma's 5 s default (statement.ts:90-93).
* **Steps:**
  1. Firm A, trust YES.
  2. Client BULK: 10,000 issued invoices, each with a payment, a credit note and a trust withdrawal; 1,000 corrections.
  3. Client NOISE: 10,000 invoices, 2,000 of them with APPLIED credit. BULK holds no credit.
  4. Call `GET /api/front-office/money/parties/person/<BULK>/statement`.
* **Observed:**
  * `500 {"statusCode":500,"message":"Internal server error"}` after 8,852 ms. The service throws "Transaction API error: … expired transaction".
  * With 1,000 such entries (own or other clients'): statement 4,581-4,763 ms, summary 2,099-2,229 ms.
  * A one-invoice client in the same firm: 22-37 ms.
* **Expected:** page 1 within 300 ms (the claim, STANDARDS §9), and never a 500.
* **Overlap:** this is the reviewer's Major 1. I rate it Blocker because a valid request gets a 500.
* **On later heads:** c1d89d7 and 8af841c, pushed during my run, replace the OR join. On them the same data gives 366 ms (service) and 460 ms (route), so it is no longer a 500, but Major 2 still applies.

**Major 1. Kept credit is counted twice once it is applied or refunded: the closing balance understates what the client owes**
* **Where:** statement.ts:53-77. There is a PAYMENT line for the whole over-payment and a CREDIT_APPLIED line for the same money, but no line for the KEPT entry that moved the over-payment off the source invoice. summary.ts:53 adds `applied` into `paid` the same way.
* **Why:** facts.ts already nets kept credit out (`extraMinor = paid − open − kept`). The statement does not, so it breaks the shape's own rule "closing = owed − overpaid-and-kept" as soon as the kept credit leaves the credit ledger.
* **Steps (SQL, triggers on, minor units, CAD):**
  1. Issue X for 10000. Pay it 15000 in CASH into OPERATING.
  2. Insert a `money_credit_entry` KEPT 5000 from that payment.
  3. Issue Y for 10000. Insert APPLIED −5000 on Y.
* **Observed (B1b):** INVOICES closing **0** (last line 0; Σ invoiceFacts 0). The summary says owed 5000, list due 5000, credit 0, and **paid 20000**, although the client paid 15000 in money.
* **Expected:** closing 5000. The client paid 150.00 of 200.00 billed and holds no credit, so closing should equal owed − credit held, and paid should be 15000.
* **Refund variant (B1d):** KEPT 5000, then REFUNDED −5000 to the client. Closing is **−5000** (the firm appears to owe the client 50.00), with owed 0 and credit 0. Expected 0.
* **What still holds:** before the credit is used (B1a: closing −5000 = 0 − 5000) and after a reversal (B1c: 5000 = 10000 − 5000), closing = owed − credit.
* **Why it matters:** part 2 emails this closing figure to the client as "Your statement".
* **Status:** the check's KEPT fixture (test:126) is written with triggers off on an invoice that is not paid over, so it cannot show this. Still present on 8af841c.

**Major 2. The 300 ms budget fails on a realistic mix even with no credit entries**
* **Steps:** client BULK with 10,000 issued invoices, each with a payment, a credit note and a trust withdrawal, plus 1,000 corrections. Trust shows. No credit entries.
* **Observed:**
  * Statement page 1: 288-316 ms (service), 374 ms (route).
  * With 100 of the client's own APPLIED entries: 519 ms (service), 628 ms (route).
  * The PR's S8 seeds only invoices and 1,000 payments (166-192 ms here).
* **Expected:** within 300 ms. Each read computes the whole CTE twice (totals, then rows: statement.ts read()).
* **On 8af841c:** 300-402 ms (service) and 379-635 ms (route) for the same data, so it is still over.

**Minor 1. The summary ignores its query string**
* **Steps:** `GET …/summary?foo=1&from=xx` → 200 with figures.
* **Expected:** 422 naming `foo`. PF-28's one rule: an unknown key is refused, as the statement route does (`?foo=1` → 422 `{"foo": …}`).
* **Where:** routes.ts:17 has no `@Query` parse.

**Minor 2. A back-dated payment written between two pages breaks the running balance across pages**
* **Steps:**
  1. Fetch page 1 with `pageSize=3`.
  2. Record a payment with `received_at 2020-01-01` on one of the client's invoices.
  3. Fetch page 2 with `after=<next>`.
* **Observed:** page 2's first line has balance 17500 and amount −1000, after page 1 ended at 19000. The back-dated −500 line is never walked.
* **Expected:** either one snapshot across pages or a stated limit. Keyset over live rows: nothing in the claim covers this.

## What held (evidence from my runs on 432fba2)
* **Trust.** A withdrawal returned in part (CORRECTION); a credit note with OVERPAID_REFUND and one with OVERPAID_TO_TRUST on moved money; a refund choice, then the unmoved part returned, then a new withdrawal. Results: INVOICES closing 35000 = Σ invoiceFacts = owed = list due. TRUST closing 90000 = the trust reads' balance.
* **Edge writes the database refuses.** A correction after a full OVERPAID_REFUND, and a `money_refund` on a trust-received payment ("goes back as a trust entry"), are both refused. So the statement's documented "known limit" (statement.ts:12) cannot be reached.
* **Company client.** With tax, CAD and USD: each closing = Σ facts = owed = list due, with no sum across currencies. The route gives 200. The company id under `person/` gives 404. Firm B's token gives 404.
* **C5.** With a scope of one case, nothing from the other case shows: 0 lines, no case row, and its trust does not count. `caseId` set to an out-of-scope case or another firm's id gives an empty 200. An upper-case `caseId` works. A party reachable only through a case, not in the party half, gives 404.
* **Paging.**
  * 22 lines with equal `now()` timestamps across CAD/USD and INVOICES/TRUST: pages of 1 give the same 22 lines in the same order as one page, all unique, Σ `lines` = 22.
  * Forged, extra-key, out-of-range, float, `__proto__` and 8 KB cursors all give 422 `after`.
* **Periods.** Payments at 23:59:59.999999Z and 00:00:00Z on day edges fall on the right day. In 5 windows, opening + lines = closing, and the first line minus its amount = opening.
* **Bad input.** 45 probes: arrays, repeated keys, `from[]`, null bytes, 10,000-character and Arabic-digit dates, the years 1999 and 3000, an empty or Ω `caseId`, `pageSize` of "", 1e2, −1, 0, 201 or 999999, an empty or garbage `after`. Each gives 422 naming the field, or 404 for kind/id; never a 500. POST, PUT and DELETE give 404.

## Round 2 (3f88a5d304c8172d572a49cc940c60630883526d)

Diff-only re-break of `432fba2..3f88a5d`, unpacked with `git archive` and run with the same harness (triggers on, ephemeral port, databases dropped).

**Verdict: Changes** — round 1's Blocker 1, Major 1 and Minor 1 are fixed. Major 2 holds only for the check's mix.

**R2-Major 1. A 10,000-invoice client is still over 300 ms in a big firm or with dense credit**
* **Cause:** each branch reads the firm's whole table for its kind, so the cost grows with the firm (a one-invoice client in the same firm: 12-37 ms).
* **Steps:** client BULK, 10,000 issued invoices, each with a payment, a credit note and a trust withdrawal, plus 1,000 corrections; trust shows. Route, median of 7:
  * this mix alone: statement 258 ms, within budget;
  * every invoice also has applied credit: 327 ms;
  * plus 50,000 other invoices, 50,000 credit entries and 66,000 trust entries in the firm: 449 ms, summary 318 ms;
  * round 1's B8 mix: 481 ms (service: page 2 491 ms, C5-scoped 516 ms; round 1 took 140 s, then a 500). Expected within 300 ms; no 500 anywhere now.

**R2-Minor 1. Payments dated before the issue lose their order**
* Payments received 31 Mar, 1 Apr 00:00, 1 Apr 23:59 and 2 Apr on an invoice issued today all move to the issue time (as intended), then sort by random id: −8000, −2000, −4000, −1000. Expected: received order. The balances are still right.

**Fixed and checked:**
* **Kept credit.** Closing = owed − waiting in every case:
  * kept then applied: **5000**, with paid 15000; kept then refunded: **0**; kept only: 0, credit 5000;
  * the application reversed: 10000; the keep reversed: −5000 (waiting 5000);
  * 50 kept, 30 applied then reversed, 20 applied, 10 refunded: 12000 = owed, credit 2000;
  * 30 kept and 20 refunded: 0. One more cent of refund is refused. Credit applied to a draft shows from its issue.
* **Budget:** 2,000 credit entries on other clients: route 328 ms (round 1: 9 s and a 500). **Summary query:** `?foo=1` and `?from=` give 422 naming the field.

**Still held:** trust 35000 = owed = list due, and 90000 = the trust reads; company, currencies, walls, C5 and paging; day edges with an invoice issued 1 Mar (7 windows); 45 input probes, never a 500. Round 1's Minor 2 is accepted as a stated limit of keyset paging.

## Round 3 (ea647490a0ff15528fb03bfb1933b50c2850affa)

Diff-only re-break of `3f88a5d..ea64749` (statement.ts, summary.ts, the check), unpacked with `git archive` and run with the same harness. The PR's check passes 41/41 here.

**Verdict: Block** — R2-Major 1 and R2-Minor 1 are fixed, but a new quadratic makes a client with dense credit answer 500.

**R3-Blocker 1. A client whose invoices carry applied credit: time grows with the square of their credit entries; at 10,000 the statement and summary answer 500**
* **Where:** statement.ts:88-89 (CREDIT_APPLIED_REVERSED) and :92-93 (KEPT_AS_CREDIT_REVERSED), `money_credit_entry r join ca e … and r.reverses_entry_id = any((select ca_ids.a from ca_ids)::uuid[])`.
* **Why:** EXPLAIN ANALYZE shows a nested loop over the 10,000 `ca` rows, each running an index scan whose condition is `reverses_entry_id = ANY(<10,000 ids>)`: 2.3 ms × 10,000 = 23 s. This happens with no reversals at all. summary.ts reads the same ledgerCtes, so it fails too.
* **Steps:** client BULK, 10,000 issued invoices, each with a payment, a credit note and a trust withdrawal, plus 1,000 corrections, and APPLIED credit on every Nth invoice. Route, median of 7:

  | Credit entries of the client | Statement | Summary |
  |---|---|---|
  | 1,000 | 397 ms | 382 ms |
  | 3,333 | 2,473 ms | 2,508 ms |
  | 10,000 | 22,786 ms, **500** | 22,696 ms, **500** |

* **Also:** round 1's B8 mix (credit on every invoice) now fails with "expired transaction" after 23 s. In round 2 these were 327 ms and 481 ms.
* **Why the check missed it:** S8 seeds only 100 credit applications on the client.
* **Expected:** within 300 ms; never a 500.

**R3-Minor 1. A payment the database accepts with a date outside 2000-2999 stops paging at it**
* **Steps:** with SQL (triggers on), add payments received 1999-12-31 and 3001-01-01. Walk with `pageSize=1`.
* **Observed:** when such a line ends a page, the `next` cursor the list gave back (its new `r` field) fails `Stamp`, so the next page is 422 "after is not a cursor this list gave."
* **Note:** the payment route refuses dates before 2000 or in the future (invoices/money.ts:91), so only another writer or an import reaches this.

**Fixed and checked:**
* **Firm scale (R2-Major 1).** With little or no credit on the client, route medians:
  * the base mix: statement 186 ms, summary 189 ms;
  * plus 50,000 other invoices, 50,000 credit entries and 66,000 trust entries in the firm: statement 264 ms, summary 243 ms.
* **Pre-issue order (R2-Minor 1).** Five payments received 31 Mar, 1 Apr 00:00 (two), 1 Apr 23:59 and 2 Apr on an invoice issued today all sit at the issue time, now in received order: 1100, 1300, 1200, 1400, 1500, matching `order by received_at, id`.
* **Paging across pages:** 20 lines across INVOICES and TRUST in CAD and USD, with pre-issue payments, kept and applied credit. Pages of 1, 2, 3 and 7 are each identical to one page of 200, balances included. Each line's balance chains, the last line equals closing, and today's period in pages of 2 equals one page.
* **Kept credit:** unchanged from round 2 (5000, 0, 0, 10000, −5000, 12000, 0, all equal to owed − waiting).
* **Still held:** trust, company, C5, day edges (7 windows) and the input probes, as before.
