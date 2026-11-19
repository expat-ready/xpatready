// AUD-5 part 1 (map row 105; R1.105): keep periods as data. One typed table, KEEP_PERIODS, one row per class of record:
// how long it is kept, whether that is a floor in code, the firm's own reminder or a reference only, when the clock
// starts, and where the number comes from. The firm's own number for closed client files is a firm setting
// (api/src/platform/keep-period/service.ts); KeepPeriodPort.forFirm reads it, and CS-D6 reads it from here (no key of its
// own). check() is declared here and built in part 2 (after PF-21b's LegalHoldPort), in BR-7's order: hold, floor, reminder.
// Sources (SA-11-14, SA-11-33, SA-11 BR-6/BR-7, SA4-D18, NFR5-08; the College's Client File Management Regulation
// 2021-001 s. 7.2, read at source 16 Nov 2026 by Build Lead C). Legal points: Unconfirmed: no counsel.
// This folder imports only zod and its own files (case-side contract v0.1 §1 rule 3).
import { z } from "zod";
import { LEGAL_HOLD_CATEGORY } from "./legal-hold.ts";

/** The firm's own number, not a number in code (SA-11-33: "Keep closed client files for ___ years"). */
export const FIRM_SETTING = "FIRM_SETTING" as const;

export const KeepClass = z.enum(["activity_log", "our_staff_audit", "our_billing", "breach_record", "client_financial", "closed_client_file", "college_client_file"]);
export type KeepClass = z.infer<typeof KeepClass>;
/** FLOOR: nothing deletes it sooner (in code, BR-6). REMINDER: the firm's own number, a warning with a reason, never a
 *  lock (SA-11-33, BR-7). REFERENCE: shown beside the firm's setting as guidance, never used by check(). */
export const KeepKind = z.enum(["FLOOR", "REMINDER", "REFERENCE"]);
export type KeepKind = z.infer<typeof KeepKind>;
/** When the period starts: the file's closing, the end of the fiscal year the record relates to, or the record's date. */
export const KeepFrom = z.enum(["closedAt", "fiscalYearEnd", "createdAt"]);

const Citation = z.strictObject({
  document: z.string().min(1), version: z.string().min(1), section: z.string().min(1), page: z.string().min(1),
  quote: z.string().min(1), url: z.string().url(), read: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), readBy: z.string().min(1),
});

export const KeepPeriodRow = z.strictObject({
  class: KeepClass,
  years: z.union([z.number().int().min(1).max(50), z.literal(FIRM_SETTING)]),
  kind: KeepKind,
  from: KeepFrom,
  /** Requirement ids (and decisions) the number comes from; never empty. */
  sources: z.array(z.string().min(1)).min(1),
  /** One plain sentence a person reads (never "legal obligation" or "required by law", SA-11-33). */
  words: z.string().min(1),
  citation: Citation.optional(),
  unconfirmed: z.string().optional(),
});
export type KeepPeriodRow = z.infer<typeof KeepPeriodRow>;

/** The whole activity log: one number, no firm setting, nothing in the product deletes an audit entry (SA-11-14, BR-6).
 *  AUD-2's retention reads this constant. */
export const ACTIVITY_LOG_YEARS = 7;
/** SA-11-14's sentence, word for word. */
export const ACTIVITY_LOG_WORDS = "Your activity log is kept for 7 years for security.";

/** The College's rule, read at its source (P-170). A reference only: never the firm's default, never a floor, never read
 *  by check() (SA-11-33, BR-7; Build Lead C's ruling, AUD-5 part 1 brief). */
