# PF-4bs: staff sign-in on Cognito (password, one-time code, set-password callback, task-role actions, staging's first Owner) — concept r1

Row PF-4bs (R1.5; shaped by the screens lane, 23 Nov). Covers links **1, 4, 5** and **the callback of link 6** in Step 18 of
`reports/aws-staging-proof-2026-11-22.md` (branch `aws/2026-11-22-staging-proof`). Not here: link 3 and the Cognito half of
`redeem` (PF-4bc), link 2 (SES address check, the founder), passkey sign-in (domain mode only; follow-up).
Requirements (`trace-requirements.py --brief PF-4b`, plus `--cite`): AG-1-10 (single-use expiring set-password invite),
AG-1-40 as changed by contracts §7 §1.2 (two-step for every staff member; authenticator app; no SMS; no email code),
AG-1-41 / AG1-D20 (sessions revocable; 28 days unused, then sign in again), AG-1-42 (step-up 5 min), AG-1-55 (one session),
AG-1-70 (staff account emails ours, through the one send path), SA-6-10 / BR-23 (first Owner given at firm creation, reason "Firm created").

## 1. Facts (AWS's own text; not my words)
`docs.aws.amazon.com` is refused by this lane's network (proxy 403, 23 Nov). The quotes below are AWS's API model text as
shipped in `@aws-sdk/client-cognito-identity-provider@3.1161.0` (already in `package.json`; the API reference pages are
generated from it), read 23 Nov 2026. Developer-guide facts not in the model are marked **Unconfirmed**.
* F1 callback URLs (CreateUserPoolClient `CallbackURLs`): "Amazon Cognito doesn't accept authorization requests with redirect_uri values that aren't in the list of CallbackURLs"; "Amazon Cognito requires HTTPS over HTTP except for callback URLs to http://localhost".
* F2 AdminCreateUser: "Set to SUPPRESS to suppress sending the message"; "To complete the Admin Create User flow, the user must enter the temporary password in the sign-in page, along with a new password"; "If you don't specify a value, Amazon Cognito generates one for you"; the user stays in "FORCE_CHANGE_PASSWORD state until they sign in and set their password".
* F3 AdminSetUserPassword `Permanent`: "Set to true to set a password that the user can immediately sign in with"; "if you set a permanent password, their status becomes Confirmed".
* F4 Admin* operations (AdminInitiateAuth, AdminCreateUser, AdminSetUserPassword): "you must use IAM credentials to authorize requests, and you must grant yourself the corresponding IAM permission in a policy". InitiateAuth and AssociateSoftwareToken: "you can't use IAM credentials to authorize requests, and you can't grant IAM permissions in policies".
* F5 `ADMIN_USER_PASSWORD_AUTH`: "Server-side username-password authentication with the password sent directly in the request"; enabled by the client's `ALLOW_ADMIN_USER_PASSWORD_AUTH` ("your app passes a user name and password to Amazon Cognito in the request, instead of using the Secure Remote Password (SRP) protocol").
* F6 `MFA_SETUP`: "use the session returned in this challenge from InitiateAuth or AdminInitiateAuth as an input to AssociateSoftwareToken. Then, use the session returned by VerifySoftwareToken as an input to RespondToAuthChallenge or AdminRespondToAuthChallenge with challenge name MFA_SETUP to complete sign-in."
* F7 `RefreshTokenValidity`: default "30 days".
* Unconfirmed (Service Authorization Reference not reachable): that each Admin* action takes the `userpool` resource ARN. The CDK test pins the resource; the live deploy proves IAM accepts it.

## 2. Password and one-time code: hosted page or our own page — **recommend our own page**
| | Cognito's hosted page (managed login, OAuth code + PKCE) | **Our page; our API calls Cognito server-side (F5, F6)** |
|---|---|---|
| Invitee's first password | FORCE_CHANGE_PASSWORD needs the temporary password in the user's hands (F2): Cognito's own email (breaks AG-1-70) or a custom email sender Lambda (the deploy check refuses Cognito Lambda triggers, `checks.ts`) | Our set-password page; the API sets it with AdminSetUserPassword `Permanent` (F3); no Cognito email ever |
| Firm addresses `<firm>.<domain>` | Every redirect URI must be listed (F1): a client change per firm, or one central host (the staff session is per origin, so it breaks) | Same origin as the app; nothing per firm |
| Estate and checks | New `AWS::Cognito::UserPoolDomain` (+ branding) types; OAuth flows on, which `service-checks.ts:255` refuses today | No new resource type |
| Firm's look and our words (EXPERIENCE) | Pool- or client-wide branding only (Unconfirmed) | Ours, as the sign-up door (P-566 already takes the password on our page: `signup-identity.ts`) |
| Passkeys, lock-out, TOTP set-up | Built in | We build the set-up step; passkeys later (domain mode); Cognito's own lock-out still applies (Unconfirmed) |
| Password in our process | Never | Yes, in memory only: never logged, stored, echoed (same rule as the sign-up door), body limit, per-IP limit |
The hosted page loses on the first three rows, each a hard stop today. Our page costs one set-up screen and a password in memory.

