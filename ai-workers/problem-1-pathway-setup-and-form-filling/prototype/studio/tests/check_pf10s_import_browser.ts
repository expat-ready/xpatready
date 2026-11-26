// PF-10s (R1.35; concept screens/PF-10s/concept.md §3 and §6): the Import screens' rules, each with a pass and a fail.
// Part 1, in Node: the page's helpers (contract.ts) — the state words, where a row opens, one column per field, why
// Import waits (BR-2 stale, BR-6 nothing new, challenge M1 attestation), the button's count, the template's header.
// Part 2, in a browser on an isolated copy (never :4400): BR-1 no Import before a preview; BR-3 an Admin (no Owner role)
// is told an Owner must confirm (the attestation answer stubbed, as no Sample user is an Admin); keyboard only: New
// import → upload → Preview → a chip by Space → Import by Enter; BR-5 the Case Officer has no entry and the page says no
// access. US$0, no model call. The journey j_35 walks the whole row.
//   zsh studio/tools/isolated.sh screens_pf10s 4442 start PLATFORM_IDENTITY=local && tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf10s_import_browser.ts 4442 xr_studio_screens_pf10s
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, type Page } from "playwright";
import { client, recorder } from "./runtime/api.ts";
import { COPY, doneWords, importWords, runBlocked, stateWords, stepOf, templateCsv, usedElsewhere, type Batch } from "../web/src/modules/platform/import/contract.ts";

const { ok, summary } = recorder();
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 0), DB = process.argv[3] ?? "";

// ------------------------------------------------------------------------------------------------ part 1: the helpers
const base: Batch = { id: "b", target: "person", targetLabel: "People", sourceName: "Old CRM", state: "DRY_RUN_READY", rows: 3, header: ["Email", "Name"], sample: [], mapping: { columns: { Email: "email", Name: "givenNames" }, declared: false },
  dryRunHash: "a".repeat(64), phase: "DRY_RUN", totals: { CREATE: 2, MERGE: 1, SKIP: 0, ERROR: 0 }, attestationNeeded: false, counts: { created: 0, merged: 0, skipped: 0, errors: 0 }, createdAt: "", finishedAt: null };
const cols = { Email: "email", Name: "givenNames" };
ok("PF-10s BR-1 pass: a fresh preview with the same columns may run (\"Import 3 people\")", runBlocked(base, cols, false) === null && importWords(base) === "Import 3 people");
ok("PF-10s BR-2 fail: a column changed after the preview → Import waits with the reason", runBlocked(base, { ...cols, Name: null }, false) === COPY.stale && runBlocked(base, cols, true) === COPY.stale);
ok("PF-10s BR-6 fail: nothing to create or merge → \"Nothing new to import.\"", runBlocked({ ...base, totals: { CREATE: 0, MERGE: 0, SKIP: 3, ERROR: 0 } }, cols, false) === COPY.nothingNew);
ok("PF-10s BR-3 fail (challenge M1): a preview made before an Owner confirmed → \"An Owner must confirm first; then Preview again.\"", runBlocked({ ...base, attestationNeeded: true }, cols, false) === COPY.ownerFirst);
ok("PF-10s pass: one person reads \"Import 1 person\"; the result reads its four counts", importWords({ ...base, totals: { CREATE: 1, MERGE: 0, SKIP: 0, ERROR: 0 } }) === "Import 1 person" && doneWords({ created: 2, merged: 1, skipped: 1, errors: 1 }) === "Done: 2 created, 1 merged, 1 skipped, 1 not imported.");
ok("PF-10s pass/fail: one column per field: the fields other columns use, never the column's own", [...usedElsewhere(cols, "Name")].join() === "email" && !usedElsewhere(cols, "Email").has("email"));
ok("PF-10s pass/fail: the states in words, and a run that made nobody is \"Nothing imported\", not \"Done\"",
  stateWords("COMPLETED", { created: 1, merged: 0 }).text === "Done" && stateWords("COMPLETED", { created: 0, merged: 0 }).text === "Nothing imported" && stateWords("PARTIAL").text === "Done with errors" && stateWords("DRY_RUN_READY").text === "Preview ready");
