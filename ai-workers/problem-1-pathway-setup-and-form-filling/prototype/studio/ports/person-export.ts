// PF-26 part 1 (map row 34, R1.34; AG-2-93, SA-11-36, SA-11-40; shape product/screens/PF-26/shape.md): the person export
// port. Each module registers one exporter; the export job (part 2, api/src/platform/person-export/) asks every registered
// exporter for its sections about one person record of one firm and builds one package (JSON; the PDF is part 5). Parts
// 3a and 3b register the platform's and front office's exporters; the case side and client money register theirs (CS-X1,
// part 4).
// The rules every registry keeps (ports/contracts/person-export-port.contract.ts proves them on each):
// 1. A module registers once (a second register of the same module is refused); its name is a dotted lower-case word, and
//    it declares the section names it may answer (lower-case words), at least one, each once.
// 2. exporters() lists them in the order they registered, so a package is repeatable.
// The rules every exporter keeps (the job relies on them; the contract's exporterCases prove them on each exporter):
// 3. sections(tx, subject) runs inside the job's one read-only transaction, in the subject's firm scope. It reads only that
//    one person record (and the earlier records merged into it, `subject.records`) of that firm: never a family member,
//    never another person on the same case or prospect, never another firm (SA-11-40).
// 4. It answers only the sections it declared, each at most once; an empty section is answered, never left out, so the
//    package shows the module looked (AG-2-93 edge case: "the AG-02 sections are empty and the package still builds").
// 5. Complete and unmasked (AG-2-93 rule 5, AG7-D10): it never masks a value. An item still held in "Recently deleted"
//    is included with `deleted: true` (AG-2-93 rule 11). Items are plain JSON (no undefined, no function, no NaN).
// The package (buildPersonPackage): every exporter's sections in registration order; one exporter failing fails the whole
// build, so no partial package is ever offered (AG-2-93 test "Failure state"). Legal reading Unconfirmed: no counsel.
// This folder imports only zod and its own files (case-side contract v0.1 §1 rule 3).
import { z } from "zod";
import { FirmId } from "./audit.ts";

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "a uuid");
export const ModuleName = z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/, "a module name (dotted lower-case words)").max(60);
export const SectionName = z.string().regex(/^[a-z][a-z0-9-]*$/, "a section name (a lower-case word)").max(60);

/** The one person record of one firm the package is about. `records` is that record's id first, then every earlier record
 *  merged into it (FO-9b's merge lineage; AG-2-93 rule 3), each once. */
const LowerUuid = Uuid.transform((u) => u.toLowerCase());   // review m5: one spelling of every id in the package
export const ExportSubject = z.strictObject({
  firmId: FirmId.transform((u) => u.toLowerCase()),
  personId: LowerUuid,
  records: z.array(LowerUuid).min(1).max(200),
}).refine((s) => s.records[0] === s.personId, "records start with the person's own id")
  .refine((s) => new Set(s.records).size === s.records.length, "each record once");
export type ExportSubject = z.input<typeof ExportSubject>;

/** Plain JSON only: a value a JSON reader gets back exactly (rule 5). */
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
const JsonValue: z.ZodType<Json> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(), z.array(JsonValue), z.record(z.string(), JsonValue),
]));
/** One item: its fields as plain JSON; `deleted: true` marks an item still held in Recently deleted (rule 5). */
export const ExportItem = z.record(z.string(), JsonValue).refine((i) => !("deleted" in i) || i.deleted === true, "deleted is true or absent");
export type ExportItem = z.infer<typeof ExportItem>;

export const ExportSection = z.strictObject({
  name: SectionName,
  /** The section's plain-words title in the package ("Consent records"). */
  title: z.string().trim().min(1).max(120),
  items: z.array(ExportItem).max(100_000),
});
export type ExportSection = z.infer<typeof ExportSection>;

export interface PersonExporter<Tx = unknown> {
  readonly module: string;
  /** Every section name this exporter may answer (rule 1). */
  readonly declares: readonly string[];
  sections(tx: Tx, subject: ExportSubject): Promise<ExportSection[]>;
}

export interface PersonExportPort<Tx = unknown> {
  register(exporter: PersonExporter<Tx>): void;
  exporters(): ReadonlyArray<PersonExporter<Tx>>;
}

/** A refused registration: a second register of one module, a name that is not one, or a bad declaration. */
export class PersonExportRefused extends Error {
  constructor(message: string) { super(message); this.name = "PersonExportRefused"; }
}

/** An exporter that broke rule 3, 4 or 5, or threw: the build stops (no partial package). Named by module only; the cause
 *  may hold personal data and goes to the log, never to the request's record. */
export class ExporterFailed extends Error {
  constructor(readonly module: string, readonly why: string, readonly cause?: unknown) { super(`exporter ${module} failed: ${why}`); this.name = "ExporterFailed"; }
}

