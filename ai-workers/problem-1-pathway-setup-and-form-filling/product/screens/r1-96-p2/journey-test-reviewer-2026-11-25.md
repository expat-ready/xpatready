# Journey test: R1.96 part 2, payment plans (API) · reviewer · 25 Nov 2026

Head `ceb41501ff15aa3eb08bf3251ba184cbe87b705e`. This part has no screen; FO-7s4p's plan dialog comes later. So the journeys are
walked through the API that dialog will call: `tests/check_r196_plans.ts` (run as written, 22/22 PASS, 11 s), plus two break-it
scripts of my own. They ran on a worktree of the exact head with its own scratch DBs on 127.0.0.1:54329, scratchpad only, never
:4400, US$0. Browser, axe, widths and keyboard: N/A.

## Journeys (persona · goal · expected)
1. Owner · "the client owes 900.00 after a 100.00 payment; split it into three" · 201, plan 900.00, Due ×3, one audit line. **Held.**
2. Owner · instalments 1 cent short or over · 409 SUM_MISMATCH naming "add/remove CAD 0.01", nothing written. **Held.**
3. Owner · 1 or 13 instalments, the same date twice, a past date, 450.5 cents, 30 February · 422 each, nothing written. **Held.**
4. Owner · a second plan; a draft; a paid invoice; two tabs creating at once · 409 PLAN_EXISTS / DRAFT / NOTHING_DUE; one 201. **Held.**
5. Case Officer without `agent/invoice:issue`; no session; firm B; an officer with the keys who does not see the client · 403 / 401 /
   404 / 404 on make, read and cancel. **Held** (the last one only in my probe A1; the check has no such case).
6. Owner · client pays 300.00, then 150.00 · GET: Settled, Part settled 150.00, Due. **Held.** Overpaid → both Settled, capped. **Held.**
7. Owner · cancel with a reason, then make a new plan for what is left · 200 CANCELLED with who and why, payments untouched; the
   new plan covers 450.00. **Held.**
8. Owner · cancel with a reason pasted from another tool, which holds a broken character or a NUL · 422 on `reason`. **Failed: 500**
   "Internal server error", plan stays ACTIVE.
9. Owner · a 300.00 credit note on the plan, nothing paid · the plan shows what is still owed. **Held, with a question:**
   instalment 1 reads "Settled" (credit counts as settlement; the shape says "payments in order").
10. Owner · the 100.00 paid before the plan is refunded · the plan shows what is due. **Partly:** due is 1,000.00, the plan covers
   900.00, and GET gives no due or uncovered figure.

## Data underneath
For journeys 1-7: one `money_payment_plan` per plan, with its amount equal to `money_invoice_due` at the time, `created_by staff:<id>`.
Instalments are positions 1..n, amounts and dates exactly as sent. `audit_event` holds `invoice.plan_created` (amount, count) and
`invoice.plan_cancelled` (reason). After cancel, `money_payment` reads `count:sum` exactly as before. `ledgerCheck` is balanced
after every step, firm-wide for A, and firm B has 0 plans. Roles are enforced on the server (403/404 before any write).

## Break it
* The SQL tricks as `xr_app` all failed: `SET CONSTRAINTS ALL IMMEDIATE`, a late insert, a cancel-then-insert, a second ACTIVE plan,
  a USD instalment, positions 1 and 3, falling dates, firm B rows, `DISABLE TRIGGER` and the replica role.
* Races, all clean: plan against payment ×6 and plan against credit note ×4 → 201+201 or 409 SUM_MISMATCH+201, always balanced.
  Two cancels at once → 200 + 409, one audit line.
* Reason `"Small \ud800 balance"` or one with a NUL → **500**. Major.
* Reason with a newline or tab → 422, but with the "hidden or direction-changing characters" text. A zero-width space is stored. Minor.
* A cancelled plan's instalments still read Due/Overdue. Past-dated instalments are accepted by SQL (API-only rule). Minor.
* French and Chinese reason → 200, stored whole. 201 characters → 422. Blank → 422.

## Score (each 0, ½, 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | journeys 1-7 complete end to end through the routes |
| Next step obvious | 1 | refusals name the way on: "cancel it first", "issue it first", "add CAD 0.01" |
| Plain words | ½ | refusals plain; newline gets the wrong text; "Settled" for credited money is ambiguous (journey 9) |
| Feedback and state | ½ | 201/200 return the plan; a cancelled plan still says Due/Overdue; no due or uncovered figure (journey 10) |
| Correct data | 1 | rows, amounts, dates and audit lines exact; payments untouched by cancel; balanced throughout |
| Error recovery | ½ | every refusal rolls back; a lone surrogate or NUL reason is a 500 (journey 8) |
| Accessibility and screen sizes | N/A | no screen in this part |
| Speed | 1 | GET 19 ms average, POST 41 ms; the whole check with app boot and every migration in 11 s |
| Visual quality | N/A | no screen in this part |
| Trust and sources | 1 | 12 marked Sample and cited to FO-7p; audit names who and why; no AI |

**6.5 of 8 applicable = 8.1, recorded as 8.0 / 10 (rounded down to the half point). Pass** (8 or more, no criterion at 0).

## Fixes that raise it, most valuable first
1. Use `words("The reason", 200)` for the cancel reason → error recovery, plain words (review issue 1).
2. Make a cancelled plan's instalments read as cancelled, not Due or Overdue, and add `dueMinor` to the view → feedback and state.
3. Get the tech lead's ruling on whether "Settled" includes credit and write-off, and match the words → plain words.

## Not tested
A real screen reader and an intended user's unaided walk (no screen; D17/D20 stay with the founder). A card webhook payment racing
a plan (no Stripe in scope).
