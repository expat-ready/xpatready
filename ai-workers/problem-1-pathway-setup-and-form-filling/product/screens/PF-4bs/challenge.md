# PF-4bs concept r1: independent challenge (23 Nov 2026)

Verdict: Rework

Read: concept.md; `session/{provider,service,routes}.ts`, `identity/{cognito,service}.ts`, `firms/signup-identity.ts`, `firms/signup.ts`;
`deploy/cdk/lib/{service,checks,service-checks}.ts`; `web/src/modules/platform/{session.ts,callback-page.tsx}`; the AWS model text in
`@aws-sdk/client-cognito-identity-provider` dist-types; the staging report (branch `aws/2026-11-22-staging-proof`, Steps 2-18);
`trace-requirements.py --brief PF-4b`, `--cite AG-1-56 AG-1-67 SA-6-10`. Most of the design holds up: one page, server-side admin
flow, the seven actions, and a one-off task for the first Owner. Two things break it on the real staging stack. Rework means fix §2 item 5 and §3/§5, not redesign.

## Blocker
**B1. The client flows are written for no-domain staging, but staging now runs with a domain.** Staging moved to domain mode on 22 Nov (report l.11, l.56-57:
`*.staging.lab.expatready.com`, SES identity, task-role SES policy; Step 18: "identities: one DOMAIN"). §2 item 5 gives
`ALLOW_ADMIN_USER_PASSWORD_AUTH` to "staff pool, no-domain" only, and says "Domain mode keeps `ALLOW_USER_AUTH`". The result on staging and production:
(a) the concept never says the domain-mode client gets `ALLOW_ADMIN_USER_PASSWORD_AUTH`, and without it every AdminInitiateAuth is refused;
(b) `ALLOW_USER_AUTH` "covers username-password, secure remote password (SRP)…" (service.ts:116-117, README l.79), and the client has no secret
(`generateSecret: false`, service.ts:136). So anyone holding the public client id can sign in with a password directly at Cognito's public
endpoint, around our per-IP limit and the sign-in audit at the door. "Nobody signs in around our door" (§2.5) is true nowhere it matters;
(c) the existing exact-flow checks refuse any change in both modes (service-checks.ts:271 "not SRP and refresh only"; :280 "not SRP,
USER_AUTH and refresh only"). PR 1's scope does not name these rules or the README.
*Fix:* give one exact flow list per mode in §2.5 and in `passkeyFindings`. Recommended: domain mode drops `USER_AUTH` and SRP until the passkey row
(passkeys are not built anyway: README l.79 "the app side that registers passkeys … is not built"), so it is ADMIN_USER_PASSWORD + refresh in both
modes. Either way, say it in "Done when" and test the refusal of every other flow list.

**B2. Accept commits the staff row and `sub` before any password exists, and nothing recovers a lost code.** This bricks the first Owner.
`accept` writes the ACTIVE staff row, grants, `accepted_at` and `identitySubject`, and commits (session/service.ts accept, `createUser` then
`identitySubject` update). After that the only key is the 15-minute hand-off code, and three things take it away:
- the callback page removes it from the address bar before posting (callback-page.tsx:2-3, 34-38), so a reload or a closed tab loses it;
- the invitation is now used ("NOT_VALID");
- a new invitation to the same email is refused (accept: `platformStaff.findFirst({email})` → INVITATION_NOT_VALID).
The person is left in FORCE_CHANGE_PASSWORD for good. For staging's first Owner it is final: §5 allows the system inviter only "while the firm
has no active staff member with an identity subject", and the failed Owner now is one. A wrong-policy password (AdminSetUserPassword
InvalidPasswordException) followed by a slow retry, or the MFA set-up timing out (M4), is enough.
*Fix:* add a "set your password again" hand-off. A staff member whose provider status is FORCE_CHANGE_PASSWORD (AdminGetUser, already granted)
gets a fresh signed code through MailPort, from the staff page (resend) and from `tools/first-owner.ts --resend`. Base the first-Owner rule on
"no staff member of the firm has ever signed in (`last_sign_in_at` null)", not on "has an identity subject" (§6 PR 4 already says "refused
once an Owner signs in", which contradicts §5). Test: accept, let the code expire, re-issue, set the password, sign in.

## Major
**M1. Of the three "hard stops" against the hosted page, only row 1 holds, and only partly.** Row 2: a single central callback host can pass the
authorization code on to the firm's host. The firm's origin started the PKCE flow and does the token exchange, so "the staff session is per origin, so it breaks" does not follow.
Row 3 is our own check (service-checks.ts:255, "break m3") plus the estate-type gate: a PR, not a stop. Row 1 bars only the *first password*.
A hybrid (our set-password page as in §3, then the hosted page for sign-in and TOTP) avoids it. The Lambda-trigger argument also clashes
with `signup-identity.ts:10`, which already plans "its email through PF-4b's custom sender".
*Fix:* restate the case honestly. Own page because of AG-1-55 and audit at our door, no per-firm callback list, the firm's look, and one flow for
invite and sign-up. Name the costs the table leaves out: we own brute-force defence (Essentials tier has no threat protection), Cognito's
per-user lock-out becomes a lock-out-by-email tool against any staff member through our door, and passkeys on our page later need our own WebAuthn code.
Resolve the `signup-identity.ts` custom-sender plan in the same ruling.

**M2. The challenge `Session` handed to the browser as-is works as a bearer credential outside our door, and step 2 cannot work without the username.**
The model text for AssociateSoftwareToken says: "You can provide either an access token or a session ID in the request". It is a public, no-IAM call (F4), so
whoever holds an MFA_SETUP Session (from XSS, an extension, or a support screenshot) can enrol their own authenticator directly at Cognito
during the session's life. Separately, AdminRespondToAuthChallenge needs `"ChallengeResponses": {"USERNAME": …, "SOFTWARE_TOKEN_MFA_CODE": …}`
(and `{"USERNAME"}` + "SESSION from VerifySoftwareToken" for MFA_SETUP), but `POST …/sign-in/code {attempt, code}` carries no username.
*Fix:* seal the attempt: AES-256-GCM under a Secrets Manager key both tasks read, holding {Session, username, step, expiry}. It stays stateless and
works on either task, the browser never sees Cognito's Session, and the username is in it. Add "sealed attempt tampered or expired → 401 start
again" to the contract suite.

**M3. "FORCE_CHANGE_PASSWORD as the one-use proof" is check-then-act across two AWS calls.** Two `{code,password}` posts in parallel (a
double-click, two tabs, or an attacker holding the code) both see FORCE_CHANGE_PASSWORD, both call AdminSetUserPassword, and the last one wins.
Each then starts its own MFA_SETUP. The concept asks the Lead to sign this contract for PF-4bc as written.
*Fix:* take `pg_advisory_xact_lock(hashtext(sub))` around AdminGetUser → AdminSetUserPassword. The database is shared by both tasks and this needs no
migration. Test two parallel posts: one set-up and one 401.

**M4. The MFA set-up has Cognito's default challenge lifetime, which the concept never sets.** `AuthSessionValidity`: "the duration, in minutes, of that
session token. Your user pool native user must respond to each authentication challenge before the session expires" (models_0.d.ts:6667).
The concept calls it "a 3-minute value". A first-time invitee has to install an authenticator app, add the key and type a code inside it.
An expired Session is not a wrong code, but the contract only has `CODE_REFUSED`.
*Fix:* `authSessionValidity: Duration.minutes(15)` on the staff client, pinned by the CDK check. The set-up card asks for the app *before* the password
step. Expiry → `ATTEMPT_EXPIRED` "Start again", and the restarted set-up warns that the old app entry is now invalid (AssociateSoftwareToken issues a new secret).

**M5. The first-Owner design does not work as written.**
(a) The invitation email's link is relative: service.ts:395 `Open your invitation: /invitation#t=${token}`. It is not clickable in a mail client,
so "open the email" (§5) fails. The tool, or the mail text, needs an absolute https link on a host that answers. Firm hosts return 404 on staging (report Step 17, R1.24).
(b) The system-inviter branch in `inviterRefusal` (today `system:first-owner` → `inviter_not_found` → revoked, session/service.ts inviterRefusal)
would sit in production accept code, guarded only by firm state.
(c) SA-6-10 says "At provisioning the first user is granted the Owner role". Staging's firms are Sample-seeded *with* Sample Owner rows (Step 17: 2 firms, 4 staff,
6 grants), so "Firm created" would be a false reason. Also, `platform_role_grant` has no reason column (platform.prisma:316-325).
(d) No seat check (AG-1-13; `seatCheck`, service.ts:239).
*Fix:* refuse the tool and the branch when `PLATFORM_ENVIRONMENT=production`. Use reason "Staging first Owner (one-off task)" in the audit detail, or
create a fresh staging firm through the tool so SA-6-10's wording is true. Run the seat check. Build the link from the stack's app host.

