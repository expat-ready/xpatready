# Journey test, reviewer: FO-6 part 4a (API only), 24 Nov 2026

Commit `8a2c69cc5e88a1dae96f1db7df2e825d552266af`. Isolated copy `rv_fo6door` on :4436 (runtime ports, 40-minute TTL, stopped afterwards; never :4400), `PLATFORM_IDENTITY=local`, fake adapter, local mail. The script was temporary (gitignored `studio/var/`, deleted). Screenshots are in the session scratchpad and not committed. 4a has no screen, so the journeys are the representative's Send (by API: FO-5's step, unchanged) and the client's email, with one browser step: the client opens the link.

## Journeys (persona · goal · expected · result)
1. **Main.** Representative: "send the retainer for signing". Expected: Send 200; the client gets one "Please sign" email with `<base>/sign/<firm-first token>`; only the sha256 is stored. **Held.** Send 200 in 97–199 ms; the email is in the platform inbox after 270 ms; subject "Please sign your retainer agreement with Sample immigration firm"; the non-English name "Zoë-Ångström 李" is rendered correctly; the link points at the copy's own port; `fo_signer` holds the sha of the client's token (1 row).
2. **Firm signer gets nothing.** The representative's inbox has 0 "Please sign" emails. **Held.**
3. **Double click.** Two Sends at once: one 200, one 409 CHANGED, 1 request, 1 email. **Held.**
4. **Error: stale version.** Send with `expectedVersion: 2`: 409, no request, 0 emails. **Held.**
5. **Error: the transaction does not commit; the mail is down.** Covered by `check_fo6_door_code.ts` S lines: nothing emailed, and the Send stands when mail fails. **Held** (see review m1 on where the failure is forced).
6. **Data underneath.** The token appears in 0 `audit_event` rows and 0 `msg_outbox` columns, and not in the copy's `api.log`. **Held.**
7. **Across the boundary: the client clicks the link.** The link opens the Studio's staff shell "Page not found", acting as Configuration author (1440 px). This is expected by the split: the door is 4b, the page FO-5s. **Not a person's journey yet** (review m4).
8. **Client reads the demo inbox page `/inbox`** at 400, 1024 and 1440 px: no sideways scroll, no page errors, but "No messages for this address". The page reads `/demo/inbox`, not the platform inbox. This predates 4a.

## Break-it pass
Double Send (held), stale Send (held), non-English name (held), and a token search across the audit table, outbox and log (held). There is no route to break by URL in 4a. The code logic was read against FO-3c and unit-tested (19/19); there is no route to reach it from outside yet.

## Score (0, ½ or 1, each with evidence)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | The email and link arrive correctly (J1); opening the link reaches nothing yet (J7, by plan) |
| Next step obvious | ½ | The email says "Open this link to read and sign it"; the link dead-ends (J7) |
| Plain words | 1 | Firm named, "This link is for you alone", "Reply to this email to reach …" |
| Feedback and state | 1 | Send's answer unchanged; the email goes after the commit; a mail failure is logged and the Send stands |
| Correct data | 1 | One request, one email, sha only, no email to the firm signer (J1–J3, J6) |
| Error recovery | 1 | Rollback, stale and double Send email nothing (J3–J5) |
| Accessibility and screen sizes | ½ | No screen of its own; the text email reads fine; the demo inbox page cannot show it (J8, pre-existing) |
| Speed | 1 | Send ≤ 199 ms; email visible after 270 ms |
| Visual quality | ½ | Plain-text email only; nothing visual to judge in 4a |
| Trust and sources | 1 | Reply-To the firm, firm named, the Sample wording flagged in code, no vendor email |

**Score: 8/10, no 0: pass.** What would raise it most: 4b's door plus FO-5s's page, so J7 works (task completed, next step); a platform-inbox view in the demo inbox (screen sizes).

## Could not test
A real screen reader; a real mail client; an intended user's unaided walk (D17 and D20 stay with the founder).
