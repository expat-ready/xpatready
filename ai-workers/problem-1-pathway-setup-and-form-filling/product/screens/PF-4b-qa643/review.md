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

## Round 2 (86e89586)

Reviewed commit: `86e895862f1ababb4cba91d3432dfdab8530609c`. Per P-277 I read only `git diff caeb6a34 86e89586 -- …/deploy/cdk`: README.md (one line), lib/service.ts (comment only, no code change), lib/service-checks.ts (+16/-7), test/service.test.ts (+33/-8). I also read the PR body and comments as they stand on GitHub at this head (REST API, read only). No AWS call, no app port, nothing pushed.

### What I ran
* `cd deploy/cdk && npm test`: **110 pass, 0 fail.** The count is unchanged because the new cases sit inside the existing QA-643 fail test.
* **Mutation probes on the guard.** Scratch copy: `/tmp/claude-0/-home-user-xpatready/e680240b-5bdc-5d46-8643-edfc48d5c86c/scratchpad/r2/`. Script: `…/scratchpad/r2tools/mut.py`. Baseline `test/service.test.ts` is 52/52. Each probe below turns the QA-643 fail test red (51 pass, 1 fail), so none of the new checks is blind:

| # | Guard weakened | Result |
|---|---|---|
| A | `EnabledMfas` check removed | red |
| B | `EnabledMfas` loosened to "includes TOTP" | red |
| C | `DeviceConfiguration` check removed | red |
| D | Domain first factors put back to "includes" | red |
| E | No-domain first-factor check removed | red |
| F | No-domain `WebAuthnRelyingPartyID` clause removed | red |
| G | No-domain `WebAuthnFactorConfiguration` clause removed | red |
| H | No-domain `WebAuthnUserVerification` clause removed | red |
| I | No-domain exact client flows removed | red |
| J | Domain exact client flows removed | red |
| K | Clients'-pool guard removed | red |
| L | Clients'-pool guard: WebAuthn keys only | red |
| M | Clients'-pool guard: SignInPolicy only | red |

* **Code mutations on `lib/service.ts`, full suite** (`…/scratchpad/r2tools/mut2.py`). The scratch copy's baseline already has 2 failures that come only from the copy's location: `estate.test.ts` and the PF-23c contract test read files outside the copied package. Each mutation adds new reds on top of that baseline:

| # | Mutation | New reds |
|---|---|---|
| S1 | Staff `EnabledMfas` + `EMAIL_OTP` (breaker M1) | PF-8b pass, both stacks |
| S2 | Staff `deviceTracking` with remembered devices (breaker M2) | PF-8b pass, both stacks |
| S3 | No-domain staff pool with PASSWORD + EMAIL_OTP first factors (breaker m2) | PF-8b F3 no-domain test |
| S4 | Staff client + `ALLOW_USER_PASSWORD_AUTH` (breaker m3) | PF-8b pass, both stacks |
| S5 | Passkeys on the clients' pool (breaker m6) | PF-8b pass, both stacks |
| S6 | Staff first factors + `EMAIL_OTP` (breaker m1) | PF-8b pass, both stacks |

  In round 1, S1, S2, S4 and the S3 kind of change all passed the full suite. Now every one is caught.
* **Fail-closed spot check (read in the code).** If `EnabledMfas` or `ExplicitAuthFlows` is a token instead of a list, `arr()` gives `[]`, which gets a finding. Any `DeviceConfiguration` at all gets a finding. Each pool is held to exactly one client (existing check), so `find` on the first client cannot be bypassed with a second client.