export const COLLEGE_CLIENT_FILE_YEARS = 6;
export const COLLEGE_CITATION = {
  document: "College of Immigration and Citizenship Consultants, Client File Management Regulation",
  version: "2021-001 (approved by the Board of Directors November 17, 2021)",
  section: "s. 7.2",
  page: "page 7 of 9",
  quote: "A Client File shall be retained in a secure and accessible location for a minimum of six (6) years after the File has been closed.",
  url: "https://college-ic.ca/ICCRC/Assets/Documents/Regulations/Client%20File%20Management%20Regulation.pdf",
  read: "2026-11-16",
  readBy: "Build Lead C",
} as const;
export const COLLEGE_WORDS = "The College's rule: at least 6 years after closing (Client File Management Regulation s. 7.2)";
/** The warning a firm number below the College's 6 years carries (SA-11-33's "a warning and a reason"). */
export const COLLEGE_WARNING = "This is less than the College's rule of at least 6 years after a file is closed (Client File Management Regulation s. 7.2). Give a reason to save it.";
export const NO_COUNSEL = "Unconfirmed: no counsel";

export const KEEP_PERIODS: readonly KeepPeriodRow[] = Object.freeze(z.array(KeepPeriodRow).parse([
  { class: "activity_log", years: ACTIVITY_LOG_YEARS, kind: "FLOOR", from: "createdAt", sources: ["SA-11-14", "SA-11 BR-6"], words: ACTIVITY_LOG_WORDS },
  { class: "our_staff_audit", years: 7, kind: "FLOOR", from: "createdAt", sources: ["SA-11-14"], words: "Our own staff's activity log is kept for 7 years for security." },
  { class: "our_billing", years: 6, kind: "FLOOR", from: "fiscalYearEnd", sources: ["SA4-D18"], words: "Our billing records are kept for 6 years after the end of the fiscal year they relate to.", unconfirmed: NO_COUNSEL },
  // SA-11-14 (the newer text) says 7 years for breach records where NFR5-08 says at least 2: the newer number is used.
  { class: "breach_record", years: 7, kind: "FLOOR", from: "createdAt", sources: ["SA-11-14", "NFR5-08"], words: "Records of a data breach are kept for 7 years." },
  { class: "client_financial", years: 7, kind: "FLOOR", from: "createdAt", sources: ["NFR5-08", "SA-11 BR-6", "SA-11-33"], words: "Trust entries, receipts, refunds, credit notes and write-offs are kept for 7 years." },
  { class: "closed_client_file", years: FIRM_SETTING, kind: "REMINDER", from: "closedAt", sources: ["SA-11-33", "SA-11 BR-7", "SA-11 BR-15"], words: "Your firm sets how long it keeps closed client files. This is a reminder, not a lock: nothing is deleted automatically." },
  { class: "college_client_file", years: COLLEGE_CLIENT_FILE_YEARS, kind: "REFERENCE", from: "closedAt", sources: ["College Client File Management Regulation 2021-001 s. 7.2", "P-607 S3 Q10"], words: COLLEGE_WORDS, citation: COLLEGE_CITATION, unconfirmed: NO_COUNSEL },
]).map((r) => Object.freeze(r)));

/** The rows check() may use (part 2): every row but a REFERENCE row, so the College's number never decides anything. */
export const checkableRows = (): readonly KeepPeriodRow[] => KEEP_PERIODS.filter((r) => r.kind !== "REFERENCE");


/** The firm's own number of years for closed client files (whole years 1-50), or null when the firm has not set one. */
export const ClosedClientFilesYears = z.number().int().min(1).max(50);
export type FirmKeepPeriod = { closedClientFilesYears: number | null; source: "firm setting" | "not set" };

/** A firm id (and a case or person id): the same lenient uuid form firmScope accepts (api/src/platform/firm-scope.ts). */
const FirmId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "a firm id (uuid)");

/** A port with no LegalHoldPort wired cannot check a delete: it refuses, so no caller can take a silent OK (part 1's rule,
 *  kept: the hold always comes first, BR-7). */
export class KeepCheckNotBuilt extends Error {
  constructor() { super("KeepPeriodPort.check has no legal-hold check wired; nothing may be deleted on it"); this.name = "KeepCheckNotBuilt"; }
}

/** What a deleter is about to delete (part 2), mapped to LegalHoldPort's HoldSubject kinds by subjectsFor():
 *  CASE (a case or client file, by its case id), PERSON (a person record, SA-11-40) or RECORD (a record that names no case
 *  or person: held only by a FIRM hold or a DATE_RANGE hold over its date). */
