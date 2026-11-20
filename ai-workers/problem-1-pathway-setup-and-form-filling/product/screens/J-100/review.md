# J-100 review: PF-5v part 2 (QA-481), R1.100 (PR #2456)

Reviewed commit `ee4adb074b9bc48a8636e7867bda3fc9fe829a64` (branch `claude/jolly-euler-jtwv60`), diff `origin/main...ee4adb07`. Reviewer: Opus, independent (I did not build it). This is a runtime row, not a new screen: the screens are PF-5t part 2's (#2135, already reviewed). There is no `concept.md`, so the bar is R1.100's Done when (`qa/CAPABILITIES.md`), QA-481 (`qa/BUGS.md`), `WAY-OF-WORKING.md` "Every PR", `STANDARDS.md` and `api/src/platform/MODULE.md`. Versions and wording are Sample. **Unconfirmed: no counsel.**

**Verdict: Ship after fixes (Block on M1).** Journey score **8.5/10** (`journey-test-reviewer-2026-11-20.md`).

## What I ran (isolated copy `rv100` on :4510, PLATFORM_IDENTITY=local; stopped after each run; screenshots the journey overwrites were restored)
* `tests/journeys/j_100.ts`: **21/21, exit 0, twice.**
* Mutation: I removed `mail` from `new LocalSignUp(…)` in `runtime-ports.ts`. W2 then prints FAIL ("the inbox is empty"), and the walk stops with `STOP no verification link`, exit 1. So it **fails on the fake (P-606) and fails loudly**. Reverted.
* `tests/check_pf5v_signup_mail.ts` 13/13. `graph.mjs --check`: G1 0, G2 0.
* API log (`var/isolated-logs/rv100-api.log`): no code, password or mail body in any line. `platform.account.mail` runs after the 202, in the POST's own scope (same correlation id), nested in `platform.firms.signup`.
* Break script (scratchpad only): sign up, verify, then sign up again 4 times with the Owner's address (results under M1).

