// PF-18a part 1: OfficeClockPort's real adapter (ports/offices.ts) over platform_office and platform_staff_office, with the firm's own settings (settings.ts) when no
// office is named. Reads run with the caller's client and firm scope (PF-12: a query outside every scope reads nothing, so another firm's office is OfficeNotFound here
// too).
import type { Prisma, PrismaClient } from "@prisma/client";
import { OfficeId, OfficeNotFound, type OfficeClockPort, type OpenHours } from "../../../../../ports/offices.ts";
import { firmScope } from "../../firm-scope.ts";
import { BUSINESS_HOURS, CLOSED_DAYS, readSetting, TIME_ZONE } from "../../settings.ts";
/** The injection token of OfficeClockPort's real adapter (api/src/features/platform-settings-personal.ts). */
export const OFFICE_CLOCK = Symbol.for("platform.OfficeClockPort");
type DbOrTx = PrismaClient | Prisma.TransactionClient;
export class OfficeClock implements OfficeClockPort {
  constructor(private readonly db: DbOrTx) {}
  /** The firm, readable in the caller's scope; otherwise an error, never the settings' defaults (break B3: under another
   *  firm's scope, or none, the walls hide the firm's settings and readSetting would answer the defaults). */
  private async firm(firmId: string): Promise<string> {
    const id = firmScope(firmId).firmId;
    if (!(await this.db.platformFirm.findUnique({ where: { id }, select: { id: true } }))) throw new Error("OfficeClock: the firm is not readable here (call it in the firm's own scope)");
    return id;
  }
  private async office(firmId: string, officeId: string) {
    if (!OfficeId.safeParse(officeId).success) throw new OfficeNotFound();
    const row = await this.db.platformOffice.findFirst({ where: firmScope(firmId, { id: officeId.toLowerCase() }), select: { timeZone: true, businessHours: true, closedDays: true } });
    if (!row) throw new OfficeNotFound();
    return row;
  }
  async zoneFor(firmId: string, officeId: string | null): Promise<string> {
    if (officeId === null) return readSetting<string>(this.db, await this.firm(firmId), TIME_ZONE.key);
    return TIME_ZONE.schema.parse((await this.office(firmId, officeId)).timeZone);
  }
  async hoursFor(firmId: string, officeId: string | null): Promise<OpenHours> {
    if (officeId === null) return structuredClone(await readSetting<OpenHours>(this.db, await this.firm(firmId), BUSINESS_HOURS.key));
    return BUSINESS_HOURS.schema.parse((await this.office(firmId, officeId)).businessHours);
  }
  async closedDaysFor(firmId: string, officeId: string | null): Promise<string[]> {
    if (officeId === null) return [...await readSetting<string[]>(this.db, await this.firm(firmId), CLOSED_DAYS.key)];
    return CLOSED_DAYS.schema.parse((await this.office(firmId, officeId)).closedDays);
  }
  async officeOfStaff(firmId: string, staffId: string): Promise<string | null> {
    if (!OfficeId.safeParse(staffId).success) return null;
    const row = await this.db.platformStaffOffice.findFirst({ where: firmScope(await this.firm(firmId), { staffId: staffId.toLowerCase() }), select: { officeId: true } });
    return row?.officeId ?? null;
  }
}