export const KeepSubject = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("CASE"), id: FirmId }),
  z.strictObject({ kind: z.literal("PERSON"), id: FirmId }),
  z.strictObject({ kind: z.literal("RECORD"), id: z.string().trim().min(1).max(200) }),
]);
export type KeepSubject = z.infer<typeof KeepSubject>;

/** Which subject kinds each class's records have. A subject of another kind (or a REFERENCE class) has no hold check and
 *  is refused in words, never passed as OK. A closed client file is a case (its id); trust entries and receipts belong
 *  to a case or a client; our own records (billing, breaches, staff lines) name no case; an activity line may. */
export const SUBJECT_KINDS: Readonly<Record<KeepClass, readonly KeepSubject["kind"][]>> = Object.freeze({
  activity_log: ["RECORD", "CASE", "PERSON"], our_staff_audit: ["RECORD"], our_billing: ["RECORD"], breach_record: ["RECORD"],
  client_financial: ["CASE", "PERSON"], closed_client_file: ["CASE", "PERSON"], college_client_file: [],
});

/** The input. The firm is the caller's session firm (or the job's firm scope), never one taken from a request: a door
 *  passes `s.firmId`, and KeepPeriods.checkFor takes the session and refuses a body that names a firm. */
/** A real date between 1900 and 9999 (a far-future date would overflow the period's end into "no date": break m1). */
const RealDate = z.date().refine((d) => !Number.isNaN(d.getTime()) && d.getUTCFullYear() >= 1900 && d.getUTCFullYear() <= 9999, "a real date between 1900 and 9999");
/** `subject`: every case and person the record belongs to (a trust entry of a case and its client names both: break M3);
 *  `recordDates`: the record's own dates a date-range hold may name (an invoice's date; for a whole file, the date of every dated
 *  record it removes: LegalHoldPort's DATE subject is a point, so a file's opened and closed dates alone miss a hold
 *  inside its life),
 *  never only the date its keep period starts from (break M1). */
export const KeepCheckInput = z.strictObject({
  firmId: FirmId, class: KeepClass, startedAt: RealDate,
  subject: z.union([KeepSubject, z.array(KeepSubject).min(1).max(50)]),
  recordDates: z.array(RealDate).min(1, "name the record's own date (a date-range hold is matched on it)").max(50),
});
/** The type also takes part 1's placeholder shape (a bare string subject, no recordDates), still used by part 1's
 *  contract case for an unwired port, so it compiles; check() refuses that shape at run time (INVALID_INPUT). */
export type KeepCheckInput = Omit<z.input<typeof KeepCheckInput>, "subject" | "recordDates"> & { subject: z.input<typeof KeepCheckInput>["subject"] | string; recordDates?: Date[] };

/** One matching legal hold, as LegalHoldPort reports it (only what a person needs to read). */
export type KeepHold = { holdId: string; reason: string; placedBy: string; placedAt: Date };
export type KeepCheckResult =
  /** Under a legal hold: every matching hold's reason, oldest first (BR-7: a hold wins for every class). */
  | { verdict: "HELD"; reasons: string[]; holds: KeepHold[]; words: string }
  /** Inside a floor: refused; nothing deletes it before `until` (BR-6). */
  | { verdict: "FLOOR"; until: Date; words: string }
  /** Inside the firm's own reminder: the delete goes ahead only with a reason, written on its audit line (BR-7, BR-8). */
  | { verdict: "WARN"; until: Date; words: string }
  | { verdict: "OK" };

/** A check the port refuses in words: an unknown class, a subject with no hold check, a firm id that is not one. */
export class KeepCheckRefused extends Error {
  constructor(readonly code: "UNKNOWN_CLASS" | "NO_HOLD_CHECK" | "INVALID_INPUT", message: string) { super(message); this.name = "KeepCheckRefused"; }
}

/** The subset of LegalHoldPort check() calls (ports/legal-hold.ts; the shape it is called with). */
export type HoldSubjectOut = { kind: "FIRM" } | { kind: "CASE"; id: string } | { kind: "PERSON"; id: string } | { kind: "CATEGORY"; category: (typeof LEGAL_HOLD_CATEGORY)[number] } | { kind: "DATE"; at: Date };
export type HoldsForCheck<Tx> = { isHeld(tx: Tx, firmId: string, subjects: ReadonlyArray<HoldSubjectOut>): Promise<{ held: false } | { held: true; holds: KeepHold[] }> };