/** Rules 1 and 2, shared by every registry. */
export function registerInto<Tx>(list: PersonExporter<Tx>[], exporter: PersonExporter<Tx>): void {
  const name = ModuleName.safeParse(exporter?.module);
  if (!name.success) throw new PersonExportRefused(`register: "${String(exporter?.module)}" is not a module name`);
  if (typeof exporter.sections !== "function") throw new PersonExportRefused(`register: ${name.data} has no sections function`);
  const declares = z.array(SectionName).min(1).max(60).safeParse(exporter.declares);
  if (!declares.success) throw new PersonExportRefused(`register: ${name.data} declares no list of section names`);
  if (new Set(declares.data).size !== declares.data.length) throw new PersonExportRefused(`register: ${name.data} declares a section twice`);
  if (list.some((e) => e.module === name.data)) throw new PersonExportRefused(`register: ${name.data} has already registered its exporter`);
  const sections = exporter.sections.bind(exporter);
  list.push(Object.freeze({ module: name.data, declares: Object.freeze([...declares.data]), sections }));   // fixed at registration
}

/** An in-memory registry (tests and the case side's own checks). */
export function fakePersonExport<Tx = unknown>(): PersonExportPort<Tx> {
  const list: PersonExporter<Tx>[] = [];
  return { register: (e) => registerInto(list, e), exporters: () => [...list] };
}

export const PACKAGE_FORMAT = "expatready.person-export/1";
export type PersonPackage = {
  format: typeof PACKAGE_FORMAT;
  firmId: string;
  personId: string;
  /** The person's record and every earlier record merged into it. */
  records: string[];
  generatedAt: string;
  /** Never masked (AG-2-93 rule 5). */
  masked: false;
  modules: { module: string; sections: ExportSection[] }[];
};

/** A key a JSON reader would not get back as data: `__proto__` is dropped by zod's record and by object spread, so an item
 *  holding one would lose data silently (review m2). Depth-first over the raw answer, before zod reads it. */
function hasProtoKey(v: unknown, depth = 0): boolean {
  if (depth > 64 || v === null || typeof v !== "object") return false;
  if (Array.isArray(v)) return v.some((x) => hasProtoKey(x, depth + 1));
  return Object.prototype.hasOwnProperty.call(v, "__proto__") || Object.values(v).some((x) => hasProtoKey(x, depth + 1));
}

/** Rules 3 to 5 checked on one exporter's answer; ExporterFailed names what broke, never a key or value of the data
 *  (review m3: a key may be an email). A RangeError (an item nested too deep for the check) is the module's failure too. */
export function checkAnswer(exporter: Pick<PersonExporter, "module" | "declares">, answer: unknown): ExportSection[] {
  if (!Array.isArray(answer)) throw new ExporterFailed(exporter.module, "its answer is not a list of sections");
  const seen = new Set<string>(), out: ExportSection[] = [];
  for (const raw of answer) {
    let s: ReturnType<typeof ExportSection.safeParse>;
    try {
      if (hasProtoKey(raw)) throw new ExporterFailed(exporter.module, "an item holds a __proto__ key");
      s = ExportSection.safeParse(raw);
    } catch (e) { throw e instanceof ExporterFailed ? e : new ExporterFailed(exporter.module, "a section could not be checked (too deep or too large)", e); }
    if (!s.success) throw new ExporterFailed(exporter.module, `a section is not well formed (${s.error.issues[0]?.code ?? "invalid"})`);
    if (!exporter.declares.includes(s.data.name)) throw new ExporterFailed(exporter.module, `section ${s.data.name} was not declared`);
    if (seen.has(s.data.name)) throw new ExporterFailed(exporter.module, `section ${s.data.name} answered twice`);
    seen.add(s.data.name); out.push(s.data);
  }
  const missing = exporter.declares.filter((d) => !seen.has(d));
  if (missing.length) throw new ExporterFailed(exporter.module, `declared sections not answered: ${missing.join(", ")} (an empty section is answered, rule 4)`);
  return out;
}

/** The package: every registered exporter in order, its answer checked; the first failure stops the build. `run` gives
 *  each exporter the job's transaction (the fake gives none). */
export async function buildPersonPackage<Tx>(port: PersonExportPort<Tx>, run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>,
  rawSubject: ExportSubject, now: Date): Promise<PersonPackage> {
  const subject = ExportSubject.parse(rawSubject);
  const exporters = port.exporters();
  if (!exporters.length) throw new ExporterFailed("(none)", "no module has registered an exporter");
  return run(async (tx) => {
    const modules: PersonPackage["modules"] = [];
    for (const e of exporters) {
      let answer: unknown;
      try { answer = await e.sections(tx, { ...subject, records: [...subject.records] }); } catch (cause) { throw new ExporterFailed(e.module, "it threw", cause); }
      modules.push({ module: e.module, sections: checkAnswer(e, answer) });
    }
    return { format: PACKAGE_FORMAT, firmId: subject.firmId, personId: subject.personId, records: [...subject.records], generatedAt: now.toISOString(), masked: false, modules };
  });
}

/** The package as the bytes stored and downloaded (UTF-8 JSON, two-space indent) and their sha256 (hex), for the audit
 *  line (which never holds the content). */
export async function packageBytes(p: PersonPackage): Promise<{ bytes: Uint8Array; sha256: string }> {
  let text: string;
  try { text = `${JSON.stringify(p, null, 2)}\n`; } catch (e) { throw new ExporterFailed("(package)", "the package is too large to write as one file", e); }   // review m4
  const bytes = new TextEncoder().encode(text);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return { bytes, sha256: [...digest].map((b) => b.toString(16).padStart(2, "0")).join("") };
}
