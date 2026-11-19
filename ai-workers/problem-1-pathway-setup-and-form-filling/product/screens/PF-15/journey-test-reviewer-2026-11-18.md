# PF-15 part 1a: journey test (reviewer role), 18 Nov 2026

Commit d8dc7be (its app code: the isolated copy `pf15rev` on :4433 was started before the 14:03Z working-tree edits by another session), `PLATFORM_IDENTITY=local`, Sample firms seeded. Not :4400. Playwright headless Chromium plus axe-core (WCAG 2.2 A/AA); data read with psql. Screenshots and the script are in the reviewer's scratchpad (`…/scratchpad/probe/shots/`, `journey.mts`). They are not committed, because this role writes only this file and review.md.

No PF-15 screen exists. The seat limit shows on PF-6's Team screen. Storage has no upload screen on main (the retainer template upload is API-only), so J6 drives the real route the way a client would.

## Journeys
| # | Persona · goal | Steps | Result |
|---|---|---|---|
| J1 | Owner (user-R): "add a case officer while a seat is free" | Team → Invite people → email → Send | 201, one invitation, seat line updates. Held. |
| J2 | Owner, two tabs: "the last seat went while I was typing" | Form open with 3 of 4; another tab invites; Send | Server 409 shown on row 1 in the server's words ("…allows 4 people … Revoke a pending invitation or deactivate someone first, or change the plan."). Notice "Plan limit reached"; nothing created. Same at 1440, 1024 and 400 px. Held. |
| J3 | Owner, keyboard only, 1024 px | Tab to Invite people, Enter, type | Reached by Tab; focus lands in the email field; the over-limit notice is read before Send. Held. |
| J4 | Owner, firm with no live subscription | Invite | 409 PLAN_LIMIT_REACHED, metric seats, limit 0, "Your firm has no live subscription, so nobody can be added." Fail closed. Held. |
| J4b/c | Owner at the limit, single and batch | Invite; batch of 2 | 409 keeps PF-4c's `seatsLimit, seatsUsed, afterInvites, removeCount` (and `rows` for the batch) and adds `metric, limit, used, upgradePath`. Batch: "7 of 5 seats … Remove 2 people or upgrade your plan." Held. |
| J5 | Case officer (wrong role) | Invite by API | 403 MISSING_PERMISSION; no seat numbers leaked. Held. |
| J6 | Owner: "upload a template when storage is full" | Day 1 over (limit 0) → upload; again; backdate the mark 15 days → upload; list; raise the limit → upload | Day 1 201 (80 ms), mark set and alerted once; second upload 201, alerts still 1; day 15 409 `storage_mb`, limit 0, used 1, nothing saved (47 ms); list still 200; back under 201 and mark cleared. Held. |
| — | Across the boundary: case side | Walled probe: firm key, no platform scope | `limitOf` → limit 0, check refused at 0 cases (review M1). Failed. |

## Break-it (15 min)
* Two invitations at the last seat (suite DW6, real route): one 201, one 409.
* A storage mark delete or truncate is refused by the trigger.
* Upload with no firm scope on the walled pool: **stored on day 15** (fail open, review m1).
* Rollback after send: a code-read scenario gives a second email (review m4).
* Two measures at once: serialised by the advisory lock; the second sees the mark and sends nothing.
* 5,000 files: 75 ms synchronous walk, twice per upload (review m6).

## Data underneath
Each journey: invitations counted before and after (exactly one or none); `platform_storage_over` row values; audit `storage.over, storage.alerted, storage.back_under`; roles enforced on the server (J5 403).

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J4, J6 all end as the rules say (SA-3-5, SA-3-40). |
| Next step obvious | ½ | The seat words name what to do. The upgradePath "Settings, Billing" is no screen on main (m2). |
| Plain words | 1 | "Your plan (Team (Sample)) allows 4 people…"; "Nothing was saved. Every existing document keeps working". |
| Feedback and state | 1 | The refusal sits on the row; seat line "5 of 4 seats after these invites"; nothing sent. |
| Correct data | ½ | Exactly once or none in every journey. But the case-side key path returns 0 under the walls (M1), and storage fails open with no scope (m1). |
| Error recovery | 1 | Raising the limit or getting back under allows again; the two-tab refusal recovers on Send. |
| Accessibility and sizes | 1 | axe: 0 violations at 400, 1024 and 1440 on the refusal state; no sideways scroll; keyboard path works. |
| Speed | 1 | Team 363-661 ms; upload 80 ms; 409 47 ms (STANDARDS §9 budgets). |
| Visual quality | 1 | PF-6 team look unchanged; warn notice plus field error (j2-refused-1024.png). |
| Trust and sources | ½ | Sample plans and limits are labelled. The day-one emails go to the in-memory LocalMail, which no person can see on the copy, and their words are not marked Sample. |

**Score: 8.5 / 10. No 0, so it passes as a journey.** The review still blocks on B1 and B2: CI suites go red at this commit.

Fixes that raise the low scores, most valuable first:
1. Make the firm-key lookup work behind the walls, or drop the claim (M1), and refuse storage when the firm cannot be read (m1).
2. Use one 409 builder with an upgrade path that exists (m2).
3. Route the day-one emails where the demo shows them, and label their words Sample.

Not tested: a real screen reader; an intended user's unaided walk (D17 and D20 stay with the founder); a real mail provider; a live 14-day wait.