**Flow (both adapters behind a new `SignInPort`, `session/sign-in.ts`, owned by this row):**
1. `POST /api/platform/session/sign-in {email, password}` → `200 {step:"code", attempt}` or `{step:"set-up", attempt, key, otpauth}`; wrong password and unknown person both → `401 SIGN_IN_REFUSED` "That email and password don't match." (one answer; client `preventUserExistenceErrors` already on).
2. `POST /api/platform/session/sign-in/code {attempt, code}` → `200 {token, expiresIn}` (the Cognito access token; the guard already verifies it, `cognito.ts`); our `authenticate` runs on it before answering, so the sign-in is recorded, the older session ends (AG-1-55) and the audit line is written. Wrong code → `401 CODE_REFUSED`, the same attempt may try again until Cognito ends it.
3. `attempt` is Cognito's challenge `Session`, handed to the browser as-is (staging runs two tasks with no stickiness: a server-memory map would lose it; a table would be a migration for a 3-minute value). The local stand-in mirrors it (password = Sample, TOTP checked with RFC 6238 over `node:crypto`, no library).
4. Set-up step shows the key as text plus an `otpauth://` link; **no QR** (no QR library in the app: STANDARDS §1 gate; question 2).
5. Client flows (staff pool, no-domain): `ALLOW_ADMIN_USER_PASSWORD_AUTH` + `ALLOW_REFRESH_TOKEN_AUTH`; **SRP removed**, so nobody signs in around our door's limit and audit. Domain mode keeps `ALLOW_USER_AUTH` for passkeys (that path stays open; follow-up).

## 3. The callback (link 6)
`POST /api/platform/session/callback` keeps its door and its code-in-the-body rule. On `cognito` it never calls the local sign-in:
`{code}` → `200 {step:"set-password", email}` (nothing used); `{code, password}` → `redeem(code)` (PF-4bc), AdminGetUser must say
FORCE_CHANGE_PASSWORD (else `401 SIGN_IN_CODE_REFUSED`: a replayed link after the password is set is refused by the
provider's own state, which both tasks share), AdminSetUserPassword `Permanent`, then step 1's sign-in → `{step:"set-up", …}`.
Contract for PF-4bc (asked of the Lead, question 1): on cognito `handOff` returns `/sign-in/callback#code=` with a code signed by a
server secret (subject, 15 min), stateless, so either task redeems it. The `local` callback is unchanged.

## 4. Task-role actions and the deploy check (link 4)
Exactly these on the **staff pool's ARN only** (not own-staff, not clients), each with its caller:
`AdminInitiateAuth`, `AdminRespondToAuthChallenge` (sign-in, code), `AdminSetUserPassword`, `AdminGetUser` (callback; PF-4bc's
reuse), `AdminCreateUser` (accept, PF-4bc), `AdminSetUserMFAPreference` (reset two-step, PF-4bc), `AdminUserGlobalSignOut`
(sign-out everywhere, PF-4bc). Not granted: AssociateSoftwareToken, VerifySoftwareToken, RespondToAuthChallenge (no IAM, F4);
any `cognito-idp:*`, List*, Delete*, AdminDeleteUser, AdminDisableUser.
Check: `ECS_TASK_ACTIONS` gains these seven; `service-checks.ts` adds: a `cognito-idp:` action is allowed only on the pool the
service's `PLATFORM_COGNITO_USER_POOL_ID` names. Tests (CDK assertion, `deploy/cdk/test/service.test.ts`): the task role's
statement equals the seven on `Fn::GetAtt Pool-staff.Arn` (pass); an eighth action, `*`, or the clients pool → the check
fails with its line (fail, one each).

## 5. Staging's first Owner (link 1)
Recommend **a one-off task, `tools/first-owner.ts`, run as the service's own image** (`aws ecs run-task` with a command override):
`--firm <key> --email <address>` writes one Owner invitation, `invited_by = system:first-owner`, 72 h, and sends it through
`MailPort` (SES). Accept allows that inviter only while the firm has no active staff member with an identity subject (checked
under the firm's lock; afterwards it is refused like any stale inviter), and records the grant with reason "Firm created"
(SA-6-10, BR-23). The founder's steps: verify the address in SES once (link 2), run the printed command, open the email, set the
password, add the app, type the code. This walks links 1-7 through the product's own doors. Rejected: a Cognito user made by
hand in the console (its `sub` cannot reach our private database, and Cognito would send its own email); the sign-up door (its
Cognito half and Stripe are not built, and the pool has self sign-up off).

## 6. PRs (each under 800 lines, in order) and "Done when"
1. Deploy: client flows, the seven actions, the check, CDK test (exact actions; three refusals).
2. API: `SignInPort` local + cognito (recorded responses, no network), the three doors, per-IP limit, audit; one contract suite on both adapters: pass; wrong password; wrong code; replayed callback; the password in no log line (scanned).
3. Web: sign-in card with password then code, set-up step, set-password on `/sign-in/callback`; browser suite at 1440 and 375 px, axe.
4. First Owner: `tools/first-owner.ts`, the accept rule; pass, and refused once an Owner signs in.
Each: suite exits 0 twice; Opus reviewer and breaker (permissions, public door); `Reviewer: Approve <sha>`; `ci` green.

## 7. Blind spots (not in this row; named so nobody assumes them)
* The web session ends after one hour (access token only); AG1-D20 says 28 days unused. Needs the refresh token kept out of page script (HttpOnly cookie): a follow-up row.
* Step-up (AG-1-42) on cognito: a fresh password + code gives a new `auth_time`; the step-up screen itself is not here.
* Passkey sign-in on our page (domain mode) and Cognito's lock-out numbers are Unconfirmed.

## Questions for the tech lead (recommendation first)
1. **Our own page (recommended) or the hosted page?** And the PF-4bc contract in §3 (signed stateless code, FORCE_CHANGE_PASSWORD as the one-use proof): agree, so PF-4bc builds `handOff`/`redeem` to it?
2. **QR code:** ship PR 3 with key + `otpauth://` link (recommended now), and a STANDARDS §1 gate entry for a small QR library as a follow-up row?
3. **First Owner by the one-off task with a system invitation (recommended)**, and the seven actions on the task role now (including PF-4bc's four, so its live proof needs no second deploy-check change)?
