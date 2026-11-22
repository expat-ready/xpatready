// PF-30s (BACKLOG row PF-30s; concept screens/PF-30s/concept.md): the find box's words and the answer it reads, PF-30a's
// `GET /api/platform/find` (`ports/find.ts` FindResult). Pure code: the box and its test read the same words.

/** One hit as PF-30a answers it. */
export type FindHit = { kind: string; id: string; title: string; subtitle: string | null; matched_on: ("NAME" | "EMAIL" | "PHONE" | "NUMBER")[]; url: string };
/** PF-30a's answer: hits grouped by kind, and the partial line when a module was dropped. */
export type FindAnswer = { groups: { kind: string; hits: FindHit[] }[]; partial: boolean; message: string | null };

/** The groups in the row's order, each with the kinds it shows (BR-3). A kind not named here is not shown. */
export const GROUPS: readonly { label: string; kinds: readonly string[] }[] = [
  { label: "Leads and prospects", kinds: ["person", "prospect"] },
  { label: "Companies", kinds: ["company"] },
  { label: "Clients", kinds: ["client"] },
  { label: "Cases", kinds: ["case"] },
  { label: "People on cases", kinds: ["case_person"] },
];

/** What matched, in words (BR-4). */
export const MATCHED_WORDS = { NAME: "Name", EMAIL: "Email", PHONE: "Phone", NUMBER: "File number" } as const;

export const WORDS = {
  label: "Find a person, company or file",
  placeholder: "Find a person or file",
  searching: "Searching…",
  empty: "No matches. Try an email, phone or file number",
  tooLong: "Type 2 to 100 characters to search.",
  error: "Search is not available right now. Try again.",
  count: (n: number) => (n === 1 ? "1 result" : `${n} results`),
} as const;

/** The text as the box sends it: trimmed; null when it is under 2 or over 100 characters (counted as characters, as PF-30a). */
export function sendable(raw: string): string | null {
  const t = raw.trim(), n = [...t].length;
  return n >= 2 && n <= 100 ? t : null;
}

/** The answer's hits in the box's groups and order (BR-3): empty groups and unknown kinds left out. */
export function grouped(a: FindAnswer): { label: string; hits: FindHit[] }[] {
  return GROUPS.map((g) => ({ label: g.label, hits: a.groups.filter((x) => g.kinds.includes(x.kind)).flatMap((x) => x.hits) })).filter((g) => g.hits.length > 0);
}

/** The title split around the first case-insensitive appearance of the typed text, for the highlight (BR-4). */
export function marked(title: string, typed: string): { before: string; match: string; after: string } | null {
  const t = typed.trim();
  if (!t) return null;
  const i = title.toLocaleLowerCase().indexOf(t.toLocaleLowerCase());
  return i < 0 ? null : { before: title.slice(0, i), match: title.slice(i, i + t.length), after: title.slice(i + t.length) };
}

/** True when "/" should open the box: not while the person types in a field (BR-1). */
export function slashOpens(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; target: EventTarget | null }): boolean {
  if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return false;
  const el = e.target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return true;
  return !el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
}
