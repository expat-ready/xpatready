// PF-17 part 4 PR B (R1.93; concept r2 screens/PF-17-4/concept.md §4a-§4c, §5): our console's shapes and words, with no
// React, so the browser check reads the same words in Node. The answers are PF-17 parts 1 and 4's (`/api/system/firms`)
// and PF-4s's (`/api/system/me`); the session key and shape are j_93's (sessionStorage "xr-system-session").
import { z } from "zod";

/** Our console's session in this tab: {token, expiresAt} (ms), the firm side's shape under its own key (concept §4a). */
export const SESSION_KEY = "xr-system-session";
/** SA-07 Appendix A "Firm list and detail (read-only)". */
export const FIRM_READ_KEY = "system/firm:read";

export const SystemMe = z.object({ staffId: z.string(), name: z.string(), email: z.string(), roles: z.array(z.object({ code: z.string(), name: z.string().nullish() })), keys: z.array(z.string()) });
export type SystemMe = z.infer<typeof SystemMe>;

const Metric = z.enum(["seats", "active_individual_cases", "active_corporate_cases", "storage_mb"]);
export const Usage = z.object({ metric: Metric, used: z.number().nullable(), limit: z.number().nullable(), over: z.boolean(), asOf: z.string().nullish() });
export type Usage = z.infer<typeof Usage>;
export const Health = z.enum(["HELD", "ATTENTION", "OK", "NOT_LIVE"]);
export type Health = z.infer<typeof Health>;
export const FirmHealth = z.object({
  id: z.string(), name: z.string(), webAddress: z.string().nullable(), status: z.string(),
  plan: z.object({ code: z.string(), name: z.string() }).nullable(),
  subscription: z.object({ status: z.string(), trialEndsAt: z.string().nullable(), billingPeriod: z.string(), overdue: z.boolean() }).nullable(),
  lastStaffSignInAt: z.string().nullable(), usage: z.array(Usage), health: Health, reasons: z.array(z.string()), failedJobs: z.number().nullable(),
});
export type FirmHealth = z.infer<typeof FirmHealth>;
export const FirmsPage = z.object({ firms: z.array(FirmHealth), page: z.number(), pageSize: z.number(), total: z.number(), complete: z.boolean(), failedJobsComplete: z.boolean(), note: z.string().optional() });
export type FirmsPage = z.infer<typeof FirmsPage>;

/** The health chips, All first (`?health=`), and each value's word and shape (text and shape, never colour alone: UXL-14). */
export const HEALTH_CHIPS: { value: Health | null; label: string }[] = [
  { value: null, label: "All" }, { value: "HELD", label: "Held" }, { value: "ATTENTION", label: "Needs attention" }, { value: "OK", label: "OK" }, { value: "NOT_LIVE", label: "Not live" }];
export const HEALTH_WORDS: Record<Health, { word: string; mark: string }> = {
  HELD: { word: "Held", mark: "■" }, ATTENTION: { word: "Needs attention", mark: "▲" }, OK: { word: "OK", mark: "●" }, NOT_LIVE: { word: "Not live", mark: "○" } };

export const COPY = {
  signInTitle: "Sign in to the ExpatReady console",
  signInLead: "For ExpatReady's own staff. Local stand-in sign-in (second step taken) until our staff's sign-in pages are built.",
  standInOff: "Sign-in for ExpatReady staff is not set up on this server.",
  ended: "Your session ended. Sign in again.",
  firmsEmpty: "No firms match. Clear the search or pick All.",
  failedCapped: "Only the oldest 10 000 failed jobs were read; newer ones may not be counted here.",
  failedUnknown: "Not known: the job queue could not be read just now.",
  loadFailed: "Could not load the firms. Please try again.",
} as const;

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const DATE_TIME = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
/** A date the way the console shows it (UTC, named in the page's header line). */
export const dayWords = (iso: string) => DATE.format(new Date(iso));
export const momentWords = (iso: string | null) => (iso ? `${DATE_TIME.format(new Date(iso))} UTC` : "Never");

/** Plan state in words (concept §4c): the subscription as stored, a trial with its end date. */
export function planState(s: FirmHealth["subscription"]): string {
  if (!s) return "No subscription";
  switch (s.status) {
    case "TRIAL": return s.trialEndsAt ? `Trial ends ${dayWords(s.trialEndsAt)}` : "Trial";
    case "ACTIVE": return "Active";
    case "OVERDUE": return "Overdue";
    case "PAYMENT_HOLD": return "Payment hold";
    case "ENDED": return "Ended";
    default: return s.status;
  }
}

/** Failed jobs (BR-4, m1): the count; "N+" when the read reached its cap (never a bare 0 that may be wrong); "Not known". */
export function failedJobsText(n: number | null, complete: boolean): string {
  if (n === null) return "Not known";
  return complete ? String(n) : `${n}+`;
}

/** One usage figure: "used / limit", "Unlimited" for no limit, "over" when over; storage in MB, "—" when never measured. */
export function usageText(u: Usage | undefined): string {
  if (!u) return "—";
  if (u.used === null) return "—";
  const unit = u.metric === "storage_mb" ? " MB" : "";
  return `${u.used.toLocaleString("en-CA")} / ${u.limit === null ? "Unlimited" : `${u.limit.toLocaleString("en-CA")}${unit}`}${u.over ? " over" : ""}`;
}

/** The API's query for the page's address: health, q and page only (anything else is not sent). */
export function firmsQuery(p: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const k of ["health", "q", "page"]) { const v = p.get(k); if (v) out.set(k, v); }
  const s = out.toString();
  return s ? `?${s}` : "";
}
