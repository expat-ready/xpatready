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
  take(code: unknown): { firmKey: string; email: string; until: number } {
    const c = typeof code === "string" ? this.codes.get(code) : undefined;
    if (!c) return refusedCode();
    this.codes.delete(code as string);
    if (c.until <= this.now()) return refusedCode();
    return { firmKey: c.firmKey, email: c.email, until: c.until };
  }
  /** A code taken but not used because the provider could not answer (break m1): the person may try it again. */
  giveBack(code: string, c: { firmKey: string; email: string; until: number }) { this.codes.set(code, c); }
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
  async redeem(code: string) { const { firmKey, email } = this.codes.take(code); return { firmKey, email }; }
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
  /** One port call's whole time with Cognito, every request and retry together (default COGNITO_DEADLINE_MS). */
  deadlineMs?: number;
};
const POOL_ID = /^ca-central-1_[0-9A-Za-z]+$/;
const SUB = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** One port call's whole time with Cognito (break M1): its callers hold a database transaction whose limit is Prisma's
 *  default 5 s (session/service.ts), so every request and retry of one call ends inside 3 s, the rest left to the commit. */
export const COGNITO_DEADLINE_MS = 3_000;
const NOT_SET_UP = "SIGN_IN_NOT_SET_UP";
/** Two-step reads (review M2): at most this many Cognito reads at once per server, each under this deadline. */
export const READS_AT_ONCE = 4, READ_DEADLINE_MS = 1_500;
/** A plain counting gate: at most `size` holders; the rest wait in order. */
class Gate {
  private held = 0; private readonly waiting: (() => void)[] = [];
  constructor(private readonly size: number) {}
  async acquire() { if (this.held < this.size) { this.held++; return; } await new Promise<void>((r) => this.waiting.push(r)); }
  release() { const next = this.waiting.shift(); if (next) next(); else this.held--; }
}
/** Error names a log line may print as they are; any other prints as "OtherError" (break m3: a name is provider text). */
const KNOWN_ERRORS = new Set(["TooManyRequestsException", "LimitExceededException", "AccessDeniedException", "NotAuthorizedException", "ResourceNotFoundException",
  "UnrecognizedClientException", "CredentialsProviderError", "InvalidParameterException", "InternalErrorException", "UserNotFoundException", "UsernameExistsException",
  "InvalidSignatureException", "ExpiredTokenException", "TimeoutError", "AbortError", "RequestTimeout", "UnknownError"]);
const NOT_SET_UP_ERRORS = new Set(["AccessDeniedException", "NotAuthorizedException", "ResourceNotFoundException", "UnrecognizedClientException", "CredentialsProviderError", "InvalidSignatureException", "ExpiredTokenException"]);
type Found = { sub: string; email: string; enabled: boolean };

/**
 * PF-4bc: the port on Amazon Cognito's admin API (the staff pool; email is the username, `signInAliases: { email: true }`).
 * createUser: AdminCreateUser with `MessageAction: "SUPPRESS"` on every call ("Set to SUPPRESS to suppress sending the
 * message", the SDK's AdminCreateUserRequest), the email marked verified (the invitation link proved it); an existing
 * user (UsernameExistsException, a rolled-back accept) → AdminGetUser, its `sub` (a turned-off one is refused).
 * Before changing anyone (reset, sign-out everywhere) or reading their two-step state, the adapter finds the person:
 * by our stored `sub` and then checks the email matches; a `sub` Cognito no longer has is asked again by email, and a
 * Cognito user under that email with another `sub` is refused (409 SIGN_IN_ACCOUNT_MISMATCH: nothing is changed and
 * nothing is reported done); nobody under either → nothing to end. twoStep: AdminGetUserAuthFactors; TOTP when
 * `SOFTWARE_TOKEN_MFA` is on, PASSKEY when a passkey (`WEB_AUTHN`) is also there (passkey MFA needs "at least one other
 * MFA method ... activated", WebAuthnMfaSettingsType), else null. resetTwoStep: AdminSetUserMFAPreference turning the
 * authenticator app off, and passkey MFA off for a person with a passkey ("When activated, ... passkey sign-in is
 * available when MFA is required"; the passkey itself stays: deleting one needs the person's own token). The pool
 * requires two-step sign-in, so the next sign-in asks them to set it up again. signOutEverywhere: AdminUserGlobalSignOut.
 * handOff/redeem: the same one-time code as the stand-in (the pool client has no hosted page, `disableOAuth: true`);
 * redeem asks Cognito that the person is there and enabled, and gives the code back when Cognito cannot answer.
 * Every provider error becomes the port's own problem with our words and a code; the SDK's text is never passed on or
 * logged; a log line names the call and a known error's name only. One call's whole time with Cognito: 3 s.
 */
