// FO-6 part 4b (BACKLOG row FO-6; note product/screens/FO-6-4/note.md rules 2-10, 13; plan plan-4b.md; P-564; AG-5-21,
// AG-5-20, AG-5-25; Lead 24's and Lead 25's answers on #3433): the client's public signing door, behind
// /api/public/sign/:token (./door.controller.ts). No sign-in: the emailed link's token is the key.
//   * The token is firm-first (`<firm id hex>.<43 base64url>`, part 3's and FO-3c's shape): the firm is read from it and
//     everything runs as that firm (`withFirm`), so the door needs no bypass. Only a CLIENT signer's token opens it; an
//     unknown, malformed or other firm's token, or the firm signer's own, is the one 404 "This link does not work.".
//   * An ended request answers its state in words and the firm's name, never personal data, and every write refuses. A
//     request still SENT past its expiry already reads expired (the day-14 job is part 5); a signer who signed reads signed.
//   * The email code (P-564, the firm's setting read now): `code` emails one (4a's door-code.ts); `verify` checks it and
//     starts a session bound to this browser: a new random token in an http-only cookie on the door's own path, Sample 30
//     minutes, only its sha256 on the signer, replacing any earlier session. `consent` and `session` need that session.
//     With the code off, `consent` itself starts the session (a bearer link until signed: Lead 24, answer 2).
//   * `consent` records the consent text's version once; `session` needs it, answers the adapter's embedded link and
//     records the first view (SENT → VIEWED).
//   * Every write takes the request's row lock and writes one audit line (actor system:signing-door), never a code or token.
// The words are Sample. Legal points (e-signature identity and consent): Unconfirmed: no counsel.
import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import { auditEvent } from "../../platform/audit/audit-event.ts";
import { withFirm } from "../../platform/firm-scope.ts";
import { problem } from "../../platform/identity/keys.ts";
import { askCode, checkCode, codeOf, CODE_REFUSALS, type CodeLine } from "./door-code.ts";
import { emailCodeOn } from "./email-code.ts";
import { signingPort } from "./handlers.ts";
import { sendSigningCode } from "./link-mail.ts";
import { SigningEnded, SigningNotFound } from "./port.ts";

type Tx = Prisma.TransactionClient;
export const NOT_WORK = "This link does not work.";
export const SESSION_MINUTES = 30, SESSION_COOKIE = "xr_sign";
/** The consent wording and its version (Sample: ExpatReady's default; a firm's own text is AG-5-20's later row). */
export const CONSENT_TEXT_VERSION = "sign-electronically-v1", CONSENT_TEXT = "I agree to sign this agreement electronically.";
export const TOKEN_SHAPE = /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})\.[A-Za-z0-9_-]{43}$/;
const ACTOR = "system:signing-door", MIN = 60_000;
const WHAT = { RETAINER: "retainer agreement", CONSULTATION: "consultation agreement", OTHER: "document" } as const;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const notWork = (): never => problem(404, "Not found", NOT_WORK, { code: "LINK_NOT_WORKING" });

type Found = {
  firmId: string; firm: string;
  signer: { id: string; requestId: string; personId: string | null; viewedAt: Date | null; consentedAt: Date | null; signedAt: Date | null; declinedAt: Date | null; sessionSha256: string | null; sessionExpiresAt: Date | null };
  request: { id: string; status: string; cancelReason: string | null; expiresAt: Date; documentKind: keyof typeof WHAT; documentId: string; documentVersion: number; providerDocumentId: string };
};
export type Ended = { state: "UPDATED" | "WITHDRAWN" | "DECLINED" | "SIGNED" | "EXPIRED"; message: string };
/** What a write answers besides its body: a session cookie to set (its plain token), or none. */
export type DoorAnswer<T> = { body: T; session?: string };

export class SigningDoor {
  constructor(private readonly db: PrismaClient, private readonly o: { audit?: AuditPort<Tx>; now?: () => Date } = {}) {}
  private get audit() { return this.o.audit ?? auditEvent; }
  private now() { return this.o.now?.() ?? new Date(); }

