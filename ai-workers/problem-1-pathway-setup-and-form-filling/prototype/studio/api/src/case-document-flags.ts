// CS-D7 (map row 70; AG-9-12, AG-9-29, AG-9-64; R1.70): expiry, translation and notarisation flags on each case document.
// (1) Staff set the document's language (the Reader's guess stays a suggestion), translation and notarisation
//     (NOT_REQUIRED | REQUIRED | PROVIDED, PROVIDED with its detail) and the expiry date on it, here, one audit line per
//     flag changed, on the version they saw (409 otherwise).
// (2) A flag staff have not set reads the document type's default from the case's pinned release (CS-D7c, cited):
//     translation REQUIRED_IF_NOT_EN_FR is Required when the language is neither English nor French, Not required when it
//     is either, and not known until the language is picked.
// (3) On a type with that rule, a document whose translation is Required (or Provided) gives its person's checklist one
//     line "Translation + translator's affidavit", linked to the document and carrying the type's official words. It is
//     worked out on every read, so saving twice never adds a second line, and changing the language to English or French
//     takes it away. A type with no rule, or with no citation, adds none.
// (4) An expiry before today, or a document uploaded longer ago than the type's max_age_days, is a warning on its line,
//     never a block: no state changes. Sample until the immigration expert confirms. Rules only, no AI (US$0).
//   GET  /api/runtime/documents/:id/flags   { document, flags, defaults, languages, version }
//   POST /api/runtime/documents/:id/flags   { language?, translation?, translation_detail?, notarisation?, notarisation_detail?, expires_on?, version } → the same
import { Body, Controller, Get, Headers, HttpCode, HttpException, HttpStatus, Inject, Injectable, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { INVISIBLE, UNSTORABLE } from "../../contracts/documents.ts";
import type { SnapTypeDefaults } from "../../engine/snapshot.ts";
import { actorOf, Audit, CaseRead, Db, type Actor } from "./core.ts";
import { Runtime, type Reached } from "./runtime.ts";

type H = string | undefined;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const short = (id: string) => id.slice(0, 8);
export const FLAG_STATES = ["NOT_REQUIRED", "REQUIRED", "PROVIDED"] as const;
export type FlagState = (typeof FLAG_STATES)[number];
const STATE_WORDS: Record<FlagState, string> = { NOT_REQUIRED: "Not required", REQUIRED: "Required", PROVIDED: "Provided" };
/** Languages staff pick from (ISO 639-1; Sample list, the most common on applications); any other two-letter code is kept as typed. */
export const LANGUAGES: { code: string; name: string }[] = [["en", "English"], ["fr", "French"], ["ar", "Arabic"], ["bn", "Bengali"], ["zh", "Chinese"], ["de", "German"], ["hi", "Hindi"], ["it", "Italian"], ["ja", "Japanese"], ["ko", "Korean"], ["fa", "Persian"], ["pt", "Portuguese"], ["pa", "Punjabi"], ["ru", "Russian"], ["es", "Spanish"], ["tl", "Tagalog"], ["ta", "Tamil"], ["tr", "Turkish"], ["uk", "Ukrainian"], ["ur", "Urdu"], ["vi", "Vietnamese"]].map(([code, name]) => ({ code, name }));
export const languageName = (code: string | null) => (code ? LANGUAGES.find((l) => l.code === code)?.name ?? code : "not set");
export const OFFICIAL = new Set(["en", "fr"]);
export const TRANSLATION_LINE = "Translation + translator's affidavit";

type DocRow = { id: string; documentType: string; uploadedAt: Date; current: boolean; language: string | null; translation: string | null; translationDetail: string | null; notarisation: string | null; notarisationDetail: string | null; expiresOn: Date | null; flagsVersion: number };
export type DocFlags = {
  language: string | null; language_name: string;
  translation: FlagState | null; translation_detail: string | null; translation_from: "staff" | "type" | "not_set"; translation_words: string;
  notarisation: FlagState | null; notarisation_detail: string | null; notarisation_from: "staff" | "type" | "not_set";
  expires_on: string | null; warnings: string[]; version: number };
const day = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The document's flags as they stand: what staff set, else the type's default from the release; and its warnings. */
export function flagsOf(d: DocRow, t: SnapTypeDefaults | undefined, today: string): DocFlags {
  let translation = d.translation as FlagState | null, tFrom: DocFlags["translation_from"] = translation ? "staff" : "not_set", tWords = "";
  if (!translation && t?.translation_rule === "NOT_REQUIRED") { translation = "NOT_REQUIRED"; tFrom = "type"; tWords = "Not required by its document type."; }
  else if (!translation && t?.translation_rule === "REQUIRED_IF_NOT_EN_FR") {
    if (!d.language) tWords = "Pick the document's language: its type needs a translation when it is neither English nor French.";
    else { translation = OFFICIAL.has(d.language) ? "NOT_REQUIRED" : "REQUIRED"; tFrom = "type"; tWords = OFFICIAL.has(d.language) ? `In ${languageName(d.language)}: no translation needed.` : `In ${languageName(d.language)}: its type needs a translation and the translator's affidavit.`; }
  }
  if (tFrom === "staff") tWords = `${STATE_WORDS[translation!]}: set by staff${d.translationDetail ? ` (${d.translationDetail})` : ""}.`;
  if (!tWords) tWords = "Not set.";
  let notarisation = d.notarisation as FlagState | null, nFrom: DocFlags["notarisation_from"] = notarisation ? "staff" : "not_set";
  if (!notarisation && t?.notarisation_rule) { notarisation = t.notarisation_rule; nFrom = "type"; }
  const warnings: string[] = [];
  const exp = d.expiresOn ? day(d.expiresOn) : null;
  if (exp && exp < today) warnings.push(`Expired on ${exp}: check whether it is still accepted, or ask for a newer one. Nothing is blocked.`);
  if (!exp && t?.has_expiry) warnings.push("Its type has an expiry date: enter the date on the document.");
  if (t?.max_age_days) { const age = daysBetween(day(d.uploadedAt), today); if (age > t.max_age_days) warnings.push(`Uploaded ${age} days ago; its type asks for one no older than ${t.max_age_days} days. Nothing is blocked.`); }
  return { language: d.language, language_name: languageName(d.language), translation, translation_detail: d.translationDetail, translation_from: tFrom, translation_words: tWords,
    notarisation, notarisation_detail: d.notarisationDetail, notarisation_from: nFrom, expires_on: exp, warnings, version: d.flagsVersion };
}

export type TranslationLine = { id: string; label: string; document_id: string; for_document: string; file_name: string; state: "needed" | "provided"; words: string; quote: string; source: string };
/** (3) The translation lines one person's current documents give: one per document, only on a type with the rule and its citation. */
export function translationLines(docs: (DocRow & { fileName: string })[], typeOf: (key: string) => { name: string; defaults?: SnapTypeDefaults } | undefined, today: string): TranslationLine[] {
  const out: TranslationLine[] = [];
  for (const d of docs) {
    if (!d.current) continue;
    const t = typeOf(d.documentType), def = t?.defaults;
    if (def?.translation_rule !== "REQUIRED_IF_NOT_EN_FR" || !def.source_quote || !def.source_file) continue;
    const f = flagsOf(d, def, today);
    if (f.translation !== "REQUIRED" && f.translation !== "PROVIDED") continue;
    out.push({ id: `translation:${d.id}`, label: TRANSLATION_LINE, document_id: d.id, for_document: t!.name, file_name: d.fileName, state: f.translation === "PROVIDED" ? "provided" : "needed",
      words: f.translation === "PROVIDED" ? `Provided for ${t!.name} (${d.fileName})${f.translation_detail ? `: ${f.translation_detail}` : ""}.` : `For ${t!.name} (${d.fileName}), in ${f.language_name}.`, quote: def.source_quote, source: def.source_file });
  }
  return out;
}

const detail = z.string().refine((x) => !UNSTORABLE.test(x), "The detail has a character that cannot be stored (a control character or half of an emoji). Retype it.")
  .transform((x) => x.replace(INVISIBLE, "").trim()).pipe(z.string().max(300, "The detail is at most 300 characters.")).transform((x) => x || null);
export const SetFlags = z.strictObject({
  language: z.string().trim().toLowerCase().regex(/^[a-z]{2,3}$/, "Pick the language (a two-letter code such as es).").nullable().optional(),
  translation: z.enum(FLAG_STATES, { message: "translation is NOT_REQUIRED, REQUIRED, PROVIDED or null (back to the type's default)." }).nullable().optional(),
  translation_detail: detail.nullable().optional(),
  notarisation: z.enum(FLAG_STATES, { message: "notarisation is NOT_REQUIRED, REQUIRED, PROVIDED or null (back to the type's default)." }).nullable().optional(),
  notarisation_detail: detail.nullable().optional(),
  expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expires_on is a date, YYYY-MM-DD.").refine((x) => !Number.isNaN(Date.parse(`${x}T00:00:00Z`)) && day(new Date(`${x}T00:00:00Z`)) === x, "expires_on is not a real date.").nullable().optional(),
  version: z.number({ message: "Send \"version\": the flags' version you saw." }).int().min(0),
});
const problem = (status: number, code: string, title: string, detail: string): never => { throw new HttpException({ type: `https://expatready.local/problems/${code}`, title, status, code, detail }, status); };

@Injectable()
export class CaseDocumentFlags {
  constructor(@Inject(Runtime) private readonly r: Runtime, @Inject(Db) private readonly db: Db, @Inject(Audit) private readonly audit: Audit) {}

  /** The document on a case this staff member may reach; 404 in the same words for an unknown id or another firm's. */
  private async reach(actor: Actor, id: string) {
    if (!(actor.duties as readonly string[]).includes("case")) problem(403, "staff_only", "Staff only", `${actor.name} (simulated) cannot set a document's flags: firm staff do.`);
    if (!UUID.test(id)) problem(404, "no_document", "No such document", "No such document.");
    const d = await this.db.caseDocument.findUnique({ where: { id: id.toLowerCase() } });
    const p = d ? await this.db.caseParticipant.findFirst({ where: { subjectId: d.subjectId }, select: { caseId: true } }) : null;
    if (!d || !p) return problem(404, "no_document", "No such document", "No such document.");
    const c = await this.r.reach(actor, p.caseId, "officer").catch((e: unknown) => { if (e instanceof HttpException && e.getStatus() === HttpStatus.NOT_FOUND) problem(404, "no_document", "No such document", "No such document."); throw e; });
    return { d, c };
  }
  private typeOf(c: Reached, key: string) {
    return ((this.r.snapshotOf(c).document_types ?? []) as { key: string; name: string; defaults?: SnapTypeDefaults }[]).find((t) => t.key === key);
  }
  private view(c: Reached, d: DocRow & { fileName: string }) {
    const t = this.typeOf(c, d.documentType), today = new Date().toISOString().slice(0, 10);
    return { document: { id: d.id, type: d.documentType, name: t?.name ?? d.documentType, file_name: d.fileName, current: d.current }, flags: flagsOf(d, t?.defaults, today),
      defaults: t?.defaults ?? null, languages: LANGUAGES, translation_line: translationLines([d], (k) => this.typeOf(c, k), today)[0] ?? null };
  }

  async read(actor: Actor, id: string) { const { d, c } = await this.reach(actor, id); return this.view(c, d); }

  async set(actor: Actor, id: string, body: unknown) {
    const b = SetFlags.safeParse(body);
    if (!b.success) problem(400, "check_flags", "Check the flags", b.error!.issues[0]?.message ?? "Check the flags.");
    const x = b.data!;
    const { d, c } = await this.reach(actor, id);
    if (x.version !== d.flagsVersion) problem(409, "flags_changed", "Changed since you read it", `This document's flags changed after you opened them (version ${d.flagsVersion} now): read them again, then try again. Nothing was changed.`);
    const next = { language: d.language, translation: d.translation, translationDetail: d.translationDetail, notarisation: d.notarisation, notarisationDetail: d.notarisationDetail, expiresOn: d.expiresOn };
    if (x.language !== undefined) next.language = x.language;
    if (x.translation !== undefined) next.translation = x.translation;
    if (x.translation_detail !== undefined) next.translationDetail = x.translation_detail;
    if (x.notarisation !== undefined) next.notarisation = x.notarisation;
    if (x.notarisation_detail !== undefined) next.notarisationDetail = x.notarisation_detail;
    if (x.expires_on !== undefined) next.expiresOn = x.expires_on ? new Date(`${x.expires_on}T00:00:00Z`) : null;
    // A language change sends a translation staff marked Required back to the type's default (so English or French drops
    // the line); a Provided translation stays, with its detail.
    if (x.language !== undefined && x.language !== d.language && x.translation === undefined && d.translation === "REQUIRED") next.translation = null;
    if (next.translation === "PROVIDED" && !next.translationDetail) problem(400, "detail_needed", "Say what was provided", "A translation marked Provided needs its detail: who translated it and the affidavit (up to 300 characters). Nothing was changed.");
    if (next.notarisation === "PROVIDED" && !next.notarisationDetail) problem(400, "detail_needed", "Say what was provided", "A notarisation marked Provided needs its detail: who notarised it and when (up to 300 characters). Nothing was changed.");
    const t = this.typeOf(c, d.documentType), name = t?.name ?? d.documentType;
    const words = (k: keyof typeof next, v: unknown) => v === null || v === undefined ? "not set" : k === "language" ? languageName(v as string) : k === "expiresOn" ? day(v as Date) : k === "translation" || k === "notarisation" ? STATE_WORDS[v as FlagState] : String(v);
    const LABEL: Record<keyof typeof next, string> = { language: "language", translation: "translation", translationDetail: "translation detail", notarisation: "notarisation", notarisationDetail: "notarisation detail", expiresOn: "expiry date" };
    const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => words(k, next[k]) !== words(k, d[k]));
    if (!changed.length) return this.view(c, d);
    const done = await this.db.$transaction(async (tx) => {
      const n = await tx.caseDocument.updateMany({ where: { id: d.id, flagsVersion: d.flagsVersion }, data: { ...next, flagsVersion: { increment: 1 } } });
      if (n.count !== 1) problem(409, "flags_changed", "Changed since you read it", "Someone changed this document's flags at the same moment: read them again, then try again. Nothing was changed.");
      const log = new Audit(tx as never);
      // One audit line per flag changed (never the file's contents, RT-17).
      for (const k of changed) await log.log(c.workspaceId, actor.id, "flag changed", "case document", d.id, `${actor.name} set the ${LABEL[k]} of ${name} on case ${short(c.id)}: ${words(k, d[k])} → ${words(k, next[k])}`.slice(0, 600), { flag: k, version: d.flagsVersion + 1 });
      return tx.caseDocument.findUnique({ where: { id: d.id } });
    });
    return this.view(c, done!);
  }
}

@CaseRead()
@Controller("api/runtime")
export class CaseDocumentFlagsController {
  constructor(@Inject(CaseDocumentFlags) private readonly s: CaseDocumentFlags) {}
  @Get("documents/:id/flags") read(@Headers("x-actor") a: H, @Param("id") id: string) { return this.s.read(actorOf(a), id); }
  @Post("documents/:id/flags") @HttpCode(200) set(@Headers("x-actor") a: H, @Param("id") id: string, @Body() b: unknown) { return this.s.set(actorOf(a), id, b); }
}
