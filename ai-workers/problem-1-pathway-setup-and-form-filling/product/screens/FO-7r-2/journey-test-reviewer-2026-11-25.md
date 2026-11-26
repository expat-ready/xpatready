# Journey test: FO-7r part 2 (statement PDF and Send statement API), reviewer, 25 Nov 2026

Head `9245f58089458dc2b66534f96116ee025620127e`. **API only (no screen in part 2; part 4 builds Money → Statements)**, so there was no browser walk.

The journeys were walked over HTTP and in the database through two runs, neither on :4400:
* the builder's check: a real Nest app on an ephemeral 127.0.0.1 port, with PF-4's guard, the firm walls, `fakeMail`, and fixtures through FO-7b's and FO-7t's routes;
* my probe: the same harness on a scratch database `xr_studio_rv_fo7r2_<pid>`, dropped after each run.

Neither touched the demo.

## Journeys (persona: the Owner / Billing and finance, staff; the client reads the email)
| # | Journey | Expected | Result |
|---|---|---|---|
| J1 | Download Client A's statement PDF, period Everything | a PDF with part 1's lines, balances, opening and closing; owed; "Held in trust for …" | Held (P1). Probe: 460 lines over 3 pages, all equal to the JSON in order |
| J2 | Send statement to Client A | one email, To the client, no Cc, text and PDF; one audit line | Held (P2): `{email: SENT, to, lines}` |
| J3 | Send a company's statement | To its primary contact | Held (P3) |
| J4 | Send to a client with no email (person; company with no contact) | 422 naming `to`, in words, nothing sent | Held: "… has no email address on file: add one first. Nothing was sent." |
| J5 | Wrong role / out of scope / other firm / no session | 403 / 404 / 404 / 401 | Held. Default Case Officer: PDF 200, send 403. Out of C5: 404 on both. Firm B: 404. No token: 401 |
| J6 | A large client: exactly 5,000 lines, then 5,002 | prints; then 422 "choose a shorter period" | PDF held (0.5 s with statistics). **Send of anything over about 1,420 lines fails on the app's mail path:** NOT_SENT with no reason (review Major 1) |
| J7 | A case's statement (`caseId`) | that case's lines and figures | **Failed (from the code):** the lines are the case's, but owed, credit and trust are the whole client's (review Major 3) |
| J8 | Recovery: double click Send | one email, or a clear second | Two emails, two audit lines (review Minor 3) |
| J9 | Failure: the audit write fails after sending | nothing sent, or sent and recorded | **500, email sent, no audit line** (review Major 2) |
| J10 | Bad input: `every=month`, `pageSize`, a bad `caseId`, to < from | 422 naming the field | Held |

## Break-it findings
* **Major:** the email body holds every line, and MessagePort refuses text over 100,000 characters (1,500 lines = 105,542). Hidden by `fakeMail`.
* **Major:** mail is sent before the audit write, in a separate transaction (send.ts:126 then :131).
* **Major:** a case statement prints the client's totals (send.ts:147, statement-document.ts:207–210).
* **Held under attack:** a name `Client (x) \ Sample) Tj (INJECT` and a reference `R) Tj (EVIL \\ (ref)` print literally (poppler `pdftotext`). Negatives print as "CAD -150.00" and "-0.05".
* **Minor:** an unknown `caseId` sends an empty "No entries." statement and audits it on that id.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | J1–J3 complete; J6 (Send over about 1,420 lines) and J7 (case statement) do not |
| Next step obvious | ½ | 422s say what to do ("add one first", "choose a shorter period"); NOT_SENT gives no reason (J6) |
| Plain words | 1 | lines in words ("Payment received", "Paid beyond the bill, waiting for your choice"), no codes; one missing colon ("Date") |
| Feedback and state | ½ | SENT / NOT_SENT and `lines`; a 500 after a sent email (J9); a cap-held email answers SENT |
| Correct data | ½ | JSON figures exact over 460 and 5,000 lines; the case statement is wrong (J7) |
| Error recovery | ½ | 422 before any send; but J9's 500 invites a retry that sends twice (J8) |
| Accessibility and screen sizes | ½ | no screen; the PDF is real text (poppler extracts every line), A4, wrapped at 95; untagged |
| Speed | 1 | 460-line PDF 2.1 s cold; 5,000 lines 0.5 s; refusal at 5,002 0.3 s (with statistics) |
| Visual quality | ½ | readable Courier page, but the columns are not aligned (two-space separators) |
| Trust and sources | 1 | letterhead, period, issue date; every figure from the ledger reads; wording file marked Sample; no AI |
| **Total** | **6.5 / 10** | **Below the pass bar (8)**, with no 0 |

