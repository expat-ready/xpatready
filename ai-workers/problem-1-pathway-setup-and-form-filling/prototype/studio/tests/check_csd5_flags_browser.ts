// CS-D7 (R1.70 part 2, runtime lane; map row 70; AG-9-64): the document flags panel, by screens and keyboard only. Setup by
// API on the suites' fixture (as check_csd5_flags.ts): the passport type gets cited defaults (test words, labelled Test)
// through CS-D7c's governed change, wp.family is released, a case opens and the passport is uploaded. Then the case officer,
// keyboard only, on the case page's Documents panel: the passport line's menu → "Document flags…" → language Spanish →
// Save: focus back on the line's menu, the "Translation + translator's affidavit" line appears; Provided without a detail is
// refused in the server's words and the dialog stays; an expiry date in the past shows a warning and the line keeps its
// state; English takes the translation line away. axe-core (WCAG 2.2 A/AA) at 0 serious or critical on the panel and the
// dialog; 1440, 1024 and 375 px without sideways scroll; screenshots (deviceScaleFactor 1) in product/screens/CS-D7/
// screenshots/. No model call (US$0).
//   zsh studio/tools/isolated.sh runtime_csd5b 4436 start && tsx studio/tests/check_csd5_flags_browser.ts 4436 xr_studio_runtime_csd5b
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { textPdf } from "../acceptance/lib/fixtures.ts";
import { sourceEveryNumber } from "./fixtures/source-every-number.cjs";
import { APPROVER, AUTHOR, PORT, REVIEWER, call, openCase, sql } from "../acceptance/lib/m3.ts";

const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "CS-D7", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PASSPORT = "passport_or_travel_document_information_page_photocopy";
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); return !!c; };

// ---------------------------------------------------------------- setup by API
await call("POST", "/demo/reset", { confirm: "RESET" }, AUTHOR);
const load = await call("POST", "/demo/load", {}, AUTHOR);
ok("setup: the fixture loads", load.status > 0 && load.status < 300, load.status);
const wp = sql(`select id from combination where combination_key='wp.family'`)!;
const prop = await call("POST", `/library/document-types/${PASSPORT}/defaults`, { translation_rule: "REQUIRED_IF_NOT_EN_FR", notarisation_rule: "NOT_REQUIRED", has_expiry: true, max_age_days: 365,
  source_quote: "Test words (fixture): a document not in English or French comes with a translation and the translator's affidavit.", source_file: "Test source (fixture), page 1", reason: "Test: passport defaults (CS-D7 browser)." }, AUTHOR);
await call("POST", `/library/changes/${prop.body?.id}/approve`, { note: "Second person (CS-D7 browser setup)." }, APPROVER);
await sourceEveryNumber(PORT, wp);
await call("POST", `/combinations/${wp}/submit`, {}, AUTHOR);
const review = (await call("GET", `/combinations/${wp}/review`, undefined, AUTHOR)).body;
const sme = ((review?.submission?.changeSummary ?? []) as { needs_sme: boolean; kind: string; key: string }[]).filter((x) => x.needs_sme).map((x) => `${x.kind}|${x.key}`);
if (sme.length) await call("POST", `/combinations/${wp}/signoff`, { items: sme, action: "signed" }, REVIEWER);
const rel = await call("POST", `/combinations/${wp}/approve`, {}, APPROVER);
ok("setup: wp.family is released with the passport's cited defaults", rel.status === 201, rel.status);
const c = await openCase(wp, [{ role: "principal", name: "Sample Client A", dob: "1986-04-13" }]);
const A = c.subjects["Sample Client A"];
const people = ((await call("GET", `/runtime/cases/${c.id}/checklist`, undefined, c.officer)).body?.people ?? []) as { subject: string; lines: { id: string; document: { key: string } }[] }[];
const lineId = people.find((x) => x.subject === A)?.lines.find((x) => x.document.key === PASSPORT)?.id;
const fd = new FormData(); fd.append("file", new Blob([new Uint8Array(textPdf(["Sample synthetic passport"]))]), "sample-passport.pdf");
const up = await fetch(`${BASE}/api/runtime/checklist-lines/${lineId}/documents`, { method: "POST", headers: { "x-actor": c.officer }, body: fd });
const doc = ((await up.json().catch(() => null)) as { document?: { id: string } } | null)?.document?.id;
ok("setup: the case opens and the passport is uploaded on its line", !!lineId && up.status < 300 && !!doc, up.status);
if (!doc) { console.log(`\n${pass}/${pass + fail} passed`); process.exit(1); }

