// PF-18a part 1 (AG-1-74, AG-16-68, AG-16-59; case-side contract v0.1 §1 rule 3): the office clock port. Booking, the working-time clocks and the case side ask it which
// time zone, hours and closed days apply to an office, and which office a staff member works in. The store is platform_office and platform_staff_office
// (platform-offices.prisma), written only by api/src/platform/settings/offices/ (its OfficeClock is the real adapter). The rules callers rely on:
//   * no office (null) → the firm's own settings (platform.time_zone, platform.business_hours, platform.closed_days),
//     which are also what a firm with one office uses (AG-1-74 rule 1);
//   * an office → that office's own zone, hours and closed days, whatever the firm's (rules 3, 4); a closed day of one
//     office never closes another (AG-16-59);
//   * an office of another firm, or no such office, is refused with OfficeNotFound (never another firm's values);
//   * a staff member with no office → null (the caller then passes null: the firm's own zone).
// The values handed back are the caller's own copies. This folder imports only zod and its own files.
import { z } from "zod";
import { FirmId } from "./audit.ts";
export const Weekday = z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
/** One open day: "HH:MM" 24-hour wall times in the office's zone (the platform's schema checks opens before closes). */
export const OpenDay = z.strictObject({ day: Weekday, opens: z.string(), closes: z.string() });
export const OpenHours = z.array(OpenDay);
export type OpenHours = z.infer<typeof OpenHours>;
/** Closed days: calendar dates, YYYY-MM-DD, in the office's zone. */
export type ClosedDays = string[];
export const OfficeId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "an office id (uuid)");
/** The office named is not one of the firm's (or does not exist): the same answer either way. */
export class OfficeNotFound extends Error {
  readonly code = "OFFICE_NOT_FOUND";
  constructor() { super("No such office in this firm."); this.name = "OfficeNotFound"; }
}
export interface OfficeClockPort {
  /** The office's IANA zone, open hours and closed days; the firm's own when `officeId` is null. */
  zoneFor(firmId: string, officeId: string | null): Promise<string>;
  hoursFor(firmId: string, officeId: string | null): Promise<OpenHours>;
  closedDaysFor(firmId: string, officeId: string | null): Promise<ClosedDays>;
  /** The office a staff member works in, or null. */
  officeOfStaff(firmId: string, staffId: string): Promise<string | null>;
}
/** What one office (or the firm itself) holds. */
export type OfficeClockValues = { zone: string; hours: OpenHours; closedDays: ClosedDays };
/** The firm settings' own defaults (api/src/platform/settings.ts): what a firm that never saved them has. */
export const FIRM_DEFAULTS: OfficeClockValues = {
  zone: "America/Toronto",
  hours: (["MON", "TUE", "WED", "THU", "FRI"] as const).map((day) => ({ day, opens: "09:00", closes: "17:00" })),
  closedDays: [],
};
const copy = (v: OfficeClockValues): OfficeClockValues => ({ zone: v.zone, hours: v.hours.map((h) => ({ ...h })), closedDays: [...v.closedDays] });
/** The fake's own handles: set a firm's values, add an office (its id), place a staff member (null: none). */
export type FakeOfficeClock = OfficeClockPort & {
  setFirm(firmId: string, v: OfficeClockValues): void;
  addOffice(firmId: string, v: OfficeClockValues): string;
  assign(firmId: string, staffId: string, officeId: string | null): void;
};
/** An in-memory OfficeClockPort with the same rules as the real adapter (ports/contracts/office-clock-port.contract.ts). */
export function fakeOfficeClock(): FakeOfficeClock {
  const firms = new Map<string, OfficeClockValues>();
  const offices = new Map<string, { firmId: string; v: OfficeClockValues }>();
  const staff = new Map<string, { firmId: string; officeId: string }>();
  const firm = (firmId: string) => FirmId.parse(firmId).toLowerCase();
  const of = (firmId: string, officeId: string | null): OfficeClockValues => {
    const f = firm(firmId);
    if (officeId === null) return copy(firms.get(f) ?? FIRM_DEFAULTS);
    const o = OfficeId.safeParse(officeId).success ? offices.get(officeId.toLowerCase()) : undefined;
    if (!o || o.firmId !== f) throw new OfficeNotFound();
    return copy(o.v);
  };
  return {
    async zoneFor(firmId, officeId) { return of(firmId, officeId).zone; },
    async hoursFor(firmId, officeId) { return of(firmId, officeId).hours; },
    async closedDaysFor(firmId, officeId) { return of(firmId, officeId).closedDays; },
    async officeOfStaff(firmId, staffId) { const s = staff.get(staffId.toLowerCase()); return s && s.firmId === firm(firmId) ? s.officeId : null; },
    setFirm(firmId, v) { firms.set(firm(firmId), copy(v)); },
    addOffice(firmId, v) { const id = globalThis.crypto.randomUUID(); offices.set(id, { firmId: firm(firmId), v: copy(v) }); return id; },
    assign(firmId, staffId, officeId) {
      if (officeId === null) { staff.delete(staffId.toLowerCase()); return; }
      of(firmId, officeId);
      staff.set(staffId.toLowerCase(), { firmId: firm(firmId), officeId: officeId.toLowerCase() });
    },
  };
}