**Fixes that raise the score, most valuable first:**
1. A short email body with the full statement in the PDF (task completed, next step, feedback).
2. `mailIn` and the audit line in one transaction (error recovery, feedback).
3. Case figures from `sum.cases` when `caseId` is set (correct data, task completed).
4. An optional idempotency key on Send (error recovery).
5. Aligned columns in the PDF rows (visual quality).

**Not tested:** a real screen reader or tagged-PDF reader; MessagesMail with a real channel (the cap is from ports/messages.ts and measured lengths); a real case (`runtime_case`); an intended user's unaided walk (D17 and D20 stay with the founder).

## Round 2 (head `bbeb2bd7e112bb743dfe07cd6077f46e848c72de`)
I walked J1–J10 again over HTTP, using the check (26/26) and my probe (scratch databases, dropped).
* **J6 now holds:** a 4,000-line statement and a 5,000-line statement are each SENT, with a cover note of about 310 characters and every line in the PDF.
* **J7 now holds:** a case's statement shows that case's figures and says "case C-… only"; another client's case, or an unknown one, gets 404.
* **J9 now holds:** if the audit line fails, the answer is 500 and nothing is sent. A refused or failed email answers NOT_SENT with no audit line; this was run through the real MessagesMail path with a stubbed message layer.
* **J8 is unchanged:** a double click still sends two emails (a stated limit).

| Criterion | R1 | R2 | Evidence |
|---|---|---|---|
| Task completed | ½ | 1 | J1–J7 complete |
| Next step obvious | ½ | ½ | NOT_SENT still gives no reason |
| Plain words | 1 | 1 | "Date:" fixed |
| Feedback and state | ½ | 1 | SENT / HELD / NOT_SENT; a 500 now means nothing was sent |
| Correct data | ½ | 1 | one snapshot; the case's figures only |
| Error recovery | ½ | ½ | J8 double send |
| Accessibility and screen sizes | ½ | ½ | unchanged (text PDF, untagged) |
| Speed | 1 | 1 | 460 lines 56 ms; 5,000 lines 203 ms |
| Visual quality | ½ | ½ | unchanged (columns not aligned) |
| Trust and sources | 1 | 1 | unchanged |
| **Total** | 6.5 | **8 / 10** | **Pass**, with no 0 |

## Round 3 (2026-11-26, head `6434d8e31accb76362c7e07f9170a823d0836461`)
I ran the check on an archived copy of the head (32/32), with my probes on scratch databases. All of them were dropped.
* **J11, new: the period is named on purpose.** This holds.
  * Everything: SENT.
  * Dates 2020-01-01 to 2020-01-31: SENT, and the PDF equals that period's download.
  * No period: 422 naming `period`, also for an unknown client.
  * Everything with a date: 422, "Everything takes no dates: choose Dates to send a from and to."
  * Dates with no dates: 422 naming `from`.
  * None of these sent anything or wrote an audit line.
* **J6 holds again only on fresh statistics.**
  * Fresh statistics: 4,000 lines are SENT, 5,000 lines print in about 200 ms.
  * Stale statistics, 2,500 invoices with one payment each (5,000 lines): the PDF and Send each answer 500 after 7.1–7.8 s, and nothing is sent.
  * Stale statistics, 4,000 lines: the PDF takes 4.97 s, then fails with 500 at 5.49 s.
* **Figures:** a dated period (22 lines with earlier history) matches part 1's JSON line by line, and the last balance equals the closing.

| Criterion | R2 | R3 | Evidence |
|---|---|---|---|
| Task completed | 1 | 1 | J1–J7 and J11 complete on normal clients |
| Next step obvious | ½ | ½ | NOT_SENT still gives no reason |
| Plain words | 1 | 1 | the period errors are in plain words |
| Feedback and state | 1 | 1 | SENT / HELD / NOT_SENT; a 500 sends nothing |
| Correct data | 1 | 1 | the dated-period probe matches; closing = Σ facts |
| Error recovery | ½ | ½ | J8 double send; a 500 gives no reason |
| Accessibility and screen sizes | ½ | ½ | unchanged |
| Speed | 1 | ½ | stale statistics: a statement within the limit fails with 500 at 5,000 lines (7.1–7.8 s) |
| Visual quality | ½ | ½ | unchanged |
| Trust and sources | 1 | 1 | unchanged |
| **Total** | 8 | **7.5 / 10** | **Below pass.** Fix review R3-1 (with R3-2's test) to bring speed back to 1 |
