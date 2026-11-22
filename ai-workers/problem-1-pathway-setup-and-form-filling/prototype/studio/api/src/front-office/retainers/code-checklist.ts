// FO-5b (BACKLOG row FO-5b; question 4 decided by Lead B under P-566 (3), confirmed by the founder as P-567 (2); contracts
// §7): the retainer checklist from the regulator's Code. A fixed list of the Code of Professional Conduct for College of
// Immigration and Citizenship Consultants Licensees (SOR/2022-128) s. 24(3) paragraphs (a)-(z), copied word for word into
// samples/cicc-code-s24-items.json with the section, the official URL, the page's "current to" date and the date read.
// Each item is marked in a template when the template uses one of the item's placeholders or carries its clause marker
// ({code.s24_3_<letter>}, a known placeholder that prints nothing: the render fills a missing value with "", docx-worker.ts).
// The checklist only shows: it never refuses a send (only AG-5-9's client name and fee block it). This departs from AG-05
// lines 539-550 exactly that far (P-567 (2)), and none of our words call an item "required" or "correct" (AG-05 rule 7).
// Legal reading: Unconfirmed: no counsel.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type CodeItem = { letter: string; section: string; text: string; url: string; currentTo: string; readOn: string; marks: { placeholders: string[]; clauseMarker: string }; howWeCheck: string };
type CodeFile = { source: { title: string; instrument: string; section: string; leadIn: string; url: string; currentTo: string; readOn: string; readNote: string }; legalReading: string; items: CodeItem[] };

const STUDIO = resolve(import.meta.dirname, "..", "..", "..", "..");
export const CODE_FILE = join(STUDIO, "samples", "cicc-code-s24-items.json");
const CODE: CodeFile = JSON.parse(readFileSync(CODE_FILE, "utf8"));
export const CODE_SOURCE = CODE.source;
export const CODE_ITEMS: readonly CodeItem[] = CODE.items;
export const LEGAL_READING = CODE.legalReading;
/** The clause markers a template may carry (placeholders.ts adds them to the known list). */
export const CODE_MARKERS: readonly string[] = CODE_ITEMS.map((i) => i.marks.clauseMarker);
/** The merge value that keeps, in each retainer version, the letters its template marked (write-once with the version, so
 *  a version's list never changes after it is made or sent). Not a placeholder: a template naming it is refused. */
export const CODE_MARKED = "code.marked";

/** The letters of the items a template's placeholders mark. */
export function markedLetters(placeholders: readonly string[]): string[] {
  const has = new Set(placeholders);
  return CODE_ITEMS.filter((i) => has.has(i.marks.clauseMarker) || i.marks.placeholders.some((p) => has.has(p))).map((i) => i.letter);
}

/** The source line: the Code, its section, its URL and its "current to" date. */
export const sourceLine = () => ({
  title: CODE_SOURCE.title, instrument: CODE_SOURCE.instrument, section: `s. ${CODE_SOURCE.section}`, url: CODE_SOURCE.url, currentTo: CODE_SOURCE.currentTo, readOn: CODE_SOURCE.readOn,
  line: `${CODE_SOURCE.title} (${CODE_SOURCE.instrument}), s. ${CODE_SOURCE.section}, current to ${CODE_SOURCE.currentTo}: ${CODE_SOURCE.url}`,
});

/** The template panel's checklist (GET retainer-templates/:id/checklist): every item, marked or not, with the Code's words. */
export function checklistFor(placeholders: readonly string[]) {
  const marked = new Set(markedLetters(placeholders));
  return {
    source: sourceLine(), marked: marked.size, total: CODE_ITEMS.length,
    summary: `${marked.size} of ${CODE_ITEMS.length} items marked in this template`,
    items: CODE_ITEMS.map((i) => ({ letter: i.letter, section: i.section, text: i.text, url: i.url, currentTo: i.currentTo, marked: marked.has(i.letter), placeholders: i.marks.placeholders, clauseMarker: `{${i.marks.clauseMarker}}`, howWeCheck: i.howWeCheck })),
    blocksSend: false, legalReading: LEGAL_READING,
  };
}

/** The draft's one quiet line: each item present or missing in the version's template, and the link to the checklist. */
export function draftChecklist(letters: readonly string[], template: { id: string; version: number; currentVersion: number | null }) {
  const has = new Set(letters);
  return {
    marked: has.size, total: CODE_ITEMS.length,
    // The template version this list came from, and the template's version now: the link shows the newest (review m1).
    templateVersion: template.version, templateCurrentVersion: template.currentVersion, templateChanged: template.currentVersion !== null && template.currentVersion !== template.version,
    line: `Code s. ${CODE_SOURCE.section}: ${has.size} of ${CODE_ITEMS.length} items marked in this agreement's template.`,
    link: `/api/front-office/retainer-templates/${template.id}/checklist`,
    items: CODE_ITEMS.map((i) => ({ letter: i.letter, section: i.section, present: has.has(i.letter) })),
    source: { section: `s. ${CODE_SOURCE.section}`, url: CODE_SOURCE.url, currentTo: CODE_SOURCE.currentTo },
    blocksSend: false, legalReading: LEGAL_READING,
  };
}

/** The letters a version keeps (CODE_MARKED), or null for a version made before FO-5b. */
export function lettersOf(values: Record<string, unknown>): string[] | null {
  const v = values[CODE_MARKED];
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;
}
