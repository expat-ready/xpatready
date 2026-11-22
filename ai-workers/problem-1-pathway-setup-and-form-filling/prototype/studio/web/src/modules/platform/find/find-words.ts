// PF-30s (BACKLOG row PF-30s; concept screens/PF-30s/concept.md r2): the find box's words and the answer it reads, PF-30a's
// `GET /api/platform/find` (`ports/find.ts` FindResult). Pure code: the box and its test read the same words.

/** One hit as PF-30a answers it. */
export type FindHit = { kind: string; id: string; title: string; subtitle: string | null; matched_on: ("NAME" | "EMAIL" | "PHONE" | "NUMBER")[]; url: string };
/** PF-30a's answer: hits grouped by kind in rank order, and the partial line when a module was dropped. */
export type FindAnswer = { groups: { kind: string; hits: FindHit[] }[]; partial: boolean; message: string | null };

/** Each kind's group words (BR-3): PF-30a's front-office finder answers person, prospect and company; CS-S1 part 2's
 *  case finder (#2913) answers case and case_person. Clients get their words when a finder answers a client kind. A kind
 *  not named here shows under "Other", never hidden (challenge M2). */
export const GROUP_OF: Readonly<Record<string, string>> = { person: "Leads and prospects", prospect: "Leads and prospects", company: "Companies", case: "Cases", case_person: "People on cases" };
export const OTHER = "Other";

/** What matched, in words (BR-4). */
export const MATCHED_WORDS = { NAME: "Name", EMAIL: "Email", PHONE: "Phone", NUMBER: "File number" } as const;

/** One finder answers at most this many hits (PF-30a's FINDER_MAX_HITS) and one answer at most FIND_MAX_HITS. */
export const FINDER_CAP = 8, ANSWER_CAP = 20;
/** Which finder answers each kind: a finder's cap counts all its kinds together (review r2 n3: the front office's one
 *  finder returns people, prospects and companies cut to 8 in all). An unknown kind counts as its own finder. */
const FINDER_OF: Readonly<Record<string, string>> = { person: "front-office", prospect: "front-office", company: "front-office", case: "cases", case_person: "cases" };
/** True when the answer may have been cut: a finder at its cap, or the whole answer at its cap (review m6b). */
export function capped(a: FindAnswer): boolean {
  const per = new Map<string, number>();
  for (const g of a.groups) { const f = FINDER_OF[g.kind] ?? g.kind; per.set(f, (per.get(f) ?? 0) + g.hits.length); }
  return [...per.values()].some((n) => n >= FINDER_CAP) || [...per.values()].reduce((x, y) => x + y, 0) >= ANSWER_CAP;
}

export const WORDS = {
  label: "Find a person, company or file",
  open: "Find",
  placeholder: "Find a person or file",
  searching: "Searching…",
  empty: "No matches. Try an email, phone or file number",
  emptyPartial: "No matches in what loaded.",
  tooLong: "Type 2 to 100 characters to search.",
  error: "Search is not available right now. Try again.",
  count: (n: number, cut = false) => (cut ? `${n} best matches. Type more to narrow.` : n === 1 ? "1 result" : `${n} results`),
} as const;

/** The text as the box sends it: trimmed; null when it is under 2 or over 100 characters (counted as characters, as PF-30a). */
export function sendable(raw: string): string | null {
  const t = raw.trim(), n = [...t].length;
  return n >= 2 && n <= 100 ? t : null;
}

/** The answer's hits in the API's rank order (challenge M1), each kind under its group words; a group label seen again
 *  (person and prospect) joins the group it first appeared in. */
export function grouped(a: FindAnswer): { label: string; hits: FindHit[] }[] {
  const out: { label: string; hits: FindHit[] }[] = [];
  for (const g of a.groups) {
    const label = GROUP_OF[g.kind] ?? OTHER;
    const at = out.find((x) => x.label === label);
    if (at) at.hits.push(...g.hits); else out.push({ label, hits: [...g.hits] });
  }
  return out;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
/** The title split around the first appearance of the typed text, ignoring case and accents, for the highlight (BR-4).
 *  Folding keeps one character per base letter for Latin text; when it changes the length, no highlight. */
export function marked(title: string, typed: string): { before: string; match: string; after: string } | null {
  const t = fold(typed.trim()), f = fold(title);
  if (!t || f.length !== title.length) return null;
  const i = f.indexOf(t);
  return i < 0 ? null : { before: title.slice(0, i), match: title.slice(i, i + t.length), after: title.slice(i + t.length) };
}

/** True when "/" should open the box (BR-1): no Ctrl, Meta or Alt, not composing, not already handled, not while the
 *  person types in a field, and not while a modal dialog or drawer is open. */
export function slashOpens(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; isComposing?: boolean; defaultPrevented?: boolean; target: EventTarget | null }, doc?: { querySelector(s: string): unknown }): boolean {
  if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.defaultPrevented) return false;
  // The team's Radix Dialog and Panel set role="dialog" without aria-modal (review m2), so a dialog of either kind counts.
  if (doc?.querySelector("[aria-modal='true'], dialog[open], [role='dialog'], [role='alertdialog']")) return false;
  const el = e.target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return true;
  return !(el.isContentEditable || el.closest("input, textarea, select"));   // any editable area, "plaintext-only" too (break m6)
}
