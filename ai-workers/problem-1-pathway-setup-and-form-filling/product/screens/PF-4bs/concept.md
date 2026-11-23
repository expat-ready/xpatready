# PF-4bs: staff sign-in on Cognito (password, one-time code, set-password callback, task-role actions, staging's first Owner) — concept r2

Row PF-4bs (R1.5; shaped by the screens lane, 23 Nov). Covers links **1, 4, 5** and **the callback of link 6** in Step 18 of
`reports/aws-staging-proof-2026-11-22.md` (branch `aws/2026-11-22-staging-proof`). Not here: link 3 and the Cognito half of
`createUser`/`handOff`/`redeem` (PF-4bc; it merges before PRs 3 and 4 here), link 2 (SES address check, the founder), passkey sign-in (a later row).
Requirements (`trace-requirements.py --brief PF-4b`, plus `--cite`): AG-1-10 (single-use expiring set-password invite),
AG-1-40 as changed by contracts §7 §1.2 (two-step for every staff member; authenticator app; no SMS; no email code),
AG-1-41 / AG-1-56 / AG1-D20 (sessions revocable; 28 days unused, then sign in again), AG-1-42 (step-up 5 min), AG-1-55 (one session),
AG-1-13 (seat check), AG-1-70 (staff account emails ours, through the one send path), SA-6-10 / BR-23 (first Owner at provisioning).
r2 answers `challenge.md` (verdict Rework: B1, B2, M1-M7, m1-m9); each change names the finding.

## 1. Facts (AWS's own text; not my words)
`docs.aws.amazon.com` is refused by this lane's network (proxy 403, 23 Nov). The quotes are AWS's API model text as shipped in
`@aws-sdk/client-cognito-identity-provider@3.1161.0` (already in `package.json`; the API reference is generated from it), read
23 Nov 2026. Developer-guide facts not in the model are marked **Unconfirmed**; the live list in §6 proves them on staging.
* F1 `CallbackURLs`: "Amazon Cognito doesn't accept authorization requests with redirect_uri values that aren't in the list of CallbackURLs"; "requires HTTPS over HTTP except for callback URLs to http://localhost".
* F2 AdminCreateUser: "Set to SUPPRESS to suppress sending the message"; "the user must enter the temporary password in the sign-in page, along with a new password"; the user stays in "FORCE_CHANGE_PASSWORD state until they sign in and set their password".
* F3 AdminSetUserPassword `Permanent`: "Set to true to set a password that the user can immediately sign in with"; "if you set a permanent password, their status becomes Confirmed".
* F4 Admin* operations: "you must use IAM credentials to authorize requests". InitiateAuth and AssociateSoftwareToken: "you can't use IAM credentials to authorize requests". AssociateSoftwareToken: "You can provide either an access token or a session ID in the request" (so a challenge Session is a bearer secret: M2).
* F5 `ADMIN_USER_PASSWORD_AUTH`: "Server-side username-password authentication with the password sent directly in the request"; enabled by `ALLOW_ADMIN_USER_PASSWORD_AUTH`.
* F6 `MFA_SETUP`: "use the session returned in this challenge from InitiateAuth or AdminInitiateAuth as an input to AssociateSoftwareToken. Then, use the session returned by VerifySoftwareToken as an input to RespondToAuthChallenge or AdminRespondToAuthChallenge with challenge name MFA_SETUP to complete sign-in." The challenge responses carry `USERNAME`.
* F7 `AuthSessionValidity`: "the duration, in minutes, of that session token. Your user pool native user must respond to each authentication challenge before the session expires". `RefreshTokenValidity`: default "30 days".
* Unconfirmed: each Admin* action takes the `userpool` ARN; Cognito's own lock-out numbers; whether AdminSetUserMFAPreference removes an enrolled TOTP (PF-4bc, m2).

## 2. Password and code: hosted page or our own page — **recommend our own page** (case restated, M1)
The hosted page is not impossible: a hybrid (our set-password page, then managed login for sign-in and the authenticator) would work, with one central
callback host passing the code on, a `UserPoolDomain` estate type and a changed OAuth check. Own page wins on these grounds, not "hard stops":
(1) the one-session rule, the sign-in audit and the rate limit live at our door (AG-1-55), and with the flows below nobody signs in around it;
(2) no per-firm callback list and no relay host; (3) the firm's look and our words, one page for invite, sign-in and (later) sign-up;
(4) no Cognito-sent email for the first password or a reset (AG-1-70). **Costs we take on:** brute-force defence is ours (Essentials has no threat
protection, Unconfirmed); Cognito's per-user lock-out becomes a tool to lock out any staff member by email through our door (mitigated by per-email
and per-IP limits, m3); passkeys on our page later need our own WebAuthn code; the password passes through our process (never logged, stored or
echoed; scanned in tests, m4). The planned custom email sender (`signup-identity.ts:10`) is not needed for staff sign-in; the sign-up door's plan stays its own (question 1).

