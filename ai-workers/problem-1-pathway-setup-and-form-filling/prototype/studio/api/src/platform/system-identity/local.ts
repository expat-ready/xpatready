// PF-4s (SA-7-1, SA-7-2): the local stand-in for our own staff's pool. A second stand-in, apart from the firm staff's
// (identity/local.ts): its own signing key (PLATFORM_SYSTEM_LOCAL_SECRET, never the firm stand-in's; unset: a random key
// per start), its own issuer and a `plane: "system"` claim, so neither stand-in's token ever verifies as the other's.
// HMAC-SHA256 with node:crypto (tech gate entry 2, as PF-4). Used only when PLATFORM_SYSTEM_IDENTITY=local, which the
// loader refuses outside PLATFORM_ENVIRONMENT=local. A token never carries a firm id: one that does is refused.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { IdentityRefused, type IdentityPort, type VerifiedIdentity } from "../identity/port.ts";

export const SYSTEM_LOCAL_ISSUER = "expatready-local-standin-system";
/** A local session lasts one hour (Sample, as the firm stand-in's). */
export const SYSTEM_LOCAL_TTL_SECONDS = 3600;

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const HEADER = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const NOT_OURS = "This sign-in token is not one this server issued for ExpatReady staff. Sign in again.";

export class SystemLocalIdentity implements IdentityPort {
  readonly via = "local" as const;
  private readonly key: Buffer;
  constructor(secret: string | null, private readonly now: () => number) { this.key = secret ? Buffer.from(secret, "utf8") : randomBytes(32); }

  private sign(body: string) { return createHmac("sha256", this.key).update(body).digest(); }

  /** Issues a token for one of our own staff ids. authTimeMs: when this sign-in happened (milliseconds). */
  issue(staffId: string, o: { authTimeMs: number; secondStep: boolean }): string {
    const nowS = this.now() / 1000;
    const payload = b64(JSON.stringify({ iss: SYSTEM_LOCAL_ISSUER, plane: "system", token_use: "access", sub: staffId, iat: nowS, exp: nowS + SYSTEM_LOCAL_TTL_SECONDS, auth_time: o.authTimeMs / 1000, amr: o.secondStep ? ["pwd", "otp"] : ["pwd"] }));
    return `${HEADER}.${payload}.${b64(this.sign(`${HEADER}.${payload}`))}`;
  }

  async verify(token: string): Promise<VerifiedIdentity> {
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== HEADER || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) throw new IdentityRefused(NOT_OURS);
    const given = Buffer.from(parts[2], "base64url"), want = this.sign(`${parts[0]}.${parts[1]}`);
    if (given.length !== want.length || !timingSafeEqual(given, want)) throw new IdentityRefused(NOT_OURS);
    let c: Record<string, unknown>;
    try { c = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>; } catch { throw new IdentityRefused("This sign-in token cannot be read. Sign in again."); }
    if (!c || typeof c !== "object" || Array.isArray(c)) throw new IdentityRefused("This sign-in token cannot be read. Sign in again.");
    const nowS = this.now() / 1000;
    if (c.iss !== SYSTEM_LOCAL_ISSUER || c.plane !== "system" || c.token_use !== "access") throw new IdentityRefused("This is not an ExpatReady staff sign-in (access) token. Sign in again.");
    // SA-7-1: a staff token never carries a firm id, under any spelling of the claim.
    if (Object.keys(c).some((k) => /firm/i.test(k))) throw new IdentityRefused("An ExpatReady staff session never names a firm. Sign in again.");
    if (typeof c.exp !== "number" || c.exp <= nowS) throw new IdentityRefused("Your session has ended. Sign in again.", "TOKEN_EXPIRED");
    if (typeof c.iat !== "number" || c.iat > nowS + 60 || typeof c.auth_time !== "number" || c.auth_time > nowS + 60) throw new IdentityRefused("This sign-in token is dated in the future. Sign in again.");
    if (typeof c.sub !== "string" || !c.sub) throw new IdentityRefused("This sign-in token names nobody. Sign in again.");
    const amr = Array.isArray(c.amr) ? c.amr : [];
    return { via: "local", lookup: { staffId: c.sub }, authTime: c.auth_time, secondStep: amr.includes("otp") };
  }
}