  /** Parses the token, then runs `fn` as the token's firm with its client signer (else the one 404). */
  private open<T>(token: unknown, fn: (f: Found) => Promise<T>): Promise<T> {
    const m = typeof token === "string" ? TOKEN_SHAPE.exec(token) : null;
    if (!m) return notWork();
    const firmId = m.slice(1, 6).join("-");
    return withFirm(firmId, async () => {
      const s = await this.db.foSigner.findFirst({ where: { firmId, linkTokenSha256: sha(token as string), role: "CLIENT" }, include: { request: true } });
      if (!s) return notWork();
      const firm = await this.db.platformFirm.findFirst({ where: { id: firmId }, select: { operatingName: true } });
      const { request: r, ...signer } = s;
      return fn({ firmId, firm: firm?.operatingName ?? "your firm", signer, request: { ...r, documentKind: r.documentKind as keyof typeof WHAT } });
    });
  }

  /** The request's end as this signer sees it, or null while they can still sign. */
  private ended(f: Found): Ended | null {
    const r = f.request, s = f.signer, firm = f.firm;
    if (s.signedAt || r.status === "SIGNED" || (r.status === "CANCELLED" && r.cancelReason === "SIGNED_OFFLINE")) return { state: "SIGNED", message: "This agreement has been signed." };   // j_61's refusal words (4b review M1)
    if (s.declinedAt || r.status === "DECLINED") return { state: "DECLINED", message: `This agreement was declined. Reply to ${firm}'s email if that was a mistake.` };
    if (r.status === "CANCELLED") return r.cancelReason === "UPDATED"
      ? { state: "UPDATED", message: "This agreement was updated. Please use the latest email." }
      : { state: "WITHDRAWN", message: `This agreement was withdrawn by ${firm}.` };
    if (r.status === "EXPIRED" || r.expiresAt.getTime() <= this.now().getTime()) return { state: "EXPIRED", message: `This link has expired. Ask ${firm} to send the agreement again.` };
    return null;
  }
  private refuseIfEnded(f: Found) {
    const e = this.ended(f);
    if (e) problem(409, "This link has ended", e.message, { code: `LINK_${e.state}`, state: e.state, firm: f.firm });
  }
  /** This browser holds the signer's live session. With the code on, only a session a right code started counts: one
   *  started by a consent while the code was off ends when the firm switches the code back on (4b breaker m1). */
  private liveSession(f: Found, cookies: string[], codeOn: boolean): boolean {
    const s = f.signer, now = this.now().getTime();
    if (!s.sessionSha256 || !s.sessionExpiresAt || s.sessionExpiresAt.getTime() <= now || !cookies.some((c) => sha(c) === s.sessionSha256)) return false;
    const started = s.sessionExpiresAt.getTime() - SESSION_MINUTES * MIN;
    return !codeOn || (!!s.codeVerifiedAt && Math.abs(s.codeVerifiedAt.getTime() - started) < 1000);
  }
  private line(f: Found, action: string, summary: string, after: Record<string, string | number | boolean | null>, before: Record<string, string | number | boolean | null> | null = null) {
    return (tx: Tx) => this.audit.record(tx, { firmId: f.firmId, actor: ACTOR, action, entity: "fo_signature_request", entityKey: f.request.id, summary,
      detail: { requestId: f.request.id, signerId: f.signer.id, documentKind: f.request.documentKind }, before, after });
  }
  /** The request's row lock, then the request and the signer as they are now: one that ended meanwhile is refused in words
   *  (409), never left to the database's trigger (a 500; 4b review m3). Writes queue on the request (part 1 review m10). */
  private async locked(tx: Tx, f: Found) {
    await tx.$queryRaw`select 1 from fo_signature_request where firm_id = ${f.firmId}::uuid and id = ${f.request.id}::uuid for update`;
    const r = await tx.foSignatureRequest.findFirstOrThrow({ where: { firmId: f.firmId, id: f.request.id } });
    const cur = await tx.foSigner.findFirstOrThrow({ where: { firmId: f.firmId, id: f.signer.id } });
    this.refuseIfEnded({ ...f, signer: cur, request: { ...f.request, status: r.status, cancelReason: r.cancelReason } });
    return cur;
  }
  /** A new session for this browser (replacing any earlier one); answers its plain token for the cookie. */
  private async startSession(tx: Tx, f: Found, why: string): Promise<string> {
    const token = randomBytes(32).toString("base64url"), expires = new Date(this.now().getTime() + SESSION_MINUTES * MIN);
    await tx.foSigner.update({ where: { id: f.signer.id }, data: { sessionSha256: sha(token), sessionExpiresAt: expires } });
    await this.line(f, "signing.session_started", `A signing session started for the client (${why}).`, { sessionMinutes: SESSION_MINUTES })(tx);
    return token;
  }

