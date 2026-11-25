# QA-777 journey test (reviewer), 24 Nov

PR #3498 head 75747bc2f85c51bb642b45960ee7b72b4ece79ca. The door `POST /api/public/consultation-agreements/open` has no client page on
main, so the walk is what a client's browsers send: three Playwright browser contexts (each its own cookie jar) against an isolated
copy (`isolated.sh rvj777 4437`, `PLATFORM_IDENTITY=local`, stopped after). Set-up as the qa replay: Client C (licensed Case Officer)
books Client P; the copy's poller emails the link; the link and codes come from the copy's demo inbox. Sample data, US$0, no live mail.
The script was a temporary file next to the qa replay, deleted after the run. Result: 7/7 asserted steps passed; times 11-64 ms.

## Journeys (persona · goal · expected)
* J1 main, Client P on a laptop (A): "sign the agreement before my meeting". Look → asked for the code; agree → code emailed, consent
  not yet recorded; type the code → signing link, cookie set, consent recorded once; reload → link with no code.
* J2 someone holding the forwarded link (B): agree, plain look, forged 43-char cookie, malformed cookie → always "code needed", no link,
  never a 429; explicit resend within the minute → 429.
* J3 boundary: B sends A's copied cookie value → gets the link (bearer by design, as 4b; HttpOnly keeps scripts from reading it).
* J4 error: B types six made-up codes → five 422, then 423 for B; A's live session still gets the link.
* J6 recovery: the client types a new code on the phone (C) → the phone gets the link; the laptop's old cookie is asked for a code.
* J9 double click: the right code sent twice at once → one 200 with the cookie, one 422 CODE_EXPIRED; A then reloads fine.
* J7 expiry: session and its paired check moved 31 minutes back in the database → A's cookie is asked for a code.
* J5 within a minute: B's plain visit → 200 code needed (no email); B's resend → 429.
* Boundary to the next screen: the answer's link is the provider's embedded link (fake adapter `signing.fake.invalid`); signing itself
  and the provider's "signed" are covered by check_fo3c M2/M3 (run: 46/0).

## Data underneath (J1)
`consented_at` set once, after the code; `session_sha256` 64 hex and not the cookie; `code_verified_at = session_expires_at − 30 min`.
Cookie: `Path=/api/public/consultation-agreements/open; Max-Age=1800; HttpOnly; SameSite=Strict` (Secure off on local, on elsewhere);
none sent to `/api/public/sign/<token>`. Body never carries `session`. Every answer `Cache-Control: no-store` (200, 422, 423, 429).
Audit, in order: sent · opened (client) · code emailed · code right · consent recorded (client) · wrong codes · lock · later codes.

## Findings
* Minor: the first plain look and the within-a-minute visit answer `codeNeeded: true, codeSentTo: "the email address this link was
  sent to"` although no email went out (J1 look, J5; service.ts:433-435, :473).
* Minor: a link holder locks the client out with made-up codes, no code ever emailed (J4 counted EXPIRED guesses; older behaviour, see
  review m2).
* Minor: double click on the right code shows a 422 "Code expired" beside the success and counts a failure (J9).
* Not run here, from reading and the breaker's report: provider error on the code request loses the cookie (review m3); decline racing
  the consent write gives a 500 (review m4).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1: link after the code; J2: B never gets it |
| Next step obvious | ½ | "code needed" plus "sent to your email" when nothing was sent (J1 look, J5) |
| Plain words | ½ | "That code has expired. Ask for a new one." to guesses when no code was ever asked (J4) and on a double click (J9) |
| Feedback and state | ½ | J9 double click shows an error after success; `codeSentTo` claims a send |
| Correct data | 1 | consent once, after the code; only the hash stored; pairing exact (J1 row) |
| Error recovery | ½ | lockout by a link holder (J4); provider error leaves the client stuck up to a minute (review m3) |
| Accessibility and screen sizes | 1 | N/A: no page on main (P-26); counted 1 |
| Speed | 1 | 11-64 ms per call |
| Visual quality | 1 | N/A: no page on main; counted 1 |
| Trust and sources | 1 | audit lines in order, Sample labelled, no token or code in them |

**8/10, pass (no criterion at 0).** To raise it, most valuable first: answer `codeSent: false` when nothing was emailed; refuse a code
check when no live code exists (4b's `checkCode`); treat a second submit of the code just verified as success for the same browser.

## Could not test
A client page (none exists), a real screen reader, an intended user's unaided walk (D17, D20 stay with the founder), the live provider.
