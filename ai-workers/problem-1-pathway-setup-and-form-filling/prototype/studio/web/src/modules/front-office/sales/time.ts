// FO-4 part 1: how long ago a lead arrived, in words. The waited time in the firm's open hours (BR-4, AG-2-13c rule 6)
// needs the firm's hours, time zone and closed days, which only the server reads: asked on FO-2 (#1813, comment
// 6892080467, point 1). Until it answers, the screen says plainly that this is the time since the enquiry arrived.
export function sinceLabel(fromIso: string, now = Date.now()): string {
  const min = Math.max(0, Math.floor((now - Date.parse(fromIso)) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${min % 60} min`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "day" : "days"} ${h % 24} h`;
}
export const waitedLabel = (arrivedAt: string, now = Date.now()) => `${sinceLabel(arrivedAt, now)} since it arrived`;
const DAY = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" });
export const arrivedLabel = (iso: string) => DAY.format(new Date(iso));
