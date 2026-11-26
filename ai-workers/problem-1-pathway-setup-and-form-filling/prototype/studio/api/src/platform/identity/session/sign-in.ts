// PF-4bs part 2a (R1.5; concept r3 §2, approved by the tech lead 24 Nov on #3214): our own sign-in page's two doors, behind
// SignInPort, on the local stand-in (the Cognito adapter is part 2b, on recorded answers). Requirements: AG-1-40 as changed
// by contracts §7 §1.2 (two-step for every staff member, an authenticator app, no SMS, no email code), AG-1-55 (one
// session: the older one ends), AG-1-10 (first sign-in sets up the app).
//   POST /api/platform/session/sign-in      {email, password} → {step: "code" | "set-up", attempt, key?, otpauth?}
//   POST /api/platform/session/sign-in/code {attempt, code}    → {token, tokenType, expiresIn}
// * Wrong password and unknown person: one answer, 401 SIGN_IN_REFUSED "That email and password don't match."
// * `attempt` is sealed by the secret box (AES-GCM, the owner {platform, "sign-in-attempt"} is the additional data), so the
//   browser never holds the provider's challenge session and no table is needed (works on either task). It carries the
//   provider's session, the username, the step, an expiry (15 minutes, the staff client's AuthSessionValidity) and a nonce.
// * Limits, kept in this task's memory (no migration, concept N3), each task at half the target so two tasks give it
//   (Sample): per email 5 wrong passwords per 15 minutes (target 10: the same 401, the provider is not asked, so nobody can
//   lock a person at Cognito through our door); per address 25 per 15 minutes (target 50: 429); per attempt 5 wrong codes.
// * The password is never logged, stored or echoed (the test scans everything the process prints).
// * Unconfirmed: no counsel. The Sample numbers above are not from the team's requirements (none name them).
import { Inject, Injectable } from "@nestjs/common";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { SecretRefused, type SecretBoxPort } from "../../../../../ports/secret-box.ts";
import { Db } from "../../../core.ts";
import { withFirm } from "../../firm-scope.ts";
import { parseInput, strict } from "../../http/input.ts";
import { actorWord, auditStaff } from "../audit.ts";
import { problem, unauthorized } from "../keys.ts";
import { PlatformClock } from "../port.ts";
import { PlatformIdentity, emailOf } from "../service.ts";

export const SIGN_IN_PORT = Symbol("SIGN_IN_PORT");
/** The secret box that seals attempts (null: not set up on this server, every sign-in answers 503). */
export const SIGN_IN_BOX = Symbol("SIGN_IN_BOX");

/** The staff member an email names (read by the door through platform_staff_of_email, as their firm). */
export type Person = { staffId: string; firmId: string; firmKey: string; active: boolean; firstTime: boolean };
export type Step = "code" | "set-up";
export type PasswordAnswer = { ok: true; step: Step; session: string; username: string; key?: string } | { ok: false };
export type CodeAnswer = { ok: true; username: string; token?: string; expiresIn?: number } | { ok: false; why: "code" | "expired" };

/** The provider's side of sign-in. Cognito (part 2b): AdminInitiateAuth (ADMIN_USER_PASSWORD_AUTH), then
 *  AdminRespondToAuthChallenge (SOFTWARE_TOKEN_MFA, or MFA_SETUP after AssociateSoftwareToken). */
export interface SignInPort {
  readonly via: "local" | "cognito";
  password(email: string, password: string, person: Person | null): Promise<PasswordAnswer>;
  code(a: { session: string; username: string; step: Step }, code: string): Promise<CodeAnswer>;
}

