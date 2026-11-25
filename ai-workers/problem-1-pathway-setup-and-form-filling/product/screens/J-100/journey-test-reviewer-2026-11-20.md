# J-100 journey test (reviewer), 20 Nov 2026: R1.100 on PR #2456 at `ee4adb07`

Isolated copy `rv100` on :4510 (PLATFORM_IDENTITY=local; never :4400), headless Chromium at 1440 px; live AI off; US$0. Sample versions. **Unconfirmed: no counsel.**

## Journeys (persona: a firm owner signing up; then the same Owner at a later sign-in)
1. **Main path.** Accept all three, read the email in the inbox, confirm, sign in, check Settings → Terms. Held: 202 "check your email", then the email "Your ExpatReady verification code" with the code and link in under 0.5 s; the code makes one firm and one Owner; the sign-in card goes straight to My account; Settings → Terms lists 3 rows with Who, Terms, Version, For and Accepted.
2. **Refusal.** Accept none, then two of three. Held: 400 at the field, "acceptedTerms: accept the current terms of service, privacy notice and data-processing terms". Nothing stored, nothing mailed.
3. **Bad input.** A wrong code. Held: 400 "That code is not the one we sent. Type the 6 digits from the email." No firm.
4. **New version.** A new terms of service (Sample) is published, and the Owner signs in again. Held: "We've updated our terms of service." lists only the new one with its link; every firm call answers 428 until I accept, then 200; Settings → Terms shows the 4th row.
5. **Already registered.** The same address signs up again. Held: the same 202 answer and the "You already have an ExpatReady account" email. Broke: see the break pass.
6. **Boundary.** The email's link `/sign-up/verify#…` opens no page (PF-5s is not built). Confirming takes an API call.

## Automated replay
`tests/journeys/j_100.ts`: 21/21, exit 0, **twice**, no page errors. Mutant (the stand-in given no MailPort): W2 FAIL and STOP, exit 1, so it fails on the fake and fails loudly. Not in the script: axe, 400 and 1024 px, a keyboard-only path (the screens are PF-5t's; its pack covers them).

## Data underneath
One `platform_signup_pending` row holding 3 version ids, marked VERIFIED when used. 3 `platform_terms_acceptance` rows (the Owner, accepted_at, one per version) and 1 `platform.terms.accepted` audit line. A refused sign-up writes 0 rows. A platform account outbox row (no firm) for the verification email. The API log holds no code, password or mail body.

## Break pass
* **Major:** each "already have an account" email is a FIRM outbox row counted against the firm's daily limit (`msg_send_counter` = 2 after 2 emails; TRIAL limit 50). One public address fills it in about 17 hours, and the firm's client mail is then held. It is also sent From the firm's name (review M1).
* **Minor:** the email is committed before the pending row, so a failed pending transaction leaves a dead code (review m1).
* **Minor:** the "already" email's Sign in link goes to the demo's person picker, not `/account` (review m6).
* **Held:** double submit and re-sign-up each leave one live pending row (the newest replaces the older); there are at most 3 emails per address per hour.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | 21/21 twice; sign-up → confirm → asked again → accepted |
| Next step obvious | ½ | The email's link opens no page yet (PF-5s); the "already" link opens the demo's person picker |
| Plain words | 1 | Refusals, the terms page and Settings → Terms in plain words |
| Feedback and state | 1 | 202 "check your email", the terms page, 428 then 200, a 4th row shown |
| Correct data | 1 | 3 acceptances (who, when, version), audit line, nothing on refusal |
| Error recovery | ½ | Wrong code handled; a dead code if the pending transaction fails; the firm's mail can be held (M1) |
| Accessibility and screen sizes | ½ | 1440 only in this journey; no axe or keyboard here (PF-5t's pack covers the screens) |
| Speed | 1 | Email in the inbox in under 0.5 s; pages under the budgets |
| Visual quality | 1 | `w4-*` and `w5-*` screenshots are clean and match the team look |
| Trust and sources | 1 | "Wording Sample. Unconfirmed: no counsel." on both screens |

**8.5/10, no 0: pass.** The review blocks on M1, a risk outside the score. To raise the score: open the confirm page (PF-5s), send the "already" email as a platform account email linking to `/account`, and add axe, 1024 px and keyboard steps.

Not tested: an intended user's unaided walk (D17, D20 stay with the founder), a real screen reader, the video walk through `walk.mjs`.
