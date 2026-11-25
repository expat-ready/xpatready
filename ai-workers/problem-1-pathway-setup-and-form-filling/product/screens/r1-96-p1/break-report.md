# R1.96 part 1 — break report (write-offs + ledger check, API only)

PR #3631, exact head `2fdfd6a1d`. Tested on a `git archive` copy of that head (the shared checkout had someone's
uncommitted edits to `ledger-check.ts`, `write-off.ts` and `ports/client-money.ts` while I worked; those were not
tested). Scratch databases on 127.0.0.1:54329 (dropped afterwards), Nest app built as `tests/check_r196_write_offs.ts`
builds it, plus reversals. Never :4400. US$0. Probes: `…/scratchpad/breaker/p1.ts`, `p2.ts` (outside the repo).
The PR's own check passes 22/22.

## Findings

**M1 (Major): L2 reports a sound shared-case credit ledger as unbalanced, and the write-off is refused with 409 UNBALANCED.**
`ledger-check.ts:24` filters credit entries to the invoice's party *before* the running sum. The database keeps the credit
ledger per case across all payers (`money_credit_entry_write`: `WHERE e.case_id = NEW.case_id`). So on a case with two
payers, the other payer's entries are dropped from the sum and every later entry looks wrong.
Repro (p1 S5): runtime case K; persons Pa and Pb each have an invoice on K (case_id set on the draft, then issued).
Pa pays 150 on 100 and chooses KEEP_AS_CREDIT (50, seq 1, bal 50). Pb pays 130 on 100 and keeps 30 (seq 2, bal 80).
Pb's second invoice on K is 200, with 50 paid.
`POST /invoices/{Pb's 2nd}/write-off {"reason":"Small balance on a shared case (Sample)"}` returns 409 UNBALANCED,
`problems: ["L2 credit entry …: balance 8000 is not the running sum 3000 …"]`, and nothing is written.
The firm-wide `ledgerCheck(db, A)` on the same rows says `balanced: true`, so the check disagrees with itself.
The same write-off for Pa's invoice on K passes (Pa's entries come first). Today no API sets `money_invoice.case_id`
(`DraftIn` has no caseId), so it is latent. Once case-billed invoices exist (a family, or an employer plus a person),
it blocks real write-offs.

**m1 (Minor): L5 ignores a credit note's OVERPAID_REFUND, so it reports a legitimate invoice as unbalanced.**
`ledger-check.ts:30` uses raw `money_trust_paid`. `facts.ts`, `money_invoice_due` and `money_write_off_write` all subtract
`overpaid_minor` where `overpaid_choice = 'OVERPAID_REFUND'`.
Repro (p1 S5): a 1,000 invoice, 600 paid from trust, and that 600 moved to operating with
`POST /trust/to-move/batches`. Then a credit note of 500 with OVERPAID_REFUND 100, inserted through SQL with the
triggers on, which the database accepts. The invoice reads Paid, due 0. `ledgerCheck` (invoice and firm-wide) returns
`L5 invoice INV-…: trust paid 60000 is more than is left … (50000)`.
It does not block a write-off today, because due is 0 (NOTHING_DUE comes first) and no API makes OVERPAID choices. But
the "balanced after each step" asserts (this test, j_96) would fail on a sound ledger.

**m2 (Minor): a refund after a write-off (or racing one) leaves an invoice that reads "Written off" but still has money due, and nothing can settle it.**
Repro (p1 S3): issue 500, pay 200, write off (201, 300), then refund the 200 (201). GET then shows
`statusWord "Written off", dueMinor 20000`.
A second write-off gives 409 ALREADY_WRITTEN_OFF. A credit note gives 409 WRITTEN_OFF. Only a new payment clears the
200, and the status word hides it from anyone chasing money owed.
The race (write-off ∥ refund, 4 runs) ends the same way: wo 200, due 100. The ledger check says balanced.
Write-off code: `write-off.ts:47-48`. Status order: `ports/client-money.ts` invoiceStatus.