### Round-1 findings, one by one
| Round 1 | Status at 86e89586 | Evidence |
|---|---|---|
| Reviewer **M1**: over-claim, per-user switch | **Partly fixed** | Fixed in the repo: README:79 and the `service.ts` comment now say "the pool's half", name `SetUserMFAPreference` `WebAuthnMfaSettings`, quote AWS's "at least one other MFA method … to prevent account lockout", and say the app side is not built. **Still open in the PR body:** "a passkey … **as a replacement for** password plus authenticator app"; "Done when" 1 still reads "as both steps"; the "Verified at AWS's own source" list still leaves out the `WebAuthnMfaSettingsType` quote; there is no question asking who owns the per-person switch. See R2-M1 |
| Reviewer **m1**: no-domain only partly tested | Fixed | 7 no-domain cases, one per clause; probes E–I red |
| Reviewer **m2**: shared production relying party | Stated | README: "shared by both staff pools and covers every host under it, `staging.` included" |
| Breaker **M1**: `EnabledMfas` unchecked | Fixed | Exact `["SOFTWARE_TOKEN_MFA"]` on both branches; 2 domain cases + 1 no-domain case; probes A, B and S1 red |
| Breaker **M2**: `DeviceConfiguration` unchecked | Fixed | Any `DeviceConfiguration` is refused; probes C and S2 red |
| Breaker **m1**: extra first factors | Fixed | Exact sorted match; probes D and S6 red |
| Breaker **m2**: no-domain other first factors | Fixed | No-domain branch allows a password only and an SRP + refresh client; probes E, I and S3 red |
| Breaker **m3**: client flows not allow-listed | Fixed and stated | Exact flow list; README and comment state that USER_AUTH lets a client send the password itself; probes J and S4 red |
| Breaker **m4**: production relying party covers staging | **Stated in the README, not asked** | The README states the fact. Neither the PR body nor a challenge file asks the tech lead to decide. The PR's "Questions for the tech lead" still lists only no-domain staging and PF-4bc. See R2-M1 |
| Breaker **m5**: wording | Fixed in the repo, open in the PR body | Same as reviewer M1 |
| Breaker **m6**: clients' pool unguarded | Fixed | Any `SignInPolicy` or `WebAuthn*` key on the clients' pool is a finding until PF-4p decides; probes K–M and S5 red |

### Blockers
None.

### Majors
**R2-M1. The PR body, which is the record the tech lead merges from, still over-claims, and it does not ask the two questions this round was meant to leave with the tech lead.** The brief for this round says that m4 and "who owns the per-person switch" are left as questions for the tech lead in the PR. At head `86e89586` they are not there. Checked with the REST API, `pulls/2880` body; the only PR comment is the round-1 summary, and it raises no question.
* **What is wrong:**
  * The body says "as a replacement for", and Done-when 1 says "as both steps", with no mention of the per-person switch.
  * The verification list quotes `FactorConfiguration` and leaves out `WebAuthnMfaSettingsType`. That field is the condition the PF-4b row says to stop and report on.
  * The R1.5 live proof will fail without an explanation unless someone owns registering the passkey, setting the switch and clearing it on reset.
* **Fix (PR body text only; no code, no new commit needed):**
  * Bring "What and why" and Done-when 1 in line with README:79 ("the pool's half").
  * Add the `WebAuthnMfaSettingsType.Enabled` quote to the verification list.
  * Add Question 3: which row owns passkey registration, the per-person `WebAuthnMfaSettings` switch and clearing it on reset (PF-4bc or PF-4b part 2).
  * Add Question 4 (breaker m4): the production relying party `expatready.com` covers `*.staging.expatready.com`. Keep staging off the production apex, or accept the risk and keep every host under the apex first-party.
  * While there, refresh the "Changes" bullet for `service-checks.ts`. It still describes the round-1 guard: no exact lists, no `EnabledMfas`, no devices, no clients'-pool guard.

  Once the body says this, this review's open items are closed at this same commit.

### Minors
**R2-m1.** The doc comment on `poolFindings` (`lib/service-checks.ts`, just above `export function poolFindings`) still says a passkey comes "in place of password plus app". This is the round-1 wording that README and `service.ts` dropped. Words only; fix it with the next change that touches the file.

### Nothing new wrong
* `lib/service.ts` changes only its comment; the synthesized template is the same as in round 1.
* The new checks run on both staff pools and on both branches.
* The clients'-pool guard does not fire on today's template: the PF-8b pass tests are green on both stacks.
* The README line matches the template: exact flows SRP, USER_AUTH and refresh; authenticator app only; no remembered device.

### Journey score (reviewer, round 2): 8.5/10, pass
Re-scored on the round-1 journeys (`journey-test-reviewer-2026-11-21.md`) against this diff:
* Journey 4, passkeys on no-domain staging, now holds. Error recovery stays at 1, and its Minor gap is closed.
* Journey 5, the R1.5 boundary, now holds in the README.
* Three criteria stay at ½, all for the same reason (R2-M1):
  * Task completed: the per-person switch has no owner.
  * Next step obvious: the PR does not ask who owns it.
  * Trust and sources: the PR body leaves out the `WebAuthnMfaSettingsType` quote and still says "replacement".
* With the PR body fixed, the score would be 9.5.

Verdict: Changes 86e895862f1ababb4cba91d3432dfdab8530609c