export class CognitoIdentityAdmin implements IdentityAdminPort {
  readonly via = "cognito" as const;
  private readonly client: CognitoSend | null;
  private readonly poolId: string;
  private readonly codes: OneTimeCodes;
  private readonly notReady: string | null;
  private readonly deadlineMs: number;
  private readonly reads = new Gate(READS_AT_ONCE);
  constructor(config: IdentityConfig["cognito"], o: CognitoAdminOptions = {}) {
    this.poolId = config.userPoolId ?? "";
    this.notReady = !config.userPoolId ? "Staff sign-in is not set up on this server (no Cognito pool is configured)."
      : !POOL_ID.test(config.userPoolId) ? "Staff sign-in is not set up on this server: the Cognito pool must be in ca-central-1." : null;
    this.deadlineMs = o.deadlineMs ?? COGNITO_DEADLINE_MS;
    this.client = this.notReady ? null : new CognitoIdentityProviderClient({
      region: "ca-central-1", maxAttempts: 2,
      ...(o.credentials ? { credentials: o.credentials } : {}),
      requestHandler: o.requestHandler ?? { requestTimeout: this.deadlineMs, connectionTimeout: 1_000 },
    });
    this.codes = new OneTimeCodes(o.now ?? Date.now);
  }

  private ready(): CognitoSend { return this.client ?? problem(503, "Not set up", this.notReady!, { code: NOT_SET_UP }); }
  /** Runs one port call's Cognito requests under one deadline (every request and retry together). */
  private async within<T>(run: (signal: AbortSignal) => Promise<T>, ms = this.deadlineMs): Promise<T> {
    this.ready();
    return run(AbortSignal.timeout(Math.min(ms, this.deadlineMs)));
  }
  private async call<T>(op: string, signal: AbortSignal, run: (c: CognitoSend, o: { abortSignal: AbortSignal }) => Promise<T>, quiet: string[] = []): Promise<T> {
    const client = this.ready();
    try { return await run(client, { abortSignal: signal }); } catch (e) {
      const err = e as { name?: unknown; $metadata?: { httpStatusCode?: number } }, raw = typeof err?.name === "string" ? err.name : "";
      const name = KNOWN_ERRORS.has(raw) ? raw : signal.aborted ? "AbortError" : "OtherError", status = err?.$metadata?.httpStatusCode;
      if (quiet.includes(name)) throw new ProviderSaid(name);
      console.warn(`identity-admin: Cognito ${op} refused (${name}${status ? ` ${status}` : ""})`);
      return mapProviderError(name, status);
    }
  }
  private async get(username: string, signal: AbortSignal): Promise<Found | null> {
    try {
      const u = await this.call("AdminGetUser", signal, (c, o) => c.send(new AdminGetUserCommand({ UserPoolId: this.poolId, Username: username }), o), ["UserNotFoundException"]);
      const email = u.UserAttributes?.find((a) => a.Name === "email")?.Value;
      return { sub: subjectOf(u.UserAttributes), email: typeof email === "string" ? email.toLowerCase() : "", enabled: u.Enabled !== false };
    } catch (e) { if (e instanceof ProviderSaid) return null; throw e; }
  }
  /** The person as Cognito has them, matched by our `sub` and the email (break M2); null: Cognito has nobody for them. */
  private async find(u: ProviderUser, signal: AbortSignal): Promise<Found | null> {
    const email = u.email.toLowerCase();
    if (u.subject) {
      const bySub = await this.get(u.subject, signal);
      if (bySub) return bySub.email === email ? bySub : mismatch();
    }
    const byEmail = await this.get(email, signal);
    if (byEmail && u.subject && byEmail.sub !== u.subject) return mismatch();
    return byEmail;
  }

