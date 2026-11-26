// PF-10s (R1.35; concept screens/PF-10s/concept.md, challenge B1, M1, M2, m1-m4 taken in): the shapes the Import pages
// read from PF-10b part 1's routes (/api/platform/imports/*) and PF-10t's People target, parsed at the edge, and the
// pages' pure helpers: the state words, the one-column-per-field mapping, why Import is disabled, the template CSV.
// No imports from the app, so a test reads it in Node. The server decides every rule (BR-1..BR-6); the page shows it.
import { z } from "zod";

export const KEY = { run: "agent/import:run", view: "agent/import:view-report" } as const;

const Field = z.object({ key: z.string(), label: z.string(), required: z.boolean(), kind: z.string(), aliases: z.array(z.string()).optional(), values: z.array(z.string()).optional(), help: z.string().optional() });
export type Field = z.infer<typeof Field>;
export const Targets = z.object({
  targets: z.array(z.object({ key: z.string(), label: z.string(), personalData: z.boolean(), keyField: z.string(), fields: z.array(Field) })),
  attestation: z.object({ version: z.string(), unconfirmed: z.string(), words: z.string() }),
  declaration: z.string(),
});
export type Targets = z.infer<typeof Targets>;
export const Attestation = z.object({ current: z.object({ id: z.string(), at: z.string() }).nullable(), wording: z.object({ version: z.string(), words: z.string(), unconfirmed: z.string() }), canAttest: z.boolean() });
export type Attestation = z.infer<typeof Attestation>;

const Totals = z.object({ CREATE: z.number(), MERGE: z.number(), SKIP: z.number(), ERROR: z.number() });
const Counts = z.object({ created: z.number(), merged: z.number(), skipped: z.number(), errors: z.number() });
export const State = z.enum(["DRAFT", "DRY_RUN_READY", "RUNNING", "COMPLETED", "PARTIAL", "FAILED", "UNDOING", "UNDONE"]);
export type State = z.infer<typeof State>;
export const Batch = z.object({
  id: z.string(), target: z.string(), targetLabel: z.string(), sourceName: z.string(), state: State, rows: z.number(), header: z.array(z.string()), sample: z.array(z.array(z.string())),
  mapping: z.object({ columns: z.record(z.string(), z.string().nullable()), declared: z.boolean().optional() }).nullable(), dryRunHash: z.string().nullable(), phase: z.enum(["DRY_RUN", "RUN"]),
  totals: Totals, attestationNeeded: z.boolean(), counts: Counts, createdAt: z.string(), finishedAt: z.string().nullable(), mappingFrom: z.enum(["saved", "headers"]).optional(),
});
export type Batch = z.infer<typeof Batch>;
export const Outcome = z.enum(["CREATE", "MERGE", "SKIP", "ERROR"]);
export type Outcome = z.infer<typeof Outcome>;
export const Rows = z.object({
  phase: z.enum(["DRY_RUN", "RUN"]), page: z.number(), pageSize: z.number(), total: z.number(),
  rows: z.array(z.object({ row: z.number(), outcome: Outcome, reasons: z.array(z.object({ field: z.string(), rule: z.string(), words: z.string() })), recordKind: z.string().nullable(), recordId: z.string().nullable() })),
});
export type Rows = z.infer<typeof Rows>;
export const List = z.object({ page: z.number(), pageSize: z.number(), total: z.number(), imports: z.array(z.object({ id: z.string(), target: z.string(), targetLabel: z.string(), sourceName: z.string(), state: State, counts: Counts, importerStaffId: z.string(), createdAt: z.string() })) });
export type List = z.infer<typeof List>;