**M6. AG-1-56 / AG1-D20 is broken, not just a blind spot.** SA7-D67 (7): "Firm users … have no short idle timer: they sign in again only after 28 days
unused". With access tokens only, kept in tab-scoped sessionStorage (session.ts:3-4, `expiresIn`), every staff member types password + code
every hour and in every new tab, and each of those sign-ins revokes the last session (identity/service.ts recordSignIn, "another-device").
*Fix:* get a founder ruling before PR 3 merges (ship with this breach recorded in STATE.md and BACKLOG, or bring the HttpOnly refresh cookie into this row). At least raise the
access-token validity within Cognito's limit and say so.

**M7. "Done when" does not prove the AWS behaviours the design depends on, and the PR plan does not fit.** Everything is tested against recorded responses, and some claims
only a live pool can prove: MFA_SETUP after AdminSetUserPassword Permanent; AdminRespondToAuthChallenge MFA_SETUP with the
VerifySoftwareToken session; AdminSetUserPassword on FORCE_CHANGE_PASSWORD; IAM accepting the `userpool` ARN (§1 "Unconfirmed").
PR 2 (port, two adapters, three doors, RFC 6238 stand-in, limit, audit, contract suite on both, log scan) will not fit in 800 lines.
PR 3's cognito set-password and PR 4's accept both need PF-4bc's `redeem`/`createUser`, which is not in the order.
*Fix:* split PR 2 into 2a (port, local stand-in, doors) and 2b (cognito adapter). State that PF-4bc merges before 3 and 4. Add a staging proof list to
Done-when: invite → set password → set up → code → `/me` 200; wrong code 401; replayed link 401; direct USER_PASSWORD/SRP at Cognito
refused; task role can do nothing on the own-staff pool.