  async createUser(email: string) {
    return this.within(async (signal) => {
      try {
        const out = await this.call("AdminCreateUser", signal, (c, o) => c.send(new AdminCreateUserCommand({
          UserPoolId: this.poolId, Username: email, MessageAction: "SUPPRESS",
          UserAttributes: [{ Name: "email", Value: email }, { Name: "email_verified", Value: "true" }],
        }), o), ["UsernameExistsException"]);
        return { subject: subjectOf(out.User?.Attributes) };
      } catch (e) {
        if (!(e instanceof ProviderSaid)) throw e;
        const had = await this.get(email, signal);
        if (!had) return problem(502, "Sign-in provider error", PROVIDER_WORDS, { code: "SIGN_IN_PROVIDER_ERROR" });
        if (!had.enabled) return problem(409, "Sign-in account turned off", "The sign-in account for this email is turned off. Ask the firm to contact support.", { code: "SIGN_IN_ACCOUNT_DISABLED" });   // break m2
        return { subject: had.sub };
      }
    });
  }
  async handOff(firmKey: string, email: string) { this.ready(); return this.codes.issue(firmKey, email); }
  /** A read for the Team list, a person's panel and My account (review M2: one call per person today, so it is kept to
   *  one request in the usual case, at most READS_AT_ONCE at a time, under a 1.5 s deadline; a person whose `sub` Cognito
   *  no longer has is looked up by email, and one held by someone else under that email reads as a refusal). */
  async twoStep(u: ProviderUser): Promise<TwoStep> {
    this.ready();
    await this.reads.acquire();
    try {
      return await this.within(async (signal) => {
        if (u.subject) {
          try { return await this.factors(u.subject, signal, ["UserNotFoundException"]); } catch (e) { if (!(e instanceof ProviderSaid)) throw e; }
        }
        const who = await this.find(u, signal);
        return who ? this.factors(who.sub, signal) : { method: null };   // no provider user yet: nothing set up
      }, READ_DEADLINE_MS);
    } finally { this.reads.release(); }
  }
  private async factors(sub: string, signal: AbortSignal, quiet: string[] = []): Promise<TwoStep> {
    const f = await this.call("AdminGetUserAuthFactors", signal, (c, o) => c.send(new AdminGetUserAuthFactorsCommand({ UserPoolId: this.poolId, Username: sub }), o), quiet);
    const totp = !!f.UserMFASettingList?.includes("SOFTWARE_TOKEN_MFA");
    return { method: totp && f.ConfiguredUserAuthFactors?.includes("WEB_AUTHN") ? "PASSKEY" : totp ? "TOTP" : null };
  }
  async resetTwoStep(u: ProviderUser) {
    await this.within(async (signal) => {
      const who = await this.find(u, signal);
      if (!who) return;   // no provider user: nothing to reset
      const had = await this.factors(who.sub, signal);
      await this.call("AdminSetUserMFAPreference", signal, (c, o) => c.send(new AdminSetUserMFAPreferenceCommand({
        UserPoolId: this.poolId, Username: who.sub, SoftwareTokenMfaSettings: { Enabled: false, PreferredMfa: false },
        ...(had.method === "PASSKEY" ? { WebAuthnMfaSettings: { Enabled: false } } : {}),
      }), o));
    });
  }
  async signOutEverywhere(u: ProviderUser) {
    await this.within(async (signal) => {
      const who = await this.find(u, signal);
      if (!who) return;   // no provider user: no provider session to end
      await this.call("AdminUserGlobalSignOut", signal, (c, o) => c.send(new AdminUserGlobalSignOutCommand({ UserPoolId: this.poolId, Username: who.sub }), o));
    });
  }
  async redeem(code: string) {
    this.ready();
    const taken = this.codes.take(code), who = { firmKey: taken.firmKey, email: taken.email };
    let found: Found | null;
    try { found = await this.within((signal) => this.get(who.email, signal)); }
    catch (e) { this.codes.giveBack(code, taken); throw e; }   // Cognito could not answer: the code still works (break m1)
    if (!found || !found.enabled) return refusedCode();
    return who;
  }
}

/** A provider answer the adapter handles itself (never leaves this file). */
class ProviderSaid extends Error { constructor(readonly said: string) { super(said); } }
const mismatch = (): never => problem(409, "Sign-in account does not match", "This person's sign-in account does not match our record, so nothing was changed. Contact support.", { code: "SIGN_IN_ACCOUNT_MISMATCH" });
const subjectOf = (attrs: { Name?: string; Value?: string }[] | undefined): string => {
  const subs = (attrs ?? []).filter((a) => a.Name === "sub");   // break m4: exactly one, a UUID
  return subs.length === 1 && typeof subs[0].Value === "string" && SUB.test(subs[0].Value) ? subs[0].Value.toLowerCase() : problem(502, "Sign-in provider error", PROVIDER_WORDS, { code: "SIGN_IN_PROVIDER_ERROR" });
};
const PROVIDER_WORDS = "The sign-in service did not complete this. Try again in a minute; if it keeps failing, tell support.";
/** The port's errors for a provider error, by the error's name only (the SDK's message is never used). */
export function mapProviderError(name: string, status?: number): never {
  if (name === "TooManyRequestsException" || name === "LimitExceededException") return problem(503, "Try again shortly", "The sign-in service is busy. Try again in a minute.", { code: "SIGN_IN_PROVIDER_BUSY" });
  if (NOT_SET_UP_ERRORS.has(name)) return problem(503, "Not set up", "This server may not manage sign-in accounts (its access to the sign-in service is not set up).", { code: NOT_SET_UP });
  if (!status) return problem(503, "Try again shortly", "The sign-in service could not be reached. Try again in a minute.", { code: "SIGN_IN_PROVIDER_UNREACHABLE" });
  return problem(502, "Sign-in provider error", PROVIDER_WORDS, { code: "SIGN_IN_PROVIDER_ERROR" });
}
