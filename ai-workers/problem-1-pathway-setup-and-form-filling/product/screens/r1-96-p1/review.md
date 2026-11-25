# Review: R1.96 part 1, write-offs and the ledger check (API only)

PR #3631 · head `2fdfd6a1da486417144597993794258119005b48` · reviewer: fresh session, did not build it · 25 Nov 2026.
Read: `design/briefs/R1.96-shape.md` (approved by the tech lead on the PR, 10:4x IST), BACKLOG FO-7r, `MODULE.rows/R1.96-1.md`,
the diff, `invoices/money.ts`, `invoices/facts.ts`, `reads/actions.ts`, FO-7a2's and FO-7ts's triggers. Ran
`tests/check_r196_write_offs.ts` (22 passed, 0 failed, 11 s, scratch db on 127.0.0.1:54329) and a break-it script of my own
(scratchpad only, its own scratch db; nothing in the repo). No screen in this part, so the BIC table and the browser
checks are N/A. Adapted to an API part as the brief asked.

Verdict: Rework (5 Major, 0 Blocker; final line below). Journey score (API journey): **7.5 / 10, not a pass**
(`journey-test-reviewer-2026-11-25.md`).

## What holds
* Route, key and walls: `POST …/invoices/:id/write-off`, `@PermissionKeys("agent/invoice:void")` (routes.ts:12) as FO-7r says;
  no key → 403, no session → 401, firm B / unknown / malformed id → 404; firm B's ledger check never sees firm A's rows.
* Money rule: the amount is `dueMinor` (never typed; `amountMinor` in the body → 422 by `strictObject`); draft → 409 DRAFT;
  paid → 409 NOTHING_DUE; second → 409 ALREADY_WRITTEN_OFF; trust-paid part left alone (trust 300 of 500 → write-off 200, my B4).
  A credit note after it → 409 "Already settled by write-off" (on main, money.ts:155); a later payment is extra money.
* Lock order matches `InvoiceMoney.lock` (write-off.ts:121-127: party trust lock, then the invoice row `for update`); C5 scope
  read before the transaction and checked before the lock (write-off.ts:89-92). Two at once → one 201, one 409; one row.
* Audit line `invoice.written_off`, actor `staff:<id>`, entity key = the write-off, reason in `after`; fail-closed.
* Error mapping as `InvoiceMoney.write` (P2002 → ALREADY_WRITTEN_OFF, `money_*:` messages → 409 MONEY_RULE).

## Dimensions (1-5)
D1 Requirement fit 3: route, key, reason, draft refusal, credit-note refusal met; the shape's event `invoice.written_off` missing (M4) ·
D2 Data integrity 3: duplicates and races refused; the in-transaction check refuses legitimate writes (M1, M2) ·
D3 Reuse 3: reuses facts/lock/scope, but not the house reason validator `words()` (M3) ·
D4 Rule integrity 2: L5 and L2 do not detect what they claim on legitimate data (M1, M2) ·
D5 Stability and recovery 3: rollback holds, but a lone surrogate is a 500 (M3) ·
D6 Governance 4: audit line with who, when, before/after, reason ·
D7 AI trust N/A (no AI) · D8, D9, D12, D13, D14 N/A (no screen) ·
D10 Language 3: refusals plain; UNBALANCED's `problems` are internal ids and raw cents; newline gets the "hidden characters" text ·
D11 Feedback 4: 201 returns the invoice after; every refusal says "Nothing was saved." ·
D15 Speed 4: whole check 11 s with app boot; L1/L2 scan the firm's ledgers per write-off (m4) ·
D16 Testability 2: L2, L5, L6 and L3's draft/count lines can be deleted and the test stays green (M5) ·
D17, D20 simulated only (no intended user walked it) · D18 Provenance 4: amounts Sample, "Unconfirmed: no counsel; no accountant" ·
D19 Closure 3: the write-off settles the invoice, but nothing tells the case side or reminders (M4).

