// J-70 (map row 70, R1.70: expiry, translation and notarisation flags), written by the qa lane (23 Nov) BEFORE its parts
// merge, so qa only has to run it when they do. Persona: a firm's case officer on the case page's Documents panel, with the
// configuration author and the approver (the second person) setting the document type's cited defaults first; on an
// isolated copy of the running app (its own database and port, never :4400), by screens where they exist and on the
// routes and the database underneath.
// Done when (CAPABILITIES R1.70), word for word as the steps:
//   W1 "A document": the passport's document type carries cited defaults (translation REQUIRED_IF_NOT_EN_FR, notarisation
//      NOT_REQUIRED, has_expiry, max_age_days) through the governed library change: a case officer may not propose them
//      (403), a value with no citation is refused (400 DEFAULTS_UNCITED), the proposer may not approve their own change
//      (403), the approver does; the release publishes a new document_type version with them (never changed in place) and
//      a type with no defaults reads null. Then a case opens on wp.family and the officer uploads the passport on its line,
//      on screen. Needs CS-D7c (POST /api/library/document-types/:key/defaults; API only, no screen in its touch list).
//   W2 "carries expiry, translation and notarisation flags": on the passport line's menu, "Document flags…" opens the
//      dialog; notarisation reads Not required (from the document type); the officer picks Spanish and an expiry date in
//      the past and saves; underneath case_document holds language es and expires_on, flags_version 1, and one audit line
//      per flag changed; Provided without a detail is refused in the server's words (the dialog stays), with a detail it
//      saves. Needs CS-D7 (GET/POST /api/runtime/documents/:id/flags, the panel).
//   W3 roles: the case's client (user-P) cannot set a document's flags (403) and nothing changes.
//   W4 "that the checklist reads": the person's checklist (screen and API) shows one "Translation + translator's
//      affidavit" line linked to the passport, with the type's cited words under Source; the passport line shows the
//      "Expired on …" warning and keeps its state (never a block); the other line's document, on a type with no rule,
//      adds no translation line even in Spanish; English (translation back on the type's default) takes the line away.
//      Needs CS-D7. One step needs a part no row holds: notarisation Required and not provided read by the checklist
//      (CS-D7 reads only translation and expiry/age): labelled "Gap", it fails on main and on #3180.
//   W5 400, 1024 and 1440 px: the Documents panel with the translation line and the dialog, no sideways scroll, axe-core
//      0 serious or critical (WCAG 2.2 A/AA); no page error. Needs CS-D7.
//   W6: the walk ends at R1.72's first step: a Sample prospect's card on the Pipeline board opens the prospect's screen,
//      which offers "Convert to client" (FO-4 part 2a, merged).
// Fails on main today only where a part is not merged (P-606); each failing step names its part (CS-D7c, CS-D7). Routes,
// columns, enums and screen words are aligned with draft PR #3180 (branch claude/runtime-csd7-flags, 23 Nov).
// Sample values and test citations only (labelled Test); US$0, no model call, live AI off. Screenshots:
// product/screens/J-70/screenshots/. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j70 4472 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j70 4472 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_70.ts j70 4472
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { textPdf } from "../../acceptance/lib/fixtures.ts";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { sourceEveryNumber } from "../fixtures/source-every-number.cjs";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j70", Number(process.argv[3] ?? 4472)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-70", "screenshots"); mkdirSync(SHOTS, { recursive: true });
// The pack's helpers read the copy's port and database from the command line (their own usage: <port> <database>).
process.argv[2] = String(PORT); process.argv[3] = DBNAME;
const { APPROVER, AUTHOR, CLIENT, OFFICER, call, ok, openCase, rec, sql } = await import("../../acceptance/lib/m3.ts");

