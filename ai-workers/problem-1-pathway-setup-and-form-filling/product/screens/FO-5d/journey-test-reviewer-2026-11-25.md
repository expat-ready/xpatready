# Journey test, reviewer: FO-5d part (1), the client declines (API only), 25 Nov 2026

PR #3670, walked at `255be82c959d5eeab37ec835f3331b7c93dd88dd`; it holds for head `d2c603bd38cfec50738400003470d3720aef7ec3` (a migration-folder rename only) (worktree `claude/pensive-maxwell-bsxoo9-decline`). Isolated copy `fo5drev` on :4436 (runtime ports, 40-minute TTL, `PLATFORM_IDENTITY=local`, fake adapter, local mail), stopped afterwards (database and files dropped). Never :4400. There is no screen: the client's Decline page is FO-5s S7, the next PR. So the walks use what a person's browser would send, with the link copied from the client's real "Please sign" email in the demo inbox.

## Journeys (persona · goal · expected · result)
1. **Main.** Client (ClientA, j_55's seed): "I don't want this retainer, and here is why." Steps: link from the email → `GET /api/public/sign/<token>` (WAITING, 14 ms) → `POST …/decline {"reason":"We chose another firm (Sample)"}`. Expected: 200 DECLINED, the reason kept, one item to the owner, no email. **Held.** 200 in 30 ms: "You declined this agreement. Sample immigration firm has been told.", `agreement: "DECLINED"`. Underneath: the retainer, the request and version 2's end are all DECLINED, the reason is on the CLIENT signer, and there is one `retainer-declined` / NEEDS_YOU / `retainer` row for the prospect's owner. `msg_outbox` gained 0 rows. The audit lines `signing.declined` and `retainer.declined` hold no reason text.
2. **Owner sees it.** Representative, the prospect's owner: "what needs me?" `GET /api/platform/me/notifications/items` gives "Retainer for ClientAmwvpjciq Sample" → `/front-office/retainers/<id>` (39 ms). `GET retainers/:id/signing` shows `declineReason` word for word. **Held.** But `GET /api/platform/me/needs-you` (Home) has **0 items**: Home lists the MY_DEADLINES group only (`platform/notifications/store.ts:92`). See review m4.
3. **Alternate: non-English reason, padded.** `"  Le tarif est trop élevé — 费用太高 (Sample)  "` is kept trimmed, word for word. **Held.**
4. **Error: too long.** 501 × "x" gives 422 "reason: This is too long: at most 500 characters. Nothing was saved." **Held.** 300 emoji (300 characters) gets the same 422. **Wrong** (review m2).
5. **Error: wrong body.** A form body gives 415 "This door takes a JSON body."; `{"reason":5}` gives 422 "This must be text."; a 1.1 MB body gives 413. **Held.**
6. **Recovery: double click, reload.** Five declines at once on a fresh link (after Edit and resend made version 3): one 200 and four 409s, one reason ("race 1"), one audit line for that version. Reloading the link (`GET`) reads "This agreement was declined. Reply to … if that was a mistake." A second decline gives 409 LINK_DECLINED in words. **Held.**
7. **Wrong role and visibility.** A case officer and a second representative, each given a row by hand: both see the name and link, and both may open the retainer (GET 200), so the label agrees with the page's own rule. In process (the suite), a reader without `agent/retainer:show` gets nothing. **Held** for what was reachable here. The "may not open it" case was not reachable on this copy (everyone sees all), and the suite has no line for it (review Major 3).
8. **Across the boundary: a request whose retainer moved on.** ClientB's version-3 request was still SENT after j_55 W4 filed the retainer "Signed on paper", because nothing on main ends it (that is FO-5d (3), #3648). Declining that link gives 200 "… has been told.", `agreement: null`. The request is DECLINED, the retainer stays SIGNED_OFFLINE, and **0 items** were written. The data is consistent, but the words are not true (review m1).
9. **Rate limit.** 35 calls on one link in a minute: 30 answered (200/409), then 429. **Held.**
10. **qa's journey j_55** on the same copy: 28/34. W1's two link lines wait on #3648 and FO-5s. W3 failed at "the client has a signing link": the inbox read gave `[]`, but the same inbox held the link seconds later, so j_55's inbox read probably raced the delivery (qa's item). W3's page step waits on FO-5s S7. W4 to W6 are green.

## Break-it pass
Double and five-way decline (held), oversized and emoji reasons (m2), wrong types and media (held), stale-version request (m1), rate limit (held), rollback.sql on the copy's database with 3 reasons kept, then the migration again (both clean, check restored). Mutations (rule removed, suite re-run, restored): see review.md.

## Score (0, ½ or 1, each with evidence)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1: decline with a reason recorded; the owner told; the retainer DECLINED (HTTP, link from the real email) |
| Next step obvious | ½ | J2: the item links to the retainer, but its words ("A client declined a retainer") drop the row's "Edit and resend, or withdraw it", and Home's Needs you does not show it |
| Plain words | ½ | Door words plain (J1, J6), but "has been told" is untrue in J8, and "at most 500 characters" is wrong for J4's emoji |
| Feedback and state | 1 | 200 DECLINED, 409 in words, the link reads declined after reload (J6) |
| Correct data | 1 | Reason once, trimmed, word for word; the race gives one; no reason in audit; no email (J1, J3, J6) |
| Error recovery | 1 | 422 named field, 415, 413, 429, 409 in words (J4, J5, J9) |
| Accessibility and screen sizes | ½ | No screen to test (API only); j_55's retainer pages: axe clean, no sideways scroll at 400 and 1024 px |
| Speed | 1 | Decline 30 ms, state 14 ms, notifications 39 ms |
| Visual quality | ½ | Nothing a person sees yet; re-test with FO-5s S7's page |
| Trust and sources | 1 | The reason is shown as the client's own; Sample words labelled; audit without reason text |
| **Total** | **8 / 10** | Pass (8+, no 0) |

Fixes that would raise the low lines, most valuable first: m1 (say "has been told" only when an item was written); the item's words with the next step (m3); count characters, not UTF-16 units (m2); the page (FO-5s S7) for accessibility and visual quality.

## Could not test
A real screen reader, and an intended user's unaided walk (D17 and D20 stay with the founder). The client's Decline page (not built). The real e-signature vendor (fake adapter only). A deadlock against #3648's withdraw (not merged): read from code only (review m6).

## Round 2 (e7bee6efb), diff-only, reviewer
Walked in process with the PR's own controller, on a scratch copy of `studio/` (no HTTP copy this round; never :4400).
* **J3b. A client writes a two-line reason** ("We chose another firm.\nThanks for your time (Sample)"). Expected: DECLINED, the reason kept. **Failed.** The check `fo_signer_decline_reason_check` refuses the newline (`migration.sql:14` `[[:cntrl:]]`). Over HTTP this is a 500 "Something went wrong", the request stays SENT, and the reason goes to the server log in the error's detail. CRLF and tab inside the text fail the same way. Round 1 accepted these reasons.
* **J3c. Persian with ZWNJ, emoji ZWJ sequences.** DECLINED, but the reason is altered: the joiners are removed (`decline.ts:33`).
* **Held.** "has been told" only for a declined retainer, and the consultation stand-in answers plainly. 500 emoji are accepted and 501 get 422. Invisible-only and NUL-only reasons are no reason. `"a\u0000b"` is kept as "ab" (it was a 404).

| Criterion | R1 | R2 | Why it changed |
|---|---|---|---|
| Task completed | 1 | ½ | J3b: a multi-line reason cannot be declined |
| Next step obvious | ½ | ½ | words unchanged (review m3) |
| Plain words | ½ | 1 | "has been told" true now; emoji counted right |
| Feedback and state | 1 | 1 | |
| Correct data | 1 | ½ | J3c: joiners removed, not word for word |
| Error recovery | 1 | ½ | J3b: 500, no field error, nothing kept |
| Accessibility and screen sizes | ½ | ½ | no screen |
| Speed | 1 | 1 | |
| Visual quality | ½ | ½ | no screen |
| Trust and sources | 1 | 1 | |
| **Total** | **8** | **7 / 10** | **Fail** (below 8). The most valuable fix is J3b (one rule for app and DB on tab, LF and CR), then J3c |

## Round 3 (c49d5ab69), diff-only, reviewer
These were walked in process through the door's own controller (the suite's lines and a scratch copy of `studio/`), on :54329, never :4400.
* **J3b (two-line reason) held.** `"We chose another firm.\r\nThanks for your time.\tAll the best"` is DECLINED and kept with CR, LF and the tab exactly as written. The database accepts line breaks and tabs inside under all seven collations probed.
* **J3c (Persian with ZWNJ, an emoji family with ZWJ) held.** It is kept word for word. A reason of joiners and direction marks only is no reason.
* **Break:**
  * Bidi overrides and the BOM are removed by the app and refused by the database in the same way: 0 disagreements over every code point.
  * Not tested by the suite (review m11). Reasons made only of other invisible characters (U+3164, U+00AD) are kept blank (nit, as before).

| Criterion | R2 | R3 | Why it changed |
|---|---|---|---|
| Task completed | ½ | 1 | J3b: a multi-line reason declines |
| Next step obvious | ½ | ½ | words unchanged (review m3, deviation 5) |
| Plain words | 1 | 1 | |
| Feedback and state | 1 | 1 | |
| Correct data | ½ | 1 | J3c: joiners kept, word for word |
| Error recovery | ½ | 1 | no 500. 422, 409 and 404 in words as in round 1 |
| Accessibility and screen sizes | ½ | ½ | no screen |
| Speed | 1 | 1 | |
| Visual quality | ½ | ½ | no screen |
| Trust and sources | 1 | 1 | |
| **Total** | **7** | **8½ / 10** | **Pass** (8+, no 0). To raise it: the page (FO-5s S7) for accessibility and visual quality; the item's next step in words |
