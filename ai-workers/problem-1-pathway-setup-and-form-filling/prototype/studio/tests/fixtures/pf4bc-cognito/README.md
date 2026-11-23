# PF-4bc: the recorded fake Cognito

`fake-cognito.ts` is the AWS SDK's `requestHandler` (the seam the SES and S3 adapters' tests use). The real `CognitoIdentityProviderClient` (`@aws-sdk/client-cognito-identity-provider` 3.1161.0, gated by PF-Lc, #1820) builds and signs every request; the handler keeps it and answers from memory. Nothing reaches the network; no AWS account is used (US$0).

**What "recorded" means here, plainly:** the requests are real (what the SDK sends, checked field by field in the test). **The answers were not captured from a live pool** (no AWS access in this row; the live proof is C21, recorded later, not a merge gate). Their shapes come from the SDK's own published models, read in the installed package on 23 Nov 2026 (`node_modules/@aws-sdk/client-cognito-identity-provider/dist-types/models/models_0.d.ts`):

| Shape | Source quote |
|---|---|
| `AdminCreateUser` request `MessageAction` | "Set to `SUPPRESS` to suppress sending the message." |
| `AdminCreateUser` response `User.Attributes` (with `sub`), `UserStatus` `FORCE_CHANGE_PASSWORD` | `AdminCreateUserResponse`, `UserType`, `UserStatusType` |
| `AdminGetUser` response `UserAttributes`, `Enabled`, `UserMFASettingList` | "The MFA options that are activated for the user. The possible values in this list are `SMS_MFA`, `EMAIL_OTP`, and `SOFTWARE_TOKEN_MFA`." |
| `AdminGetUserAuthFactors` response `ConfiguredUserAuthFactors` | "The authentication types that are available to the user with `USER_AUTH` sign-in, for example `["PASSWORD", "WEB_AUTHN"]`." |
| `AdminSetUserMFAPreference` `WebAuthnMfaSettings` | "To activate this setting, the `FactorConfiguration` of your user pool `WebAuthnConfiguration` must be `MULTI_FACTOR_WITH_USER_VERIFICATION`." (so the adapter sends it only to a person who has a passkey) |
| `Username` on admin calls | "it can be any of their alias attributes. If `username` isn't an alias attribute in your user pool, this value must be the `sub` of a local user" |
| Errors `UsernameExistsException`, `UserNotFoundException`, `TooManyRequestsException`, `NotAuthorizedException`, `InvalidParameterException` | `dist-types/models/errors.d.ts`; the JSON 1.1 error body (`__type`, `message`, header `x-amzn-errortype`) is read by the SDK's own parser in the test (each reaches the adapter as the error's `name` and `$metadata.httpStatusCode`) |

**Not verified against a real pool:**
* that a person whose authenticator app is turned off is asked to set it up again at the next sign-in when the pool requires MFA (the adapter's reset relies on it);
* the error name Cognito gives an app whose role lacks `cognito-idp` actions (mapped from `AccessDeniedException` and `NotAuthorizedException` to 503 `SIGN_IN_NOT_SET_UP`);
* `docs.aws.amazon.com` was not opened from the cloud network; the quotes are the SDK's copies of the API reference.
