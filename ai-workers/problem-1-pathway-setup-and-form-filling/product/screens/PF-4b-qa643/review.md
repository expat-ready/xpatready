# Review: PF-4b passkey line / QA-643 (PR #2880): staff pools take a passkey with user verification as both steps (synth)

Reviewed commit: `caeb6a3495a9940dace931891380ddb7067cfda2` (branch `claude/wizardly-pascal-flx9mu`). I did not build this. Reviewer role, fresh context.
Scope: `deploy/cdk` only (README.md, lib/service.ts, lib/service-checks.ts, test/service.test.ts), +89/-9 lines, well under 800. This change is infrastructure only, so the screen-review walk, D1–D20 and the BIC table do not apply (N/A, no screen). **Journey score: 8.5/10, a pass** (`journey-test-reviewer-2026-11-21.md`). I did not use :4400 or any app port, and I made no AWS call.

## What I ran
* `cd deploy/cdk && npm test`: 110 pass, 0 fail (aws-cdk-lib 2.275.0 confirmed in node_modules).
* I synthesized `buildApp()` / `allStacks()` and read every `AWS::Cognito::*` resource in `xr-staging` and `xr-production`:
  * **Both staff pools:** `MfaConfiguration: ON`, `EnabledMfas: [SOFTWARE_TOKEN_MFA]`, `Policies.SignInPolicy.AllowedFirstAuthFactors: [PASSWORD, WEB_AUTHN]`, `WebAuthnUserVerification: required`, `WebAuthnFactorConfiguration: MULTI_FACTOR_WITH_USER_VERIFICATION`, `WebAuthnRelyingPartyID`: `expatready.com` or `staging.expatready.com`, `UserPoolTier: ESSENTIALS`.
  * **Staff clients:** `ExplicitAuthFlows: [ALLOW_USER_SRP_AUTH, ALLOW_USER_AUTH, ALLOW_REFRESH_TOKEN_AUTH]`.
  * **Clients' pool:** no passkey properties, SRP and refresh only, MFA `OPTIONAL`.
  * **No-domain staging:** I ran this through the suite's no-domain test. It has no WebAuthn properties.
* AWS's API model: botocore 1.44.9, `cognito-idp/2016-04-18/service-2.json`, downloaded to a scratch folder and read 21 Nov 2026. I also read the CloudFormation property list in aws-cdk-lib's `cognito.generated.d.ts`.
* Mutation probes on a scratch copy (nothing in the repo was changed):

| # | Change | Result |
|---|---|---|
| 1 | Drop the factor-configuration escape hatch | 3 pass tests turn red |
| 2 | Client without USER_AUTH | 3 pass tests turn red |
| 3 | `passkeyFindings` returns `[]` | The QA-643 fail test turns red |
| 4 | No-domain branch made blind | The QA-643 fail test turns red |
| 5 | Passkeys turned on in no-domain mode | The F3 no-domain test turns red |
| 6 | No-domain check narrowed to the first-factor clause only | Stays green (see m1) |

## Is the template right? (judged independently)
* **Property names and values are valid.**
  * The CloudFormation names match aws-cdk-lib 2.275.0's generated L1: `WebAuthnRelyingPartyID`, `WebAuthnUserVerification`, `WebAuthnFactorConfiguration`, `UserPoolTier`, `Policies.SignInPolicy.AllowedFirstAuthFactors`. The L1 rendered the escape-hatch value, so the property is in the schema.
  * The values are in AWS's enums: `WebAuthnFactorConfigurationType` [SINGLE_FACTOR, MULTI_FACTOR_WITH_USER_VERIFICATION], `UserVerificationType` [required, preferred], `AuthFactorType` includes PASSWORD and WEB_AUTHN, `UserPoolTierType` includes ESSENTIALS.
  * "Defaults to ESSENTIALS" is AWS's text (`CreateUserPoolRequest.UserPoolTier`), so making it explicit costs nothing.
* **"Never a second step to a password" holds by construction.** `EnabledMfas` admits only SMS, TOTP and email, so WebAuthn can only be a first factor. With `MULTI_FACTOR_WITH_USER_VERIFICATION`, AWS says a passkey with user verification "satisfies MFA requirements". That matches the row's "replacement".
* **Relying party:**
  * The apex of the stack's domain covers every `<firm>.<domain>`, because WebAuthn allows a registrable suffix of the origin.
  * AWS requires the custom domain as the relying party only with managed login or the hosted UI. Neither is used: OAuth is off and there is no `UserPoolDomain`.
  * The CDK L2 limits the ID to 63 characters, against AWS's 127. Harmless.
  * Leaving passkeys off in no-domain mode is right. There is no domain to name, and browsers refuse WebAuthn behind certificate errors. The PR asks the tech lead about it (its Question 1).
