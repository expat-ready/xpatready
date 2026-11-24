// PF-11 part 1: the one package writer of a data download (PF-26 imports it). One zip in memory (pizzip, no new library):
// README.txt, one CSV per section (UTF-8, header row; text formula-safe by audit/csv.ts's csvCell; number and minor cells
// stay numbers: -1250), stored files under <module>/files/. The running size is checked before each file is added, so the
// file that would pass the cap stops the build (ExportTooLarge), never built past it (Lead B, correction 6 on #1972).
import PizZip from "pizzip";
import type { ExportColumn, ExportSection, ModuleExport } from "../../../../ports/firm-export.ts";
import { csvCell, csvRow } from "../audit/csv.ts";

export class ExportTooLarge extends Error {
  constructor() { super("too large for one download"); this.name = "ExportTooLarge"; }
}

const cell = (c: ExportColumn, v: unknown): string =>
  v === null || v === undefined ? "" : (c.kind === "number" || c.kind === "minor" || c.kind === "boolean") ? String(v) : csvCell(String(v));

/** One section as CSV text: the header row, then each row. */
export function sectionCsv(s: ExportSection): string {
  return csvRow(s.columns.map((c) => c.key)) + s.rows.map((r) => `${s.columns.map((c, i) => cell(c, r[i])).join(",")}\r\n`).join("");
}

export type PackageInput = {
  title: string;
  madeAt: Date;
  modules: ModuleExport[];
  /** The stored file's bytes by its key (FilesPort.get of the firm), or null when it is missing. */
  file: (key: string) => Promise<Uint8Array | null>;
  /** Largest package, in bytes (uncompressed sum; the zip is never larger). */
  cap: number;
  /** Lines the README adds after its own (the caller's gaps). */
  notes?: string[];
};
export type Package = { bytes: Uint8Array; rowCounts: Record<string, number> };

export async function buildPackage(p: PackageInput): Promise<Package> {
  const zip = new PizZip(), enc = new TextEncoder(), rowCounts: Record<string, number> = {};
  let size = 0;
  const add = (name: string, bytes: Uint8Array | string) => {
    const b = typeof bytes === "string" ? enc.encode(bytes) : bytes;
    if (size + b.byteLength > p.cap) throw new ExportTooLarge();
    size += b.byteLength; zip.file(name, b);
  };
  const readme = [p.title, `Made ${p.madeAt.toISOString()}.`, "Nothing in this download is masked: it holds personal data. Keep it safe.",
    "Each .csv file is UTF-8 with a header row. A text cell that starts with =, +, -, @ or a tab is written with a leading ' so a spreadsheet shows it as text.",
    "Amounts are whole minor units (cents) beside their own currency column: never converted, never added across currencies.", ""];
  for (const m of p.modules) {
    for (const s of m.sections) {
      rowCounts[`${m.module}/${s.key}`] = s.rows.length;
      readme.push(`${m.module}/${s.key}.csv: ${s.title} (${s.rows.length} rows).`);
    }
    for (const f of m.files) readme.push(`${m.module}/files/${f.name}: a stored file (sha256 ${f.sha256}).`);
    if (m.words) readme.push(`${m.module}: ${m.words}`);
  }
  add("README.txt", [...readme, "", ...(p.notes ?? [])].join("\r\n") + "\r\n");
  for (const m of p.modules) {
    for (const s of m.sections) add(`${m.module}/${s.key}.csv`, sectionCsv(s));
    for (const f of m.files) {
      const bytes = await p.file(f.key);
      if (!bytes) throw new Error(`${m.module}: a listed file is missing from the store`);
      add(`${m.module}/files/${f.name}`, bytes);
    }
  }
  return { bytes: new Uint8Array(zip.generate({ type: "uint8array", compression: "DEFLATE" })), rowCounts };
}
