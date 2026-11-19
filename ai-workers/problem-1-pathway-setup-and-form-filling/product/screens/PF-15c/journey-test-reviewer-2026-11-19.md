# PF-15c: journey test (reviewer role), 19 Nov 2026

Commit 60d5fb9ac14ecca1cb807e5f571b4fd774f51664. Tested on an isolated copy `pf15crv` on :4593 with the Sample firms seeded (never :4400), using headless Chromium (Playwright, `/opt/pw-browsers/chromium`) and axe-core (WCAG 2.0, 2.1 and 2.2 A/AA). Data was read with psql. The script (`j_pf15c.mjs`, `kb.mjs`) and the screenshots (`refused-1440.png`, `refused-1024.png`, `noplan-1024.png`, `zoom200-refused.png`) are in the reviewer's scratchpad. They are not committed, because this role writes only this file and review.md.

PF-15c has no screen. The case limit is felt on the existing Open a case dialog (`web/src/runtime/cases.tsx`), as the case officer (user-O) of Sample Firm. Each walk moves Sample Firm onto a Sample plan made for that walk; the old plan is put back at the end.

## Journeys
| # | Persona · goal | Steps | Result |
|---|---|---|---|
| J1 | Case officer: "open a case while the plan has room" (1440 px) | Cases → Open a case → name → Open case | 201. Lands on the new case (638-1243 ms). Held. |
| J2 | Case officer: "open one more at the limit" (1440 px) | The same, with 13 of 13 active | Red toast in 237 ms: "Your firm's plan allows 13 active individual cases and 13 are active, so this case was not opened. Nothing was created. A case stops counting once every filing has a decision or it is withdrawn." The dialog stays open with the typed values. No case, party or case_client row is written and the case counter does not move. **No route to a larger plan (review M1).** |
| J3 | Same, keyboard only, 1024 px | Tab to Open a case, Enter; type the name; Tab ×7 to Open case, Enter | Same refusal, read out through the toaster's `aria-live="polite"`. Held. Enter inside the name field does not submit (pre-existing, outside this item). |
| J4 | Same, 200 % zoom (512 px at DPR 2) | Open → refused | Refusal visible, no sideways scroll. Held. |
| J5 | Case officer, firm with no live subscription (1024 px) | Subscription ENDED → Open case | "Your firm has no live subscription, so no case can be opened. Nothing was created. Choose a plan in Settings, Billing." 409, nothing written, never a 500. The words are right, but "Settings, Billing" does not exist yet (review m2). |
| J6 | Recovery: "a case was withdrawn, try again" | Suite DW2 plus my rerun | Withdrawn → the next opening is 201, then 409 again at 10 of 10. Live again → the plan sentence comes back, not the no-plan one. Held. |
| J7 | Wrong role: the client opens a case | API as user-P | 403 "Client A (simulated) does not hold the case duty". No limit numbers are shown. Held. |
| J8 | Across the boundary | J1 lands on the case page | The next step (add people) is offered there. Held. |

## Break it
* 8 openings at the same moment with 3 left → 201, 201, 201, 409 ×5. The real adapter is read under the opening's lock. Held.
* The same idempotency key twice on the last slot → 201 then 201 with the same case id, never a 409 (CS-C1b M1 kept). Held.
* Limit 0 → 409 with `used` correct. Five refusals took 32-41 ms each on the API.
* The 409 body keys are `type, title, status, detail, message, code, metric, limit, used`. **There is no `upgradePath`** (seats and storage carry one). See review M1.

## Data underneath
After each refused opening the counts of `runtime_case` (for the firm), `party` and `case_client` are unchanged, and `firm_case_counter` is unchanged. After J1 there is exactly one new case. The subscription status and plan are restored at the end (checked: ACTIVE, old plan).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 opens a case; J2, J5 refuse as the brief says |
| Next step obvious | ½ | The over-limit sentence offers only close or withdraw, with no larger plan (M1); the no-plan path names a screen that does not exist (m2) |
| Plain words | 1 | Both sentences are plain, with no codes on screen |
| Feedback and state | ½ | The server says "Nothing was created", but the UI shows it only as a 9-second toast (pre-existing) |
| Correct data | 1 | Nothing written on refusal; 3 of 8 under race; replay returns the same case |
| Error recovery | 1 | Values kept in the dialog; withdraw frees a slot; the retry key is safe |
| Accessibility and screen sizes | 1 | axe 0 violations at 1440 and 1024; no sideways scroll at 1440, 1024 and 200 %; keyboard path works; the toast is a live region |
| Speed | 1 | Refusal 32-41 ms (API) and 237 ms (UI) |
| Visual quality | 1 | Team toast and dialog, unchanged (screenshots) |
| Trust and sources | ½ | The refusal does not name the plan (SA-4-56 names it: "Starter allows 3"); limits are Sample |
| **Total** | **8 / 10** | **Pass** (8 or more, no 0) |

What would raise it, most valuable first: (1) add the upgrade path to the case 409, both the field and the words (M1). (2) Name the plan in the sentence. (3) Put the refusal inline in the dialog (UI, a later item).

## Not tested
A real screen reader. The walled `xr_app` role through createCase (the copy runs as the owner). The corporate metric through the app (no CORPORATE pathway on the configured checkpoint, review m1). An intended user's unaided walk (D17 and D20 stay with the founder).