* **Would it deploy:** I could not prove this synth-only. See "Could not check".

## Blockers
None.

## Majors
**M1. A pool setting alone does not make a passkey count as both steps. AWS also requires a per-user switch, and the PR and README claim more than the template can give.**
* **Evidence (same API model the PR cites):**
  * `WebAuthnMfaSettingsType.Enabled` (used by `AdminSetUserMFAPreference` and `SetUserMFAPreference`) says: "When activated, the user's passkey authentication requires user verification, and passkey sign-in is available when MFA is required. **The user must also have at least one other MFA method such as SMS, TOTP, or email activated** to prevent account lockout."
  * The same field's text: "To activate this setting, the FactorConfiguration of your user pool WebAuthnConfiguration must be MULTI_FACTOR_WITH_USER_VERIFICATION."
  * So on a pool with `MfaConfiguration: ON`, a staff member's passkey replaces password plus app only after that person has (1) enrolled TOTP, (2) registered a passkey (`StartWebAuthnRegistration`, which needs an access token, so after a password plus TOTP sign-in) and (3) had `WebAuthnMfaSettings.Enabled=true` set for them.
* **Where the claim goes too far:**
  * `deploy/cdk/README.md:79`: "a passkey that verifies the person, which counts as both steps and replaces them".
  * The `lib/service.ts` comment at the Cognito block.
  * The PR body's "What and why" and its "Verified at AWS's own source" list, which quotes `FactorConfiguration` but leaves out `WebAuthnMfaSettingsType`.
  * The PF-4b row says "first verify at AWS's own docs, and stop and report … if any fails". This condition was in the source that was read.
* **Why it matters:**
  * R1.5's live clause ("a passkey signs in on the real pool") will not pass on this template alone. No row names who sets the per-user switch: PF-4bc lists create, reset MFA, global sign-out and code exchange only.
  * PF-4b's reset-two-step also has to clear passkey MFA, and the app's `TwoStep = { method: "TOTP" | "PASSKEY" | null }` (`api/src/platform/identity/session/provider.ts:14`) treats them as alternatives, while AWS requires TOTP underneath.
* **Fix (words only, no new scope):**
  * Reword README:79 and the code comment: "the pool allows a passkey with user verification to stand for both steps; each person turns it on after enrolling the authenticator app (`AdminSetUserMFAPreference`/`SetUserMFAPreference` `WebAuthnMfaSettings.Enabled`)".
  * Add the `WebAuthnMfaSettingsType` quote to the PR's verification list.
  * Add a third question for the tech lead: which row owns registering a passkey, the per-user switch and clearing it on reset (PF-4bc or PF-4b part 2).
  * QA-643 can then close as "pool side done; per-user side owned by <row>".

## Minors
**m1. The no-domain check is only partly tested.**
* `lib/service-checks.ts` (no-domain branch of `passkeyFindings`) refuses any of three things, but the fail test breaks only `SignInPolicy`.
* Probe 6 shows that dropping the `WebAuthnRelyingPartyID` and `WebAuthnFactorConfiguration` clauses leaves every test green.
* Fix: two more fail cases in the QA-643 fail test, each setting just one of those properties on `ndStaging`.

**m2. The production relying party `expatready.com` is shared and wide. This is a recorded choice, not a defect.**
* Both staff pools (`staff`, `own-staff`) use the same ID. Any origin under the apex is in scope, including the marketing apex and any future subdomain, and the browser's passkey picker will list credentials from both pools.
* Fix: one line in README:79 stating this choice and that every host under `<domain>` must stay first-party.

## Over-claims in the PR body
* M1 above.
* Otherwise accurate: it says the real-pool proof, PF-4bc and the R1.5 lines needing AWS are not done, that R1.5 is not complete, the cost is US$0, and the 110/110 count matches.

## Could not check
* **Whether CloudFormation and Cognito accept `MfaConfiguration: ON` with `WEB_AUTHN` as a first factor at create time.** AWS earlier refused passwordless first factors on MFA-required pools. The `MULTI_FACTOR_WITH_USER_VERIFICATION` text implies the combination is now allowed, but only a real deploy (PF-8c / the founder's AWS session) settles it, along with the order in which the CloudFormation handler applies `SignInPolicy` and the WebAuthn settings.
* **Whether Cognito checks the WebAuthn origin against subdomains of the relying party.**
* **The CI run on GitHub's runners.** I checked locally only.
* **D17/D20.** No intended user, so they stay with the founder.

Verdict: Changes caeb6a3495a9940dace931891380ddb7067cfda2
