// PF-10b part 1 (R1.35; map row 35; AG-18-1, -8, -9, -12, -13, -15, -16, -17, -38): the contract between the one import
// engine (api/src/platform/import/) and the record kinds areas register as import targets (PF-10t: people). The engine
// never branches on a target: a target declares its fields, how one row is checked (reasons are {field, rule} names,
// never the value, AG-18-12), its natural key, how it finds the firm's existing record, creates one and merges into one
// (a merge fills ONLY empty fields, AG-18-38). Every write runs in the transaction the engine opens for that row.
// This folder imports only zod and its own files (case-side contract v0.1 §1 rule 3).
import { z } from "zod";
import { AuditActor, FirmId } from "./audit.ts";
/** A name as PF-10a's checks read it: a target key, a record kind, a reason's field or rule (pf_import_reasons_ok). */
export const NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
export const Reason = z.strictObject({ field: z.string().regex(NAME), rule: z.string().regex(NAME) });
export type Reason = z.infer<typeof Reason>;
/** At most this many reasons on one row (PF-10a's check allows 50). */
export const MAX_REASONS = 20;
/** The engine's own rules, named in a row's reasons beside a target's: a required cell empty; a natural key an earlier row
 *  of the file has (that row wins, AG-18-13); nothing to fill on the record (AG-18-38); a line with the wrong cell count. */
export const ENGINE_RULE = { required: "required", duplicateInFile: "duplicate_in_file", nothingNew: "nothing_new", cellCount: "cell_count" } as const;
/** One field a column can be mapped to. `kind` tells the screen how to show it; `values` lists a field's allowed values
 *  (a cell outside them makes the row an error, never a default: AG-18-8, -9). */
export const TargetField = z.strictObject({
  key: z.string().regex(NAME), label: z.string().min(1).max(80), required: z.boolean().default(false),
  kind: z.enum(["TEXT", "EMAIL", "PHONE", "LANGUAGE", "CONSENT"]),
  /** Header words a column may carry for this field (lower case), so the first mapping is suggested (AG-18-11). */
  aliases: z.array(z.string().min(1).max(80)).max(10).default([]),
  values: z.array(z.string().min(1).max(40)).max(20).optional(), help: z.string().max(300).optional(),
});
export type TargetField = z.output<typeof TargetField>;
/** What a row's check gives: reasons (the row is an error) or the record's values and its natural key (null: no key, so it
 *  is always a new record). Values are the target's own normalised form, never shown in a reason. */
export type RowCheck = { reasons: Reason[] } | { values: Record<string, string>; naturalKey: string | null };
/** Who imports, for which batch, and whether the importer ticked the declaration that the people in the file agreed to what
 *  a consent column says (AG-18-45). */
export const ImportContext = z.strictObject({ firmId: FirmId, actor: AuditActor, batchId: z.string().uuid(), sourceName: z.string().min(1).max(200), declared: z.boolean() });
export type ImportContext = z.infer<typeof ImportContext>;
export type Existing = { id: string; values: Record<string, string | null> };
/** One import target. `Tx` is the engine's transaction for one row (Prisma's in the API). */
export interface ImportTarget<Tx = unknown> {
  readonly key: string;
  readonly label: string;
  /** The record kind a row names (PF-10a's record_kind), e.g. fo_person. */
  readonly recordKind: string;
  /** A batch of this target holds personal data, so it needs the Owner's attestation (AG-18-49). */
  readonly personalData: boolean;
  /** Bumped when the row rules change; a dry run names it, and a run under another version is refused. */
  readonly version: number;
  readonly fields: readonly TargetField[];
  /** The field whose reason names a natural-key duplicate. */
  readonly keyField: string;
  /** Checks one row's mapped cells (field key → trimmed cell; empty cells left out). Pure: no database. */
  check(cells: Record<string, string>): RowCheck;
  /** The firm's record with this natural key, if any (in the row's transaction). */
  find(tx: Tx, firmId: string, naturalKey: string): Promise<Existing | null>;
  /** The fields a merge would fill: those empty on the record that the row gives (AG-18-38). Empty: nothing new. */
  fills(existing: Existing, values: Record<string, string>): string[];
  create(tx: Tx, ctx: ImportContext, values: Record<string, string>): Promise<{ id: string }>;
  /** Fills only `fields` (from fills()) on the record; returns the record's values before, for undo (AG-18-40). */
  merge(tx: Tx, ctx: ImportContext, existing: Existing, values: Record<string, string>, fields: string[]): Promise<{ before: Record<string, string | null> }>;
}
/** A target's store cannot be reached (not a fault of the row): the engine stops the job, to be retried from the first
 *  row not written. Any other error a target throws makes that row an error and the run goes on. */