## Minor
- m1. The CDK refusal tests name "the clients pool" but not own-staff, the likelier slip (§4 itself says "not own-staff"). Add it. The new rule must accept only
  `Fn::GetAtt [<staff pool>, Arn]`, because the existing `own()` also accepts an `Fn::Join` of literals and Refs (checks.ts:398-402), which could name another pool.
  `pool()` builds both staff pools (service.ts:120-140), so a flow change by `staff` also changes own-staff. Say which you mean.
- m2. Seven actions: right for the callers named; nothing is missing for this row, and nothing extra apart from PF-4bc's four (fine if the Lead agrees in question 3).
  Flag for PF-4bc: AdminSetUserMFAPreference may not remove an enrolled TOTP or a passkey (Unconfirmed). Re-check before "reset two-step" relies on it.
- m3. The per-IP limit lives in memory per task (the signup.ts:85 pattern), so with 2 tasks it is doubled. It also needs the client IP from the load
  balancer's X-Forwarded-For with a trusted hop count. Add a per-email limit, and pass ContextData (IpAddress) to AdminInitiateAuth.
- m4. The log scan for the password must cover Nest's exception filter and any AWS SDK logger, not only our own lines.
- m5. callback-page.tsx keeps one post per code (`sent.has(code)`). The two-phase `{code}` then `{code,password}` needs the code held in memory, and
  a reload must explain the loss (after B2's re-issue exists: "ask for a new link").
- m6. AdminCreateUser (PF-4bc) should set `email_verified=true`: the invitation proved the address, and EMAIL_ONLY recovery needs it.
- m7. Forgot-password is not named. With our own page, Cognito's ForgotPassword email breaks AG-1-70 just as row 1 says, so a reset needs our own
  signed-code flow. Add it to §7.
- m8. §5's reason for rejecting a console-made user ("its `sub` cannot reach our private database") is contradicted by §5's own one-off task, which can
  write it. The real reason is that the product's own invitation route is what R1.5 must prove. Say that.
- m9. Step-up (AG-1-42) by a full re-sign-in revokes the current session and starts a new one (recordSignIn). Note this for the step-up row.

## Round 2 (r2)
Verdict: Approve with changes (r2 read on disk; commit 54afda640)

**What r2 does with each finding**
- B1 answered: one flow list, `ALLOW_ADMIN_USER_PASSWORD_AUTH` plus refresh, for both modes and both staff pools; `passkeyFindings` and the README follow; every other list is refused in tests.
- B2 answered: a "Send a new set-password link" door for anyone in FORCE_CHANGE_PASSWORD, `first-owner --resend`, and the first-Owner rule now based on `last_sign_in_at`.
- M1 answered: the case for our own page is restated honestly, and its costs are named.
- M2 answered: the attempt is sealed (Session, username, step, expiry). See N2 for what is still missing.
- M3 partly answered: the advisory lock is the right tool, but r2 has the order wrong (N1).
- M4 answered: 15-minute challenge lifetime pinned by the check, `ATTEMPT_EXPIRED`, and the set-up card asks for the app first.
- M5 answered: refused in production, absolute link, seat check, honest audit reason. N5 adds a small point.
- M6 partly answered: written up as a known breach and put to the founder (question 3). Acceptable only if the follow-up row is in BACKLOG before PR 3 merges.
- M7 answered: PR 2 split into 2a and 2b, PF-4bc ordered before PRs 3 and 4, and a staging proof list added.

**New problems r2 introduces**
- N1 (Major). The lock comes before the redeem in §3, but the lock key `hashtext(sub)` is only known after it. Fix the order: unseal or redeem the code (no state), read the staff row's `identitySubject` as that firm (the door is public, so set the firm context first, PF-12b), then take the lock.
  The lock's transaction stays open across three or four Cognito calls, so give it a short `statement_timeout`/`lock_timeout`, and expect the second post to wait for the first, then get its 401.
- N2 (Major). The secret box needs an owner `{firmId, purpose}` and binds it into the AAD (`secret-box/aes-gcm.ts:15, :37`), but r2 names neither, and at sign-in step 1 the firm is not known yet.
  Fix: one fixed platform owner id plus two separate purposes, `sign-in-attempt` and `set-password-code`, so neither sealed value opens as the other. Add a test that swaps them. Keep the expiry inside the sealed value.
  Check the sealed attempt's length against the doors' input caps: the callback refuses codes over 2000 characters (session/service.ts callback), and a Cognito Session is about 1 KB before sealing.
- N3 (Minor). The per-IP and per-email limits "in the database" mean a new table, so a migration in PR 2a; say so. A per-email limit is itself a way to lock someone out by email: an attacker can keep the real person out.
  Count only failed attempts, and let a correct password plus code through from an IP that has passed before, or say plainly that this is accepted.
- N4 (Minor). The 60-minute code now travels by email, and older codes stay valid next to a new link. That is safe only while FORCE_CHANGE_PASSWORD under the lock is the single proof.
  The new-link door also sends to the address currently on the staff row, so an admin who changes that email and then sends a link could take over an account whose password was never set. Refuse the new link within 24 h of an email change, or send it to the invitation's address only.
- N5 (Minor). "Host from the stack" for every invitation link: name the host (staging `www.staging.lab…`, since firm hosts return 404 until R1.24; production: the firm's address). The accept, callback and later sign-in then all happen on the same origin, so the tab session carries over.
- N6 (Minor). Dropping `USER_AUTH` on the own-staff pool means nobody can sign in there until PF-4s. That is fine, but say it in the README. Cutting client flows while the pool keeps its WebAuthn settings is Unconfirmed live: add it to the staging proof, since the 22 Nov rollback showed Cognito refusing some passkey changes.

Open before build: N1 and N2. Both are fixes in the concept text, not a redesign.
