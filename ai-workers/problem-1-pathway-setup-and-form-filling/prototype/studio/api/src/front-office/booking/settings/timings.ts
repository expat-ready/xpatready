// FO-3a1e (FO-3a part 1b-ii; brief lead-b-briefs/FO-3a.md "Firm timings"; AG-4-4, AG-4-5, AG-4-66 rules 1-3, 8, §7, §8,
// §10): the firm's booking timings and the one resolve order.
//   * Six firm values, registered through the settings home (registerSetting; owner module front-office, change key
//     agent/booking-event-type:edit, as rev 16.23 ruled for Timings): reminders [1440, 60] minutes before, shortest
//     notice 240 minutes, window 60 days, gap before 0 and after 10 minutes, self-service up to 240 minutes before. The
//     paid hold and its prompt are not registered (map row 44).
//   * resolveTimings(type, firm): for each timing, the type's own value if set, else the firm's, else the default
//     (rule 2). Pure. Every reader of a type's timings (slots, staff warnings, self-service, the calendar feed, the
//     preview) takes the type through withTimings, so no reader sees an empty timing. The database pads a booking by the
//     same rule (fo_booking_write, 20261121110000_fo3a1e_firm_timings), with the same defaults.
//   * Ranges (§10: whole numbers, not negative; the upper bounds are technical, matching FO-1b's CHECKs): gaps 0-1,440,
//     notice and self-service 0-525,600 minutes, window 1-730 days; reminders one or two distinct offsets of 1-43,200
//     minutes ("No third reminder row", §13; the empty list is not offered: not in the requirement).
import { HttpException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { StaffContext } from "../../../../../ports/staff.ts";
import { firmScope } from "../../../platform/firm-scope.ts";
import { platformAuditWorkspaceId } from "../../../platform/identity/audit.ts";
import { forbidden } from "../../../platform/identity/keys.ts";
import { registerSetting, writeSetting } from "../../../platform/settings.ts";
import { FIELD_ERROR_STATUS, parseInput, plainIssue } from "../../../platform/http/input.ts";

type Db = Prisma.TransactionClient | PrismaClient;
const EDIT = "agent/booking-event-type:edit";

/** A timing's allowed range, in the words a person reads (§10 "refused with the allowed range"). */
const whole = (label: string, min: number, max: number, unit: string) => {
  const words = `${label} must be a whole number of ${unit} from ${min.toLocaleString("en-CA")} to ${max.toLocaleString("en-CA")}.`;
  return z.number({ error: words }).int(words).min(min, words).max(max, words);
};
export const TIMING_RANGES = {
  gapBeforeMinutes: whole("Gap before", 0, 1440, "minutes"),
  gapAfterMinutes: whole("Gap after", 0, 1440, "minutes"),
  minNoticeMinutes: whole("Shortest notice", 0, 525600, "minutes"),
  windowDays: whole("Booking window", 1, 730, "days"),
  selfServiceLimitMinutes: whole("Self-service limit", 0, 525600, "minutes"),
};
const REMINDER_WORDS = "Reminders are one or two different times before the meeting, each a whole number of minutes from 1 to 43,200.";
export const REMINDERS = z.array(z.number({ error: REMINDER_WORDS }).int(REMINDER_WORDS).min(1, REMINDER_WORDS).max(43200, REMINDER_WORDS), { error: REMINDER_WORDS })
  .min(1, REMINDER_WORDS).max(2, REMINDER_WORDS).refine((a) => new Set(a).size === a.length, REMINDER_WORDS);

/** The five timings a booking type may set for itself (empty = the firm's). */
export const TIMING_FIELDS = ["gapBeforeMinutes", "gapAfterMinutes", "minNoticeMinutes", "windowDays", "selfServiceLimitMinutes"] as const;
export type TimingField = (typeof TIMING_FIELDS)[number];
export type Timings = Record<TimingField, number>;
export type FirmTimings = Timings & { reminderOffsetsMinutes: number[] };

const reg = (key: string, description: string, schema: z.ZodType<number>, d: number) =>
  registerSetting({ key, ownerModule: "front-office", changePermission: EDIT, description, schema, default: d });
/** The registered firm values, by the field each one backs. */
export const FIRM_TIMING_SETTINGS = {
  reminderOffsetsMinutes: registerSetting({ key: "front_office.booking_reminder_offsets", ownerModule: "front-office", changePermission: EDIT,
    description: "Booking reminders, in minutes before the meeting (AG-4-66 rule 1): default 24 hours and 1 hour. One or two different offsets.", schema: REMINDERS, default: [1440, 60] }),
  minNoticeMinutes: reg("front_office.booking_min_notice_minutes", "Shortest notice for a booking, in minutes (AG-4-5): default 4 hours.", TIMING_RANGES.minNoticeMinutes, 240),
  windowDays: reg("front_office.booking_window_days", "How many days ahead a booking may be made (AG-4-5): default 60.", TIMING_RANGES.windowDays, 60),
  gapBeforeMinutes: reg("front_office.booking_gap_before_minutes", "Minutes kept free before each booking (AG-4-4): default 0.", TIMING_RANGES.gapBeforeMinutes, 0),
  gapAfterMinutes: reg("front_office.booking_gap_after_minutes", "Minutes kept free after each booking (AG-4-4): default 10.", TIMING_RANGES.gapAfterMinutes, 10),
  selfServiceLimitMinutes: reg("front_office.booking_self_service_minutes", "Up to how many minutes before the meeting a booker may cancel or reschedule online (AG-4-66): default 4 hours.", TIMING_RANGES.selfServiceLimitMinutes, 240),
} as const;
export type FirmTimingField = keyof typeof FIRM_TIMING_SETTINGS;
export const FIRM_TIMING_FIELDS = Object.keys(FIRM_TIMING_SETTINGS) as FirmTimingField[];

/** The defaults (rule 1), read from the registered settings so the two can never differ. */
export const DEFAULT_TIMINGS: FirmTimings = Object.fromEntries(FIRM_TIMING_FIELDS.map((f) => [f, FIRM_TIMING_SETTINGS[f].default])) as FirmTimings;

/** Rule 2: the type's own value if set, else the firm's, else the default. Pure. */
export function resolveTimings(type: Partial<Record<TimingField, number | null>>, firm: Partial<Timings> = {}): Timings {
  return Object.fromEntries(TIMING_FIELDS.map((f) => [f, type[f] ?? firm[f] ?? DEFAULT_TIMINGS[f]])) as Timings;
}

/** A firm's six values (the default where it has none), in one read. A stored value that no longer fits is an error, as
 *  readSetting has it. */
export async function firmTimings(db: Db, firmId: string): Promise<FirmTimings> {
  const keys = FIRM_TIMING_FIELDS.map((f) => FIRM_TIMING_SETTINGS[f].key);
  const rows = await db.platformFirmSetting.findMany({ where: firmScope(firmId, { key: { in: keys } }), select: { key: true, value: true } });
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const out: Record<string, unknown> = {};
  for (const f of FIRM_TIMING_FIELDS) {
    const def = FIRM_TIMING_SETTINGS[f];
    if (!stored.has(def.key)) { out[f] = def.default; continue; }
    const p = (def.schema as z.ZodType<unknown>).safeParse(stored.get(def.key));
    if (!p.success) throw new Error(`firmTimings: the stored value of "${def.key}" no longer fits its schema`);
    out[f] = p.data;
  }
  return out as FirmTimings;
}

export type WithTimings<T> = Omit<T, TimingField> & Timings;
/** A type row with its five timings resolved (the firm's read once). Null stays null, so callers keep their not-found. */
export async function withTimings<T extends Partial<Record<TimingField, number | null>>>(db: Db, firmId: string, type: T): Promise<WithTimings<T>>;
export async function withTimings<T extends Partial<Record<TimingField, number | null>>>(db: Db, firmId: string, type: T | null): Promise<WithTimings<T> | null>;
export async function withTimings<T extends Partial<Record<TimingField, number | null>>>(db: Db, firmId: string, type: T | null): Promise<WithTimings<T> | null> {
  if (!type) return null;
  return { ...type, ...resolveTimings(type, await firmTimings(db, firmId)) };
}

/** AG-4-66 §12: a notice longer than the window offers no times; the editor warns (never refused). */
export const timingWarnings = (t: Timings): string[] =>
  t.minNoticeMinutes > t.windowDays * 24 * 60 ? ["The shortest notice is longer than the booking window, so no times can be offered."] : [];

// ------------------------------------------------------------------------------------------- who may change which (§8)
const CONFIGURE = "agent/booking-event-type:configure-availability";
/** AG-4-4 §8 (C5): gaps, shortest notice and window need …:configure-availability; reminders and the self-service limit
 *  need …:edit. The same split on the firm's Timings and a type's own (the firm screen's key is open in AG-16 §13). */
export const timingKey = (f: FirmTimingField): string => (f === "reminderOffsetsMinutes" || f === "selfServiceLimitMinutes" ? EDIT : CONFIGURE);

// ------------------------------------------------------------------------------------------------- the firm's Timings
const FirmTimingsBody = z.strictObject({
  reminderOffsetsMinutes: REMINDERS.optional(), minNoticeMinutes: TIMING_RANGES.minNoticeMinutes.optional(), windowDays: TIMING_RANGES.windowDays.optional(),
  gapBeforeMinutes: TIMING_RANGES.gapBeforeMinutes.optional(), gapAfterMinutes: TIMING_RANGES.gapAfterMinutes.optional(), selfServiceLimitMinutes: TIMING_RANGES.selfServiceLimitMinutes.optional(),
});

const invalid = (fields: Record<string, string>) => {
  const [first] = Object.entries(fields);
  return new HttpException({ type: "https://expatready.local/problems/invalid", title: "Please check the highlighted details", status: FIELD_ERROR_STATUS, detail: first[1], code: "INVALID", fields,
    issues: Object.entries(fields).map(([f, m]) => `${f}: ${m}`) }, FIELD_ERROR_STATUS);
};

export class FirmTimingsService {
  constructor(private readonly db: PrismaClient) {}

  /** GET booking-timings: the firm's six values (the default where it has none), the defaults, and the warning. */
  async read(ctx: StaffContext) {
    const timings = await firmTimings(this.db, ctx.firmId);
    return { timings, defaults: DEFAULT_TIMINGS, warnings: [...timingWarnings(timings), ...await this.unbookable(timings, ctx.firmId)] };
  }

  /** §12, firm side (review m2): the types the firm's values leave with no times (a type's own notice past the firm's
   *  window, or the reverse), named so the screen can say which. */
  private async unbookable(firm: FirmTimings, firmId: string): Promise<string[]> {
    const types = await this.db.foConsultationType.findMany({ where: firmScope(firmId, { deletedAt: null }), select: { name: true, minNoticeMinutes: true, windowDays: true } });
    const hit = types.filter((t) => (t.minNoticeMinutes !== null || t.windowDays !== null) && timingWarnings(resolveTimings(t, firm)).length).map((t) => t.name);
    return hit.length ? [`With these values ${hit.length === 1 ? "this type has" : "these types have"} no times to offer (its shortest notice is longer than its booking window): ${hit.slice(0, 10).join(", ")}${hit.length > 10 ? " …" : ""}.`] : [];
  }

  /** PUT booking-timings: any of the six; the fields that change are checked against §8's keys; each change goes through
   *  the settings home (one audit line each, before and after), all in one transaction, so a refusal saves nothing. A
   *  change applies to new slots and bookings only (rule 8). */
  async write(ctx: StaffContext, body: unknown) {
    parseInput(z.unknown(), body);   // PF-28 part 4 (review m1): a "__proto__" key is refused as the one rule refuses it
    const r = FirmTimingsBody.safeParse(body ?? {}, { error: plainIssue });   // PF-28 A2: zod's own words never reach a field
    if (!r.success) {
      const fields: Record<string, string> = Object.create(null);   // a key such as "constructor" is a field like any other (break m1)
      for (const i of r.error.issues) { const f = String(i.path[0] ?? (i as { keys?: string[] }).keys?.[0] ?? "body"); fields[f] ??= i.code === "unrecognized_keys" ? "Not a booking timing." : i.message; }
      throw invalid(fields);
    }
    await this.db.$transaction(async (tx) => {
      const now = await firmTimings(tx, ctx.firmId);
      const changed = (Object.entries(r.data) as [FirmTimingField, unknown][]).filter(([f, v]) => v !== undefined && JSON.stringify(v) !== JSON.stringify(now[f]));
      const missing = [...new Set(changed.map(([f]) => timingKey(f)))].filter((k) => !ctx.keys.includes(k));
      if (missing.length) forbidden(`Your roles do not include the permission this needs (${missing.join(", ")}).`, "MISSING_PERMISSION");
      for (const [f, v] of changed) await writeSetting(tx, { firmId: ctx.firmId, key: FIRM_TIMING_SETTINGS[f].key, value: v, by: `staff:${ctx.staffId}`, workspaceId: await platformAuditWorkspaceId(tx), reason: "booking timings changed" });
    });
    return this.read(ctx);
  }
}
