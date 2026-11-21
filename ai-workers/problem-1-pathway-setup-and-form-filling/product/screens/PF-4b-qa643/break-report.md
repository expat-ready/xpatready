# PF-4b / QA-643 break report: staff passkey sign-in (permissions focus)

Breaker, 21 Nov 2026, PR 2880 at `caeb6a3495a9940dace931891380ddb7067cfda2`. Synth only: no AWS call, nothing pushed.
Scope: `prototype/studio/deploy/cdk` (`lib/service.ts`, `lib/service-checks.ts` `poolFindings`/`passkeyFindings`, `test/service.test.ts`).
AWS behaviour read offline from the botocore cognito-idp model 2016-04-18 (the same model the builder cites) and the aws-cdk-lib 2.275.0 CfnUserPool docs.

## How it was attacked
* `npm test`: 110/110 pass at the commit.
* Template mutations: synthesized `xr-staging`, `xr-production` and no-domain `xr-staging` (`xr:domain=none`), mutated 25 copies, and ran `poolFindings` (plus `typeFindings` for new resource types). The scripts were in the session scratchpad (`breaker-qa643/synth.ts`, `mutate.ts`). They are not committed.
* Code mutations: copied the CDK package to scratch (test paths pointed at the real repo), weakened `lib/service.ts`, then ran the **whole suite** to see whether any test notices.

## The configuration as built (held)
Both staff pools in both stages: `MfaConfiguration ON`, `EnabledMfas [SOFTWARE_TOKEN_MFA]`, first factors exactly `[PASSWORD, WEB_AUTHN]`,
`WebAuthnUserVerification required`, `WebAuthnFactorConfiguration MULTI_FACTOR_WITH_USER_VERIFICATION` (a valid enum value; the other value is `SINGLE_FACTOR`),
`WebAuthnRelyingPartyID` is `expatready.com` in production and `staging.expatready.com` in staging, `UserPoolTier ESSENTIALS`, admin-create only, and no OAuth.
Client flows are `[USER_SRP, USER_AUTH, REFRESH]`. The clients' pool has no passkeys and no USER_AUTH. No-domain staging has no passkey properties and no USER_AUTH, so it keeps password plus app.
Production built in no-domain mode keeps its domain and passkeys. No passkey is allowed as a single factor, no OTP is a first factor, and there is no self sign-up or hosted UI. The relying party is a suffix of every `<firm>.<domain>`, so passkeys work at each firm's address.

## Findings

### Major
**M1. A staff pool whose only second step is an email code passes all 110 tests, so control of the inbox alone gives full access.** The guard checks `MfaConfiguration` only (`service-checks.ts:249`). It never reads `EnabledMfas`, and the QA-643 pass test does not pin it either.
Account recovery is `verified_email` (`service.ts:127`). So a password reset by email followed by an email-code second step means the inbox alone signs a staff member in. That breaks P-567.
Code mutation (`service.ts:125`): `mfaSecondFactor: passkeys(staff) ? { otp: false, sms: false, email: true } : …` plus `email: cognito.UserPoolEmail.withSES({ fromEmail: \`no-reply@${domain}\`, sesRegion: "ca-central-1", sesVerifiedDomain: domain })`.
The synthesized staff pools get `EnabledMfas ["EMAIL_OTP"]` with a DEVELOPER SES sender, and the **full suite still passes 110/110**. The template version is mutation B4, which `poolFindings` lets through.
The gap existed before this PR, but this PR edits this check and re-states the two-step promise (README: "a password plus an authenticator app").

**M2. Remembered devices (which skip the second step) on staff pools pass every test.** Nothing reads `DeviceConfiguration`. The AWS model describes device authentication as one "that bypasses MFA".
Code mutation: add `deviceTracking: { challengeRequiredOnNewDevice: false, deviceOnlyRememberedOnUserPrompt: false }` to staff pools. That gives `DeviceConfiguration` on both staff pools, and service.test.ts still passes 52/52 (B3 on the template).
After one full sign-in, the password plus a device key kept in the browser is enough. The device key is not the second step P-567 asks for.

### Minor
**m1. `passkeyFindings` accepts extra first factors.** `service-checks.ts:274` checks that PASSWORD and WEB_AUTHN are present, not that they are the only two.
Template mutations B1 (`AllowedFirstAuthFactors` + `EMAIL_OTP`, staff) and B2 (+ `SMS_OTP`, own-staff) pass `poolFindings`.
A code change would still be caught, because the QA-643 pass test pins the exact list (`service.test.ts:406`). So only the guard is fooled, not the build. An exact match would make the guard stand on its own.

