// PF-10t (R1.35; map row 35's "contacts"; AG-18-3, -13, -14, -38, -42, -43, -45, -59): people as an import target. The
// front office registers `person` with the platform's one engine (ports/import-target.ts): fo_person's names, email,
// phone and language. Natural key: the email (lower case), else the phone in E.164 (FO-9b's phoneE164Exact, the same
// reading as every arrival door). A merge fills only empty fields (AG-18-38); a merged-away person is never matched.
// Consent (AG-18-45): a column mapped to "Email marketing consent" writes one ConsentPort record, basis and source
// IMPORT_DECLARED, for a "yes" only, only with the importer's ticked declaration (the engine refuses the dry run without
// it) and only for a person with an email; an import never brings back a consent the person withdrew, nor overrides an
// unsubscribe or a suppression. The source is the batch (origin Import, its source name: the engine's plat_import_row,
// GET /api/platform/imports/origin/fo_person/:id). Quiet (AG-18-43, -59): nothing here sends, invites or starts a recipe;
// a person made here is a record only, no lead. One audit line per person made or filled, in the row's transaction.
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { ConsentPort } from "../../../../ports/consent.ts";
import type { Existing, ImportContext, ImportTarget, Reason, RowCheck, TargetField } from "../../../../ports/import-target.ts";
import { normaliseEmail } from "../../../../ports/matching.ts";
import { hasWord } from "../../../../ports/fo-person.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { phoneE164Exact } from "../duplicates/phone.ts";
import { seedFirmFrontOffice } from "../firm-seed.ts";

type Tx = Prisma.TransactionClient;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;
/** Languages a person may be served in (Sample: ISO 639-1 codes the firms use; AG-2 has no list). */
export const LANGUAGES = ["en", "fr", "es", "pt", "zh", "hi", "pa", "ar", "tl", "ur", "fa", "ko", "vi", "ru", "uk", "de", "it", "ja"];
const YES = ["yes", "y", "true", "1", "oui"], NO = ["no", "n", "false", "0", "non"];

export const PERSON_FIELDS: TargetField[] = [
  { key: "givenNames", label: "Given names", required: false, kind: "TEXT", aliases: ["first name", "first", "given name", "prénom"] },
  { key: "familyName", label: "Family name", required: false, kind: "TEXT", aliases: ["last name", "surname", "last", "nom"] },
  { key: "email", label: "Email", required: false, kind: "EMAIL", aliases: ["e-mail", "email address", "courriel"] },
  { key: "phone", label: "Phone", required: false, kind: "PHONE", aliases: ["phone number", "mobile", "cell", "téléphone"] },
  { key: "language", label: "Language", required: false, kind: "LANGUAGE", aliases: ["preferred language", "langue"], values: LANGUAGES, help: "A two-letter code such as en or fr." },
  { key: "marketingConsent", label: "Email marketing consent", required: false, kind: "CONSENT", aliases: ["marketing", "newsletter", "consent"], values: ["yes", "no"], help: "yes: the person agreed to marketing email from your firm. Needs your declaration." },
];

const text = (field: string, v: string | undefined, max: number, out: Reason[]): string | undefined => {
  if (v === undefined) return undefined;
  const t = v.normalize("NFC").trim();
  if ([...t].length > max) { out.push({ field, rule: "too_long" }); return undefined; }
  if (CONTROL.test(t) || /[\r\n]/.test(t) || /[\uD800-\uDFFF]/.test(t.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""))) { out.push({ field, rule: "not_text" }); return undefined; }
  return hasWord(t) ? t : undefined;
};

export class PersonImportTarget implements ImportTarget<Tx> {
  readonly key = "person";
  readonly label = "People";
  readonly recordKind = "fo_person";
  readonly personalData = true;
  readonly version = 1;
  readonly keyField = "email";
  readonly fields = PERSON_FIELDS;
  constructor(private readonly audit: AuditPort<Tx>, private readonly consent: ConsentPort<Tx>) {}

  check(c: Record<string, string>): RowCheck {
    const reasons: Reason[] = [], v: Record<string, string> = {};
    const given = text("givenNames", c.givenNames, 200, reasons), family = text("familyName", c.familyName, 200, reasons);
    if (given) v.givenNames = given;
    if (family) v.familyName = family;
    if (c.email !== undefined) { const e = normaliseEmail(c.email); if (e && [...e].length <= 254) v.email = e; else reasons.push({ field: "email", rule: "not_email" }); }
    if (c.phone !== undefined) { const p = phoneE164Exact(c.phone); if (p) v.phone = p; else reasons.push({ field: "phone", rule: "not_phone" }); }
    if (c.language !== undefined) { const l = c.language.trim().toLowerCase(); if (LANGUAGES.includes(l)) v.language = l; else reasons.push({ field: "language", rule: "not_language" }); }
    if (c.marketingConsent !== undefined) {
      const m = c.marketingConsent.trim().toLowerCase();
      if (YES.includes(m)) v.marketingConsent = "yes";
      else if (!NO.includes(m)) reasons.push({ field: "marketingConsent", rule: "not_allowed_value" });
    }
    if (!reasons.length && !given && !family) reasons.push({ field: "givenNames", rule: "name_needed" });
    if (!reasons.length && !v.email && !v.phone) reasons.push({ field: "email", rule: "no_contact" });
    if (!reasons.length && v.marketingConsent && !v.email) reasons.push({ field: "marketingConsent", rule: "needs_email" });
    if (reasons.length) return { reasons };
    return { values: v, naturalKey: v.email ? `email:${v.email}` : `phone:${v.phone}` };
  }

