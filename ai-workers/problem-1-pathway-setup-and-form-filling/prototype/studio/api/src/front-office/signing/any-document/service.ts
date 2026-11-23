// FO-6d (BACKLOG row FO-6d; AG-5-61; P-564): send any PDF for signature. A person with agent/portal:request-work uploads
// a PDF from a prospect they can see, picks one or more people on that prospect (its subject, its primary contact, a live
// contact of its company) and optionally one active firm person, and clicks Send: the file is stored (FilesPort, under
// signing/), the adapter's envelope is made, then one fo_signing_document, one fo_signature_request of kind OTHER and its
// signers are written in one transaction with one audit line (a failure cancels the envelope). The same door, consent,
// email code, reminders and expiry as FO-6 apply to it as they land (they key on fo_signature_request); this part sends
// no signing email (FO-6 part 4's door sends every signer's link). The provider's webhook for OTHER requests (viewed,
// signed, completed: the sealed copy filed, "Your signed document") and the signed copies on a person are part 2
// (./completion.ts, ./person-documents.ts). An OTHER request never moves a prospect and never makes a client.
// Government forms are never sent this way: a PDF with an XFA form (IRCC's forms are XFA) or named like an IRCC form number is refused (a check of the
// file, Unconfirmed: no immigration expert); a password-protected PDF and a signer with no email are refused (AG-5-61 §12).
// The case documents' read port is not built: uploads only (said on screen).
// Every value is Sample. Legal points (e-signature identity): Unconfirmed: no counsel.
import { Prisma, type PrismaClient } from "@prisma/client";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { inflateSync } from "node:zlib";
import type { AuditPort } from "../../../../../ports/audit.ts";
import type { FilesPort } from "../../../../../ports/files.ts";
import { auditEvent } from "../../../platform/audit/audit-event.ts";
import { problem, type StaffContext } from "../../../platform/identity/keys.ts";
import { sees, visibilityOf } from "../../sales/common.ts";
import { signingPort } from "../handlers.ts";
import { SigningEnded, SigningNotFound } from "../port.ts";

export type Tx = Prisma.TransactionClient;
export const MAX_BYTES = 25 * 1024 * 1024;   // the port's limit (Sample)
export const EXPIRES_DAYS = 14;              // Sample, as FO-6 (AG-05 C3)
const DAY = 86_400_000;
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
export const notFound = (what: string): never => problem(404, "Not found", `No such ${what} in your firm.`, { code: "NOT_FOUND" });
const refuse = (detail: string, code: string, field?: string): never => problem(422, "Check the details", detail, { code, ...(field ? { fields: { [field]: detail } } : {}) });
export const conflict = (detail: string, code: string): never => problem(409, "Not possible now", detail, { code });
export const nameOf = (p: { givenNames: string | null; familyName: string | null }) => [p.givenNames, p.familyName].filter((x) => x && x.trim()).join(" ").trim();

export type SendInput = { title: string; prospectId: string; signerPersonIds: string[]; firmSignerStaffId?: string | null };
export type Upload = { bytes: Uint8Array; size: number; name?: string } | undefined;

/** The file's own checks: a PDF by its first bytes (never by its name or declared type), the size, not a government form. */
/** Whether a PDF is a government (IRCC) form: AG-5-61 r6 keeps those on AG-07's own path. Signals, any one (review M1 on
 *  #3207, measured on the committed IRCC forms in official-sources/ircc): an IMM form number in the file name or title;
 *  `/NeedsRendering` (a dynamic XFA form) or `/XFA` in the raw bytes; a fillable form with Reader usage rights
 *  (`/AcroForm` and `/Perms`, both dictionary keys that stay readable under an owner password); `/XFA` inside a deflated
 *  stream (an open form keeps it in an object stream), at most 400 streams and 64 MB inflated. A check of the file,
 *  not a guarantee (Unconfirmed: no immigration expert). */
export function isGovernmentForm(bytes: Uint8Array, name: string): boolean {
  if (/(?:^|[^a-z])IMM[\s_-]?\d{4}/i.test(name)) return true;   // break M1: "client_IMM5476.pdf" too
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.includes("/NeedsRendering") || b.includes("/XFA") || (b.includes("/AcroForm") && b.includes("/Perms"))) return true;
  if (b.includes("/Encrypt")) return false;   // an encrypted stream cannot be read here
  let at = 0, streams = 0, out = 0;
  while (streams < 400 && out < 64 * 1024 * 1024) {
    const s = b.indexOf("stream", at);
    if (s < 0) break;
    const start = s + (b[s + 6] === 0x0d && b[s + 7] === 0x0a ? 8 : 7), end = b.indexOf("endstream", start);
    if (end < 0) break;
    at = end + 9; streams++;
    if (!b.subarray(Math.max(0, s - 400), s).includes("/FlateDecode")) continue;
    try { const z = inflateSync(b.subarray(start, end), { maxOutputLength: 16 * 1024 * 1024 }); out += z.length; if (z.includes("/XFA")) return true; } catch { /* not a whole zlib stream */ }
  }
  return false;
}

