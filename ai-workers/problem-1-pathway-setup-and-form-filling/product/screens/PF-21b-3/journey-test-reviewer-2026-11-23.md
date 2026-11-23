# PF-21b part 3: journey test, reviewer (23 Nov 2026)

Head **1b9733fd136dd842d024b92698db334aca9faf1d**. This row has no screen (PF-21rs builds the console pages), so the journeys were walked on the API the way a console screen will call it.
- Route: the row's suite `tests/check_pf21b_requests.ts`. It builds the Nest app on a random local port, with PF-4s's and PF-4's real guards, local identities, the walled `xr_app` pool and a fake clock, and calls it over HTTP. I ran it on a scratch database on :54329 (27/27). I did not start a separate isolated copy; :4400 was never used.
- I also used the breaker's probes on the same head (`break-report.md`) for the break-it pass, and read the code for each result.
- People: a Sample Platform Owner, Support, Admin and Auditor (`plat_system_staff`), and the Sample firm's user-R.

## Journeys (persona · goal · result)
1. **Main path.** Platform Owner: "Log this access request and work it to a response." POST → 201 PENDING, target = received + 30 days, `recordedBy staff:<id>`. In progress with a note → 200. Completed with the actions taken → 200 with `completedOn`. GET :id lists RECEIVED and STATUS_CHANGED ×2. Each change writes one ALLOWED line. **Held.**
2. **Alternate.** "A deletion request about one of the firm's people." It is logged with a firm and person → 201 with the link. **Partly:** the link is not checked, and a random person id is accepted (review m2).
3. **Late request.** "Log a correction received 40 days ago." → 201, it reads OVERDUE at once, with one alert. Two more daily runs raise nothing more. **Held.**
4. **The clock walks.** On day 20 nothing happens. On day 26 one near-date alert, not twice. On day 31 OVERDUE with one overdue alert. Held and completed requests are never alerted. **Held.**
5. **Errors.** An unknown type, a bad email, a blank name, a future date, a firm without its person, a direction mark, an unknown field → 422 with the field, nothing saved. Completed without the actions taken → 422. A completed request moved → 409 "nothing was changed". Overdue by hand → 422. An unknown id → 404. **Held.**
6. **Wrong role.** A firm token gets 403 FIRM_SESSION_REFUSED; Support, Admin and Auditor get 403; nothing is written. A firm database session is refused by the definers. **Held.**
7. **Recovery (alerts down, retry).** "It said it failed, so I submit again." A late request is logged while the alert cannot be raised → 500, but the row is saved. The retry saves a second row, and the register never deletes it (review M2, breaker M1). **Not held.**
8. **Two tabs.** Parallel moves of one request give exactly one 200 and one step (breaker). Parallel identical logs give separate rows (no idempotency). **Partly.**
9. **Across the boundary (to the daily job and PF-23).** The feature registers its handler and its 07:20 Toronto schedule on PF-14's runner. The alerts go through AlertPort with ids only. A failing sweep leaves no log line (review M3). **Partly.**

## Data underneath
- One row per log, with the values exactly as sent (the email is lower-cased and trimmed). Steps are insert-only. The facts are fixed by the database.
- One `plat_system_audit` line per call: ALLOWED inside the change's transaction, REFUSED after a rollback.
- The seed gives `system/compliance:dsr-manage` to `platform-owner` only (Sample).
- The actions taken can be overwritten on an open request with no record of the earlier text (review m1).

## Break-it (from the breaker's run, checked against the code)
Duplicates after a 500 (M2). Bypass-role forgery of a mark (m3). Invisible characters that pass `plain()` (breaker m4). The UTC versus Toronto day (m4). The 501-row due cap (m5). No SQL injection path; non-English names are stored intact.

## Score (0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J3, J4: logged, worked to an outcome, alerted once |
| Next step obvious | ½ | The answers carry the full request and clear 409/422 words; no screen yet |
| Plain words | 1 | "The request is already in that status; nothing was changed.", "Say what was done to complete it." |
| Feedback and state | ½ | J7: a 500 for a request that was saved |
| Correct data | ½ | Duplicates (J7); actions overwritten without trace; unchecked person link; UTC day |
| Error recovery | ½ | Field errors are named, but retrying after a 500 duplicates the row |
| Accessibility and screen sizes | N/A | No screen in this row |
| Speed | 1 | 4-49 ms per call (the suite's request lines) |
| Visual quality | N/A | No screen in this row |
| Trust and sources | 1 | "Sample" on the key, "Unconfirmed: no counsel", alerts with ids only |

**6 of 8 applicable = 7.5/10. Not a pass (the bar is 8). No criterion is at 0.**
Fixes that would raise the low criteria, most valuable first:
1. M2: answer 201 when the immediate check fails, and log it.
2. m1: keep the earlier actions text, in a step.
3. m2: check the firm's person exists.
4. m4: use one day zone for the register.

**Could not test:** a real screen reader, widths and zoom (no screen); an intended user's unaided walk (D17/D20 stay with the founder); an RDS deploy.
