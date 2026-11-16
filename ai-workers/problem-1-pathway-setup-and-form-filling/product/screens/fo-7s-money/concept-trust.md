# FO-7s0 · Trust: the Money tab, the Owner's trust question, Trust, To move, the monthly check, and every string per trust state (groups (e), (f), (h), and (a)'s Trust, To move)

Index and shared rules: `concept.md`. Board: `design/trust.html`. Builds: FO-7s3a part 2 (question, requests, deposits), FO-7s3b (Money tab, ledger, Pay from trust, Refund trust to client, To move), FO-7s5 (Send statement button), FO-7m part 3 (Monthly check). Fixed rules: **P-603** (only Pay from trust to an issued invoice and Refund trust to client take money out of trust), **P-607 (1)** (trust never below zero; a shortfall is an operating → trust To move line and one Owner item), **P-567 (3)** (no card and no pay link on anything that puts money into trust). Legal readings **Unconfirmed: no counsel**; figures **Sample**.

## 1. Trust states (AG-6-59 §6, rules 4-7; FO-7ts three-state answer)
| State | Code | Trust screens | What shows |
|---|---|---|---|
| **U** Unanswered | `UNANSWERED` | none | no trust word anywhere; the Owner alone sees the question (§3), the one exception |
| **Y** Yes | `YES` | all | everything in this file |
| **N0** No, nothing held | `NO`, every balance 0 and To move empty | none | as U, and Getting paid shows the answer "No" with "Last changed …" |
| **N$** No, money held | `NO`, a balance > 0 or an open To move line | only refund, Pay from trust, To move and Monthly check (rule 6) | the held banner; no Request payment, no Record trust deposit, no "Received into", no "Trust first" |