// ---------------------------------------------------------------- the browser, keyboard only
const b = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce", locale: "en-US" });
const p = await ctx.newPage(); const errs: string[] = [];
p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|status of 4\d\d/.test(m.text())) errs.push(m.text()); });
await p.goto(BASE); await p.evaluate((a) => localStorage.setItem("xr-actor", a), c.officer);
const settle = async () => { await p.waitForFunction(() => !document.querySelector('[aria-busy="true"]') && !document.querySelector(".animate-spin"), null, { timeout: 30_000 }); await p.waitForTimeout(300); };
let n = 0;
async function state(name: string, scope: string, widths = [1440, 1024, 375]) {
  n++; await settle();
  for (const w of widths) {
    await p.setViewportSize({ width: w, height: w === 375 ? 812 : w === 1440 ? 900 : 768 }); await p.waitForTimeout(250);
    await p.screenshot({ path: join(SHOTS, `CSD7-${String(n).padStart(2, "0")}-${name}-${w}.png`) });
    ok(`${w} px: ${name} has no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }
  const v = (await new AxeBuilder({ page: p }).include(scope).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations.filter((x) => x.impact === "serious" || x.impact === "critical");
  ok(`CS-D7 axe: ${name}: 0 serious or critical WCAG 2.2 A/AA violations`, v.length === 0, v.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes[0]?.target}`));
  await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(150);
}
const line = () => p.locator(`[data-documents-panel] [data-line="${lineId}"]`);
const focused = (sel: string) => p.evaluate((s) => !!document.activeElement?.matches(s), sel);
/** Tab forward (at most 25 times) until the element matching `sel` has focus. */
async function tabTo(sel: string) { for (let i = 0; i < 25; i++) { if (await focused(sel)) return true; await p.keyboard.press("Tab"); } return focused(sel); }
async function openFlags() {
  await line().locator("[data-line-menu]").focus(); await p.keyboard.press("Enter");
  await p.locator('[data-action="flags"]').waitFor(); await p.waitForTimeout(200);
  const on = () => p.evaluate(() => !!document.querySelector('[data-action="flags"][data-highlighted]') && !!document.activeElement?.matches('[data-action="flags"]'));
  for (let i = 0; i < 10 && !(await on()); i++) { await p.keyboard.press("ArrowDown"); await p.waitForTimeout(120); }
  if (!(await on())) throw new Error("the keyboard did not reach \"Document flags…\" in the line's menu");
  await p.keyboard.press("Enter"); await p.locator("[data-flags-form]").waitFor(); await settle();
}

