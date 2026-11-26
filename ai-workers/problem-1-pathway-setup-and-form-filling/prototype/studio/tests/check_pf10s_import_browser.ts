// PF-10s (R1.35; concept screens/PF-10s/concept.md §3 and §6): the Import screens' rules, each with a pass and a fail.
// Part 1, in Node: the page's helpers (contract.ts) — the state words, where a row opens, one column per field, why
// Import waits (BR-2 stale, BR-6 nothing new, challenge M1 attestation), the button's count, the template's header.
// Part 2, in a browser on an isolated copy (never :4400): BR-1 no Import before a preview; BR-3 an Admin (no Owner role)
// is told an Owner must confirm (the attestation answer stubbed, as no Sample user is an Admin); keyboard only: New
// import → upload → Preview → a chip by Space → Import by Enter; BR-5 the Case Officer has no entry and the page says no
// access. US$0, no model call. The journey j_35 walks the whole row.
//   zsh studio/tools/isolated.sh screens_pf10s 4442 start PLATFORM_IDENTITY=local && tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf10s_import_browser.ts 4442 xr_studio_screens_pf10s
import { existsSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { client, recorder } from "./runtime/api.ts";
import { COPY, doneWords, importWords, runBlocked, stateWords, stepOf, templateCsv, usedElsewhere, type Batch } from "../web/src/modules/platform/import/contract.ts";

const { ok, summary } = recorder();
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
ok("PF-10s pass: the template's header is the fields' labels, a value with a comma quoted", templateCsv([{ key: "x", label: "A, B", required: false, kind: "TEXT" }, { key: "email", label: "Email", required: false, kind: "EMAIL" }]).startsWith("\"A, B\",Email\r\n"));

// ------------------------------------------------------------------------------------------------ part 2: the browser
if (!PORT || PORT === 4400 || !DB) { ok("PF-10s browser part: an isolated copy's port and database are given (never :4400)", false, { PORT, DB }); process.exit(summary() ? 1 : 0); }
const BASE = `http://localhost:${PORT}`, { sql: rawSql } = client(PORT, DB), sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
const browser = await chromium.launch({ ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errors: string[] = [];
const signIn = async (actor: string): Promise<Page> => {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: actor, secondStep: true }) });
  const token = ((await r.json()) as { token: string }).token;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
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
  if (await seen(p, "[data-attest]", 5_000)) { await p.locator("[data-attest-tick]").check(); await p.locator("[data-attest-confirm]").click(); await p.locator("[data-attest]").waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined); }
  const kPrev = await tabTo(p, "[data-preview]"); await p.keyboard.press("Enter");
  const onPrev = await seen(p, '[data-step="preview"]', 30_000) && await seen(p, "[data-row]");
  const kChip = await tabTo(p, '[data-chip="CREATE"]'); await p.keyboard.press("Space");
  const pressed = (await p.locator('[data-chip="CREATE"]').getAttribute("aria-pressed")) === "true";
  const kRun = await tabTo(p, "[data-run]"); await p.keyboard.press("Enter");
  const done = await seen(p, "[data-done]", 60_000);
  ok("PF-10s keyboard pass: New import, the source, Next, Preview, an outcome chip (Space) and Import (Enter) are all reached by Tab and work without a mouse",
    kNew && kSource && kUp && onCols && kPrev && onPrev && kChip && pressed && kRun && done, { kNew, kSource, kUp, onCols, kPrev, onPrev, kChip, pressed, kRun, done });
  ok("PF-10s BR-1 pass: Import ran exactly the preview seen: 2 people made from the keyboard file", sql(`select count(*) from fo_person where email in ('kb.${run}@client.test','kb2.${run}@client.test')`) === "2");

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
