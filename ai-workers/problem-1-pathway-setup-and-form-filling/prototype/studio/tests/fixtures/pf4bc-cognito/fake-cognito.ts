// PF-4bc: the recorded fake Cognito (staff pool) for tests. It is the AWS SDK's own `requestHandler` (the seam of the SES
// and S3 adapters' tests): the real CognitoIdentityProviderClient builds each HTTP request (AWS JSON 1.1: POST /, the
// operation in X-Amz-Target, a JSON body, signed with the made-up keys the test gives), this handler keeps it in `seen`
// and answers from memory in Cognito's response shapes; nothing reaches the network and no AWS account is used (US$0).
// The shapes and where each was read: the notes at the end of this header. It keeps, for one pool whose username is the email: AdminCreateUser
// (UsernameExistsException for a taken email; the user FORCE_CHANGE_PASSWORD with a `sub`), AdminGetUser,
// AdminGetUserAuthFactors, AdminSetUserMFAPreference, AdminUserGlobalSignOut, UserNotFoundException for anyone else,
// and an error forced by the test for the next call. It does NOT check signatures or the pool's own settings.
//
// ---- Where each shape was read, and what is not verified ----
// `fake-cognito.ts` is the AWS SDK's `requestHandler` (the seam the SES and S3 adapters' tests use). The real `CognitoIdentityProviderClient` (`@aws-sdk/client-cognito-identity-provider` 3.1161.0, gated by PF-Lc, #1820) builds and signs every request; the handler keeps it and answers from memory. Nothing reaches the network; no AWS account is used (US$0).
//
// **What "recorded" means here, plainly:** the requests are real (what the SDK sends, checked field by field in the test). **The answers were not captured from a live pool** (no AWS access in this row; the live proof is C21, recorded later, not a merge gate). Their shapes come from the SDK's own published models, read in the installed package on 23 Nov 2026 (`node_modules/@aws-sdk/client-cognito-identity-provider/dist-types/models/models_0.d.ts`):
//
// | Shape | Source quote |
// |---|---|
// | `AdminCreateUser` request `MessageAction` | "Set to `SUPPRESS` to suppress sending the message." |
// | `AdminCreateUser` response `User.Attributes` (with `sub`), `UserStatus` `FORCE_CHANGE_PASSWORD` | `AdminCreateUserResponse`, `UserType`, `UserStatusType` |
// | `AdminGetUser` response `UserAttributes`, `Enabled`, `UserMFASettingList` | "The MFA options that are activated for the user. The possible values in this list are `SMS_MFA`, `EMAIL_OTP`, and `SOFTWARE_TOKEN_MFA`." |
// | `AdminGetUserAuthFactors` response `ConfiguredUserAuthFactors` | "The authentication types that are available to the user with `USER_AUTH` sign-in, for example `["PASSWORD", "WEB_AUTHN"]`." |
// | `AdminSetUserMFAPreference` `WebAuthnMfaSettings` | "To activate this setting, the `FactorConfiguration` of your user pool `WebAuthnConfiguration` must be `MULTI_FACTOR_WITH_USER_VERIFICATION`." (so the adapter sends it only to a person who has a passkey) |
// | `Username` on admin calls | "it can be any of their alias attributes. If `username` isn't an alias attribute in your user pool, this value must be the `sub` of a local user" |
// | Errors `UsernameExistsException`, `UserNotFoundException`, `TooManyRequestsException`, `NotAuthorizedException`, `InvalidParameterException` | `dist-types/models/errors.d.ts`; the JSON 1.1 error body (`__type`, `message`, header `x-amzn-errortype`) is read by the SDK's own parser in the test (each reaches the adapter as the error's `name` and `$metadata.httpStatusCode`) |
//
// **Not verified against a real pool:**
// * that a person whose authenticator app is turned off is asked to set it up again at the next sign-in when the pool requires MFA (the adapter's reset relies on it);
// * the error name Cognito gives an app whose role lacks `cognito-idp` actions (mapped from `AccessDeniedException` and `NotAuthorizedException` to 503 `SIGN_IN_NOT_SET_UP`);
// * that turning passkey MFA off (`WebAuthnMfaSettings.Enabled: false`) stops a passkey signing in on a pool that requires MFA (the SDK's words: "When activated, ... passkey sign-in is available when MFA is required"); the passkey itself stays, and this fake keeps it listed in `ConfiguredUserAuthFactors`;
// * `docs.aws.amazon.com` was not opened from the cloud network; the quotes are the SDK's copies of the API reference.
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

export type SeenCall = { op: string; body: Record<string, any>; headers: Record<string, string>; raw: string };
type User = { sub: string; email: string; enabled: boolean; totp: boolean; passkey: boolean; passkeyMfa: boolean; signOuts: number };
type HttpRequest = { method: string; hostname: string; path: string; headers: Record<string, string>; body?: unknown };

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  ({ response: { statusCode: status, headers: { "content-type": "application/x-amz-json-1.1", "x-amzn-requestid": "pf4bc-recorded-0001", ...headers }, body: Readable.from([Buffer.from(JSON.stringify(body))]) } });
/** Cognito's error answer: status, `__type` in the body and `x-amzn-errortype`, a message (which may quote the request). */
const error = (status: number, type: string, message: string) => json(status, { __type: type, message }, { "x-amzn-errortype": `${type}:` });

