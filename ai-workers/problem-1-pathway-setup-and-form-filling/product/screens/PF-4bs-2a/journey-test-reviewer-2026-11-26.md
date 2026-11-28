# PF-4bs part 2a: journey test, reviewer role (26 Nov 2026, head 6ab56db7c)

* **Scope:** API only, so there is no page to walk. The journeys were walked over HTTP against an isolated copy on :4439.
  * Settings: `PLATFORM_IDENTITY=local`, `PLATFORM_SAMPLE_SEED=on` and a fixed `PLATFORM_LOCAL_SECRET`. The copy was stopped afterwards.
  * The authenticator was an independent RFC 6238 script fed the base32 key the door returned, as an app would be.
  * The data was checked in the copy's database.
  * The break pass used a scratch copy of the studio (scratchpad) with a test clock.
* **Not applicable, no page:** browser walk, axe, widths, keyboard. These come with PR 3.

## Journeys (persona · goal · result)
1. **First sign-in (the firm's Representative, never signed in).** "Let me in and set up my app."
   * Password: 200 `step:"set-up"` in 54 ms, with `key` (32 base32 characters), an `otpauth://` link, the words "Install an authenticator app…", and `Cache-Control: no-store`.
   * The app's code then gave 200 `{token, tokenType, expiresIn}`.
   * Hand-over: `/api/platform/me` answered 200 as that person in `sample-firm`. **Held.**
2. **Returning sign-in (same person).** Password gave `step:"code"` with no key; the next code from the app gave 200. **Held.**
3. **Older session ends (AG-1-55).** After journey 2, journey 1's token got 401 on `/me`.
   The audit shows "first session", then "their older session was ended", one line each. **Held.**
4. **Wrong code, then the right one (recovery).** "12345" gave 401 `CODE_REFUSED` "That code didn't work. Check the code in your authenticator app and try again." The right code then worked. **Held.**
   * Words: the problem's title is "Sign in again", which contradicts "try again" (Minor).
5. **Double click on the code step.** Two parallel posts gave one 200 and one 401 `SIGN_IN_REFUSED` "That email and password don't match.". There was one token and one sign-in line, which is correct.
   * The losing answer's words blame a password the person did not type at this step (Minor).
6. **Wrong password and unknown email (a stranger).** Both full answers (status, headers, body) were byte-identical apart from the date. **Held as an answer.**
   * Timing differs: on the live copy a known email took 8.5-19 ms and an unknown one 2.1-4.8 ms (Major 1 in `review.md`).
7. **Deactivated person with the right password.** 401 `STAFF_NOT_ACTIVE` "This staff account is not active. Ask your firm's Owner or Admin.", with one `sign_in_refused (not active)` line. **Held.**
8. **Bad input.** An email with a space gave 422 `EMAIL_INVALID` with its words. An unknown field or a missing field gave 422 (suite). An empty password gave 401. **Held.**
9. **Slow person (15 minutes) and a changed attempt.** Covered by the suite with a test clock: 401 `ATTEMPT_EXPIRED` "That took too long. Start again.". A changed or other-purpose attempt gave 401 `SIGN_IN_REFUSED`. **Held.**
10. **Too many tries.** 5 wrong passwords: the right one also gets the same 401, and the provider is not asked. 25 refusals from one address gave 429 `TOO_MANY_TRIES`. Both recover after 15 minutes. **Held as built.** The break pass found the gaps below.

## Data underneath
* Each sign-in wrote one `platform.staff.sign_in` line on the person's firm, with `last_sign_in_at` set and the older session ended.
* A refusal for a known person wrote one `sign_in_refused` line on their firm. An unknown email wrote none.
* The Sample password appeared in no audit line and in nothing the check printed.

## Break it (15 minutes)
* **Major: the second step can be brute-forced by someone who has the password.**
  * 30 fresh attempts with 4 wrong codes each gave 120 wrong codes from one address in one window. None was throttled, and the right code still worked afterwards.
  * With a slow provider, 40 parallel wrong codes on one attempt reached the provider 40 times (limit 5).
* **Major: two clients behind one load balancer share one count.** Different `X-Forwarded-For` values make no difference: client B got 429 after client A's 25 refusals.
* **Major: timing tells a stranger which emails belong to staff.** See journey 6 (harness medians 8.03 ms against 2.33 ms).
* **Minor: memory.**
  * 2,000 bad-email requests from 2,000 addresses left 2,001 keys in the per-address count. The 50,000 cap is checked only when a failure is added, and empty keys stay.
* **Minor: refusal lines.** A stranger can write 24 refusal lines on one person per address per window.
* Long text: the email is capped at 320 characters by the input rule, then refused by the email check (422). The password is capped at 1000 characters (422 over it).
* Wrong role or other firm: not applicable. These are public doors, and the person is read as their own firm only.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1-2: token, then `/me` 200 |
| Next step obvious | 1 | `step` is `set-up` or `code`; set-up carries the key, the link and the words |
| Plain words | ½ | Journeys 4-5: the "Sign in again" title on a wrong code; a used attempt worded as a wrong password |
| Feedback and state | 1 | A distinct code for each outcome (`CODE_REFUSED`, `ATTEMPT_EXPIRED`, `TOO_MANY_TRIES`, `STAFF_NOT_ACTIVE`) |
| Correct data | 1 | One sign-in line, older session ended, refusal lines on the right firm |
| Error recovery | 1 | Journey 4; the limits clear after 15 minutes |
| Accessibility and screen sizes | N/A | No page (PR 3) |
| Speed | 1 | 54 ms first sign-in; refusals 2-19 ms |
| Visual quality | N/A | No page (PR 3) |
| Trust and sources | ½ | Sample and Unconfirmed are labelled, but the second step can be brute-forced and timing reveals staff emails (Majors) |

**7 of 8 applicable criteria, which is 8.75/10 scaled; I report 8.5/10. Pass (8 or more, no 0), but the review's verdict is Block on the three Majors.**
Fixes that would raise the low criteria, most valuable first:
1. Count wrong codes per person and per address, and reserve the attempt's try before the provider call.
2. Give door-1 refusals the same answer time.
3. Reword the used-attempt answer and the wrong-code title.

**Could not test:** Cognito (part 2b), two real tasks, a screen reader and the page (PR 3). D17 and D20 stay with the founder.
