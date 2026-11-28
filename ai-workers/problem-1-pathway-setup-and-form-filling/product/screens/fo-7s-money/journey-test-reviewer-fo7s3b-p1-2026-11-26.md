# Journey test: FO-7s3b part 1a (Money › Trust, a client's Money view), reviewer role, 26 Nov 2026

Commit `a66e6a13a12487ac0e8db6fe283ed92a44cf7ec1`. Isolated copy `rv3b` on :4761 (never :4400), Sample firm (trust Yes after the suite) and the solo firm (trust not answered), live AI off, US$0.
* **How:** walked headless with Playwright at 1440 px, plus 1024 px and 200 % zoom (720 CSS px at DPR 2), as the Billing person (user-T), the Case Officer (user-O) and the solo Owner (user-S).
* **What I used:** only what a person sees. The data underneath was read with `psql` and the API.
* **Scripts and screenshots:** kept in the session scratchpad, not committed.
* **The builder's suite:** 21/21 twice.

## Journeys (persona · goal · result)
1. **Main: Billing person, "which clients are short in trust?"**
   * Money → Trust appeared in the menu after 458 ms. The page opened in 100 ms.
   * Two rows read "−CAD 200.00", red, "Trust shortfall after a reversal", with the concept's words and "Unconfirmed: no counsel".
   * Clicking a client opened its Money view in 139 ms:
     * the summary shows Trust held −CAD 200.00, red and labelled;
     * a red notice;
     * the ledger reads Received 200.00, then Refunded to client 200.00 out (CAD 0.00), then Correction 200.00 out, at −CAD 200.00 red and labelled.
   * Reload and Back both hold. **Held.**
2. **Alternate: find a client.**
   * Typing "Zoë-Ñú" found the won client with the long, accented name, which wraps cleanly. Opening it showed CAD 525.18 and USD 92.52 apart, matching the database (52518 and 9252).
   * Show more took the ledger from 50 rows to 60 in 80 ms.
   * **Held.** Two flaws: the search sends one request per keystroke (m7), and focus drops to the page after the last Show more (m5).
3. **Empty.**
   * "ClientB" (not a won client) gives "No client you can see matches “ClientB”."
   * The empty shortfall and ledger texts are in the code, but I did not reach them on this copy: every firm with trust on held a shortfall.
   * **Held** for the finder.
4. **Error and bad addresses.** Each of these gives one plain "Client not found" with no figure:
   * an unknown kind, `not-a-uuid` and an unknown UUID;
   * another firm's person, a person asked for as `company`, and an upper-case kind.
   * **Held.**
5. **Wrong role and C5.**
   * With sees-all off, the shortfall API gives the Case Officer 0 rows and the Billing person their own 2.
   * The suite's DW9: Client H out of view gives "Client not found".
   * Every seeded role holds `agent/invoice:show`, so I could not reach the page's own "You don't have access" state.
   * **Held.**
6. **Trust off: the solo Owner.**
   * The menu reads Invoices · Payments.
   * `/money/trust` reads "Not available · This page is not available for your firm.", with no trust word.
   * Each Money page logs one 404 in the console, from the probe (G15, noted).
   * **Held.**
7. **Break it: money in two places, one below zero.**
   * Through the real routes: CAD 500.00 on a case, then a pre-case cheque of 200.00, refunded, then reversed.
   * The page reads "Trust held: CAD 300.00 (1 case, **−CAD 200.00** before a case)", neither red nor labelled, with no notice. **Failed: review M1 (BR-3).**
8. **Sizes and keyboard.**
   * No sideways page scroll at 375, 1024 and 200 %.
   * axe found 0 issues of any impact on both pages at 1440.
   * Tab reaches the menu, the shortfall links and the finder, each with a visible ring.
   * At 375 px the ledger's Balance column needs a sideways scroll inside the table (m6).
   * **Held.**
9. **Across the boundary.** "Back to invoices" from not found. The links to the invoice, the case and the client's own page wait on the named gaps and on the case side. **As declared.**

## Data underneath
* The newest running balance per currency equals the database's sum (suite DW3, and mine for the 60-entry client).
* "Trust held" equals the summary's total. The pages write nothing, and every key is checked by the server.
* The ledger's Payer is the client's own name on every row (`trust/reads.ts:69`; G8 is still open). A refund's reference shows "—" (m9).

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | journey 1 end to end: shortfall list, then the client, then the red ledger balance (`j1-trust-1440`, `j1-party-R-1440`) |
| Next step obvious | 1 | each shortfall row links to its client; a finder for any other client; no dead ends |
| Plain words | ½ | the concept's words, but no tooltips, and "Refunded CAD 0.00" sits beside "Refunded to client" (m2) |
| Feedback and state | 1 | skeletons, not available, not found, empty texts |
| Correct data | ½ | every figure is the server's, but a negative part shows bare in the held line (M1) |
| Error recovery | 1 | bad addresses go to not found with a way back; reload and Back hold |
| Accessibility and sizes | ½ | axe 0; keyboard path; but focus loss (m5) and the hidden Balance at 375 (m6) |
| Speed | 1 | 100 ms, 139 ms, 80 ms; no request per row |
| Visual quality | 1 | team frame and tokens; clean at 1024 and 200 % (`j5-party-R-1024`) |
| Trust and sources | ½ | no AI, and legal readings marked; but the Payer column states the client for every entry while G8 is open, and the refund reference is missing |

**8 / 10: pass (8 or more and no 0).** The verdict is still Block, because M1 is open. Fixes that would raise the score, most valuable first:
1. Label or leave out every negative part of "Trust held" (M1).
2. Add tooltips to the summary figures (m2).
3. Keep focus after Show more, and keep Balance visible at 375 (m5, m6).
4. Name G8 and the refund reference in the PR body (m9).

## Not tested
* A real screen reader, a headed browser, and an intended user's unaided walk (D17 and D20 stay with the founder).
* Trust "No with money held".
* The page's own 403 state (no seeded role lacks the key).
* The uncommitted edits found in the shared checkout after this run.
