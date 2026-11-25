# Journey test (reviewer role): FO-7b C5 scope, PR #3321 at 2d69a9f17

The reviewer's one journey score for this check. FO-7b has no screen, and no web page calls these routes. Each journey is therefore walked as API steps, the way j_59 does it, by the new suite and by j_59 on an isolated copy at :4431 (never :4400). The data underneath was read with SQL.

## Journeys (persona · goal · expected)
1. **Main path.** A case officer with the money keys, limited to their own cases, wants to bill a client opened on the case side (no prospect) of their case K: draft, line, issue. Expected: 201, 201, 200, and the tax default answers. **Held** (L1).
2. **Alternate.** The Owner bills that same client. Expected: 201. **Held** (L5).
3. **Wrong person by URL.** The officer pastes the id of a colleague's invoice into GET, PDF, receipt, credit-note PDF, lines, bill-to, issue, send, payment, credit note, refund and the extra's choice. Expected: 404 on each, the same words as a missing invoice or payment, and nothing written. **Held** (S1–S11, plus S12 word for word; counts on credit notes, audit, lines, payments, refunds and credit entries are unchanged; still a draft; Bill-to unchanged; no email).
4. **Wrong party on create.** The officer drafts for a person no rule lets them see, and asks that person's tax default. Expected: 404, in the words of a missing person, with no invoice row. **Held** (S13).
5. **Edge.** The client of a case the officer does not see (L2), a person linked only by another firm's case (L3, for the officer and for the Owner), and an invoice put on an unseen case although its party is linked to a seen case (L4). Expected: 404, and off the list. **Held.**
6. **Recovery and the right person.** The colleague whose prospect it is still reads the invoice, and the officer's own invoices still work after the refusals. **Held** (S12, the in-scope pass cases).
7. **Across the boundary.** The FO-7q list, which the screens will read, shows exactly what the FO-7b routes let through. **Held** (setup check, L4 list).
8. **Main money path unchanged for a seen client.** j_59 W1–W5 and DW: 15/15 on :4431. **Held.**

## Break it (15 min)
- Mixed ids (an in-scope invoice id with an out-of-scope payment or note id on the PDF routes): refused, because both are bound to `:id` (`money.ts:178,181`).
- Upper-case ids: lower-cased before every scope query.
- Removing each new rule in turn:
  - the linked parties (M2): L1 red, exit 1;
  - `case_id is null` (M4): L4 red;
  - the tax route's `seesInvoice` (M1): **stays 34/0**. This is a Minor: that line has no failing test.
- Timing: an out-of-scope 404 is decided after the trust advisory lock, so it can wait behind a writer while a missing id answers at once. Minor.

## Score (each 0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | L1 and L5: drafted, lined and issued for a case-side client |
| Next step obvious | ½ | API only. The 404 is right by design (no hint), but there is no screen to judge |
| Plain words | 1 | Each refusal has the same words as a missing invoice, payment or person (S12, S13) |
| Feedback and state | 1 | Correct codes. 201/200 replay statuses are untouched (replay runs after the check) |
| Correct data | 1 | Every refused route writes nothing (table counts, Bill-to, draft state, mail) |
| Error recovery | 1 | In-scope actions work after refusals; the right person still reads (S12) |
| Accessibility and screen sizes | ½ | Not applicable (no screen); not testable here |
| Speed | ½ | Not measured against §9. One extra scope query per guarded request, and an Owner's scope carries every case id of the firm |
| Visual quality | ½ | Not applicable (no screen) |
| Trust and sources | 1 | No AI. Fixture values are labelled Sample |

**8 / 10, no 0: pass.** To raise it: add the tax-default case for L4's invoice (review item 1), and time a guarded route for an Owner of a large firm against `STANDARDS.md` §9.

Not tested:
- a real screen reader and an intended user's unaided walk (D17/D20 stay with the founder);
- a visible-browser walk, because there is no screen.
