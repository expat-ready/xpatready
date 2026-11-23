// FO-6d (BACKLOG row FO-6d; AG-5-61; P-564): send any PDF for signature. A person with agent/portal:request-work uploads
// a PDF from a prospect they can see, picks one or more people on that prospect (its subject, its primary contact, a live
// contact of its company) and optionally one active firm person, and clicks Send: the file is stored (FilesPort, under
// signing/), the adapter's envelope is made, then one fo_signing_document, one fo_signature_request of kind OTHER and its
// signers are written in one transaction with one audit line (a failure cancels the envelope). The same door, consent,
// email code, reminders and expiry as FO-6 apply to it as they land (they key on fo_signature_request); this part sends
// no signing email (FO-6 part 4's door sends every signer's link). The provider's webhook hands OTHER requests to
// `onHook` (registered by features/front-office-signing-any-document.ts): viewed and signed move the signer and the request, the firm signer (when added)
// signs last, nobody signs without consent; completed stores the sealed and audit files, hashed, moves the request to
// SIGNED, writes `signing.completed` (kind OTHER) last, then emails each client signer "Your signed document" once. An
// OTHER request never moves a prospect and never makes a client (no retainer, no win). Government forms are never sent
// this way: a PDF with an XFA form (IRCC's forms are XFA) or named like an IRCC form number is refused (a check of the
// file, Unconfirmed: no immigration expert); a password-protected PDF and a signer with no email are refused (AG-5-61 §12).
// The case documents' read port is not built: uploads only (said on screen).
// Every value is Sample. Legal points (e-signature identity): Unconfirmed: no counsel.
import { HttpException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { inflateSync } from "node:zlib";
import type { AuditPort } from "../../../../../ports/audit.ts";
import { SIGNING_EVENT, SigningCompletedPayload } from "../../../../../ports/events/signing.ts";
import type { FilesPort } from "../../../../../ports/files.ts";
import { auditEvent } from "../../../platform/audit/audit-event.ts";
import { problem, type StaffContext } from "../../../platform/identity/keys.ts";
import { sees, visibilityOf } from "../../sales/common.ts";
import { signingMail, signingPort } from "../handlers.ts";
import type { SigningHookCall, SigningHookEvent } from "../port.ts";
import { SigningEnded, SigningNotFound } from "../port.ts";

type Tx = Prisma.TransactionClient;
export const MAX_BYTES = 25 * 1024 * 1024;   // the port's limit (Sample)
export const EXPIRES_DAYS = 14;              // Sample, as FO-6 (AG-05 C3)
export const ACTOR = "system:signing";
const DAY = 86_400_000;
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const notFound = (what: string): never => problem(404, "Not found", `No such ${what} in your firm.`, { code: "NOT_FOUND" });
const refuse = (detail: string, code: string, field?: string): never => problem(422, "Check the details", detail, { code, ...(field ? { fields: { [field]: detail } } : {}) });
const conflict = (detail: string, code: string): never => problem(409, "Not possible now", detail, { code });
const nameOf = (p: { givenNames: string | null; familyName: string | null }) => [p.givenNames, p.familyName].filter((x) => x && x.trim()).join(" ").trim();
const LIVE = ["SENT", "VIEWED", "CLIENT_SIGNED"];

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
  if (/\bIMM[\s_-]?\d{4}/i.test(name)) return true;
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
    const docs = await this.db.foSigningDocument.findMany({ where: { firmId: ctx.firmId, prospectId }, take: 200 });
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

  /** The signed copies on a person's record (any kind: retainers too), when the person is on a prospect the viewer sees;
   *  each item only when its own prospect is visible too. */
  async personDocuments(ctx: StaffContext, personId: string) {
    const firmId = ctx.firmId, vis = await visibilityOf(this.db, ctx);
    const person = await this.db.foPerson.findFirst({ where: { firmId, id: personId }, select: { id: true } });
    if (!person) return notFound("person");
    const companies = (await this.db.foCompanyContact.findMany({ where: { firmId, personId }, select: { companyId: true } })).map((c) => c.companyId);
    const on = await this.db.foProspect.findMany({ where: { firmId, OR: [{ subjectPersonId: personId }, { primaryContactPersonId: personId }, ...(companies.length ? [{ subjectCompanyId: { in: companies } }] : [])] }, select: { ownerStaffId: true } });
    if (!vis.seesAll && !on.some((p) => sees(vis, ctx, p.ownerStaffId))) return notFound("person");
    const mine = await this.db.foSigner.findMany({ where: { firmId, personId, signedAt: { not: null } }, select: { requestId: true } });
    const qs = await this.db.foSignatureRequest.findMany({ where: { firmId, id: { in: mine.map((m) => m.requestId) }, status: "SIGNED" }, include: { evidence: true }, orderBy: { endedAt: "desc" } });
    const titles = await this.db.foSigningDocument.findMany({ where: { firmId, id: { in: qs.map((q) => q.documentId) } }, select: { id: true, title: true, prospectId: true } });
    // Review M2 on #3207: each item follows its own prospect's read (a company contact sits on prospects of other owners).
    const rets = await this.db.foRetainer.findMany({ where: { firmId, id: { in: qs.filter((q) => q.documentKind !== "OTHER").map((q) => q.documentId) } }, select: { id: true, prospectId: true } });
    const prospectOf = (q: { documentKind: string; documentId: string }) => (q.documentKind === "OTHER" ? titles.find((t) => t.id === q.documentId)?.prospectId : rets.find((r) => r.id === q.documentId)?.prospectId) ?? null;
    const owners = new Map((await this.db.foProspect.findMany({ where: { firmId, id: { in: qs.map(prospectOf).filter((x): x is string => !!x) } }, select: { id: true, ownerStaffId: true } })).map((p) => [p.id, p.ownerStaffId]));
    const visible = (q: { documentKind: string; documentId: string }) => { const id = prospectOf(q); return vis.seesAll || (!!id && owners.has(id) && sees(vis, ctx, owners.get(id)!)); };
    return { documents: qs.filter((q) => q.evidence && visible(q)).map((q) => ({ kind: "SIGNED_COPY", documentKind: q.documentKind, requestId: q.id, title: titles.find((t) => t.id === q.documentId)?.title ?? (q.documentKind === "RETAINER" ? `Retainer agreement (version ${q.documentVersion})` : "Consultation agreement"),
      signedAt: q.endedAt, sealedSha256: q.evidence!.sealedSha256, auditSha256: q.evidence!.auditSha256 })) };
  }

  /** The provider's webhook for a request of kind OTHER, run as its firm (features/front-office-signing-any-document.ts registers it). */
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
