// FO-6 part 3 (BACKLOG row FO-6; brief design/briefs/track-b/FO-6-3.md; contracts §2.4, §7; P-561, P-563): a retainer
// sent for signing on the fake vendor, its state, and the provider's webhook that brings the signed file back.
//   * Send (FO-5's `Retainers.send` calls `prepareRetainerSigning`): the adapter's send first, with the current version's
//     file; then, in Send's own transaction, one fo_signature_request (RETAINER, that version, 14 days Sample) and its
//     signers: the client, then exactly one FIRM signer, the retainer's representative. A failure after the adapter's
//     send cancels that envelope. Every id the request names (retainer, version, person, representative) is read in the
//     sender's firm first: another firm's id is refused (part 1's review, "plain uuids").
//   * The state read: status, "1 of 2 signed", each signer's side, name and moments, the evidence's hashes; never a
//     token, code or provider id.
//   * The webhook: the adapter verifies the call (unverified → 400, nothing stored); the request is found by the
//     provider's document id alone (unique across firms, part 1 review M4) under the named bypass use, then everything
//     runs as its firm; each event is stored once (fo_signing_hook_receipt) and applied in the same transaction, with one
//     audit line. `viewed` and `signed` move the signer, the request and the retainer; the firm signs only after every
//     client and nobody signs without recorded consent (part 4's door records it), else the event is stored, refused
//     and the state unchanged; `completed` fetches the sealed and audit files, stores and hashes them, moves the request
//     and the retainer to SIGNED, makes the prospect WON through the retainers module, writes `signing.completed` last,
//     then emails each client signer "Your signed agreement" once. `declined` is stored and left to FO-5d. A CONSULTATION
//     request goes to the handler its module registered (./handlers.ts), else is stored and answered "no handler".
// Every value is Sample. Legal points (e-signature identity, D-6): Unconfirmed: no counsel.
import { HttpException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { AuditPort } from "../../../../ports/audit.ts";
import { SIGNING_EVENT, SigningCompletedPayload } from "../../../../ports/events/signing.ts";
import type { FilesPort } from "../../../../ports/files.ts";
import { auditEvent } from "../../platform/audit/audit-event.ts";
import { asBypass, touchFirms, withFirm } from "../../platform/firm-scope.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { onSigningCompleted, SIGNING_ACTOR } from "../retainers/on-signing-completed.ts";
import { signingHandlerFor, signingMail, signingPort } from "./handlers.ts";
import { sendPleaseSign } from "./link-mail.ts";
import { SIGNING_WEBHOOK } from "./webhook.bypass.ts";
import { SigningEnded, SigningNotFound, type SigningHookCall, type SigningHookEvent } from "./port.ts";

type Tx = Prisma.TransactionClient;
export const EXPIRES_DAYS = 14;   // Sample (AG-05 C3; a firm setting in part 5)
const DAY = 86_400_000;
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const conflict = (detail: string, code: string): never => problem(409, "Not possible now", detail, { code });
const nameOf = (p: { givenNames: string | null; familyName: string | null }) => [p.givenNames, p.familyName].filter((x) => x && x.trim()).join(" ").trim();

type RetainerRow = { id: string; firmId: string; kind: string; currentVersion: number; signerPersonId: string | null; representativeStaffId: string; prospectId: string | null };

/** Send's signing step. The adapter's envelope is made now; `record(tx)` writes the request in Send's transaction;
 *  `cancel()` ends the envelope when that transaction does not commit (never throws). */
export async function prepareRetainerSigning(db: PrismaClient, files: FilesPort, ctx: StaffContext, r: RetainerRow, o: { audit?: AuditPort<Tx>; now: () => Date }) {
  const firmId = ctx.firmId, audit = o.audit ?? auditEvent, port = signingPort();
  if (r.firmId !== firmId) conflict("This agreement is not your firm's.", "NOT_IN_FIRM");
  // Part 1's review ("plain uuids"): the version, the person and the representative are read in this firm, by id.
  const version = await db.foRetainerVersion.findFirst({ where: { firmId, retainerId: r.id, n: r.currentVersion }, select: { id: true, n: true, fileKey: true } });
  const person = r.signerPersonId ? await db.foPerson.findFirst({ where: { firmId, id: r.signerPersonId }, select: { id: true, givenNames: true, familyName: true } }) : null;
  const rep = await db.platformStaff.findFirst({ where: { firmId, id: r.representativeStaffId }, select: { id: true, displayName: true } });
  if (!version) return conflict("This agreement's version is not in your firm.", "VERSION_NOT_IN_FIRM");
  if (!person) return conflict("This agreement's signer is not a person of your firm.", "SIGNER_NOT_IN_FIRM");
  if (!rep) return conflict("This agreement's representative is not in your firm.", "REPRESENTATIVE_NOT_IN_FIRM");
  const file = await files.get(firmId, version.fileKey);
  if (!file) return conflict("This agreement's file is missing. Open it again.", "FILE_MISSING");
  const requestId = randomUUID(), clientSigner = randomUUID(), firmSigner = randomUUID();
  const { providerDocumentId } = await port.send({ firmId, requestId, title: `Retainer agreement (version ${version.n})`, document: { bytes: new Uint8Array(file.bytes), contentType: file.contentType },
    signers: [{ signerId: clientSigner, role: "CLIENT", name: nameOf(person) || "Client" }, { signerId: firmSigner, role: "FIRM", name: rep.displayName }] });
  // The link tokens: only their sha256 is kept (FO-3c's token shape, the firm first). Part 4a: the client's token stays
  // in memory only until afterCommit emails it ("Please sign", ./link-mail.ts); the firm signer's is never emailed (its
  // link comes from a staff route, part 4c).
  const token = () => `${firmId.replace(/-/g, "").toLowerCase()}.${randomBytes(32).toString("base64url")}`;
  const clientToken = token(), firmToken = token();
  const endedEnvelopes: string[] = [];
  let recorded = false;
  return {
    requestId,
    /** After the commit: the envelopes of the requests this send ended, then the client's "Please sign" email (never throws). */
    async afterCommit() {
      for (const d of endedEnvelopes.splice(0)) { try { await port.cancel(firmId, d); } catch { /* ended at the provider already */ } }
      if (recorded) { recorded = false; await sendPleaseSign(db, { firmId, requestId, personId: person.id, token: clientToken, kind: "RETAINER", version: version.n }); }
    },
    async record(tx: Tx) {
      const now = o.now();
      // An Edit made a newer version and ended the old one's FO-5 request (UPDATED) but left its signing request live
      // (FO-5d cancels it at the Edit): the next Send ends it first (one live request per document), and cancels its
      // envelope once this transaction commits.
      const stale = await tx.foSignatureRequest.findMany({ where: { firmId, documentKind: "RETAINER", documentId: r.id, status: { in: ["SENT", "VIEWED", "CLIENT_SIGNED"] } }, select: { id: true, providerDocumentId: true, documentVersion: true, status: true } });
      for (const s of stale) {
        await tx.foSignatureRequest.update({ where: { id: s.id }, data: { status: "CANCELLED", cancelReason: "UPDATED", endedAt: now } });
        await audit.record(tx, { firmId, actor: `staff:${ctx.staffId}`, action: "signing.request_cancelled", entity: "fo_signature_request", entityKey: s.id, summary: `Signing request for version ${s.documentVersion} ended: version ${version.n} was sent`,
          detail: { requestId: s.id, retainerId: r.id, version: s.documentVersion, reason: "UPDATED" }, before: { status: s.status }, after: { status: "CANCELLED", cancelReason: "UPDATED" } });
        endedEnvelopes.push(s.providerDocumentId);
      }
      await tx.foSignatureRequest.create({ data: { id: requestId, firmId, documentKind: "RETAINER", documentId: r.id, documentVersionId: version.id, documentVersion: version.n, provider: port.provider, providerDocumentId, sentBy: ctx.staffId, sentAt: now, expiresAt: new Date(now.getTime() + EXPIRES_DAYS * DAY) } });
      await tx.$queryRaw`select id from fo_signature_request where firm_id = ${firmId}::uuid and id = ${requestId}::uuid for update`;   // review m10: the request before its signers
      await tx.foSigner.create({ data: { id: clientSigner, firmId, requestId, role: "CLIENT", signOrder: 1, personId: person.id, linkTokenSha256: sha(clientToken) } });
      await tx.foSigner.create({ data: { id: firmSigner, firmId, requestId, role: "FIRM", signOrder: 2, staffId: rep.id, linkTokenSha256: sha(firmToken) } });
      await audit.record(tx, { firmId, actor: `staff:${ctx.staffId}`, action: "signing.request_sent", entity: "fo_signature_request", entityKey: requestId, summary: `Sent for signing (retainer, version ${version.n}): the client, then the representative`,
        detail: { requestId, retainerId: r.id, version: version.n, signerPersonId: person.id, representativeStaffId: rep.id, provider: port.provider },
        before: null, after: { status: "SENT", documentKind: "RETAINER", version: version.n, signers: 2, expiresAt: new Date(now.getTime() + EXPIRES_DAYS * DAY).toISOString() } });
      recorded = true;   // the email goes only after this transaction commits (Retainers.send calls afterCommit after it)
    },
    async cancel() { try { await port.cancel(firmId, providerDocumentId); } catch (e) { if (!(e instanceof SigningEnded || e instanceof SigningNotFound)) console.error(`[fo-signing] cancel after a failed send did not finish: ${(e as Error)?.name ?? "error"}`); } },
  };
}

/** Review round 1 m2: the provider's cancel inside a transaction answers within this (Prisma's interactive transaction
 *  ends at 5 s), else it counts as no answer: 503 "Try again", rolled back. */
const CANCEL_MS = 3_000;
class CancelTimeout extends Error { constructor() { super("the signing provider did not answer in time"); this.name = "CancelTimeout"; } }
function withinMs<T>(ms: number, p: Promise<T>): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<never>((_, no) => { t = setTimeout(() => no(new CancelTimeout()), ms); })]).finally(() => clearTimeout(t));
}

