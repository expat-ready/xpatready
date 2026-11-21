// AUD-4 (AG-13-43, AG-16-22): the one CSV writer of the audit trail, shared with AUD-3 (our side's search). UTF-8 with a
// header row, RFC 4180 quoting (a cell with a comma, a quote, a carriage return or a line feed is quoted, quotes doubled,
// rows end CRLF), and spreadsheet formula injection refused: any cell that starts with =, +, -, @, a tab or a carriage
// return is written with a leading ' so a spreadsheet shows it as text (OWASP "CSV Injection").

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

/** One cell: null and undefined are empty; anything not a string is its JSON (a number or boolean as written). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return NEEDS_QUOTES.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row, ending CRLF. */
export const csvRow = (cells: readonly unknown[]): string => `${cells.map(csvCell).join(",")}\r\n`;
