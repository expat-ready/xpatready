// FO-5 (BR-1, BR-6; AG-5-9; contracts §2.3): the placeholders a retainer or consultation agreement template may use, the
// one list both the upload check and `GET /api/front-office/retainer-templates/placeholders` read. A template naming any
// other placeholder is refused with its name; one that never prints the client's name or the fee is accepted with a
// warning (BR-1). Only the client's name and the fee block Send (AG-5-9); every other empty value shows "missing" (BR-6).
// Inside the fee loop ({#fees} … {/fees}) the fields are named without the prefix ({label}); the list names them
// `fees.label` etc. The licence number prints only in the document a person sends (AG-1-30, -31: never in a log or event).

import { CODE_ITEMS } from "./code-checklist.ts";

export type Placeholder = { name: string; label: string; mustFill?: boolean; loop?: boolean };

export const PLACEHOLDERS: readonly Placeholder[] = [
  { name: "client.name", label: "Client name (the company's name for a Corporate prospect)", mustFill: true },
  { name: "client.email", label: "Client email" },
  { name: "client.phone", label: "Client phone" },
  { name: "company.name", label: "Company name (Corporate)" },
  { name: "signer.name", label: "Person who signs" },
  { name: "signer.email", label: "Signer's email" },
  { name: "representative.name", label: "Representative (licensed)" },
  { name: "representative.licensing_body", label: "Representative's licensing body" },
  { name: "representative.licence_number", label: "Representative's licence number" },
  { name: "firm.name", label: "Firm name" },
  { name: "agreement.date", label: "Date of this version" },
  { name: "agreement.version", label: "Version number" },
  { name: "fees", label: "Fee rows (loop: {#fees} … {/fees})", mustFill: true, loop: true },
  { name: "fees.label", label: "Fee: what it is for" },
  { name: "fees.amount", label: "Fee: amount (CAD)" },
  { name: "fees.when", label: "Fee: when it is due" },
  { name: "fees.due_on", label: "Fee: due date (On a date)" },
  { name: "fees.total", label: "Total of the fee rows (CAD)" },
  // FO-13c: the s. 24(3)(o) item, the disclosure of a potential conflict (the party's latest conflict check); empty otherwise.
  { name: "conflict.disclosure", label: "Disclosure of a potential conflict of interest (Code s. 24(3)(o))" },
  // FO-5b: one clause marker per Code s. 24(3) item ({code.s24_3_k}); it prints nothing and marks the item in the checklist.
  ...CODE_ITEMS.map((i) => ({ name: i.marks.clauseMarker, label: `Clause marker for Code s. ${i.section} (prints nothing)` })),
];
const KNOWN = new Set(PLACEHOLDERS.map((p) => p.name));

export type PlaceholderCheck = { placeholders: string[]; unknown: string[]; warnings: string[] };

/** BR-1: the unknown names (refused) and the warnings (accepted) of a template's placeholders. */
export function checkPlaceholders(found: string[]): PlaceholderCheck {
  const unknown = found.filter((n) => !KNOWN.has(n));
  const warnings: string[] = [];
  if (!found.includes("client.name")) warnings.push("This template never prints the client's name ({client.name}).");
  if (!found.includes("fees") && !found.includes("fees.total")) warnings.push("This template never prints the fee ({#fees} … {/fees} or {fees.total}).");
  return { placeholders: found, unknown, warnings };
}

/** The words of "When" for a fee row (BR-5). */
export const WHEN_WORDS: Record<string, string> = {
  ON_SIGNING: "On signing", ON_DATE: "On a date", WHEN_SUBMITTED: "When submitted", WHEN_DECIDED: "When decided", WHEN_DONE: "When done",
};

/** Cents to "CAD 1,234.50". */
export const cad = (minor: bigint | number) => {
  const n = BigInt(minor), neg = n < 0n, a = neg ? -n : n;
  return `${neg ? "-" : ""}CAD ${(a / 100n).toLocaleString("en-CA")}.${String(a % 100n).padStart(2, "0")}`;
};
