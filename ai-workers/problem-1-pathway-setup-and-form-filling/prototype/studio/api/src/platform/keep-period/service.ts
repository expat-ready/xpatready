// AUD-5 part 1 (R1.105; SA-11-33, SA-11-14, BR-7): the firm's own number for closed client files and the read of the
// keep-period table. The key legal.closed_client_files_years is registered here (whole years 1-50, default not set:
// SA-11-33 gives no default); only agent/legal-settings:manage changes it (Owner, PF-3 migration). A number below the
// College's 6 years (Client File Management Regulation 2021-001 s. 7.2, read 16 Nov 2026; Unconfirmed: no counsel) is
// allowed with a warning and a typed reason, both on the setting's audit line (Build Lead C's ruling). It is a reminder,
// never a lock: nothing is deleted automatically in Release 1 (BR-7). The firm is always the session's (PF-4's guard),
// never the request's. KeepPeriods is KeepPeriodPort's real adapter (CS-D6 reads forFirm; part 2 builds check()).
import { Inject, Injectable, Optional } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { FIELD_ERROR_STATUS, fieldsOf } from "../http/input.ts";
import { Db } from "../../core.ts";
import {
  ACTIVITY_LOG_WORDS, COLLEGE_CITATION, COLLEGE_CLIENT_FILE_YEARS, COLLEGE_WARNING, COLLEGE_WORDS, ClosedClientFilesYears, FIRM_SETTING, KEEP_PERIODS, KeepCheckNotBuilt, KeepCheckRefused, NO_COUNSEL,
  subjectsFor, verdictOf, type FirmKeepPeriod, type HoldsForCheck, type KeepCheckInput, type KeepCheckResult, type KeepPeriodPort,
} from "../../../../ports/keep-period.ts";
import { actorWord, platformAuditWorkspaceId } from "../identity/audit.ts";
import { problem, type StaffContext } from "../identity/keys.ts";
import { readSetting, registerSetting, writeSetting } from "../settings.ts";

type Tx = Prisma.TransactionClient;
export const LEGAL_SETTINGS_KEY = "agent/legal-settings:manage";
/** The LegalHoldPort KeepPeriods.check asks first (BR-7). PF-21b part 2 provides the real adapter under this token; until
 *  then nothing is wired and check() refuses (KeepCheckNotBuilt), never a silent OK. */
export const KEEP_CHECK_HOLDS = Symbol("KeepPeriods.holds");
/** The clock check() reads "now" from (the floor's and the reminder's end); a test passes its own. */
export const KEEP_CHECK_NOW = Symbol("KeepPeriods.now");

export const CLOSED_CLIENT_FILES = registerSetting({
  key: "legal.closed_client_files_years", ownerModule: "platform", changePermission: LEGAL_SETTINGS_KEY,
  description: "Keep closed client files for ___ years (SA-11-33): the firm's own number, whole years 1-50; not set by default. A reminder, not a lock: nothing is deleted automatically (BR-7).",
  schema: ClosedClientFilesYears.nullable(), default: null as number | null,
});

/** The seed's actor and reason for Sample setting values (seed-sample-firms.ts). */
export const SAMPLE_SEED_ACTOR = "seed:AUD-5";
export const SAMPLE_SEED_REASON = "Sample value";

/** Writes each Sample value a Sample firm does not have yet, through the settings write path (one audit line each,
 *  P-571 (1)). A value that is there is never changed, so a second run writes nothing. */
export async function seedSampleSettingValues(tx: Tx, firmId: string, values: Record<string, unknown>): Promise<number> {
  let n = 0;
  for (const [key, value] of Object.entries(values)) {
    if (await tx.platformFirmSetting.findFirst({ where: { firmId, key } })) continue;
    await writeSetting(tx, { firmId, key, value, by: SAMPLE_SEED_ACTOR, workspaceId: await platformAuditWorkspaceId(tx), reason: SAMPLE_SEED_REASON });
    n++;
  }
  return n;
}

const SaveBody = z.strictObject({ years: z.unknown().optional(), reason: z.unknown().optional() });   // R1.10 A4: years is checked below with the reason, so both are named at once
const REASON_MAX = 500;
const WARNING_SHORT = COLLEGE_WARNING.replace(" Give a reason to save it.", "");

/** A typed reason: text of at most 500 characters (counted as a person counts them), with no control character
 *  but line breaks and tabs, no broken text, and at least one letter or digit that is seen (an invisible-only "reason" is no reason: break m1).
 *  Empty when none was given. */
