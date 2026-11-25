# R1.96 part 1 — break report (write-offs + ledger check, API only)

PR #3631, exact head `2fdfd6a1d`. Tested on a `git archive` copy of that head (the shared checkout had someone's uncommitted
edits to `ledger-check.ts`, `write-off.ts` and `ports/client-money.ts` while I worked; those were not tested). Scratch databases
on 127.0.0.1:54329 (dropped afterwards), Nest app built as `tests/check_r196_write_offs.ts` builds it, plus reversals. Never
:4400. US$0. Probes: `…/scratchpad/breaker/p1.ts`, `p2.ts` (outside the repo). The PR's own check passes 22/22.

## Findings

**M1 (Major): L2 reports a sound shared-case credit ledger as unbalanced, and the write-off is refused with 409 UNBALANCED.**
`ledger-check.ts:24` filters credit entries to the invoice's party *before* the running sum. The database keeps the credit ledger
per case across all payers (`money_credit_entry_write`: `WHERE e.case_id = NEW.case_id`), so on a case with two payers the other
payer's entries drop out of the sum and every later entry looks wrong.
Repro (p1 S5): runtime case K; persons Pa and Pb each have an invoice on K (case_id set on the draft, then issued). Pa pays 150 on
100 and chooses KEEP_AS_CREDIT (50, seq 1, bal 50); Pb pays 130 on 100 and keeps 30 (seq 2, bal 80). Pb's second invoice on K is
200, with 50 paid. `POST /invoices/{Pb's 2nd}/write-off {"reason":"Small balance on a shared case (Sample)"}` → 409 UNBALANCED,
`problems: ["L2 credit entry …: balance 8000 is not the running sum 3000 …"]`, nothing written. The firm-wide `ledgerCheck(db, A)`
on the same rows says `balanced: true`, so the check disagrees with itself. Pa's write-off on K passes (Pa's entries come first).
Latent today: no API sets `money_invoice.case_id` (`DraftIn` has no caseId). Once case-billed invoices exist (a family, or an
employer plus a person), it blocks real write-offs.
**m1 (Minor): L5 ignores a credit note's OVERPAID_REFUND, so it reports a legitimate invoice as unbalanced.**
`ledger-check.ts:30` uses raw `money_trust_paid`; `facts.ts`, `money_invoice_due` and `money_write_off_write` all subtract
`overpaid_minor` where `overpaid_choice = 'OVERPAID_REFUND'`. Repro (p1 S5): a 1,000 invoice, 600 paid from trust and moved to
operating (`POST /trust/to-move/batches`), then a credit note of 500 with OVERPAID_REFUND 100 (SQL, triggers on; the database
accepts it). The invoice reads Paid, due 0; `ledgerCheck` (invoice and firm-wide) returns `L5 invoice INV-…: trust paid 60000 is
more than is left … (50000)`. It blocks no write-off today (due is 0, NOTHING_DUE comes first; no API makes OVERPAID choices), but
the "balanced after each step" asserts (this test, j_96) would fail on a sound ledger.
**m2 (Minor): a refund after a write-off (or racing one) leaves an invoice that reads "Written off" but still has money due, and
nothing can settle it.** Repro (p1 S3): issue 500, pay 200, write off (201, 300), then refund the 200 (201). GET shows
`statusWord "Written off", dueMinor 20000`. A second write-off → 409 ALREADY_WRITTEN_OFF; a credit note → 409 WRITTEN_OFF. Only a
new payment clears the 200, and the status word hides it from anyone chasing money owed. The race (write-off ∥ refund, 4 runs)
ends the same way (wo 200, due 100). The ledger check says balanced. Code: `write-off.ts:47-48`; status order:
`ports/client-money.ts` invoiceStatus.
**m3 (Minor): a NUL or a lone surrogate in the reason gives a 500; the lone surrogate also sets off the BR-5 audit alarm.**
`WriteOffIn` (`write-off.ts:28`) lacks the control-character and lone-surrogate checks of the `words()` helper the other money
routes use. `{"reason":"abc\u0000def"}` → 500 (Postgres 22021 at `write-off.ts:50`). `{"reason":"abc\ud800def"}` → 500 (P2007
"invalid input syntax for type json" in the audit write at `write-off.ts:54`) plus `audit_write_failed` and an `alert` (BR-5).
Nothing is saved in either case (rows=0).
**m4 (Minor): hidden direction marks and joiners in the reason are accepted, although the 422 message says they are refused.**
`"‏Small balance"` (RLM), `"Small‎balance"` (LRM), `"؜Small balance"` (ALM) and `"Small‍balance"` (ZWJ) each
give 201 and are stored verbatim in `money_write_off.reason` and the audit line. The refusal for RLO/RLI says "no hidden or
direction-changing characters". Cause: `money_text_ok` refuses only U+202A-202E and U+2066-2069.
**m5 (Minor): no `invoice.written_off` event.** The shape (R1.96-shape.md, part 1) promises "audit line + event
`invoice.written_off`" and "one line in `ports/events.ts`". At this head a write-off adds 0 `module_event` rows (p2: the invoice
has only `invoice.issued`) and `MONEY_EVENT` has no such key, so outbox readers never learn the invoice was settled.