/** Parses the input and maps it to hold subjects: every record is its firm's (FIRM) and has dates (DATE: each of its own
 *  dates and the date its period starts from); each case adds CASE, each person PERSON; a whole client file is every
 *  case-side category (documents, answers, notes, tasks, files: break M2). A RECORD id never stands for a case or person:
 *  a record that belongs to one names it as CASE or PERSON. */
export function subjectsFor(raw: unknown): { input: z.output<typeof KeepCheckInput>; row: KeepPeriodRow; subjects: HoldSubjectOut[] } {
  if (raw && typeof raw === "object" && "class" in raw && !KeepClass.safeParse((raw as { class: unknown }).class).success) throw new KeepCheckRefused("UNKNOWN_CLASS", "This record type is not in the keep-period table, so it cannot be deleted.");
  const p = KeepCheckInput.safeParse(raw);
  if (!p.success) throw new KeepCheckRefused("INVALID_INPUT", "The delete check needs your firm, the record type, the date its keep period starts, the record's own dates and what is deleted.");
  const input = p.data, row = KEEP_PERIODS.find((r) => r.class === input.class)!;
  const named = Array.isArray(input.subject) ? input.subject : [input.subject];
  if (row.kind === "REFERENCE" || !named.every((x) => SUBJECT_KINDS[input.class].includes(x.kind))) throw new KeepCheckRefused("NO_HOLD_CHECK", "This record type has no hold check yet, so it cannot be deleted.");
  if (input.class === "closed_client_file" && !named.some((x) => x.kind === "CASE")) throw new KeepCheckRefused("NO_HOLD_CHECK", "This record type has no hold check yet, so it cannot be deleted.");
  const subjects: HoldSubjectOut[] = [{ kind: "FIRM" }, ...[input.startedAt, ...input.recordDates].map((at) => ({ kind: "DATE" as const, at }))];
  for (const x of named) if (x.kind === "CASE" || x.kind === "PERSON") subjects.push({ kind: x.kind, id: x.id });
  if (input.class === "closed_client_file") for (const category of LEGAL_HOLD_CATEGORY) subjects.push({ kind: "CATEGORY", category });
  return { input, row, subjects };
}

/** `years` whole calendar years after `from` (UTC; 29 Feb rolls to 1 Mar). */
export const addYears = (from: Date, years: number) => { const d = new Date(from.getTime()); d.setUTCFullYear(d.getUTCFullYear() + years); return d; };
const day = (d: Date) => `${d.toISOString().slice(0, 10)} (UTC)`;

/** BR-7's order after the hold: the floor, then the firm's reminder. One rule for every adapter (as answer() is for holds). */
export function decide(row: KeepPeriodRow, startedAt: Date, firmYears: number | null, now: Date): KeepCheckResult {
  if (row.kind === "FLOOR" && typeof row.years === "number") {
    const until = addYears(startedAt, row.years);
    return now < until ? { verdict: "FLOOR", until, words: `This record is kept until ${day(until)} and cannot be deleted before then. ${row.words}${row.unconfirmed ? ` (${row.unconfirmed})` : ""}` } : { verdict: "OK" };
  }
  if (row.kind === "REMINDER" && firmYears !== null) {
    const until = addYears(startedAt, firmYears);
    if (now < until) return { verdict: "WARN", until, words: `Your firm keeps closed client files for ${firmYears} year${firmYears === 1 ? "" : "s"} after closing (until ${day(until)}). Give a reason to delete it now; the reason is recorded.` };
  }
  return { verdict: "OK" };
}