**m2. The no-domain branch only looks for passkeys.** `service-checks.ts:270-271` misses an OTP first factor and an unneeded USER_AUTH. Code mutation: in no-domain mode set `signInPolicy: { allowedFirstAuthFactors: { password: true, emailOtp: true } }` and `user: staff` on the client.
That gives `["PASSWORD","EMAIL_OTP"]` plus ALLOW_USER_AUTH on no-domain staging, and **all tests pass**: the QA-643 pass test loops over the domain stacks only, and the no-domain test (`:356`) runs only `poolFindings`.
Cognito may refuse an OTP first factor while MFA is required. That is unconfirmed offline, so the result is a failed deploy or a weaker sign-in.

**m3. Client flows are not allow-listed.** B5 adds `ALLOW_USER_PASSWORD_AUTH`, `ALLOW_ADMIN_USER_PASSWORD_AUTH` and `ALLOW_CUSTOM_AUTH`. It passes the guard and, as a code mutation, the full suite.
MFA still applies (no triggers are allowed, `checks.ts:379`), so this is not a single factor. Also, as built, ALLOW_USER_AUTH with a PASSWORD first factor lets a client send the plain password (the `PASSWORD` challenge) as well as SRP.
Before this PR the staff client was SRP only. This is a posture change the README does not mention.

**m4. The production relying party covers staging.** `WebAuthnRelyingPartyID expatready.com` (`service.ts:119`). WebAuthn lets any origin under `expatready.com` ask for that relying party, including `<firm>.staging.expatready.com` and any future marketing site at the apex.
Cognito's `WebAuthnOriginNotAllowedException` checks that the origin "align[s] with the user pool relying party id".
So a script running on a staging page could ask a production staff member's passkey to sign a production challenge. That needs code running on a staging origin. Unconfirmed: no AWS test; it is for the tech lead to decide (for example a production-only parent, or keeping staging off the production apex).

**m5. "Replaces both steps" overstates what AWS does.** The AWS model, for `WebAuthnMfaSettings`, says passkey sign-in under required MFA works only once the user's passkey MFA preference is turned on. It also says "The user must also have at least one other MFA method such as SMS, TOTP, or email activated to prevent account lockout".
So staff still enrol the authenticator app first, and the app has to call `SetUserMFAPreference` (no task-role permission yet; README "Not here"). Wording only: the README Sign-in bullet and the comment at `service.ts:108-114`.

**m6. The clients' pool passkey settings are not guarded.** B6 gives the clients' pool `SINGLE_FACTOR`, user verification `preferred`, first factors `EMAIL_OTP`/`WEB_AUTHN`, relying party `evil.example` and USER_AUTH, and `poolFindings` passes it.
The QA-643 pass test pins the clients' pool as undefined, so a code change would be caught. The clients' pool is PF-4p's decision. Recorded so nobody reads `poolFindings` as covering it.

## What held (caught by the guard on the template)
MFA OFF and OPTIONAL (H1, H2). `SINGLE_FACTOR` (H3). User verification `preferred` (H4).
Relying party as an `Fn::Join` token, with a trailing dot, or set to the staging domain on production (H5-H7). First factors as an `Fn::If` token, or WEB_AUTHN alone (H8, H9).
A second client on a staff pool with USER_AUTH only (H10). Pool-name case trick `xr-production-Staff` (H11). Self sign-up (H12). OAuth on (H13).
Passkeys (relying party only) on no-domain staging (H14). LITE tier (H15).
`UserPoolDomain`, `UserPoolIdentityProvider` and `ManagedLoginBranding` slip past `poolFindings` but are refused by `typeFindings` (no hosted UI or federation). Lambda triggers are refused by `checks.ts:379`.
No-domain staging builds and passes every estate guard. Production refuses no-domain mode.

## Not settled offline
Whether CloudFormation accepts `MfaConfiguration ON` with WEB_AUTHN as a first factor (the AWS model says it does when the factor configuration is MULTI_FACTOR_WITH_USER_VERIFICATION). That is PF-8c's deploy and smoke test.

Verdict: Changes caeb6a3495a9940dace931891380ddb7067cfda2