ok("PF-10s pass (challenge m3): a list row opens at its step", stepOf("DRAFT") === "columns" && stepOf("DRY_RUN_READY") === "preview" && stepOf("RUNNING") === "running" && stepOf("PARTIAL") === "result");
ok("PF-10s pass/fail (break m8): the template is the fields' labels only (a value with a comma quoted), no Sample row to import by mistake", templateCsv([{ key: "x", label: "A, B", required: false, kind: "TEXT" }, { key: "email", label: "Email", required: false, kind: "EMAIL" }]) === "\"A, B\",Email\r\n");

// ------------------------------------------------------------------------------------------------ part 2: the browser
if (!PORT || PORT === 4400 || !DB) { ok("PF-10s browser part: an isolated copy's port and database are given (never :4400)", false, { PORT, DB }); process.exit(summary() ? 1 : 0); }
const BASE = `http://localhost:${PORT}`, { sql: rawSql } = client(PORT, DB), sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
const browser = await chromium.launch({ ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errors: string[] = [];
const signIn = async (actor: string, width = 1440): Promise<Page> => {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: actor, secondStep: true }) });
  const token = ((await r.json()) as { token: string }).token;
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  await ctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, token);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e))); return p;
};
const seen = (p: Page, sel: string, ms = 20_000) => p.locator(sel).first().waitFor({ timeout: ms }).then(() => true, () => false);
const focusedIs = (p: Page, sel: string) => p.evaluate((s) => document.activeElement?.matches(s) ?? false, sel);
const tabTo = async (p: Page, sel: string, max = 80) => { for (let i = 0; i < max; i++) { if (await focusedIs(p, sel)) return true; await p.keyboard.press("Tab"); } return focusedIs(p, sel); };
const run = Date.now().toString(36).slice(-5);
const FILE = `Email,First name\r\nkb.${run}@client.test,Kay\r\nkb2.${run}@client.test,Bea\r\n`;

