// FO-13i (P-579; brief lead-b-briefs/FO-13i.md, which wins; BACKLOG row FO-13i): the client identity check's API on
// FO-13's table fo_identity_check (front-office-compliance.prisma, migration 20261115013000_fo13_compliance_tables, whose
// checks and triggers hold the same rules again). The duty: Code of Professional Conduct SOR/2022-128 s. 24(2)(a),
// "confirm the following information in respect of the client" (full name, home address, phone, email, business
// details) and seek corroboration (trace t8 line 24, read 13 Nov 2026); legal reading Unconfirmed: no counsel.
// A check is insert-only: a correction is a new check. The optional copy goes in with the check, in one insert: it is put
// through FilesPort first under `identity/<personId>/<uuid>.<ext>`, then its key and sha256 are written with the row; if
// the insert fails, nothing names the stored copy, so no link can ever be made for it (no orphan is served).
// Never in a log, an email or an event: the document number (only its last 4 are taken), the copy's bytes, key or link.
// A person is seen as the leads code sees one (sales/common.ts visibilityOf): all, else one of their leads or a prospect
// they are on is the viewer's own (or an Unassigned lead the viewer may see). Another firm's or an unseen person is 404.
import { HttpException, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../../ports/audit.ts";
import { EVENT, IdentityCheckedPayload } from "../../../../../ports/events.ts";
import { FileKeyTaken, sha256Hex, type FilesPort } from "../../../../../ports/files.ts";
import { auditEvent } from "../../../platform/audit/audit-event.ts";
import { firmScope } from "../../../platform/firm-scope.ts";
import { readSetting, TIME_ZONE } from "../../../platform/settings.ts";
import { FIELD_ERROR_STATUS } from "../../../platform/http/input.ts";
import { problem, type StaffContext } from "../../../platform/identity/keys.ts";
import { sees, visibilityOf } from "../../sales/common.ts";

type Tx = Prisma.TransactionClient;
type Clock = { now(): number };
export type CopyUpload = { bytes: Uint8Array; size: number };

/** Sample limit (no source number): the copy of an identity document, at most 10 MB. */
export const COPY_MAX_BYTES = 10 * 1024 * 1024;
const METHODS = ["IN_PERSON", "VIDEO", "DOCUMENT_COPY", "OTHER"] as const;
/** Sample list (FO-13's enum). */
const DOCUMENT_TYPES = ["PASSPORT", "NATIONAL_IDENTITY_CARD", "DRIVERS_LICENCE", "PERMANENT_RESIDENT_CARD", "OTHER_GOVERNMENT_PHOTO_ID"] as const;
/** s. 24(2)(a): the details a check corroborates. */
const DETAILS = ["NAME", "HOME_ADDRESS", "PHONE", "EMAIL", "BUSINESS_DETAILS"] as const;
const FIELDS = new Set(["requestId", "method", "methodDetail", "documentType", "issuingCountry", "documentExpiry", "documentNumberLast4", "details"]);
/** ISO 3166-1 alpha-2, the 249 officially assigned codes (ISO 3166 Maintenance Agency list; no user-assigned or reserved code). */
const ISO_ALPHA2 = new Set(("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD " +
  "CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN " +
  "GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS " +
  "LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK " +
  "PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO " +
  "TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW").split(" "));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** No document number in the note (break B-1): the text is folded first (NFKC, a digit of any script counts as a digit,
 *  invisible and format characters dropped), then refused when it holds 6 or more digits in all (a number spaced, dotted
 *  or split across words is still a number) or the database's own shape (fo_compliance_no_document_number: a 6+ word
 *  with a letter and 3+ digits). Stricter than the database on purpose: a note says how the check was done. */
const fold = (t: string) => t.normalize("NFKC").replace(/\p{Nd}/gu, "0").replace(/[\p{Cf}\u00ad\u034f\u115f\u1160\u3164\uffa0]/gu, "");
const looksLikeNumber = (raw: string) => {
  const t = fold(raw);
  return (t.match(/[0-9]/g) ?? []).length >= 6 || (t.match(/[A-Za-z0-9-]{6,}/g) ?? []).some((w) => /[0-9]{6,}/.test(w) || (/[A-Za-z]/.test(w) && /[0-9][^0-9]*[0-9][^0-9]*[0-9]/.test(w)));
};
/** The database's fo_compliance_text_ok (break B-2): one line, no control or direction character, something visible. */
const INVISIBLE = /[\s\u00a0\u00ad\u034f\u115f\u1160\u17b4\u17b5\u180b-\u180e\u2000-\u200f\u2028-\u202f\u205f-\u206f\u2800\u3000\u3164\ufe00-\ufe0f\ufeff\uffa0\u0300-\u036f]/gu;
const oneLine = (t: string) => !/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c]/.test(t) && t.replace(INVISIBLE, "").length > 0;

