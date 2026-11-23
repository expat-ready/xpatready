// PF-4b: the identity provider's admin side, beside PF-4's IdentityPort: create a user with its own email suppressed (AWS
// AdminCreateUser: "Set to SUPPRESS to suppress sending the message", read 15 Nov 2026), the set-password hand-off,
// two-step state and reset, sign-out everywhere, a sign-in code → who. `local`: in memory (PLATFORM_IDENTITY=local only);
// `cognito`: PF-4bc, Amazon Cognito's admin API through @aws-sdk/client-cognito-identity-provider (PF-Lc gate, #1820),
// signed by the task's role; CI and lanes answer it from recorded shapes through the SDK's `requestHandler`, never the network.
import { AdminCreateUserCommand, AdminGetUserAuthFactorsCommand, AdminGetUserCommand, AdminSetUserMFAPreferenceCommand, AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient, type CognitoIdentityProviderClientConfig } from "@aws-sdk/client-cognito-identity-provider";
import { randomBytes, randomUUID } from "node:crypto";
import { problem } from "../keys.ts";
import type { IdentityConfig } from "../port.ts";

export const IDENTITY_ADMIN_PORT = Symbol("IdentityAdminPort");
/** A person as the provider knows them: our staff id, the provider's subject (Cognito `sub`) when known, the email. */
export type ProviderUser = { staffId: string; subject: string | null; email: string };
/** Two-step state from the provider: `TOTP` (authenticator app), `PASSKEY` (with user verification, replacing password
 *  plus second step), or null: not set up yet (they set it up at their next sign-in; the pool requires it). */
export type TwoStep = { method: "TOTP" | "PASSKEY" | null };
/** Where the invitee goes next: the provider's page to set a password (local: our callback with a one-time code). */
export type HandOff = { kind: "set-password"; url: string };

export interface IdentityAdminPort {
  readonly via: "local" | "cognito";
  /** Creates the provider user with the provider's own email suppressed, or reuses the one an earlier, rolled-back
   *  accept left (Cognito: AdminCreateUser's UsernameExistsException → AdminGetUser); returns its subject. */
  createUser(email: string): Promise<{ subject: string }>;
  handOff(firmKey: string, email: string): Promise<HandOff>;
  twoStep(u: ProviderUser): Promise<TwoStep>;
  resetTwoStep(u: ProviderUser): Promise<void>;
  signOutEverywhere(u: ProviderUser): Promise<void>;
  /** A sign-in code from the hand-off or the provider's redirect → who signs in (one use; 5 minutes). */
  redeem(code: string): Promise<{ firmKey: string; email: string }>;
}

const CODE_MS = 5 * 60_000;
const refusedCode = (): never => problem(401, "Sign in again", "This sign-in link has been used or has expired. Sign in again.", { code: "SIGN_IN_CODE_REFUSED" });

/** The hand-off's one-time sign-in codes (5 minutes, one use), kept in this process's memory: both adapters use it. */
class OneTimeCodes {
  private readonly codes = new Map<string, { firmKey: string; email: string; until: number }>();
  constructor(private readonly now: () => number) {}
  issue(firmKey: string, email: string): HandOff {
    const code = randomBytes(32).toString("base64url");
    this.codes.set(code, { firmKey, email, until: this.now() + CODE_MS });
    return { kind: "set-password", url: `/sign-in/callback#code=${code}` };   // the page posts the code to POST /api/platform/session/callback
  }
  take(code: unknown): { firmKey: string; email: string } {
    const c = typeof code === "string" ? this.codes.get(code) : undefined;
    if (!c) return refusedCode();
    this.codes.delete(code as string);
    if (c.until <= this.now()) return refusedCode();
    return { firmKey: c.firmKey, email: c.email };
  }
}

export class LocalIdentityAdmin implements IdentityAdminPort {
  readonly via = "local" as const;
  private readonly users = new Map<string, string>();               // subject → email
  private readonly reset = new Set<string>();                       // staff ids whose second step was reset
  private readonly codes: OneTimeCodes;
  /** Sign-outs the stand-in received (the provider's refresh tokens end; our revocation row ends the access token). */
  readonly signedOut: string[] = [];
  constructor(now: () => number) { this.codes = new OneTimeCodes(now); }

  async createUser(email: string) {
    const had = [...this.users].find(([, e]) => e === email);
    if (had) return { subject: had[0] };
    const subject = `local-${randomUUID()}`;
    this.users.set(subject, email);
    return { subject };
  }
  async handOff(firmKey: string, email: string) { return this.codes.issue(firmKey, email); }
  /** The stand-in signs in with the second step done (PF-4's rule), so a person is set up unless their step was reset. */
  async twoStep(u: ProviderUser): Promise<TwoStep> { return { method: this.reset.has(u.staffId) ? null : "TOTP" }; }
  async resetTwoStep(u: ProviderUser) { this.reset.add(u.staffId); }
  async signOutEverywhere(u: ProviderUser) { this.signedOut.push(u.staffId); }
  async redeem(code: string) { return this.codes.take(code); }
  /** After a sign-in through the hand-off the person has set up their second step again. */
  enrolled(staffId: string) { this.reset.delete(staffId); }
}

