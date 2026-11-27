# Review: FO-7r part 3 (R1.111, AG-6-31): period exports for the accountant (API only)

Independent reviewer (fresh context, did not build it), 27 Nov 2026. **Head `bd0c92a7560b5ef3a87c4fcf37dc14ea75bf13e3`**, branch `claude/runtime-fo7r3-exports`. I read only `git diff origin/main...bd0c92a75`: exports.ts, export-routes.ts, features/client-money-exports.ts, check_fo7r3_exports.ts and the two MODULE rows. I checked them against the brief `design/briefs/FO-7r.md` (line 8, "Part 3 (exports)", DW6, DW7, DW9, the breaker list), AG-6-31, AG-6-30, AG-6-25 and AG-6-59 rules 5-6 (trace-requirements), part 2's `statement.ts` ledgerCtes, `ports/files.ts`, `ports/jobs.ts` and `reads/common.ts`. There is no concept file and no screen. Nothing ran on :4400 and no product code was edited. Journey report: `journey-test-reviewer-2026-11-27.md`.

## Verdict: Changes (Ship after fixes). One Major, small and local, then re-review. Journey 7.5/10

**Suites at this head:**
* `check_fo7r3_exports.ts`: **35 passed, 0 failed**.
* `check_fo7r_statement_send.ts`: **38 passed, 0 failed**. Its audit_write_failed log is that suite's own failure case.
* `check_fo7r_statement.ts`: **45 passed, 1 failed**. S8 is a timing budget: page 1 took 308 ms against 300. Part 3 does not touch that file, so I count it as machine noise, not a finding of this PR.

**Reviewer probe:** a copy of the check's harness in the scratchpad, on its own scratch database `xr_studio_brk7r3_<pid>`, dropped after each run. It covered microsecond keys over pages, a retry after a partial failure, a retry after a rename, an injection in a name, concurrent POSTs, file-name probes, trust No with money held, a 25 MB overflow, the 10,000-invoice plan and timing, and row order.

## What holds (checked, with evidence)
* **Money sums.**
  * Invoice amount: sum(amount + tax) of the lines, the same as part 2's `inv.total`.
  * Each fact is dated `greatest(fact time, issue)`, as in ledgerCtes:111-131, so E1's equality with the statement holds for two periods and two currencies.
  * Paid from trust: these are WITHDRAWAL_TO_INVOICE trust rows, and a withdrawal always comes after the invoice is issued, so their date is the same in both.
  * `amount()` uses BigInt and handles negatives and sub-unit values (−5 → "-0.05"). There is no total row and every row keeps its own currency (E2).
* **No duplicate rows from the joins.** `money_trust_entry` has `@@unique([firmId, paymentId])` (client-money.prisma:570), so joining PAYMENTS and REFUNDS to the trust entry cannot double a row.
* **Keyset paging.**
  * Probe B1: 1,500 invoices one microsecond apart came out 1,500 of 1,500, unique and in order. The `.US` key round-trips through `::timestamp at time zone 'UTC'`, and every column is timestamptz, so the session time zone does not matter.
  * At 10,000 invoices, EXPLAIN ANALYZE for a cursor at row 9,000 shows `ROW(issued_at,id) > ROW(…)` as an Index Cond on `money_invoice_firm_id_issued_at_id_idx`. The whole export took 187 ms.
* **Firm walls.**
  * The firm comes from the session (or from the job), never from the request body.
  * FilesPort reads another firm's key as absent, so the answer is 404 (E6).
  * The job key `money_export:<firm>:<id>` carries the firm, so a client-chosen id cannot collide across firms.
* **Idempotency.**
  * Three concurrent POSTs with one id queue one job (B4).
  * The same id with two different bodies at once gives exactly one 202 and one 409 (B4b): the second write-once put fails and its manifest is re-read.
  * A partial failure followed by a run with identical data ends READY (B2).
* **CSV safety.**
  * Every free-text cell goes through `cell()`: RFC 4180 quoting, and a `'` in front of a leading = + - @ tab or CR.
  * A person named `=1+2 @SUM(A1)` is written as `'=1+2 …` in both the client and Bill to cells (B3).
  * Amounts, dates and enum values are not text, and a negative amount is left as it is.
  * The download is an attachment with no-store and nosniff, and its file name is built only from validated values.
* **File names.** A kind that was not asked for, an upper-case file name or `request.json` → 404. An upper-case id is normalised (B5).
* **25 MB limit.** 110,000 long-name invoices → FileTooLarge → FAILED, and the download says "choose a shorter period" (B7).
* **Audit.** One `money_export.created` line, in the same `staff:<id>` form as send.ts:98, with the period and row counts, and no personal data. An empty period gives header-only files and counts of 0 (E4).
* **Trust words.** TRUST_LEDGER with trust off and nothing held → 422 naming `kinds` (E7). Trust No with money still held → accepted (B6), as AG-6-59 rule 6 says.

## Deliberate choices
1. **Firm-wide for holders of the key, not narrowed by C5: agree.** AG-6-31 §10 says "governed by the key only (AG7-D10)". The key is seeded only for Owner, Admin and Billing and finance (pf3 migration:541-543).
2. **Write-once files as the export's state: agree.** This is the brief's contract gap (4), and FilesPort accepts the same bytes again as a retry (ports/files.ts:2). Two caveats, Minor 3 and Minor 4.
3. **Dated as the statement, as of the request: agree on the dating.** But the claim that "a retry writes identical bytes" only holds while names and case numbers stay the same, because they are joined live (Minor 3).
4. **422 instead of 400: agree.** `badField` uses FIELD_ERROR_STATUS, the one field-error rule everywhere in client money.
5. **A separate feature file: agree.** Features are discovered from the folder (features.ts:18). Record the change from the brief's Touch list in the PR body.
6. **Expiry and paging: agree on EXPORT_DAYS = 7, labelled Sample. Challenge "non-invoice kinds page by id".** It makes those files come out in random-UUID order, which breaks the trust ledger's running balance (Major 1).

