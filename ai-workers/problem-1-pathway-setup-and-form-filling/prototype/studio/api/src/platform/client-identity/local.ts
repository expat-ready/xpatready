// PF-4p part 1 (R1.62; P-584 (4)): the local stand-in for clients' own pool. A third stand-in, apart from the firm staff's
// (identity/local.ts) and our own staff's (system-identity/local.ts): its own signing key, its own issuer and a
// `plane: "client"` claim, so no other stand-in's token ever verifies here and this one's never verifies there.
// The key is derived from PLATFORM_LOCAL_SECRET with a label of its own (HMAC-SHA256, node:crypto: tech gate entry 2, as
// PF-4), so two processes of one copy agree and no new setting is needed; unset: a random key per start. Used only when
// PLATFORM_IDENTITY=local, which PF-24's loader refuses outside PLATFORM_ENVIRONMENT=local. In the cloud the client pool is
// a Cognito user pool of its own (PF-4b's construct; not wired yet: every client token is refused, saying so).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { IdentityRefused, type IdentityPort, type VerifiedIdentity } from "../identity/port.ts";

export const CLIENT_LOCAL_ISSUER = "expatready-local-standin-client";
/** A client's local session lasts one hour (Sample, as the staff stand-ins'). */
export const CLIENT_LOCAL_TTL_SECONDS = 3600;

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const HEADER = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const NOT_OURS = "This sign-in is not one this server issued for a client portal. Sign in again.";

/** The client plane's own key: never the firm stand-in's key itself. */
export const clientPlaneKey = (secret: string | null) => (secret ? createHmac("sha256", Buffer.from(secret, "utf8")).update("expatready client plane v1").digest() : randomBytes(32));

export class ClientLocalIdentity implements IdentityPort {
  readonly via = "local" as const;
  private readonly key: Buffer;
  constructor(secret: string | null, private readonly now: () => number) { this.key = clientPlaneKey(secret); }

  private sign(body: string) { return createHmac("sha256", this.key).update(body).digest(); }

  /** Issues a token for one client account id. authTimeMs: when this sign-in happened (milliseconds). */
  issue(accountId: string, o: { authTimeMs: number }): string {
    const nowS = this.now() / 1000;
    const payload = b64(JSON.stringify({ iss: CLIENT_LOCAL_ISSUER, plane: "client", token_use: "access", sub: accountId, iat: nowS, exp: nowS + CLIENT_LOCAL_TTL_SECONDS, auth_time: o.authTimeMs / 1000, amr: ["pwd"] }));
    return `${HEADER}.${payload}.${b64(this.sign(`${HEADER}.${payload}`))}`;
  }

  async verify(token: string): Promise<VerifiedIdentity> {
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== HEADER || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) throw new IdentityRefused(NOT_OURS);
    const given = Buffer.from(parts[2], "base64url"), want = this.sign(`${parts[0]}.${parts[1]}`);
    if (given.length !== want.length || !timingSafeEqual(given, want)) throw new IdentityRefused(NOT_OURS);
    let c: Record<string, unknown>;
    try { c = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>; } catch { throw new IdentityRefused("This sign-in cannot be read. Sign in again."); }
    if (!c || typeof c !== "object" || Array.isArray(c)) throw new IdentityRefused("This sign-in cannot be read. Sign in again.");
    const nowS = this.now() / 1000;
    if (c.iss !== CLIENT_LOCAL_ISSUER || c.plane !== "client" || c.token_use !== "access") throw new IdentityRefused(NOT_OURS);
    if (typeof c.exp !== "number" || c.exp <= nowS) throw new IdentityRefused("Your session has ended. Sign in again.", "TOKEN_EXPIRED");
    if (typeof c.iat !== "number" || c.iat > nowS + 60 || typeof c.auth_time !== "number" || c.auth_time > nowS + 60) throw new IdentityRefused("This sign-in is dated in the future. Sign in again.");
    if (typeof c.sub !== "string" || !c.sub) throw new IdentityRefused("This sign-in names nobody. Sign in again.");
    // AG16-23: a client's two-step is never forced, so the second step is not asked for here.
    return { via: "local", lookup: { staffId: c.sub }, authTime: c.auth_time, secondStep: false };
  }
}
