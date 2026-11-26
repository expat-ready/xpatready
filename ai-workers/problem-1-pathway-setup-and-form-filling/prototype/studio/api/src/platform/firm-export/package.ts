// PF-11 part 1: the one package writer of a data download (PF-26 imports it): one zip in memory (pizzip), README.txt, one CSV
// per section (text formula-safe by audit/csv.ts's csvCell; number and minor cells stay numbers: -1250), stored files under
// <module>/files/. The size is checked before each entry is added, never built past the cap (Lead B, correction 6 on #1972).
import PizZip from "pizzip";
import type { ExportColumn, ExportSection, ModuleExport } from "../../../../ports/firm-export.ts";
import { csvCell, csvRow } from "../audit/csv.ts";

/** A zip entry's fixed header bytes (local header 30, central directory 46, data descriptor 16), with room to spare. */
const ENTRY = 128;

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
  /** Largest package, in bytes: the uncompressed bytes and every entry's headers, and the finished zip. */
  cap: number;
  /** Lines the README adds after its own (the caller's gaps). */
  notes?: string[];
};
/** `missing`: the listed files the store did not have (module, name; never content): skipped, named in the README (part 2). */
export type Package = { bytes: Uint8Array; rowCounts: Record<string, number>; missing: { module: string; name: string }[] };

export async function buildPackage(p: PackageInput): Promise<Package> {
  const zip = new PizZip(), enc = new TextEncoder(), rowCounts: Record<string, number> = {};
  let size = 0;
  const add = (name: string, bytes: Uint8Array | string) => {
    const b = typeof bytes === "string" ? enc.encode(bytes) : bytes;
    const n = b.byteLength + ENTRY + 2 * enc.encode(name).byteLength;   // the bytes plus each entry's zip headers (break m3)
    if (size + n > p.cap) throw new ExportTooLarge();
    size += n; zip.file(name, b);
  };
  const readme = [p.title, `Made ${p.madeAt.toISOString()}.`, "Nothing in this download is masked: it holds personal data. Keep it safe.",
    "Each .csv file is UTF-8 with a header row. A text cell that starts with =, +, -, @ or a tab is written with a leading ' so a spreadsheet shows it as text.",
    "Amounts are whole minor units (cents) beside their own currency column: never converted, never added across currencies.", ""];
  // Per module: the sections, then the stored files (each size checked before it is added), then the README, which has one
  // line per file written in the file loop: stored, or listed but missing from the store (one lost object never blocks the
  // firm's whole download: PF-11 part 2, review Major 4; one line per file: round 2 Minor 1).
  const missing: Package["missing"] = [];
  for (const m of p.modules) {
    for (const s of m.sections) {
      rowCounts[`${m.module}/${s.key}`] = s.rows.length;
      readme.push(`${m.module}/${s.key}.csv: ${s.title} (${s.rows.length} rows).`);
      add(`${m.module}/${s.key}.csv`, sectionCsv(s));
    }
    for (const f of m.files) {
      const bytes = await p.file(f.key);
      if (!bytes) { missing.push({ module: m.module, name: f.name }); readme.push(`${m.module}/files/${f.name}: listed, but missing from the store when this download was made; it is not in this download.`); continue; }
      add(`${m.module}/files/${f.name}`, bytes);
      readme.push(`${m.module}/files/${f.name}: a stored file (sha256 ${f.sha256}).`);
    }
    if (m.words) readme.push(`${m.module}: ${m.words}`);
  }
  add("README.txt", [...readme, "", ...(p.notes ?? [])].join("\r\n") + "\r\n");
  const bytes = new Uint8Array(zip.generate({ type: "uint8array", compression: "DEFLATE" }));
  if (bytes.byteLength > p.cap) throw new ExportTooLarge();
  return { bytes, rowCounts, missing };
}
