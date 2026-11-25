// PF-10b part 1 (AG-18-4, -6, -58): a CSV file read as values only. RFC 4180 (quoted fields, doubled quotes, line breaks
// inside quotes, CRLF or LF), UTF-8 only (a byte that is not UTF-8 is refused, never guessed), one byte-order mark
// dropped, a comma or semicolon separator (the header's line decides). A cell is text: nothing is evaluated, so a formula
// such as =HYPERLINK(...) is stored as the text it is (AG-18-6). Our own reader: no new library (STANDARDS §1).
/** Sample ceilings (AG-18-58: the refusal names the limit). */
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 5000;
export const MAX_COLUMNS = 60;
export const MAX_CELL = 2000;
/** A column's name in the first line (the mapping keys it; ports/import-target.ts Mapping). */
export const MAX_HEADER = 200;
export class CsvRefused extends Error {
  constructor(readonly code: "NOT_UTF8" | "TOO_LARGE" | "HEADER_TOO_LONG" | "TOO_MANY_ROWS" | "TOO_MANY_COLUMNS" | "CELL_TOO_LONG" | "NO_HEADER" | "HEADER_REPEATED" | "UNCLOSED_QUOTE" | "NO_ROWS", message: string) { super(message); this.name = "CsvRefused"; }
}
export type Csv = { header: string[]; rows: string[][] };
/** Reads the file's bytes into a header and rows (a fully empty line is skipped). Refuses with words naming the limit. */
export function readCsv(bytes: Uint8Array): Csv {
  if (bytes.byteLength > MAX_BYTES) throw new CsvRefused("TOO_LARGE", `The file is too large: at most ${MAX_BYTES / 1024 / 1024} MB.`);
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new CsvRefused("NOT_UTF8", "The file is not UTF-8 text. Save it as \"CSV UTF-8\" and upload it again."); }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.slice(0, text.search(/\r|\n|$/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const records: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, i = 0, cellStarted = false;
  const endCell = () => {
    if ([...cell].length > MAX_CELL) throw new CsvRefused("CELL_TOO_LONG", `A cell on line ${records.length + 1} is too long: at most ${MAX_CELL} characters.`);
    row.push(cell); cell = ""; cellStarted = false;
    if (row.length > MAX_COLUMNS) throw new CsvRefused("TOO_MANY_COLUMNS", `The file has too many columns: at most ${MAX_COLUMNS}.`);
  };
  const endRow = () => {
    endCell();
    if (!row.every((c) => c.trim() === "")) records.push(row);
    if (records.length > MAX_ROWS + 1) throw new CsvRefused("TOO_MANY_ROWS", `The file has too many rows: at most ${MAX_ROWS.toLocaleString("en-CA")} besides the header.`);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === "\"") { if (text[i + 1] === "\"") { cell += "\""; i += 2; continue; } quoted = false; i++; continue; }
      cell += ch; i++; continue;
    }
    if (ch === "\"" && !cellStarted) { quoted = true; cellStarted = true; i++; continue; }
    if (ch === sep) { endCell(); i++; continue; }
    if (ch === "\r" && text[i + 1] === "\n") { endRow(); i += 2; continue; }
    if (ch === "\n" || ch === "\r") { endRow(); i++; continue; }
    cell += ch; cellStarted = true; i++;
  }
  if (quoted) throw new CsvRefused("UNCLOSED_QUOTE", `A quoted cell is never closed (from line ${records.length + 1}).`);
  if (cell !== "" || row.length) endRow();
  const header = (records.shift() ?? []).map((h) => h.trim());
  if (!header.length || header.every((h) => h === "")) throw new CsvRefused("NO_HEADER", "The first line names the columns: it is empty.");
  const blank = header.findIndex((h) => h === "");
  if (blank >= 0) throw new CsvRefused("NO_HEADER", `Column ${blank + 1} has no name in the first line.`);
  const long = header.findIndex((h) => [...h].length > MAX_HEADER || /[\p{Cc}\p{Cf}]/u.test(h));
  if (long >= 0) throw new CsvRefused("HEADER_TOO_LONG", `Column ${long + 1}'s name in the first line is over ${MAX_HEADER} characters or has a control character: is the first line the column names?`);
  const dup = header.findIndex((h, k) => header.indexOf(h) !== k);
  if (dup >= 0) throw new CsvRefused("HEADER_REPEATED", `Columns ${header.indexOf(header[dup]) + 1} and ${dup + 1} have the same name: give each column its own name.`);
  if (!records.length) throw new CsvRefused("NO_ROWS", "The file has a header and no rows.");
  return { header, rows: records };
}
/** A cell for a CSV a person opens in a spreadsheet: a leading =, +, -, @, tab or carriage return is prefixed with a
 *  quote mark so it is never run as a formula (AG-18-21; OWASP CSV injection). */
export function safeCell(v: string): string {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
}
