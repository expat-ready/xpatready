# PF-0bp journey test (reviewer, 17 Nov 2026, head 1c316e342)

PF-0bp has no screen. The people who meet it are a staff screen or a website form whose script sends a broken or huge body, and the server owner who reads the log. No screen sends a broken body today (QA-151), so there was no browser walk. Each journey was walked over HTTP, the way a client meets it. I used two copies on runtime ports: the branch on :4436 and `main`'s `main.ts` on :4437. Each had its own scratch database with every migration, the Sample seed and local sign-in. Both were stopped and dropped afterwards. I never used :4400.

- **Not run:** the browser, axe, screen-size and Playwright steps (there is no UI), a screen reader, and an intended user's walk (D17/D20 stay with the founder).

## Journeys
| # | Person, goal | Steps | Expected | What happened (branch :4436 · main :4437) |
|---|---|---|---|---|
| J0 | A staff screen (Owner) saves a lead, but its script sends `{"a":` | POST `/api/front-office/leads` with a token | 400 problem JSON, our words, nothing saved | 400 `BODY_NOT_JSON` "The request body is not valid JSON. Nothing was saved or started." · main: 400 "Unexpected end of JSON input" |
| J1 | The same screen sends a valid body | POST `{}` with a token | The handler's own answer | 422 `INVALID` (requestId missing). Complaints: 422 `COMPLAINT_FIELDS` |
| J2 | A complaint is posted with a broken body | POST `/api/platform/complaints` `{"a":` | 400 `BODY_NOT_JSON` | As expected. The body is refused before PF-21i's Idempotency-Key check could run |
| J3 | A broken body that quotes private text: `secret-marker-123` sent bare | POST leads | Nothing of the body comes back | Branch: our words only · **main: `Unexpected token 's', "secret-marker-123" is not valid JSON`**, the whole marker echoed back |
| J4 | A visitor's website form posts broken JSON to the web-form door | POST `/api/public/forms/x/submissions` | 400 `BODY_NOT_JSON` (this door has its own parser) | Branch: `BODY_NOT_JSON` · main: `…"{"note": secret-mar"…` echoed |
| J5 | A visitor sends a 33 KB form | Same door | FO-2's own 413 `TOO_LARGE`, unchanged | Unchanged (suite DW2; FO-2's suite passed 113/113) |
| J6 | A staff screen sends a 6 MB body | POST leads | 413 with the 5 MB words, plus `BODY_TOO_LARGE` | As expected. The P-179 words are unchanged |
| J7 | Wrong role / no sign-in sends a broken body | POST leads, no token | 400 `BODY_NOT_JSON`, not 401 and not 500 | 400 `BODY_NOT_JSON` (the parser runs before the guard) |
| J8 | Recovery: send it again correctly | Valid body after a broken one | Same as J1, no row left behind | Same as J1. The `fo_lead` and `plat_complaint` row counts did not change |
| J9 | Server owner reads the log | Grep both copies' logs for the marker | 0 hits; the request line logs 400 | 0 hits in both logs. The request line says `"status":400` |

## Break it (15 min)
- Unknown route with a broken body: 400 `BODY_NOT_JSON` (main repeats the parser's words). Held.
- `Content-Encoding: foo`: **500** on both copies (body-parser `UnsupportedMediaTypeError` 415, falls through to `main.ts:223-224`). Pre-existing. **Minor**, see review m4.
- A body labelled gzip that is not gzip: **500** on both copies (`Z_DATA_ERROR`, status 400, falls through). Pre-existing. **Minor**, same item.
- `charset=utf-7`, `application/vnd.api+json` with a broken body, an empty JSON body: the parser skips them, and the guard answers 401 problem JSON. Not 500s.
- `/api/x%FF` (Nest's other mapped error): 404 problem JSON on both copies. Not affected.
- Merging open PR #1959 (PF-5 part 2, which adds a raw-body line before the JSON parser) into this branch: `git merge-tree` reports no conflict.

## Data underneath
Row counts of `fo_lead` and `plat_complaint` did not change across the broken, oversized and marked bodies (suite DW4, and J8 by hand). No audit line is expected because nothing was written. "Roles were enforced on the server" does not apply: the refusal comes before any guard, and that is the intent.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J0, J2, J4, J6, J7 answer as the brief says; suite 12/12 twice |
| Next step obvious | ½ | "Nothing was saved or started" says what happened, but there is no next step (the fault is the client's own; acceptable, not perfect) |
| Plain words | 1 | Fixed sentence with no parser jargon or positions (J0-J4) |
| Feedback and state | 1 | `application/problem+json`, `status`, `code`; the request line logs 400 |
| Correct data | 1 | Row counts unchanged (J8, DW4) |
| Error recovery | ½ | The broken JSON paths recover. Two other parser refusals are still 500s (break-it, pre-existing) |
| Accessibility and screen sizes | n/a | No UI |
| Speed | 1 | Answers in 3-5 ms (`durationMs` on the request lines) |
| Visual quality | n/a | No UI |
| Trust and sources | 1 | Nothing of the body comes back or goes to the log (J3, J9); `main` echoed the marker |

**7 of the 8 criteria that apply = 8.75/10, no criterion at 0: Pass.** To raise it: (1) answer the two other body-parser refusals (415 encoding, bad gzip) as problem 4xx (review m4); (2) no change is needed for the next step on a client fault.
