# R1.60 — Step 1: the rules (before code)

Lane: runtime. Status: **rules only; no code, no migration until the Lead types "go"** (Lead 19).

## Rulings

**Lead 19, 24 Nov 08:47 IST (P-797, P-628; recorded for the founder's review).** The newest requirement wins: AG-6-61 / MS-D6.
- Signing prepares one **trust deposit request**, "Ask me first" by default, and never a draft invoice.
- With no trust, trust unanswered or the row Off, nothing is prepared and the row stays in Ready to bill.

**Lead 19, later on 24 Nov: Lead B 5 confirmed.**
- This is built as **this lane's own FO-7t part** after "go".
- The bounds below (B1-B10) are the Lead's, word for word in substance.
- It is never built at the same time as FO-7t part 2, which also changes `trust/service.ts`.

**Source:** the team requirement `domain/requirements-2026-11-02/02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md`, AG-6-61 "Deposit request" (decisions MS-D6, MS-D20(2)(8)(9)(11)(17), MS-D21(3)(4)(11), AG05-D1(5), AG05-D2(4), AG05-D4(5)), read 24 Nov. R1.60's old Done when ("one draft deposit invoice") is replaced.

## Bounds (Lead 19, after Lead B 5)

| # | Bound | AG-6-61 quote |
|---|---|---|
| B1 | **Only trust YES and a deposit row above zero.** Trust `NO` or `UNANSWERED`, no first row `ON_SIGNING`, or an amount that is null or 0: nothing is prepared, and the row stays in Ready to bill. | §5.2: "Trust answer is Yes (AG-6-59) and the signed retainer has a deposit row (its first schedule row) above zero. Otherwise nothing is prepared, and the deposit row is billed later by Bill this." |
| B2 | **Trigger:** every client signer plus the firm's signature (`signing.completed`, `documentKind: RETAINER`), or signed offline (`retainer.signed_offline`). | §5.1: "e-signed by every client signer with the firm's signature (AG05-D2(4), AG05-D3), or signed offline." |
| B3 | **A retainer or its amendment only.** A consultation agreement or an `OTHER` document prepares nothing. | §5.1: "Only a retainer or its amendment starts it (AG05-D1(5))." |
| B4 | **Once per version; a cancelled request keeps it.** This uses the partial unique index on `money_trust_request.retainer_version_id` that is already on main. A replay, or a paper sign then an e-sign, writes nothing new, and a cancelled request still holds its version. | §5.7: "One per retainer version (MS-D20(9)). A retainer signed offline ends the open signing link (AG-05), so a later e-signature never prepares a second request." §9: "idempotent on `retainerVersionId`." |
| B5 | **PREPARED has no `DR-` number until a person sends it.** The number is taken at send, through #3033's numbering. | §5.5: "On Send it takes the next DR number (AG-6-44)." §6: "`PREPARED` (waiting for Ask me first) → `SENT`". |
| B6 | **#3033's "unsent" is never PREPARED.** #3033 stores a staff-made request unsent while the trust details block is empty. That is a different state, and nothing reads one as the other (see O1). | — (the Lead's bound) |
| B7 | **No trust details: the request waits, even under Send automatically.** | §5.6: "if the trust details block is empty, the request waits in the Needs you item with 'Add your trust payment details', even under Send automatically." |
| B8 | **AG-6-61 rules 12, 13, 14 and author default D7** are in this part (R12-R15 below). | §5.12, §5.13, §5.14; §5.4 and §5.11 "*(Author default D7.)*" |
| B9 | **Pay link: P-567 (3) governs.** A trust request has **no pay link in R1**. See the named departure below. | §5.5: "The email … holds: DR-0001, amount incl. estimated tax, a no-login pay link, and the trust payment details block." |
| B10 | **Needs you and Automatic messages** go through the case side's port where one exists, or are stated as a gap (see "Ports and gaps"). | §5.4, §3 "AG-12 Automatic messages row 'Deposit request' (AG12-D21). AG-11 Needs you." |

### Named departure (B9)
- **AG-6-61 §5.5** puts "a no-login pay link" in the deposit request's email, and **§5.8** allows "Card through the trust card account".
- **P-567 (3)** (the founder, 14 Nov) says: "card only for invoiced fees into the operating account; card into trust waits on a verified processor set-up …; AG-6-70's optional trust card account is not in month one". The schema agrees: `payLinkTokenHash` is "unused in R1: no pay link on a trust request (P-567 (3))".
- **So in R1:** the deposit request's email carries the `DR-` number, the amount including estimated tax, and the trust payment details block, with **no pay link and no card**. Payment is offline only (§5.8, recorded by staff through #3033's deposits route).
- J-61 says the same: "a trust deposit on signing is never taken by card (it stays an offline trust request)".
- Unconfirmed: no counsel.

## The rules

