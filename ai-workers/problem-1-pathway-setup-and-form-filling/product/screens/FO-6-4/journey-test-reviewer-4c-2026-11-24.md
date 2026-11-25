# Journey test, reviewer: FO-6 part 4c (API, plus the local-only stand-in signing page), 24 Nov 2026

**Commit:** `cb742468eb2eb489cc03407610a05fd296b8ebb3`.

**Setup:**
* An isolated copy, `rev4c`, ran on :4437. That port is in the runtime range. The copy had a 60-minute time limit and was stopped afterwards. :4400 was never used.
* Settings: `PLATFORM_ENVIRONMENT=local`, `PLATFORM_IDENTITY=local`, the fake adapter, local mail, and no `STUDIO_PUBLIC_URL`.
* For speed, the firm's email code was switched off by SQL. With the code off, consent starts the session (rule 8). 4b's suite already covers the code path.
* The Playwright script ran headless Chromium. It was temporary: kept in the gitignored `studio/var/` and deleted afterwards.
* The screenshots are in the session scratchpad and are not committed. The builder's screenshots are in `screenshots-4c/`.
* The whole replay ran twice with identical results. It was run once with `bypassCSP` so axe could load, and once without it, to see the real CSP.

## Journeys (persona · goal · steps · expected → result)
1. **Client (main path, keyboard only, 1440 px).** Goal: "sign my agreement".
   * Steps: open the session link, press Tab, press Enter.
   * Expected: the page is on the copy's own origin; it shows no name or email; one Sign button; "Signed".
   * Result: **held.** The page loaded in 27–33 ms, and Tab landed on "Sign". Signing took 74–84 ms and showed "Signed. You can close this page." The request and the retainer both read CLIENT_SIGNED, with 1 receipt and 1 `signing.signed` line.
2. **Client, recovery: reload or reopen a used link.** Expected: a readable 404, not raw JSON.
   * Result: **held.** The answer was 404 `text/html`, reading "This test link does not work. It may have been used already or be more than 10 minutes old…". Reloading the POST gave the same page.
3. **Wrong role.** A case officer who sees every prospect but is not the representative asks for the firm link.
   * Expected: 403. Result: **held.** 403 NOT_THE_REPRESENTATIVE, "Only the agreement's representative signs it for the firm."
   * An unknown or other firm's id gave 404, and a malformed id gave 404.
4. **Representative (errors, then the main path).**
   * Errors: `{}` gave 422, with field words. An extra field gave 422. An old consent wording gave 409 CONSENT_CHANGED, "Open the agreement again to read it."
   * Two calls at the same moment gave 200 and 200, with **one** `signing.consent_recorded` line by `staff:<id>`. The stored consent text version is `sign-electronically-v1`.
   * The page was opened at 1024 px and at 400 px with no sideways scroll.
   * Pressing Tab then Enter at 400 px gave "Signed". The request and the retainer read SIGNED, and the files were stored by part 3.
   * Reloading the representative's other link gave the 404 page: signing ends every link that signer was given.
   * The firm link after SIGNED gave 409 NO_LIVE_REQUEST. **Held.**
5. **Representative too early: the firm link before the client signs.** Expected: 409, nothing written. Result: **held.** 409 CLIENTS_FIRST, "The firm signs last, after every client has signed." The FIRM `consented_at` stayed null.
6. **Client: two tabs press Sign at once.** Expected: one signature.
   * Result: **held.** One tab showed "Signed", the other the 404 page. The request read CLIENT_SIGNED, with 1 `signing.signed` line.
7. **Client after the firm withdrew (QA-770).** The withdraw came after the client had opened the session.
   * Result: **held.** The page still opens, because the fake is not told of the withdraw (that is FO-5d's job). Sign answers "The signature was not recorded (the agreement is withdrawn). Ask the firm to send it again."
   * The request stayed VIEWED and the signer stayed unsigned. The firm link answered 409 NO_LIVE_REQUEST.
8. **Break it: hostile nonce shapes.** Tried `x`, 43 characters, 44 characters, `../../hooks/signing/fake`, `%3Cscript%3E`, and a POST with a JSON body. Result: **held.** Every one gave 404.

## Data underneath
* After J1, J4, J6 and J7, the database matched the expected result.
* Only the requested rows changed. The audit lines are present with the right actors: `staff:<id>` for consent, the signing actor for the webhook steps.
* Roles were enforced on the server (J3).
* Escaping of a hostile title is proven by `check_fo6_fake_page.ts`. In this walk the page title was the fixed "Retainer agreement (version 1)".

## Accessibility, sizes, console
* axe (WCAG 2.0, 2.1 and 2.2 A/AA) found **0 violations** on 5 states: the page, signed, the used link, the firm page at 1024 px and at 400 px.
* `lang="en"`, an h1 and an h2, and role=status and role=alert on the results.
* 400 px is equivalent to 1440 px at about 360 % zoom. There was no sideways scroll at 400 or 1024 px.
* The only console errors were the CSP blocking the reviewer's own injected axe script, and the expected 404 loads of used links.

## Findings (detail and file:line in review-4c.md)
* **Major (tests, not behaviour):** CLIENTS_FIRST, the firm link's retainer-state refusal and consent-once all behave correctly here (J4, J5, J7), but no suite line fails when they are removed.
* **Minor (words):**
  * The fallback refusal can show a raw code, e.g. "(NOT_YET)".
  * "Ask the firm to send it again" is shown for a withdrawn agreement.
  * The used-link page tells a person who has just signed to "Open the signing link again".
* **Minor (recovery):** after a failed or refused delivery, the fake has already marked the signer signed, so retrying on the copy needs a new Send. This is local only.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 and J4: Send to SIGNED through the copy's own webhook door |
| Next step obvious | ½ | One button, then "close this page". But the used-link page and the withdrawn refusal suggest a remedy that does not apply (J6, J7) |
| Plain words | ½ | Mostly plain. A raw code can appear in the fallback refusal (`fake-page.ts:71,97`) |
| Feedback and state | 1 | "Signed", the refusal in words, a readable 404 page, role=status and role=alert |
| Correct data | 1 | 1 receipt and 1 line per step; consent once under a race; the withdrawn agreement stays unsigned |
| Error recovery | ½ | Double Sign and reload are safe. A failed delivery cannot be retried without a new Send |
| Accessibility and screen sizes | 1 | axe finds 0 on 5 states; keyboard Tab+Enter works; no sideways scroll at 400 and 1024 px |
| Speed | 1 | Under 40 ms to load and under 90 ms to sign (budget 1 s) |
| Visual quality | 1 | Clean, readable stand-in. No brand work, by the approved plan |
| Trust and sources | 1 | "Test signing page (no real signature)", a note box, no personal data, Sample |

**8.5 / 10. Pass** (8 or more, no 0).

To raise it, most valuable first:
1. Map the door's codes to words on the page.
2. Word the withdrawn and used-link outcomes truthfully.

## Could not test
* A real screen reader.
* An intended user's unaided walk (D17 and D20 stay with the founder).
* The vendor's real frame (FO-6v).
* The client's real page `/sign/:token` (FO-5s).
* The firm's button for the firm link (FO-5s).
