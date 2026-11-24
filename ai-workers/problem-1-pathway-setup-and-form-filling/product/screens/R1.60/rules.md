# R1.60 — Step 1: the rules (before code)

Lane: runtime. Status: **rules only; no code, no migration until the Lead types "go"** (Lead 19, 24 Nov 08:47 IST).

**Ruling (Lead 19, 24 Nov 08:47 IST; P-797, P-628; recorded for the founder's review):** the newest requirement wins. AG-6-61 / MS-D6 apply: signing prepares one **trust deposit request**, "Ask me first" by default, and never a draft invoice. With no trust, trust unanswered or the row Off, nothing is prepared and the row stays in Ready to bill. The build waits for #3033's `DR-` routes to land and for Lead B 5's confirmation.

**Source:** team requirement `domain/requirements-2026-11-02/02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md`, AG-6-61 "Deposit request" (decisions MS-D6, MS-D20(2)(8)(9)(11), MS-D21(3)(4), AG05-D1(5), AG05-D2(4)), read 24 Nov. R1.60's old Done when ("one draft deposit invoice") is replaced by this ruling.

## The rules

Each rule has its AG-6-61 quote, then how it applies here.

| # | Rule | AG-6-61 quote | Here |
|---|---|---|---|
| R1 | **Not an invoice** | §13: "No deposit invoice." §2: "MS-D6 replaces the automatic deposit invoice at signing: a deposit is money to hold, not an earned fee." | No `money_invoice` row is written on signing. The deposit is a `money_trust_request` (`DR-` on send). |
| R2 | **Trigger** | §5.1: "A retainer becomes signed: e-signed by every client signer with the firm's signature … or signed offline. Only a retainer or its amendment starts it." | `signing.completed` with `documentKind: RETAINER` (sent only once every signer has signed, AG05-D2(4)), and `retainer.signed_offline`. `CONSULTATION` and `OTHER` documents prepare nothing. |
| R3 | **Conditions** | §5.2: "Trust answer is Yes (AG-6-59) and the signed retainer has a deposit row (its first schedule row) above zero. Otherwise nothing is prepared, and the deposit row is billed later by Bill this." | Trust answer `YES` and the first fee row is `ON_SIGNING` with an amount above 0. If the answer is `NO` or `UNANSWERED`, the amount is null or 0, or there is no `ON_SIGNING` row: nothing is written. |
| R4 | **Amount source** | §5.3: "Amount = the deposit row + estimated tax (MS-D21(4)): *Example:* row 1,000, Ontario → 'CAD 1,130 incl. estimated HST'. Currency = the case's (or prospect's)." | The amount comes from the signed version's own fee row (the event's `fees[]`, never re-read from an editable draft). Estimated tax is the GST/HST rate of the Bill to's province (P-701: GST/HST only), rounded once by FO-7b's stated rule (R1.59). It is stored apart from the row amount. The currency is the retainer's. |
| R5 | **Holder and addressee** | §5.3: "Holder = the case, or the person or company if no case exists yet (moves later, AG-6-60). Addressed to the case's Bill to, or the retainer's client before a case exists." | `caseId` if the won prospect has a case at that moment, else `personId` / `companyId`. |
| R6 | **Never sent by itself (default)** | §5.4: "three choices: Send automatically · Ask me first (default) · Off." "Ask me first: one item in the Needs you of the case lead … 'Send Client B's deposit request (CAD 1,130)? [Send] [Edit amount] [Don't send]'." §10: "Ask me first by default (AG16-76)." | Prepared means written with no number and `sentAt` null. Sending is a person's click through #3033's send route, which takes the `DR-` number then (§5.5). Off: nothing is prepared (R3). **Send automatically is not in this row** (see open point O2). |
| R7 | **Trust details missing** | §5.6: "if the trust details block is empty, the request waits in the Needs you item with 'Add your trust payment details', even under Send automatically." | This reuses #3033's hold: an empty trust details block holds the request. |
| R8 | **Idempotent: one per retainer version** | §5.7: "One per retainer version (MS-D20(9)). A retainer signed offline ends the open signing link (AG-05), so a later e-signature never prepares a second request." §9: "idempotent on `retainerVersionId`." | This uses the partial unique index on `money_trust_request.retainer_version_id` that is already on main (a cancelled request keeps it). A `signing.completed` delivered twice, or a paper sign then an e-sign, writes one row. The second delivery is a no-op, not an error. |
| R9 | **Who may see and act** | §8: "Send, edit, cancel: `agent/payment:record` (a deposit request is a trust request, MS-D21(11)). … The item shows to the case lead and to every holder of `agent/payment:record`; any holder may send it." | The case lead (or the file owner before a case exists, MS-D20(8)) and holders of `agent/payment:record` see it, through `MoneyVisibilityPort` (C5, fail closed) as in #3033's request read. Another firm gets 404. A client sees nothing until it is sent. |
| R10 | **Cancelled request** | §5.11: "An unpaid request may be cancelled by a person with a reason; it keeps its number and shows 'Cancelled'." §6: "`PREPARED \| SENT \| PART_PAID` → `CANCELLED` (with reason; a part-paid request keeps its money in trust)." | This uses #3033's `POST requests/:id/cancel`. A cancelled request still holds its retainer version (R8), so a later replay of the same signing prepares nothing. |
| R11 | **Cancelled or voided retainer** | Not in AG-6-61 (not known). §5.12 only says AG-06 answers "money received on this retainer's deposit request?" so AG-05 can allow or refuse "Marked signed by mistake". | A retainer voided before it is signed never fires R2. For one undone after signing ("Marked signed by mistake"), whether the prepared request is cancelled by itself is **not known**: see open point O3. |
| R12 | **Billing stays separate** | §5.9: "The deposit row is still billed by Bill this, and paid from trust (MS-D21(3)); billed equals agreed." | Nothing here writes an invoice. Ready to bill keeps the row. |
| R13 | **Audit and events** | §9: "Audit: prepared, sent (by whom or automatically), cancelled." | There is one audit line `trust.request_prepared` (actor `system:signing-webhook` or the offline signer) in the signing transaction, written before the event row as in contracts §0.5. Sent and cancelled come from #3033. |

