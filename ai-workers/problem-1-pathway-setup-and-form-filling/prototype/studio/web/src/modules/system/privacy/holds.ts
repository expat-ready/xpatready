// PF-21rs B2 (R1.85; concept r2 §3 BR-6, BR-7, BR-8, §4 "Legal holds", §5; SA-11-18, SA-11-34): the shapes and words of
// our console's legal holds, with no React, so the browser check reads the same words in Node. The answers are PF-21b part
// 2's (`/api/system/register/holds`) with PF-21rs R0's names. Only our Platform Owner holds the key; a hold stops deletion
// of what it covers until it is released (LegalHoldPort, asked by every deleter). Legal reading Unconfirmed: no counsel.
import { z } from "zod";
import { shortId } from "./contract";

/** SA-07 Appendix A "Place and release legal holds" (the Platform Owner only, SA7-D74 (a)). */
export const LEGAL_HOLD_KEY = "system/compliance:legal-hold";
/** PF-21b's categories (ports/legal-hold.ts LEGAL_HOLD_CATEGORY), in a person's words. */
export const HOLD_CATEGORIES = [["case_documents", "case documents"], ["case_answers", "case answers"], ["case_notes", "case notes"], ["case_tasks", "case tasks"], ["case_files", "case files"]] as const;

const Scope = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("FIRM") }),
  z.object({ kind: z.literal("CASE"), id: z.string() }),
  z.object({ kind: z.literal("PERSON"), id: z.string() }),
  z.object({ kind: z.literal("CATEGORY"), category: z.string() }),
  z.object({ kind: z.literal("DATE_RANGE"), from: z.string(), to: z.string() }),
]);
export type HoldScopeView = z.infer<typeof Scope>;
export const Hold = z.object({
  id: z.string(), firmId: z.string(), scope: Scope, reason: z.string(), placedBy: z.string(), placedAt: z.string(), active: z.boolean(),
  releasedBy: z.string().nullable(), releasedAt: z.string().nullable(), releaseReason: z.string().nullable(),
  firmName: z.string().nullable().optional(), placedByName: z.string().nullable().optional(), releasedByName: z.string().nullable().optional(),
});
export type Hold = z.infer<typeof Hold>;
export const HoldList = z.object({ holds: z.array(Hold), truncated: z.boolean() });

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** What a hold covers, in words: "All of the firm's data", "Person record 3f2a…c91e", "Case notes", "Records dated 1 Nov 2026 to 20 Nov 2026". */
export function coversWords(s: HoldScopeView): string {
  if (s.kind === "FIRM") return "All of the firm's data";
  if (s.kind === "PERSON") return `Person record ${shortId(s.id)}`;
  if (s.kind === "CASE") return `Case ${shortId(s.id)}`;
  if (s.kind === "CATEGORY") { const w = HOLD_CATEGORIES.find(([c]) => c === s.category)?.[1] ?? s.category; return w.charAt(0).toUpperCase() + w.slice(1); }
  return `Records dated ${DAY.format(new Date(s.from))} to ${DAY.format(new Date(s.to))}`;
}

/** The "Hold a firm's data" body: the firm, the scope (the firm by default; narrower under Advanced), the reason. */
export type HoldDraft = { firmId: string; kind: "FIRM" | "PERSON" | "CASE" | "CATEGORY" | "DATE_RANGE"; id: string; category: string; from: string; to: string; reason: string };
export function holdBody(d: HoldDraft): Record<string, unknown> {
  const scope = d.kind === "FIRM" ? { kind: "FIRM" } : d.kind === "PERSON" || d.kind === "CASE" ? { kind: d.kind, id: d.id.trim() }
    : d.kind === "CATEGORY" ? { kind: "CATEGORY", category: d.category } : { kind: "DATE_RANGE", from: d.from, to: d.to };
  return { firmId: d.firmId, scope, reason: d.reason };
}
/** A 422's field names as the dialog's fields ("scope.id" → id, "scope.from" → from); anything else above the buttons. */
export function holdFieldErrors(fields: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields ?? {})) {
    const p = k.split("."), at = p[0] === "scope" ? (["id", "category", "from", "to"].includes(p[1] ?? "") ? p[1]! : "kind") : ["firmId", "reason"].includes(p[0]!) ? p[0]! : "other";
    out[at] = out[at] ? `${out[at]} ${v}` : v;
  }
  return out;
}

export const HOLD_COPY = {
  title: "Legal holds",
  lead: "A hold stops deletion of what it covers, in one firm, until it is released. Only ExpatReady's Platform Owner places and releases holds; the firm is never told why.",
  empty: "No active hold. A hold stops deletion of what it covers until it is released.",
  emptyReleased: "No released hold.", emptyAll: "No hold has been placed.",
  loadFailed: "Could not load the holds. Please try again.",
  truncated: "Showing the newest 500.",
  placeTitle: "Hold a firm's data",
  placeLead: "By default the hold covers all of the firm's data. Narrow it under Advanced only when the matter covers less.",
  advanced: "Advanced: hold less than the whole firm",
  idHint: "The record's id as the firm's records give it; not checked here.",
  reasonHint: "The legal matter, in your words: kept on the hold and on the audit line, never shown to the firm.",
  placed: "The hold is placed. Nothing it covers can be deleted until it is released.",
  releaseTitle: "Release this hold?",
  releaseLead: "Deletion of what it covers may go ahead again once it is released. This cannot be undone: a new hold would be placed afresh.",
  released: "The hold is released.",
  failed: "Could not save. Please try again.",
} as const;
