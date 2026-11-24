// FO-6 part 4c (BACKLOG row FO-6: "the firm signer's embedded link declares `agent/retainer:show` and checks the caller is
// the retainer's representative"; note rule 12; plan plan-4c.md row 4; Lead 29 on #3490): the firm signer's link to sign a
// retainer, after every client. The route (./routes.ts) has read the path id (404) and the strict body (422) first (PF-28,
// plan challenge M1), then:
//   Retainers.read (404: another firm's, or one the caller may not see) → the live request of the current version (409
//   NO_LIVE_REQUEST) → the caller is that request's FIRM signer (written at Send from the filed version's representative,
//   rev 16.13) and the retainer's current representative (403 NOT_THE_REPRESENTATIVE) → every client signed (409
//   CLIENTS_FIRST) → the firm signer's consent recorded once under the request's row lock, with one audit line (part 3's
//   webhook refuses a signature without it, AG-5-25) → the adapter's embedded link (on a lane copy: the stand-in page).
// A withdrawn, signed-on-paper, declined or expired retainer has no live request it can sign (QA-770's guard, Lead 29).
// The words are Sample. Legal points (consent to sign electronically): Unconfirmed: no counsel.
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import { auditEvent } from "../../platform/audit/audit-event.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { CONSENT_TEXT_VERSION } from "./door.ts";
import { signingPort } from "./handlers.ts";
import { SigningEnded, SigningNotFound } from "./port.ts";

type Tx = Prisma.TransactionClient;
const SIGNABLE_RETAINER = ["SENT", "VIEWED", "CLIENT_SIGNED"];

export async function firmSigningLink(db: PrismaClient, ctx: StaffContext, retainer: { id: string; status: string; currentVersion: number; representativeStaffId: string },
  body: { consentTextVersion: string }, o: { audit?: AuditPort<Tx>; now?: () => Date } = {}): Promise<{ url: string; expiresAt: Date }> {
  const firmId = ctx.firmId, audit = o.audit ?? auditEvent, now = o.now ?? (() => new Date());
  if (body.consentTextVersion !== CONSENT_TEXT_VERSION) problem(409, "The wording changed", "The consent wording changed. Open the agreement again to read it.", { code: "CONSENT_CHANGED" });
  const req = SIGNABLE_RETAINER.includes(retainer.status)
    ? await db.foSignatureRequest.findFirst({ where: { firmId, documentKind: "RETAINER", documentId: retainer.id, documentVersion: retainer.currentVersion, status: { in: ["SENT", "VIEWED", "CLIENT_SIGNED"] } }, include: { signers: true } })
    : null;
  if (!req) return problem(409, "Nothing to sign", "This agreement has no signing request waiting for you.", { code: "NO_LIVE_REQUEST" });
  const firmSigner = req.signers.find((s) => s.role === "FIRM");
  if (!firmSigner || firmSigner.staffId !== ctx.staffId || retainer.representativeStaffId !== ctx.staffId) problem(403, "Not yours to sign", "Only the agreement's representative signs it for the firm.", { code: "NOT_THE_REPRESENTATIVE" });
  if (req.status !== "CLIENT_SIGNED" || req.signers.some((s) => s.role === "CLIENT" && !s.signedAt)) problem(409, "The client signs first", "The firm signs last, after every client has signed.", { code: "CLIENTS_FIRST" });
  if (firmSigner!.signedAt) problem(409, "Signed already", "You have signed this agreement already.", { code: "SIGNED_ALREADY" });
  if (!firmSigner!.consentedAt) await db.$transaction(async (tx) => {
    await tx.$queryRaw`select 1 from fo_signature_request where firm_id = ${firmId}::uuid and id = ${req.id}::uuid for update`;
    // Written only while none is recorded (part 1's trigger keeps consent once; a second call writes nothing: plan m4).
    const done = await tx.foSigner.updateMany({ where: { firmId, id: firmSigner!.id, consentedAt: null, signedAt: null }, data: { consentedAt: now(), consentTextVersion: CONSENT_TEXT_VERSION } });
    if (done.count) await audit.record(tx, { firmId, actor: `staff:${ctx.staffId}`, action: "signing.consent_recorded", entity: "fo_signature_request", entityKey: req.id, summary: "The representative agreed to sign electronically.",
      detail: { requestId: req.id, signerId: firmSigner!.id, documentKind: "RETAINER", retainerId: retainer.id }, before: { consented: false }, after: { consented: true, consentTextVersion: CONSENT_TEXT_VERSION } });
  });
  try { return await signingPort().embeddedLink(firmId, req.providerDocumentId, firmSigner!.id); } catch (e) {
    if (e instanceof SigningEnded) return problem(409, "This link has ended", "This agreement can no longer be signed.", { code: "LINK_ENDED" });
    if (e instanceof SigningNotFound) return problem(409, "Send it again", "The signing provider no longer knows this agreement. Send it again.", { code: "LINK_LOST" });
    throw e;
  }
}