## Acceptance test (`tests/journeys/j_60.ts` plus the cases in `check_fo7t_trust.ts`); each case has a pass and a planted fail

Fixtures are Sample: a Sample firm in Ontario, deposit row CAD 1,000.00, Sample rate 13%.

1. With trust Yes and a retainer whose first row is `ON_SIGNING` CAD 1,000.00, e-signed by every signer: **one** prepared request is written for CAD 1,000.00 + estimated tax CAD 130.00 (CAD 1,130.00). It has no number and `sentAt` null, it shows in the case lead's Needs you, and **no invoice row** is written. (Planted fail: an invoice row written.)
2. **The same `signing.completed` delivered twice:** still exactly one request, with the same figures. The second delivery returns quietly and writes no second audit line. (Planted fail: the unique guard removed, so two rows appear.)
3. Signed offline, then the e-signature completes: one request. (§11 case 2.)
4. Trust `NO`: nothing is prepared, and the row shows in Ready to bill. (§11 failure case.)
5. Trust `UNANSWERED`: nothing is prepared. (The later preparation when the Owner answers Yes, §5.13, is out of this row: O4.)
6. A first row that is not `ON_SIGNING`, or one with a null or 0 amount: nothing is prepared.
7. A consultation agreement or an `OTHER` document signed: nothing is prepared.
8. The trust details block is empty: the request is prepared and held with "Add your trust payment details". Sending it is refused until the block is filled.
9. Send by a holder of `agent/payment:record`: it takes `DR-0001` and its email goes out once. Without the key, the send is refused. Firm B reads firm A's request as 404.
10. The request is cancelled with a reason, then the signing is replayed: nothing new is written, and the cancelled request keeps its number and reason.
11. A planted invoice-service call from the handler is caught: no `money_invoice` row exists after any case above.

The pass counts of `check_fo7t_trust`, `check_fo7b_invoices`, `check_fo5_retainers`, `check_fo7a_money_schema` and `j_59` stay unchanged.

## Open points for the Lead before "go"

* **O1 — schema.** On main, `money_trust_request` has `retainer_version_id` (unique) but none of these from AG-6-61 §7: `kind`, `estimatedTaxMinor`, a `PREPARED` state, or an amount "incl. estimated tax" split.
  - **Recommended:** prepared = `number` null and `sentAt` null (no new column), and the estimated tax goes in a new column `estimated_tax_minor`.
  - The column **needs a migration**: please give a stamp, or rule that the tax is stored in `amountMinor` with the split shown in the audit line only (no migration).
* **O2 — the Automatic messages row** (Send automatically · Ask me first · Off) does not exist on main.
  - **Recommended:** this row builds Ask me first only, the safe default. The setting and Send automatically are their own row with AG-12-127.
* **O3 — a retainer undone after signing** (R11).
  - **Recommended:** an unsent prepared request is cancelled in the same transaction with the reason "Retainer marked signed by mistake", and a sent one is left for a person.
  - Not known from the requirement: Lead B's call.
* **O4 — §5.13** (signed while trust was unanswered, prepared when the Owner answers Yes) and **§5.14** (an amendment's "On signing" row): proposed as a follow-up part, not this PR.
* **O5 — the version key.** `signing.completed` carries `documentVersionId`; `retainer.signed_offline` carries the signed version. The build confirms both map to the same retainer version id before relying on R8.
* **O6 — order.** This waits for #3033 (`DR-` routes, send, cancel, hold) and Lead B 5's confirmation. It touches `api/src/client-money/trust/`, which #3033 holds while it is open.

Legal readings (trust, deposit as money held): Unconfirmed: no counsel. Tax figures and wording: Sample; Unconfirmed: no accountant.
