// FO-3c (BACKLOG row FO-3c; P-627 (7)): what a consultation agreement states, as the regulator's Code lists it, and which
// of FO-5's template placeholders show each item. Source (trace t8, read 13 Nov 2026): Code of Professional Conduct for
// College of Immigration and Citizenship Consultants Licensees, SOR/2022-128, s. 23(2)(a)-(e),
// https://laws-lois.justice.gc.ca/eng/regulations/SOR-2022-128/FullText.html, page "current to 2026-10-19". Each quote is
// the Code's own words (15 words at most). The list only shows: a template missing an item is accepted and never blocks
// a booking or a send, and none of our words call an item "required" or "correct". Legal reading: Unconfirmed: no counsel.
//
// Items (d) and (e), and the licensee's address, phone and email in (a), have no placeholder in FO-5's list on main
// (retainers/placeholders.ts): they are the template's own wording, so they are shown as "not checked", never as missing.

export const CODE_S23 = {
  title: "Code of Professional Conduct for College of Immigration and Citizenship Consultants Licensees", instrument: "SOR/2022-128", section: "23(2)",
  url: "https://laws-lois.justice.gc.ca/eng/regulations/SOR-2022-128/FullText.html", currentTo: "2026-10-19", readOn: "2026-11-13", legalReading: "Unconfirmed: no counsel",
} as const;

export type S23Item = { letter: "a" | "b" | "c" | "d" | "e"; label: string; quote: string;
  /** Every group needs one of its placeholders; an empty list means no placeholder exists for the item ("not checked"). */
  groups: readonly (readonly string[])[]; note?: string };

export const S23_ITEMS: readonly S23Item[] = [
  { letter: "a", label: "The licensee's name and registration number", quote: "registration number, address, telephone number and email address",
    groups: [["representative.name"], ["representative.licence_number"]], note: "The licensee's address, phone and email have no placeholder: they are the template's own wording (not checked)." },
  { letter: "b", label: "The potential client's name and contact", quote: "the potential client's name and contact information", groups: [["client.name"], ["client.email", "client.phone"]] },
  { letter: "c", label: "The fee, or a pro bono statement", quote: "the fee for the consultation or, if the consultation is provided pro bono", groups: [["fees", "fees.total"]] },
  { letter: "d", label: "The College's role as regulator", quote: "a brief description of the College's role as the licensee's regulator", groups: [] },
  { letter: "e", label: "Purpose and scope of the consultation", quote: "a description of the purpose and scope of the consultation", groups: [] },
];

export type S23Shown = { letter: string; section: string; label: string; quote: string; state: "SHOWN" | "MISSING" | "NOT_CHECKED"; missingPlaceholders: string[]; note: string | null };

/** The template panel's list: each item SHOWN (its placeholders are in the template), MISSING (with the placeholders to
 *  add) or NOT_CHECKED (no placeholder exists for it). Never blocks. */
export function s23Check(placeholders: readonly string[]): S23Shown[] {
  const has = new Set(placeholders);
  return S23_ITEMS.map((i) => {
    const missing = i.groups.filter((g) => !g.some((p) => has.has(p))).map((g) => g.join(" or "));
    return { letter: i.letter, section: `s. 23(2)(${i.letter})`, label: i.label, quote: i.quote, state: !i.groups.length ? "NOT_CHECKED" : missing.length ? "MISSING" : "SHOWN", missingPlaceholders: missing, note: i.note ?? null };
  });
}