/** A field error: 422, the field named (PF-28 part 3b moves it from 400; Lead B rev 17.21). */
const bad = (field: string, detail: string): never => problem(FIELD_ERROR_STATUS, "Check the details", detail, { code: "INVALID", fields: { [field]: detail } });
const notFound = (what = "person"): never => problem(404, "Not found", `No such ${what} in your firm.`, { code: "NOT_FOUND" });
const oneOf = <T extends string>(v: unknown, list: readonly T[], field: string, what: string): T =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : bad(field, `${what} is one of ${list.join(", ")}.`);
/** The firm's today as YYYY-MM-DD, in the firm's own zone, on the injected clock. */
const dayIn = (zone: string, atMs: number) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(atMs));
/** FO-13i part 2 (QA-510): the firm's own rule (P-735, P-579), not a Code duty. Unconfirmed: no counsel. */
export const EXPIRED_DOCUMENT = "This document has expired. Check a current one.";
const text = (v: unknown) => (v === undefined || v === null || (typeof v === "string" && !v.trim()) ? null : v);

/** The copy's kind by its first bytes (never by its name or the browser's type). */
function kindOf(b: Uint8Array): { ext: string; contentType: string } | null {
  const at = (sig: number[]) => sig.every((x, i) => b[i] === x);
  if (at([0x25, 0x50, 0x44, 0x46, 0x2d])) return { ext: "pdf", contentType: "application/pdf" };   // %PDF-
  if (at([0xff, 0xd8, 0xff])) return { ext: "jpg", contentType: "image/jpeg" };
  if (at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: "png", contentType: "image/png" };
  return null;
}

/** The body checked: each refusal is 422 naming its field (PF-28 part 3b; was 400); an unknown field (a full `documentNumber`) is refused, never ignored. */
function parse(body: Record<string, unknown>) {
  for (const k of Object.keys(body)) if (!FIELDS.has(k)) bad(k, k === "documentNumber" ? "Send only the last 4 characters of the document number (documentNumberLast4)." : `${k} is not a field of an identity check.`);
  const method = oneOf(body.method, METHODS, "method", "The method");
  const md = text(body.methodDetail);
  // Characters as the database counts them (code points, break B-8), not UTF-16 units.
  if (md !== null && (typeof md !== "string" || [...md.trim()].length > 500)) bad("methodDetail", "The note is text, at most 500 characters.");
  const methodDetail = md === null ? null : (md as string).trim();
  if (methodDetail !== null && !oneLine(methodDetail)) bad("methodDetail", "The note is one line of visible text: no line break, tab or hidden character.");
  if (methodDetail !== null && looksLikeNumber(methodDetail)) bad("methodDetail", "The note says how the check was done; it never holds a document number (at most 5 digits in all).");
  if (method === "OTHER" && methodDetail === null) bad("methodDetail", "Say what the other method was.");
  const dt = text(body.documentType), country = text(body.issuingCountry), last4 = text(body.documentNumberLast4), expiry = text(body.documentExpiry);
  const documentType = dt === null ? null : oneOf(dt, DOCUMENT_TYPES, "documentType", "The document type");
  let issuingCountry: string | null = null, documentNumberLast4: string | null = null, documentExpiry: Date | null = null;
  if (country !== null) {
    if (typeof country !== "string" || !ISO_ALPHA2.has(country.trim().toUpperCase())) bad("issuingCountry", "The issuing country is an ISO 3166-1 two-letter code (CA, IN, …).");
    issuingCountry = (country as string).trim().toUpperCase();
  }
  if (last4 !== null) {
    if (typeof last4 !== "string" || !/^[A-Za-z0-9]{4}$/.test(last4.trim())) bad("documentNumberLast4", "Only the last 4 characters of the document number (letters and digits), never the full number.");
    documentNumberLast4 = (last4 as string).trim().toUpperCase();
  }
  if (expiry !== null) {
    const d = typeof expiry === "string" ? expiry.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)) || new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d || d < "1900-01-01" || d > "2199-12-31")
      bad("documentExpiry", "The expiry is a real date as YYYY-MM-DD.");
    documentExpiry = new Date(`${d}T00:00:00Z`);
  }
  const named = [documentType, issuingCountry, documentNumberLast4].filter((x) => x !== null).length;
  if (named !== 0 && named !== 3) bad(documentType === null ? "documentType" : issuingCountry === null ? "issuingCountry" : "documentNumberLast4", "A document is named by its type, issuing country and last 4 characters together.");
  if (named === 0 && documentExpiry) bad("documentType", "An expiry needs the document it belongs to.");
  if (method === "DOCUMENT_COPY" && documentType === null) bad("documentType", "A check by document copy names the document.");
  // Multipart sends a repeated field as a list, once as text; JSON sends a list. A comma list is accepted too.
  const raw = Array.isArray(body.details) ? body.details : body.details === undefined ? [] : [body.details];
  const details = raw.flatMap((d) => (typeof d === "string" ? d.split(",").map((x) => x.trim()) : [d]));   // a comma list in any part (break B-8)
  if (!details.length) bad("details", "Name at least one corroborated detail (NAME, HOME_ADDRESS, PHONE, EMAIL, BUSINESS_DETAILS).");
  for (const d of details) oneOf(d, DETAILS, "details", "Each corroborated detail");
  if (new Set(details).size !== details.length) bad("details", "Each detail once.");
  return { method, methodDetail, documentType, issuingCountry, documentExpiry, documentNumberLast4, details: details as (typeof DETAILS)[number][] };
}