  async find(tx: Tx, firmId: string, naturalKey: string): Promise<Existing | null> {
    const [kind, value] = [naturalKey.slice(0, naturalKey.indexOf(":")), naturalKey.slice(naturalKey.indexOf(":") + 1)];
    const where = kind === "email" ? { email: value } : { phoneE164: value };
    const p = await tx.foPerson.findFirst({ where: firmScope(firmId, { ...where, mergedIntoId: null }), orderBy: { createdAt: "asc" } });
    if (!p) return null;
    return { id: p.id, values: { givenNames: p.givenNames, familyName: p.familyName, email: p.email, phone: p.phone, language: p.language, marketingConsent: await this.consentState(tx, firmId, p.id, p.email) } };
  }

  /** "yes" while a marketing consent is live; "kept" when the person withdrew, unsubscribed or is suppressed (an import
   *  never overrides that); null when there is none (the one state an import may fill). */
  private async consentState(tx: Tx, firmId: string, personId: string, email: string | null): Promise<string | null> {
    if (!email) return null;
    const d = await this.consent.allows(tx, { firmId, subject: { kind: "FO_PERSON", id: personId }, channel: "EMAIL", address: email, class: "MARKETING" });
    return d.allowed ? "yes" : d.reason === "NO_CONSENT" ? null : "kept";
  }

  fills(e: Existing, v: Record<string, string>): string[] {
    return Object.keys(v).filter((k) => (e.values[k] ?? null) === null);
  }

  async create(tx: Tx, ctx: ImportContext, v: Record<string, string>): Promise<{ id: string }> {
    const firmId = firmScope(ctx.firmId).firmId;
    if (!(await tx.foSalesSetup.findFirst({ where: firmScope(firmId), select: { firmId: true } }))) await seedFirmFrontOffice(tx, firmId);
    const id = randomUUID(), row = { givenNames: v.givenNames ?? null, familyName: v.familyName ?? null, email: v.email ?? null, phone: v.phone ?? null, language: v.language ?? null };
    await tx.foPerson.create({ data: { id, firmId, ...row, phoneReadable: true, createdBy: ctx.actor } });
    await this.audit.record(tx, { firmId, actor: ctx.actor, action: "front_office.person.imported", entity: "fo_person", entityKey: id, summary: "A person was added by an import.", detail: { foPersonId: id, batchId: ctx.batchId }, before: null, after: row });
    if (v.marketingConsent === "yes") await this.recordConsent(tx, ctx, id);
    return { id };
  }

  async merge(tx: Tx, ctx: ImportContext, e: Existing, v: Record<string, string>, fields: string[]): Promise<{ before: Record<string, string | null> }> {
    const firmId = firmScope(ctx.firmId).firmId, cols = fields.filter((f) => f !== "marketingConsent");
    const before = Object.fromEntries(Object.entries(e.values).filter(([k]) => k !== "marketingConsent"));
    if (cols.length) {
      // Only the fields still empty now (the row's transaction re-read them through find): a filled one is never written.
      const n = await tx.foPerson.updateMany({ where: firmScope(firmId, { id: e.id, mergedIntoId: null, ...Object.fromEntries(cols.map((c) => [c, null])) }), data: Object.fromEntries(cols.map((c) => [c, v[c]])) });
      if (n.count !== 1) throw new Error("PersonImportTarget.merge: the person changed while the row was written");
      await this.audit.record(tx, { firmId, actor: ctx.actor, action: "front_office.person.import_filled", entity: "fo_person", entityKey: e.id, summary: `An import filled ${cols.length} empty field${cols.length === 1 ? "" : "s"} of a person.`, detail: { foPersonId: e.id, batchId: ctx.batchId, fields: cols }, before: Object.fromEntries(cols.map((c) => [c, null])), after: Object.fromEntries(cols.map((c) => [c, v[c]])) });
    }
    if (fields.includes("marketingConsent")) await this.recordConsent(tx, ctx, e.id);
    return { before };
  }

  private async recordConsent(tx: Tx, ctx: ImportContext, personId: string) {
    if (!ctx.declared) throw new Error("PersonImportTarget: consent without the importer's declaration");   // the engine refuses earlier
    await this.consent.record(tx, { firmId: ctx.firmId, subject: { kind: "FO_PERSON", id: personId }, channel: "EMAIL", purpose: "MARKETING", basis: "IMPORT_DECLARED", source: "IMPORT_DECLARED", sourceRef: `import:${ctx.batchId}`, evidenceRef: ctx.sourceName.slice(0, 200), recordedKind: "USER", recordedBy: ctx.actor });
  }
}