**m3 (Minor): a NUL or a lone surrogate in the reason gives a 500, and the lone surrogate also sets off the BR-5 audit alarm.**
`WriteOffIn` (`write-off.ts:28`) has no control-character or lone-surrogate check, unlike the `words()` helper the other
money routes use.
- `{"reason":"abc\u0000def"}` returns 500 (Postgres 22021 at `write-off.ts:50`).
- `{"reason":"abc\ud800def"}` returns 500 (P2007 "invalid input syntax for type json" in the audit write at
  `write-off.ts:54`) and logs `audit_write_failed` plus an `alert` (BR-5).

Nothing is saved in either case (rows=0).

**m4 (Minor): hidden direction marks and joiners in the reason are accepted, although the 422 message says they are refused.**
These four reasons are accepted (201) and stored verbatim in `money_write_off.reason` and in the audit line:
- `"‏Small balance"` (RLM)
- `"Small‎balance"` (LRM)
- `"؜Small balance"` (ALM)
- `"Small‍balance"` (ZWJ)

The refusal text for RLO/RLI says "no hidden or direction-changing characters". The cause is `money_text_ok`, which
refuses only U+202A-202E and U+2066-2069.

**m5 (Minor): no `invoice.written_off` event.** The shape (R1.96-shape.md, part 1) promises "audit line + event
`invoice.written_off`" and "one line in `ports/events.ts`". At this head a write-off adds 0 `module_event` rows (p2: the
invoice has only `invoice.issued`), and `MONEY_EVENT` has no such key. Readers of the outbox never learn that the
invoice was settled.

## What held
- **Amount:** the write-off is always what is due, never a typed amount and never the part paid from trust.
  - 500 with 200 from trust: 300 written off.
  - 500 with 200 paid and 100 credited: 200.
  - Applied credit, partly reversed: 170 of 200.
  - Card payment 200 with a CARD refund of 50: 150.
- **States:**
  - Draft: 409 DRAFT.
  - Fully credited, overpaid, or fully paid from trust: 409 NOTHING_DUE.
  - Fully refunded ("Refunded"): writes off the open 500.
  - After a write-off, a credit note is 409 WRITTEN_OFF and Pay from trust is 409 OVER_DUE.
- **Duplicates:** 8 parallel write-offs on one invoice gave one 201 and seven 409 ALREADY_WRITTEN_OFF, with one row.
  12 in parallel on 12 invoices of one party all gave 201 in 328 ms, with no deadlock or pool timeout. A retried POST
  is 409, never a second row.
- **Races:** write-off against a payment, a credit note, Pay from trust and a refund, 4 runs each: no 500, no
  deadlock. Each result matches one serial order, and `ledgerCheck` is balanced after each. A payment that lands after
  the write-off counts as extra, as designed.
- **Reasons:**
  - Accepted: Cyrillic, CJK, Devanagari, Arabic and Hebrew text; 200 × "x", 200 emoji, and 100 × "e"+U+0301 (200
    code points).
  - Refused with 422: 201 characters or 201 emoji; newline, tab, U+0085, U+2028, RLO and RLI; NBSP or ideographic
    space only; non-strings (number, null, array, object, bool); extra fields, `__proto__`, `constructor`, an array
    body, text/plain.
  - Padding is trimmed (205 characters trimmed to 200 is accepted).
  - Broken JSON gives 400.
- **Walls:**
  - No session or a forged token: 401.
  - Case Officer without `agent/invoice:void`: 403. Key removed, then a new session: 403.
  - Firm B, an unknown id, a malformed id: 404.
  - C5, invoice with no case and its party out of scope: 404 with a body identical to a missing invoice, and 0 rows.
  - C5, case-linked invoice when not on the case team: 404. Once added to the team: 201.
  - An upper-case id is normalised.
- **Ledger check on sound ledgers:**
  - Trust at −300 after a RETURNED reversal, then a write-off on the same party: 201.
  - A MOVE_TO_CASE pair, then a pick of another payer's money on the same case: balanced, both write-offs 201.
  - KEPT, then APPLIED, then partial REVERSED with no case: 201.
  - Card refunds: L4 is fine.
  - The PR's own broken rows: L1, L3 and L4 are each named.

**Verdict: Major** (M1: the ledger check refuses a legitimate write-off on a case whose credit two payers share).
