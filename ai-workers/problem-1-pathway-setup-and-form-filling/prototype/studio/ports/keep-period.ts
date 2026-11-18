// AUD-5 part 1 (map row 105; R1.105): keep periods as data. One typed table, KEEP_PERIODS, one row per class of record:
// how long it is kept, whether that is a floor in code, the firm's own reminder or a reference only, when the clock
// starts, and where the number comes from. The firm's own number for closed client files is a firm setting
// (api/src/platform/keep-period/service.ts); KeepPeriodPort.forFirm reads it, and CS-D6 reads it from here (no key of its
// own). check() is declared here and built in part 2 (after PF-21b's LegalHoldPort), in BR-7's order: hold, floor, reminder.
// Sources (SA-11-14, SA-11-33, SA-11 BR-6/BR-7, SA4-D18, NFR5-08; the College's Client File Management Regulation
// 2021-001 s. 7.2, read at source 16 Nov 2026 by Build Lead C). Legal points: Unconfirmed: no counsel.
// This folder imports only zod and its own files (case-side contract v0.1 §1 rule 3).
import { z } from "zod";

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

/** A firm id: the same lenient uuid form firmScope accepts (api/src/platform/firm-scope.ts). */
const FirmId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "a firm id (uuid)");

/** The firm's own number of years for closed client files (whole years 1-50), or null when the firm has not set one. */
export const ClosedClientFilesYears = z.number().int().min(1).max(50);
export type FirmKeepPeriod = { closedClientFilesYears: number | null; source: "firm setting" | "not set" };

export type KeepCheckInput = { firmId: string; class: KeepClass; startedAt: Date; subject: string };
export type KeepCheckResult =
  | { verdict: "HELD"; reason: string }
  | { verdict: "FLOOR"; until: Date }
  | { verdict: "WARN"; until: Date }
  | { verdict: "OK" };

/** check() is AUD-5 part 2 (after PF-21b): until then it refuses, so no caller can take a silent OK. */
export class KeepCheckNotBuilt extends Error {
  constructor() { super("KeepPeriodPort.check is built in AUD-5 part 2 (after PF-21b's LegalHoldPort); nothing may be deleted on it yet"); this.name = "KeepCheckNotBuilt"; }
}

/** The port. `Tx` is the caller's transaction (part 2's check runs inside it). */
export interface KeepPeriodPort<Tx = unknown> {
  /** The firm's own number for closed client files; `null` with "not set" when it has none (SA-11-33: no default). */
  forFirm(firmId: string): Promise<FirmKeepPeriod>;
  /** Part 2: HELD | FLOOR | WARN | OK in BR-7's order. Part 1 throws KeepCheckNotBuilt. */
  check(tx: Tx, input: KeepCheckInput): Promise<KeepCheckResult>;
}

export type FakeKeepPeriods = KeepPeriodPort<unknown> & {
  /** Sets (or, with null, clears) a firm's number, as the firm's Owner would. */
  set(firmId: string, years: number | null): void;
};

/** The fake: the same answers as the real adapter, held in memory. */
export function fakeKeepPeriods(initial: Record<string, number | null> = {}): FakeKeepPeriods {
  const years = new Map<string, number>();
  const set = (firmId: string, y: number | null) => {
    const id = FirmId.parse(firmId).toLowerCase();
    if (y === null) years.delete(id); else years.set(id, ClosedClientFilesYears.parse(y));
  };
  for (const [f, y] of Object.entries(initial)) set(f, y);
  return {
    set,
    async forFirm(firmId) {
      const y = years.get(FirmId.parse(firmId).toLowerCase());
      return y === undefined ? { closedClientFilesYears: null, source: "not set" } : { closedClientFilesYears: y, source: "firm setting" };
    },
    async check() { throw new KeepCheckNotBuilt(); },
  };
}