try {
  const p = await signIn("user-R");
  // Keyboard only from the list: Tab to New import, Enter.
  await p.goto(`${BASE}/platform/import`);
  await seen(p, "[data-new-import]");
  const kNew = await tabTo(p, "[data-new-import]"); await p.keyboard.press("Enter");
  await seen(p, "[data-source]");
  const kSource = await tabTo(p, "[data-source]"); await p.keyboard.type("Keyboard list");
  await p.locator("[data-file]").setInputFiles({ name: "k.csv", mimeType: "text/csv", buffer: Buffer.from(FILE) });   // a file picker is the system's dialog
  const kUp = await tabTo(p, "[data-upload]"); await p.keyboard.press("Enter");
  const onCols = await seen(p, '[data-step="columns"]', 30_000);
  ok("PF-10s BR-1 fail: before a preview there is no Import button (Columns shows Preview only)", onCols && (await p.locator("[data-run]").count()) === 0);
  if (await seen(p, "[data-attest]", 5_000)) { await p.locator("[data-attest-tick]").click(); await p.locator("[data-attest]").waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined); }
  const kPrev = await tabTo(p, "[data-preview]"); await p.keyboard.press("Enter");
  const onPrev = await seen(p, '[data-step="preview"]', 30_000) && await seen(p, "[data-row]");
  const kChip = await tabTo(p, '[data-chip="CREATE"]'); await p.keyboard.press("Space");
  const pressed = (await p.locator('[data-chip="CREATE"]').getAttribute("aria-pressed")) === "true";
  const kRun = await tabTo(p, "[data-run]"); await p.keyboard.press("Enter");
  const done = await seen(p, "[data-done]", 60_000);
  ok("PF-10s keyboard pass: New import, the source, Next, Preview, an outcome chip (Space) and Import (Enter) are all reached by Tab and work without a mouse",
    kNew && kSource && kUp && onCols && kPrev && onPrev && kChip && pressed && kRun && done, { kNew, kSource, kUp, onCols, kPrev, onPrev, kChip, pressed, kRun, done });
  ok("PF-10s BR-1 pass: Import ran exactly the preview seen: 2 people made from the keyboard file", sql(`select count(*) from fo_person where email in ('kb.${run}@client.test','kb2.${run}@client.test')`) === "2");

  // Review round 1 Major: the declaration ticked, then the consent column unmapped → a fresh preview may run (the
  // declaration no longer applies), never "The columns changed" for ever.
  const d = await signIn("user-R");
  await d.goto(`${BASE}/platform/import/new`);
  await d.locator("[data-source]").fill("Declaration trap");
  await d.locator("[data-file]").setInputFiles({ name: "d.csv", mimeType: "text/csv", buffer: Buffer.from(`Email,First name,Marketing\r\ndt.${run}@client.test,Dee,yes\r\n`) });
  await d.locator("[data-upload]").click(); await seen(d, '[data-step="columns"]', 30_000);
  await d.locator("[data-declare]").check();
  await d.locator('[data-import-as="Marketing"]').selectOption("");
  const declGone = (await d.locator("[data-declare]").count()) === 0;
  await d.locator("[data-preview]").click(); await seen(d, '[data-step="preview"]', 30_000); await seen(d, "[data-row]");
  const trapOn = await d.locator("[data-run]").isEnabled(), trapWhy = await d.locator("[data-run-why]").count();
  ok("PF-10s BR-2 fail (review M1): declaration ticked, then the consent column unmapped → the fresh preview's Import is enabled (no false \"columns changed\")", declGone && trapOn && trapWhy === 0, { declGone, trapOn, trapWhy });
  await d.context().close();

  // Break round 1: a column named "constructor" (the answer's keys are the file's columns), a file that is not a CSV,
  // and an import that does not exist.
  const c = await signIn("user-R");
  await c.goto(`${BASE}/platform/import/new`);
  await c.locator("[data-source]").fill("Ctor");
  await c.locator("[data-file]").setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("Email,Name\r\nx@y.test,X\r\n") });
  await c.locator("[data-upload]").click();
  const typeRefused = (await c.locator('[data-file]').getAttribute("aria-invalid")) === "true" && await c.evaluate(() => document.activeElement?.matches("[data-file]") ?? false) && c.url().endsWith("/platform/import/new");
  await c.locator("[data-file]").setInputFiles({ name: "c.csv", mimeType: "text/csv", buffer: Buffer.from(`Email,First name,constructor\r\nct.${run}@client.test,Cee,v\r\n`) });
  await c.locator("[data-upload]").click(); await seen(c, '[data-step="columns"]', 30_000);
  await c.locator("[data-preview]").click();
  const ctorPrev = await seen(c, '[data-step="preview"]', 30_000) && await seen(c, "[data-row]");
  const headFocused = await c.evaluate(() => document.activeElement?.matches("[data-step-heading]") ?? false);
  await c.locator("[data-run]").click();
  const ctorDone = await seen(c, "[data-done]", 60_000), ctorFail = await c.locator("[data-load-failed]").count();
  ok("PF-10s fail (break M1, m2, m4): a .pdf is refused on the file field (focus there); a column named \"constructor\" previews and imports (no \"could not load\"); focus moves to the heading after Preview",
    typeRefused && ctorPrev && ctorDone && ctorFail === 0 && headFocused, { typeRefused, ctorPrev, ctorDone, ctorFail, headFocused });
  await c.goto(`${BASE}/platform/import/00000000-0000-4000-8000-000000000000`);
  const nf = await seen(c, "[data-load-failed] h1", 20_000);
  ok("PF-10s fail (break m5): an import that does not exist reads \"No such import\" as the page's heading, with the way back", nf && (await c.locator("[data-load-failed] h1").innerText()).trim() === "No such import" && (await c.getByRole("button", { name: "Back to imports" }).count()) === 1);
  await c.context().close();

  // Axe on every step (review S5): file, columns, preview, at 1440 and 375 px.
  for (const width of [1440, 375]) {
    const a = await signIn("user-R", width), bad: string[] = [];
    const axe = async (step: string) => { await a.waitForTimeout(300); const v = (await new AxeBuilder({ page: a }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations; bad.push(...v.map((x) => `${step}: ${x.id} ${x.nodes[0]?.target}`)); };
    await a.goto(`${BASE}/platform/import/new`); await seen(a, "[data-source]"); await axe("file");
    await a.locator("[data-source]").fill(`Axe ${width}`); await a.locator("[data-file]").setInputFiles({ name: "x.csv", mimeType: "text/csv", buffer: Buffer.from(FILE) }); await a.locator("[data-upload]").click();
    await seen(a, '[data-step="columns"]', 30_000); await axe("columns");
    const fits = await a.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const selectShown = await a.locator('[data-import-as="Email"]').evaluate((el) => { const r = el.getBoundingClientRect(); return r.right <= window.innerWidth && r.width > 0; });
    await a.locator("[data-preview]").click(); await seen(a, '[data-step="preview"]', 30_000); await seen(a, "[data-row]"); await axe("preview");
    ok(`PF-10s pass (review S3, S5): file, columns and preview at ${width} px: no WCAG 2.2 A/AA violation, no sideways scroll, "Import as" on screen`, bad.length === 0 && fits && selectShown, { bad, fits, selectShown });
    await a.context().close();
  }

  // BR-3 / challenge M1: an Admin sees the Owner line, not the box (the attestation answer stubbed: no Sample Admin).
  const q = await signIn("user-R");
  await q.route("**/api/platform/imports/attestation", (r) => r.request().method() === "GET" ? r.fulfill({ json: { current: null, canAttest: false, wording: { version: "x", words: "w", unconfirmed: "Unconfirmed: no counsel" } } }) : r.continue());
  await q.goto(`${BASE}/platform/import/new`);
  await q.locator("[data-source]").fill("Admin check"); await q.locator("[data-file]").setInputFiles({ name: "a.csv", mimeType: "text/csv", buffer: Buffer.from(FILE) }); await q.locator("[data-upload]").click();
  await seen(q, '[data-step="columns"]', 30_000);
  const wait = await seen(q, "[data-attest-wait]", 10_000), box = await q.locator("[data-attest]").count();
  ok("PF-10s BR-3 fail: without an Owner's confirmation an Admin reads \"An Owner of your firm must confirm this once…\" and no confirm box", wait && box === 0 && (await q.locator("[data-attest-wait]").innerText()).includes(COPY.adminWait), { wait, box });
  await q.context().close();

  // BR-5: the Case Officer.
  const o = await signIn("user-O");
  await o.goto(`${BASE}/account`); await seen(o, "[data-account-section]");
  const entry = await o.locator('[data-account-section="/platform/import"]').count();
  await o.goto(`${BASE}/platform/import`);
  ok("PF-10s BR-5 fail: the Case Officer sees no Import entry and /platform/import says no access", entry === 0 && await seen(o, "[data-no-access]"), { entry });
  const r = await signIn("user-R"); await r.goto(`${BASE}/account`); await seen(r, "[data-account-section]");
  ok("PF-10s BR-5 pass: the Owner sees Import after Templates in My account's menu", await r.evaluate(() => [...document.querySelectorAll("[data-account-section]")].map((e) => e.getAttribute("data-account-section")).join(" ").includes("/platform/templates /platform/import")));
  ok("PF-10s: no page error", errors.length === 0, errors.slice(0, 3));
} catch (e) {
  ok("PF-10s: the check ran to its end", false, String(e).slice(0, 500));
} finally { await browser.close(); }
process.exit(summary() ? 1 : 0);
