# Journey test (reviewer), PF-19b part 2: one-click unsubscribe and mail through the outbox

Reviewer: Opus 5.5, fresh context.
* Commit `4ffd69132`, 16 Nov 2026.
* Own copy `rvpf19b2` on :4437 (runtime range; never :4400), with `PLATFORM_IDENTITY=local` for the staff journeys. Stopped and dropped afterwards.
* Headless Chromium, axe-core WCAG 2.2 A/AA. US$0, no AWS.
* Screenshots are kept in the session scratchpad (`shots/`), not committed.

## Journeys
The users of this row:
* a client who gets a firm's email (the public page);
* a firm's Owner, whose staff mail now goes through the outbox;
* a mail client's one-click POST.

1. **Main path (client).** A marketing email in the demo inbox carries `List-Unsubscribe` and `List-Unsubscribe-Post`.
   * Opening the link shows "Unsubscribe from Sample immigration firm's marketing email?" with one button, and records nothing.
   * Pressing it gives 200 "You are unsubscribed".
   * Email marketing is withdrawn. WhatsApp opt-in, WhatsApp marketing and service email stay.
   * The builder's `--app` walk passed 6/6 on my copy. **Held.**
2. **Keyboard only.** Tab lands on Unsubscribe, and Enter submits it. The focus ring is the browser default (`auto 1px`). **Held.**
3. **Sizes.** At 400, 1024 and 1440 px, and at 200 % (640 css px), there is no sideways scroll.
   * axe: 0 violations on the page and 0 on the done page.
   * The breaker saw a 160-character firm name overflow at 200 %.
   * **Held for normal names.**
4. **Alternate: a service email's link.** The page is the same, and it withdraws email MARKETING only (1 row, via UNSUBSCRIBE). The words say other messages stay. **Held.**
5. **Recovery: reload after pressing.** The browser re-POSTs and gets 404, which shows **raw JSON** `{"type":…,"title":"Not found",…}`. The person cannot tell whether they are unsubscribed. **Failed (m1).**
6. **Recovery: open the same link again later.** Same raw JSON 404. Nothing more is recorded. **Partly** (the data is right, the words are wrong).
7. **Double click / mail client retry.** 10 concurrent POSTs give 200 ×1, 404 ×9, and 1 withdrawal. The audit actor is `system:unsubscribe:<outbox id>`. **Held.**
8. **Forged tokens.** A changed byte, junk, or `nope` gives 404 and nothing recorded. The SNS door with an unsigned text/plain body gives 400 "Not a verified notice". **Held.**
9. **Owner: invite a staff member** (across the boundary into PF-4b).
   * 201 with `emailed:true`. The outbox row is TRANSACTIONAL and SENT, with no unsubscribe header and the firm's Reply-To.
   * The plain invitation token is now in the stored rendered file on disk. **Data finding (M1).**
10. **Owner: reset two-step for a staff member whose address is suppressed.**
    * Answer: **500 "Server error"**, and the reset does not happen. Before this PR it was 200.
    * A SUPPRESSED outbox row stays behind. **Failed (m3).**

## Data checked underneath
* One `msg_consent_withdrawal` per token (via UNSUBSCRIBE, EMAIL, MARKETING), and the audit line "Consent withdrawn: email marketing, by unsubscribe".
* No other consent changed.
* Each outbox row exists once, with the right class and state.
* The token's bytes hold no firm, person or outbox id in clear (DW12 pass, and my read of `unsubscribe.ts`).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journey 1: unsubscribed, with the right data |
| Next step obvious | 1 | One page, one button |
| Plain words | ½ | The page's words are clear; the 404 and 429 are raw JSON (journeys 5–6) |
| Feedback and state | ½ | The done page is clear; a revisit gives no state |
| Correct data | 1 | One withdrawal under a race; others kept; audit line |
| Error recovery | ½ | Reload or revisit shows JSON; the two-step reset gives a 500 (journey 10) |
| Accessibility and sizes | ½ | axe 0 and keyboard OK; default focus ring; long-name overflow at 200 % (breaker) |
| Speed | 1 | Page 30–46 ms |
| Visual quality | ½ | A bare page with a browser-default button and no firm or brand look; adequate for a tiny public page |
| Trust and sources | 1 | Names the firm, says what stays; no AI |
| **Total** | **7.5 / 10** | **Below the bar (8), no 0** |

## Fixes that raise it, most valuable first
1. Answer the unsubscribe routes' 404 and 429 in HTML with plain words, for example: "This link no longer works. If you pressed Unsubscribe, you are unsubscribed." This raises plain words, feedback and error recovery.
2. Turn the 500 on a suppressed staff address into a 409 with plain words, or reset and say the email was not sent.
3. Add `overflow-wrap:anywhere` and a visible focus style on the page.

## Not tested
* A real screen reader.
* A real mail client's one-click: Gmail and Yahoo POST from their own servers, and M4 rate-limits them.
* A live SES or SNS account.
* An intended user's unaided walk (D17 and D20 stay with the founder).
