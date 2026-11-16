// PF-0c: OfficeClockPort's contract (ports/offices.ts). Run by fakeOfficeClock and by OfficeClock (api/src/platform/settings/offices/clock.ts), in
// tests/check_pf18a_offices.ts. The port file's sentences: no office → the firm's own settings; an office → its own zone, hours and closed days whatever the firm's; a
// closed day of one office never closes another; another firm's office, or no such office, is OfficeNotFound; a staff member with no office → null; the values handed
// back are the caller's copies.
import { defineContract, expect, expectRefused } from "./contract.ts";
import { FIRM_DEFAULTS, OfficeNotFound, type OfficeClockPort, type OfficeClockValues } from "../offices.ts";

/** What an office-clock adapter's test hands the contract: two firms its store knows (real platform_firm rows for the real
 *  adapter), a way to save a firm's own values, add an office (its id), make a staff member with no office, and place one. */
export type OfficeClockHarness = {
  port: OfficeClockPort; firmA: string; firmB: string;
  setFirm(firmId: string, v: OfficeClockValues): Promise<void>;
  addOffice(firmId: string, v: OfficeClockValues): Promise<string>;
  newStaff(firmId: string): Promise<string>;
  assign(firmId: string, staffId: string, officeId: string): Promise<void>;
};

const TORONTO: OfficeClockValues = { zone: "America/Toronto", hours: [{ day: "MON", opens: "09:00", closes: "17:00" }], closedDays: ["2026-12-25"] };
const CALGARY: OfficeClockValues = { zone: "America/Edmonton", hours: [{ day: "TUE", opens: "08:00", closes: "16:00" }], closedDays: ["2026-11-11"] };
const VANCOUVER: OfficeClockValues = { zone: "America/Vancouver", hours: [{ day: "WED", opens: "10:00", closes: "18:00" }], closedDays: [] };
const values = async (p: OfficeClockPort, firmId: string, officeId: string | null) => ({ zone: await p.zoneFor(firmId, officeId), hours: await p.hoursFor(firmId, officeId), closedDays: await p.closedDaysFor(firmId, officeId) });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const notFound = (e: unknown) => e instanceof OfficeNotFound || (e as { code?: string })?.code === "OFFICE_NOT_FOUND";

export const officeClockPortContract = defineContract("OfficeClockPort", (make: () => Promise<OfficeClockHarness> | OfficeClockHarness) => [
  { name: "a firm that never saved its settings → the settings' defaults (America/Toronto, Mon-Fri 09:00-17:00, no closed day)", async run() {
    const h = await make(), got = await values(h.port, h.firmB, null); expect(same(got, FIRM_DEFAULTS), "the defaults", got); } },
  { name: "no office (null) → the firm's own zone, hours and closed days", async run() {
    const h = await make(); await h.setFirm(h.firmA, TORONTO); const got = await values(h.port, h.firmA, null); expect(same(got, TORONTO), "the firm's own values", got); } },
  { name: "an office → its own zone, hours and closed days, whatever the firm's", async run() {
    const h = await make(); await h.setFirm(h.firmA, TORONTO); const calgary = await h.addOffice(h.firmA, CALGARY); const got = await values(h.port, h.firmA, calgary);
    expect(same(got, CALGARY), "the office's values", got); expect(same(await values(h.port, h.firmA, null), TORONTO), "the firm's own values unchanged"); } },
  { name: "a closed day in office B does not close office A", async run() {
    const h = await make(); const a = await h.addOffice(h.firmA, VANCOUVER), b = await h.addOffice(h.firmA, CALGARY);
    expect((await h.port.closedDaysFor(h.firmA, b)).includes("2026-11-11"), "office B is closed on its day");
    expect(!(await h.port.closedDaysFor(h.firmA, a)).includes("2026-11-11"), "office A is not", await h.port.closedDaysFor(h.firmA, a)); } },
  { name: "officeOfStaff: null with no office; the office once the person is put in it", async run() {
    const h = await make(); const s = await h.newStaff(h.firmA), o = await h.addOffice(h.firmA, CALGARY);
    expect((await h.port.officeOfStaff(h.firmA, s)) === null, "no office yet"); await h.assign(h.firmA, s, o); const got = await h.port.officeOfStaff(h.firmA, s);
    expect(got !== null && got.toLowerCase() === o.toLowerCase(), "the office", got);
    expect((await h.port.officeOfStaff(h.firmB, s)) === null, "asked as another firm: none"); } },
  { name: "another firm's office, or no such office, is refused (OfficeNotFound)", async run() {
    const h = await make(); const theirs = await h.addOffice(h.firmB, CALGARY);
    await expectRefused(() => h.port.zoneFor(h.firmA, theirs), "firm B's office read as firm A", notFound);
    await expectRefused(() => h.port.hoursFor(h.firmA, theirs), "firm B's hours read as firm A", notFound);
    await expectRefused(() => h.port.closedDaysFor(h.firmA, globalThis.crypto.randomUUID()), "an unknown office", notFound);
    await expectRefused(() => h.port.zoneFor(h.firmA, "not-an-id"), "an id that is not one", notFound); } },
  { name: "the values handed back are copies: changing them changes nothing stored", async run() {
    const h = await make(); const o = await h.addOffice(h.firmA, CALGARY); (await h.port.hoursFor(h.firmA, o)).push({ day: "SUN", opens: "00:00", closes: "01:00" });
    (await h.port.closedDaysFor(h.firmA, o)).push("2027-01-01"); expect(same(await values(h.port, h.firmA, o), CALGARY), "unchanged", await values(h.port, h.firmA, o)); } },
]);
