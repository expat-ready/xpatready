# Journey test (reviewer): PF-5 part 4, the payment-hold clock and the departure notices (22 Nov 2026)

Commit `40fd58854a20814de0cc10b5989c07568091343e`. The part is API only: no screen and no route. The "person" here is the firm's Owner, Admin or billing contact reading their inbox. So each journey was walked as a fake-clock scenario on a scratch PostgreSQL database (127.0.0.1:54329), through the product's own sweep (`ExitNotices.sweep`) and fake mail. I read the mails, then `audit_event` and `exitClock` underneath. There is no browser, Playwright or axe step (nothing to render). :4400 was not used. US$0.

## Journeys (persona · goal · expected · result)
1. **Main.** Owner, firm A: "my subscription went on hold; tell me what happens". Expected: one day-0 mail to the Owner, the Admin and the billing email, with the deletion date and the billing link; one audit line. **Held** (check DW20 ×6).
2. **Alternate.** Same firm, days 15, 16, 46 and 83. Expected: nothing on day 15, then one warning on each due day; a second run the same day adds nothing. **Held** (DW21 ×5).
3. **Recovery: the job was down.** Down on days 16-20, then a run on day 21. Expected: only the day-16 warning, once; nothing on or after day 90. **Held** (DW22).
4. **Recovery: the firm pays.** Paid on day 20, then a new hold on day 100. Expected: no more warnings, then a new day 0 with its own deletion date. **Held** (DW23 ×2).
5. **Wrong role.** A Case Officer of firm A, and firm B's staff. Expected: no mail. **Held**, and mutation-proven (a Case Officer added to the recipients turns DW20 red).
6. **Wrong state.** SECURITY_LOCK, DELETED and ACTIVE firms. Expected: no clock, no mail. **Held** (DW24 ×3).
7. **Error: a passing mail failure.** One recipient's send fails once. Expected: no line; the next run sends only the missing mail. **Held** (DW22).
8. **Error: an address that is always refused** (a bounced or complained address). Expected: the others still get the notice, and the record says who did not. **Failed.** Every run on days 0 to 89 gives `{sent:0, failed:1}`; the billing email (after it in order) gets nothing; no audit line is ever written (review M1).
9. **Double click / two tabs.** Three concurrent sweeps plus one direct run, on day 0 and on day 16. Expected: one line and one mail per recipient. **Held** (probe: 2 lines, 4 mails).
10. **Across the boundary.** The billing page and `exitClock` (which PF-11c reads) agree. Instants: **held** (DW25 ×2). The words: **failed**. For a hold that starts at 21:00 Toronto, the email says "1 Mar 2027" and the page says "28 Feb 2027" (review M2).

## Break it (15 min)
Wording against SA2-D13: a mutation adding "7 years as your regulator requires" is caught. The always-refused address breaks the notice (journey 8). An address-needed hold is told to "add a card or pay the open invoice" (review m2). Bypass-line noise: up to 17 `platform.bypass` lines a day per held firm (review m1).

## Score out of 10
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Journeys 1-4 and 6-7 complete; journey 8 sends nothing to the rest, and never records it |
| Next step obvious | ½ | The billing link is in every mail; an address-needed hold is told the wrong action (m2) |
| Plain words | 1 | Short and factual: "Your firm's data will be permanently deleted on 1 Mar 2027"; nothing forbidden by SA2-D13 |
| Feedback and state | ½ | An audit line with day, deletion date and sentAt; a stuck notice shows only as an hourly error log |
| Correct data | ½ | One line per notice under race; the date in the email is UTC, a day later than the page for evening holds (M2) |
| Error recovery | ½ | A passing failure recovers (DW22); a permanent refusal never does (M1) |
| Accessibility and screen sizes | 1 | A plain-text email through the pipeline's layout; no screen of its own (the rendered layout was not checked) |
| Speed | 1 | Each sweep takes milliseconds; the whole check runs in 7 s |
| Visual quality | ½ | Not seen as rendered (fake mail); the subject and body read cleanly as text |
| Trust and sources | 1 | No AI; facts only; P-799 and SA-02 cited in code; legal points marked "Unconfirmed: no counsel" |
| **Total** | **7 / 10** | **Fail** (below 8; no criterion at 0) |

## Fixes that raise the score (most valuable first)
1. Send every recipient whatever another's result is; record a permanent refusal and write the line (M1): raises task completed, error recovery and feedback.
2. Format the deletion date in the firm's time zone (M2): raises correct data.
3. Words for the address-needed hold (m2): raises next step obvious.
4. Look at one rendered email in the demo inbox on the builder's port: raises visual quality.

Not tested: a real SES send; a real screen reader; an intended user's unaided walk (D17 and D20 stay with the founder).
