# PF-5 part 1 — journey test (reviewer), 15 Nov 2026

Commit `1cd85d6c7d16a774ab0a099e3b4368d95f0b0eef`. API only: there is no screen yet (PF-5s builds it), so the journeys were walked as the sign-up page would call them, with curl against the isolated copy `rev5` on :4561 (fresh database, `PLATFORM_IDENTITY` unset, fake billing). Data was read by psql, and the copy was stopped after. The verify step was walked in the harness (`tests/check_pf5_signup_billing.ts`, 42/42), because the running app cannot give a person the code (see J1).

## Journeys (persona: a firm owner signing up for a trial)
| # | Goal and steps | Expected | Happened |
|---|---|---|---|
| J1 main | "Start my free trial": GET `/api/public/plans`, wait 4 s, POST `/signup` with the email, password, firm, CA and the 3 terms, then open the email and confirm | 202, one email, then verify makes the firm and returns Checkout | 202 in 55 ms, one pending row (team, MONTHLY, 3 terms, no password). **No email reaches anyone in the running app**: `LocalSignUp` keeps it in memory and mail is `fakeMail`, so verify cannot be reached there. In the harness: firm PROVISIONING, Owner, acceptances, Checkout with `if_required` and pause |
| J1b again | The same email again, then in capitals | Same answer, still one pending row and one email | 202 both times, one row (lower case) |
| J2 error | No terms ticked; then a short password, a 1-letter firm name and US | 400 with each field named | 400 `acceptedTerms: …`; 400 with password, firmName and countryCode named. With `{}` the names are lost (review Minor 3) |
| J3 bot | Honeypot filled | Same 202, nothing stored | 202, no row |
| J4 link | Opening the link (a GET of `/signup/verify`) | Changes nothing | 404, nothing changed |
| J5 bad link | A junk token, then a malformed body | The same 404 | Same 404 both times, plain words "Sign up again, or sign in." |
| J6 text | A long name in Chinese and French | Stored as typed | 202, stored exactly |
| J7 limit | 11 quick tries from one address | 429 after 10 | 429 from the 4th (counted with the earlier calls from the same IP), plain "Wait a few minutes" |
| J8 recovery | Stripe down at verify (harness) | The firm is kept, with a next step | PROVISIONING, `checkoutUrl: null`, "Sign in to finish starting your free trial." (the route for that comes in part 2) |
| J9 restart | Form loaded, server restarted, then sent (code reading plus the breaker's run) | Accepted, or told to reload | **Silent 202, nothing stored or sent** (review Major 3) |

The data underneath held: one row per email, values exactly as typed, no password anywhere, and an audit line per change with `firm.created` written last (harness).

## Break pass
I adopt the breaker's report on this commit (`break-report.md`): an attacker can hold an email's sign-up and later own the firm (Major 2); timing shows a known email (Major 4); the 2-hour stamp or a restart loses a real sign-up (Major 3). Two-tab double verify: one firm, the other 404 (harness).

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Done in the harness; in the running app verify is unreachable (J1) |
| Next step obvious | ½ | "Check your email" is clear; "Sign in to finish" waits on part 2 (J8) |
| Plain words | 1 | Every problem text is plain (J2, J5, J7) |
| Feedback and state | ½ | A silent 202 when nothing was sent (J9) |
| Correct data | 1 | One row, exact values, acceptances and audit (J1, J1b, J6) |
| Error recovery | ½ | A mistyped password blocks the email for 24 h (Major 2); Stripe down is handled (J8) |
| Accessibility and screen sizes | ½ | No screen; field-keyed errors only partly (J2) |
| Speed | 1 | 4-55 ms per call |
| Visual quality | ½ | No screen to judge (N/A, counted as ½) |
| Trust and sources | 1 | Prices only from Stripe, never invented; "+ applicable taxes"; Sample plans and terms labelled |
| **Total** | **7 / 10** | No criterion at 0; **below the pass mark of 8** |

Fixes that raise the score, most valuable first: (1) a config-shared form key and a visible "reload" for a stale stamp (feedback, recovery); (2) the environment-gated ports (review Major 1), so a deployed door says plainly when sign-up is not set up; (3) the ruling and fix on the held sign-up (recovery); (4) field names on every error (accessibility).

Could not test: a browser, axe, widths or keyboard (no screen yet); a real screen reader; an intended user's unaided walk (D17 and D20 stay with the founder); real Stripe or Cognito.
