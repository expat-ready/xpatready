// CS-D7 checks (R1.70 part 2, runtime lane; map row 70; AG-9-12, AG-9-29, AG-9-64): expiry, translation and notarisation
// flags on each case document, read by the checklist. Setup: the suites' fixture; the passport type gets cited defaults
// through CS-D7c's governed change (test words, labelled Test) and wp.family is released with them; a case opens on it.
// Each rule has a pass and a fail: a document in Spanish on a type with the rule adds one translation line, English takes
// it away; saved twice, still one line; an expired or too-old document warns, nothing is blocked; a type with no rule adds
// no line; Provided without a detail is 400; every flag change writes one audit line; old documents read null. Rules only,
// no AI (US$0). Values Sample until the immigration expert confirms.
//   zsh studio/tools/isolated.sh runtime_csd5 4435 start && tsx studio/tests/check_csd5_flags.ts 4435 xr_studio_runtime_csd5
import { textPdf } from "../acceptance/lib/fixtures.ts";
import { sourceEveryNumber } from "./fixtures/source-every-number.cjs";
import { APPROVER, AUTHOR, CLIENT, OFFICER, PORT, REVIEWER, call, main, ok, openCase, sql } from "../acceptance/lib/m3.ts";

const PASSPORT = "passport_or_travel_document_information_page_photocopy";
const CITED = { source_quote: "Test words (fixture): a document not in English or French comes with a translation and the translator's affidavit.", source_file: "Test source (fixture), page 1" };
type Doc = { id: string; current: boolean; flags: { language: string | null; translation: string | null; translation_from: string; notarisation: string | null; notarisation_from: string; expires_on: string | null; warnings: string[]; version: number } };
type Line = { id: string; label: string; state: string; version: number; document: { key: string }; documents: Doc[]; flag_warnings: string[] };
type T = { id: string; label: string; document_id: string; state: string; quote: string };
type P = { subject: string; lines: Line[]; translations: T[] };
const words = (r: { body: any }) => String(r.body?.detail ?? r.body?.message ?? ""); // eslint-disable-line @typescript-eslint/no-explicit-any -- responses read loosely
const today = new Date().toISOString().slice(0, 10), yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