/** Review round 1 m1: the retainer's live signing requests are locked first, in the order the webhook takes them (the
 *  request, then the retainer), so Withdraw, Edit and Signed offline never deadlock against a provider event. Call it as
 *  the first statement of their transaction. */
export async function lockRetainerSigning(tx: Tx, firmId: string, retainerId: string) {
  await tx.$queryRaw`select id from fo_signature_request where firm_id = ${firmId}::uuid and document_kind = 'RETAINER' and document_id = ${retainerId}::uuid
    and status in ('SENT', 'VIEWED', 'CLIENT_SIGNED') order by id for update`;
}

/** QA-770 (R1.55 W1; FO-5d (2), (3)): Withdraw, Edit and Signed offline end the retainer's live signing request in their
 *  own transaction (CANCELLED with WITHDRAWN, UPDATED or SIGNED_OFFLINE, one `signing.request_cancelled` line each).
 *  `cancelNow()` cancels the envelopes at the provider before the commit (Withdraw and Edit, FO-5d (2)): a failed cancel
 *  throws 503 "Try again", so the transaction rolls back; an envelope the provider has already ended or does not know is
 *  no change. `afterCommit()` cancels any envelope still owed (Signed offline: a paper signature is never held up by the
 *  provider; logged, never thrown), then, after a withdraw only, emails each client signer "Agreement withdrawn" once
 *  (AG-5-34 r3). The door then reads the link ended, and a late provider event is refused (the request is not live). */
