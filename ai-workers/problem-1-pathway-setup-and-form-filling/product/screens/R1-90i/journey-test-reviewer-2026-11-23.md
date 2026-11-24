# R1.90 invited sign-up (API only): journey test, reviewer, 23 Nov 2026

PR #3040, head `bacf188d8a9aa8bf1bdb3afd9f94728775457b9a`. Isolated copies: 4438 (both local identity stand-ins), 4439 and 4440 (PLATFORM_IDENTITY=local). API only, so the journeys were walked by HTTP calls (curl) and checked with psql; there is no screen yet (the `/sign-up/invited` screens row). Personas: our Platform Owner or Admin (staff), the invited firm owner (a sales-led firm), and a stranger.

## Journeys
1. **Main.**
   * Our Platform Owner makes a link: 201, the link shown once with its 14-day end.
   * The invited person opens it: GET 200 with the email, the plan, the period and the current terms.
   * They send the password, firm name and terms: 202 "check your email", `sentTo`.
   * They confirm from the email: 200, one firm, `PROVISIONING`, on the link's plan and period, in `TRIAL`.
   * The link is now used with its firm, and reopening it gives 404. Held: IS1-IS3, 11/11.
2. **Alternate:** a Platform Admin makes a link → 201, the email made lower case. Held.
3. **Wrong role:** Support → 403, a firm Owner's token → 403, no session → 401, no reason → 400. Held.
4. **Bad input from our staff:**
   * Unknown plan, bad email, an extra `firmId`, period `WEEKLY` → 422, each naming its field in plain words.
   * A reason over 500 characters → 400 "Shorten the reason". Country US → 422. Held.
5. **Bad input from the invited person:**
   * An `email` field in the body → 422 "not a field of this form".
   * No terms → 422 on `acceptedTerms`. Held.
6. **Expired:**
   * A link past 14 days → 404 on GET and POST (IS4).
   * A link that expires between the form and Confirm → 404, no firm, link still unused (4440, by hand).
   * Recovery: the person can only ask us for a new link, but the 404 words say "Sign up again, or sign in." (m5).
7. **Recovery from repeats:**
   * Two forms at once → one live pending sign-up.
   * Two Confirms at once → one firm (200 and 404).
   * A link for an email that already has an account → 202, and the "already have an account" email. Held.
8. **Plan withdrawn after the link was made:** GET → 409 "The plan on this link is no longer offered. Ask us for a new link." Held.
9. **Break it:**
   * `…/signup/a.b`, `…/abc~def` and a 70-character token → **500** on GET and POST (M1).
   * 120 random GETs → all 404 with no 429 and, wrongly, no `platform.bypass` line (M2, m1).
10. **Across the boundary:** the link points at `/sign-up/invited#token=…`, a page the screens row will build. Not walkable here.

## Data underneath
* One firm per link.
* The link is used with that firm's id.
* Only the token's sha256 is stored.
* `plat_system_audit` has one ALLOWED line with the reason per link made. A 422 body after the guard is also logged ALLOWED, which is PF-4s's guard behaviour.
* Neither the token nor the email appears in `api.log`, in the `platform.bypass` details or in the system audit.
* Refused link opens leave no bypass line (M2).

## Score (0, ½ or 1 each)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journey 1 end to end; 11/11 |
| Next step obvious | ½ | 202 says check your email; the 404 for an invited person points to self-serve, not "ask us for a new link" (m5) |
| Plain words | 1 | Every 422 names its field in plain words; the PLAN_GONE and reason words are clear |
| Feedback and state | 1 | 201 with `expiresAt`; 202 with `sentTo`; 409 plan gone |
| Correct data | 1 | Firm `PROVISIONING\|firm\|YEARLY\|TRIAL`; link used with its firm; one firm under a race |
| Error recovery | ½ | Malformed token → 500 (M1); an expired-before-Confirm person has no path but a new link |
| Accessibility and screen sizes | ½ | No screen in this PR (the screens row); not testable, not scored 0 (P-26) |
| Speed | 1 | Max: GET 25 ms, invited POST 138 ms, verify 65 ms, make-link 29 ms |
| Visual quality | ½ | No screen in this PR; as above |
| Trust and sources | 1 | Plans labelled "(Sample)"; terms versions and tax note on the GET |

**8/10: pass** (no criterion at 0). Fixes that would raise the low criteria, most valuable first:
1. M1: 404 for a malformed token.
2. A link-specific 404 detail ("ask us for a new link").
3. The screens row's browser checks (a11y, sizes, visuals).

## Could not test
* Real Cognito (local stand-in only).
* A real screen reader, or a browser walk of `/sign-up/invited` (not built).
* An intended user's unaided walk (D17 and D20 stay with the founder).