| # | Rule | AG-6-61 quote | Here |
|---|---|---|---|
| R1 | **Not an invoice** | §13: "No deposit invoice." §2: "a deposit is money to hold, not an earned fee." | No `money_invoice` row is written by this part, ever. |
| R2 | Trigger | §5.1 | B2, B3. |
| R3 | Conditions | §5.2 | B1. |
| R4 | **Amount source** | §5.3: "Amount = the deposit row + estimated tax (MS-D21(4)): *Example:* row 1,000, Ontario → 'CAD 1,130 incl. estimated HST'. Currency = the case's (or prospect's)." | The signed version's own first fee row (the event's `fees[]`; for offline, the signed version's stored fees), never an editable draft. Estimated tax is the GST/HST rate of the Bill to's province (P-701: GST/HST only), rounded once by FO-7b's stated rule (R1.59), and stored apart (O1). The currency is the retainer's. |
| R5 | **Holder and addressee** | §5.3: "Holder = the case, or the person or company if no case exists yet (moves later, AG-6-60). Addressed to the case's Bill to, or the retainer's client before a case exists." | `caseId` if the won prospect has a case in the signing transaction, else `personId` / `companyId`. |
| R6 | **Ask me first; never sent by itself** | §5.4: "Ask me first: one item in the Needs you of the case lead, or the file owner before a case exists (MS-D20(8)) … It also shows to every holder of `agent/payment:record`, and any of them may send it (AG16-60)." §10: "Ask me first by default (AG16-76)." | PREPARED. A person sends it (B5). Send automatically and Off wait for the Automatic messages row (gap G2). |
| R7 | Trust details missing | §5.6 | B7. Send is refused with "Add your trust payment details" while the block is empty, and the request stays PREPARED. |
| R8 | Idempotent | §5.7, §9 | B4. The second delivery is a quiet no-op, not an error, and writes no audit line. |
| R9 | **Who may see and act** | §8: "Send, edit, cancel: `agent/payment:record` (a deposit request is a trust request, MS-D21(11))." | Reads go through `MoneyVisibilityPort` (C5, fail closed), as in #3033's request read. Another firm gets 404. A client sees nothing until it is sent. |
| R10 | **Edit amount** (D7) | §5.4: "[Send] [Edit amount] [Don't send]. *(Edit amount and Don't send: author default D7.)*" | Only while PREPARED. The amount and estimated tax are re-entered (integer cents, above 0, the same currency), with one audit line showing before and after. Not allowed once sent. |
| R11 | **Don't send / Cancel** (D7) | §5.11: "An unpaid request may be cancelled by a person with a reason; it keeps its number and shows 'Cancelled'. *(Author default D7.)*" §6: "`PREPARED \| SENT \| PART_PAID` → `CANCELLED` (with reason; a part-paid request keeps its money in trust)." | "Don't send" cancels a PREPARED request with a reason, and it has no number. A sent one is cancelled through #3033's route. Either keeps its version (B4). |
| R12 | **AG-05 check** (rule 12) | §5.12: "AG-06 answers 'money received on this retainer's deposit request?' so AG-05 can allow or refuse 'Marked signed by mistake'." | One method on `ClientMoneyPort`, `depositReceived(firm, retainerVersionId): boolean` (fake and adapter on one contract test). Nothing on the retainer side calls it in this part; the AG-05 refusal is the retainers module's row. |
| R13 | **Signed before trust YES** (rule 13) | §5.13: "When the Owner answers Yes, one deposit request is prepared for each signed retainer whose deposit row is unpaid and has no request, as Ask me first, in the case lead's Needs you." | Done in the same transaction as the Owner's YES answer (#3033's `PUT answer`, which this part extends). The signed retainers come from the retainers module's read through a port (gap G3). B4 makes a repeat answer harmless. |
| R14 | **Amendment "On signing" row** (rule 14) | §5.14: "A signed amendment with an 'On signing' row … prepares a deposit request for that row, … one per amendment version." | Same path as R2: the amendment's own version id is the B4 key. |
| R15 | Billing stays separate | §5.9: "The deposit row is still billed by Bill this, and paid from trust (MS-D21(3)); billed equals agreed." | Nothing here writes an invoice. Ready to bill keeps the row. |
| R16 | **Audit and events** | §9: "Audit: prepared, sent (by whom or automatically), cancelled." | `trust.request_prepared`, `trust.request_amount_edited`, and `trust.request_cancelled` for Don't send, each in its own transaction, written before the event row (contracts §0.5). Sent comes from #3033. Actor: `system:signing-webhook`, the offline signer, or the Owner (R13). |

## Ports and gaps (B10)