export async function endRetainerSigning(tx: Tx, ctx: StaffContext, retainerId: string, reason: "WITHDRAWN" | "UPDATED" | "SIGNED_OFFLINE", o: { db: PrismaClient; audit?: AuditPort<Tx>; now: Date }) {
  const firmId = ctx.firmId, audit = o.audit ?? auditEvent;
  const live = await tx.foSignatureRequest.findMany({ where: { firmId, documentKind: "RETAINER", documentId: retainerId, status: { in: ["SENT", "VIEWED", "CLIENT_SIGNED"] } },
    select: { id: true, providerDocumentId: true, documentVersion: true, status: true, signers: { where: { role: "CLIENT" }, select: { personId: true } } } });
  const why = { WITHDRAWN: "the agreement was withdrawn", UPDATED: "the agreement was edited", SIGNED_OFFLINE: "the agreement was signed on paper" }[reason];
  for (const s of live) {
    const n = await tx.foSignatureRequest.updateMany({ where: { firmId, id: s.id, status: s.status }, data: { status: "CANCELLED", cancelReason: reason, endedAt: o.now } });
    if (n.count !== 1) conflict("This agreement's signing changed at the same time. Open it again.", "CHANGED");
    await audit.record(tx, { firmId, actor: `staff:${ctx.staffId}`, action: "signing.request_cancelled", entity: "fo_signature_request", entityKey: s.id,
      summary: `Signing request for version ${s.documentVersion} ended: ${why}`,
      detail: { requestId: s.id, retainerId, version: s.documentVersion, reason }, before: { status: s.status }, after: { status: "CANCELLED", cancelReason: reason } });
  }
  const owed = live.map((s) => s.providerDocumentId);
  // Ended at the provider already: cancelled, declined or unknown is no change; *completed* (everyone signed there and its
  // event is on its way) is never undone by a withdraw or an edit (AG-5-34: refused once executed; review round 1 M1).
  const ended = (e: unknown) => (e instanceof SigningEnded && e.state !== "completed") || e instanceof SigningNotFound;
  return {
    ended: live.length,
    async cancelNow() {
      const port = signingPort();
      for (const d of owed.splice(0)) {
        try { await withinMs(CANCEL_MS, port.cancel(firmId, d)); } catch (e) {
          if (ended(e)) continue;
          if (e instanceof SigningEnded) conflict("Everyone has signed this agreement at the signing service; the signed copy is on its way. It can no longer be withdrawn or changed.", "SIGNED_AT_PROVIDER");
          console.error(`[fo-signing] the provider did not cancel the envelope: ${(e as Error)?.name ?? "error"}`);
          problem(503, "Try again", "The signing service did not answer, so nothing changed. Try again in a minute.", { code: "SIGNING_UNAVAILABLE" });
        }
      }
    },
    async afterCommit() {
      if (owed.length) {
        const port = signingPort();
        for (const d of owed.splice(0)) { try { await port.cancel(firmId, d); } catch (e) { if (!ended(e)) console.error(`[fo-signing] cancel after the commit did not finish: ${(e as Error)?.name ?? "error"}`); } }
      }
      if (reason === "WITHDRAWN") for (const s of live) for (const c of s.signers) if (c.personId) await sendWithdrawn(o.db, { firmId, requestId: s.id, personId: c.personId, version: s.documentVersion });
    },
  };
}

