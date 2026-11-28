# Journey test: FO-7r part 1 (summary and statement API), reviewer, 25 Nov 2026

Head `432fba2023523f8952f0aa7c85684ebd5e252426`. **API only (no screen in part 1)**, so there was no browser walk.

The journeys were walked over HTTP and in the database through two runs, neither on :4400:
* the builder's check: a real Nest app on an ephemeral 127.0.0.1 port, PF-4's guard and the firm walls, with fixtures written through FO-7b's and FO-7t's routes;
* my probe: a scratch database with SQL-written facts, read through `MoneyStatement` and `MoneySummary`.

Neither touched the demo.

## Journeys (persona: the Owner / Billing, staff; the client reads the statement in part 2)
| # | Journey | Expected | Result |
|---|---|---|---|
| J1 | Client A's money summary | CAD and USD rows apart; owed = the invoice list's due | Held: CAD owed 2,255.50 = list due; USD 3,000.00 separate |
| J2 | Statement, Everything | each line's balance = the previous + its amount; closing = Σ FACTS | Held (check S1). The probe agrees on all 10 kinds: closing 20.00 = FACTS 20.00 |
| J3 | A period (11–13 Feb) | opening + lines = closing | Held: 550.00 → 100.00 over 4 INVOICES lines; TRUST 800.00 → 400.00 |
| J4 | Walk pages | the same lines as one page | Held: pages of 2 = one page of 200 |
| J5 | Empty period | no lines, opening = closing | Held |
| J6 | Wrong role / no session | 403 / 401 | Held: a Case Officer without `agent/invoice:show` gets 403; no token gets 401 |
| J7 | Another firm's client, an unknown id, a bad kind, an empty scope | 404 | Held |
| J8 | Bad input: to < from, 30 Feb, pageSize 500, a forged cursor | 422 naming the field | Held |
| J9 | Large client (break) | page 1 within 300 ms | **Failed at scale.** 10,000 invoices with about 1,200 credit entries in the firm: 3,043 ms. 20,000 / 5,000: over 5 s, then an error answer (review Major 1) |
| J10 | Hand-off to part 2 (PDF and Send) | the statement carries everything the PDF needs | Partly: no "Held in trust for <case>" figure in the statement (it is in the summary; review Minor 4) |

## Break-it findings
* **Major:** the CREDIT_APPLIED and REVERSED branches' OR join multiplies the client's invoices by every credit entry in the firm (statement.ts:69, :72).
* **Minor:** a same-day backdated cheque shows before its invoice, with a balance of −450.00.
* **Minor:** credit applied to a draft lands in the period before the invoice is issued: the February closing is −30.00.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1–J3: every AG-6-28 r1 figure is answered and right |
| Next step obvious | ½ | `next` cursor and period are echoed; kinds are codes until the part 4 screen; no per-case trust words (J10) |
| Plain words | ½ | 422 details in words ("to is before from."); line kinds are machine codes |
| Feedback and state | 1 | 401/403/404/422 each as expected |
| Correct data | ½ | closing and owed are exact (probe); order and period are off in Minors 1–2 |
| Error recovery | 1 | bad cursor and page size refused early, in words |
| Accessibility and screen sizes | 1 | N/A: no screen (counted as met, not tested) |
| Speed | ½ | 62–196 ms for normal clients; 3 s and a timeout at scale (J9) |
| Visual quality | 1 | N/A: no screen (counted as met, not tested) |
| Trust and sources | 1 | no AI; `unbilled: null`, never a guessed zero; the UTC day is labelled Sample |
| **Total** | **8 / 10** | Pass, with no 0. Two criteria are N/A and counted as met |

**Fixes that raise the score, most valuable first:**
1. Split the OR joins (speed, and stability under load).
2. Order and date facts by `greatest(fact, issue)` (correct data).
3. Per-case trust figure in the statement (next step).

**Not tested:** a real screen reader; any browser or screen size (no screen); an intended user's unaided walk (D17 and D20 stay with the founder).