## Round 2 (86e89586)
Diff `caeb6a34..86e89586` under `deploy/cdk` only. Synth and copies in the session scratchpad (`breaker-qa643/mutate.ts`, `mutate2.ts`, `codemut-full.mjs`); not committed. `npm test` gives 110/110 at the commit and also in a scratch copy of the tree.
**Round 1 re-run: everything now caught.** On the template, B1-B8 are caught (M1 `EnabledMfas`, M2 `DeviceConfiguration`, m1 extra first factor, m2 no-domain OTP/USER_AUTH, m3 extra flows, m6 the clients' pool), and H1-H15 are still caught.
As code mutations of `service.ts`, the full suite fails for each one: M1 email second step (2 fail), M2 `deviceTracking` (3), m2 (1), m3 `userPassword`/`adminUserPassword`/`custom` (3).
m5 is fixed in the wording (README Sign-in bullet, `service.ts:108-118`: the passkey MFA switch per person, and the authenticator app kept enrolled). m3's password-over-USER_AUTH is now stated. m4 is stated in the README and stays a question for the tech lead.

### Fresh attempts that held (caught by `poolFindings`)
* `EnabledMfas`: listed twice, reordered `[EMAIL_OTP, SOFTWARE_TOKEN_MFA]`, lower-case, `Fn::If` token, email on no-domain own-staff (F1-F4, F9).
* `DeviceConfiguration`: `{}`, `null`, an `Fn::If` token, and set on no-domain staging (F5-F8).
* Flows: `ALLOW_USER_AUTH` listed twice, legacy `USER_PASSWORD_AUTH` instead of SRP, an `Fn::If` token, the list removed (which leaves Cognito's default) (F10-F13).
* A second staff client linked with `Fn::GetAtt [pool, UserPoolId]` (F14). Whole `Policies` as `Fn::If` with a domain (F20). The clients' `SignInPolicy: null` (F22).
* Pool name as an `Fn::Join` token. Staff and clients names swapped. `MfaConfiguration "on"`. Own-staff relying party set to staging on production (F23-F26).
* As a code mutation, a second client using `Fn.sub` with a map is refused by the region guard's "Fn::Sub with a variable map".

### Findings (all Minor; none new in kind, all need a deliberate escape hatch)
**r2-m1. A staff app client the guard cannot link to its pool is never checked.** `poolFindings` links a client to a pool only through `refId` (`Ref` or `Fn::GetAtt`, `service-checks.ts:13`, `:246`, `:272`). Any other form drops the client, and its flows, out of every check.
Code mutation (scratch `codemut-full.mjs` R2-a), after `staffClient` in `service.ts`: `new cognito.CfnUserPoolClient(this, "Side", { userPoolId: Fn.select(0, Fn.split(",", pools.staff.userPoolId)), explicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_ADMIN_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"] })`.
The synthesized `AppSide…` has `UserPoolId {"Fn::Select":[0,{"Fn::Split":[",",{"Ref":"AppPoolstaff…"}]}]}` in all four stacks, and the **full suite still passes 110/110**. As template mutations, `Fn::Join ["",[Ref]]` and a plain `Fn::Sub "${Pool}"` also pass every guard (F15-F17).
That bypasses "exactly SRP, USER_AUTH and refresh" and "its own one" client. Pool MFA still applies (no triggers allowed), so this is the same grade as round-1 m3.
Suggested check: a client whose `UserPoolId` is not a plain `Ref`/`GetAtt` to a pool in this stack is itself a finding.

**r2-m2. No-domain staging reads an unreadable first-factor list as "not set".** `if (first.length && …)` (`service-checks.ts:277`): `arr()` turns an `Fn::If` (or a whole `Policies` in `Fn::If`) into `[]`, which then passes.
Code mutation R2-c: a `CfnCondition` plus `addPropertyOverride("Policies.SignInPolicy.AllowedFirstAuthFactors", Fn.conditionIf(c.logicalId, ["PASSWORD","EMAIL_OTP"], ["PASSWORD"]))` on both no-domain staff pools.
The synthesized `nd:xr-staging` has the `Fn::If` with `AppHome… Fn::Equals ["ca-central-1","ca-central-1"]` (always true), and the **full suite passes 110/110** (template versions F18 and F19 also pass every guard). The domain branch is not affected: it does not short-circuit, and F20 is caught.
The effect is round-1 m2's: an email code as a first factor on staging (a failed deploy or a weaker sign-in, unconfirmed offline). Suggested check: absent is fine, and anything that is not a literal array is a finding.

**r2-m3. The new clients'-pool check (`service-checks.ts:253`) has the same token gap.** With `Policies` as `Fn::If` and `SignInPolicy {AllowedFirstAuthFactors:["EMAIL_OTP"]}` on `xr-production-clients`, every guard passes (F21).
The QA-643 pass test also reads `P.Policies?.SignInPolicy` as undefined, so a code change would not be caught either. This is PF-4p ground: it is recorded only because the PR adds the check.

Verdict: Approve 86e895862f1ababb4cba91d3432dfdab8530609c
