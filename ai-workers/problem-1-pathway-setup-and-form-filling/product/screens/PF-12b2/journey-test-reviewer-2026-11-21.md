# PF-12b part 2: journey test (reviewer, 21 Nov 2026), commit ed4f8c57d08a98e3a739bf3f879db9c2be0e8a5a

Backend only, with no screen. The diff changes how seven doors find their firm. No UI changed, so the journeys were walked
through the real API (started by `tests/check_pf12b_doors.ts` as `xr_app` on a free local port; never :4400), plus my own SQL
checks as `xr_app`. No browser walk: there is nothing new to see.

## Journeys (persona, goal, expected result)
1. Staff member signs in by firm key → session → who-am-I shows their own firm. **Held** (200, 200, firmKey matches).
2. Staff with an unknown firm key, or a bad session. **Held:** 401 `UNKNOWN_STAFF`, and 401.
3. Invitee opens the link, sees the firm and email, then accepts. **Held:** VALID, 200, staff made in that firm. A second accept
   gets 410.
4. Invitee whose email already signs in to another firm. **Held:** 409 `EMAIL_IN_ANOTHER_FIRM`, no staff made.
5. Visitor opens a firm's enquiry form, an unknown form, or a form that is off. **Held:** 200, then the same 404 body twice.
6. Visitor on firm A's own address asks for firm B's form. **Held:** 404 (enterFirm's review R2 check).
7. Visitor opens a booking page by key, and an unknown key. **Held:** 200 and 404.
8. Booker opens their link, a link with the wrong secret, and an unknown link. **Held:** 200 SCHEDULED, then the same 404 body twice.
9. Visitor on a firm's address, and on an unknown address. **Held:** 200 site, then the 404.
10. Visitor on a firm's old address during its redirect window. **Held at the data level:** as `xr_app`, the lookup gives the firm,
    and as that firm the history, current address and status are readable. Not walked over HTTP: there is no case for it in the
    suite (review issue 5).

Data underneath:
- QA-499's `platform.bypass` count is unchanged across all the door calls.
- No bypass operations line names a door.
- Accept wrote its rows in the right firm only.

## Break-it pass
- Guessed keys against every lookup as `xr_app`: null, the same as not found.
- A lookup's return gives no other column.
- PUBLIC cannot execute any lookup, and `xr_app` cannot alter or drop one.
- Asking the bypass by any door's old name is `BypassRefused`.
- The self-service link now takes less time for an unknown id than for a wrong secret (code reading; review issue 4, Minor).
- Firm A's scope meeting firm B's key: 404 for the form (tested). The booking page and link use the same code path.

## Score (each 0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | All seven doors' pass journeys held (1, 3, 5, 7, 8, 9) |
| Next step obvious | 1 | Answers unchanged from before (same success bodies) |
| Plain words | 1 | Same refusal words (same helpers: notFound, unavailable, unauthorized, INVITE_WORDS) |
| Feedback and state | 1 | Same statuses and codes on every wrong key (2, 4, 5, 8, 9) |
| Correct data | 1 | Staff made once in the right firm, the 409 rolls back, no bypass lines added |
| Error recovery | 1 | Second accept gets 410, off form gets 404, wrong secret gets 404, as before |
| Accessibility and screen sizes | 1 | N/A: no UI in the diff (unchanged) |
| Speed | ½ | About one extra round trip per door (firm switch), not measured against the STANDARDS §9 budgets |
| Visual quality | 1 | N/A: no UI in the diff (unchanged) |
| Trust and sources | 1 | No AI. The firm comes from a catalogue-checked definer, and walls apply after it |

**9.5 / 10: pass** (8 or more, no 0). To raise speed: time the guard and the host routing before and after, on the demo data.

Not tested:
- a real Cognito sign-in;
- the redirect over HTTP;
- a screen reader, and an intended user (D17 and D20 stay with the founder).
