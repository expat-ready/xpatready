// FO-5s part 1 (concept screens/fo-5s-retainer-signing r2 §4 S2, S3, S4, S5; BR-3, BR-5, BR-6, BR-7, BR-9, BR-17): the
// shapes the retainer screens read, mirroring FO-5's answers (api/src/front-office/retainers/service.ts `read`,
// `listForProspect`, `listTemplates`, `representatives`) and FO-5b's checklist (code-checklist.ts). Parsed at the edge.
import { z } from "zod";

const Fee = z.object({ position: z.number(), label: z.string(), amountMinor: z.string().nullable(), currency: z.string(), when: z.string(), dueOn: z.string().nullable() });
export type Fee = z.infer<typeof Fee>;
const DraftChecklist = z.object({
  marked: z.number(), total: z.number(), line: z.string(), templateChanged: z.boolean(), legalReading: z.string(),
  items: z.array(z.object({ letter: z.string(), section: z.string(), present: z.boolean() })),
  source: z.object({ section: z.string(), url: z.string(), currentTo: z.string() }),
});
export const Retainer = z.object({
  id: z.string(), kind: z.string(), status: z.string(), prospectId: z.string().nullable(), subject: z.string(), signerPersonId: z.string().nullable(), representativeStaffId: z.string(),
  prospect: z.object({ id: z.string(), number: z.string(), type: z.string(), stage: z.string(), stageKind: z.string() }).nullable(),
  template: z.object({ id: z.string(), name: z.string().nullable(), version: z.number() }),
  version: z.object({ n: z.number(), sha256: z.string(), sentAt: z.string().nullable(), values: z.record(z.string(), z.unknown()), fees: z.array(Fee) }),
  mayChange: z.boolean(), canSend: z.boolean(), signerOptions: z.array(z.object({ personId: z.string(), name: z.string(), role: z.string(), email: z.string().nullable().optional() })), blockers: z.record(z.string(), z.string()), missing: z.array(z.string()), codeChecklist: DraftChecklist.nullable(),
  versions: z.array(z.object({ n: z.number(), sentAt: z.string().nullable(), endedAt: z.string().nullable(), endReason: z.string().nullable(), note: z.string().nullable() })),
  warnings: z.array(z.string()).optional(),
});
export type Retainer = z.infer<typeof Retainer>;
export const RetainerRows = z.array(z.object({ id: z.string(), kind: z.string(), status: z.string(), currentVersion: z.number(), mine: z.boolean(), sentBefore: z.boolean().optional() }));
export const Templates = z.array(z.object({ id: z.string(), name: z.string(), kind: z.string(), version: z.number(), active: z.boolean() }));
export const Representatives = z.array(z.object({ staffId: z.string(), name: z.string() }));
export const TemplateChecklist = z.object({
  summary: z.string(), legalReading: z.string(), source: z.object({ line: z.string(), url: z.string(), currentTo: z.string() }),
  items: z.array(z.object({ letter: z.string(), section: z.string(), text: z.string(), marked: z.boolean(), howWeCheck: z.string() })),
});

/** The keys (AG-05 C5, FO-5's routes). */
export const R_KEY = { list: "agent/retainer:list", show: "agent/retainer:show", draft: "agent/retainer:draft", send: "agent/retainer:send", download: "agent/retainer:download" } as const;
/** The states in words, with the tooltip each status chip carries (BIC-14). */
export const STATUS: Record<string, { label: string; tone: string; tip: string }> = {
  DRAFT: { label: "Draft", tone: "neutral", tip: "Not sent yet. Each saved change is a new version." },
  SENT: { label: "Sent", tone: "info", tip: "Waiting for the client to sign. Editing makes a new version to send again." },
  VIEWED: { label: "Viewed", tone: "info", tip: "The client opened it and has not signed yet." },
  CLIENT_SIGNED: { label: "Client signed", tone: "warn", tip: "The client signed. The representative signs for the firm." },
  SIGNED: { label: "Signed", tone: "ok", tip: "Signed by the client and the firm. It can no longer change." },
  SIGNED_OFFLINE: { label: "Signed on paper", tone: "ok", tip: "Recorded as signed on paper. It can no longer change." },
  DECLINED: { label: "Declined", tone: "warn", tip: "The client declined. Edit and resend makes a new version." },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral", tip: "Withdrawn. Prepare a new retainer if needed." },
  EXPIRED: { label: "Expired", tone: "neutral", tip: "Not signed in time. Edit and resend makes a new version." },
};
/** FO-5's EDITABLE list (service.ts): Edit is offered on these (BR-9); once the client signed it is gone. */
export const EDITABLE = ["DRAFT", "SENT", "VIEWED", "DECLINED", "EXPIRED"];
/** A new retainer can be prepared when the prospect has none open (FO-5's one-live rule; BR-10 M2). */
export const CLOSED = ["WITHDRAWN", "EXPIRED"];
export const WHEN: [string, string][] = [["ON_SIGNING", "On signing"], ["ON_DATE", "On a date"], ["WHEN_SUBMITTED", "When submitted"], ["WHEN_DECIDED", "When decided"], ["WHEN_DONE", "When done"]];
/** The merge values a person reads in Check before sending, with their labels (placeholders.ts); the rest are internal. */
export const VALUE_LABELS: [string, string][] = [["client.name", "Client name"], ["client.email", "Client email"], ["client.phone", "Client phone"], ["company.name", "Company name"],
  ["signer.name", "Person who signs"], ["signer.email", "Signer's email"], ["representative.name", "Representative"], ["representative.licensing_body", "Licensing body"],
  ["firm.name", "Firm name"], ["agreement.date", "Date of this version"], ["agreement.version", "Version number"], ["fees.total", "Total fees"]];
/** Cents as typed money, CAD ("1500.00" → "CAD 1,500.00"); the server keeps the cents. */
/** CAD 0.00 means no fee is due: shown "No fee", and the retainer can still be sent (Lead 15 ruling on #2802, P-628, reversible). */
export const NO_FEE = "No fee";
export const isNoFee = (total: unknown) => total === "CAD 0.00";
export const cad = (minor: string | null) => (minor === null ? "No amount" : minor === "0" ? NO_FEE : `CAD ${(Number(minor) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
/** A typed amount ("1500", "1,500" or "1500.50") as cents for the server, or a refusal in words. A comma only groups
 *  thousands ("1,500.50"); "1500,50" or "1,5" is refused, never read as a hundred times the fee (break M1). At most CAD
 *  100 million, the server's limit (FEE_MAX_MINOR; break m4). */
export function centsIn(typed: string): { cents: string | null } | { refused: string } {
  const t = typed.trim();
  if (!t) return { cents: null };
  if (!/^(\d{1,9}|\d{1,3}(,\d{3}){1,2})(\.\d{1,2})?$/.test(t)) return { refused: "An amount in dollars with a dot for cents, for example 1500 or 1,500.50." };
  const [d, c = ""] = t.replace(/,/g, "").split(".");
  const cents = BigInt(d) * 100n + BigInt(c.padEnd(2, "0") || "0");
  return cents > 10_000_000_000n ? { refused: "At most CAD 100,000,000.00." } : { cents: String(cents) };
}