export class IdentityChecks {
  constructor(private readonly db: PrismaClient, private readonly files: FilesPort, private readonly clock: Clock, private readonly audit: AuditPort<Tx> = auditEvent) {}

  /** The person, if the reader may see them (firm, then the leads' own-versus-all rule); 404 otherwise. */
  async person(ctx: StaffContext, personId: string) {
    if (typeof personId !== "string" || !UUID.test(personId)) return notFound();
    const p = await this.db.foPerson.findFirst({ where: firmScope(ctx.firmId, { id: personId.toLowerCase() }), select: { id: true } });
    if (!p) return notFound();
    const vis = await visibilityOf(this.db, ctx);
    if (vis.seesAll) return p;
    const active = new Set((await this.db.platformStaff.findMany({ where: firmScope(ctx.firmId, { status: "ACTIVE" as const }), select: { id: true } })).map((s) => s.id));
    const leads = await this.db.foLead.findMany({ where: firmScope(ctx.firmId, { personId: p.id }), select: { ownerStaffId: true } });
    if (leads.some((l) => sees(vis, ctx, l.ownerStaffId && active.has(l.ownerStaffId) ? l.ownerStaffId : null))) return p;
    const own = await this.db.foProspect.count({ where: firmScope(ctx.firmId, { ownerStaffId: ctx.staffId, OR: [{ subjectPersonId: p.id }, { primaryContactPersonId: p.id }] }) });
    if (own) return p;
    // A current contact of a company whose prospect the reader owns, and a retainer's signer the reader sends (its
    // representative, or the prospect's owner): Send warns about them, so the same person can record the check (break B-3).
    const mine = (await this.db.foProspect.findMany({ where: firmScope(ctx.firmId, { ownerStaffId: ctx.staffId, subjectCompanyId: { not: null } }), select: { subjectCompanyId: true } })).map((x) => x.subjectCompanyId!);
    if (mine.length && (await this.db.foCompanyContact.count({ where: firmScope(ctx.firmId, { personId: p.id, validTo: null, companyId: { in: mine } }) }))) return p;
    const signs = await this.db.foRetainer.findMany({ where: firmScope(ctx.firmId, { signerPersonId: p.id }), select: { representativeStaffId: true, prospectId: true } });
    if (signs.some((r) => r.representativeStaffId === ctx.staffId)) return p;
    const pids = signs.map((r) => r.prospectId).filter((x): x is string => !!x);
    if (pids.length && (await this.db.foProspect.count({ where: firmScope(ctx.firmId, { id: { in: pids }, ownerStaffId: ctx.staffId }) }))) return p;
    return notFound();
  }