// ------------------------------------------------------------------------------------- RFC 6238 over node:crypto
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(b: Buffer): string {
  let bits = 0, v = 0, out = "";
  for (const x of b) { v = (v << 8) | x; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } }
  return bits ? out + B32[(v << (5 - bits)) & 31] : out;
}
/** RFC 4226 HOTP over RFC 6238's 30-second steps, SHA-1, 6 digits (what authenticator apps use by default). */
export function totp(secret: Buffer, step: number): string {
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", secret).update(c).digest(), o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
const sameText = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

/** The local stand-in's password for every staff member: Sample, only where PLATFORM_IDENTITY=local (local environment). */
export const LOCAL_SAMPLE_PASSWORD = "Sample-pass-01";

/** The local stand-in of the provider's sign-in. Each person's authenticator key is derived from the stand-in's key and
 *  their staff id, so it survives a restart with PLATFORM_LOCAL_SECRET set; a code is accepted once (a replay is refused). */
export class LocalSignIn implements SignInPort {
  readonly via = "local" as const;
  private readonly used = new Map<string, number>();   // username → the last step accepted
  constructor(private readonly key: Buffer, private readonly now: () => number) {}
  secretOf(staffId: string) { return createHmac("sha256", this.key).update(`pf4bs totp ${staffId}`).digest().subarray(0, 20); }
  async password(_email: string, password: string, person: Person | null): Promise<PasswordAnswer> {
    if (!sameText(password, LOCAL_SAMPLE_PASSWORD) || !person) return { ok: false };
    const step: Step = person.firstTime ? "set-up" : "code";
    return { ok: true, step, session: randomBytes(24).toString("base64url"), username: person.staffId, ...(step === "set-up" ? { key: base32(this.secretOf(person.staffId)) } : {}) };
  }
  async code(a: { username: string }, code: string): Promise<CodeAnswer> {
    const s = this.secretOf(a.username), at = Math.floor(this.now() / 30_000), last = this.used.get(a.username) ?? -1;
    const hit = [at - 1, at, at + 1].find((t) => t > last && sameText(totp(s, t), code));
    if (hit === undefined) return { ok: false, why: "code" };
    this.used.set(a.username, hit);
    return { ok: true, username: a.username };
  }
}

/** A sliding window of failures per key, in this task's memory (Sample limits; see the header). */
class Tries {
  private readonly seen = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly windowMs: number) {}
  over(k: string, now: number) { const t = (this.seen.get(k) ?? []).filter((x) => x > now - this.windowMs); this.seen.set(k, t); return t.length >= this.max; }
  add(k: string, now: number) { this.over(k, now); this.seen.get(k)!.push(now); if (this.seen.size > 50_000) this.seen.delete(this.seen.keys().next().value!); }
}

export const ATTEMPT_MS = 15 * 60_000, WINDOW_MS = 15 * 60_000;
export const LIMITS = { email: 5, address: 25, codesPerAttempt: 5 } as const;
/** The attempt's owner in the secret box: the platform itself (the nil uuid stands for "no firm"), its own purpose. */
const OWNER = { firmId: "00000000-0000-0000-0000-000000000000", purpose: "sign-in-attempt" } as const;
const ATTEMPT_MAX = 2000;
/** A missing field or a wrong type is 422 naming it (PF-28, the one input rule); an empty password is the door's own 401. */
export const SignInInput = strict({ email: z.string().max(320), password: z.string().max(1000) });
export const CodeInput = strict({ attempt: z.string().max(ATTEMPT_MAX), code: z.string().max(20) });
export const SIGN_IN_WORDS = {
  refused: "That email and password don't match.",
  code: "That code didn't work. Check the code in your authenticator app and try again.",
  expired: "That took too long. Start again.",
  slow: "Too many sign-in tries from here. Wait 15 minutes and try again.",
  inactive: "This staff account is not active. Ask your firm's Owner or Admin.",
} as const;
const refused = () => unauthorized(SIGN_IN_WORDS.refused, "SIGN_IN_REFUSED");
const expired = () => unauthorized(SIGN_IN_WORDS.expired, "ATTEMPT_EXPIRED");

@Injectable()
export class SignInDoor {
  private readonly byEmail = new Tries(LIMITS.email, WINDOW_MS);
  private readonly byAddress = new Tries(LIMITS.address, WINDOW_MS);
  private readonly wrongCodes = new Map<string, { n: number; x: number }>();   // attempt nonce → wrong codes, until the attempt expires
  private readonly usedNonces = new Map<string, number>();   // attempt nonce → its expiry
  constructor(@Inject(SIGN_IN_PORT) private readonly port: SignInPort, @Inject(SIGN_IN_BOX) private readonly box: SecretBoxPort | null,
    @Inject(Db) private readonly db: Db, @Inject(PlatformClock) private readonly clock: PlatformClock, @Inject(PlatformIdentity) private readonly id: PlatformIdentity) {}

  /** The doors' own gate first, whatever the body (as the local door's, check_forms_qa53 DOORS): the provider side is set up
   *  and a sealing key is held, else 503 SIGN_IN_NOT_SET_UP. */
  private sealer() {
    if (this.port instanceof NotSetUpSignIn) return problem(503, "Sign-in not set up", NOT_SET_UP_WORDS, { code: "SIGN_IN_NOT_SET_UP" });
    return this.box ?? problem(503, "Sign-in not set up", "Sign-in is not set up on this server yet (no sealing key).", { code: "SIGN_IN_NOT_SET_UP" });
  }

  /** The staff member the email names, read as their firm (PF-12's walls), or null. */
  private async person(email: string): Promise<Person | null> {
    const staffId = (await this.db.$queryRaw<{ s: string | null }[]>`select platform_staff_of_email(${email})::text as s`)[0]?.s;
    const firmId = staffId && (await this.db.$queryRaw<{ f: string | null }[]>`select platform_staff_firm(${staffId}::uuid, null::text)::text as f`)[0]?.f;
    if (!staffId || !firmId) return null;
    const s = await withFirm(firmId, () => this.db.platformStaff.findFirst({ where: { id: staffId, firmId }, select: { status: true, lastSignInAt: true, firm: { select: { key: true, status: true } } } }));
    if (!s || s.firm.status === "DELETED") return null;
    return { staffId, firmId, firmKey: s.firm.key, active: s.status === "ACTIVE", firstTime: s.lastSignInAt === null };
  }
  private async refusedLine(p: Person, why: string) {
    await withFirm(p.firmId, () => this.db.$transaction((tx) => auditStaff(tx, { firmId: p.firmId, firmKey: p.firmKey, actor: actorWord(p.staffId), action: "platform.staff.sign_in_refused", entityKey: p.staffId, summary: `a sign-in was refused (${why})`, detail: { staffId: p.staffId, why }, before: null, after: null })));
  }

