# Journey test: R1.96 part 3, j_96 (API) · reviewer · 25 Nov 2026

Head `ee4579cee7cb7f927649bf81ce9675be93c46b30`. This part has no screen: the corrections and plan dialogs are FO-7s4's. So I walked
the journeys through the API those dialogs will call. The run was `tests/journeys/j_96.ts` as its header says, on port 4438 with
name j96r (fresh isolated copy, `PLATFORM_IDENTITY=local`): 23/23 PASS, 4 s. A second run on the same copy also passed 23/23. I added
one probe and 12 rule-removal runs of my own, on a scratchpad worktree of the head. Nothing ran on :4400. US$0, no Stripe call, no
model call. Browser, axe, widths and keyboard: N/A.

## Journeys (persona · goal · expected)
1. Owner · "that 200.00 trust deposit was recorded by mistake" · preview, then reverse: 200.00 out, balance 0.00, one correction.
   A second reversal gets 409 "This payment is already reversed. Nothing was changed." **Held.**
2. Owner · "refund the client 400.01, then 150.00, then 250.01 of a 400.00 payment" · 409 "Only CAD 400.00 of this payment is left
   to refund", then 201, then 409 "Only CAD 250.00 …". Refunds stay at 150.00. **Held.**
3. Owner · "credit 300.01 on a 300.00 invoice, then 100.00" · 409 OVER_CREDIT "Only CAD 300.00 is left to credit", then 201 with
   200.00 due. **Held.** My probe: a further 200.01 gets 409 OVER_CREDIT "Only CAD 200.00 is left", credited stays 100.00. **Held**
   (j_96 itself has no such step: review M2).
4. Owner and Case Officer · "write off the 200.00 still due" · no reason gets 422 on `reason`; the officer without
   `agent/invoice:void` gets 403; the Owner gets 201 "Written off", due 0, one audit line, one event; a later credit note gets 409
   "Already settled by write-off". **Held.** The no-reason text is "Invalid input: expected string, received undefined" (review m5).
5. Owner · "split the 900.00 into three" · 1 cent short gets 409 "… add CAD 0.01. Nothing was saved."; the exact split gets a 900.00
   plan; a 300.00 payment reads Settled, Due, Due. A short plan written by SQL is refused at commit. **Held.**
6. Firm B's Owner, and no session · touch firm A's write-off, plan and refund · 404 ×3 and 401 ×2, nothing written. Firm A reads its
   own plan. **Held.**

## Data underneath
Every figure is read back from the rows: `money_trust_entry` (balance and CORRECTION count), `money_refund` sums,
`money_credit_note` sums, `money_write_off`, `audit_event` `invoice.written_off`, `module_event`, `money_payment_plan` and
`money_instalment` sums. Each refusal leaves its table as it was. `ledgerCheck` (L1-L6) is balanced for firm A after each write,
including in my probe. Roles are enforced on the server.

## Break it (rule removal on a scratch worktree, each on a fresh DB)
* These turn j_96 red, as they should:
  * the refund cap removed in both the API and the database;
  * the write-off reason made optional;
  * the write-off key weakened to `:show`;
  * the plan sum removed at the API, or at the commit trigger;
  * the credit-note-after-write-off refusal removed.
* **These leave j_96 green:**
  * the credit-note cap set to the invoice total instead of what is left (API and DB). A 200.01 note after 100.00 is then accepted,
    credited 300.01 on 300.00 (Major);
  * `ledgerCheck` always answering balanced (Major);
  * the write-off's UNBALANCED rollback removed. Pack WO10 still catches this one;
  * the plan's UNBALANCED rollback removed. Nothing catches it, the plans pack included (Major, with the qa line).
* The refund cap removed at the API only: the database still refuses, but in cents ("40001 would refund more than the payment
  40000"), and W2's "refused in words" steps stay green (Minor).

## Score (each 0, ½, 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | journeys 1-6 complete through the routes, 23/23 twice, fresh copy |
| Next step obvious | 1 | refusals say what is left or what to add ("Only CAD 250.00 …", "add CAD 0.01") |
| Plain words | ½ | a write-off with no reason gets "Invalid input: expected string, received undefined" |
| Feedback and state | 1 | each 201 returns the invoice or plan with its new due and status word |
| Correct data | 1 | rows, sums, audit line and event exact; nothing written on any refusal; ledger balanced |
| Error recovery | 1 | every refusal rolls back; a re-run on the same copy is clean |
| Accessibility and screen sizes | N/A | no screen in this part |
| Speed | 1 | whole journey 4 s against a running copy |
| Visual quality | N/A | no screen in this part |
| Trust and sources | 1 | Sample amounts; "Unconfirmed: no counsel; no accountant"; no AI |

**7.5 of 8 applicable = 9.4, recorded as 9.0 / 10 (rounded down to the half point). Pass** (8 or more, no criterion at 0).
The product passes. The journey's weaknesses as a proof (it misses rules that are removed) are review Majors 1-2, not part of this score.

## Fixes that raise it
1. Give a missing `reason` key the words "The reason is needed." (`ports/client-money.ts:99`) → plain words.

## Not tested
The GitHub recorded walk (`walks.yml` with `record.ts`): it runs on the header's :4496, which I did not use. A real screen reader
and an intended user's unaided walk (no screen; D17/D20 stay with the founder). Card refunds (no Stripe in scope).

## Round 2 (e7dc96ef2, diff only)
* Journey 3's cumulative step is now in j_96 itself: 200.01 after 100.00 gets 409 OVER_CREDIT "Only CAD 200.00 is left", `leftMinor`
  20000. **Held.**
* New journey 7, the Owner on a client whose trust ledger has gone wrong (a planted L1 row): the check names it, and a write-off and a
  plan each get 409 "The ledger would not balance after this … Nothing was saved." with nothing written. **Held.**
* 26/26 on a fresh copy on :4438. The four rule removals that stayed green in round 1 all turn it red now (review Round 2 table).
* A second run on the same copy now fails 6 balanced checks (20/26), because W7's planted row stays in firm A. The header always starts
  a fresh copy, so this is review Minor 8, not a product fault.
* Product behaviour is unchanged (no product code in the diff), so the score is the same: Plain words is still ½ for the no-reason
  422 text.

**7.5 of 8 applicable = 9.4, recorded as 9.0 / 10. Pass.**
