// FO-6d part 2 (BACKLOG row FO-6d; AG-5-61): the provider's webhook for a signature request of kind OTHER, registered with
// the signing module by features/front-office-signing-any-document.ts (FO-6 part 3's door finds the request and runs as
// its firm). viewed and signed move the signer and the request; the firm signer (when added) signs last; nobody signs
// without recorded consent (FO-6 part 4's door records it); a refusal a later event can lift keeps nothing and answers
// 409 so the provider's redelivery applies. completed fetches the sealed and audit files before the transaction (write-
// once keys with an attempt part), then in one transaction: the receipt (the request row locked first), the evidence,
// SIGNED, one audit line and `signing.completed` (kind OTHER) last; after the commit each client signer gets "Your
// signed document" once. A declined event is stored and left to FO-5d. Nothing here touches a prospect, a retainer or a
// client. Every value is Sample. Legal points (e-signature identity): Unconfirmed: no counsel.
import { HttpException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import type { AuditPort } from "../../../../../ports/audit.ts";
import { SIGNING_EVENT, SigningCompletedPayload } from "../../../../../ports/events/signing.ts";
import type { FilesPort } from "../../../../../ports/files.ts";
import { auditEvent } from "../../../platform/audit/audit-event.ts";
import { problem } from "../../../platform/identity/keys.ts";
import { signingMail, signingPort } from "../handlers.ts";
import type { SigningHookCall, SigningHookEvent } from "../port.ts";
import { conflict, type Tx } from "./service.ts";

export const ACTOR = "system:signing";
const LIVE = ["SENT", "VIEWED", "CLIENT_SIGNED"];

export class AnyDocumentCompletion {
  constructor(private readonly db: PrismaClient, private readonly files: FilesPort, private readonly o: { audit?: AuditPort<Tx>; now?: () => Date } = {}) {}
  private get audit() { return this.o.audit ?? auditEvent; }
  private now() { return this.o.now?.() ?? new Date(); }

  /** The provider's webhook for a request of kind OTHER, run as its firm. */
  async onHook(call: SigningHookCall, firmId: string) {
    const ev = await signingPort().verifyWebhook(call);
    if (!ev) return problem(400, "Not signed", "This call is not the signing provider's own.", { code: "SIGNATURE" });
    const found = await this.db.foSignatureRequest.findFirst({ where: { firmId, provider: ev.provider, providerDocumentId: ev.providerDocumentId, documentKind: "OTHER" }, select: { id: true, firmId: true, status: true, signers: { select: { signedAt: true } } } });
    if (!found) return { received: true as const, applied: false, reason: "unknown document" };
    let files: { sealed: { key: string; sha256: string; bytes: Uint8Array; contentType: string }; audit: { key: string; sha256: string } } | null = null;
    if (ev.type === "completed") {
      if (await this.db.foSigningHookReceipt.count({ where: { firmId, requestId: found.id, provider: ev.provider, providerDocumentId: ev.providerDocumentId, eventId: ev.eventId } })) return { received: true as const, applied: false, duplicate: true };
      if (!LIVE.includes(found.status)) { await this.tx((tx) => this.receipt(tx, found, ev)); return { received: true as const, applied: false, reason: `the request is ${found.status.toLowerCase()}` }; }
      if (found.status !== "CLIENT_SIGNED" || found.signers.some((s) => !s.signedAt)) return conflict("Not every signature is recorded here yet. The provider may send the event again.", "NOT_READY");
      const f = await signingPort().fetchFiles(firmId, ev.providerDocumentId).catch((e) => { if (e?.name === "SigningNotCompleted") conflict("The provider has not finished this document.", "NOT_COMPLETED"); throw e; });
      const base = `signing/${found.id}/${randomBytes(6).toString("hex")}`;
      const s = await this.files.put(firmId, `${base}/sealed.pdf`, f.sealed.bytes, f.sealed.contentType), a = await this.files.put(firmId, `${base}/audit.pdf`, f.audit.bytes, f.audit.contentType);
      files = { sealed: { ...s, bytes: f.sealed.bytes, contentType: f.sealed.contentType }, audit: a };
    }
    const out = await this.tx(async (tx) => this.apply(tx, found, ev, files));
    if (out.applied && "clients" in out && files) await this.signedCopies(firmId, found.id, out.clients as string[], String(out.title), files.sealed);
    const { clients: _c, title: _t, ...answer } = out as typeof out & { clients?: unknown; title?: unknown };
    return answer;
  }

  private async receipt(tx: Tx, q: { id: string; firmId: string }, ev: SigningHookEvent) {
    await tx.$queryRaw`select id from fo_signature_request where firm_id = ${q.firmId}::uuid and id = ${q.id}::uuid for update`;
    return (await tx.foSigningHookReceipt.createMany({ data: [{ firmId: q.firmId, requestId: q.id, provider: ev.provider, providerDocumentId: ev.providerDocumentId, eventId: ev.eventId, eventType: ev.providerType }], skipDuplicates: true })).count === 1;
  }

  private async tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(fn); } catch (e) {
      if (e instanceof HttpException) throw e;
      if (/P2002|P2034|Unique constraint|could not serialize|deadlock|is final|firm signs last|not a signing move/i.test(String((e as Error)?.message ?? e))) conflict("This signing request changed at the same time. The provider may send the event again.", "CHANGED");
      throw e;
    }
  }

  private async apply(tx: Tx, found: { id: string; firmId: string }, ev: SigningHookEvent, files: { sealed: { key: string; sha256: string }; audit: { key: string; sha256: string } } | null) {
    const firmId = found.firmId, now = this.now(), done = (reason: string) => ({ received: true as const, applied: false, reason });
    if (!(await this.receipt(tx, found, ev))) return { received: true as const, applied: false, duplicate: true };
    const q = await tx.foSignatureRequest.findFirstOrThrow({ where: { firmId, id: found.id } });
    const signers = await tx.foSigner.findMany({ where: { firmId, requestId: q.id } });
    if (ev.type === "declined" || ev.type === "other") return done(ev.type === "declined" ? "a decline is applied by FO-5d" : "nothing to apply");
    if (!LIVE.includes(q.status)) return done(`the request is ${q.status.toLowerCase()}`);
    const line = (action: string, summary: string, before: Record<string, string>, after: Record<string, string>, detail: Record<string, string> = {}) =>
      this.audit.record(tx, { firmId, actor: ACTOR, action, entity: "fo_signature_request", entityKey: q.id, summary, detail: { requestId: q.id, documentId: q.documentId, documentKind: "OTHER", ...detail }, before, after });
    const notYet = (reason: string): never => conflict(`${reason}. The provider may send the event again.`, "NOT_YET");
    if (ev.type === "viewed" || ev.type === "signed") {
      const s = signers.find((x) => x.id === ev.signerId);
      if (!s) return done("no such signer on this request");
      const who = s.role === "CLIENT" ? "a client" : "the firm";
      if (ev.type === "viewed") {
        if (s.viewedAt || s.signedAt || s.declinedAt) return done("viewed already");
        await tx.foSigner.update({ where: { id: s.id }, data: { viewedAt: now } });
        if (q.status === "SENT") await tx.foSignatureRequest.update({ where: { id: q.id }, data: { status: "VIEWED" } });
        await line("signing.viewed", `Opened by ${who}`, { status: q.status }, { status: q.status === "SENT" ? "VIEWED" : q.status }, { signerRole: s.role });
        return { received: true as const, applied: true };
      }
      if (s.signedAt || s.declinedAt) return done("this signer has answered already");
      if (now > q.expiresAt && !signers.some((x) => x.role === "CLIENT" && x.signedAt)) return done("the request has expired");
      if (s.role === "FIRM" && signers.some((x) => x.role === "CLIENT" && !x.signedAt)) return notYet("The firm signs last, after every client");
      if (!s.consentedAt) return notYet("No consent to sign electronically is recorded for this signer yet");
      await tx.foSigner.update({ where: { id: s.id }, data: { signedAt: now <= s.consentedAt ? new Date(s.consentedAt.getTime() + 1) : now } });   // the database keeps microseconds: never before the consent
      const clientsDone = signers.every((x) => x.role !== "CLIENT" || x.signedAt || x.id === s.id);
      const to = clientsDone && q.status !== "CLIENT_SIGNED" ? "CLIENT_SIGNED" : q.status;
      if (to !== q.status) await tx.foSignatureRequest.update({ where: { id: q.id }, data: { status: "CLIENT_SIGNED" } });
      await line("signing.signed", `Signed by ${who}`, { status: q.status }, { status: to }, { signerRole: s.role });
      return { received: true as const, applied: true };
    }
    if (q.status !== "CLIENT_SIGNED" || signers.some((x) => !x.signedAt) || !files) return conflict("Not every signature is recorded here yet. The provider may send the event again.", "NOT_READY");
    const d = await tx.foSigningDocument.findFirstOrThrow({ where: { firmId, id: q.documentId }, select: { title: true } });
    await tx.foSigningEvidence.create({ data: { firmId, requestId: q.id, sealedFileKey: files.sealed.key, sealedSha256: files.sealed.sha256, auditFileKey: files.audit.key, auditSha256: files.audit.sha256, consentTextVersion: signers[0].consentTextVersion!, storedAt: now } });
    await tx.foSignatureRequest.update({ where: { id: q.id }, data: { status: "SIGNED", endedAt: now } });
    const clients = signers.flatMap((x) => (x.personId ? [x.personId] : []));
    const payload = SigningCompletedPayload.parse({ documentKind: "OTHER", requestId: q.id, documentId: q.documentId, documentVersionId: q.documentVersionId, documentVersion: q.documentVersion,
      signerPersonIds: clients, documentFileKey: files.sealed.key, certificateFileKey: files.audit.key, sealedSha256: files.sealed.sha256, certificateSha256: files.audit.sha256 });
    await line("signing.completed", "Signed by everyone: the sealed copy and the audit file are stored with us (no prospect moves)", { status: "CLIENT_SIGNED" }, { status: "SIGNED", sealedSha256: files.sealed.sha256, auditSha256: files.audit.sha256 });
    await tx.moduleEvent.create({ data: { firmId, type: SIGNING_EVENT.SIGNING_COMPLETED, subjectId: q.id, occurredAt: now, payload: payload as Prisma.InputJsonValue } });
    return { received: true as const, applied: true, clients, title: d.title };
  }

  /** "Your signed document", once per client signer (after the commit; a failure is logged, the evidence stays). */
  private async signedCopies(firmId: string, requestId: string, personIds: string[], title: string, sealed: { bytes: Uint8Array; contentType: string }) {
    const mail = signingMail();
    if (!mail) { console.warn("[fo-signing] no MailPort set: the signed copies were not emailed"); return; }
    const firm = await this.db.platformFirm.findFirstOrThrow({ where: { id: firmId }, select: { operatingName: true, contactEmail: true } });
    for (const id of personIds) {
      const p = await this.db.foPerson.findFirst({ where: { firmId, id }, select: { id: true, email: true, givenNames: true } });
      if (!p?.email) continue;
      try {
        await mail.send({ firmId, to: p.email, replyTo: firm.contactEmail, class: "TRANSACTIONAL", person: { kind: "FO_PERSON", id: p.id }, templateKey: "signing.signed_copy", idempotencyKey: `signing:${requestId}:signed-copy:${p.id}`,
          subject: "Your signed document", text: `Hello${p.givenNames ? ` ${p.givenNames}` : ""},\n\nEveryone has signed "${title}". Your signed copy from ${firm.operatingName} is attached.\n\nReply to this email to reach ${firm.operatingName}.`,
          attachments: [{ filename: "signed-document.pdf", contentType: sealed.contentType, bytes: new Uint8Array(sealed.bytes) }] });
      } catch (e) { console.error(`[fo-signing] the signed copy's email failed: ${(e as Error)?.name ?? "error"}`); }
    }
  }
}