## Issues (Must = Major, Should = Minor)
1. **Major (Must) — L5 false positive refuses a legitimate write-off.** `ledger-check.ts:30` takes raw `money_trust_paid`, but the
   database's own rule (`money_write_off_write`, `money_invoice_due`, facts.ts:27) subtracts credit notes' `OVERPAID_REFUND`
   cover. Scenario (FO-7a2's own "Devin review" path, all writes through the triggers): invoice 100.00 paid from trust, 50.00
   moved to operating, credit note 50.00 "Refund to the client" (cover 50.00), the unmoved 50.00 returned to trust; 50.00 due.
   The write-off → **409 UNBALANCED** "L5 … trust paid 5000 is more than is left … (0)". Also flags two balanced states: a full
   credit note with Refund to the client, and the same path paid from trust again. Fix: L5 compares the same figure the
   triggers use (raw trust paid less `OVERPAID_REFUND` cover) and the test gets these three fixtures.
2. **Major (Must) — L2 false positive when narrowed to a party.** `ledger-check.ts:24-25` partitions credit by case (right: the
   database numbers a case's credit ledger per case, `money_credit_entry_case_seq`), but filters to the invoice's party
   *before* the window sum. A case whose credit ledger holds two payers (FO-7ts part 3's same-case payers) makes the
   second payer's entry "balance 8000 is not the running sum 3000". Scenario: case X, person E keeps 50.00, person F keeps
   30.00; a write-off on F's unrelated invoice → **409 UNBALANCED**. Reachable today only with invoices given a case by SQL
   (the money tests do this). Fix: narrow to the holders (cases and no-case party) the party appears in, then sum the whole holder.
3. **Major (Must) — lone surrogate reason → 500.** `write-off.ts:77` checks trim and length only; `"Small \ud800 balance"` passes
   `money_text_ok`, then the audit line's jsonb refuses it (P2007, `audit_write_failed` alarm) → 500. The house fix exists:
   `words()` in `ports/client-money.ts:90` (LONE_SURROGATE, one line), used by `CreditNoteIn`. Fix: reuse it (also gives the
   right "One line, no tabs" text for a newline, now answered with the hidden-characters message, write-off.ts:99).
4. **Major (Must) — the approved shape's event is not built, silently.** Shape part 1: "audit line + event `invoice.written_off`"
   and "one line in `ports/events.ts`"; the PR body repeats it. write-off.ts:102-106 writes no `module_event` (my B3d: only
   `invoice.issued` on the invoice), while a credit note that clears the due writes `invoice.paid` (money.ts:168). Fix: add
   the name to `MONEY_EVENT` (ports/events.ts is frozen, client-money.ts:131) and write it in the transaction with a test, or
   record the departure on the PR with the tech lead's ruling.
5. **Major (Must) — the ledger check's test does not fail when its rules are removed.** `check_r196_write_offs.ts:154-166` breaks
   only L1, L3 (over-credit) and L4; L2, L5, L6, L3's "two write-offs" and "draft" lines have no fail case, and the pass cases
   use only cheque and e-Transfer invoices (no trust application, credit kept or applied, credit-note choice, case credit,
   reversal below zero), which is why issues 1-2 pass. No test makes the write-off roll back on UNBALANCED
   (write-off.ts:106). The header promises "each rule a pass and a fail". Fix: one broken row and one legitimate fixture per rule.
6. Minor (Should) — the approved "ledger balanced" definition (per invoice `total = credited + written off + paid + due − extra`,
   every term ≥ 0; trust below zero only by a reversal) is not mapped to L1-L6 (`ledger-check.ts:4-11`); say which rule covers
   each term or record what is left to the database's checks.
7. Minor (Should) — `reads/actions.ts:4,6`: FO-7q's actions table says a row adds its line once its route exists; no `WRITE_OFF`
   yet (FO-7s4 will need it). Not in this part's touch list: name it in the PR.
8. Minor (Should) — the shape's table says "no reason → 400"; the route and test answer 422 (the house validation status). Correct the shape line.
9. Minor (Should) — L1/L2 filter on `coalesce(person_id, company_id)`, which no index covers, so each write-off scans the firm's
   trust and credit ledgers (`ledger-check.ts:23,25`); use the `person_id`/`company_id` seq indexes.

## Could not check
A real out-of-C5-scope caller (round 2 adds one); a write-off racing Pay from trust or a card webhook; the case side's owed figure. Graph tool: no gap.

Round 1 verdict: Block for 2fdfd6a1d (Majors 1-5).
## Round 2 (diff only: `git diff 2fdfd6a1d..a3192ded1`; 05c45ce36 only renames the row fragments)
`tests/check_r196_write_offs.ts` from `prototype/`, run twice: **40 passed, 0 failed** both times. (The local copy was at
a148b6318, a records-only commit over a3192ded1 holding these files; the code run is a3192ded1's.)
* M1 fixed: L5 nets off the `OVERPAID_REFUND` cover the way the triggers do (`ledger-check.ts:38`). WO9 (d) is my B5, built through
  the trust and to-move routes: 201 and the firm stays balanced. A new fail case shows L5 still catches a write-off past what trust paid.
* M2 fixed: each holder is summed over all its payers, then narrowed to the holders the party touches (`ledger-check.ts:30-33`).
  WO9 (b) is my B6: 201. L1 now filters on `person_id`/`company_id`, which the seq indexes cover.
* M3 fixed: `WriteOffIn` uses `words("The reason", 200)` (`ports/client-money.ts:109`). A surrogate, a line break or a NUL
  gives 422 on `reason`, with "One line" for the line break (WO1).
* M4 fixed: `MONEY_EVENT.INVOICE_WRITTEN_OFF` is written in the transaction, before the check (`write-off.ts:54-56`). WO3
  counts one event per write-off; WO10 shows UNBALANCED keeps no row, no audit line and no event.
* M5 fixed: each of L1-L6 now has a fail case. There are five legitimate ledgers (trust part paid; two payers on one case;
  credit kept, applied and partly reversed; a refund-to-client credit note; trust below zero after a reversal), plus the
  rollback test and a C5 404. Reverting M1 or M2 turns WO9 red. Dropping L3's two-write-offs line is fine: the unique index covers it.
* Minors 6 and 8 are done (`ledger-check.ts:13-16`; the PR). 7 and 9 are carried to follow-ups; `ch` still reads the firm's whole credit ledger (9).
* New nit (not needed for approval): `WriteOffIn` was put between `CreditNoteIn`'s doc comment and `CreditNoteIn`
  (`ports/client-money.ts:106-108`), so that comment now sits on the wrong export.
Journey score round 2: **8.5 / 10, a pass.** 7 of the 8 criteria that apply score 1; plain words stays at ½ (UNBALANCED's `problems`). No open Blocker or Major.
**Verdict: Approve** for a3192ded115b5abad6d14868f972212335601f28.
Reviewer: Approve a3192ded115b5abad6d14868f972212335601f28
