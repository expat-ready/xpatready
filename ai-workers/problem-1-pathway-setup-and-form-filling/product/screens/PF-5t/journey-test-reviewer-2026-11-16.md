# Journey test, PF-5t part 1 (API and guard), reviewer, 16 Nov 2026

Commit `3fa6b36fd3305e76bc25cd3122d5ecdcdca86cb3`. Part 1 has no screens. The journeys were walked as the person's requests against an isolated Nest app on an ephemeral port: the PF-5t check harness on a scratch database, never :4400. The browser, axe and screen-width steps belong to part 2 (DW6, DW7). Wording and versions Sample. **Unconfirmed: no counsel.**

## Journeys

| # | Persona and goal | Steps | Result |
|---|---|---|---|
| 1 (main) | Owner: "the terms changed; let me get back to work" | publish ToS → request → 428 → `GET /me/terms` → accept → request | 428 TERMS_PENDING, "Please accept the updated terms to continue."; the pending list shows kind, version, link and date; accept answers 200; the next request answers 200; one row, one audit line. Held. |
| 2 (alternate) | Case Officer: new privacy notice | publish → 428 → accept own | Cleared for them only; the Owner and the Case Manager still 428. Held. |
| 3 (wrong role) | Case Officer accepts firm terms | POST accept with the DPA id | 403 "Only an Owner can accept these terms for the firm.", nothing written. Held. |
| 4 (non-Owner not blocked) | Case Officer and Case Manager while firm ToS is pending | any request | 200. Held. |
| 5 (error) | Owner sends an old, unknown, malformed or empty id | POST accept | 400 TERMS_NOT_CURRENT / CHECK_FIELDS, nothing written. Held. |
| 6 (recovery) | Owner double-submits; two Owners accept at once | replay; two parallel POSTs | Same answer, no second row or audit line; firm version recorded once. Held. |
| 7 (boundary) | Pending person signs out or signs in again | sign-out; new session | Sign-out 200; the new session is still asked; the old token gets 401. Held. |
| 8 (shown) | Owner lists acceptances | `GET /terms/acceptances` | Who, when, which version, newest first; firm A only; a sign-up's own rows appear in its firm. Held. |
| 9 (boundary, break) | New firm signs up while a new version is published | form → publish → verify → `pending` | **Not held:** pending `[]`, though the Owner accepted only the older versions (review M1). |

## Data underneath
I checked rows by SQL after each journey: one acceptance per person per version (privacy notice), one per firm (firm terms); the audit line `platform.terms.accepted` with `detail.versionIds`; no row on any refusal. Roles are enforced in the service and the guard, not the client.

## Break pass
* Letter case, trailing slash, `..`, HEAD: none gets past the gate.
* Public doors and the sign-in door: untouched.
* Another firm's acceptance: never clears this firm.
* Lock removed: the race test fails, 3 of 3 runs.
* Straddling sign-up: **Major** (M1).
* Speed: about 0.6 ms added per guarded request.

## Score

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1–8 |
| Next step obvious | 1 | 428 code plus `GET /me/terms` lists exactly what to accept |
| Plain words | 1 | The 428, 403 and 400 messages in plain English |
| Feedback and state | 1 | Accept answers what is still pending |
| Correct data | ½ | Exact rows and audit, but M1 leaves a current version never asked |
| Error recovery | 1 | 400 says to reload; replay safe |
| Accessibility and screen sizes | N/A | Part 2 (DW7) |
| Speed | 1 | +0.6 ms per request |
| Visual quality | N/A | Part 2 |
| Trust and sources | 1 | Sample note on every answer; Unconfirmed: no counsel |

**7.5 of the 8 criteria that apply (two are UI, N/A), scaled 9.4, reported as 9/10: pass, no criterion at 0.** To raise it: fix M1, so a version published during sign-up is asked.

## Could not test
A real screen reader and an intended user's unaided walk (D17 and D20 stay with the founder); screens (part 2); Cognito sign-in.

## Re-check at 67b384e (diff only)
Journey 9 now holds: a version published between the sign-up form and its email check is asked of the new Owner, for both kinds (test "PF-5t rule pass (review M1, break M2)", 40/40). Correct data rises to 1. **8 of the 8 criteria that apply: 10/10, pass.**