  /** GET: the link's state. Live: the firm, the document, whether a code is asked, the consent text. Writes nothing. */
  state(token: unknown) {
    return this.open(token, async (f) => {
      const e = this.ended(f);
      if (e) return { ...e, firm: f.firm };
      const what = WHAT[f.request.documentKind];
      return { state: "WAITING", message: `${f.firm} has sent you a ${what} to sign.`, firm: f.firm, document: what, version: f.request.documentVersion,
        codeRequired: await emailCodeOn(this.db, f.firmId), consentText: CONSENT_TEXT, consentTextVersion: CONSENT_TEXT_VERSION };
    });
  }

  /** POST …/code: emails a one-time code (code on only). */
  code(token: unknown, b: { resend?: boolean }) {
    return this.open(token, async (f) => {
      this.refuseIfEnded(f);
      if (!(await emailCodeOn(this.db, f.firmId))) problem(409, "No code needed", "This link needs no code. Continue to the agreement.", { code: "CODE_OFF" });
      const lineOf: CodeLine = (tx, summary, after) => this.line(f, "signing.door_code", summary, after)(tx);
      const v = await this.db.$transaction(async (tx) => { await this.locked(tx, f); return askCode(tx, f.firmId, f.signer.id, this.now(), { resend: b.resend, line: lineOf }); });
      if (v.verdict === "SENT" && f.signer.personId) await sendSigningCode(this.db, { firmId: f.firmId, requestId: f.request.id, signerId: f.signer.id, personId: f.signer.personId, code: v.code, expiresAt: v.expiresAt });
      if (v.verdict === "TOO_SOON" || v.verdict === "LOCKED") { const [st, title, detail, code] = CODE_REFUSALS[v.verdict]; problem(st, title, detail, { code }); }
      return { sent: true, to: "the email address this link was sent to" };
    });
  }

  /** POST …/code/verify: a right code starts this browser's session. */
  verify(token: unknown, b: { code: string }): Promise<DoorAnswer<{ verified: true; sessionMinutes: number }>> {
    return this.open(token, async (f) => {
      this.refuseIfEnded(f);
      if (!(await emailCodeOn(this.db, f.firmId))) problem(409, "No code needed", "This link needs no code. Continue to the agreement.", { code: "CODE_OFF" });
      const given = codeOf(b.code);
      if (!given) { const [st, title, detail, code] = CODE_REFUSALS.FORMAT; problem(st, title, detail, { code }); }
      const lineOf: CodeLine = (tx, summary, after) => this.line(f, "signing.door_code", summary, after)(tx);
      const out = await this.db.$transaction(async (tx) => {
        await this.locked(tx, f);
        const v = await checkCode(tx, f.firmId, f.signer.id, given!, this.now(), { line: lineOf });
        return v === "OK" ? { v, session: await this.startSession(tx, f, "the emailed code was right") } : { v, session: undefined };
      });
      if (out.v !== "OK") { const [st, title, detail, code] = CODE_REFUSALS[out.v]; problem(st, title, detail, { code }); }
      return { body: { verified: true as const, sessionMinutes: SESSION_MINUTES }, session: out.session };
    });
  }