**Doors (both adapters behind a new `SignInPort`, `session/sign-in.ts`, owned by this row):**
1. `POST /api/platform/session/sign-in {email, password}` → `200 {step:"code"|"set-up", attempt, key?, otpauth?}`; wrong password and unknown person
   both → `401 SIGN_IN_REFUSED` "That email and password don't match." Limits: per IP (from `X-Forwarded-For` with the load balancer as the one trusted hop)
   and per email, in the database so both tasks share them (m3); `ContextData` with the IP goes to Cognito.
2. `POST /api/platform/session/sign-in/code {attempt, code}` → `200 {token, expiresIn}` (the Cognito access token the guard already verifies); our
   `authenticate` runs before answering (sign-in recorded, older session ended, audit line). Wrong code → `401 CODE_REFUSED` (try again);
   expired → `401 ATTEMPT_EXPIRED` "That took too long. Start again."; tampered → `401 SIGN_IN_REFUSED` (M4).
3. **`attempt` is sealed** (M2): the existing secret box (`platform/secret-box/aes-gcm.ts`, AES-GCM, keys `PLATFORM_SECRET_BOX_KEYS`, already a
   service secret) seals {Cognito Session, username, step, expiry}. Stateless, works on either task, the browser never holds Cognito's Session, no new secret.
4. Staff client `AuthSessionValidity` 15 minutes (pinned by the check), so a first-time invitee can install the app; the set-up card says
   "Install an authenticator app first" before the password; a restarted set-up warns that the earlier app entry no longer works (M4).
5. Key as text plus an `otpauth://` link; **no QR** until a STANDARDS §1 entry (question 2).
6. **Client flows, both modes, both staff pools (B1, m1):** exactly `ALLOW_ADMIN_USER_PASSWORD_AUTH` + `ALLOW_REFRESH_TOKEN_AUTH`; SRP and `USER_AUTH`
   dropped (passkeys are not built: README "the app side that registers passkeys … is not built"); the pool's passkey settings stay for the passkey row.
   `passkeyFindings` (`service-checks.ts:271, :280`) and the README change to that one list; every other list is refused (tests).

## 3. The callback (link 6) and getting a new link (B2, M3)
`POST /api/platform/session/callback` keeps its door and its code-in-the-body rule; on `cognito` it never calls the local sign-in.
`{code}` → `200 {step:"set-password", email}` (nothing used; the page keeps the code in memory for the second post, m5); `{code, password}` →
under `pg_advisory_xact_lock(hashtext(sub))` (shared by both tasks, no migration): `redeem(code)`, AdminGetUser must say FORCE_CHANGE_PASSWORD
(else `401 SIGN_IN_CODE_REFUSED`), AdminSetUserPassword `Permanent` (a policy refusal → `422` with the rule, code still usable), then §2 step 1 →
`{step:"set-up", …}`. Two parallel posts: one set-up, one 401 (test).
**A new link (B2):** a staff member whose provider status is FORCE_CHANGE_PASSWORD gets "Send a new set-password link" (staff page, `agent/staff:manage`;
`POST /api/platform/staff/:id/set-password-link`, audited, through `MailPort`) and `tools/first-owner.ts --resend`. So a lost tab, an expired code or a slow
set-up never leaves a person stuck. Forgot-password (m7) uses the same signed-code mail for a CONFIRMED person: named, a later row.
Contract for PF-4bc (question 1): `handOff` returns an absolute `https://<app host>/sign-in/callback#code=`, the code sealed by the secret box
(subject, expiry 60 min: it now travels by email too), stateless; `createUser` sets `email_verified=true` (m6). `local` is unchanged.