const PASSPORT = "passport_or_travel_document_information_page_photocopy";
const CITED = { source_quote: "Test words (J-70): a document not in English or French comes with a translation and the translator's affidavit.", source_file: "Test source (J-70), page 1" };
const DEFAULTS = { translation_rule: "REQUIRED_IF_NOT_EN_FR", notarisation_rule: "NOT_REQUIRED", has_expiry: true, max_age_days: 365 };
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const run = Date.now().toString(36);
const words = (r: { body: any }) => String(r.body?.detail ?? r.body?.message ?? ""); // eslint-disable-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other journeys
/** One step, one line: a crash is that step's FAIL (so the step count is the same on main and on the branch). */
const step = async (label: string, fn: () => Promise<[unknown, unknown?]>) => {
  try { const [c, d] = await fn(); return ok(label, c, d); } catch (e) { return ok(label, false, `crashed: ${(e as Error).message.split("\n")[0]}`); }
};
type Flags = { language: string | null; translation: string | null; translation_from: string; notarisation: string | null; notarisation_from: string; expires_on: string | null; warnings: string[]; version: number };
type Line = { id: string; state: string; document: { key: string }; documents: { id: string; current: boolean; flags?: Flags }[]; flag_warnings?: string[] };
type Person = { subject: string; lines: Line[]; translations?: { id: string; label: string; document_id: string; state: string; quote: string; source: string }[] };

// ------------------------------------------------------------------------------------------------ setup (Sample)
await call("POST", "/demo/reset", { confirm: "RESET" }, AUTHOR);
const load = await call("POST", "/demo/load", {}, AUTHOR);
const WP = sql(`select id from combination where combination_key='wp.family'`) ?? "";
ok("J-70 setup: the fixture loads with wp.family (it names the passport)", load.status < 300 && !!WP && sql(`select count(*) from document_type where document_type_key='${PASSPORT}'`) !== "0", load.status);

// ------------------------------------------------------------------------------------------------ W1 "A document" (CS-D7c)
const typeRow = (status: string) => sql(`select coalesce(translation_rule,'∅')||'|'||coalesce(notarisation_rule,'∅')||'|'||coalesce(has_expiry::text,'∅')||'|'||coalesce(max_age_days::text,'∅')||'|'||coalesce(defaults_source_file,'∅')||'|'||version from document_type where document_type_key='${PASSPORT}' and status='${status}' order by version desc limit 1`);
const versionBefore = Number(sql(`select max(version) from document_type where document_type_key='${PASSPORT}' and status='PUBLISHED'`) ?? 0);
const changes = () => sql(`select count(*) from library_change where kind='document_defaults' and key='${PASSPORT}'`);
await step("CS-D7c W1 fail: a case officer cannot propose a document type's defaults (403); nothing is proposed", async () => {
  const r = await call("POST", `/library/document-types/${PASSPORT}/defaults`, { ...DEFAULTS, ...CITED, reason: "Test: officer tries (J-70)." }, OFFICER);
  return [r.status === 403 && changes() === "0", [r.status, words(r), changes()]];
});
await step("CS-D7c W1 fail: a value with no citation is refused (400 DEFAULTS_UNCITED, AGENTS rule 4); nothing is proposed", async () => {
  const r = await call("POST", `/library/document-types/${PASSPORT}/defaults`, { ...DEFAULTS, reason: "Test: no citation (J-70)." }, AUTHOR);
  return [r.status === 400 && r.body?.code === "DEFAULTS_UNCITED" && changes() === "0", [r.status, r.body?.code, changes()]];
});
let change = "";
await step("CS-D7c W1 pass: the author proposes the passport's defaults with their official words; one change waits for a second person", async () => {
  const r = await call("POST", `/library/document-types/${PASSPORT}/defaults`, { ...DEFAULTS, ...CITED, reason: "Test: passport defaults (J-70)." }, AUTHOR);
  change = r.body?.id ?? "";
  return [r.status === 201 && !!change && sql(`select status from library_change where id='${change}'`) === "WAITING", [r.status, words(r)]];
});
await step("CS-D7c W1 fail: the proposer cannot approve their own change (403, a different person decides); it still waits", async () => {
  if (!change) return [false, "no change was proposed"];
  const r = await call("POST", `/library/changes/${change}/approve`, { note: "Self-approval (J-70)." }, AUTHOR);
  return [r.status === 403 && /different person/i.test(JSON.stringify(r.body)) && sql(`select status from library_change where id='${change}'`) === "WAITING", [r.status, words(r)]];
});
await step("CS-D7c W1 pass: the approver approves; the passport gets a draft version carrying the four values and the citation", async () => {
  if (!change) return [false, "no change was proposed"];
  const r = await call("POST", `/library/changes/${change}/approve`, { note: "Second person (J-70)." }, APPROVER);
  const draft = typeRow("DRAFT") ?? "";
  return [(r.status === 200 || r.status === 201) && draft.startsWith(`REQUIRED_IF_NOT_EN_FR|NOT_REQUIRED|true|365|${CITED.source_file}|`), [r.status, words(r), draft]];
});
await sourceEveryNumber(PORT, WP);
await call("POST", `/combinations/${WP}/submit`, {}, AUTHOR);
const review = (await call("GET", `/combinations/${WP}/review`, undefined, AUTHOR)).body;
const sme = ((review?.submission?.changeSummary ?? []) as { needs_sme: boolean; kind: string; key: string }[]).filter((x) => x.needs_sme).map((x) => `${x.kind}|${x.key}`);
if (sme.length) await call("POST", `/combinations/${WP}/signoff`, { items: sme, action: "signed" }, "user-C");
const rel = await call("POST", `/combinations/${WP}/approve`, {}, APPROVER);
ok("J-70 setup: wp.family is released (submitted, signed off, approved by the second person)", rel.status === 201, [rel.status, words(rel)]);
await step("CS-D7c W1 pass: the release publishes a NEW passport version with the cited values (never changed in place: the older version still reads null) and releases the change", async () => {
  const pub = typeRow("PUBLISHED") ?? "", old = sql(`select coalesce(translation_rule,'∅') from document_type where document_type_key='${PASSPORT}' and version=${versionBefore}`);
  return [pub.startsWith(`REQUIRED_IF_NOT_EN_FR|NOT_REQUIRED|true|365|${CITED.source_file}|`) && Number(pub.split("|").pop()) > versionBefore && old === "∅" && !!change && sql(`select status from library_change where id='${change}'`) === "RELEASED", { pub, versionBefore, old }];
});