## 2. The Money tab (e): person, company and case (`/money/parties/:kind/:id`, `/money/cases/:caseId`; one "Money" link from the case page, the case side's one-line change)
* **Summary per currency** (FO-7r part 2; AG-6-28 r1): rows Billed · Paid · Paid from trust (Y, N$) · Credited · Written off · Refunded · **Owed** · Oldest overdue · Trust balance (Y, N$) · Credit · Unbilled; a USD and a CAD case give two columns, never a sum. `credit` and `unbilled` answer `NOT_TRACKED` → "Not tracked yet", never 0. Person and company add the line "Trust held: CAD 1,300.00 (2 cases, CAD 150.00 before a case)" (AG-6-60 r6).
* **Trust ledger** (Y, N$; FO-7t `GET trust/ledger`): columns Date · Entry · Reference (DR-, INV-, R-, refund) · Payer · Amount · Running balance (AG-6-60 r8), newest first, "Show more" by cursor. Entry words: `DEPOSIT` "Received" · `WITHDRAWAL_TO_INVOICE` "Paid to INV-0002" (linked) · `REFUND_TO_CLIENT` "Refunded to client" · `CORRECTION` "Correction: returned cheque" / "Correction: entry error" / "Correction: wrong account" · `MOVE_TO_CASE` "Moved from before the case" (once FO-7ts part 2 merges). Balance per payer under the table: "Client B CAD 1,000.00 · Pine Bakery CAD 500.00" (r4). **No red negative balance, ever** (P-607 (1)); the running balance column never shows "−".
* **Actions** (the only two ways out, P-603; FO-7s0 DW3): **Pay from trust** (opens the invoice picker of this holder's issued invoices with a balance, same payer, same currency) · **Refund trust to client**. Plus, not ways out: Send statement (`concept-payments.md` §5), Request payment and Record trust deposit (Y only). No Transfer, Withdraw, Move, Adjust or Edit action exists on any trust page.
* **Pay from trust** panel (FO-7s3b): "Pay up to CAD 169.50" — the lower of available and the balance due (AG-6-68 r3), prefilled; available and balance due shown; another case of the same payer as a separate, unticked pick (r4); uncleared money: "CAD 1,500.00 is a cheque not yet cleared. Apply anyway?" (r5); refusal "Only CAD 130.00 is available." always wins (r8). After: the invoice shows "Paid from trust: CAD 960.50 · Balance due: CAD 0.00" (r10). Another payer's money ("Use CAD 1,130.00 held for Client B?") is FO-7s3b part 3 only.
* **Refund trust to client** panel: amount (up to the payer's balance, shown), Reason (required), Method (no Card), Reference, Payee = the payer by default; another payee needs a reason "and says so" (AG-6-23 r3). Primary: **Refund CAD 600.00 to Client B**. Hidden without `agent/refund:create`.
* **Held banner** (N$, every trust page): "CAD 600.00 is held for 1 case. Trust screens stay visible until it is settled." (AG-6-59 r6).
* Empty ledger (Y): "Nothing held in trust for Client B yet. Deposits you record appear here." C5: a case the viewer cannot see gives the plain "not found" page, **never "CAD 0 held"**.

## 3. The Owner's trust question (f) (FO-7s3a part 2; built once as `trust/question.tsx`)
* **Words, exactly** (AG-6-59 r2): "Do you hold client money in a trust account?" [Yes] [No] and under it "Yes lets you take deposits before the work. No means you bill after the work." No regulator named.
* **Where:** inline at the top of the Money area for the Owner while Unanswered; on Getting paid at any time; FO-3 ("When booking") and FO-5 (a retainer with a deposit row signed) place it with one line; the Owner's home item "Tell ExpatReady whether you hold client money in a trust account" (AG-6-59 r3; PF-18np).
* **Who:** shown only when `GET /api/platform/me` lists the Owner role. A non-Owner sees nothing about trust while U; where an action needs the answer (FO-3's "When booking") the screen says "Ask the Owner to answer the question about client money" and one click raises the Owner's item — the requirement's sentence "Ask <Owner> to answer the trust question" carries the word "trust", so this concept uses the trust-free form for non-Owners in U (Q-C8; the Owner's name needs a staff lookup by role, gap G12).
* **After an answer:** "Last changed 19 Oct by Client C" (r8). Yes → the Trust, To move and Monthly check items appear. Yes → No with money held: the answer changes and the held banner shows (r6, a warning, never a block).

## 4. Trust page (a) (`/money/trust`, Y and N$): requests and deposits
* Requests list (FO-7q addition G4): `DR-0001` · Client B · CAD 1,130.00 incl. estimated HST · Sent / Part paid / Paid / Cancelled · "CAD 200.00 more than requested". Holder totals per currency: "Trust held: CAD 3,430.00 · USD 800.00".
* **Request payment** (Y only): party (won or prospect, AG-6-62), case (optional), amount, estimated tax line "CAD 1,130.00 incl. estimated HST" (FO-7g default, AG-6-4 r8). Empty trust details block → stored unsent with "Add your trust payment details" [Open Getting paid]. **No pay link and no card word** on a request (P-567 (3)).
* **Record trust deposit** (Y only): method (e-Transfer · Cheque · Wire · Bank transfer · Cash · Other; never Card, never Card terminal), amount, date, reference, optional evidence file (gap G5), optional request → shows its `TRUST` receipt `R-0002`; cheque "Not yet cleared".

## 5. To move (a) (`/money/to-move`, Y and N$; FO-7s3b part 2)
* Per currency, totals each way: "Trust → operating: CAD 1,130.00 · Operating → trust: CAD 5.22" (AG-6-73 r2). Lines: "Move CAD 960.50 from trust to operating — INV-0002, Client B" · "Move CAD 1,500.00 from operating to trust — reversal of R-0007, Client B" (FO-7v shortfall line, P-607 (1)).
* Tick lines (or "all" per currency), type the bank-transfer date (a date, no time) → **I moved these** → one batch per currency ticked; if one is refused, "The CAD batch was recorded; the USD batch was not: <the database's words>". Recorded batches list: date, direction, total, who, [Undo this batch] (reason required); an undone batch's lines return (r6).
* Help in place: "ExpatReady moves no money. Record here the transfers you made at your bank." (r3). Empty: "Nothing to move. Lines appear when trust pays an invoice or money lands in the wrong account."

## 6. Monthly check (h) (`/money/monthly-check`, Y and N$; FO-7m part 3)
* Per currency (a USD trust account types its own figure, AG-6-74 r1). Inputs: Statement date · Bank's trust balance · under Advanced, In transit (default 0, typed in R1, r7).
* The parts in AG-6-74's order, each with its source in words: Case balances CAD 169.50 ("every case's and pre-case trust balance at 30 Nov") · Waiting to move CAD 0.00 ("open To move lines, trust → operating added, operating → trust subtracted") · Fees not yet covered CAD 5.22 · In transit CAD 0.00 · **Expected bank balance CAD 164.28** · **Difference CAD 0.00**. The note field shows only when the difference is not 0; Save refuses without it: "Add a short note about the difference" (FO-7m, Sample).
* **Shortfalls** (P-607 (1) replaces AG-6-74 r5's negative case): each open reversal shortfall line is listed — "CAD 1,500.00 must move from operating to trust: reversal of R-0007" — and Waiting to move shows it subtracted, so a firm whose trust bank account is overdrawn by CAD 1,500.00 sees "Expected bank balance: CAD 1,500.00 overdrawn" and Difference CAD 0.00 (the bank figure is typed as overdrawn; no trust balance is shown below 0). **Case balances never show below 0**; a negative case balance would be listed as a guard "should never show".
* History: saved checks, newest first, readable; its CSV joins the period export once FO-7r part 3 is on `main`.

## 7. Every string per trust state (DW1; the list FO-7s3a's and FO-7s3b's text scans use)
**Trust words** (a string containing any of these must not render in U or N0): `trust` (any case) · `DR-` · `To move` · `Monthly check` · `Pay from trust` · `Received into` · `Trust first` · `deposit request` · `Request payment`. **The one exception:** the Owner's question, rows S1-S3, Owner only (FO-7s3a: "The one trust word allowed before Yes is the Owner's trust question itself").
Columns: shows = ●, absent = ·. Strings come from all five files.

| Id | Screen · string | U | Y | N0 | N$ |
|---|---|---|---|---|---|
| S1 | Money area / Getting paid (Owner): "Do you hold client money in a trust account?" | ● Owner | ● Owner | ● Owner | ● Owner |
| S2 | same: "Yes lets you take deposits before the work. No means you bill after the work." | ● Owner | ● Owner | ● Owner | ● Owner |
| S3 | Home item (Owner): "Tell ExpatReady whether you hold client money in a trust account" | ● Owner | · | · | · |
| S4 | FO-3 "When booking", non-Owner: "Ask the Owner to answer the question about client money" | ● | · | · | · |
| S5 | Menu: "Invoices", "Payments", "Exports", "Getting paid" | ● | ● | ● | ● |
| S6 | Menu: "Trust", "To move", "Monthly check" | · | ● | · | ● |
| S7 | Record payment: "Received into: Operating" / "Received into: Trust (Trust first)" | · | ● | · | · |
| S8 | Record payment extra: "The extra CAD 200.00 goes into Client B's trust balance." | · | ● | · | · |
| S9 | Record payment extra: "CAD 200.00 extra" + "Refund · Keep as credit" | ● | · | ● | ● |
| S10 | Builder and issue: "Pay CAD 960.50 from trust at issue" / "Pay CAD 960.50 from trust now" | · | ● | · | ● |
| S11 | Invoice detail: "Paid from trust: CAD 960.50 · Balance due: CAD 0.00", action "Pay from trust" | · | ● | · | ● |
| S12 | Money tab: "Trust balance", the trust ledger, "Trust held: …", balance per payer | · | ● | · | ● |
| S13 | Money tab actions: "Pay from trust", "Refund trust to client" | · | ● | · | ● |
| S14 | Held banner: "CAD 600.00 is held for 1 case. Trust screens stay visible until it is settled." | · | · | · | ● |
| S15 | Trust page: "Request payment", "Record trust deposit", "DR-0001", "incl. estimated HST" | · | ● | · | · |
| S16 | "Add your trust payment details" | · | ● | · | · |
| S17 | To move: "Trust → operating …", "I moved these", "Undo this batch" | · | ● | · | ● |
| S18 | Monthly check: parts, "Add a short note about the difference" | · | ● | · | ● |
| S19 | Getting paid: Trust details block, Interac e-Transfer email (trust) | · | ● | · | · |
| S20 | Getting paid Advanced: "Invoice payments go to: Operating account · Trust first" | · | ● Owner | · | · |
| S21 | Getting paid: "Last changed 19 Oct by Client C" under the answer | · | ● Owner | ● Owner | ● Owner |
| S22 | Statement preview: "Held in trust for your work permit: CAD 1,500.00", trust movements | · | ● | · | ● |
| S23 | Exports: "Trust ledger" file | · | ● | · | ● |
| S24 | Bill to search empty: "… Prospects are billed by a trust request once trust is on, or after they sign." | · | ● | · | · |
| S25 | Reverse preview: "undo CAD 960.50 paid from trust to INV-0002", "Trust after: CAD 0.00", the operating → trust line | · | ● | · | ● |
| S27 | Getting paid, non-Owner: "Client money is held in trust" (read-only) | · | ● | · | ● |
| S26 | Pay page: invoice summary, "Pay CAD 2,655.50 by card", "Online payment is temporarily unavailable" | ● | ● | ● | ● |

**The check the builder writes** (FO-7s0 DW1; one pass and one fail): read this table; for every row whose U or N0 cell is ●, the string must contain no trust word unless its id is S1, S2 or S3 (Owner only). Pass: the table as written. Fail: plant "Received into: Operating" with ● in U → the check names S7 and the word. The browser scans (FO-7s3a DW1, FO-7s3b DW8) then read every page, menu, dialog, aria-label, tooltip and title in U and N0 for the same words.

## 8. Business rules (pass and fail)
* **BR-T1 trust off is silent** (AG-6-59 r4-r5): pass, U as the Billing person → no trust word on any money page; fail, any hit. [FO-7s3a DW1]
* **BR-T2 Owner answers** (r3, §8): pass, the Owner answers Yes → Trust appears; fail, a non-Owner sees the question or a forced PUT changes anything (403 shown in words). [DW2]
* **BR-T3 two ways out** (P-603): pass, the action scan of every trust page finds only Pay from trust and Refund trust to client as money-out actions (I moved these records a bank step and moves nothing, AG-6-73 r3); fail, a seeded "Transfer" button fails the scan. [FO-7s3b DW2; FO-7s0 DW3]
* **BR-T4 never overspend** (AG-6-68 r7-r8): pass, two browsers apply CAD 1,000 from CAD 1,130; one sees "Only CAD 130.00 is available."; fail, both succeed. [DW1]
* **BR-T5 ledger adds up** (AG-6-60 r3): pass, entries sum to the balance shown; fail, any difference. [DW3]
* **BR-T6 never negative** (P-607 (1)): pass, a moved-then-reversed deposit shows balance 0.00 and the operating → trust line; fail, "−" in any balance. [FO-7s0 DW7]
* **BR-T7 one batch per currency** (AG-6-73 §12): pass, CAD and USD ticked → two batches; fail, one. [DW7]
* **BR-T8 held keeps screens** (r6): pass, N$ shows the banner and S13; fail, Request payment shows in N$. [DW8]
* **BR-T9 difference needs a note** (AG-6-74 r4): pass, difference 0 saves; fail, difference CAD 20 with no note → "Add a short note about the difference".

## 9. Contract (route under `/api/front-office/money/`)
| Element | Route | Key | Row | Refusal shown |
|---|---|---|---|---|
| Trust question, answer, "Last changed" | `GET trust/answer`, `PUT trust/answer` `{ answer }` | any staff; Owner checked by the service | FO-7t | 403 non-Owner in words; Yes → No answers 200 with the held amounts |
| Owner role for showing the question | `GET /api/platform/me` | any signed-in staff | PF-4 | — |
| Money summary | `GET parties/:kind/:id/money`, `GET cases/:id/money` | `agent/invoice:show` | FO-7r | 404 "not found" (C5) |
| Trust ledger, balances | `GET trust/ledger?party=&case=&currency=`, `GET trust/balances?party=` | `agent/invoice:show` | FO-7t | 404 with trust off and nothing held |
| Payer per ledger entry | **FO-7q addition (G13)** if FO-7t's ledger lacks it | `agent/invoice:show` | FO-7q | — |
| Pay from trust | `POST trust/applications`; available: **FO-7q addition** `GET invoices/:id/trust-available` → `{ currency, availableMinor, balanceDueMinor, unclearedMinor, otherCases }` | `agent/invoice:issue` | FO-7t, FO-7q | "Only CAD X is available." |
| Refund trust to client | `POST trust/refunds` `{ party, case?, currency, amountMinor, reason, method, reference, payee? }` | `agent/refund:create` | FO-7t, FO-7ts | 400 without reason; over balance refused |
| Request payment, cancel, read | `POST trust/requests`, `POST trust/requests/:id/cancel`, `GET trust/requests/:id`; list: **FO-7q addition (G4)** `GET trust/requests?party=&case=&status=&pageSize=&after=` | `agent/payment:record` | FO-7t, FO-7q | "Add your trust payment details"; 409 "Client B's retainer isn't signed. Request anyway?" |
| Estimated tax on a request | `GET tax-default` | `agent/invoice:create` | FO-7g | — |
| Record trust deposit | `POST trust/deposits` (idempotency key; `CARD` refused); evidence file: **question Q-C9** (no upload route named, gap G5) | `agent/payment:record` | FO-7t | duplicate reference warns |
| To move list, batch, undo | `GET trust/to-move`, `POST trust/to-move/batches`, `POST trust/to-move/batches/:id/undo`; batch list: **FO-7q addition (G14)** `GET trust/to-move/batches?currency=&pageSize=&after=` | `agent/payment:record` | FO-7t | 409 `MOVE_REFUSED` in its words; 400 two currencies |
| Monthly check parts, save, history | `GET monthly-check/parts?currency=&statementDate=`, `POST monthly-check`, `GET monthly-check/history` | `agent/payment:record` | FO-7m | 400 "Add a short note about the difference" |
| Shortfall line and Owner item | written by `POST payments/:id/reverse` (FO-7v part 3: `REVERSAL_SHORTFALL` line; `NOTIFICATION_KIND.TRUST_REVERSAL_SHORTFALL`); shown by `GET trust/to-move` | `agent/payment:record` | FO-7v, FO-7t | — |

## 10. Walks (1440 px)
**W-T1 trust from Yes to a clean monthly check** (the brief's walk). 1 Sign in as the Owner; trust U → Money area shows the question inline. 2 Yes → "Last changed 16 Nov by Client C"; menu gains Trust, To move, Monthly check. 3 Getting paid → Trust details block → fill and save. 4 Money → Trust → Request payment → Client B, CAD 1,130.00 → "DR-0001 sent to Client B". 5 Record trust deposit on DR-0001, e-Transfer, reference 88213 → `TRUST` receipt R-0002; DR-0001 Paid. 6 Money → Invoices → draft CAD 960.50 to Client B → the builder shows "Pay CAD 960.50 from trust at issue" ticked. 7 Issue → issue panel tick "Pay CAD 960.50 from trust now" → Issue INV-0002 → detail "Paid from trust: CAD 960.50 · Balance due: CAD 0.00"; status Paid. 8 Client B → Money tab → ledger: Received CAD 1,130.00 in · Paid to INV-0002 CAD 960.50 out · running balance CAD 169.50. 9 Money → To move → "Move CAD 960.50 from trust to operating — INV-0002, Client B" → tick → date 20 Nov → I moved these → batch listed. 10 Money → Monthly check → CAD, 30 Nov, bank 169.50 → Expected CAD 169.50, Difference CAD 0.00 → Save → in History. 11 Next step: Exports → Trust ledger (`concept-payments.md` W-P2 step 4).
**W-T2 a returned cheque after money moved.** 1 Payment R-0007 (cheque CAD 1,500.00 into trust, applied to INV-0005 and moved). 2 Reverse entry → Returned → preview ends "CAD 1,500.00 must move from operating to trust: reversal of R-0007" and "Trust after: CAD 0.00" → Confirm. 3 Money tab: balance 0.00, no "−". 4 To move: the operating → trust line. 5 Monthly check: bank "CAD 1,500.00 overdrawn" → Expected "CAD 1,500.00 overdrawn", Difference CAD 0.00. 6 Next step: I moved these on that line once the firm transfers.
**W-T3 Yes → No while held.** 1 Owner, Getting paid → No → the held banner; menu keeps Trust (refund, Pay from trust only), To move, Monthly check; Trust page shows no Request payment. 2 Refund trust to client CAD 600.00 → balance 0 → after the last line clears, the trust menu items disappear (N0).
