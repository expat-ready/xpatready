# FO-7s0 — trust: the Money tab, Pay from trust, Refund to client, To move, the trust question, the monthly check (groups e, f, h)

Part of the money concept; index in `concept.md`. Figures **Sample**; legal readings **Unconfirmed: no counsel**. Board: `design/trust.html`. Builds: FO-7s3a part 2 (f, requests, deposits), FO-7s3b (e, To move), FO-7m part 3 (h). The To move screen sits here, not in (a), because it only exists while trust shows.

**Two ways out of trust, and no third (P-603, DW3):** money leaves trust only by **Pay from trust** (to an issued invoice of the same payer) or **Refund to client**. No screen has Transfer, Withdraw, Move out, Adjust or Edit balance. To move records the firm's own bank step for money already applied; it moves nothing out of a client's balance. A reversal is a correction, not a way out: after it, trust stays at zero and any shortfall is an operating → trust line (P-607 (1)).

## (e) The person, company and case Money view
Paths `/money/parties/:kind/:id` and `/money/cases/:caseId` (FO-7s3b); the case page's "Money" link is the case side's change. Side panel pattern for the summary, full page for the ledger.
* **Summary per currency** (FO-7r part 2), one column per currency, **never a total across them**: Billed, Paid, Paid from trust (trust shows only), Credited, Written off, Refunded, **Owed**, Oldest overdue (days), Trust held (trust shows only), Credit and Unbilled ("Not tracked yet" while the read says `NOT_TRACKED`, never 0).
* **Trust section** (trust shows only): "Trust held: CAD 1,300.00 (2 cases, CAD 150.00 before a case)" (AG-6-60 r6); per case and before a case, per currency; balance per payer ("CAD 1,000.00 paid by Client B · CAD 500.00 paid by Pine Bakery", AG-6-60 r4; payer per entry is gap G8).
* **Ledger** (FO-7t `GET …/trust/ledger`): Date · Entry · Reference · Payer · Amount · Running balance; entry words **Received** (DEPOSIT), **Paid to INV-0002** (linked), **Refunded to client**, **Correction — Returned / Wrong account / Entry error**, **Moved to case** (once FO-7ts part 2 merges). The running balance is **never below CAD 0.00** (database rule); "Show more" paging. The rows sum to the balance shown (FO-7s3b DW3).
* **Actions** (one primary per panel): **Pay from trust…** on an issued invoice (also on the invoice detail), **Refund to client…**, **Send statement…** (`concept-payments.md` j). Trust shows with No and money held: these three and To move stay; New trust request and Record trust deposit are gone.

**Pay from trust…** (right panel, `agent/invoice:issue`; FO-7t `POST …/trust/applications`): "Available from Client B for this case: CAD 1,130.00 · Balance due: CAD 960.50"; Amount prefilled at the lower (AG-6-68 r3), may be lowered; uncleared money → "CAD 1,500.00 is a cheque not yet cleared. Apply anyway?" (r5); another case of the same client and currency only as a deliberate pick "Use CAD 500.00 held for Client B – PR?" (r4, FO-7s3b part 3; never another client, FO-7ts part 3); a disputed invoice → off with the reason (r6, when AG-6-77 exists). Refusal: **"Only CAD 130.00 is available."** (two decimals, one formatter). Success: "Paid from trust: CAD 960.50 · Balance due: CAD 0.00" and a To move line. The "available" figure needs a read (gap G6, FO-7q addition).
**On a draft and at issue:** the builder's summary shows "Pay CAD 960.50 from trust at issue"; the issue dialog's tick **"Pay CAD 960.50 from trust now"** is **ticked by default** at the lower of available and the total, same payer only, and may be unticked or lowered (AG-6-68 r2; rows rev 16.36). This replaces the backlog row's "off by default" (FO-7s3b gap 6); Build Lead C confirms in the approval.
**Refund to client…** (`agent/refund:create`; FO-7t `POST …/trust/refunds`): amount up to that payer's balance, reason (required), method, date, reference; payee = the payer, changing it keeps the reason required and says "Refunding to someone other than the payer". Never Card.