## 4. Task-role actions and the deploy check (link 4)
Exactly seven, on the **staff pool's ARN only**: `AdminInitiateAuth`, `AdminRespondToAuthChallenge` (sign-in, code), `AdminSetUserPassword`,
`AdminGetUser` (callback, new link), `AdminCreateUser` (accept), `AdminSetUserMFAPreference` (reset two-step), `AdminUserGlobalSignOut` (sign-out
everywhere); the last three for PF-4bc (m2: right set, nothing missing). Not granted: the no-IAM calls (F4), `cognito-idp:*`, List*, Delete*, AdminDisable*.
Check: `ECS_TASK_ACTIONS` gains the seven; a new rule accepts a `cognito-idp:` action only on `Fn::GetAtt [<the pool PLATFORM_COGNITO_USER_POOL_ID
names>, Arn]` (never `own()`'s `Fn::Join`, m1). CDK assertion tests (`deploy/cdk/test/service.test.ts`): exactly the seven on the staff pool (pass);
an eighth action, `cognito-idp:*`, the own-staff pool, the clients pool, a joined ARN → each refused with its line.

## 5. Staging's first Owner (link 1; M5, B2, m8)
`tools/first-owner.ts`, run once as the service's own image (`aws ecs run-task` with a command override): `--firm <key> --email <address>`.
Refused when `PLATFORM_ENVIRONMENT=production` (tool and accept branch both), when any staff member of the firm has ever signed in (`last_sign_in_at`
set), or when the seat check refuses (AG-1-13). It writes one Owner invitation, `invited_by = system:first-owner`, 72 h, and mails it with an absolute
link (`/invitation#t=` today is relative, `identity/service.ts:395`: fixed for all invitations in this PR, host from the stack). Accept allows that
inviter only under the same three conditions, checked under the firm's lock; the audit detail says "Staging first Owner (one-off task)" (staging's firm is
Sample-seeded with Sample Owners, so "Firm created" would be false; grants have no reason column). `--resend` mails a new set-password link (§3).
Why not a user made by hand in the console: R1.5 must prove the product's own invitation route, and Cognito would send its own email.
Founder's steps: verify the address in SES once (link 2), run the printed command, open the email, set the password, add the app, type the code.

## 6. PRs (each under 800 lines, in order) and "Done when" (M7)
1. Deploy: flows both modes, `AuthSessionValidity`, the seven actions, the rules, CDK tests (exact lists; every refusal above).
2a. API on the local stand-in: `SignInPort`, the doors, sealed attempt, limits, audit (password = Sample; RFC 6238 over `node:crypto`).
2b. Cognito adapter on recorded responses (no network); one contract suite on both: pass; wrong password; wrong code; expired and tampered attempt; the password in no log line (our lines, Nest's exception filter, the SDK logger).
3. Web (after PF-4bc): sign-in card (password, then code), set-up step, set-password on `/sign-in/callback`, new-link button; browser suite 1440 and 375 px, axe.
4. Callback + new link + first Owner (after PF-4bc): replayed callback 401; two parallel posts; expired code then new link then sign-in; first-owner pass and its three refusals.
Each: suite exits 0 twice; Opus reviewer and breaker (permissions, public door); `Reviewer: Approve <sha>`; `ci` green.
**Staging proof (after merge; the founder's yes, not a merge gate):** invite → set password → set up → code → `/api/platform/me` 200; wrong code 401;
replayed link 401; SRP and USER_PASSWORD at Cognito directly refused; the task role refused on the own-staff pool.

## 7. Known gaps
* **AG-1-56 / AG1-D20 is broken on Cognito, not a blind spot (M6):** one-hour access tokens per tab mean password + code every hour and in every new tab,
  and each re-sign-in ends the other tab's session. Question 3.
* Step-up (AG-1-42) by a full re-sign-in ends the current session and starts a new one (m9): for the step-up row.
* Passkey sign-in on our page; forgot-password (§3); Cognito's lock-out numbers.

## Questions for the tech lead (recommendation first)
1. **Our own page (recommended), with the flows cut to the admin password flow in both modes,** and the PF-4bc contract in §3 (sealed absolute code, 60 min; `email_verified`; FORCE_CHANGE_PASSWORD under an advisory lock as the one-use proof): agree, so PF-4bc builds to it?
2. **QR code:** key + `otpauth://` link now (recommended), a STANDARDS §1 entry for a small QR library as a follow-up row?
3. **Session length (AG1-D20):** founder ruling needed. Recommend: this row ships with the one-hour gap written in the PR and a follow-up row right after (refresh token in an HttpOnly cookie, 28 days), rather than growing this row.
