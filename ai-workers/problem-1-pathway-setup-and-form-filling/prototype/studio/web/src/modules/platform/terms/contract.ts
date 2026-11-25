// PF-5t part 2: the shapes of PF-5t part 1's three routes (api/src/platform/terms/routes.ts) and their words. The texts
// and versions are Sample. Unconfirmed: no counsel.
import { z } from "zod";

export const TermsVersion = z.object({ id: z.string(), kind: z.string(), version: z.string(), url: z.string(), publishedAt: z.string() });
export type TermsVersion = z.infer<typeof TermsVersion>;
/** GET /api/platform/me/terms and POST /api/platform/me/terms/accept. */
export const MyTerms = z.object({ pending: z.array(TermsVersion), note: z.string() }).passthrough();
export type MyTerms = z.infer<typeof MyTerms>;
/** GET /api/platform/terms/acceptances. */
export const Acceptances = z.object({
  nextCursor: z.string().nullable(), note: z.string(),
  acceptances: z.array(z.object({ id: z.string(), staffId: z.string(), staffName: z.string(), versionId: z.string(), kind: z.string(), version: z.string(), url: z.string(), acceptedAt: z.string(), forFirm: z.boolean() })),
});
export type Acceptances = z.infer<typeof Acceptances>;

/** A stored kind in plain words (EXPERIENCE §5). An unknown kind still reads as words. */
const KIND: Record<string, string> = { TERMS_OF_SERVICE: "terms of service", PRIVACY_NOTICE: "privacy notice", DATA_PROCESSING: "data processing terms" };
export const kindWords = (kind: string) => KIND[kind] ?? kind.toLowerCase().replace(/_/g, " ");
/** "Privacy notice": the kind at the start of a line. */
export const kindLabel = (kind: string) => { const w = kindWords(kind); return w.charAt(0).toUpperCase() + w.slice(1); };
/** "terms of service", "terms of service and privacy notice", "a, b and c". */
export const listWords = (kinds: string[]) => (kinds.length < 2 ? kinds.join("") : `${kinds.slice(0, -1).join(", ")} and ${kinds[kinds.length - 1]}`);
/** Only an https link, or a path on this site (never "//host", break m2), is shown as a link: a stored url is data. */
export const safeUrl = (url: string) => {
  if (/^\/(?![/\\])./.test(url)) return url;
  try { const u = new URL(url); return u.protocol === "https:" ? u.href : null; } catch { return null; }
};
