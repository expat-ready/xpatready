// PF-5s part 1 (concept pf-5s-saas r2; brief lead-b-briefs/PF-5s1.md): the public sign-up pages' one reader of PF-5's
// open doors on main: GET /api/public/plans, POST /api/public/signup, POST /api/public/signup/verify. No sign-in, no
// firm data; the password is sent once in a POST body and never kept outside the page's memory.
import { z } from "zod";

const Price = z.object({ amountCents: z.number(), currency: z.string(), interval: z.string() }).nullable();
export const Plans = z.object({
  plans: z.array(z.object({ code: z.string(), name: z.string(), seatsLimit: z.number().nullable(), trialDays: z.number(), monthly: Price, yearly: Price })),
  pricesAvailable: z.boolean(), taxNote: z.string(), defaultPlan: z.string(), defaultPeriod: z.enum(["MONTHLY", "YEARLY"]),
  terms: z.array(z.object({ id: z.string(), kind: z.string(), version: z.string(), url: z.string() })),
  formStamp: z.string(),
});
export type Plans = z.infer<typeof Plans>;
export type Period = "MONTHLY" | "YEARLY";
export type Problem = { status: number; code?: string; detail?: string; errors: string[] };

export async function call<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/public/${path}`, { method: body === undefined ? "GET" : "POST", headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  } catch { throw { status: 0, detail: "Could not reach the server. Check your connection and try again.", errors: [] } satisfies Problem; }
  const text = await res.text();
  const data: unknown = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    throw { status: res.status, code: typeof d.code === "string" ? d.code : undefined, detail: typeof d.detail === "string" ? d.detail : res.status >= 500 ? "Something went wrong on our side. Please try again." : undefined,
      errors: Array.isArray(d.errors) ? d.errors.filter((e): e is string => typeof e === "string") : [] } satisfies Problem;
  }
  return data as T;
}

/** The door's field refusals ("field: words") by field; the words after the name are shown on the field. */
export function byField(errors: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of errors) { const i = e.indexOf(": "); const f = i > 0 ? e.slice(0, i) : "form"; const w = i > 0 ? e.slice(i + 2) : e; out[f] ??= w.charAt(0).toUpperCase() + w.slice(1).replace(/([^.])$/, "$1."); }
  return out;
}

export const KIND_LABEL: Record<string, string> = { TERMS_OF_SERVICE: "Terms of Service", PRIVACY_NOTICE: "Privacy Notice", DATA_PROCESSING: "Data Processing Terms" };
const ORDER = ["TERMS_OF_SERVICE", "PRIVACY_NOTICE", "DATA_PROCESSING"];
export const termsInOrder = (t: Plans["terms"]) => [...t].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
/** The terms module's one check of a stored url before it becomes a link. */
export { safeUrl } from "../terms/contract";

export function money(p: { amountCents: number; currency: string } | null) {
  if (!p) return null;
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: p.currency, maximumFractionDigits: p.amountCents % 100 ? 2 : 0 }).format(p.amountCents / 100);
}
export const periodWord = (p: Period) => (p === "YEARLY" ? "yearly" : "monthly");
/** Concept BR-3 and §5: the tick's refusal, on the field. */
export const TERMS_REQUIRED = "Please accept the terms to continue.";
export const PASSWORD_RULE = "At least 12 characters.";