/** "Agreement withdrawn", once per client signer and request (after the commit; a failure is logged, the withdraw stands). */
async function sendWithdrawn(db: PrismaClient, o: { firmId: string; requestId: string; personId: string; version: number }) {
  const mail = signingMail();
  if (!mail) { console.warn("[fo-signing] no MailPort set: the withdrawn notice was not emailed"); return; }
  try {
    const firm = await db.platformFirm.findFirstOrThrow({ where: { id: o.firmId }, select: { operatingName: true, contactEmail: true } });
    const p = await db.foPerson.findFirst({ where: { firmId: o.firmId, id: o.personId }, select: { id: true, email: true, givenNames: true } });
    if (!p?.email) return;
    await mail.send({ firmId: o.firmId, to: p.email, replyTo: firm.contactEmail, class: "TRANSACTIONAL", person: { kind: "FO_PERSON", id: p.id }, templateKey: "signing.withdrawn",
      idempotencyKey: `signing:${o.requestId}:withdrawn:${p.id}`, subject: `Agreement withdrawn: ${firm.operatingName}`.slice(0, 200),
      text: `Hello${p.givenNames ? ` ${p.givenNames}` : ""},\n\n${firm.operatingName} has withdrawn the retainer agreement (version ${o.version}) it sent you to sign. The signing link no longer works and there is nothing for you to do.\n\nReply to this email to reach ${firm.operatingName}.` });
  } catch (e) { console.error(`[fo-signing] the withdrawn notice's email failed: ${(e as Error)?.name ?? "error"}`); }
}

/** The signing module's reads and its webhook door. */
export class Signing {
  constructor(private readonly db: PrismaClient, private readonly files: FilesPort, private readonly o: { audit?: AuditPort<Tx>; now?: () => Date } = {}) {}
  private get audit() { return this.o.audit ?? auditEvent; }
  private now() { return this.o.now?.() ?? new Date(); }

  /** The state of a retainer's newest signing request (the caller checked the person may read the retainer). */
  async retainerState(firmId: string, retainerId: string) {
    const q = await this.db.foSignatureRequest.findFirst({ where: { firmId, documentKind: "RETAINER", documentId: retainerId }, orderBy: { sentAt: "desc" },
      include: { signers: { orderBy: [{ signOrder: "asc" }, { id: "asc" }] }, evidence: true } });
    if (!q) return { status: "NOT_SENT", signed: "Not sent for signing", signedCount: 0, signerCount: 0, signers: [], evidence: null };
    const people = await this.db.foPerson.findMany({ where: { firmId, id: { in: q.signers.flatMap((s) => (s.personId ? [s.personId] : [])) } }, select: { id: true, givenNames: true, familyName: true } });
    const staff = await this.db.platformStaff.findMany({ where: { firmId, id: { in: q.signers.flatMap((s) => (s.staffId ? [s.staffId] : [])) } }, select: { id: true, displayName: true } });
    const signedCount = q.signers.filter((s) => s.signedAt).length;
    return {
      status: q.status, version: q.documentVersion, sentAt: q.sentAt, expiresAt: q.expiresAt, endedAt: q.endedAt,
      signed: `${signedCount} of ${q.signers.length} signed`, signedCount, signerCount: q.signers.length,
      signers: q.signers.map((s) => {
        const p = people.find((x) => x.id === s.personId), st = staff.find((x) => x.id === s.staffId);
        return { role: s.role, name: p ? nameOf(p) || "Client" : st?.displayName ?? "Representative", personId: s.personId, staffId: s.staffId, viewedAt: s.viewedAt, signedAt: s.signedAt, declinedAt: s.declinedAt };
      }),
      evidence: q.evidence ? { storedAt: q.evidence.storedAt, sealedSha256: q.evidence.sealedSha256, auditSha256: q.evidence.auditSha256, consentTextVersion: q.evidence.consentTextVersion } : null,
    };
  }

