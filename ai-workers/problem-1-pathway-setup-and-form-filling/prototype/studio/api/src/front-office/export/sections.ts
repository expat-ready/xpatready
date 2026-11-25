// PF-11 part 2 (brief lead-b-briefs/PF-11.md "What to build, part 2"; SA-2-33, AG-16-20): the front office's sections of the
// firm's full data download, registered from its own feature file (features/front-office-firm-export.ts); it reads the
// front-office tables only, firm-scoped, every column but those named like a secret, never masked; no edit to their
// services. Leads, people, prospects, companies and contacts, attribution, stages and stage moves, calls, notes, the web
// forms and arrivals, services and assignment rules; bookings and their set-up; conflict and identity checks;
// consultation records; duplicate reviews and merges; retainers with their versions, fee rows and templates; signature
// requests, signers, signing documents and evidence. Stored files: each signing document, each sealed document and its
// audit trail, each retainer version's file and each template's current file. Left out on purpose: booking links
// (fo_booking_token: an access link, its hash only) and the signing provider's raw webhook receipts (plumbing, no firm
// content). Client money (invoices, payments, trust entries) registers its own exporter (the money lane, FO-7*).
import type { ModuleExportInput } from "../../../../ports/firm-export.ts";
import { tableSection, type TableSpec } from "../../platform/firm-export/platform-sections.ts";
import type { Tx } from "../../platform/firm-export/registry.ts";

export const FRONT_OFFICE_MODULE = "front-office";

/** The front office's tables, in the order a person reads them. */
export const FO_TABLES: readonly TableSpec[] = [
  ["sales-setup", "Sales set-up", "FoSalesSetup", ["firmId"]], ["people", "People", "FoPerson"], ["leads", "Leads", "FoLead"],
  ["lead-attribution", "Lead attribution", "FoLeadAttribution", ["leadId"]], ["companies", "Companies", "FoCompany"], ["company-contacts", "Company contacts", "FoCompanyContact"],
  ["prospects", "Prospects", "FoProspect"], ["stages", "Stages", "FoStage"], ["reasons", "Reasons", "FoReason"], ["stage-moves", "Stage history", "FoStageMove"],
  ["calls", "Calls", "FoCall"], ["notes", "Notes", "FoNote"], ["web-forms", "Web forms", "FoWebForm"], ["arrivals", "Arrivals from the web form and other doors", "FoArrivalReceipt"],
  ["services", "Services", "FoService"], ["assignment-rules", "Assignment rules", "FoAssignmentRule"],
  ["consultation-types", "Consultation types", "FoConsultationType"], ["availability-sets", "Availability sets", "FoAvailabilitySet"], ["availability", "Availability windows", "FoAvailability"],
  ["consultation-hosts", "Consultation hosts", "FoTypeHostSet", ["typeId", "staffId"]], ["time-off", "Time off", "FoTimeOff"], ["bookings", "Bookings", "FoBooking"],
  ["consultation-records", "Consultation records", "FoConsultRecord"], ["conflict-checks", "Conflict checks", "FoConflictCheck"], ["identity-checks", "Identity checks", "FoIdentityCheck"],
  ["duplicate-reviews", "Duplicate reviews", "FoDupReview"], ["duplicate-merges", "Duplicate merges", "FoDupMerge"],
  ["retainer-templates", "Retainer templates", "FoRetainerTemplate"], ["retainers", "Retainers", "FoRetainer"], ["retainer-versions", "Retainer versions", "FoRetainerVersion"],
  ["retainer-fee-rows", "Retainer fee rows", "FoRetainerFeeRow"], ["signature-requests", "Signature requests", "FoSignatureRequest"], ["signers", "Signers", "FoSigner"],
  ["signing-documents", "Documents sent for signing", "FoSigningDocument"], ["signing-evidence", "Signing evidence (sealed documents and audit trails)", "FoSigningEvidence"],
];

/** A stored file's name in the zip: the section, the row id, then the last part of its stored key (keeps its extension). */
const fileName = (prefix: string, id: string, key: string) => `${prefix}-${id}-${(key.split("/").pop() ?? "file").replace(/[^A-Za-z0-9._-]/g, "_")}`.slice(0, 150);

/** The front office module's exporter. */
export async function frontOfficeSections(firmId: string, tx: Tx): Promise<ModuleExportInput> {
  const sections = [];
  for (const t of FO_TABLES) sections.push(await tableSection(tx, firmId, t));
  const where = { firmId }, files: { key: string; name: string; sha256: string }[] = [];
  for (const d of await tx.foSigningDocument.findMany({ where, orderBy: { id: "asc" }, select: { id: true, fileKey: true, sha256: true } })) files.push({ key: d.fileKey, name: fileName("signing-document", d.id, d.fileKey), sha256: d.sha256 });
  for (const e of await tx.foSigningEvidence.findMany({ where, orderBy: { id: "asc" }, select: { requestId: true, sealedFileKey: true, sealedSha256: true, auditFileKey: true, auditSha256: true } })) {
    files.push({ key: e.sealedFileKey, name: fileName("signed", e.requestId, e.sealedFileKey), sha256: e.sealedSha256 });
    files.push({ key: e.auditFileKey, name: fileName("signing-audit", e.requestId, e.auditFileKey), sha256: e.auditSha256 });
  }
  for (const v of await tx.foRetainerVersion.findMany({ where, orderBy: { id: "asc" }, select: { id: true, fileKey: true, originalSha256: true } })) files.push({ key: v.fileKey, name: fileName("retainer-version", v.id, v.fileKey), sha256: v.originalSha256 });
  for (const t of await tx.foRetainerTemplate.findMany({ where, orderBy: { id: "asc" }, select: { id: true, fileKey: true, fileSha256: true } })) files.push({ key: t.fileKey, name: fileName("retainer-template", t.id, t.fileKey), sha256: t.fileSha256 });
  return { module: FRONT_OFFICE_MODULE, sections, files, words: "Each signed document is listed with its sealed copy and its audit trail. Booking links and the signing provider's raw notices are not included. Client money (invoices, payments and trust entries) is not in this download yet." };
}