## R1.100 clause by clause
| Clause | Verdict | Evidence |
|---|---|---|
| Sign-up cannot finish without accepting the current versions | Met (by the door's API; the form is PF-5s) | W1: none and two of three both get 400 at the field, and nothing is stored or mailed. W2/W3: the email reaches the inbox and its code confirms the sign-up. A version published between sign-up and verify is asked at sign-in (`terms/service.ts` pending: "or exists an acceptance of that kind"; PF-5t break M2 is fixed). The old-version refusal is not in J-100; it is in the qa walk. |
| Who, when, which version stored and shown | Met | W3 SQL: 3 rows with Owner, accepted_at and version, plus 1 audit line. Settings → Terms shows Who, Terms, Version, For and Accepted (`w5-settings-terms-1440.png`). The journey only asserts the version (m3). |
| A new version asks again at the next sign-in | Met | W5: the terms page lists only the new ToS, calls answer 428 until "I accept", then 200, and a 4th row shows. The version is published by SQL insert: no product route publishes terms (our team's console), so this is not P-33 scaffolding for this row. |

## Issues
**M1 (Major, Must): an anonymous person can use the sign-up door to fill a trial firm's daily email limit with "You already have an ExpatReady account" emails. That firm's client mail is then held until the next day.**
* Where: `signup.ts:144` (main's line, made live by this PR through `runtime-ports.ts:29`). The email names `firmId: known`, so `MessagesMail` writes it as that firm's FIRM row. It counts in `msg_send_counter` against `DAILY_CAP.TRIAL = 50` (`ports/messages.ts:20`; PROVISIONING firms also use the TRIAL limit).
* It goes out From the firm's operating name with Reply-To the firm's contact address. Its outbox write runs under the `platform.firms.signup` bypass, a use whose "why" does not cover writing a firm's messages. The PF-19p review relied on "a firm email never runs under the bypass".
* Failing scenario (run): sign up, verify, then POST the same form 4 more times. Result: 2 "already" emails, firm outbox `FIRM:DELIVERED:TRANSACTIONAL ×2`, and `msg_send_counter` for that day = 2. The per-address limit is 3 an hour and is kept in memory, so one public address (the Owner's, which is also the contact address) fills 50 in about 17 hours, and 3 known addresses in about 6. After that, booking confirmations and invitations are held ("held by the daily limit").
* Before this PR it went to `fakeMail()`, so nothing was counted.
* Fix: send it as a platform account email (`platformAccount: true`, no `firmId`). That means no firm limit, From ExpatReady, and the `platform.account.mail` use that already names this route. Add a pass/fail line to the check.

**Minors (Should; fix here or list as follow-ups)**
* m1. `signup.ts:150-160` with `signup-identity.ts:40`: the verification email is committed and dispatched before the pending row's transaction. If that transaction fails (database error, lock timeout), the person gets a valid-looking code and link that answer 404. PF-19p already prepared the safe path: `sendIn` inside the door's transaction (`mail.ts:52-58`, `messages.ts:131-132`). The current order mirrors Cognito, and the failure is rare. Fix, or record why the order stays.
* m2. `signup-identity.ts:39`: the comment "a retried send never mails the code twice" overstates what the key does. The key `signup:<subject>` is new on every `register`, and nothing retries `register`. Each door submission is a new email by design (PF-5 break M2). Reword the comment.
* m3. `j_100.ts:102` checks only the row count and that a version string appears. All three Sample versions are `sample-2026-11-15`, so any 3 rows pass, and who and when are never asserted although the clause says "shown". `j_100.ts:107` (the "P-606, before" judge) cannot fail: `v2` is a fresh random string. Assert the Owner and a date per row, by kind.
* m4. `check_pf5v_signup_mail.ts:64` (DW3 "fail") cannot fail: `other` is never handed to anything. `:54` (DW1 "fail") checks only the in-memory copy. The real guard against falling back to fakeMail is the source regex on `inject: [MESSAGES_MAIL]` (`:67`). After the #1959 merge, that regex still passes if the inject moves to `BILLING_PORTS`. Make the fail lines able to fail.
* m5. CI at this head: `pr-rules` fails with "MISSING: no Done when". `module-cards` fails because `api/src/features/MODULE.md` was not updated and the body has no `Card unchanged:` line. The Checks section still says `SUITES_RESULT` (a placeholder). These are body fixes.
* m6. `signup.ts:144`: the "already" email links to `${appUrl}/sign-in`, which is the demo's simulated-people picker (`web/src/pages/sign-in.tsx`, BK-4a). The firm's sign-in card is at `/account`. This is main's line, but this PR makes the email reachable for the first time. It folds into M1's fix.
* m7. `j_100.ts:18,25`: the copy port 4500 is outside the runtime range 4430–4439 in WAY-OF-WORKING, and `walk.mjs` uses the header's port.

## Overlap with #1959 (open, `mergeable: false` already)
#1959 rewrites the whole `features/platform-firms.ts` export (it adds the billing ports and the interceptor) and keeps `useFactory: () => runtimeSignUpPorts()`. Whoever merges second has to keep `(mail) => runtimeSignUpPorts(undefined, undefined, undefined, mail), inject: [MESSAGES_MAIL]`. If they don't, the app falls back to fakeMail and QA-481 comes back. J-100's W2 and the DW3 regex would both catch that. `runtime-ports.ts` changes do not overlap (#1959 only appends). `signup.ts` has no conflict.

## D1–D20 (runtime row; screens unchanged)
D1 met (all three clauses, by API plus PF-5t's screens) · D2 met (one pending row; replaced on re-sign-up) · D3 met (reuses MESSAGES_MAIL and PF-19p) · D4 N/A · D5 partly (m1: code without a pending row; M1: the firm's mail held) · D6 met (acceptances with who and when; audit) · D7 N/A (no AI) · D8–D14 unchanged from PF-5t part 2 (#2135) · D15 met (mail in the inbox in under 0.5 s) · D16 partly (the journey fails on the fake; m3 and m4 are vacuous lines) · D17 and D20 simulated only · D18 met (Sample and "Unconfirmed: no counsel" shown) · D19 partly (the sign-up form, check-your-email and confirm screens are PF-5s).
BIC-01–BIC-20: N/A. This is not a case-side screen, and nothing visible changed. BIC-20 for the terms screens is in PF-5t's review.

## Could not check
A person signing up through a form (PF-5s is not built; the email's `/sign-up/verify` link opens no page yet). The PR's Question on scoring R1.100 by API steps is for the tech lead. `walk.mjs` with video (I ran the journey directly). A real screen reader. Cognito's sign-up (PF-5 part 2).

Verdict: Block
* M1: send the "already have an account" email as a platform account email, not a firm message (`signup.ts:144`), with a test that fails when it counts against a firm.