  async password(input: unknown, address: string) {
    const box = this.sealer(), body = parseInput(SignInInput, input), now = this.clock.now();
    if (this.byAddress.over(address, now)) problem(429, "Too many tries", SIGN_IN_WORDS.slow, { code: "TOO_MANY_TRIES" });
    const email = emailOf(body.email), password = body.password;
    if (!password) { this.byAddress.add(address, now); return refused(); }
    const p = await this.person(email);
    if (this.byEmail.over(email, now)) { this.byAddress.add(address, now); if (p) await this.refusedLine(p, "too many wrong passwords"); return refused(); }
    const a = await this.port.password(email, password, p);
    if (!a.ok) { this.byEmail.add(email, now); this.byAddress.add(address, now); if (p) await this.refusedLine(p, "wrong password"); return refused(); }
    if (p && !p.active) { await this.refusedLine(p, "not active"); return unauthorized(SIGN_IN_WORDS.inactive, "STAFF_NOT_ACTIVE"); }
    const attempt = box.seal(OWNER, JSON.stringify({ s: a.session, u: a.username, st: a.step, x: now + ATTEMPT_MS, n: randomBytes(16).toString("base64url") }));
    if (attempt.length > ATTEMPT_MAX) problem(502, "Sign-in failed", "The sign-in service answered in a way we cannot use. Try again.", { code: "SIGN_IN_PROVIDER_ERROR" });
    return a.step === "set-up"
      ? { step: a.step, attempt, key: a.key, otpauth: `otpauth://totp/ExpatReady:${encodeURIComponent(email)}?secret=${a.key}&issuer=ExpatReady&algorithm=SHA1&digits=6&period=30`, words: "Install an authenticator app, add this key to it, then type the 6-digit code it shows." }
      : { step: a.step, attempt };
  }

  async code(input: unknown) {
    const box = this.sealer(), body = parseInput(CodeInput, input), now = this.clock.now();
    let a: { s: string; u: string; st: "code" | "set-up"; x: number; n: string };
    try { a = JSON.parse(box.open(OWNER, body.attempt)); } catch (e) { if (e instanceof SecretRefused || e instanceof SyntaxError) return refused(); throw e; }
    if (typeof a?.s !== "string" || typeof a.u !== "string" || (a.st !== "code" && a.st !== "set-up") || typeof a.x !== "number" || typeof a.n !== "string") return refused();
    for (const m of [this.usedNonces, this.wrongCodes] as Map<string, number | { x: number }>[]) for (const [n, v] of m) if ((typeof v === "number" ? v : v.x) <= now) m.delete(n);
    if (this.usedNonces.has(a.n)) return refused();   // an attempt that already signed in, or used up its tries
    if (a.x <= now) return expired();
    const code = body.code;
    const r = /^\d{6}$/.test(code) ? await this.port.code({ session: a.s, username: a.u, step: a.st }, code) : { ok: false as const, why: "code" as const };
    if (!r.ok) {
      if (r.why === "expired") return expired();
      const wrong = (this.wrongCodes.get(a.n)?.n ?? 0) + 1;
      this.wrongCodes.set(a.n, { n: wrong, x: a.x });
      if (wrong >= LIMITS.codesPerAttempt) { this.usedNonces.set(a.n, a.x); return expired(); }
      return unauthorized(SIGN_IN_WORDS.code, "CODE_REFUSED");
    }
    this.usedNonces.set(a.n, a.x);
    if (r.token) return { token: r.token, tokenType: "Bearer", expiresIn: r.expiresIn ?? 3600 };   // Cognito (part 2b): our authenticate records it on the first call
    return this.id.localSessionAfterCode(r.username);
  }
}

/** Until part 2b (the Cognito adapter on recorded answers): every sign-in on a server not on the stand-in answers 503. */
const NOT_SET_UP_WORDS = "Signing in with a password on this server comes with the next change (PF-4bs part 2b).";
export class NotSetUpSignIn implements SignInPort {
  readonly via = "cognito" as const;
  async password(): Promise<PasswordAnswer> { return problem(503, "Sign-in not set up", NOT_SET_UP_WORDS, { code: "SIGN_IN_NOT_SET_UP" }); }
  async code(): Promise<CodeAnswer> { return problem(503, "Sign-in not set up", NOT_SET_UP_WORDS, { code: "SIGN_IN_NOT_SET_UP" }); }
}