**To move** (`/money/to-move`, `agent/payment:record`; FO-7t part 3): grouped per currency, a total in each direction: "Trust → operating: CAD 1,130.00 · Operating → trust: CAD 1,500.00"; each line in words ("Move CAD 960.50 from trust to operating — INV-0002, Client B"; a shortfall "CAD 1,500.00 must move from operating to trust: reversal of R-0007"). Tick lines or "All in CAD", type **Bank transfer date**, **I moved these** → one batch per currency and direction; a refusal (409 `MOVE_REFUSED`) in the database's words; with two currencies ticked, the page says which batch was recorded. Past batches (gap G9) with **Undo this batch…** (reason required). Empty: "Nothing to move. Lines appear when trust pays an invoice or money reaches the wrong account."

## (f) The Owner's trust question (FO-7t `GET`/`PUT …/trust/answer`, Owner only)
* **Wording** (AG-6-59 r2, word for word): **"Do you hold client money in a trust account?"** **Yes · No**, and under it "Yes lets you take deposits before the work. No means you bill after the work." No regulator is named.
* **Where:** inline at the top of the Money area for the Owner while Unanswered; on Getting paid at any time (`concept-settings.md`); the Owner's one home item "Tell ExpatReady whether you hold client money in a trust account" (FO-7t part 4, raised when it matters, AG-6-59 r1).
* **Someone else acting** (a case officer setting a paid type to "When booking"): "Ask <Owner> to answer the trust question" with one click raising the Owner's item; the action waits (AG-6-59 r3). The Owner's name needs a staff lookup by role (gap G12); until then "Ask the Owner to answer the trust question".
* **Yes → No with money held:** never a block: "CAD 600.00 is held for 1 case. Trust screens stay visible until it is settled." (r6). "Last changed 16 Nov 2026 by <Owner>" under the answer (r8).
* These two lines are **the only trust words a firm with the answer Unanswered or No-with-nothing-held can see, and only the Owner sees them** (plus the "Ask…" line in the booking screen): the declared exception in the DW1 check.

## (h) The monthly check (`/money/monthly-check`, `agent/payment:record`; FO-7m part 2 routes)
One tab per currency the firm holds trust in. Two inputs: **Bank's trust balance** and **Statement date**; under "Advanced", **In transit** (default 0). The parts in AG-6-74's order, each with its source in words:

| Part | CAD (Sample, AG-6-74 worked figures) | Source shown |
|---|---|---|
| Case balances | 169.50 | "Total of every case's and pre-case trust balance on 30 Nov" |
| Waiting to move | 0.00 | "Open To move lines: trust → operating added, operating → trust taken away" |
| Fees not yet covered | 5.22 | "Card costs on trust not yet covered from your own funds" (0 in R1: no card into trust, P-567 (3)) |
| In transit | 0.00 | "Typed by you" |
| **Expected bank balance** | **164.28** | case balances + waiting − fees − in transit |
| **Difference** | **0.00** | typed − expected |

* A difference opens the note field and **Save** waits for it: "Add a short note about the difference" (Sample, FO-7m).
* **Shortfall list**: each open operating → trust shortfall line, e.g. "CAD 1,500.00 must move from operating to trust: reversal of R-0007". A case balance is never shown below zero (the database forbids it); the list replaces AG-6-74 r5's red negative case (P-607 (1)).
* **History**: every saved check (date, bank figure, expected, difference, note, who), newest first.

## Walk — replay at 1440 px, Owner of Maple, trust Unanswered at the start
1. Money (Owner) → the inline question → **Yes** → Trust, To move and Monthly check appear in the menu; "Last changed … by <Owner>".
2. Getting paid → trust details block "Maple Immigration trust account …" → Save.
3. Trust → **New trust request** → Client B, case Work permit, CAD 1,130.00 ("incl. estimated HST" from FO-7g) → **Send** → "DR-0001 sent".
4. DR-0001 → **Record trust deposit** → e-Transfer, ref 88213 → "R-0013 (trust receipt) · DR-0001 Paid"; case Money view "Trust held: CAD 1,130.00".
5. New invoice to Client B CAD 960.50 → issue dialog "Pay CAD 960.50 from trust now" ticked → **Issue** → "Paid from trust: CAD 960.50 · Balance due: CAD 0.00"; ledger running balance CAD 169.50.
6. To move → "Trust → operating: CAD 960.50" → tick → date 20 Nov 2026 → **I moved these** → list empty.
7. Monthly check → CAD → bank CAD 169.50, date 30 Nov 2026 → Expected CAD 169.50, Difference CAD 0.00 → **Save** → in history. Next capability's first step: Send statement (`concept-payments.md` walk step 4).