  /** Records one check (201), with its optional copy in the same insert. Idempotent (STANDARDS §4 [M]; Devin on #2011):
   *  the screen makes one `requestId` (a uuid) per Save and it becomes the check's id and its copy's key, so a replay after
   *  a lost answer returns the saved check (one row, one audit line, one event, one copy), and the same id with other
   *  details is refused (409 REQUEST_REUSED). A correction is a new Save, with a new requestId. */
  async record(ctx: StaffContext, personId: string, body: Record<string, unknown>, copy: CopyUpload | undefined) {
    const p = await this.person(ctx, personId), b = body ?? {};
    const id = typeof b.requestId === "string" && UUID.test(b.requestId.trim()) ? b.requestId.trim().toLowerCase() : bad("requestId", "requestId: a uuid the screen makes once per Save.");
    const c = parse(b);
    const sha = copy ? await sha256Hex(copy.bytes) : null;
    const replay = async () => {
      const had = await this.db.foIdentityCheck.findFirst({ where: firmScope(ctx.firmId, { id }) });
      const same = had && had.personId === p.id && had.checkedBy === ctx.staffId && had.method === c.method && had.methodDetail === c.methodDetail && had.documentType === c.documentType
        && had.issuingCountry === c.issuingCountry && (had.documentExpiry?.toISOString() ?? null) === (c.documentExpiry?.toISOString() ?? null) && had.documentNumberLast4 === c.documentNumberLast4
        && JSON.stringify(had.detailsCorroborated) === JSON.stringify(c.details) && had.copySha256 === sha;
      return same ? (await this.list(ctx, p.id)).checks.find((x) => x.id === id)! : problem(409, "Already used", "This request was already used with other details. Start a new Save.", { code: "REQUEST_REUSED" });
    };
    if (await this.db.foIdentityCheck.findFirst({ where: firmScope(ctx.firmId, { id }), select: { id: true } })) return replay();
    // FO-13i part 2 (QA-510, P-735): an expiry before the firm's today is refused (422), nothing stored; today still records.
    // After the replay lookup (a saved check replayed after the firm's midnight returns that check), before the copy is put.
    if (c.documentExpiry && c.documentExpiry.toISOString().slice(0, 10) < dayIn(await readSetting<string>(this.db, ctx.firmId, TIME_ZONE.key), this.clock.now()))
      problem(422, "Check the details", EXPIRED_DOCUMENT, { code: "INVALID", fields: { documentExpiry: EXPIRED_DOCUMENT } });
    let stored: { key: string; sha256: string } | null = null;
    if (copy) {
      if (copy.size > COPY_MAX_BYTES || copy.bytes.length > COPY_MAX_BYTES) problem(413, "Too large", "The copy is at most 10 MB.", { code: "TOO_LARGE", fields: { copy: "At most 10 MB." } });
      const kind = kindOf(copy.bytes);
      if (!kind) problem(415, "Not a PDF, JPEG or PNG", "The copy must be a PDF, JPEG or PNG file (checked by its content, not its name).", { code: "UNSUPPORTED_TYPE", fields: { copy: "A PDF, JPEG or PNG." } });
      if (c.documentType === null) bad("documentType", "A copy needs the document it is a copy of.");
      try { stored = await this.files.put(ctx.firmId, `identity/${p.id}/${id}.${kind!.ext}`, copy.bytes, kind!.contentType); } catch (e) { if (e instanceof FileKeyTaken) return replay(); throw e; }
    }
    const payload = IdentityCheckedPayload.parse({ checkId: id, personId: p.id, checkedBy: ctx.staffId, method: c.method, details: c.details, copyKept: !!stored });
    try {
      await this.db.$transaction(async (tx) => {
        await tx.foIdentityCheck.create({ data: { id, firmId: ctx.firmId, personId: p.id, method: c.method, methodDetail: c.methodDetail, documentType: c.documentType, issuingCountry: c.issuingCountry,
          documentExpiry: c.documentExpiry, documentNumberLast4: c.documentNumberLast4, detailsCorroborated: c.details, checkedBy: ctx.staffId, copyFileKey: stored?.key ?? null, copySha256: stored?.sha256 ?? null } });
        await this.audit.record(tx, { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action: "identity.checked", entity: "fo_identity_check", entityKey: id,
          summary: `Identity check recorded (${c.method.toLowerCase().replace(/_/g, " ")}; ${c.details.length} detail${c.details.length === 1 ? "" : "s"} corroborated${stored ? "; a copy kept" : ""})`,
          detail: { checkId: id, personId: p.id, method: c.method, details: c.details, copyKept: !!stored },
          before: null, after: { personId: p.id, method: c.method, methodDetail: c.methodDetail ?? null, documentType: c.documentType, issuingCountry: c.issuingCountry ?? null,
            documentExpiry: c.documentExpiry ? c.documentExpiry.toISOString().slice(0, 10) : null, detailsCorroborated: c.details, copyKept: !!stored } });
        await tx.moduleEvent.create({ data: { firmId: ctx.firmId, type: EVENT.IDENTITY_CHECKED, subjectId: id, payload } });   // last (contracts §0.5)
      });
    } catch (e) {
      if (e instanceof HttpException) throw e;
      if ((e as { code?: unknown })?.code === "P2002") return replay();   // a concurrent replay won the id (one row)
      // Only the error code and the constraint's name are logged (FO-5f item 10): a failing row's values are personal data.
      const m = String((e as Error)?.message ?? ""), meta = (e as { meta?: { code?: unknown; constraint?: unknown } })?.meta, nm = /^[A-Za-z0-9_]{1,63}$/;
      const code = [(e as { code?: unknown })?.code, meta?.code].find((x) => typeof x === "string" && nm.test(x)) ?? "none";
      const constraint = [meta?.constraint, /constraint "([A-Za-z0-9_]{1,63})"/.exec(m)?.[1]].find((x) => typeof x === "string" && nm.test(x)) ?? "unknown";
      console.error(`[fo-identity] check not saved: code=${code} constraint=${constraint}`);
      const kept = stored ? " The uploaded copy is not attached to any record and can never be opened." : "";
      if (/not active/.test(m)) problem(409, "Not possible now", `Your account is not active, so the check was not saved.${kept}`, { code: "NOT_ACTIVE", copyReferenced: false });
      // A rule the service missed (the database checks again): a refusal with the constraint's name, never "Try again".
      if ([code, meta?.code].includes("23514") || /violates check constraint/.test(m)) problem(400, "Check the details", `The database refused the check (${constraint}).${kept}`, { code: "INVALID", copyReferenced: false });
      problem(500, "Not saved", `The check was not saved. Try again.${kept}`, { code: "NOT_SAVED", copyReferenced: false });
    }
    return (await this.list(ctx, p.id)).checks.find((x) => x.id === id)!;
  }

