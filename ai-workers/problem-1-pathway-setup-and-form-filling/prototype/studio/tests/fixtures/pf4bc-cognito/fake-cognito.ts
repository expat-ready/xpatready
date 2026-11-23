// PF-4bc: the recorded fake Cognito (staff pool) for tests. It is the AWS SDK's own `requestHandler` (the seam of the SES
// and S3 adapters' tests): the real CognitoIdentityProviderClient builds each HTTP request (AWS JSON 1.1: POST /, the
// operation in X-Amz-Target, a JSON body, signed with the made-up keys the test gives), this handler keeps it in `seen`
// and answers from memory in Cognito's response shapes; nothing reaches the network and no AWS account is used (US$0).
// The shapes and where each was read: README.md. It keeps, for one pool whose username is the email: AdminCreateUser
// (UsernameExistsException for a taken email; the user FORCE_CHANGE_PASSWORD with a `sub`), AdminGetUser,
// AdminGetUserAuthFactors, AdminSetUserMFAPreference, AdminUserGlobalSignOut, UserNotFoundException for anyone else,
// and an error forced by the test for the next call. It does NOT check signatures or the pool's own settings.
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

export type SeenCall = { op: string; body: Record<string, any>; headers: Record<string, string>; raw: string };
type User = { sub: string; email: string; enabled: boolean; totp: boolean; passkey: boolean; signOuts: number };
type HttpRequest = { method: string; hostname: string; path: string; headers: Record<string, string>; body?: unknown };

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  ({ response: { statusCode: status, headers: { "content-type": "application/x-amz-json-1.1", "x-amzn-requestid": "pf4bc-recorded-0001", ...headers }, body: Readable.from([Buffer.from(JSON.stringify(body))]) } });
/** Cognito's error answer: status, `__type` in the body and `x-amzn-errortype`, a message (which may quote the request). */
const error = (status: number, type: string, message: string) => json(status, { __type: type, message }, { "x-amzn-errortype": `${type}:` });

export function fakeCognito(poolId: string) {
  const users = new Map<string, User>();   // email → user
  const seen: SeenCall[] = [];
  const forced: ({ status: number; type: string; message: string } | "drop")[] = [];
  const find = (username: string) => users.get(username.toLowerCase()) ?? [...users.values()].find((u) => u.sub === username);
  const attrs = (u: User) => [{ Name: "sub", Value: u.sub }, { Name: "email", Value: u.email }, { Name: "email_verified", Value: "true" }];

  async function answer(req: HttpRequest) {
    const raw = typeof req.body === "string" ? req.body : req.body ? new TextDecoder().decode(req.body as Uint8Array) : "";
    const target = req.headers["x-amz-target"] ?? req.headers["X-Amz-Target"] ?? "", op = target.split(".")[1] ?? "";
    const body = raw ? JSON.parse(raw) : {};
    seen.push({ op, body, headers: { ...req.headers }, raw });
    const f = forced.shift();
    if (f === "drop") throw Object.assign(new Error("socket hang up"), { name: "TimeoutError" });
    if (f) return error(f.status, f.type, f.message);
    if (body.UserPoolId !== poolId) return error(400, "ResourceNotFoundException", `User pool ${body.UserPoolId} does not exist.`);
    const notFound = () => error(400, "UserNotFoundException", "User does not exist.");
    switch (op) {
      case "AdminCreateUser": {
        const email = String(body.Username).toLowerCase();
        if (users.has(email)) return error(400, "UsernameExistsException", "An account with the given email already exists.");
        const u: User = { sub: randomUUID(), email, enabled: true, totp: false, passkey: false, signOuts: 0 };
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
        if (body.WebAuthnMfaSettings?.Enabled === false) u.passkey = false;
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
    requestHandler: { async handle(req: HttpRequest) { return answer(req); }, updateHttpClientConfig() {}, httpHandlerConfigs() { return {}; }, destroy() {} },
    /** The next call answers this error (or, with "drop", the connection drops: no HTTP answer); queued, one per call. */
    failNext(f: { status: number; type: string; message: string } | "drop") { forced.push(f); },
    /** The person sets up an authenticator app (or a passkey) at sign-in, as Cognito records it. */
    enrol(email: string, how: "totp" | "passkey" = "totp") { const u = users.get(email.toLowerCase())!; if (how === "totp") u.totp = true; else { u.totp = true; u.passkey = true; } },
    disable(email: string) { users.get(email.toLowerCase())!.enabled = false; },
  };
}