  /** POST /api/hooks/signing/:provider. Answers { received, applied, reason? } or throws 400/404/409. */
  async receive(provider: string, call: SigningHookCall): Promise<{ received: true; applied: boolean; duplicate?: boolean; reason?: string }> {
    const port = signingPort();
    if (typeof provider !== "string" || provider.toUpperCase() !== port.provider) problem(404, "Not found", "No such signing provider here.", { code: "NOT_FOUND" });
    const ev = await port.verifyWebhook(call);
    if (!ev) return problem(400, "Not signed", "This call is not the signing provider's own.", { code: "SIGNATURE" });
    const found = await asBypass(SIGNING_WEBHOOK, async () => {
      const q = await this.db.foSignatureRequest.findFirst({ where: { provider: ev.provider, providerDocumentId: ev.providerDocumentId }, select: { id: true, firmId: true, documentKind: true } });
      if (q) await touchFirms(this.db, [q.firmId]);   // PF-12b: the crossing read's line in that firm's trail
      return q;
    });
    if (!found) return { received: true, applied: false, reason: "unknown document" };
    return withFirm(found.firmId, async () => {
      if (found.documentKind !== "RETAINER") {   // CONSULTATION (FO-3c) and OTHER (FO-6d part 2) go to their module's handler
        const h = signingHandlerFor(found.documentKind);
        if (h) { await h(call, found.firmId); return { received: true as const, applied: true, reason: "handed to its module" }; }
        const stored = await this.db.$transaction((tx) => this.receipt(tx, found, ev));
        return { received: true as const, applied: false, duplicate: !stored || undefined, reason: "no handler" };
      }
      return this.applyRetainer(found, ev);
    });
  }

  /** Stores the event once. The request row is locked first (part 1 review m10; review Major 1: two events of one
   *  request at once deadlocked when the receipt came before the lock), so writers queue on the request. */
  private async receipt(tx: Tx, q: { id: string; firmId: string }, ev: SigningHookEvent): Promise<boolean> {
    await tx.$queryRaw`select id from fo_signature_request where firm_id = ${q.firmId}::uuid and id = ${q.id}::uuid for update`;
    const n = await tx.foSigningHookReceipt.createMany({ data: [{ firmId: q.firmId, requestId: q.id, provider: ev.provider, providerDocumentId: ev.providerDocumentId, eventId: ev.eventId, eventType: ev.providerType }], skipDuplicates: true });
    return n.count === 1;
  }

