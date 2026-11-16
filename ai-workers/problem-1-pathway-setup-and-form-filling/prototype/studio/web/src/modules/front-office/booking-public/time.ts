// FO-3w (concept BR-3, BR-4; AG-4-18): times for the visitor, in the zone they look at. The server's slot instants never
// change here; a zone change redraws labels only. Pure functions over Intl (no time library in the browser bundle).
const parts = (at: Date | number, zone: string, o: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: zone, ...o }).formatToParts(at).map((p) => [p.type, p.value]));

/** The zone names the server takes (FO-3's ZONE_NAME, service.ts; FO-1b's fo_zone_ok): an offset such as "+05:30" or a
 *  name such as "Factory" is a zone to the browser but not to the server, so it is never offered or sent (break M2). */
const SERVER_ZONE = /^(UTC|Etc\/GMT[+-][0-9]{1,2}|[A-Z][A-Za-z_-]*(\/[A-Z][A-Za-z_-]*)+)$/;
/** The zone's own spelling when it is one the browser and the server both take, else null ("asia/dubai" → "Asia/Dubai"). */
export function realZone(s: string): string | null {
  try { const z = new Intl.DateTimeFormat("en-GB", { timeZone: s.trim() }).resolvedOptions().timeZone; return SERVER_ZONE.test(z) ? z : null; } catch { return null; }
}
/** The browser's zone, or null when it gives none the server takes (BR-3: the slots answer's zone is used then). */
export function browserZone(): string | null { try { return realZone(Intl.DateTimeFormat().resolvedOptions().timeZone || ""); } catch { return null; } }
export function allZones(): string[] { try { return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone").filter((z) => SERVER_ZONE.test(z)); } catch { return []; } }

/** "2026-10-20": the calendar day of a moment in the zone. */
export function dayKey(at: Date | number, zone: string): string { const p = parts(at, zone, { year: "numeric", month: "2-digit", day: "2-digit" }); return `${p.year}-${p.month}-${p.day}`; }
/** "22:00". */
export function hhmm(at: Date | number, zone: string): string { const p = parts(at, zone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); return `${p.hour}:${p.minute}`; }
/** "Tuesday 20 October" (concept §5 "<Weekday d Month>"). */
export function dayWords(at: Date | number, zone: string): string { const p = parts(at, zone, { weekday: "long", day: "numeric", month: "long" }); return `${p.weekday} ${p.day} ${p.month}`; }
/** "Tuesday 20 October, 22:00 Asia/Dubai time" (the step-2 line and the confirmation). */
export function whenWords(at: Date | number, zone: string): string { return `${dayWords(at, zone)}, ${hhmm(at, zone)} ${zone} time`; }
/** The zone's offset from UTC at a moment, in minutes. */
export function offsetAt(at: number, zone: string): number {
  const name = parts(at, zone, { timeZoneName: "longOffset" }).timeZoneName ?? "GMT";
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}
/** BR-4: the clocks change on this day in the zone (the offset at the day's start differs from the one at its end). */
export function clocksChange(day: string, zone: string): boolean {
  const [y, m, d] = day.split("-").map(Number), utcMidnight = Date.UTC(y, m - 1, d);
  const start = utcMidnight - offsetAt(utcMidnight, zone) * 60_000;
  return offsetAt(start, zone) !== offsetAt(start + 24 * 3_600_000 - 60_000, zone);
}
/** A month as { y, m } (m 1-12), its first moment in the zone (as an ISO instant), and the next month. */
export type Month = { y: number; m: number };
export const monthOf = (at: Date | number, zone: string): Month => { const [y, m] = dayKey(at, zone).split("-").map(Number); return { y, m }; };
export const nextMonth = ({ y, m }: Month, by = 1): Month => { const i = y * 12 + (m - 1) + by; return { y: Math.floor(i / 12), m: (i % 12) + 1 }; };
export function monthStart({ y, m }: Month, zone: string): Date {
  const utc = Date.UTC(y, m - 1, 1), guess = utc - offsetAt(utc, zone) * 60_000;
  return new Date(utc - offsetAt(guess, zone) * 60_000);
}
export const monthWords = ({ y, m }: Month) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(Date.UTC(y, m - 1, 1));
export const monthName = ({ y, m }: Month) => new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(Date.UTC(y, m - 1, 1));
/** The month's days as "YYYY-MM-DD", with the blanks before the 1st for a Monday-first grid. */
export function monthGrid({ y, m }: Month): (string | null)[] {
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate(), lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  return [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`)];
}