function reasonOf(raw: unknown): string {
  if (raw === undefined) return "";
  if (typeof raw !== "string") problem(FIELD_ERROR_STATUS, "Not saved", "The reason is a sentence of text.", { code: "INVALID_REASON", fields: { reason: "This must be text." } });
  const reason = raw.trim();
  // Line breaks and tabs inside a reason are kept (a reason box may have several lines: re-review n2); any other control
  // character, or broken text (a lone surrogate), cannot be stored and is refused in words (break m2).
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(reason) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(reason)) problem(FIELD_ERROR_STATUS, "Not saved", "The reason has characters that cannot be saved: write it as ordinary text.", { code: "INVALID_REASON", fields: { reason: "This has a control character or broken text. Type it again." } });
  if ([...reason].length > REASON_MAX) problem(FIELD_ERROR_STATUS, "Not saved", `Keep the reason to ${REASON_MAX} characters.`, { code: "INVALID_REASON", fields: { reason: `This is too long: at most ${REASON_MAX} characters.` } });
  return /[\p{L}\p{N}]/u.test(reason.replace(/[\p{Cf}\u115F\u1160\u3164\uFFA0]/gu, "")) ? reason : "";   // fillers that draw nothing are not letters
}

/** The firm's closed-file setting as a person reads it. */
function closedFilesView(y: number | null, s: StaffContext) {
  return {
    years: y, source: y === null ? "not set" : "firm setting", canChange: s.keys.includes(LEGAL_SETTINGS_KEY),
    words: y === null ? "Not set: your firm has not chosen how long to keep closed client files." : `Your firm keeps closed client files for ${y} year${y === 1 ? "" : "s"} after closing. This is a reminder, not a lock: nothing is deleted automatically.`,
    warning: y !== null && y < COLLEGE_CLIENT_FILE_YEARS ? WARNING_SHORT : null,
  };
}

@Injectable()
export class KeepPeriods implements KeepPeriodPort<Tx> {
  constructor(
    @Inject(Db) private readonly db: PrismaClient,
    @Optional() @Inject(KEEP_CHECK_HOLDS) private readonly holds?: HoldsForCheck<Tx>,
    @Optional() @Inject(KEEP_CHECK_NOW) private readonly now: () => Date = () => new Date(),
  ) {}

  async forFirm(firmId: string): Promise<FirmKeepPeriod> {
    const years = await readSetting<number | null>(this.db, firmId, CLOSED_CLIENT_FILES.key);
    return years === null ? { closedClientFilesYears: null, source: "not set" } : { closedClientFilesYears: years, source: "firm setting" };
  }

  /** AUD-5 part 2: HELD | FLOOR | WARN | OK in BR-7's order, all inside the deleter's own open transaction `tx`: the hold
   *  first (isHeld takes the shared hold lock through tx, kept until the deleter commits), then the floor, then the firm's
   *  reminder, read through the same tx after the lock (so a setting saved mid-request is read as of that statement, never
   *  from a second transaction). The reminder is never a lock: a setting saved after the check does not undo it (break m2;
   *  SA-11-33 "a reminder, not a lock"). The College's number is never read here (REFERENCE rows are refused by subjectsFor). */
  async check(tx: Tx, input: KeepCheckInput): Promise<KeepCheckResult> { if (!this.holds) { throw new KeepCheckNotBuilt(); }
    if ((tx as unknown) === this.db || typeof (tx as { $connect?: unknown }).$connect === "function") throw new KeepCheckRefused("INVALID_INPUT", "The delete check runs inside the deleter's own transaction, never on the root client.");   // break m4
    const { input: q, row, subjects } = subjectsFor(input);
    const held = await this.holds.isHeld(tx, q.firmId, subjects);
    const firm = held.held || row.kind !== "REMINDER" ? null : await readSetting<number | null>(tx, q.firmId, CLOSED_CLIENT_FILES.key);
    return verdictOf(held, row, q.startedAt, firm, this.now());
  }