export function fakeCognito(poolId: string) {
  const users = new Map<string, User>();   // email → user
  const seen: SeenCall[] = [];
  let delayMs = 0, override: unknown = null;
  const forced: ({ status: number; type: string; message: string } | "drop")[] = [];
  const find = (username: string) => users.get(username.toLowerCase()) ?? [...users.values()].find((u) => u.sub === username);
  const attrs = (u: User) => [{ Name: "sub", Value: u.sub }, { Name: "email", Value: u.email }, { Name: "email_verified", Value: "true" }];

  async function answer(req: HttpRequest) {
    const raw = typeof req.body === "string" ? req.body : req.body ? new TextDecoder().decode(req.body as Uint8Array) : "";
    const target = req.headers["x-amz-target"] ?? req.headers["X-Amz-Target"] ?? "", op = target.split(".")[1] ?? "";
    const body = raw ? JSON.parse(raw) : {};
    seen.push({ op, body, headers: { ...req.headers }, raw });
    if (override) { const o = override; override = null; return json(200, o); }
    const f = forced.shift();
    if (f === "drop") throw Object.assign(new Error("socket hang up"), { name: "TimeoutError" });
    if (f) return error(f.status, f.type, f.message);
    if (body.UserPoolId !== poolId) return error(400, "ResourceNotFoundException", `User pool ${body.UserPoolId} does not exist.`);
    const notFound = () => error(400, "UserNotFoundException", "User does not exist.");
    switch (op) {
      case "AdminCreateUser": {
        const email = String(body.Username).toLowerCase();
        if (users.has(email)) return error(400, "UsernameExistsException", "An account with the given email already exists.");
        const u: User = { sub: randomUUID(), email, enabled: true, totp: false, passkey: false, passkeyMfa: false, signOuts: 0 };
        users.set(email, u);
        return json(200, { User: { Username: u.sub, Attributes: attrs(u), Enabled: true, UserStatus: "FORCE_CHANGE_PASSWORD", UserCreateDate: 1795000000, UserLastModifiedDate: 1795000000 } });
      }
      case "AdminGetUser": {
        const u = find(String(body.Username)); if (!u) return notFound();
        return json(200, { Username: u.sub, UserAttributes: attrs(u), Enabled: u.enabled, UserStatus: "FORCE_CHANGE_PASSWORD", UserMFASettingList: u.totp ? ["SOFTWARE_TOKEN_MFA"] : undefined, PreferredMfaSetting: u.totp ? "SOFTWARE_TOKEN_MFA" : undefined });
      }
      case "AdminGetUserAuthFactors": {
        const u = find(String(body.Username)); if (!u) return notFound();
        return json(200, { Username: u.sub, ...(u.totp ? { UserMFASettingList: ["SOFTWARE_TOKEN_MFA"], PreferredMfaSetting: "SOFTWARE_TOKEN_MFA" } : {}), ConfiguredUserAuthFactors: ["PASSWORD", ...(u.totp ? ["SOFTWARE_TOKEN"] : []), ...(u.passkey ? ["WEB_AUTHN"] : [])] });
      }
      case "AdminSetUserMFAPreference": {
        const u = find(String(body.Username)); if (!u) return notFound();
        if (body.SoftwareTokenMfaSettings?.Enabled === false) u.totp = false;
        if (body.WebAuthnMfaSettings?.Enabled === false) u.passkeyMfa = false;   // the passkey itself stays (break M3): no admin call deletes one
        return json(200, {});
      }
      case "AdminUserGlobalSignOut": {
        const u = find(String(body.Username)); if (!u) return notFound();
        u.signOuts++; return json(200, {});
      }
      default: return error(400, "InvalidParameterException", `Unknown operation ${op}`);
    }
  }
  return {
    seen, users,
    requestHandler: {
      async handle(req: HttpRequest, o: { abortSignal?: AbortSignal } = {}) {
        if (delayMs) await new Promise<void>((res, rej) => {
          const t = setTimeout(res, delayMs), stop = () => { clearTimeout(t); rej(Object.assign(new Error("Request aborted"), { name: "AbortError" })); };
          if (o.abortSignal?.aborted) stop(); else o.abortSignal?.addEventListener?.("abort", stop, { once: true });
        });
        if (o.abortSignal?.aborted) throw Object.assign(new Error("Request aborted"), { name: "AbortError" });
        return answer(req);
      }, updateHttpClientConfig() {}, httpHandlerConfigs() { return {}; }, destroy() {} },
    /** The next call answers this body with 200 (a malformed answer). */
    overrideNext(body: unknown) { override = body; },
    /** Every answer waits this long first (an abort ends the wait, as the SDK's own handler does). */
    slow(ms: number) { delayMs = ms; },
    /** The user is deleted and created again under the same email (a new `sub`), as an operator fixing a stuck user would. */
    recreate(email: string) { const u = users.get(email.toLowerCase())!; users.set(u.email, { ...u, sub: randomUUID(), totp: false, passkey: false, passkeyMfa: false, signOuts: 0 }); return users.get(u.email)!; },
    /** The next call answers this error (or, with "drop", the connection drops: no HTTP answer); queued, one per call. */
    failNext(f: { status: number; type: string; message: string } | "drop") { forced.push(f); },
    /** The person sets up an authenticator app (or a passkey) at sign-in, as Cognito records it. */
    enrol(email: string, how: "totp" | "passkey" = "totp") { const u = users.get(email.toLowerCase())!; u.totp = true; if (how === "passkey") { u.passkey = true; u.passkeyMfa = true; } },
    disable(email: string) { users.get(email.toLowerCase())!.enabled = false; },
  };
}
