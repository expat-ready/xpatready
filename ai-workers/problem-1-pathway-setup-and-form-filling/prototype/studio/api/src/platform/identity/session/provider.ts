// PF-4b: the identity provider's admin side, beside PF-4's IdentityPort (which only verifies tokens). What PF-4b needs
// from the provider: create a user with the provider's own email suppressed (AWS AdminCreateUser: "Set to SUPPRESS to
// suppress sending the message", read 15 Nov 2026), the hand-off to set a password, a person's two-step state, reset it,
// sign them out everywhere, and turn a sign-in code into a session. Two adapters:
//   local   the stand-in for CI and the Mac (PLATFORM_IDENTITY=local, never in test or production: identityConfig);
//           it remembers in memory, like the provider would, and its hand-off code signs in through PF-4's localSignIn.
//   cognito refuses with the reason: its calls need the AWS SDK's Cognito client, which is not in the app yet (the
//           STANDARDS §1 gate; question on the PR). The pool's settings were verified at AWS's documentation (PR body).
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
  /** Creates the provider user with the provider's own email suppressed; returns its subject. */
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

export class LocalIdentityAdmin implements IdentityAdminPort {
  readonly via = "local" as const;
  private readonly users = new Map<string, string>();               // subject → email
  private readonly reset = new Set<string>();                       // staff ids whose second step was reset
  private readonly codes = new Map<string, { firmKey: string; email: string; until: number }>();
  /** Sign-outs the stand-in received (the provider's refresh tokens end; our revocation row ends the access token). */
  readonly signedOut: string[] = [];
  constructor(private readonly now: () => number) {}

  async createUser(email: string) {
    if ([...this.users.values()].includes(email)) problem(409, "Already has an account", "This email already has a sign-in account.", { code: "PROVIDER_USER_EXISTS" });
    const subject = `local-${randomUUID()}`;
    this.users.set(subject, email);
    return { subject };
  }
  async handOff(firmKey: string, email: string) {
    const code = randomBytes(32).toString("base64url");
    this.codes.set(code, { firmKey, email, until: this.now() + CODE_MS });
    return { kind: "set-password" as const, url: `/api/platform/session/callback?code=${code}` };
  }
  /** The stand-in signs in with the second step done (PF-4's rule), so a person is set up unless their step was reset. */
  async twoStep(u: ProviderUser): Promise<TwoStep> { return { method: this.reset.has(u.staffId) ? null : "TOTP" }; }
  async resetTwoStep(u: ProviderUser) { this.reset.add(u.staffId); }
  async signOutEverywhere(u: ProviderUser) { this.signedOut.push(u.staffId); }
  async redeem(code: string) {
    const c = typeof code === "string" ? this.codes.get(code) : undefined;
    if (!c) return refusedCode();
    this.codes.delete(code);
    if (c.until <= this.now()) return refusedCode();
    return { firmKey: c.firmKey, email: c.email };
  }
  /** After a sign-in through the hand-off the person has set up their second step again. */
  enrolled(staffId: string) { this.reset.delete(staffId); }
}

/** Refuses every call and says why (no Cognito admin client in the app yet; no pool configured, or not in Canada). */
export class CognitoIdentityAdmin implements IdentityAdminPort {
  readonly via = "cognito" as const;
  constructor(private readonly config: IdentityConfig["cognito"]) {}
  private refuse(): never {
    return problem(503, "Not set up", this.config.userPoolId
      ? "This server cannot manage sign-in accounts yet: the Cognito admin client is not in the app (it needs the technology gate)."
      : "Staff sign-in is not set up on this server (no Cognito pool is configured).", { code: "SIGN_IN_NOT_SET_UP" });
  }
  async createUser(): Promise<{ subject: string }> { return this.refuse(); }
  async handOff(): Promise<HandOff> { return this.refuse(); }
  async twoStep(): Promise<TwoStep> { return this.refuse(); }
  async resetTwoStep() { this.refuse(); }
  async signOutEverywhere() { this.refuse(); }
  async redeem(): Promise<{ firmKey: string; email: string }> { return this.refuse(); }
}