export const COPY = {
  title: "Import", subtitle: "Bring people in from a spreadsheet (CSV). You see a preview before anything is saved.",
  newImport: "New import", template: "Download the template",
  empty: "No imports yet", emptyHelp: "Download the template, fill it in, then choose New import.",
  noAccess: "You do not have access to imports", noAccessAsk: "Ask your firm's Owner or an Admin.",
  limits: "CSV, UTF-8, at most 10 MB and 5,000 rows.",
  mergeNote: "Merge fills only empty fields; nothing already on a person is changed.",
  stale: "The columns changed. Preview again before importing.", nothingNew: "Nothing new to import.",
  ownerFirst: "An Owner must confirm first; then Preview again.", adminWait: "An Owner of your firm must confirm this once before people can be imported.",
  continue: "Continue import", stalled: "No new row for a minute. Continue import goes on from the first row not yet written (each row is written once).",
  noRows: "No rows with this outcome.",
} as const;
export const TIPS: Record<Outcome, string> = {
  CREATE: "A new person is added.",
  MERGE: "This person is already in your firm (same email or phone). Only empty fields are filled.",
  SKIP: "Nothing new for this person, or a repeat of an earlier row.",
  ERROR: "Rows that will not be imported, with the reason.",
};
export const OUTCOME_WORDS: Record<Outcome, { preview: string; run: string; tone: string }> = {
  CREATE: { preview: "To create", run: "Created", tone: "ok" }, MERGE: { preview: "To merge", run: "Merged", tone: "info" },
  SKIP: { preview: "Skip", run: "Skipped", tone: "neutral" }, ERROR: { preview: "Errors", run: "Not imported", tone: "danger" },
};

/** A batch's state in words (concept §4: Draft · Preview ready · Running · Done · Done with errors · Nothing imported). */
export function stateWords(s: State, c?: { created: number; merged: number }): { text: string; tone: string } {
  if (s === "DRAFT") return { text: "Draft", tone: "neutral" };
  if (s === "DRY_RUN_READY") return { text: "Preview ready", tone: "info" };
  if (s === "RUNNING") return { text: "Running", tone: "info" };
  if (s === "COMPLETED") return c && c.created + c.merged === 0 ? { text: "Nothing imported", tone: "neutral" } : { text: "Done", tone: "ok" };
  if (s === "PARTIAL") return { text: "Done with errors", tone: "warn" };
  if (s === "FAILED") return { text: "Nothing imported", tone: "danger" };
  return { text: s === "UNDOING" ? "Undoing" : "Undone", tone: "neutral" };
}
/** Where a list row opens (challenge m3): Draft → Columns; Preview ready → Preview; Running → running; else the result. */
export const stepOf = (s: State): "columns" | "preview" | "running" | "result" => (s === "DRAFT" ? "columns" : s === "DRY_RUN_READY" ? "preview" : s === "RUNNING" ? "running" : "result");

export type Columns = Record<string, string | null>;
/** The fields another column already uses (one column per field, BR concept §4 step 2). */
export const usedElsewhere = (columns: Columns, column: string) => new Set(Object.entries(columns).filter(([c, f]) => c !== column && f).map(([, f]) => f as string));
/** Is a consent field mapped (then the declaration is needed, BR-3)? */
export const consentMapped = (columns: Columns, fields: Field[]) => Object.values(columns).some((k) => fields.find((f) => f.key === k)?.kind === "CONSENT");
/** The columns as the server's mapping: every header named, unmapped as null. */
export const sameColumns = (a: Columns, b: Columns | null | undefined) => !!b && Object.keys({ ...a, ...b }).every((k) => (a[k] ?? null) === (b[k] ?? null));

/** Why Import (Run) is disabled, or null when it may run (BR-1, BR-2, BR-6, challenge M1). */
export function runBlocked(b: Batch, columns: Columns, declared: boolean): string | null {
  if (b.state !== "DRY_RUN_READY" || !b.dryRunHash) return null;
  if (!sameColumns(columns, b.mapping?.columns) || declared !== !!b.mapping?.declared) return COPY.stale;
  if (b.attestationNeeded) return COPY.ownerFirst;
  if (b.totals.CREATE + b.totals.MERGE === 0) return COPY.nothingNew;
  return null;
}
/** The primary button's words: "Import 3 people" (create + merge). */
export const importWords = (b: Batch) => { const n = b.totals.CREATE + b.totals.MERGE; return `Import ${n} ${n === 1 ? "person" : "people"}`; };
/** "Done: 2 created, 1 merged, 1 skipped, 1 not imported." */
export const doneWords = (c: { created: number; merged: number; skipped: number; errors: number }) => `Done: ${c.created} created, ${c.merged} merged, ${c.skipped} skipped, ${c.errors} not imported.`;
/** The People template (AG-18-5): the target's field labels as the header, and one Sample row. */
export function templateCsv(fields: Field[]): string {
  const sample: Record<string, string> = { givenNames: "Sample", familyName: "Person", email: "sample.person@example.com", phone: "+1 416 555 0100", language: "en", marketingConsent: "no" };
  const q = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `${fields.map((f) => q(f.label)).join(",")}\r\n${fields.map((f) => q(sample[f.key] ?? "")).join(",")}\r\n`;
}