  /** The person's checks, newest first: the identity entries of the person's timeline (never the copy's key or a link). */
  async list(ctx: StaffContext, personId: string) {
    const p = await this.person(ctx, personId);
    const rows = await this.db.foIdentityCheck.findMany({ where: firmScope(ctx.firmId, { personId: p.id }), orderBy: [{ checkedAt: "desc" }, { id: "desc" }], include: { checker: { select: { displayName: true } } } });
    return {
      personId: p.id,
      checks: rows.map((r) => ({
        id: r.id, kind: "IDENTITY_CHECK" as const, method: r.method, methodDetail: r.methodDetail, documentType: r.documentType, issuingCountry: r.issuingCountry,
        documentExpiry: r.documentExpiry?.toISOString().slice(0, 10) ?? null, documentNumberLast4: r.documentNumberLast4, details: r.detailsCorroborated,
        hasCopy: r.copyFileKey !== null, checkedBy: { staffId: r.checkedBy, name: r.checker.displayName }, checkedAt: r.checkedAt.toISOString(),
      })),
    };
  }

  /** The copy a download link may name: the check's, of a person the reader sees. */
  async copyKey(ctx: StaffContext, checkId: string): Promise<string> {
    if (typeof checkId !== "string" || !UUID.test(checkId)) return notFound("identity check");
    const r = await this.db.foIdentityCheck.findFirst({ where: firmScope(ctx.firmId, { id: checkId.toLowerCase() }), select: { personId: true, copyFileKey: true } });
    if (!r) return notFound("identity check");
    try { await this.person(ctx, r.personId); } catch (e) { if (e instanceof HttpException && e.getStatus() === 404) notFound("identity check"); throw e; }
    return r.copyFileKey ?? notFound("copy");
  }

  /** A download re-checks the key names a saved check's copy, of a person the reader still sees (404 otherwise). */
  async assertCopyVisible(ctx: StaffContext, key: string): Promise<void> {
    const r = /^identity\/[0-9a-f-]{36}\//.test(key) ? await this.db.foIdentityCheck.findFirst({ where: firmScope(ctx.firmId, { copyFileKey: key }), select: { personId: true } }) : null;
    if (!r) return notFound("file");
    try { await this.person(ctx, r.personId); } catch (e) { if (e instanceof HttpException && e.getStatus() === 404) notFound("file"); throw e; }
  }
}
Injectable()(IdentityChecks);