const c = await openCase(WP, [{ role: "principal", name: "Sample Client A", dob: "1986-04-13" }]);
const A = c.subjects["Sample Client A"];
const me = async () => (((await call("GET", `/runtime/cases/${c.id}/checklist`, undefined, c.officer)).body?.people ?? []) as Person[]).find((p) => p.subject === A);
const first = await me();
const passLine = first?.lines.find((l) => l.document.key === PASSPORT), otherLine = first?.lines.find((l) => l.document.key !== PASSPORT);
const otherType = otherLine?.document.key ?? "";
ok("J-70 setup: a case opens on wp.family; the principal's checklist has the passport line and another line", !!c.id && !!passLine && !!otherLine, first?.lines.map((l) => l.document.key));
await step("CS-D7c W1 pass: a type with no defaults set (the other line's) reads null and behaves as before", async () => {
  const v = sql(`select coalesce(translation_rule,'∅')||coalesce(notarisation_rule,'∅')||coalesce(has_expiry::text,'∅')||coalesce(max_age_days::text,'∅') from document_type where document_type_key='${otherType}' and status='PUBLISHED' order by version desc limit 1`);
  return [v === "∅∅∅∅", { otherType, v }];
});

// ------------------------------------------------------------------------------------------------ the browser
const browser = await chromium.launch({ headless: process.env.HEADED !== "1", slowMo: process.env.HEADED === "1" ? 200 : 0, ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce", locale: "en-US" });
await ctx.addInitScript((a) => { localStorage.setItem("xr-actor", a); }, c.officer);
const p = await ctx.newPage(); const errs: string[] = [];
p.on("pageerror", (e) => errs.push(e.message));
const shot = (pg: Page, name: string) => pg.screenshot({ path: join(SHOTS, `j70-${name}.png`), fullPage: true }).catch(() => undefined);
const settle = async () => { await p.waitForFunction(() => !document.querySelector('[aria-busy="true"]') && !document.querySelector(".animate-spin"), null, { timeout: 30_000 }).catch(() => undefined); await p.waitForTimeout(250); };
const line = (id: string | undefined) => p.locator(`[data-documents-panel] [data-line="${id}"]`);
const audits = (doc: string) => Number(sql(`select count(*) from audit_event where entity='case document' and entity_key='${doc}' and action='flag changed'`) ?? -1);
/** The passport line's menu → "Document flags…" (CS-D7's menu item); throws when the item is not there. */
const openFlags = async () => {
  await line(passLine?.id).locator("[data-line-menu]").click();
  const item = p.locator('[data-action="flags"]');
  if (!(await item.first().waitFor({ timeout: 5_000 }).then(() => true, () => false))) {
    const menu = await p.locator("[role=menu]").innerText().catch(() => "");
    await p.keyboard.press("Escape");
    throw new Error(`the line's menu has no "Document flags…" (menu: ${menu.replace(/\s+/g, " ")})`);
  }
  await item.first().click(); await p.locator("[data-flags-form]").waitFor({ timeout: 15_000 }); await settle();
};

const saveFlags = async () => { await p.locator("[data-flags-save]").click(); await p.locator("[data-flags-form]").waitFor({ state: "detached", timeout: 15_000 }); await settle(); };

let doc = "", otherDoc = "";
try {
  await p.goto(`${BASE}/cases/${c.id}`); await line(passLine?.id).waitFor({ timeout: 60_000 }); await settle();
  // The officer uploads the passport on its line (C6.4, merged): the line's hidden file input, as "Upload a file…" fills it.
  const upload = async (l: Line | undefined, name: string) => {
    await line(l?.id).locator("[data-upload-input]").setInputFiles({ name, mimeType: "application/pdf", buffer: Buffer.from(textPdf(["SYNTHETIC SPECIMEN - MADE-UP TEST DOCUMENT - NOT VALID", `Sample synthetic ${name} (J-70)`])) });
    for (let i = 0; i < 60; i++) { const d = sql(`select id from case_document where checklist_line_id='${l?.id}' and current order by uploaded_at desc limit 1`); if (d) return d; await p.waitForTimeout(250); }
    return "";
  };
  doc = await upload(passLine, "sample-passport.pdf"); otherDoc = await upload(otherLine, "sample-other.pdf"); await settle();
  ok("J-70 W1 pass (setup on screen, C6.4): the officer uploads the passport and the other line's document on the Documents panel; each is the current file of its line", !!doc && !!otherDoc && /sample-passport\.pdf/.test(await line(passLine?.id).innerText()), { doc, otherDoc });

  // ---------------------------------------------------------------------------------------------- W2 the flags on screen
  const before = { state: await line(passLine?.id).getAttribute("data-state") };
  await step("CS-D7 W2 pass: the passport line's menu offers \"Document flags…\"; the dialog says notarisation is Not required (from the document type) and asks for the expiry date", async () => {
    await openFlags(); await shot(p, "w2-flags-dialog-1440");
    const now = await p.locator("[data-flag-notarisation-now]").innerText(), warn = await p.locator("[data-flag-warnings]").innerText().catch(() => "");
    return [/Not required \(from the document type\)/.test(now) && /enter the date/i.test(warn), { now, warn }];
  });
  await step("CS-D7 W2 pass: the officer picks Spanish and an expiry date in the past and saves; underneath the document holds language es, expires_on 2020-01-02, flags_version 1, and two audit lines (language, expiry date)", async () => {
    if (!(await p.locator("[data-flags-form]").count())) return [false, "no flags dialog"];
    await p.locator("[data-flag-language]").selectOption("es"); await p.locator("[data-flag-expires]").fill("2020-01-02"); await saveFlags();
    const row = sql(`select language||'|'||expires_on::text||'|'||flags_version from case_document where id='${doc}'`);
    const lines = sql(`select string_agg(summary, ' | ' order by at) from audit_event where entity='case document' and entity_key='${doc}' and action='flag changed'`) ?? "";
    return [row === "es|2020-01-02|1" && audits(doc) === 2 && /language of .*not set → Spanish/.test(lines) && /expiry date of .*not set → 2020-01-02/.test(lines), { row, lines }];
  });
  await step("CS-D7 W2 pass: the flags read back through the API: language es, translation Required from the type, notarisation Not required from the type, expiry 2020-01-02 with its warning", async () => {
    const r = await call("GET", `/runtime/documents/${doc}/flags`, undefined, c.officer), f = r.body?.flags as Flags | undefined;
    return [r.status === 200 && f?.language === "es" && f.translation === "REQUIRED" && f.translation_from === "type" && f.notarisation === "NOT_REQUIRED" && f.notarisation_from === "type" && f.expires_on === "2020-01-02" && f.warnings.some((w) => /^Expired on 2020-01-02/.test(w)), [r.status, f]];
  });
  await step("CS-D7 W2 fail: translation Provided without a detail is refused in the server's words; the dialog stays and nothing is stored", async () => {
    await openFlags();
    await p.locator("[data-flag-translation]").selectOption("PROVIDED"); await p.locator("[data-flags-save]").click();
    const err = await p.locator("[data-flags-error]").innerText({ timeout: 10_000 });
    await shot(p, "w2-provided-needs-detail-1440");
    return [/needs its detail/.test(err) && (await p.locator("[data-flags-form]").count()) === 1 && sql(`select coalesce(translation,'∅') from case_document where id='${doc}'`) === "∅" && audits(doc) === 2, { err }];
  });
  await step("CS-D7 W2 pass: with its detail, Provided saves (two audit lines: translation, translation detail)", async () => {
    if (!(await p.locator("[data-flags-form]").count())) return [false, "no flags dialog"];
    await p.locator("[data-flag-translation-detail]").fill("Sample: certified translator, affidavit attached"); await saveFlags();
    return [sql(`select translation from case_document where id='${doc}'`) === "PROVIDED" && audits(doc) === 4, [sql(`select translation||'|'||coalesce(translation_detail,'') from case_document where id='${doc}'`), audits(doc)]];
  });

  // ---------------------------------------------------------------------------------------------- W3 roles
  await step("CS-D7 W3 fail: the case's client (user-P) cannot set a document's flags (403); the document and its audit lines are unchanged", async () => {
    const v = Number(sql(`select flags_version from case_document where id='${doc}'`) ?? -1);
    const r = await call("POST", `/runtime/documents/${doc}/flags`, { version: v, language: "de" }, CLIENT);
    return [r.status === 403 && v >= 0 && sql(`select language||'|'||flags_version from case_document where id='${doc}'`) === `es|${v}` && audits(doc) === 4, [r.status, words(r), v]];
  });

  // ---------------------------------------------------------------------------------------------- W4 the checklist reads them
  await step("CS-D7 W4 pass (API): the person's checklist has one \"Translation + translator's affidavit\" line linked to the passport, Provided, with the type's cited words; the passport line carries the expiry warning", async () => {
    const m = await me(), t = m?.translations ?? [], l = m?.lines.find((x) => x.id === passLine?.id);
    return [t.length === 1 && t[0].label === "Translation + translator's affidavit" && t[0].document_id === doc && t[0].state === "provided" && t[0].quote === CITED.source_quote && t[0].source === CITED.source_file
      && (l?.flag_warnings ?? []).some((w) => /^Expired on 2020-01-02/.test(w)), { translations: t, warnings: l?.flag_warnings }];
  });
  await step("CS-D7 W4 pass (screen): the Documents panel shows the translation line (Provided) and its Source quote, and the passport line shows \"Expired on 2020-01-02\"", async () => {
    await p.reload(); await line(passLine?.id).waitFor({ timeout: 60_000 }); await settle();
    const t = p.locator(`[data-translation-line="${doc}"]`);
    const text = (await t.count()) ? await t.innerText() : "", warn = await line(passLine?.id).locator("[data-flag-warning]").allInnerTexts();
    await shot(p, "w4-translation-line-1440");
    return [(await t.count()) === 1 && /Translation \+ translator's affidavit/.test(text) && (await t.getAttribute("data-translation-state")) === "provided" && warn.some((w) => /^Expired on 2020-01-02/.test(w)), { text, warn }];
  });
  await step("CS-D7 W4 pass: the expired document blocks nothing: the passport line keeps its state", async () => {
    const after = await line(passLine?.id).getAttribute("data-state");
    return [!!before.state && after === before.state && (await line(passLine?.id).locator("[data-flag-warning]").count()) > 0, [before.state, after]];
  });
  await step("CS-D7 W4 fail: the other line's document in Spanish, on a type with no rule, adds no translation line", async () => {
    const v = Number(sql(`select flags_version from case_document where id='${otherDoc}'`) ?? -1);
    const r = await call("POST", `/runtime/documents/${otherDoc}/flags`, { version: v, language: "es" }, c.officer);
    const t = (await me())?.translations ?? [];
    return [r.status === 200 && t.length === 1 && t.every((x) => x.document_id === doc), [r.status, words(r), t.map((x) => x.document_id)]];
  });
  // The Done when names notarisation among the flags "that the checklist reads"; CS-D7's own Done when reads only the
  // translation line and the expiry/age warnings, so no part delivers this clause (proposed QA bug row in the qa report).
  await step("QA-758 (Ambiguity: CS-D7 reads only translation and expiry) W4: notarisation Required and not provided shows on the passport's checklist line (a warning or a line naming notarisation); nothing is blocked", async () => {
    const v = Number(sql(`select flags_version from case_document where id='${doc}'`) ?? -1);
    const r = await call("POST", `/runtime/documents/${doc}/flags`, { version: v, notarisation: "REQUIRED" }, c.officer);
    const m = await me(), l = m?.lines.find((x) => x.id === passLine?.id);
    const reads = [...(l?.flag_warnings ?? []), ...(m?.translations ?? []).map((t) => `${t.label} ${t.state}`)].some((w) => /notari/i.test(w));
    return [r.status === 200 && reads && l?.state === before.state, [r.status, words(r), l?.flag_warnings, (m?.translations ?? []).map((t) => t.label)]];
  });
  await step("CS-D7 W4 pass: English, translation back on the type's default, takes the translation line away (screen and API)", async () => {
    await openFlags();
    await p.locator("[data-flag-language]").selectOption("en"); await p.locator("[data-flag-translation]").selectOption(""); await p.locator("[data-flag-translation-detail]").fill(""); await saveFlags();
    const f = (await call("GET", `/runtime/documents/${doc}/flags`, undefined, c.officer)).body?.flags as Flags | undefined;
    return [(await p.locator("[data-translation-line]").count()) === 0 && ((await me())?.translations ?? ["?"]).length === 0 && f?.translation === "NOT_REQUIRED" && f.translation_from === "type", f];
  });

  // ---------------------------------------------------------------------------------------------- W5 sizes and axe
  // The translation line is put back (Spanish) so the sizes are measured on the state this row adds.
  await step("CS-D7 W5 setup: Spanish again brings the translation line back (Needed)", async () => {
    const v = Number(sql(`select flags_version from case_document where id='${doc}'`) ?? -1);
    const r = await call("POST", `/runtime/documents/${doc}/flags`, { version: v, language: "es" }, c.officer);
    await p.reload(); await line(passLine?.id).waitFor({ timeout: 60_000 }); await settle();
    return [r.status === 200 && (await p.locator(`[data-translation-line="${doc}"]`).getAttribute("data-translation-state").catch(() => null)) === "needed", [r.status, words(r)]];
  });
  for (const width of [400, 1024, 1440]) {
    await step(`CS-D7 W5: the Documents panel with the translation line and the flags dialog at ${width} px: no sideways scroll, axe 0 serious or critical`, async () => {
      await p.setViewportSize({ width, height: width === 400 ? 860 : 900 }); await p.reload(); await line(passLine?.id).waitFor({ timeout: 60_000 }); await settle();
      const hasLine = (await p.locator(`[data-translation-line="${doc}"]`).count()) === 1;
      const panel = (await new AxeBuilder({ page: p }).include("[data-documents-panel]").withTags(TAGS).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      const fitsPanel = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      await shot(p, `w5-panel-${width}`);
      await openFlags();
      const dialog = (await new AxeBuilder({ page: p }).include("[role=dialog]").withTags(TAGS).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      const fitsDialog = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      await shot(p, `w5-dialog-${width}`); await p.keyboard.press("Escape");
      return [hasLine && fitsPanel && fitsDialog && panel.length === 0 && dialog.length === 0, { hasLine, fitsPanel, fitsDialog, axe: [...panel, ...dialog].map((v) => `${v.id}: ${v.nodes[0]?.target}`) }];
    });
  }
  await p.setViewportSize({ width: 1440, height: 900 });
  ok("CS-D7 W5: no page error on the case page", errs.length === 0, errs.slice(0, 3));
} catch (e) {
  ok(`J-70: the walk ran to its end (crashed: ${(e as Error).message.split("\n")[0]})`, false);
}

// ------------------------------------------------------------------------------------------------ W6 R1.72's first step
try {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
  await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db); await db.$disconnect();
  const firm = sql(`select id from platform_firm where key = 'sample-firm'`);
  const [ownerId, ownerEmail] = (sql(`select id || '|' || email from platform_staff where actor_id = 'user-R'`) ?? "|").split("|");
  const session = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email: ownerEmail, secondStep: true }) });
  const token = ((await session.json().catch(() => null)) as { token?: string } | null)?.token;
  if (!token) throw new Error(`the Sample firm's Owner could not sign in (${session.status}; start the copy with PLATFORM_IDENTITY=local)`);
  const one = (q: string) => (sql(q) ?? "").split("\n")[0].trim();   // psql prints "INSERT 0 1" after a returning row
  const service = one(`select id from fo_service where firm_id = '${firm}' and combination_id = '${WP}'`)
    || one(`insert into fo_service (firm_id, label, combination_id, sort_order, created_by) values ('${firm}', 'Sample service (J-70)', '${WP}', 901, 'seed:J-70') returning id`);
  const person = one(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Ana${run}', 'Sample', 'j70.${run}@example.org', 'seed:J-70', now()) returning id`);
  const lead = one(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, interested_in_service_id, created_by, updated_at) values (gen_random_uuid(), '${firm}', '${person}', 'MANUAL', 'Phone call', '${ownerId}', '${service}', 'seed:J-70', now()) returning id`);
  const engaged = await fetch(`${BASE}/api/front-office/leads/${lead}/engage`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
  const number = ((await engaged.json().catch(() => null)) as { number?: string } | null)?.number;
  if (!number) throw new Error(`the Sample lead was not engaged into a prospect (${engaged.status}; service ${service || "none"}, lead ${lead || "none"})`);
  const fctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  await fctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, token);
  const f = await fctx.newPage();
  await f.goto(`${BASE}/front-office/pipeline`);
  const card = f.locator(`[data-card="${number}"]`).getByRole("link");
  await card.waitFor({ timeout: 60_000 }); await card.click();
  const convert = f.getByRole("button", { name: "Convert to client" });
  await convert.waitFor({ timeout: 30_000 }); await shot(f, "w6-r172-first-step-1440");
  ok("J-70 W6 (ends at R1.72's first step, FO-4 part 2a): a Sample prospect's card on the Pipeline board opens its screen, which offers \"Convert to client\"", !!number && (await convert.isVisible()), { number });
  await fctx.close();
} catch (e) {
  ok(`J-70 W6 (ends at R1.72's first step): the Pipeline card opens the prospect's screen with "Convert to client" (crashed: ${(e as Error).message.split("\n")[0]})`, false);
}
await browser.close();
process.exit(rec.summary() ? 1 : 0);
