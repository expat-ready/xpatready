// PF-11 part 1 (map row 22; SA-2-33, AG-16-20, AG-16-22): the firm's full data download. Each module registers one
// exporter; the export job collects every module's sections for one firm and writes one zip (api/src/platform/firm-export/).
// The section shape is the one PF-26's PersonExportPort and CS-X1's case-side exporter use: tables (key, title, typed
// columns, rows), stored files by key with their sha256, and an optional plain note. Personal data is never masked
// (AG-16-20). The real adapter (PgFirmExport) runs each exporter inside one REPEATABLE READ, READ ONLY transaction opened
// inside withFirm(firmId) (PF-12: a read outside that scope returns nothing). This folder imports only zod.
import { z } from "zod";
import { FirmId } from "./audit.ts";

/** A column: text is written formula-safe; number and minor stay numbers (-1250, never '-1250); minor is an amount in
 *  minor units and names the text column holding its currency (AG-16-22: never converted, never summed). */
export const ExportColumn = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/, "a lower-case column key"),
  kind: z.enum(["text", "number", "boolean", "date", "minor"]),
  currency: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/).optional(),
});
const Cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const ExportSection = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/, "a lower-case section key (its CSV file name)"),
  title: z.string().trim().min(1).max(200),
  columns: z.array(ExportColumn).min(1).max(200),
  rows: z.array(z.array(Cell)),
});
export const ExportFile = z.strictObject({
  key: z.string().min(1).max(300),
  name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/, "a plain file name"),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export const ModuleExport = z.strictObject({
  module: z.string().regex(/^[a-z][a-z0-9-]{0,40}$/, "a lower-case module name"),
  sections: z.array(ExportSection),
  files: z.array(ExportFile).default([]),
  words: z.string().max(2000).optional(),
});
export type ExportColumn = z.infer<typeof ExportColumn>;
export type ExportSection = z.infer<typeof ExportSection>;
export type ModuleExport = z.output<typeof ModuleExport>;
export type ModuleExportInput = z.input<typeof ModuleExport>;

/** One module's exporter: reads its own tables for `firmId` through `tx` only (the adapter's read-only transaction). */
export type FirmExporter<Tx = unknown> = (firmId: string, tx: Tx) => Promise<ModuleExportInput>;

export interface FirmExportPort<Tx = unknown> {
  /** Adds a module's exporter; a second exporter under the same module name is refused. */
  register(module: string, exporter: FirmExporter<Tx>): void;
  /** The registered modules, in the order they registered. */
  modules(): string[];
  /** Every module's export for `firmId`, in registration order, each checked by checkModuleExport. */
  collect(firmId: string): Promise<ModuleExport[]>;
}

/** Refused: a module's answer breaks the shape, or holds a row of another firm. */
export class FirmExportRefused extends Error {
  constructor(message: string) { super(message); this.name = "FirmExportRefused"; }
}

/** The one check every adapter makes on an exporter's answer: the shape; its module name; each row as long as its
 *  columns, each cell of its column's kind; a minor column's currency column present; and any `firm_id` column holding
 *  this firm only (a section with another firm's row fails: PF-11 DW6). */
export function checkModuleExport(firmId: string, module: string, raw: unknown): ModuleExport {
  const firm = FirmId.parse(firmId).toLowerCase();
  const p = ModuleExport.safeParse(raw);
  if (!p.success) throw new FirmExportRefused(`${module}: ${p.error.issues[0]?.path.join(".")} ${p.error.issues[0]?.message}`);
  const out = p.data;
  if (out.module !== module) throw new FirmExportRefused(`${module}: the answer names module ${out.module}`);
  const keys = new Set<string>();
  for (const s of out.sections) {
    if (keys.has(s.key)) throw new FirmExportRefused(`${module}: section ${s.key} twice`);
    keys.add(s.key);
    const cols = s.columns.map((c) => c.key);
    for (const c of s.columns) if (c.kind === "minor" && !s.columns.some((d) => d.key === c.currency && d.kind === "text")) throw new FirmExportRefused(`${module}/${s.key}: ${c.key} names no currency column`);
    const firmCol = cols.indexOf("firm_id");
    for (const r of s.rows) {
      if (r.length !== cols.length) throw new FirmExportRefused(`${module}/${s.key}: a row of ${r.length} cells for ${cols.length} columns`);
      s.columns.forEach((c, i) => {
        const v = r[i], kind = c.kind === "minor" ? "number" : c.kind === "date" ? "string" : c.kind === "text" ? "string" : c.kind;
        if (v !== null && typeof v !== kind) throw new FirmExportRefused(`${module}/${s.key}: ${c.key} holds a ${typeof v}`);
        if (c.kind === "minor" && v !== null && !Number.isInteger(v)) throw new FirmExportRefused(`${module}/${s.key}: ${c.key} is not whole minor units`);
      });
      if (firmCol >= 0 && String(r[firmCol]).toLowerCase() !== firm) throw new FirmExportRefused(`${module}/${s.key}: a row of another firm`);
    }
  }
  return out;
}

/** The fake: in memory; each exporter is called with tx = null (a fake has no transaction). */
export function fakeFirmExport(): FirmExportPort<null> {
  const list: { module: string; exporter: FirmExporter<null> }[] = [];
  return {
    register(module, exporter) {
      if (list.some((m) => m.module === module)) throw new FirmExportRefused(`${module}: already registered`);
      list.push({ module, exporter });
    },
    modules: () => list.map((m) => m.module),
    async collect(firmId) {
      const out: ModuleExport[] = [];
      for (const m of list) out.push(checkModuleExport(firmId, m.module, await m.exporter(firmId, null)));
      return out;
    },
  };
}