/** The whole check over a hold answer (the hold first, BR-7). */
export function verdictOf(held: { held: false } | { held: true; holds: KeepHold[] }, row: KeepPeriodRow, startedAt: Date, firmYears: number | null, now: Date): KeepCheckResult {
  if (held.held) {
    const holds = held.holds.map(({ holdId, reason, placedBy, placedAt }) => ({ holdId, reason, placedBy, placedAt }));
    return { verdict: "HELD", holds, reasons: holds.map((h) => h.reason), words: `This is under a legal hold and cannot be deleted: ${holds.map((h) => h.reason).join("; ")}.` };
  }
  return decide(row, startedAt, firmYears, now);
}

/** A WARN delete's reason (BR-8): trimmed text with a letter or digit; empty or whitespace only → refused. The deleter
 *  writes the returned reason on its delete's audit line. Any other verdict needs no reason (HELD and FLOOR refuse). */
export function warnReason(result: KeepCheckResult, raw: unknown): string | null {
  if (result.verdict !== "WARN") return null;
  const reason = typeof raw === "string" ? raw.trim().normalize("NFC") : "";
  // A control character (but line breaks and tabs), a direction override or broken text cannot be stored: refused in
  // words, never an audit write that fails (break m3).
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(reason) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(reason)) throw new KeepCheckRefused("INVALID_INPUT", "The reason has characters that cannot be saved: write it as ordinary text.");
  if (!/[\p{L}\p{N}]/u.test(reason.replace(/[\p{Cf}\u115F\u1160\u3164\uFFA0]/gu, ""))) throw new KeepCheckRefused("INVALID_INPUT", "Give a reason to delete this before your firm's keep period ends.");
  if ([...reason].length > 500) throw new KeepCheckRefused("INVALID_INPUT", "Keep the reason to 500 characters.");
  return reason;
}

/** The port. `Tx` is the caller's transaction (part 2's check runs inside it). */
export interface KeepPeriodPort<Tx = unknown> {
  /** The firm's own number for closed client files; `null` with "not set" when it has none (SA-11-33: no default). */
  forFirm(firmId: string): Promise<FirmKeepPeriod>;
  /** HELD | FLOOR | WARN | OK in BR-7's order, inside the caller's open transaction (isHeld takes the shared hold lock
   *  through it, held until the deleter commits; no second transaction). Refuses (KeepCheckRefused) an unknown class or
   *  a subject with no hold check; with no LegalHoldPort wired it throws KeepCheckNotBuilt. */
  check(tx: Tx, input: KeepCheckInput): Promise<KeepCheckResult>;
}

export type FakeKeepPeriods = KeepPeriodPort<unknown> & {
  /** Sets (or, with null, clears) a firm's number, as the firm's Owner would. */
  set(firmId: string, years: number | null): void;
};

/** The fake: the same answers as the real adapter, held in memory. With `opts.holds` (a LegalHoldPort, e.g.
 *  fakeLegalHolds) check() is built; without, it refuses. */
export function fakeKeepPeriods(initial: Record<string, number | null> = {}, opts: { holds?: HoldsForCheck<unknown>; now?: () => Date } = {}): FakeKeepPeriods {
  const years = new Map<string, number>();
  const set = (firmId: string, y: number | null) => {
    const id = FirmId.parse(firmId).toLowerCase();
    if (y === null) years.delete(id); else years.set(id, ClosedClientFilesYears.parse(y));
  };
  for (const [f, y] of Object.entries(initial)) set(f, y);
  const port: FakeKeepPeriods = {
    set,
    async forFirm(firmId) {
      const y = years.get(FirmId.parse(firmId).toLowerCase());
      return y === undefined ? { closedClientFilesYears: null, source: "not set" } : { closedClientFilesYears: y, source: "firm setting" };
    },
    async check() { throw new KeepCheckNotBuilt(); },
  };
  const holds = opts.holds, now = opts.now ?? (() => new Date());
  if (holds) port.check = async (tx, raw) => {
    const { input, row, subjects } = subjectsFor(raw);
    const held = await holds.isHeld(tx, input.firmId, subjects);   // first, under the hold lock (BR-7)
    const firm = held.held || row.kind !== "REMINDER" ? null : (await port.forFirm(input.firmId)).closedClientFilesYears;
    return verdictOf(held, row, input.startedAt, firm, now());
  };
  return port;
}