| Need | On main | This part |
|---|---|---|
| **Needs you item** | `ports/notifications.ts` `NotificationPort.notify(tx, recipient, kind, item)` (PF-18np): one per person, item and kind, so a repeat never makes a second; group `NEEDS_YOU`. | Uses it. It adds one `NOTIFICATION_KIND` line `deposit-request-prepared` (group `NEEDS_YOU`) and one item kind `trust-request`, adding lines only, as the port's header requires. |
| **Who gets it** (the case lead, or the file owner before a case; every holder of `agent/payment:record`) | **Gap G1.** No port names a case's lead or lists the holders of a key. | **Recommended:** before a case exists, the retainer's `representativeStaffId` (in `signing.completed`; the signer for offline) as the file owner. With a case, a new `caseLead(firm, caseId)` on `MoneyVisibilityPort`, with fake and adapter on one contract test (the same shape as #3033's proposed `caseClient`). The holders of `agent/payment:record` see PREPARED requests in a list read (`GET …/money/trust/requests?state=PREPARED`), not by a notification each, until a key-holders port exists. Stated gap. |
| **Automatic messages row** (Send automatically · Ask me first · Off) | **Gap G2.** It does not exist on main. | One reader, `depositRequestMode(firm)`, answers `ASK_FIRST` for every firm until the AG-12-127 row adds the setting. Off and Send automatically, and B7's "even under Send automatically" case, are tested in that row. |
| **Signed retainers without a request** (R13) | **Gap G3.** No cross-module read. | A `signedUnrequested(firm)` method on a front-office port, with fake and adapter on one contract test. If the Lead prefers, R13 splits into a part b. |

## Acceptance test (`tests/journeys/j_60.ts` plus cases in `check_fo7t_trust.ts`); each case has a pass and a planted fail

Fixtures are Sample: a Sample firm in Ontario, deposit row CAD 1,000.00, Sample rate 13%.

1. With trust YES and a retainer whose first row is `ON_SIGNING` CAD 1,000.00, e-signed by every signer and the firm:
   - **one** PREPARED request is written for CAD 1,000.00 + CAD 130.00 estimated tax;
   - it has no `DR-` number;
   - one Needs you notification goes to the file owner;
   - **no invoice row** is written.
   (Planted fail: an invoice row written.)
2. **The same `signing.completed` delivered twice:** exactly one request with the same figures, one audit line and one notification. (Planted fail: the unique guard removed.)
3. Signed offline, then the e-signature completes: one request.
4. Trust `NO`; trust `UNANSWERED`: nothing is prepared, and the row shows in Ready to bill.
5. A first row that is not `ON_SIGNING`, or an amount that is null or 0: nothing is prepared.
6. A consultation agreement or an `OTHER` document signed: nothing is prepared.
7. A request made by staff and stored unsent by #3033 (empty details) never reads as PREPARED, never shows in the PREPARED list, and never counts for B4. (Planted fail: PREPARED read as `number IS NULL AND sent_at IS NULL`.)
8. Empty trust details: the request is PREPARED, and Send is refused with "Add your trust payment details". After the details are filled, Send takes `DR-0001` and its email has **no pay link** (B9).
9. Send, Edit amount and Don't send with `agent/payment:record` work, and without the key are refused. Firm B reads firm A's request as 404. A Case Officer outside C5 cannot see it.
10. Edit amount while PREPARED: the new figures are stored with a before-and-after audit line. After send, editing is refused.
11. Don't send with a reason gives CANCELLED with no number. A replay of the signing then writes nothing (B4).
12. `depositReceived`: false for a PREPARED request, true after a trust deposit to it, false for another firm.
13. A retainer signed while trust was `UNANSWERED`, then the Owner answers YES: one PREPARED request. Answering YES again writes none.
14. A signed amendment with an `ON_SIGNING` row of CAD 500.00: one PREPARED request keyed by the amendment's version.
15. A planted invoice-service call from the handler is caught: no `money_invoice` row exists after any case.

The pass counts of `check_fo7t_trust`, `check_fo7b_invoices`, `check_fo5_retainers`, `check_fo7a_money_schema`, `check_ports_events` and `j_59` stay unchanged.

## Open points for the Lead before "go"

* **O1 — schema; needs a migration and its stamp.** B6 means PREPARED can't be inferred from "no number, not sent".
  - **Recommended:** one migration on `money_trust_request`: `prepared_at timestamptz NULL` and `estimated_tax_minor integer NULL`.
  - A CHECK that `prepared_at` set means `retainer_version_id` is set and `estimated_tax_minor >= 0`.
  - PREPARED = `prepared_at` set, `sent_at` null and `cancelled_at` null.
  - Please give the stamp.
* **O2 — gaps G1 to G3:** accept the stated recommendations, or name the case side's port to use.
* **O3 — a retainer undone after signing.** Not in AG-6-61.
  - **Recommended:** a PREPARED request is cancelled in the same transaction with the reason "Retainer marked signed by mistake", and a sent one is left for a person.
  - That needs the retainers module to call this part. Otherwise it is a stated gap.
* **O4 — size.** With R12-R14 and the migration, this may pass 800 lines.
  - **Recommended:** split it in two. Part a: R1-R11, R16 and the migration. Part b: R12-R14.
  - The alternative is one PR with a P-row size exception.
* **O5 — the version key.** `signing.completed` carries `documentVersionId`; `retainer.signed_offline` carries the signed version. The build first checks that both map to the same retainer version id before relying on B4.
* **O6 — order.** This starts after #3033 merges. It is never built at the same time as FO-7t part 2 (both touch `trust/service.ts`), so it takes the `client-money/trust/` baton from whichever holds it.

Legal readings (trust, deposit as money held, no pay link in R1): Unconfirmed: no counsel. Tax figures and wording: Sample; Unconfirmed: no accountant.
