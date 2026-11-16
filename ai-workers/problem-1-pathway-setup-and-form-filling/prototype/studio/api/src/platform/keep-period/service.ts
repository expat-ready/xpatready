// AUD-5 part 1 (R1.105; SA-11-33, SA-11-14, BR-7): the firm's own number for closed client files and the read of the
// keep-period table. The key legal.closed_client_files_years is registered here (whole years 1-50, default not set:
// SA-11-33 gives no default); only agent/legal-settings:manage changes it (Owner, PF-3 migration). A number below the
// College's 6 years (Client File Management Regulation 2021-001 s. 7.2, read 16 Nov 2026; Unconfirmed: no counsel) is
// allowed with a warning and a typed reason, both on the setting's audit line (Build Lead C's ruling). It is a reminder,
// never a lock: nothing is deleted automatically in Release 1 (BR-7). The firm is always the session's (PF-4's guard),
// never the request's. KeepPeriods is KeepPeriodPort's real adapter (CS-D6 reads forFirm; part 2 builds check()).
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { Db } from "../../core.ts";
import {
  ACTIVITY_LOG_WORDS, COLLEGE_CITATION, COLLEGE_CLIENT_FILE_YEARS, COLLEGE_WARNING, COLLEGE_WORDS, ClosedClientFilesYears, FIRM_SETTING, KEEP_PERIODS, KeepCheckNotBuilt, NO_COUNSEL,
  type FirmKeepPeriod, type KeepCheckInput, type KeepCheckResult, type KeepPeriodPort,
} from "../../../../ports/keep-period.ts";
import { actorWord, platformAuditWorkspaceId } from "../identity/audit.ts";
import { problem, type StaffContext } from "../identity/keys.ts";
import { readSetting, registerSetting, writeSetting } from "../settings.ts";

type Tx = Prisma.TransactionClient;
export const LEGAL_SETTINGS_KEY = "agent/legal-settings:manage";

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

const SaveBody = z.strictObject({ years: z.unknown(), reason: z.unknown().optional() });
const REASON_MAX = 500;

@Injectable()
export class KeepPeriods implements KeepPeriodPort<Tx> {
  constructor(@Inject(Db) private readonly db: PrismaClient) {}

  async forFirm(firmId: string): Promise<FirmKeepPeriod> {
    const years = await readSetting<number | null>(this.db, firmId, CLOSED_CLIENT_FILES.key);
    return years === null ? { closedClientFilesYears: null, source: "not set" } : { closedClientFilesYears: years, source: "firm setting" };
  }

  /** AUD-5 part 2 (after PF-21b). */
  async check(_tx: Tx, _input: KeepCheckInput): Promise<KeepCheckResult> { throw new KeepCheckNotBuilt(); }

  /** GET /api/platform/keep-periods: the table in plain words and the firm's own number (read-only for most staff). */
  async read(s: StaffContext) {
    const firm = await this.forFirm(s.firmId), y = firm.closedClientFilesYears;
    return {
      activityLog: ACTIVITY_LOG_WORDS,
      closedClientFiles: {
        years: y, source: firm.source, canChange: s.keys.includes(LEGAL_SETTINGS_KEY),
        words: y === null ? "Not set: your firm has not chosen how long to keep closed client files." : `Your firm keeps closed client files for ${y} year${y === 1 ? "" : "s"} after closing. This is a reminder, not a lock: nothing is deleted automatically.`,
        warning: y !== null && y < COLLEGE_CLIENT_FILE_YEARS ? COLLEGE_WARNING.replace(" Give a reason to save it.", "") : null,
      },
      college: { words: COLLEGE_WORDS, years: COLLEGE_CLIENT_FILE_YEARS, ...COLLEGE_CITATION, unconfirmed: NO_COUNSEL },
      periods: KEEP_PERIODS.map((r) => ({ class: r.class, years: r.years === FIRM_SETTING ? y : r.years, firmSetting: r.years === FIRM_SETTING, kind: r.kind, from: r.from, words: r.words, sources: r.sources, ...(r.unconfirmed ? { unconfirmed: r.unconfirmed } : {}) })),
    };
  }

  /** PUT /api/platform/keep-periods/closed-client-files { years, reason? }: whole years 1-50; below the College's 6 a
   *  typed reason is needed, and the warning and the reason go on the audit line. */
  async save(s: StaffContext, body: unknown) {
    const b = SaveBody.safeParse(body ?? {});
    if (!b.success) problem(400, "Not saved", "Send the number of years (and a reason when it is below 6); nothing else.", { code: "INVALID_BODY" });
    const years = b.data.years;
    if (typeof years !== "number" || !ClosedClientFilesYears.safeParse(years).success) problem(400, "Not saved", "Enter a whole number of years from 1 to 50.", { code: "INVALID_YEARS" });
    const below = years < COLLEGE_CLIENT_FILE_YEARS;
    const reason = typeof b.data.reason === "string" ? b.data.reason.trim() : "";
    if (b.data.reason !== undefined && typeof b.data.reason !== "string") problem(400, "Not saved", "The reason is a sentence of text.", { code: "INVALID_REASON" });
    if (reason.length > REASON_MAX) problem(400, "Not saved", `Keep the reason to ${REASON_MAX} characters.`, { code: "INVALID_REASON" });
    if (below && !reason) problem(400, "A reason is needed", COLLEGE_WARNING, { code: "REASON_NEEDED", warning: COLLEGE_WARNING });
    await writeSetting(this.db, {
      firmId: s.firmId, key: CLOSED_CLIENT_FILES.key, value: years, by: actorWord(s.staffId), workspaceId: await platformAuditWorkspaceId(this.db),
      ...(below ? { reason: `Warning shown: ${COLLEGE_WARNING.replace(" Give a reason to save it.", "")} Reason given: ${reason}` } : {}),
    });
    return { ...(await this.read(s)).closedClientFiles, saved: true };
  }
}