  /** The door a deleter calls: the firm is the session's, never the request's. `ask` is built by the deleter from the
   *  STORED record (its class, the date its period starts, its own dates, its case and person), never a request body
   *  passed through: a client choosing the class or the date could pick an OK (review m3). An ask that names a firm is
   *  refused. */
  async checkFor(tx: Tx, s: StaffContext, ask: unknown): Promise<KeepCheckResult> {
    if (ask && typeof ask === "object" && "firmId" in ask) throw new KeepCheckRefused("INVALID_INPUT", "The firm is always your own; a delete check never names one.");
    return this.check(tx, { ...(ask as object), firmId: s.firmId } as KeepCheckInput);
  }

  /** GET /api/platform/keep-periods: the table in plain words and the firm's own number (read-only for most staff). */
  async read(s: StaffContext) {
    const firm = await this.forFirm(s.firmId), y = firm.closedClientFilesYears;
    return {
      activityLog: ACTIVITY_LOG_WORDS,
      closedClientFiles: closedFilesView(y, s),
      college: { words: COLLEGE_WORDS, years: COLLEGE_CLIENT_FILE_YEARS, ...COLLEGE_CITATION, unconfirmed: NO_COUNSEL },
      periods: KEEP_PERIODS.map((r) => ({ class: r.class, years: r.years === FIRM_SETTING ? y : r.years, firmSetting: r.years === FIRM_SETTING, kind: r.kind, from: r.from, words: r.words, sources: r.sources, ...(r.unconfirmed ? { unconfirmed: r.unconfirmed } : {}) })),
    };
  }

  /** PUT /api/platform/keep-periods/closed-client-files { years, reason? }: whole years 1-50; below the College's 6 a
   *  typed reason is needed, and the warning and the reason go on the audit line. A reason given at 6 or more is kept on
   *  the line too (review m4). The answer is built from the value this request saved, never re-read (break m5). */
  async save(s: StaffContext, body: unknown) {
    const b = SaveBody.safeParse(body ?? {});
    if (!b.success) problem(FIELD_ERROR_STATUS, "Not saved", "Send the number of years (and a reason when it is below 6); nothing else.", { code: "INVALID_BODY", fields: fieldsOf(b.error) });   // PF-28 part 2b: 422, fields named
    const years = b.data.years;
    // R1.10 A4: a reason that is not text is named with the years, never hidden behind them (every field that needs a change, at once).
    const badReason = b.data.reason !== undefined && b.data.reason !== null && typeof b.data.reason !== "string";
    const badYears = typeof years !== "number" || !ClosedClientFilesYears.safeParse(years).success;
    if (badReason) problem(FIELD_ERROR_STATUS, "Not saved", badYears ? "Enter a whole number of years from 1 to 50, and the reason as text." : "The reason is a sentence of text.", { code: badYears ? "INVALID_YEARS" : "INVALID_REASON", fields: { ...(badYears ? { years: "A whole number of years from 1 to 50." } : {}), reason: "This must be text." } });
    // R1.10 A2: an over-long reason is named with the years too (reasonOf's own count and words), never hidden behind them.
    const longReason = typeof b.data.reason === "string" && [...b.data.reason.trim()].length > REASON_MAX;
    if (longReason && badYears) problem(FIELD_ERROR_STATUS, "Not saved", `Enter a whole number of years from 1 to 50, and keep the reason to ${REASON_MAX} characters.`, { code: "INVALID_YEARS", fields: { years: "A whole number of years from 1 to 50.", reason: `This is too long: at most ${REASON_MAX} characters.` } });
    if (typeof years !== "number" || !ClosedClientFilesYears.safeParse(years).success) problem(FIELD_ERROR_STATUS, "Not saved", "Enter a whole number of years from 1 to 50.", { code: "INVALID_YEARS", fields: { years: "A whole number of years from 1 to 50." } });
    const below = years < COLLEGE_CLIENT_FILE_YEARS;
    const reason = reasonOf(b.data.reason);
    if (below && !reason) problem(FIELD_ERROR_STATUS, "A reason is needed", COLLEGE_WARNING, { code: "REASON_NEEDED", warning: COLLEGE_WARNING, fields: { reason: "This is required." } });
    const line = [below ? `Below the College's rule: ${WARNING_SHORT}` : "", reason ? `Reason given: ${reason}` : ""].filter(Boolean).join(" ");
    const saved = await writeSetting(this.db, {
      firmId: s.firmId, key: CLOSED_CLIENT_FILES.key, value: years, by: actorWord(s.staffId), workspaceId: await platformAuditWorkspaceId(this.db),
      ...(line ? { reason: line } : {}),
    });
    return { ...closedFilesView(saved.value as number, s), saved: true };
  }
}