/** The admin calls the adapter makes; the SDK client answers them (tests: through a recorded `requestHandler`). */
type CognitoSend = Pick<CognitoIdentityProviderClient, "send">;
export type CognitoAdminOptions = {
  now?: () => number;
  /** Tests and lanes: the SDK's request handler with recorded answers, and made-up keys (never a real one in a file). */
  requestHandler?: CognitoIdentityProviderClientConfig["requestHandler"];
  credentials?: CognitoIdentityProviderClientConfig["credentials"];
};
const POOL_ID = /^ca-central-1_[0-9A-Za-z]+$/;
/** A Cognito call gives up after this (connect 5 s), inside the accept's transaction. */
export const COGNITO_TIMEOUT_MS = 10_000;
const NOT_SET_UP = "SIGN_IN_NOT_SET_UP";

/**
 * PF-4bc: the port on Amazon Cognito's admin API (the staff pool; email is the username, `signInAliases: { email: true }`).
 * createUser: AdminCreateUser with `MessageAction: "SUPPRESS"` on every call ("Set to SUPPRESS to suppress sending the
 * message", the SDK's AdminCreateUserRequest), the email marked verified (the invitation link proved it); an existing
 * user (UsernameExistsException, a rolled-back accept) → AdminGetUser, its `sub`. twoStep: AdminGetUserAuthFactors
 * (`WEB_AUTHN` configured → PASSKEY; `SOFTWARE_TOKEN_MFA` in UserMFASettingList → TOTP; else null). resetTwoStep:
 * AdminSetUserMFAPreference turning the authenticator app off (and passkey MFA, when the person had it); the pool requires
 * two-step sign-in, so the next sign-in asks them to set it up again. signOutEverywhere: AdminUserGlobalSignOut (every
 * refresh token ends; our revocation row ends the access token). handOff/redeem: the same one-time code as the stand-in
 * (the pool client has no hosted page, `disableOAuth: true`), and redeem asks Cognito that the person is there and enabled.
 * Every provider error becomes the port's own problem with our words and a code; the SDK's text is never passed on or
 * logged (it can quote a request); a log line names the call and the error's name only.
 */
export class CognitoIdentityAdmin implements IdentityAdminPort {
  readonly via = "cognito" as const;
  private readonly client: CognitoSend | null;
  private readonly poolId: string;
  private readonly codes: OneTimeCodes;
  private readonly notReady: string | null;
  constructor(config: IdentityConfig["cognito"], o: CognitoAdminOptions = {}) {
    this.poolId = config.userPoolId ?? "";
    this.notReady = !config.userPoolId ? "Staff sign-in is not set up on this server (no Cognito pool is configured)."
      : !POOL_ID.test(config.userPoolId) ? "Staff sign-in is not set up on this server: the Cognito pool must be in ca-central-1." : null;
    this.client = this.notReady ? null : new CognitoIdentityProviderClient({
      region: "ca-central-1", maxAttempts: 2,
      ...(o.credentials ? { credentials: o.credentials } : {}),
      requestHandler: o.requestHandler ?? { requestTimeout: COGNITO_TIMEOUT_MS, connectionTimeout: 5_000 },
    });
    this.codes = new OneTimeCodes(o.now ?? Date.now);
  }

  private async call<T>(op: string, run: (c: CognitoSend) => Promise<T>, quiet: string[] = []): Promise<T> {
    if (!this.client) return problem(503, "Not set up", this.notReady!, { code: NOT_SET_UP });
    try { return await run(this.client); } catch (e) {
      const err = e as { name?: unknown; $metadata?: { httpStatusCode?: number } }, name = typeof err?.name === "string" && /^[A-Za-z]{1,60}$/.test(err.name) ? err.name : "Error";
      if (quiet.includes(name)) throw new ProviderSaid(name);
      console.warn(`identity-admin: Cognito ${op} refused (${name}${err?.$metadata?.httpStatusCode ? ` ${err.$metadata.httpStatusCode}` : ""})`);
      return mapProviderError(name, err?.$metadata?.httpStatusCode);
    }
  }
  private who(u: ProviderUser) { return u.subject ?? u.email; }   // Cognito takes the `sub` or the email alias as Username