## What held
- **Amount:** always what is due, never typed, never the trust-paid part: 500 with 200 from trust → 300; 500 with 200 paid and 100
  credited → 200; applied credit partly reversed → 170 of 200; card payment 200 with a CARD refund of 50 → 150.
- **States:** draft → 409 DRAFT; fully credited, overpaid, fully paid from trust → 409 NOTHING_DUE; fully refunded ("Refunded")
  → writes off the open 500; after a write-off a credit note → 409 WRITTEN_OFF, Pay from trust → 409 OVER_DUE.
- **Duplicates:** 8 parallel write-offs on one invoice → one 201, seven 409 ALREADY_WRITTEN_OFF, one row; 12 in parallel on 12
  invoices of one party → all 201 in 328 ms, no deadlock or pool timeout; a retried POST is 409, never a second row.
- **Races:** write-off against a payment, a credit note, Pay from trust and a refund (4 runs each): no 500, no deadlock, each
  result matches one serial order, `ledgerCheck` balanced after each; a payment landing after the write-off counts as extra.
- **Reasons:** accepted: Cyrillic, CJK, Devanagari, Arabic, Hebrew; 200 × "x", 200 emoji, 100 × "e"+U+0301 (200 code points).
  422: 201 characters or emoji; newline, tab, U+0085, U+2028, RLO, RLI; NBSP or ideographic space only; number, null, array,
  object, bool; extra fields, `__proto__`, `constructor`, array body, text/plain. Padding trimmed (205 → 200 accepted). Broken
  JSON → 400.
- **Walls:** no session or forged token → 401; Case Officer without `agent/invoice:void` → 403, and 403 again in a new session
  after the key is removed; firm B, unknown id, malformed id → 404; C5 no-case invoice with party out of scope → 404 identical to
  a missing invoice, 0 rows; C5 case-linked invoice when not on the team → 404, on the team → 201; an upper-case id is normalised.
- **Ledger check on sound ledgers:** trust at −300 after a RETURNED reversal, then a write-off on that party → 201; a MOVE_TO_CASE
  pair, then a pick of another payer's money on the same case → balanced, both write-offs 201; KEPT, APPLIED, partial REVERSED
  with no case → 201; card refunds pass L4; the PR's own broken rows are each named (L1, L3, L4).

**Verdict: Major** (M1: the ledger check refuses a legitimate write-off on a case whose credit two payers share).

## Round 2: diff-only re-break at a3192ded1

Scope: `git diff 2fdfd6a1d..a3192ded1` (`ledger-check.ts`, `write-off.ts`, `ports/client-money.ts`, the check, module-row
renames). Tested on a `git archive` copy of a3192ded1 (scratch DB, never :4400, US$0). Probes: `…/scratchpad/breaker/p3.ts`,
`p4.ts`. The PR's check passes 40/40.
**Fixed (each repro re-run):**
- **M1 fixed.** L2 sums each credit holder over all its payers, then keeps the holders the party has entries on. The round-1
  repro (Pa keeps 50 on K, Pb keeps 30 on K, write off Pb's other invoice on K) → 201, 150.
- **m1 fixed.** L5 subtracts OVERPAID_REFUND, floored at 0. The 1,000 invoice (600 from trust and moved, credit note 500 with 100
  refunded) checks balanced. Also: 100 from trust, 50 moved, credit note 50 with the 50 refunded, the unmoved 50 returned → 50
  due, write-off 201 for 50, still balanced.
- **m3 fixed.** `WriteOffIn` uses `words()`: NUL, DEL, a lone high and a lone low surrogate → 422 naming the reason, never 500,
  0 rows, no audit alarm. 200 emoji → 201; 201 emoji → 422.
- **m5 fixed.** A write-off writes one `invoice.written_off` module event naming its invoice; on 409 UNBALANCED the event and the
  audit line roll back with it (0 rows each).
**Attempts to break the new L2 query, all held.** Setup on firm A: Pa has credit with no case, on K1 and on K2; Pb interleaves
on K1 (seq 2) and comes first on K2; a company payer Co has credit on K1 (seq 3) and with no case; K1 also holds a USD line.
- Firm-wide check: balanced. Write-offs, all 201: Pa no case, Pa on K2, Pb on K1 CAD, Pb on K1 USD, Co on K1, Co no case, Pb no
  case (Pb has no no-case credit of their own).
- Co applied 70 of K1's pooled credit (three payers) and reversed 20 of it; write-offs on Co's K1 invoice, then Pa's K1 invoice
  → both 201.
- Blast radius (I read it as the intended design, not a finding): one bad K1 row for Pb, written past the triggers, blocks Pa's
  no-case and K2 write-offs and Co's no-case write-off (409 UNBALANCED naming that row), because each has entries on K1. The
  ledger really is broken there, and L1 is already party-wide the same way.
- Budget, firm A at 20,000 credit and 20,000 trust entries: a write-off takes 64-88 ms; `ledgerCheck(invoice)` 19 ms,
  `ledgerCheck(firm)` 48 ms; 10 write-offs at once on one party take 508-586 ms each, serialised by the party lock.
**Still open** (carried as follow-ups per the PR comment; spot-checked only): m2 (a refund after a write-off leaves "Written
off" with money due); m4 (RLM U+200F still accepted, 201).

**Round 2 verdict: Minor** (only m2 and m4 remain; nothing new found).