  private async tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(fn); } catch (e) {
      if (e instanceof HttpException) throw e;
      const m = String((e as Error)?.message ?? e);
      if (/P2002|P2034|Unique constraint|could not serialize|deadlock|is final|firm signs last|not a signing move/i.test(m)) conflict("This signing request changed at the same time. The provider may send the event again.", "CHANGED");
      throw e;
    }
  }

  private async applyRetainer(found: { id: string; firmId: string }, ev: SigningHookEvent) {
    const firmId = found.firmId, now = this.now();
    // The files come before the transaction (an outside call); write-once keys with an attempt part, so a retry never
    // meets its own earlier file (FO-5's pattern). A completion that is not ready stores nothing and asks again (409).
    let files: { sealed: { key: string; sha256: string; bytes: Uint8Array; contentType: string }; audit: { key: string; sha256: string } } | null = null;
    if (ev.type === "completed") {
      const seen = await this.db.foSigningHookReceipt.count({ where: { firmId, requestId: found.id, provider: ev.provider, providerDocumentId: ev.providerDocumentId, eventId: ev.eventId } });
      if (seen) return { received: true as const, applied: false, duplicate: true };
      // Break m3: nothing is fetched or stored unless the completion can apply now (a race still may leave one unused pair).
      const pre = await this.db.foSignatureRequest.findFirst({ where: { firmId, id: found.id }, select: { status: true, documentId: true, documentVersion: true, signers: { select: { signedAt: true } } } });
      const ret = pre ? await this.db.foRetainer.findFirst({ where: { firmId, id: pre.documentId }, select: { status: true, currentVersion: true } }) : null;
      // Final, stored and never retried: the agreement withdrawn, signed on paper or replaced by a newer version, or the
      // request ended. SENT and VIEWED only mean "not yet" (break R2-M1): those answer 409 below and keep nothing.
      const ended = !!pre && !["SENT", "VIEWED", "CLIENT_SIGNED"].includes(pre.status);
      if (pre && ret && (ended || ["WITHDRAWN", "SIGNED_OFFLINE", "DECLINED", "EXPIRED"].includes(ret.status) || ret.currentVersion !== pre.documentVersion)) {
        await this.tx((tx) => this.receipt(tx, found, ev));
        return { received: true as const, applied: false, reason: ended ? `the request is ${pre.status.toLowerCase()}` : ret.currentVersion !== pre.documentVersion ? "a newer version was made" : `the agreement is ${ret.status.toLowerCase().replace("_", " ")}` };
      }
      if (!pre || pre.status !== "CLIENT_SIGNED" || pre.signers.some((x) => !x.signedAt)) return conflict("Not every signature is recorded here yet. The provider may send the event again.", "NOT_READY");
      const f = await signingPort().fetchFiles(firmId, ev.providerDocumentId).catch((e) => { if (e?.name === "SigningNotCompleted") conflict("The provider has not finished this document.", "NOT_COMPLETED"); throw e; });
      const at = randomBytes(6).toString("hex"), base = `signing/${found.id}/${at}`;
      const s = await this.files.put(firmId, `${base}/sealed.pdf`, f.sealed.bytes, f.sealed.contentType), a = await this.files.put(firmId, `${base}/audit.pdf`, f.audit.bytes, f.audit.contentType);
      files = { sealed: { ...s, bytes: f.sealed.bytes, contentType: f.sealed.contentType }, audit: a };
    }
    const out = await this.tx(async (tx) => {
      if (!(await this.receipt(tx, found, ev))) return { received: true as const, applied: false, duplicate: true };
      const [q] = await tx.$queryRaw<{ id: string; status: string; document_id: string; document_version_id: string; document_version: number; expires_at: Date }[]>`
        select id::text, status::text, document_id::text, document_version_id::text, document_version, expires_at from fo_signature_request where firm_id = ${firmId}::uuid and id = ${found.id}::uuid for update`;
      const signers = await tx.foSigner.findMany({ where: { firmId, requestId: q.id } });
      const live = ["SENT", "VIEWED", "CLIENT_SIGNED"].includes(q.status);
      const refuse = (reason: string) => ({ received: true as const, applied: false, reason });
      // Break M1: a refusal that a later event can lift (the firm before the clients, no consent yet) keeps nothing and
      // answers 409, so the provider's redelivery applies once the order or the consent is right.
      const notYet = (reason: string): never => conflict(`${reason}. The provider may send the event again.`, "NOT_YET");
      if (ev.type === "declined" || ev.type === "other") return refuse(ev.type === "declined" ? "a decline is applied by FO-5d" : "nothing to apply");
      if (!live) return refuse(`the request is ${q.status.toLowerCase()}`);
      // Part 4c (QA-770's signing path; Lead 29, answer 1): a view or a signature on an agreement that was withdrawn, signed
      // on paper, declined, expired or replaced by a newer version is refused, stored once and never applied. The retainer's
      // row is locked here, so a withdraw cannot slip in between (challenge m9). FO-5d ends the request itself.
      if (ev.type === "viewed" || ev.type === "signed") {
        const [ret] = await tx.$queryRaw<{ status: string; current_version: number }[]>`select status::text, current_version from fo_retainer where firm_id = ${firmId}::uuid and id = ${q.document_id}::uuid for update`;
        if (!ret || ["WITHDRAWN", "SIGNED_OFFLINE", "DECLINED", "EXPIRED"].includes(ret.status)) return refuse(`the agreement is ${ret ? ret.status.toLowerCase().replace("_", " ") : "gone"}`);
        if (ret.current_version !== q.document_version) return refuse("a newer version was made");
      }
      const line = (action: string, summary: string, detail: Record<string, string | number | boolean | null>, before: Record<string, string | number | null>, after: Record<string, string | number | null>) =>
        this.audit.record(tx, { firmId, actor: SIGNING_ACTOR, action, entity: "fo_signature_request", entityKey: q.id, summary, detail: { requestId: q.id, retainerId: q.document_id, ...detail }, before, after });
      const moveRetainer = (from: string[], to: string) => tx.foRetainer.updateMany({ where: { firmId, id: q.document_id, status: { in: from as never[] }, currentVersion: q.document_version }, data: { status: to as never } });

      if (ev.type === "viewed" || ev.type === "signed") {
        const s = signers.find((x) => x.id === ev.signerId);
        if (!s) return refuse("no such signer on this request");
        if (ev.type === "viewed") {
          if (s.viewedAt || s.signedAt || s.declinedAt) return refuse("viewed already");   // break m2: a late viewed after the signature
          await tx.foSigner.update({ where: { id: s.id }, data: { viewedAt: now } });
          const moved = q.status === "SENT";
          if (moved) { await tx.foSignatureRequest.update({ where: { id: q.id }, data: { status: "VIEWED" } }); await moveRetainer(["SENT"], "VIEWED"); }
          await line("signing.viewed", `Opened by the ${s.role === "CLIENT" ? "client" : "representative"}`, { signerRole: s.role }, { status: q.status }, { status: moved ? "VIEWED" : q.status });
          return { received: true as const, applied: true };
        }
        if (s.signedAt || s.declinedAt) return refuse("this signer has answered already");
        // Break m4 (part 1's m2): past its expiry with no client signature, a request takes no signature (part 5's job ends it).
        if (now > q.expires_at && !signers.some((x) => x.role === "CLIENT" && x.signedAt)) return refuse("the request has expired");
        if (s.role === "FIRM" && signers.some((x) => x.role === "CLIENT" && !x.signedAt)) return notYet("The firm signs last, after every client");
        if (!s.consentedAt) return notYet("No consent to sign electronically is recorded for this signer yet");
        await tx.foSigner.update({ where: { id: s.id }, data: { signedAt: now < s.consentedAt ? s.consentedAt : now } });
        const clientsDone = signers.every((x) => x.role !== "CLIENT" || x.signedAt || x.id === s.id);
        const to = clientsDone && q.status !== "CLIENT_SIGNED" ? "CLIENT_SIGNED" : q.status;
        if (to !== q.status) { await tx.foSignatureRequest.update({ where: { id: q.id }, data: { status: "CLIENT_SIGNED" } }); await moveRetainer(["SENT", "VIEWED"], "CLIENT_SIGNED"); }
        await line("signing.signed", `Signed by the ${s.role === "CLIENT" ? "client" : "representative"}`, { signerRole: s.role }, { status: q.status }, { status: to });
        return { received: true as const, applied: true };
      }

      // completed: every signer signed here first (else ask again: nothing stored)
      if (q.status !== "CLIENT_SIGNED" || signers.some((x) => !x.signedAt)) return conflict("Not every signature is recorded here yet. The provider may send the event again.", "NOT_READY");
      const consent = signers[0].consentTextVersion!;
      await tx.foSigningEvidence.create({ data: { firmId, requestId: q.id, sealedFileKey: files!.sealed.key, sealedSha256: files!.sealed.sha256, auditFileKey: files!.audit.key, auditSha256: files!.audit.sha256, consentTextVersion: consent, storedAt: now } });
      await tx.foSignatureRequest.update({ where: { id: q.id }, data: { status: "SIGNED", endedAt: now } });
      const r = await moveRetainer(["CLIENT_SIGNED"], "SIGNED");
      if (r.count !== 1) conflict("The agreement changed at the same time (withdrawn or signed on paper).", "CHANGED");
      const ret = await tx.foRetainer.findFirstOrThrow({ where: { firmId, id: q.document_id }, select: { id: true, prospectId: true, representativeStaffId: true } });
      const fees = await tx.foRetainerFeeRow.findMany({ where: { firmId, versionId: q.document_version_id }, orderBy: { position: "asc" } });
      const firm = await tx.platformFirm.findFirstOrThrow({ where: { id: firmId }, select: { id: true, key: true } });
      const payload = SigningCompletedPayload.parse({
        documentKind: "RETAINER", requestId: q.id, documentId: q.document_id, documentVersionId: q.document_version_id, documentVersion: q.document_version,
        signerPersonIds: signers.flatMap((x) => (x.personId ? [x.personId] : [])), documentFileKey: files!.sealed.key, certificateFileKey: files!.audit.key,
        sealedSha256: files!.sealed.sha256, certificateSha256: files!.audit.sha256, retainerId: ret.id, prospectId: ret.prospectId, representativeStaffId: ret.representativeStaffId,
        fees: fees.map((f) => ({ label: f.label, amountMinor: f.amountMinor === null ? null : String(f.amountMinor), currency: f.currency, when: f.when, dueOn: f.dueOn ? f.dueOn.toISOString().slice(0, 10) : null })),
        agreedTotalMinor: String(fees.reduce((t, f) => t + (f.amountMinor ?? 0n), 0n)), currency: fees[0]?.currency ?? "CAD",
      });
      await line("signing.completed", "Signed by everyone: the sealed copy and the audit file are stored with us; the retainer is signed", { sealedSha256: files!.sealed.sha256, auditSha256: files!.audit.sha256 },
        { status: "CLIENT_SIGNED", retainerStatus: "CLIENT_SIGNED" }, { status: "SIGNED", retainerStatus: "SIGNED", sealedSha256: files!.sealed.sha256, auditSha256: files!.audit.sha256 });
      // The retainers module's answer runs in this transaction; the event row is the last write (contracts §0.5).
      // Break M2: a refused win (FO-13c's conflict gate: the party changed since its check) never undoes the signature:
      // the evidence, the SIGNED states and the event stay; the prospect is not won and the line says why.
      let won = false;
      await tx.$executeRaw`savepoint fo6_signing_win`;
      try { won = await onSigningCompleted(tx, this.audit, firm, payload, now); await tx.$executeRaw`release savepoint fo6_signing_win`; }
      catch (e) {
        if (!(e instanceof HttpException)) throw e;
        await tx.$executeRaw`rollback to savepoint fo6_signing_win`;
        const code = String((e.getResponse() as { code?: unknown })?.code ?? "REFUSED").slice(0, 60);
        await this.audit.record(tx, { firmId, actor: SIGNING_ACTOR, action: "signing.win_held", entity: "fo_signature_request", entityKey: q.id, summary: "Signed, but the prospect is not won yet: the win was refused (record the conflict check again, then Convert)",
          detail: { requestId: q.id, retainerId: ret.id, prospectId: ret.prospectId, refusal: code }, before: null, after: { prospectWon: false, refusal: code } });
      }
      await tx.moduleEvent.create({ data: { firmId, type: SIGNING_EVENT.SIGNING_COMPLETED, subjectId: q.id, occurredAt: now, payload: payload as Prisma.InputJsonValue } });
      return { received: true as const, applied: true, prospectWon: won, clients: signers.flatMap((x) => (x.personId ? [x.personId] : [])) };
    });
    if (ev.type === "completed" && out.applied && "clients" in out) await this.signedCopies(firmId, found.id, out.clients as string[], files!.sealed);
    const { clients: _c, ...answer } = out as typeof out & { clients?: unknown };
    return answer;
  }

  /** "Your signed agreement", once per client signer (after the commit; a failure is logged, the evidence stays). */
  private async signedCopies(firmId: string, requestId: string, personIds: string[], sealed: { bytes: Uint8Array; contentType: string }) {
    const mail = signingMail();
    if (!mail) { console.warn("[fo-signing] no MailPort set: the signed copies were not emailed"); return; }
    const firm = await this.db.platformFirm.findFirstOrThrow({ where: { id: firmId }, select: { operatingName: true, contactEmail: true } });
    for (const id of personIds) {
      const p = await this.db.foPerson.findFirst({ where: { firmId, id }, select: { id: true, email: true, givenNames: true } });
      if (!p?.email) continue;
      try {
        await mail.send({ firmId, to: p.email, replyTo: firm.contactEmail, class: "TRANSACTIONAL", person: { kind: "FO_PERSON", id: p.id }, templateKey: "signing.signed_copy", idempotencyKey: `signing:${requestId}:signed-copy:${p.id}`,
          subject: "Your signed agreement", text: `Hello${p.givenNames ? ` ${p.givenNames}` : ""},\n\nEveryone has signed. Your signed agreement with ${firm.operatingName} is attached.\n\nReply to this email to reach ${firm.operatingName}.`,
          attachments: [{ filename: "signed-agreement.pdf", contentType: sealed.contentType, bytes: new Uint8Array(sealed.bytes) }] });
      } catch (e) { console.error(`[fo-signing] the signed copy's email failed: ${(e as Error)?.name ?? "error"}`); }
    }
  }
}