  async createUser(email: string) {
    try {
      const out = await this.call("AdminCreateUser", (c) => c.send(new AdminCreateUserCommand({
        UserPoolId: this.poolId, Username: email, MessageAction: "SUPPRESS",
        UserAttributes: [{ Name: "email", Value: email }, { Name: "email_verified", Value: "true" }],
      })), ["UsernameExistsException"]);
      return { subject: subjectOf(out.User?.Attributes) };
    } catch (e) {
      if (!(e instanceof ProviderSaid)) throw e;
      const had = await this.call("AdminGetUser", (c) => c.send(new AdminGetUserCommand({ UserPoolId: this.poolId, Username: email })));
      return { subject: subjectOf(had.UserAttributes) };
    }
  }
  async handOff(firmKey: string, email: string) {
    if (!this.client) return problem(503, "Not set up", this.notReady!, { code: NOT_SET_UP });
    return this.codes.issue(firmKey, email);
  }
  async twoStep(u: ProviderUser): Promise<TwoStep> {
    try {
      const f = await this.call("AdminGetUserAuthFactors", (c) => c.send(new AdminGetUserAuthFactorsCommand({ UserPoolId: this.poolId, Username: this.who(u) })), ["UserNotFoundException"]);
      return { method: f.ConfiguredUserAuthFactors?.includes("WEB_AUTHN") ? "PASSKEY" : f.UserMFASettingList?.includes("SOFTWARE_TOKEN_MFA") ? "TOTP" : null };
    } catch (e) { if (e instanceof ProviderSaid) return { method: null }; throw e; }   // no provider user yet: nothing set up
  }
  async resetTwoStep(u: ProviderUser) {
    const had = await this.twoStep(u);
    try {
      await this.call("AdminSetUserMFAPreference", (c) => c.send(new AdminSetUserMFAPreferenceCommand({
        UserPoolId: this.poolId, Username: this.who(u), SoftwareTokenMfaSettings: { Enabled: false, PreferredMfa: false },
        ...(had.method === "PASSKEY" ? { WebAuthnMfaSettings: { Enabled: false } } : {}),
      })), ["UserNotFoundException"]);
    } catch (e) { if (!(e instanceof ProviderSaid)) throw e; }   // no provider user: nothing to reset
  }
  async signOutEverywhere(u: ProviderUser) {
    try { await this.call("AdminUserGlobalSignOut", (c) => c.send(new AdminUserGlobalSignOutCommand({ UserPoolId: this.poolId, Username: this.who(u) })), ["UserNotFoundException"]); }
    catch (e) { if (!(e instanceof ProviderSaid)) throw e; }   // no provider user: no provider session to end
  }
  async redeem(code: string) {
    if (!this.client) return problem(503, "Not set up", this.notReady!, { code: NOT_SET_UP });
    const who = this.codes.take(code);
    try {
      const u = await this.call("AdminGetUser", (c) => c.send(new AdminGetUserCommand({ UserPoolId: this.poolId, Username: who.email })), ["UserNotFoundException"]);
      if (u.Enabled === false) return refusedCode();
    } catch (e) { if (e instanceof ProviderSaid) return refusedCode(); throw e; }
    return who;
  }
}

/** A provider answer the adapter handles itself (never leaves this file). */
class ProviderSaid extends Error { constructor(readonly said: string) { super(said); } }
const subjectOf = (attrs: { Name?: string; Value?: string }[] | undefined): string => {
  const sub = attrs?.find((a) => a.Name === "sub")?.Value;
  return typeof sub === "string" && /^[0-9A-Za-z-]{1,128}$/.test(sub) ? sub : problem(502, "Sign-in provider error", PROVIDER_WORDS, { code: "SIGN_IN_PROVIDER_ERROR" });
};
const PROVIDER_WORDS = "The sign-in service did not complete this. Try again in a minute; if it keeps failing, tell support.";
/** The port's errors for a provider error, by the error's name only (the SDK's message is never used). */
export function mapProviderError(name: string, status?: number): never {
  if (name === "TooManyRequestsException" || name === "LimitExceededException") return problem(503, "Try again shortly", "The sign-in service is busy. Try again in a minute.", { code: "SIGN_IN_PROVIDER_BUSY" });
  if (name === "AccessDeniedException" || name === "NotAuthorizedException" || name === "ResourceNotFoundException" || name === "UnrecognizedClientException" || name === "CredentialsProviderError")
    return problem(503, "Not set up", "This server may not manage sign-in accounts (its access to the sign-in service is not set up).", { code: NOT_SET_UP });
  if (!status) return problem(503, "Try again shortly", "The sign-in service could not be reached. Try again in a minute.", { code: "SIGN_IN_PROVIDER_UNREACHABLE" });
  return problem(502, "Sign-in provider error", PROVIDER_WORDS, { code: "SIGN_IN_PROVIDER_ERROR" });
}