  /** POST …/consent: needs this browser's session (code on); with the code off it starts one. Recorded once. */
  consent(token: unknown, b: { consentTextVersion: string }, cookies: string[]): Promise<DoorAnswer<{ consented: true; consentTextVersion: string }>> {
    return this.open(token, async (f) => {
      this.refuseIfEnded(f);
      if (b.consentTextVersion !== CONSENT_TEXT_VERSION) problem(409, "The wording changed", "The consent wording changed. Open the link again to read it.", { code: "CONSENT_CHANGED" });
      const codeOn = await emailCodeOn(this.db, f.firmId);
      if (codeOn && !this.liveSession(f, cookies, true)) problem(401, "Enter the code first", "Enter the code we emailed you first.", { code: "SESSION_NEEDED" });
      const session = await this.db.$transaction(async (tx) => {
        const cur = await this.locked(tx, f);
        if (!cur.consentedAt) {
          await tx.foSigner.update({ where: { id: f.signer.id }, data: { consentedAt: this.now(), consentTextVersion: CONSENT_TEXT_VERSION } });
          await this.line(f, "signing.consent_recorded", "The client agreed to sign electronically.", { consentTextVersion: CONSENT_TEXT_VERSION })(tx);
        }
        return codeOn ? undefined : this.startSession(tx, f, "consent, the firm's code is off");
      });
      return { body: { consented: true as const, consentTextVersion: CONSENT_TEXT_VERSION }, session };
    });
  }

  /** GET …/session: the adapter's embedded link for this browser's session; records the first view. */
  session(token: unknown, cookies: string[]) {
    return this.open(token, async (f) => {
      this.refuseIfEnded(f);
      const codeOn = await emailCodeOn(this.db, f.firmId);
      if (!this.liveSession(f, cookies, codeOn)) problem(401, codeOn ? "Enter the code first" : "Agree first", codeOn ? "Enter the code we emailed you first." : "Agree to sign electronically first.", { code: "SESSION_NEEDED" });
      if (!f.signer.consentedAt) problem(409, "Agree first", "Agree to sign electronically first.", { code: "CONSENT_NEEDED" });
      let link: { url: string; expiresAt: Date };
      try { link = await signingPort().embeddedLink(f.firmId, f.request.providerDocumentId, f.signer.id); } catch (e) {
        if (e instanceof SigningEnded) return problem(409, "This link has ended", "This agreement can no longer be signed.", { code: "LINK_ENDED" });
        if (e instanceof SigningNotFound) return problem(409, "Ask for a new link", `This signing link can no longer be opened. Ask ${f.firm} to send it again.`, { code: "LINK_LOST" });
        throw e;
      }
      if (!f.signer.viewedAt) await this.db.$transaction(async (tx) => {
        const cur = await this.locked(tx, f);
        if (cur.viewedAt) return;
        await tx.foSigner.update({ where: { id: f.signer.id }, data: { viewedAt: this.now() } });
        const moved = await tx.foSignatureRequest.updateMany({ where: { firmId: f.firmId, id: f.request.id, status: "SENT" }, data: { status: "VIEWED" } });
        // The retainer moves only while it still shows this request's version (as the webhook's, service.ts; 4b review m2).
        if (f.request.documentKind === "RETAINER") await tx.foRetainer.updateMany({ where: { firmId: f.firmId, id: f.request.documentId, status: "SENT", currentVersion: f.request.documentVersion }, data: { status: "VIEWED" } });
        await this.line(f, "signing.viewed", "The client opened the agreement to sign.", { viewed: true, status: moved.count ? "VIEWED" : f.request.status }, { viewed: false, status: f.request.status })(tx);
      });
      return { url: link.url, expiresAt: link.expiresAt };
    });
  }
}

/** The values of every `xr_sign` cookie the browser sent (it sends only those whose Path matches this link). */
export function sessionCookies(header: unknown): string[] {
  if (typeof header !== "string") return [];
  return header.split(";").map((p) => p.trim()).filter((p) => p.startsWith(`${SESSION_COOKIE}=`)).map((p) => p.slice(SESSION_COOKIE.length + 1)).filter((v) => /^[A-Za-z0-9_-]{43}$/.test(v));
}