await main("CS-D7", "flags on each document, read by the checklist", async () => {
  await call("POST", "/demo/reset", { confirm: "RESET" }, AUTHOR);
  const l = await call("POST", "/demo/load", {}, AUTHOR);
  ok("setup: the fixture loads", l.status > 0 && l.status < 300, words(l));
  const wp = sql(`select id from combination where combination_key='wp.family'`)!;
  // CS-D7c: the passport's cited defaults, approved by a second person, released.
  let r = await call("POST", `/library/document-types/${PASSPORT}/defaults`, { translation_rule: "REQUIRED_IF_NOT_EN_FR", notarisation_rule: "NOT_REQUIRED", has_expiry: true, max_age_days: 365, ...CITED, reason: "Test: passport defaults (CS-D7)." }, AUTHOR);
  const change = r.body?.id;
  r = await call("POST", `/library/changes/${change}/approve`, { note: "Second person (CS-D7 setup)." }, APPROVER);
  await sourceEveryNumber(PORT, wp);
  await call("POST", `/combinations/${wp}/submit`, {}, AUTHOR);
  const review = (await call("GET", `/combinations/${wp}/review`, undefined, AUTHOR)).body;
  const sme = ((review?.submission?.changeSummary ?? []) as { needs_sme: boolean; kind: string; key: string }[]).filter((x) => x.needs_sme).map((x) => `${x.kind}|${x.key}`);
  if (sme.length) await call("POST", `/combinations/${wp}/signoff`, { items: sme, action: "signed" }, REVIEWER);
  r = await call("POST", `/combinations/${wp}/approve`, {}, APPROVER);
  ok("setup: wp.family is released with the passport's cited defaults", r.status === 201 && sql(`select status from library_change where id='${change}'`) === "RELEASED", words(r) || r.status);

  const c = await openCase(wp, [{ role: "principal", name: "Sample Client A", dob: "1986-04-13" }]);
  const A = c.subjects["Sample Client A"];
  const list = async () => (((await call("GET", `/runtime/cases/${c.id}/checklist`, undefined, c.officer)).body?.people ?? []) as P[]).find((p) => p.subject === A)!;
  let me = await list();
  const pass = me?.lines.find((x) => x.document.key === PASSPORT);
  const plain = me?.lines.find((x) => x.document.key !== PASSPORT);
  ok("setup: the case's checklist has the passport line and another line for the principal", !!pass && !!plain, me?.lines.map((x) => x.document.key));
  const up = async (lineId: string, n: string) => {
    const fd = new FormData(); fd.append("file", new Blob([new Uint8Array(textPdf([`Sample synthetic document ${n}`]))]), `${n}.pdf`);
    const res = await fetch(`http://127.0.0.1:${PORT}/api/runtime/checklist-lines/${lineId}/documents`, { method: "POST", headers: { "x-actor": c.officer }, body: fd });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const u1 = await up(pass!.id, "passport"), u2 = await up(plain!.id, "other");
  const doc = u1.body?.document?.id as string, other = u2.body?.document?.id as string;
  ok("setup: one file uploaded on each line", u1.status < 300 && u2.status < 300 && !!doc && !!other, [u1.status, u2.status]);

  // Old documents read null; the type's defaults show until staff set a flag.
  ok("CS-D7 pass (migration): a document's own flags start null at version 0", sql(`select count(*) from case_document where id in ('${doc}','${other}') and language is null and translation is null and notarisation is null and expires_on is null and flags_version = 0`) === "2");
  let f = await call("GET", `/runtime/documents/${doc}/flags`, undefined, c.officer);
  ok("CS-D7 pass (seeded from the type): notarisation reads Not required from the type; translation waits for the language; the missing expiry date warns", f.status === 200 && f.body?.flags?.notarisation === "NOT_REQUIRED" && f.body.flags.notarisation_from === "type" && f.body.flags.translation === null && /Pick the document's language/.test(f.body.flags.translation_words) && f.body.flags.warnings.some((w: string) => /enter the date/.test(w)), f.body?.flags);
  me = await list();
  ok("CS-D7 fail: no language yet, no translation line", me.translations.length === 0, me.translations);

  // Spanish adds one line; saved twice, still one; English takes it away.
  const set = async (id: string, body: Record<string, unknown>, actor = c.officer) => {
    const v = (await call("GET", `/runtime/documents/${id}/flags`, undefined, c.officer)).body?.flags?.version ?? 0;
    return call("POST", `/runtime/documents/${id}/flags`, { version: v, ...body }, actor);
  };
  const audits = () => Number(sql(`select count(*) from audit_event where entity='case document' and entity_key='${doc}' and action='flag changed'`));
  r = await set(doc, { language: "es" });
  me = await list();
  ok("CS-D7 pass: a passport in Spanish on a type with the rule adds one translation line, linked to the document, with the type's official words", r.status === 200 && r.body?.flags?.translation === "REQUIRED" && r.body.flags.translation_from === "type" && me.translations.length === 1 && me.translations[0].document_id === doc && me.translations[0].label === "Translation + translator's affidavit" && me.translations[0].quote === CITED.source_quote, me.translations);
  ok("CS-D7 pass: the language change wrote one audit line naming the flag, before and after", audits() === 1 && /language of .*: not set → Spanish/.test(sql(`select summary from audit_event where entity_key='${doc}' and action='flag changed' order by at desc limit 1`) ?? ""), sql(`select summary from audit_event where entity_key='${doc}' and action='flag changed'`));
  r = await set(doc, { language: "es" });
  me = await list();
  ok("CS-D7 fail: the same document saved twice adds no second line and writes no audit line", r.status === 200 && me.translations.length === 1 && audits() === 1, [me.translations.length, audits()]);
  r = await set(doc, { language: "en" });
  me = await list();
  ok("CS-D7 pass: setting it to English takes the translation line away (Not required, from the type)", r.status === 200 && r.body?.flags?.translation === "NOT_REQUIRED" && me.translations.length === 0 && audits() === 2, [r.body?.flags?.translation, me.translations.length]);
  r = await set(doc, { language: "es", translation: "REQUIRED" });
  r = await set(doc, { language: "fr" });
  ok("CS-D7 pass: a translation staff marked Required goes back to the type's default when the language changes to French (no line)", r.body?.flags?.translation === "NOT_REQUIRED" && r.body.flags.translation_from === "type" && (await list()).translations.length === 0, r.body?.flags);

  // Provided needs its detail.
  await set(doc, { language: "es" });
  r = await set(doc, { translation: "PROVIDED" });
  ok("CS-D7 fail: translation set to Provided without a detail gives 400, nothing changed", r.status === 400 && sql(`select coalesce(translation,'null') from case_document where id='${doc}'`) === "null", [r.status, words(r)]);
  r = await set(doc, { translation: "PROVIDED", translation_detail: "Sample: certified translator, affidavit attached" });
  me = await list();
  ok("CS-D7 pass: Provided with its detail is saved; the line stays, marked provided", r.status === 200 && me.translations.length === 1 && me.translations[0].state === "provided", me.translations);
  r = await set(doc, { notarisation: "PROVIDED" });
  ok("CS-D7 fail: notarisation Provided without a detail gives 400", r.status === 400, words(r));
  ok("CS-D7 fail (data): the database also refuses Provided without a detail", (() => { try { sql(`update case_document set translation_detail=null where id='${doc}'`); return sql(`select coalesce(translation_detail,'null') from case_document where id='${doc}'`) !== "null"; } catch { return true; } })());

  // Warnings, never a block.
  const before = (await list()).lines.find((x) => x.id === pass!.id)!;
  r = await set(doc, { expires_on: yesterday });
  me = await list();
  const after = me.lines.find((x) => x.id === pass!.id)!;
  ok("CS-D7 pass: an expired document shows a warning on its line", r.status === 200 && after.flag_warnings.some((w) => /^Expired on /.test(w)) && after.documents.find((x) => x.id === doc)?.flags.expires_on === yesterday, after.flag_warnings);
  ok("CS-D7 pass: nothing is blocked: the line keeps its state and the document stays current", after.state === before.state && after.documents.find((x) => x.id === doc)?.current === true, [before.state, after.state]);
  // CS-D7 (4), review M3: readiness reads the warning (and the translation still needed) as items to pass, never a stop.
  const prep = async () => (await call("GET", `/runtime/cases/${c.id}/prepare`, undefined, c.officer)).body;
  let pr = await prep();
  const flagWarns = (x: any) => ((x?.readiness ?? []) as any[]).flatMap((f) => (f.warns ?? []).filter((w: any) => w.code === "document_flag")); // eslint-disable-line @typescript-eslint/no-explicit-any -- responses read loosely
  const flagBlocks = (x: any) => ((x?.readiness ?? []) as any[]).flatMap((f) => (f.blocks ?? []).filter((w: any) => w.code === "document_flag")); // eslint-disable-line @typescript-eslint/no-explicit-any -- responses read loosely
  ok("CS-D7 pass (4): readiness lists the expired passport as a \"document flag\" item to fix or pass, never a block", flagWarns(pr).some((w: any) => /Expired on /.test(w.words)) && flagBlocks(pr).length === 0, flagWarns(pr).map((w: any) => w.words)); // eslint-disable-line @typescript-eslint/no-explicit-any -- responses read loosely
  r = await set(doc, { expires_on: "2099-12-31" });
  me = await list();
  ok("CS-D7 fail: a future expiry gives no expiry warning", !me.lines.find((x) => x.id === pass!.id)!.flag_warnings.some((w) => /Expired|expiry date/.test(w)), me.lines.find((x) => x.id === pass!.id)!.flag_warnings);
  // Hours, not days: in an America/Toronto database "400 days" is counted on the local calendar, so across the winter
  // clock change it is 400 days and 1 hour, and between 00:00 and 01:00 UTC the app (which counts UTC dates) says 401.
  sql(`update case_document set uploaded_at = now() - interval '9600 hours' where id='${doc}'`);
  me = await list();
  ok("CS-D7 pass: a document older than the type's max age (365 days) warns, nothing blocked", me.lines.find((x) => x.id === pass!.id)!.flag_warnings.some((w) => /Uploaded 400 days ago/.test(w)) && me.lines.find((x) => x.id === pass!.id)!.state === before.state, me.lines.find((x) => x.id === pass!.id)!.flag_warnings);
  // Review N1 / break R2-M1: a passed "too old" warning stays passed the next day (its key never holds the day count).
  pr = await prep();
  const ageW = (x: any) => flagWarns(x).find((w: any) => /Uploaded \d+ days ago/.test(w.words)); // eslint-disable-line @typescript-eslint/no-explicit-any -- responses read loosely
  const ageFiling = ((pr?.readiness ?? []) as any[]).find((f) => (f.warns ?? []).some((w: any) => w === ageW(pr) || (w.code === "document_flag" && /Uploaded/.test(w.words))))?.filing; // eslint-disable-line @typescript-eslint/no-explicit-any -- responses read loosely
  const passAge = await call("POST", `/runtime/filings/${ageFiling}/warnings/document_flag/pass`, { key: ageW(pr)?.key, reason: "Test: the client confirmed the passport is still the latest one." }, c.officer);
  sql(`update case_document set uploaded_at = uploaded_at - interval '24 hours' where id='${doc}'`);
  pr = await prep();
  const passedAge = ((pr?.readiness ?? []) as any[]).flatMap((f) => f.passed ?? []).filter((w: any) => w.code === "document_flag" && /Uploaded 401 days ago/.test(w.words)); // eslint-disable-line @typescript-eslint/no-explicit-any -- responses read loosely
  ok("review N1 pass: a passed \"too old\" warning is still passed a day later (Uploaded 401 days ago), not open again", passAge.status === 200 && passedAge.length >= 1 && !ageW(pr), [passAge.status, words(passAge), ageW(pr)?.words]);
  r = await set(doc, { expires_on: "2026-02-30" });
  ok("CS-D7 fail: an expiry that is not a real date is refused (400)", r.status === 400, words(r));

  pr = await prep();
  ok("CS-D7 fail (4): with a future expiry and the translation Provided, readiness names no expiry and no translation item", !flagWarns(pr).some((w: any) => /Expired|Translation/.test(w.words)), flagWarns(pr).map((w: any) => w.words)); // eslint-disable-line @typescript-eslint/no-explicit-any -- responses read loosely
  // A type with no rule adds no line.
  r = await set(other, { language: "es" });
  me = await list();
  ok("CS-D7 fail: a document in Spanish on a type with no rule adds no translation line (translation not set)", r.status === 200 && r.body?.flags?.translation === null && me.translations.every((t) => t.document_id !== other), [r.body?.flags, me.translations.map((t) => t.document_id)]);

  // Lead 9 on #3180 (CS-W3): a firm-B document. The solo practice (Sample Solo, user-S) opens its own case and uploads a
  // passport; its staff read the flags; firm A's officer is refused it, read and write, in the same words as an unknown id.
  const kb = await call("POST", "/runtime/cases", { combinationId: wp, reference: `CSD7-B-${Date.now().toString(36)}`, clientActor: "user-Q", principal: { displayName: "Sample Client B" } }, "user-S");
  const bLine = ((((await call("GET", `/runtime/cases/${kb.body?.id}/checklist`, undefined, "user-S")).body?.people ?? []) as P[]).flatMap((x) => x.lines)).find((x) => x.document.key === PASSPORT);
  const fdB = new FormData(); fdB.append("file", new Blob([new Uint8Array(textPdf(["Sample synthetic document firm B"]))]), "passport-b.pdf");
  const upB = bLine ? await fetch(`http://127.0.0.1:${PORT}/api/runtime/checklist-lines/${bLine.id}/documents`, { method: "POST", headers: { "x-actor": "user-S" }, body: fdB }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) })) : { status: 0, body: null };
  const docB = upB.body?.document?.id as string;
  ok("setup (firm B): Sample Solo opens its own case and uploads a passport; the case is in the other firm", kb.status === 201 && upB.status < 300 && !!docB && sql(`select count(distinct firm_id) from runtime_case where id in ('${c.id}', '${kb.body?.id}')`) === "2", [kb.status, upB.status]);
  const bOwn = await call("GET", `/runtime/documents/${docB}/flags`, undefined, "user-S");
  ok("CS-W3 pass (flags): firm B's own staff read their document's flags", bOwn.status === 200 && bOwn.body?.document?.id === docB, [bOwn.status, words(bOwn)]);
  const bRead = await call("GET", `/runtime/documents/${docB}/flags`, undefined, c.officer);
  const bWrite = await call("POST", `/runtime/documents/${docB}/flags`, { version: 0, language: "de" }, c.officer);
  ok("CS-W3 fail (flags): firm A's officer is refused firm B's document, read and write (404 \"No such document.\", as an unknown id); nothing changed, no audit line", bRead.status === 404 && bWrite.status === 404 && /^No such document\.$/.test(words(bRead)) && sql(`select coalesce(language, 'none') || '|' || flags_version from case_document where id='${docB}'`) === "none|0" && sql(`select count(*) from audit_event where entity_key='${docB}' and action='flag changed'`) === "0", [bRead.status, bWrite.status, words(bRead)]);

  // Who may set them, and stale views.
  ok("CS-D7 fail: a client cannot set a document's flags (403)", (await set(doc, { language: "de" }, CLIENT)).status === 403);
  ok("CS-D7 fail: a configuration person cannot set them (403)", (await set(doc, { language: "de" }, AUTHOR)).status === 403);
  ok("CS-D7 fail: another firm's staff do not find the document (404)", (await set(doc, { language: "de" }, "user-S")).status === 404);
  ok("CS-D7 fail: an unknown document id is 404", (await call("POST", `/runtime/documents/00000000-0000-4000-8000-000000000000/flags`, { version: 0, language: "es" }, c.officer)).status === 404);
  const v = Number(sql(`select flags_version from case_document where id='${doc}'`));
  r = await call("POST", `/runtime/documents/${doc}/flags`, { version: v - 1, language: "de" }, c.officer);
  ok("CS-D7 fail: an old version of the flags is refused (409), nothing changed", r.status === 409 && sql(`select language from case_document where id='${doc}'`) === "es", [r.status, words(r)]);
  // Every flag change writes one audit line: count the changes made above on the passport.
  const flagsChanged = Number(sql(`select count(*) from audit_event where entity_key='${doc}' and action='flag changed'`));
  ok("CS-D7 pass: every flag change wrote exactly one audit line (11 changes on the passport so far), none for refused or unchanged saves", flagsChanged === 11, flagsChanged);

  // Break and review fixes (round 1).
  r = await set(doc, { expires_on: "0000-01-01" });
  ok("break m1 fail: a year outside 1900-2200 is refused (400, not 500)", r.status === 400, [r.status, words(r)]);
  r = await set(doc, { language: "zz" });
  ok("break m2 fail: a language code not in the list is refused (400)", r.status === 400, [r.status, words(r)]);
  await set(doc, { translation: "REQUIRED" });
  r = await set(doc, { language: "pt" });
  ok("break m5 pass: Spanish → Portuguese keeps a translation staff marked Required", r.body?.flags?.translation === "REQUIRED" && r.body.flags.translation_from === "staff", r.body?.flags);
  const u3 = await up(pass!.id, "passport-new");
  const newer = u3.body?.document?.id as string;
  ok("review m2 pass: a new file of the passport keeps the language staff picked (Portuguese)", u3.status < 300 && sql(`select language from case_document where id='${newer}'`) === "pt", [u3.status, sql(`select language from case_document where id='${newer}'`)]);
  r = await call("POST", `/runtime/documents/${doc}/flags`, { version: Number(sql(`select flags_version from case_document where id='${doc}'`)), language: "de" }, c.officer);
  ok("break m8 fail: the replaced file's flags cannot be changed (409 not_current)", r.status === 409 && r.body?.code === "not_current", [r.status, words(r)]);
  // Break R2-m4: a line marked not applicable shows no flag warnings on the checklist (as readiness already leaves it out).
  await set(newer, { expires_on: "2020-01-02" });
  ok("break R2-m4 setup: the newer file's past expiry warns on its line", (await list()).lines.find((x) => x.id === pass!.id)!.flag_warnings.some((w) => /^Expired on 2020-01-02/.test(w)));
  sql(`update checklist_line set state='not_applicable', state_reason='Test: not needed on this case.' where id='${pass!.id}'`);
  ok("break R2-m4 fail: once the line is not applicable, the checklist shows no flag warning on it", sql(`select state from checklist_line where id='${pass!.id}'`) === "not_applicable" && (await list()).lines.find((x) => x.id === pass!.id)!.flag_warnings.length === 0, (await list()).lines.find((x) => x.id === pass!.id)!.flag_warnings);
  void OFFICER; void today;
});