export class ImportTargetUnavailable extends Error { constructor(m = "the record store is not reachable") { super(m); this.name = "ImportTargetUnavailable"; } }
/** The engine's mapping, as stored on the batch: each file column (by its header) to one field or to nothing. */
export const Mapping = z.strictObject({
  columns: z.record(z.string().max(200), z.string().regex(NAME).nullable()),
  declared: z.boolean().default(false),
});
export type Mapping = z.output<typeof Mapping>;
/** A mapping's own faults, against the target and the file's header: names only (shown as words by the engine). */
export function mappingFaults(t: Pick<ImportTarget, "fields">, header: readonly string[], m: Mapping): { column?: string; field?: string; rule: string }[] {
  const out: { column?: string; field?: string; rule: string }[] = [];
  const known = new Set(t.fields.map((f) => f.key)), seen = new Map<string, string>();
  for (const col of Object.keys(m.columns)) if (!header.includes(col)) out.push({ column: col, rule: "unknown_column" });
  for (const [col, field] of Object.entries(m.columns)) {
    if (field === null) continue;
    if (!known.has(field)) { out.push({ column: col, field, rule: "unknown_field" }); continue; }
    if (seen.has(field)) out.push({ column: col, field, rule: "field_mapped_twice" });
    seen.set(field, col);
  }
  for (const f of t.fields) if (f.required && !seen.has(f.key)) out.push({ field: f.key, rule: "required_field_not_mapped" });
  if (!seen.size) out.push({ rule: "nothing_mapped" });
  return out;
}
/** The first mapping offered for a file: a column whose header (lower case, trimmed) is a field's key, label or alias. */
export function suggestMapping(t: Pick<ImportTarget, "fields">, header: readonly string[]): Mapping {
  const columns: Record<string, string | null> = {}, used = new Set<string>();
  for (const col of header) {
    const h = col.trim().toLowerCase();
    const f = t.fields.find((x) => !used.has(x.key) && (x.key.toLowerCase() === h || x.label.toLowerCase() === h || x.aliases.includes(h)));
    columns[col] = f ? f.key : null;
    if (f) used.add(f.key);
  }
  return { columns, declared: false };
}
/** The registry the engine reads; areas register their targets at start-up. A second target with one key is refused. */
export class ImportTargets<Tx = unknown> {
  private readonly byKey = new Map<string, ImportTarget<Tx>>();
  register(t: ImportTarget<Tx>): void {
    if (!NAME.test(t.key) || !NAME.test(t.recordKind) || !NAME.test(t.keyField)) throw new Error(`ImportTargets: ${t.key}: key, record kind and key field are names`);
    if (this.byKey.has(t.key)) throw new Error(`ImportTargets: ${t.key} is already registered`);
    const fields = t.fields.map((f) => TargetField.parse(f));
    if (new Set(fields.map((f) => f.key)).size !== fields.length || !fields.some((f) => f.key === t.keyField)) throw new Error(`ImportTargets: ${t.key}: field keys are unique and include the key field`);
    this.byKey.set(t.key, t);
  }
  get(key: string): ImportTarget<Tx> | undefined { return this.byKey.get(key); }
  list(): ImportTarget<Tx>[] { return [...this.byKey.values()]; }
}
