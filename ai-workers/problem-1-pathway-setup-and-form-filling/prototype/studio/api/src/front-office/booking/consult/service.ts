// FO-3a part 2a (BACKLOG row FO-3a; brief lead-b-briefs/FO-3a2.md; AG-4-49 rules 1-9, §7, §8, §12; AG-4-50; concept
// fo-3-booking BR-15, BR-16, "Who sees what", Q3): the consult record of an attended booking.
//   * It opens only after Attended (the booking's status COMPLETED, rule 1): not answered, No-show → 409 "Record
//     attendance as Attended first."; a cancelled booking → 409. Attended is read from the booking, never stored (rule 2).
//   * Who: the booking's host, or a holder of agent/booking:edit (§8; concept "Who sees what"). A booking the person may
//     not see at all (not the host, neither the edit nor the list key, or another firm's) is the one 404, as every staff
//     booking read (MODULE.md, FO-3sr); a person who sees it by agent/booking:list without the edit key → 403.
//   * Time spent defaults to the booked length (rule 3); notes; recommended items (1-120 characters, at most 20, rule 5);
//     a quoted fee in minor units with its currency, CAD or USD only (rule 6, X-6). A currency sent without an amount is
//     dropped (the form pre-fills it, rule 6), never stored alone.
//   * PUT replaces the whole record and names the version it read (STANDARDS §4): a first save names none; a stale
//     version, or a "first" save when a record exists, is refused 409 STALE_VERSION and changes nothing.
//   * Attendance changed to No-show later: the record stays and answers attendanceChanged "NO_SHOW" (§12, BR-15); it is
//     not edited again until the attendance is Attended again.
//   * nextSteps (AG-4-50, BR-16), worked out by the server for the viewer (STANDARDS §7): lead → ENGAGE_AND_PREPARE_RETAINER,
//     CLOSE_LEAD; prospect → PREPARE_RETAINER; case (a Follow-up or Case review type, even with a prospect linked) → none. A retainer step needs agent/retainer:draft, CLOSE_LEAD needs
//     agent/prospect:lose. Nothing is sent from the record (rule 3): no mail, no event, only the audit line.
//   * Each save writes one audit line through AuditPort.record(tx, …) with before and after, as facts only (minutes, fee,
//     currency, item count, whether the notes changed): never the notes' text (rule 9; the audit port takes ids only).
import { HttpException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../../ports/audit.ts";
import type { ConsultRecordRead, PartyRef } from "../../../../../ports/consult-record.ts";
import type { StaffContext } from "../../../../../ports/staff.ts";
import { firmScope, notInFirm } from "../../../platform/firm-scope.ts";
import { FIELD_ERROR_STATUS, fieldsOf, parseInput } from "../../../platform/http/input.ts";
import { agreementWarning } from "../consultation-agreement/gate.ts";

type Tx = Prisma.TransactionClient;
export type ConsultPorts = { audit: AuditPort<Tx> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN = 60_000;
const EDIT = "agent/booking:edit", LIST = "agent/booking:list";
const TX = { maxWait: 10_000, timeout: 20_000 };

export const WORDS = {
  notAttended: "Record attendance as Attended first.",
  cancelled: "A cancelled booking has no consult record.",
  noRecord: "No consult record yet.",
  currency: "Choose a currency for the quoted fee.",
  currencyKind: "Choose CAD or USD.",
  stale: "Someone else saved this record. Reload to see their changes.",
  check: "Please check the highlighted details.",
} as const;

export const NEXT_STEPS = ["ENGAGE_AND_PREPARE_RETAINER", "CLOSE_LEAD", "PREPARE_RETAINER"] as const;
export type NextStep = (typeof NEXT_STEPS)[number];

const problem = (status: number, slug: string, title: string, detail: string, extra: Record<string, unknown> = {}) =>
  new HttpException({ type: `https://expatready.local/problems/${slug}`, title, status, detail, ...extra }, status);
const NOT_SAVED = "Consult record not saved";
const forbidden = (key: string) => problem(403, "forbidden", "Not allowed", `This needs the permission ${key}.`, { code: "MISSING_PERMISSION" });

/** The body of a save (strict: an unknown field is refused). A fee over 1,000,000,000 minor units (10 million) is refused
 *  as a technical bound (break: 1e12), not a product choice. */
/** Text as a person typed it: NFC, no NUL or control characters but line breaks and tabs, and its length counted in
 *  characters (code points), as the database counts (break m1, m4). Invisible format marks are dropped before trimming
 *  (break m5), so an item of only a zero-width space is empty. */
const INVISIBLE = /[\u200b\u200e\u200f\u2060-\u2064\ufeff\u00ad]/g;   // never U+200C/U+200D: part of Persian, Hindi and emoji spelling (review n2)
const chars = (s: string) => [...s].length;
const Text = (max: number) => z.string().refine((t) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(t), "no control characters")
  .transform((t) => t.normalize("NFC")).refine((t) => chars(t) <= max, `at most ${max.toLocaleString("en-CA")} characters`);
const Item = z.string().refine((t) => !/[\u0000-\u001f\u007f]/.test(t), "no control characters")
  .transform((t) => t.normalize("NFC").replace(INVISIBLE, "").trim().replace(/\s+/g, " ")).refine((t) => chars(t) <= 120 && /[^\u200c\u200d]/.test(t), "1 to 120 characters");
export const ConsultBody = z.strictObject({
  timeSpentMinutes: z.number().int().min(1).max(1440).optional(),
  notes: Text(10_000).nullable().optional(),
  recommended: z.array(Item).max(20).optional(),
  quotedFeeMinor: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  quotedFeeCurrency: z.enum(["CAD", "USD"], { error: "Choose CAD or USD." }).nullable().optional(),
  /** The version read (STANDARDS §4): needed to replace a record; a first save names none. */
  version: z.number().int().min(1).optional(),
});

type BookingRow = { id: string; firmId: string; staffId: string; personId: string | null; prospectId: string | null; status: string; startsAt: Date; endsAt: Date; type: { purpose: string } };
type RecordRow = { id: string; bookingId: string; version: number; timeSpentMinutes: number; notes: string | null; recommended: string[]; quotedFeeMinor: number | null; quotedFeeCurrency: string | null; createdAt: Date; updatedAt: Date };
const BOOKING_SELECT = { id: true, firmId: true, staffId: true, personId: true, prospectId: true, status: true, startsAt: true, endsAt: true, type: { select: { purpose: true } } } as const;

/** What the record hangs on (ports/consult-record.ts PartyRef): a prospect, a case purpose (client), else a lead. */
export function partyOf(b: { personId: string | null; prospectId: string | null; type: { purpose: string } }): PartyRef | null {
  // A case purpose first: staff create links the person's open prospect to every type, and a case call never offers a
  // retainer (brief DW5; AG-4-49 rule 8; review M2).
  if (["FOLLOW_UP", "CASE_REVIEW"].includes(b.type.purpose)) return b.personId ? { kind: "client", id: b.personId } : null;
  if (b.prospectId) return { kind: "prospect", id: b.prospectId };
  return b.personId ? { kind: "lead", id: b.personId } : null;
}

/** The next-step buttons for this viewer (AG-4-50; BR-16). */
export function nextStepsFor(party: PartyRef | null, keys: readonly string[]): NextStep[] {
  const draft = keys.includes("agent/retainer:draft"), lose = keys.includes("agent/prospect:lose");
  if (party?.kind === "lead") return [...(draft ? ["ENGAGE_AND_PREPARE_RETAINER" as const] : []), ...(lose ? ["CLOSE_LEAD" as const] : [])];
  if (party?.kind === "prospect") return draft ? ["PREPARE_RETAINER"] : [];
  return [];
}

/** One item per name, whatever its case (break m5): the first spelling is kept. */
const oneOfEach = (items: string[]) => { const seen = new Set<string>(); return items.filter((i) => { const k = i.toLocaleLowerCase("en-CA"); return seen.has(k) ? false : (seen.add(k), true); }); };
const bookedMinutes = (b: BookingRow) => Math.max(1, Math.min(1440, Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / MIN)));
const actor = (ctx: StaffContext) => `staff:${ctx.staffId}`;
/** The audit's facts of a record: no text but the currency code. */
const facts = (r: RecordRow | null, prefix: "before" | "after") => ({
  [`${prefix}TimeSpentMinutes`]: r?.timeSpentMinutes ?? null, [`${prefix}QuotedFeeMinor`]: r?.quotedFeeMinor ?? null,
  [`${prefix}QuotedFeeCurrency`]: r?.quotedFeeCurrency ?? null, [`${prefix}RecommendedCount`]: r ? r.recommended.length : null,
});

/** R1.8 (QA-594): the record's values for the audit line's before and after. The notes stay out (free text of any
 *  length; notesChanged says whether they changed). */
const values = (r: RecordRow) => ({ timeSpentMinutes: r.timeSpentMinutes, quotedFeeMinor: r.quotedFeeMinor, quotedFeeCurrency: r.quotedFeeCurrency, recommended: [...r.recommended] });

export class ConsultRecordService {
  constructor(private readonly db: PrismaClient, private readonly ports: ConsultPorts) {}

  async get(ctx: StaffContext, bookingId: string) {
    const b = await this.booking(this.db, ctx, bookingId);
    const r = await this.db.foConsultRecord.findFirst({ where: firmScope(ctx.firmId, { bookingId: b.id }) });
    // FO-3c-warn break F4: before the first save, the no-record answer carries the warning too.
    if (!r) throw problem(404, "not-found", "Not found", WORDS.noRecord, { code: "NO_RECORD", bookedMinutes: bookedMinutes(b), agreementWarning: await agreementWarning(this.db, ctx.firmId, b.id) });
    return { ...this.view(ctx, b, r), agreementWarning: await agreementWarning(this.db, ctx.firmId, b.id) };
  }

  async put(ctx: StaffContext, bookingId: string, body: unknown) {
    // PF-28 part 4 (review M1): a malformed booking id is the one not-found before the body is read.
    if (!UUID.test(String(bookingId))) return notInFirm("booking");
    parseInput(z.unknown(), body);   // review m1: a "__proto__" key is refused as the one rule refuses it
    // A body that is not a JSON object (none, text/plain, an array) is refused, never read as an empty record (break m6).
    if (body === null || typeof body !== "object" || Array.isArray(body)) throw problem(FIELD_ERROR_STATUS, "consult-refused", NOT_SAVED, "Send the record as a JSON object.", { code: "INVALID", fields: { body: "This must be an object." } });
    const parsed = ConsultBody.safeParse(body);
    // PF-28 part 4: a field error is 422 with each field named (an unknown field among them); `issues` as the screen reads them.
    if (!parsed.success) throw problem(FIELD_ERROR_STATUS, "consult-refused", NOT_SAVED, WORDS.check, { code: "INVALID", fields: fieldsOf(parsed.error), issues: parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`) });
    const v = parsed.data;
    const fee = v.quotedFeeMinor ?? null;
    if (fee !== null && !v.quotedFeeCurrency) throw problem(FIELD_ERROR_STATUS, "consult-refused", NOT_SAVED, WORDS.currency, { code: "INVALID", fields: { quotedFeeCurrency: WORDS.currency }, issues: [`quotedFeeCurrency: ${WORDS.currency}`] });
    await this.booking(this.db, ctx, bookingId);   // who may, before the lock (a 404 or 403 takes no lock)
    const { b, saved, warning } = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM fo_booking WHERE firm_id = ${firmScope(ctx.firmId).firmId}::uuid AND id = ${bookingId}::uuid FOR UPDATE`;
      const b = await this.booking(tx, ctx, bookingId);
      if (b.status === "CANCELLED") throw problem(409, "not-active", "Cancelled", WORDS.cancelled, { code: "CANCELLED" });
      if (b.status !== "COMPLETED") throw problem(409, "not-attended", "Not attended", WORDS.notAttended, { code: "NOT_ATTENDED" });
      const before = await tx.foConsultRecord.findFirst({ where: firmScope(ctx.firmId, { bookingId: b.id }) });
      // A save from a form read before someone else's save (or a second "first" save) never overwrites it (review M1).
      if ((before?.version ?? null) !== (v.version ?? null)) throw problem(409, "stale-version", "Changed by someone else", WORDS.stale, { code: "STALE_VERSION", version: before?.version ?? null });
      const data = {
        timeSpentMinutes: v.timeSpentMinutes ?? bookedMinutes(b), notes: v.notes?.trim() ? v.notes : null, recommended: oneOfEach(v.recommended ?? []),
        quotedFeeMinor: fee, quotedFeeCurrency: fee === null ? null : v.quotedFeeCurrency!, updatedBy: actor(ctx),
      };
      const saved = before
        ? await tx.foConsultRecord.update({ where: { id: before.id }, data: { ...data, version: before.version + 1 } })
        : await tx.foConsultRecord.create({ data: { ...data, firmId: ctx.firmId, bookingId: b.id, createdBy: actor(ctx) } });
      await this.ports.audit.record(tx, {
        firmId: ctx.firmId, actor: actor(ctx), action: before ? "booking.consult_record.changed" : "booking.consult_record.created", entity: "fo_consult_record", entityKey: saved.id,
        summary: before ? "Consult record changed." : "Consult record saved.",
        detail: { recordId: saved.id, bookingId: b.id, ...facts(before, "before"), ...facts(saved, "after"), notesChanged: (before?.notes ?? null) !== saved.notes },
        before: before ? values(before) : null, after: values(saved),
      });
      // FO-3c part 2 (AG-4-15 rule 4, the founder's ruling of 24 Nov): saved whatever the agreement's state; an unsigned
      // one is the record's warning, never a refusal; read in the transaction, so a failed read saves nothing (break F3).
      return { b, saved, warning: await agreementWarning(tx, ctx.firmId, b.id) };
    }, TX);
    return { ...this.view(ctx, b, saved), agreementWarning: warning };
  }

  /** The adapter's read (ports/consult-record.ts): the firm's record by its id, or null. */
  async read(db: Tx | PrismaClient, firmId: string, recordId: string): Promise<ConsultRecordRead | null> {
    if (!UUID.test(String(recordId)) || !UUID.test(String(firmId))) return null;   // never thrown (the contract, break m7)
    const r = await db.foConsultRecord.findFirst({ where: firmScope(firmId, { id: recordId }), include: { booking: { select: BOOKING_SELECT } } });
    if (!r) return null;
    return {
      recordId: r.id, bookingId: r.bookingId, partyRef: partyOf(r.booking), recommended: [...r.recommended],
      quotedFee: r.quotedFeeMinor === null || !r.quotedFeeCurrency ? null : { amountMinor: r.quotedFeeMinor, currency: r.quotedFeeCurrency },
    };
  }

  /** The booking, if this person may work its consult record (see the head comment). */
  private async booking(db: Tx | PrismaClient, ctx: StaffContext, bookingId: string): Promise<BookingRow> {
    if (!UUID.test(String(bookingId))) return notInFirm("booking");
    const b = await db.foBooking.findFirst({ where: firmScope(ctx.firmId, { id: bookingId }), select: BOOKING_SELECT });
    if (!b) return notInFirm("booking");
    if (b.staffId === ctx.staffId || ctx.keys.includes(EDIT)) return b;
    if (ctx.keys.includes(LIST)) throw forbidden(EDIT);
    return notInFirm("booking");
  }

  private view(ctx: StaffContext, b: BookingRow, r: RecordRow) {
    const party = partyOf(b);
    return {
      id: r.id, bookingId: r.bookingId, version: r.version, timeSpentMinutes: r.timeSpentMinutes, bookedMinutes: bookedMinutes(b), notes: r.notes, recommended: [...r.recommended],
      quotedFee: r.quotedFeeMinor === null || !r.quotedFeeCurrency ? null : { amountMinor: r.quotedFeeMinor, currency: r.quotedFeeCurrency },
      attendanceChanged: b.status === "NO_SHOW" ? ("NO_SHOW" as const) : null,
      partyRef: party, nextSteps: b.status === "COMPLETED" ? nextStepsFor(party, ctx.keys) : [],
      createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
    };
  }
}