## Findings
**Major 1. Trust-ledger rows (and every non-invoice file) come out in random order, so the running-balance column reads as nonsense**
* **Where:** exports.ts:166 and :188-191. `k` is the constant `'0'` and pages are ordered by `e.id`, which is a gen_random_uuid (v4) value.
* **Probe:** eight CAD deposits of 10 to 80 for one person on one day. The file reads ORD-3 1560.00, ORD-4 1600.00, ORD-1 1510.00, ORD-8 1860.00, ORD-7 1780.00, ORD-5 1650.00, ORD-2 1530.00, ORD-6 1710.00.
* **Why a bookkeeper cannot repair it:** the last CAD running balance (1710) is not the statement's TRUST closing (1860). The date column holds only the day, so sorting by date cannot restore the order within a day. PAYMENTS show the same random order (CASH-2, 4, 6, 5, ET-1, 10, …).
* **Why the check missed it:** AG-6-31 rule 2 requires the trust ledger's "running balance". E1's assertion "its last running balance [equals] the TRUST closing" (check:159) passes only because each period and currency in the check has at most one trust row.
* **Fix:**
  * Order the trust ledger by holder, currency and seq, which is what `balance_after_minor` follows. Use the unique `(firm_id, person_id, currency, seq)` and `(firm_id, company_id, currency, seq)` indexes, in one pass for persons and one for companies.
  * Or order by `(created_at, seq, id)`; a period is a few thousand rows (AG-6-30 §2).
  * Order the other kinds by `(date, id)` as well, as the invoices already are.
  * Add a check with at least three entries for one holder and currency that asserts the running balances in the file rise in order and that the last one equals the closing.

**Minor**
* **m1. The done-when equality is narrower than the PR claims.**
  * Credit applied or kept (money_credit_entry APPLIED or KEPT) and RETURNED_FROM_TRUST move the statement's INVOICES account, but none of the six files carries them.
  * Example: an overpayment of 1,100 on a 1,000 invoice, with 100 kept as credit. The export gives 1,000 − 1,100 = −100; the statement gives 0.
  * The code says "when no trust or credit was applied" (exports.ts:12-14). AG-6-31 names only six files, so this is not new scope, but the PR body should state the limit and ask the founder (AGENTS.md rule 2) rather than claim R1.111 in full.
* **m2. DW7 is only partly in the suite.** The check seeds 2,500 invoices that all share one issue time and does not time the summary during an export. Measured: 10,000 invoices in 187 ms. Add the brief's named case: 10,000 invoices, distinct times, with a concurrent summary read. The test of the microsecond key (B1) and paging over more than PAGE rows of a non-invoice kind are also not in the suite.
* **m3. A retry after a client or case rename never finishes.** Names are joined live, not as of the request, so the retry writes different bytes. Probe B2b: `FileKeyTaken … invoices.csv`. Either take names as of the request, or treat FileKeyTaken on a CSV as a final FAILED with "Make a new export".
* **m4. The state is FAILED while PF-14 is still retrying.** failed.json is written on the first throw (exports.ts:135), so the person is told "This export failed. Make a new export" and the same export later turns READY (B2). A crashed worker leaves QUEUED for seven days. The brief's question proposed "still preparing" until retries are spent: the run can read `attempt` (JobRun).
* **m5. Memory.** Every kind's CSV is built in memory inside one transaction before the first put, and nothing stops building past 25 MB. Probe B7: +174 MB RSS, and 41 s for 110,000 invoices that all share one issue time (the `id` part of the cursor is not seekable on the `issued_at DESC, id` index). Stop a kind at FILE_MAX_BYTES and write each kind as soon as it is built. The download also buffers the file (brief: "streamed").
* **m6. Clocks.** "As of" compares the app clock (`m.at`) with the database's `created_at`. Clock skew between hosts, or a transaction that commits after the snapshot, can drop rows or change the bytes between runs. Take the as-of time from the database (`select now()`) when the request is stored.
* **m7. No UTF-8 BOM.** Excel opens a CSV without a BOM in the system code page, so names like "Zoë" garble. A leading U+FEFF is the usual remedy for spreadsheet users.

## D1-D20 (API only; D8-D14 have no screen)
D1 Requirement fit Partly: AG-6-31 rules 1-4 and 12 are met; rule 2's running balance is not (M1). · D2 Data integrity Met: write-once, one job per id, 409 on a reused id. · D3 Reuse Met: it reuses part 2's dating, `trustShows`, `Day` and `badField`. · D4 N/A. · D5 Stability and recovery Partly: m3, m4. · D6 Governance Met: an audit line with who, period and counts. · D7 N/A (no AI). · D8-D14 N/A, except D10 Met (plain error words) and D11 Partly (m4). · D15 Speed Met: 10,000 in 187 ms. · D16 Testability Partly: no test covers order and the DW7 case is partial (M1, m2). · D17, D20 not checked: no intended user walked it. · D18 Provenance Met: Sample constants are labelled and the requirements are cited. · D19 N/A (part 4 builds the screen).
**BIC-01 to BIC-20:** N/A (no case-side screen). **Graph (P-86):** GRAPH.md covers screens only and has no node for these API routes.

## Not checked
The app's real PlatformJobs (pg-boss) retry count, the S3 FilesPort adapter, and booting the full app.

Verdict: Changes bd0c92a7560b5ef3a87c4fcf37dc14ea75bf13e3