try {
  await p.goto(`${BASE}/cases/${c.id}`); await line().waitFor({ timeout: 60_000 }); await settle();
  ok("CS-D7: before any flag, the person has no translation line", await p.locator("[data-translation-line]").count() === 0);
  await openFlags();
  ok("CS-D7 panel: the line's menu opens \"Document flags…\" by keyboard; the dialog says notarisation comes from the document type and the expiry date is missing", /Not required \(from the document type\)/.test(await p.locator("[data-flag-notarisation-now]").innerText()) && /enter the date/.test(await p.locator("[data-flag-warnings]").innerText()));
  await state("flags-dialog", "[role=dialog]");
  ok("CS-D7 keyboard: Tab reaches the language", await tabTo("[data-flag-language]"));
  await p.keyboard.type("Spanish"); await p.waitForTimeout(150);
  ok("CS-D7 keyboard: typing picks Spanish", (await p.locator("[data-flag-language]").inputValue()) === "es", await p.locator("[data-flag-language]").inputValue());
  await tabTo("[data-flag-translation-detail]"); await p.keyboard.press("Enter");
  await p.locator("[data-flags-form]").waitFor({ state: "detached" }); await settle();
  ok("CS-D7 keyboard: Enter saves; the dialog closes and focus is back on the line's menu", await focused(`[data-line="${lineId}"] [data-line-menu]`));
  const t = p.locator(`[data-translation-line="${doc}"]`);
  ok("CS-D7 pass: Spanish adds one \"Translation + translator's affidavit\" line, Needed, linked to the passport", await t.count() === 1 && /Translation \+ translator's affidavit/.test(await t.innerText()) && (await t.getAttribute("data-translation-state")) === "needed", await p.locator("[data-translations]").innerText().catch(() => ""));
  await state("translation-line", "[data-documents-panel]");

  // Provided without a detail: the server's words, the dialog stays.
  await openFlags();
  await tabTo("[data-flag-translation]"); await p.keyboard.type("Provided"); await p.waitForTimeout(100);
  await tabTo("[data-flag-translation-detail]"); await p.keyboard.press("Enter");
  await p.locator("[data-flags-error]").waitFor();
  ok("CS-D7 fail: Provided without a detail shows the server's words; the dialog stays open", /needs its detail/.test(await p.locator("[data-flags-error]").innerText()) && await p.locator("[data-flags-form]").count() === 1);
  await state("provided-needs-detail", "[role=dialog]", [1440]);
  await p.keyboard.type("Sample: certified translator, affidavit attached"); await p.keyboard.press("Enter");
  await p.locator("[data-flags-form]").waitFor({ state: "detached" }); await settle();
  ok("CS-D7 pass: with the detail it saves; the translation line shows Provided", (await p.locator(`[data-translation-line="${doc}"]`).getAttribute("data-translation-state")) === "provided");

  // An expiry in the past: a warning, nothing blocked.
  const before = await line().getAttribute("data-state");
  await openFlags();
  await tabTo("[data-flag-expires]"); await p.keyboard.type("01022020"); await p.keyboard.press("Enter");
  await p.locator("[data-flags-form]").waitFor({ state: "detached" }); await settle();
  const warn = await line().locator("[data-flag-warning]").allInnerTexts();
  ok("CS-D7 pass: an expiry date in the past shows a warning on the line", warn.some((w) => /^Expired on 2020-01-02/.test(w)), warn);
  ok("CS-D7 pass: nothing is blocked: the line keeps its state", (await line().getAttribute("data-state")) === before, [before, await line().getAttribute("data-state")]);
  await state("expired-warning", "[data-documents-panel]");

  // Review M1 and break M1: another person changes the expiry while this dialog is open; the save is refused (409), the
  // form shows the flags as they are now, and saving again never writes back the old expiry.
  await openFlags();
  const v0 = Number(sql(`select flags_version from case_document where id='${doc}'`));
  const other = await call("POST", `/runtime/documents/${doc}/flags`, { version: v0, expires_on: "2031-05-05" }, c.officer);
  await tabTo("[data-flag-expires]"); await p.keyboard.type("03042029"); await p.keyboard.press("Enter");
  await p.locator("[data-flags-error]").waitFor(); await settle();
  ok("review M1 fail: a save on a version someone changed meanwhile is refused in words, and the form now shows their expiry", other.status === 200 && /changed after you opened/.test(await p.locator("[data-flags-error]").innerText()) && (await p.locator("[data-flag-expires]").inputValue()) === "2031-05-05", [other.status, await p.locator("[data-flag-expires]").inputValue()]);
  await tabTo("[data-flag-translation-detail]"); await p.keyboard.press("Enter");
  await p.locator("[data-flags-form]").waitFor({ state: "detached" }); await settle();
  ok("review M1 pass: saving again with nothing changed writes nothing; their expiry stays", sql(`select expires_on::text from case_document where id='${doc}'`) === "2031-05-05" && Number(sql(`select flags_version from case_document where id='${doc}'`)) === v0 + 1);
  await openFlags();
  await tabTo("[data-flag-notarisation]"); await p.keyboard.type("Required"); await tabTo("[data-flag-notarisation-detail]"); await p.keyboard.press("Enter");
  await p.locator("[data-flags-form]").waitFor({ state: "detached" }); await settle();
  const last = sql(`select string_agg(summary, ' | ' order by at) from audit_event where entity_key='${doc}' and action='flag changed' and (detail->>'version')::int = ${v0 + 2}`) ?? "";
  ok("review M1 pass: changing only notarisation sends only notarisation: one audit line (the stored value was not set; Not required only came from the document type), the expiry untouched", /notarisation .*: not set → Required$/.test(last) && !/expiry|language|translation/.test(last) && sql(`select expires_on::text from case_document where id='${doc}'`) === "2031-05-05", last);

  // English: the translation line goes (Provided stays Provided until staff change it, so clear it to the type's default).
  await openFlags();
  await tabTo("[data-flag-language]"); await p.keyboard.type("English");
  await tabTo("[data-flag-translation]"); await p.keyboard.type("From"); await tabTo("[data-flag-translation-detail]");
  await p.keyboard.press("Control+A"); await p.keyboard.press("Backspace"); await p.keyboard.press("Enter");
  await p.locator("[data-flags-form]").waitFor({ state: "detached" }); await settle();
  ok("CS-D7 pass: English (translation back on the type's default) takes the translation line away", await p.locator("[data-translation-line]").count() === 0, await p.locator("[data-translations]").innerText().catch(() => "none"));
  const audits = Number(sql(`select count(*) from audit_event where entity='case document' and entity_key='${doc}' and action='flag changed'`));
  ok("CS-D7 pass: each flag change made on screen or by the other person wrote one audit line (language, translation, its detail, expiry, the other's expiry, notarisation, language, translation, detail: 9)", audits === 9, audits);
  ok("CS-D7: no page error or console error", errs.length === 0, errs);
} catch (e) { await p.screenshot({ path: join(SHOTS, "CSD7-crash.png") }).catch(() => undefined); ok(`CS-D7 browser: ran to its end (crashed: ${(e as Error).message}; focus: ${await p.evaluate(() => document.activeElement?.outerHTML.slice(0, 160)).catch(() => "?")}; dialog: ${await p.locator("[role=dialog]").innerText().catch(() => "none")})`, false); }
await b.close();
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
