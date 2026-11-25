# Journey test, reviewer role: PF-17 part 4 PR A (API and start-up), 24 Nov

**Commit:** `34f58ea0b4be249431cf1f793538b43e9f36b916`.

**Setup:** an isolated copy, `pf17rev`, on the runtime lane's port :4438 (never :4400). It was started with `PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local`, as `start.sh` now does for the demo, then stopped and its database dropped.

**What a person can use:** PR A has no screen, so each journey was walked with the same API calls the screens will make in PRs B and C (curl). "Like a person" here means the order and the inputs a staff member would use. It does not mean clicks.

## Journeys (persona · goal · steps · expected → seen)

**J1, main.** ExpatReady Support: "which firms need us?"
* Steps: sign in by work email with the second step, then read the Firms list.
* Expected → seen: a token for `support.sample@expatready.example.com` (start-up log: `Sample ExpatReady staff {"added":[ops…, support…]}`). `/me` returns "Support (Sample)" with the keys `system/firm:read`, `system/support:list` and `system/support:manage`. `GET /api/system/firms` returns both Sample firms, OK, with `plan` "Team (Sample)" and "Solo (Sample)", `failedJobs` 0 and `failedJobsComplete: true` (69 ms).

**J2, main.** Support: "answer the firm's ? question."
* Steps: firm A's Owner and firm B's Owner each raise a ticket, then Support opens the queue, opens firm A's ticket and replies.
* Expected → seen: each queue row's `firm.plan` names that firm's plan. The ticket carries firm A's plan, and the reply answers `WAITING_ON_FIRM` with 2 messages and the plan kept (queue 35 ms).

**J3, alternate.** Support checks that the pages agree when a firm is on payment hold or ended.
* Steps: set firm B's subscription to `PAYMENT_HOLD`, then to `ENDED`, reading the pages after each change, then restore it.
* Expected → seen: on hold, the queue row, the ticket and the Firms page all say "Solo (Sample)", and the Firms page shows HELD, "on payment hold". Ended: null on all three, and the Firms page shows ATTENTION, "no live plan". The status was restored afterwards.

**J4, error.**
* Blank reply: 422 `SUPPORT_FIELDS` naming `body`.
* SQL-looking `?firm=`: 422 `SUPPORT_QUERY`, never a 500.

**J5, wrong role or wrong plane.**
* Firm A's token on `/api/system/firms`: 403, "A firm's staff session cannot be used here".
* Our token on `/api/platform/support/tickets`: 403, "works only in the staff console".
* No token: 401.

**J6, wrong person.**
* Unknown email: 401, "No ExpatReady staff member signs in with that work email."
* The same email in mixed case signs in, as expected for email.

**J7, recovery.**
* Restarting the same copy: the seed logs `{"added":[]}` (idempotent).
* Restarting with `PLATFORM_ENVIRONMENT=test PLATFORM_SYSTEM_IDENTITY=local`: start-up refused with `ConfigRefused`, which names `PLATFORM_SYSTEM_IDENTITY` ("the local stand-in never runs in the test environment or production").

**J8, across the boundary.**
* Platform Owner (Sample) signs in and holds the same three keys, so PR B's frame can use either person.

## Break it (15 min)
* A 2 800-character Arabic and Chinese reply with symbols: accepted, and the plan was kept.
* A crossed plane in each direction, a malformed filter and an unknown person were all refused with plain words.
* A start-up outside local was refused.
* No Blocker or Major found by walking.

**Found by the review's mutation pass, not by walking:** DW12 does not catch a failed-jobs threshold. That is Major M-1 in `review.md`.

**Observation, not this PR's:** the blank-reply sentence, "write what you need help with, without control characters", is PF-18b's firm-side wording reused for our reply.

## Data underneath
* `plat_system_staff` holds exactly two Sample rows, each with one role grant.
* The reply wrote one message, and the ticket status moved to `WAITING_ON_FIRM`.
* The queue writes one platform bypass line (DW6 green).
* The payment-hold and ended subscription states were restored to `ACTIVE` after J3.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 and J2 end to end on the API |
| Next step obvious | ½ | No screen yet. The PR body does not yet tell the founder which Sample emails sign in (review m-3) |
| Plain words | 1 | J4-J7 refusals are full sentences, with no codes on their own |
| Feedback and state | 1 | The reply returns the new status. `failedJobsComplete` and null keep "capped" apart from "not known" |
| Correct data | 1 | J3: the three reads agree in every state. The seed is idempotent |
| Error recovery | 1 | J7: restart is safe, and a start-up refusal names its setting |
| Accessibility and screen sizes | N/A | No screen in PR A (PRs B and C) |
| Speed | 1 | 35 to 69 ms per read on the Sample data |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | People and plans are labelled "(Sample)". No AI. Plan origin: PF-15's one read |

**7.5 out of the 8 criteria that apply = 9.4 / 10 scaled. Pass** (8 or more, and no 0).

To raise "next step obvious": complete m-3 of the review (put the sign-in emails in the PR body's "On the demo"). PR B's sign-in card will then carry this.

## Could not test
* The browser, axe, keyboard, 400/1024/1440 px and the Playwright replay: there is no screen. PRs B and C carry B1-B9.
* A real screen reader.
* An intended user's unaided walk (D17/D20 stay with the founder).
