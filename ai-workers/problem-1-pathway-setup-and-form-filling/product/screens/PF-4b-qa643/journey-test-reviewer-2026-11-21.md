# Journey test: PF-4b passkey line / QA-643, staff pools take a passkey (reviewer, 21 Nov 2026)

Head: `caeb6a3495a9940dace931891380ddb7067cfda2` (PR #2880).

This row has no UI. The "people" here are the operators who will use it:
* the builder of the next row (PF-4bc);
* the tech lead reading CI;
* the founder in the AWS session that proves R1.5 on the real pool.

Their tools are the checkout, `npm test`, the synthesized templates and the README. I did not open :4400 or any other app port, and made no AWS call.

## Journeys
1. **Main path (builder): "show that both staff pools take a passkey with user verification as both steps".** I ran `npm test` and read the synthesized `xr-staging` and `xr-production` Cognito resources.
   * **Held:** 110/110. Both staff pools have PASSWORD and WEB_AUTHN as first factors, UV `required`, `MULTI_FACTOR_WITH_USER_VERIFICATION`, the relying party set to the stack's domain, the Essentials tier, and a client with `ALLOW_USER_AUTH` plus `ALLOW_USER_SRP_AUTH`.
2. **Alternate (tech lead): "the clients' pool is untouched and two-step is still required".**
   * **Held:** the clients' pool has no WebAuthn properties and MFA `OPTIONAL`. Both staff pools keep MFA `ON` with TOTP.
3. **Error (builder weakens a setting).** The breaks tried: UV `preferred`, `SINGLE_FACTOR` or unset, another relying party, `LITE`, no USER_AUTH, first factors without WEB_AUTHN, and SignInPolicy removed.
   * **Held:** each one is named in plain words on each staff pool (QA-643 fail test).
   * Mutation probes 1–5 (review) turn the matching test red.
4. **Error (no-domain staging gets passkeys).**
   * **Held for the first-factor clause.**
   * **Did not hold** when only `WebAuthnRelyingPartyID` or `WebAuthnFactorConfiguration` is set: probe 6 stays green (review m1).
5. **Step across the boundary (the founder's AWS session, R1.5 "a passkey signs in on the real pool").** I compared the README's promise with AWS's API model.
   * **Did not hold as written.** AWS also needs the per-user switch `WebAuthnMfaSettings.Enabled` and TOTP enrolled underneath (review M1).
   * No row names who sets that switch. The proof would fail without an explanation.
6. **Recovery (re-run).**
   * **Held:** running the suite again on a scratch copy gives the same results, and the synth is deterministic.

## Break-it (15 min)
* **Relying party at the apex `expatready.com`:**
  * it is shared by `staff` and `own-staff`;
  * every host under the apex is in scope;
  * the browser picker lists credentials from both pools.
  * This is a recorded choice, not a defect (review m2).
* **A domain longer than 63 characters:** CDK throws at synth (the L2 limit), while AWS allows 127. Harmless.
* **The relying party with a hosted domain:** AWS requires the custom domain only with managed login or the hosted UI. There is no `UserPoolDomain` and OAuth is off, so this does not apply.

## Data underneath
I read the templates directly; the values are listed under journey 1. I checked them against botocore 1.44.9's cognito-idp model and aws-cdk-lib 2.275.0's CloudFormation property list:
* the names are valid;
* the values are in the enums;
* `UserPoolTier` defaults to ESSENTIALS, so there is no cost change.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | The pool side is complete and correct. A passkey as both steps also needs the per-user switch, which nothing here or in a named row provides (M1) |
| Next step obvious | ½ | The PR names the live proof, PF-4bc and the no-domain question, but not the per-user activation owner |
| Plain words | 1 | Findings read like `…: a passkey is "SINGLE_FACTOR", not both steps with user verification (MULTI_FACTOR_WITH_USER_VERIFICATION)` |
| Feedback and state | 1 | Each finding names the resource id and the property |
| Correct data | 1 | Every synthesized value matches the row and AWS's enums |
| Error recovery (the guard catches mistakes) | 1 | 8 breaks × 2 pools caught; mutations 1–5 red. One no-domain gap (m1), Minor |
| Accessibility and screen sizes | 1 | No UI. Plain-text output (CLI equivalent) |
| Speed | 1 | Suite about 12 s, no network |
| Visual quality | 1 | No UI. The README line and comments are clear |
| Trust and sources | ½ | The API model is cited with version and date, but the quote leaves out `WebAuthnMfaSettingsType`, so the README over-claims (M1) |

**8.5/10: pass (8 or more, no 0).**

To raise the half scores, most valuable first:
1. Reword README:79 and the code comment to state the per-user switch with TOTP underneath, and quote `WebAuthnMfaSettingsType`.
2. Ask the tech lead which row owns passkey registration, the per-user switch and clearing it on reset.

## Could not test
* A real deploy, including whether Cognito accepts MFA `ON` with a WEB_AUTHN first factor.
* A passkey ceremony in a browser.
* Cognito's origin check against subdomains.
* The CI run on GitHub.
* An intended user's unaided walk (D17/D20 stay with the founder).