/** The file's own checks: a PDF by its first bytes (never by its name or declared type), the size, not a government form
 *  (checked before the password, so a protected IRCC form is named as a form, never "upload an open copy"). */
export function checkPdf(f: Upload, title: string): Uint8Array {
  if (!f || !f.bytes.length) return refuse("Choose a PDF to send.", "FILE_REQUIRED", "file");
  if (f.size > MAX_BYTES || f.bytes.length > MAX_BYTES) return refuse("This file is too large: at most 25 MB.", "FILE_TOO_LARGE", "file");
  if (Buffer.from(f.bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") return refuse("This file is not a PDF. Only a PDF can be sent for signature.", "NOT_PDF", "file");
  if (isGovernmentForm(f.bytes, `${f.name ?? ""} ${title}`)) return refuse("Government forms are not sent for signature this way. The client signs the form itself on paper or in the government's portal.", "GOVERNMENT_FORM", "file");
  // AG-5-61 §12: a PDF with a password (an encryption dictionary in its trailer) is refused at send.
  if (Buffer.from(f.bytes).includes("/Encrypt")) return refuse("This PDF is protected. Upload an open copy.", "PDF_PROTECTED", "file");
  return f.bytes;
}

export class AnyDocuments {
  constructor(private readonly db: PrismaClient, private readonly files: FilesPort, private readonly o: { audit?: AuditPort<Tx>; now?: () => Date } = {}) {}
  private get audit() { return this.o.audit ?? auditEvent; }
  private now() { return this.o.now?.() ?? new Date(); }

  /** The prospect, if the person may see it (else the one not-found, another firm's too). */
  private async prospect(ctx: StaffContext, id: string) {
    const p = await this.db.foProspect.findFirst({ where: { firmId: ctx.firmId, id }, select: { id: true, ownerStaffId: true, subjectPersonId: true, subjectCompanyId: true, primaryContactPersonId: true } });
    if (!p || !sees(await visibilityOf(this.db, ctx), ctx, p.ownerStaffId)) return notFound("prospect");
    return p;
  }

  /** The people on a prospect who may sign: its subject, its primary contact and its company's live contacts. */
  private async peopleOn(firmId: string, p: { subjectPersonId: string | null; subjectCompanyId: string | null; primaryContactPersonId: string }) {
    const now = this.now();
    const contacts = p.subjectCompanyId ? await this.db.foCompanyContact.findMany({ where: { firmId, companyId: p.subjectCompanyId, OR: [{ validTo: null }, { validTo: { gt: now } }] }, select: { personId: true } }) : [];
    return new Set([p.subjectPersonId, p.primaryContactPersonId, ...contacts.map((c) => c.personId)].filter((x): x is string => !!x));
  }

  /** The people a send may pick on this prospect (the screen's list). */
  async signersFor(ctx: StaffContext, prospectId: string) {
    const p = await this.prospect(ctx, prospectId), ids = [...(await this.peopleOn(ctx.firmId, p))];
    const people = await this.db.foPerson.findMany({ where: { firmId: ctx.firmId, id: { in: ids } }, select: { id: true, givenNames: true, familyName: true, email: true }, orderBy: [{ familyName: "asc" }, { givenNames: "asc" }] });
    const staff = await this.db.platformStaff.findMany({ where: { firmId: ctx.firmId, status: "ACTIVE" }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } });
    return { people: people.map((x) => ({ personId: x.id, name: nameOf(x) || "Client", hasEmail: !!x.email })), firmPeople: staff.map((s) => ({ staffId: s.id, name: s.displayName })) };
  }

  /** Send: nothing is sent until this call (a person's click). Answers the new request's state (201). */
  async send(ctx: StaffContext, input: SendInput, f: Upload) {
    const firmId = ctx.firmId, p = await this.prospect(ctx, input.prospectId);
    const ids = [...new Set(input.signerPersonIds.map((x) => x.toLowerCase()))];
    if (!ids.length) return refuse("Pick at least one person to sign.", "SIGNERS_REQUIRED", "signerPersonIds");
    if (ids.length > 9) return refuse("At most 9 people sign one document.", "TOO_MANY_SIGNERS", "signerPersonIds");
    const on = await this.peopleOn(firmId, p), people = await this.db.foPerson.findMany({ where: { firmId, id: { in: ids } }, select: { id: true, givenNames: true, familyName: true, email: true } });
    if (people.length !== ids.length || ids.some((x) => !on.has(x))) return refuse("Each signer must be a person on this prospect.", "SIGNER_NOT_ON_PROSPECT", "signerPersonIds");
    // AG-5-61 §12: a signer with no email cannot be picked (the link and the code go by email).
    const noEmail = people.filter((x) => !x.email?.trim());
    if (noEmail.length) return refuse(`${noEmail.map((x) => nameOf(x) || "A signer").join(", ")} has no email address. Add an email first.`, "SIGNER_NO_EMAIL", "signerPersonIds");
    const rep = input.firmSignerStaffId ? await this.db.platformStaff.findFirst({ where: { firmId, id: input.firmSignerStaffId, status: "ACTIVE" }, select: { id: true, displayName: true } }) : null;
    if (input.firmSignerStaffId && !rep) return refuse("The firm signer must be an active person of your firm.", "FIRM_SIGNER_NOT_IN_FIRM", "firmSignerStaffId");
    const bytes = checkPdf(f, input.title);
    const documentId = randomUUID(), requestId = randomUUID(), port = signingPort();
    const stored = await this.files.put(firmId, `signing/documents/${documentId}/original.pdf`, bytes, "application/pdf");
    const signers = people.map((x) => ({ id: randomUUID(), personId: x.id, name: nameOf(x) || "Client" }));
    const firmSigner = rep ? { id: randomUUID(), staffId: rep.id, name: rep.displayName } : null;
    const { providerDocumentId } = await port.send({ firmId, requestId, title: input.title, document: { bytes: new Uint8Array(bytes), contentType: "application/pdf" },
      signers: [...signers.map((s) => ({ signerId: s.id, role: "CLIENT" as const, name: s.name })), ...(firmSigner ? [{ signerId: firmSigner.id, role: "FIRM" as const, name: firmSigner.name }] : [])] });
    const token = () => sha(`${firmId.replace(/-/g, "")}.${randomBytes(32).toString("base64url")}`);   // part 4 emails the link; only its sha256 is kept
    try {
      await this.db.$transaction(async (tx) => {
        const now = this.now(), expiresAt = new Date(now.getTime() + EXPIRES_DAYS * DAY);
        await tx.foSigningDocument.create({ data: { id: documentId, firmId, title: input.title, fileKey: stored.key, sha256: stored.sha256, prospectId: p.id, uploadedBy: ctx.staffId, createdAt: now } });
        await tx.foSignatureRequest.create({ data: { id: requestId, firmId, documentKind: "OTHER", documentId, documentVersionId: documentId, documentVersion: 1, provider: port.provider, providerDocumentId, sentBy: ctx.staffId, sentAt: now, expiresAt } });
        await tx.$queryRaw`select id from fo_signature_request where firm_id = ${firmId}::uuid and id = ${requestId}::uuid for update`;
        for (const s of signers) await tx.foSigner.create({ data: { id: s.id, firmId, requestId, role: "CLIENT", signOrder: 1, personId: s.personId, linkTokenSha256: token() } });
        if (firmSigner) await tx.foSigner.create({ data: { id: firmSigner.id, firmId, requestId, role: "FIRM", signOrder: 2, staffId: firmSigner.staffId, linkTokenSha256: token() } });
        await this.audit.record(tx, { firmId, actor: `staff:${ctx.staffId}`, action: "signing.request_sent", entity: "fo_signature_request", entityKey: requestId,
          summary: `Sent for signing (document "${input.title}"): ${signers.length} ${signers.length === 1 ? "person" : "people"}${firmSigner ? ", then the firm" : ""}`,
          detail: { requestId, documentId, prospectId: p.id, sha256: stored.sha256, signers: signers.length, firmSigner: !!firmSigner, provider: port.provider },
          before: null, after: { status: "SENT", documentKind: "OTHER", signers: signers.length + (firmSigner ? 1 : 0), expiresAt: expiresAt.toISOString() } });
      });
    } catch (e) {
      try { await port.cancel(firmId, providerDocumentId); } catch (c) { if (!(c instanceof SigningEnded || c instanceof SigningNotFound)) console.error(`[fo-signing] cancel after a failed send did not finish: ${(c as Error)?.name ?? "error"}`); }
      throw e;
    }
    return this.state(ctx, requestId);
  }

  /** One request of kind OTHER, if its prospect is visible: status, "1 of 2 signed", each signer, the evidence's hashes. */
  async state(ctx: StaffContext, requestId: string) {
    const q = await this.db.foSignatureRequest.findFirst({ where: { firmId: ctx.firmId, id: requestId, documentKind: "OTHER" }, include: { signers: { orderBy: [{ signOrder: "asc" }, { id: "asc" }] }, evidence: true } });
    const d = q ? await this.db.foSigningDocument.findFirst({ where: { firmId: ctx.firmId, id: q.documentId } }) : null;
    if (!q || !d) return notFound("signature request");
    if (d.prospectId) await this.prospect(ctx, d.prospectId);
    return (await this.shape(ctx.firmId, [{ q, d }]))[0];
  }

  /** The prospect's requests of kind OTHER, newest first (the screen's state list). */
  async listForProspect(ctx: StaffContext, prospectId: string) {
    await this.prospect(ctx, prospectId);
    const docs = await this.db.foSigningDocument.findMany({ where: { firmId: ctx.firmId, prospectId }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 200 });   // the newest 200 (break m8)
    const qs = await this.db.foSignatureRequest.findMany({ where: { firmId: ctx.firmId, documentKind: "OTHER", documentId: { in: docs.map((d) => d.id) } }, include: { signers: { orderBy: [{ signOrder: "asc" }, { id: "asc" }] }, evidence: true }, orderBy: { sentAt: "desc" } });
    return { requests: await this.shape(ctx.firmId, qs.map((q) => ({ q, d: docs.find((d) => d.id === q.documentId)! }))) };
  }

  private async shape(firmId: string, rows: { q: Prisma.FoSignatureRequestGetPayload<{ include: { signers: true; evidence: true } }>; d: { id: string; title: string; prospectId: string | null; sha256: string } }[]) {
    const pids = rows.flatMap((r) => r.q.signers.flatMap((s) => (s.personId ? [s.personId] : []))), sids = rows.flatMap((r) => r.q.signers.flatMap((s) => (s.staffId ? [s.staffId] : [])));
    const people = await this.db.foPerson.findMany({ where: { firmId, id: { in: pids } }, select: { id: true, givenNames: true, familyName: true } });
    const staff = await this.db.platformStaff.findMany({ where: { firmId, id: { in: sids } }, select: { id: true, displayName: true } });
    return rows.map(({ q, d }) => {
      const n = q.signers.filter((s) => s.signedAt).length;
      return { id: q.id, documentKind: q.documentKind, title: d.title, documentId: d.id, prospectId: d.prospectId, originalSha256: d.sha256, status: q.status, sentAt: q.sentAt, expiresAt: q.expiresAt, endedAt: q.endedAt,
        signed: `${n} of ${q.signers.length} signed`, signedCount: n, signerCount: q.signers.length,
        signers: q.signers.map((s) => { const p = people.find((x) => x.id === s.personId), st = staff.find((x) => x.id === s.staffId);
          return { role: s.role, name: p ? nameOf(p) || "Client" : st?.displayName ?? "Firm", personId: s.personId, staffId: s.staffId, viewedAt: s.viewedAt, signedAt: s.signedAt, declinedAt: s.declinedAt }; }),
        evidence: q.evidence ? { storedAt: q.evidence.storedAt, sealedSha256: q.evidence.sealedSha256, auditSha256: q.evidence.auditSha256, consentTextVersion: q.evidence.consentTextVersion } : null };
    });
  }

  /** A file of a visible request for a download link: the original, or the sealed copy once signed. */
  async fileKey(ctx: StaffContext, requestId: string, file: "original" | "signed"): Promise<string> {
    const s = await this.state(ctx, requestId);
    if (file === "original") return (await this.db.foSigningDocument.findFirstOrThrow({ where: { firmId: ctx.firmId, id: s.documentId }, select: { fileKey: true } })).fileKey;
    const e = await this.db.foSigningEvidence.findFirst({ where: { firmId: ctx.firmId, requestId }, select: { sealedFileKey: true } });
    return e ? e.sealedFileKey : conflict("This document is not signed by everyone yet.", "NOT_SIGNED");
  }

  /** Whether a key is a file of a request the person may still see (the download's second check). */
  async assertKeyVisible(ctx: StaffContext, key: string) {
    const m = /^signing\/(?:documents\/([0-9a-f-]{36})\/original\.pdf|([0-9a-f-]{36})\/[0-9a-f]+\/sealed\.pdf)$/.exec(key);
    const q = m?.[1] ? await this.db.foSignatureRequest.findFirst({ where: { firmId: ctx.firmId, documentKind: "OTHER", documentId: m[1] }, select: { id: true } }) : m?.[2] ? { id: m[2] } : null;
    if (!q) return notFound("file");
    await this.state(ctx, q.id);
  }

}
