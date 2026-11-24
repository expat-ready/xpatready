// PF-21rs (R1.86, R1.85; concept r2 screens/PF-21rs/concept.md §3-§6, row W1-W6): our console's Privacy pages walked in a
// browser on an isolated copy (its own database and port, never :4400) as the Sample Platform Owner signed in on the
// console's card, each checked against the API and the database underneath, with a pass and a fail each. Part A1 (this
// file's first part; A2 adds the breach's page and W4, B the requests and holds and W1-W3):
//   P     the page's words (privacy/contract.ts): a breach's calculated status and its notices count (challenge m5),
//         the record body (blanks left out), the 422 field names;
//   A1-1  Breaches (j_86 W1, j_85 W7): signed out → the card; signed in → the menu's Privacy group, the heading and
//         "Record a breach"; each row equals the API's answer (time, firms by name, decision, notices, status);
//   A1-2  Record a breach by the dialog: fail first (no description, no reason → each refusal under its field, nothing
//         stored); then a firm picked by search, two categories, a reason → stored as written by our staff member, the
//         guard's line with the reason, the new row first with "Decision owed"; a double click records once;
//   W5    (A1's page) a firm Owner's token → 403 on every breach route and nothing written; a firm Owner's browser sees the
//         console's card and no register data, and the card refuses their email; the Auditor reads with no change button
//         and the read-only line; Support (no key) → the API's 403 words, no table, no Breaches link;
//   W6    (A1's page) keyboard only through "Record a breach" to a stored breach; axe-core WCAG 2.2 A/AA 0 serious at 400,
//         1024 and 1440 px (j_86 W9) with the dialog open too; no sideways page scroll.
// Sample firms and Sample staff only; US$0, no model call, live AI off. Screenshots (deviceScaleFactor 1) in
// product/screens/PF-21rs/screenshots/. Run from prototype/:
//   zsh studio/tools/isolated.sh pf21rs 4434 start AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local && tsx studio/tests/check_pf21rs_browser.ts 4434 xr_studio_pf21rs
// (the form run-suites.sh reads; it starts and stops the copy itself. By hand, stop it after: isolated.sh pf21rs 4434 stop)
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { client, recorder } from "./runtime/api.ts";
import { SESSION_KEY } from "../web/src/modules/system/contract.ts";
import { COPY, fieldErrors, firmWords, fromLocalBox, noticesText, recordBody, STATUS_WORDS, statusOf, whenWords } from "../web/src/modules/system/privacy/contract.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4434), process.argv[3] ?? "xr_studio_pf21rs"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "PF-21rs", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string | null, path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j };
};
const OWNER = "ops.sample@expatready.example.com", SUPPORT = "support.sample@expatready.example.com", AUDITOR = "auditor.pf21rs@expatready.example.com";
const ourToken = async (email: string) => {
  const r = await api(null, "/system/session/local", "POST", { email, secondStep: true });
  if (!r.body?.token) { console.error(`STOP  our sign-in refused for ${email} (start the copy with PLATFORM_SYSTEM_IDENTITY=local): ${JSON.stringify(r.body).slice(0, 300)}`); process.exit(2); }
  return r.body.token as string;
};
const run = Date.now().toString(36);
const BREACHES = "/system/register/breaches";

// ------------------------------------------------------------------------------------------------ P: the page's words
{
  const b = (status: "DRAFT" | "RECORDED", decision: "UNDECIDED" | "NOTIFY_FIRMS" | "NO_NOTICE", firms: string[], sent: string[]) => ({ status, decision, affectedFirms: firms, notices: sent.map((firmId) => ({ firmId })) });
  ok("PF-21rs P pass (m5): status Draft, Decision owed, Firms to be named, Notices owed, Recorded (all sent, or No notice)",
    statusOf(b("DRAFT", "UNDECIDED", ["a"], [])) === "DRAFT" && statusOf(b("RECORDED", "UNDECIDED", ["a"], [])) === "DECISION_OWED" && statusOf(b("RECORDED", "NOTIFY_FIRMS", [], [])) === "FIRMS_TO_NAME"
      && statusOf(b("RECORDED", "NOTIFY_FIRMS", ["a", "b"], ["a"])) === "NOTICES_OWED" && statusOf(b("RECORDED", "NOTIFY_FIRMS", ["a", "b"], ["b", "a"])) === "RECORDED" && statusOf(b("RECORDED", "NO_NOTICE", ["a"], [])) === "RECORDED");
  ok("PF-21rs P fail (m5): a notice to a firm the breach no longer names never makes it Recorded; a draft is never owed notices",
    statusOf(b("RECORDED", "NOTIFY_FIRMS", ["a", "b"], ["a", "c"])) === "NOTICES_OWED" && noticesText(b("RECORDED", "NOTIFY_FIRMS", ["a", "b"], ["a", "c"])) === "1 of 2 sent"
      && noticesText(b("DRAFT", "NOTIFY_FIRMS", ["a"], [])) === "—" && noticesText(b("RECORDED", "NO_NOTICE", ["a"], [])) === "—" && noticesText(b("RECORDED", "NOTIFY_FIRMS", [], [])) === "0 of 0 sent");
  const body = recordBody({ discoveredAt: "2026-11-24T07:10", description: "x", firms: [], categories: [], rootCause: " ", containment: "", otherNotifications: "y", reason: "r" });
  ok("PF-21rs P pass/fail: the record body leaves blank texts, no firms and no categories out (never \"\"), the box's local time sent as an ISO instant",
    !("rootCause" in body) && !("containment" in body) && !("affectedFirms" in body) && !("dataCategories" in body) && body.otherNotifications === "y" && body.discoveredAt === fromLocalBox("2026-11-24T07:10") && fromLocalBox("") === null && fromLocalBox("24/11/2026") === null, body);
  ok("PF-21rs P pass/fail: a 422's field names land on the dialog's fields (affectedFirms.1 → affectedFirms); an unknown one goes above the buttons",
    JSON.stringify(fieldErrors({ "affectedFirms.1": "a uuid", reason: "Give one.", body: "Change at least one field." })) === JSON.stringify({ affectedFirms: "a uuid", reason: "Give one.", other: "Change at least one field." }) && firmWords({ id: "3f2a0000-0000-0000-0000-00000000c91e", name: null }) === "Firm 3f2a…c91e");
}

const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errors: string[] = [];
const ctx = async (width = 1440, height = 900): Promise<BrowserContext> => browser.newContext({ viewport: { width, height }, colorScheme: "light", reducedMotion: "reduce", deviceScaleFactor: 1 });
const pageIn = async (c: BrowserContext) => { const p = await c.newPage(); p.on("pageerror", (e) => errors.push(String(e))); return p; };
const signedIn = async (token: string, width = 1440) => { const c = await ctx(width); await c.addInitScript(([k, x]) => sessionStorage.setItem(k, JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), [SESSION_KEY, token] as const); return pageIn(c); };
const seen = (p: Page, sel: string, timeout = 15_000) => p.locator(sel).first().waitFor({ timeout }).then(() => true, () => false);
const serious = async (p: Page) => (await p.waitForTimeout(300), await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations
  .filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} (${v.nodes.length})`);
/** Keyboard only: Tab until the focus is on what `sel` names (a date box's own parts take a Tab each). */
const tabTo = async (p: Page, sel: string, max = 14) => { for (let i = 0; i < max; i++) { await p.keyboard.press("Tab"); if (await p.evaluate((s) => document.activeElement?.matches(s) ?? false, sel)) return true; } return false; };
const heading = (p: Page) => p.getByRole("heading", { level: 1, name: /^Breaches$/ });
const count = () => sql(`select count(*) from plat_breach`);
const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
const nameA = sql(`select operating_name from platform_firm where id = '${A}'`), nameB = sql(`select operating_name from platform_firm where id = '${B}'`);
const tOwner = await ourToken(OWNER);
const ownerId = sql(`select id from plat_system_staff where email = '${OWNER}'`);
try {
  // ---------------------------------------------------------------------------------------- A1-1 the list
  // Two breaches by the API: one naming A and B, decided "Notify firms" (Notices owed, 0 of 2); one under investigation.
  const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const two = await api(tOwner, BREACHES, "POST", { reason: "Sample: PF-21rs A1 seed", discoveredAt: ago(3), description: `Sample: a bucket's files were readable by link (PF-21rs ${run}).`, affectedFirms: [A, B], dataCategories: ["contact_details"] }, { "idempotency-key": `pf21rs-a-${run}` });
  const decided = await api(tOwner, `${BREACHES}/${two.body?.id}`, "PATCH", { reason: "Sample: deciding", decision: "NOTIFY_FIRMS", decisionReason: "Sample: contact details may have been seen." });
  const open = await api(tOwner, BREACHES, "POST", { reason: "Sample: PF-21rs A1 seed", discoveredAt: ago(5), description: `Sample: an export may have reached the wrong address (PF-21rs ${run}).` }, { "idempotency-key": `pf21rs-b-${run}` });
  ok("PF-21rs A1-1 setup: two breaches recorded by the API (one naming firms A and B, decided Notify firms; one under investigation)", two.status === 201 && decided.status === 200 && open.status === 201, [two.status, decided.status, open.status]);

  const c1 = await ctx(), p1 = await pageIn(c1);
  await p1.goto(`${BASE}/system/privacy/breaches`);
  ok("PF-21rs A1-1 fail: signed out, the Breaches page shows the console's sign-in card and no register row", await seen(p1, "[data-system-sign-in]") && (await p1.locator("[data-breach-row]").count()) === 0);
  await p1.getByLabel("Work email").fill(OWNER); await p1.getByRole("button", { name: "Sign in" }).click();
  const inPage = await heading(p1).waitFor({ timeout: 15_000 }).then(() => true, () => false);
  await p1.locator(`[data-breach-row="${two.body?.id}"]`).waitFor({ timeout: 10_000 }).catch(() => undefined);
  const menu = p1.getByRole("navigation", { name: "Console" });
  ok("PF-21rs A1-1 pass (j_86 W1, j_85 W7): the Platform Owner signs in on the card and lands on Breaches with \"Record a breach\"; the side menu's Privacy group links Breaches",
    inPage && (await p1.getByRole("button", { name: "Record a breach" }).count()) === 1 && (await menu.getByRole("group", { name: "Privacy" }).getByRole("link", { name: "Breaches" }).count()) === 1
      && (await p1.title()) === "Breaches · ExpatReady console", { inPage, title: await p1.title() });
  const listed = (await api(tOwner, BREACHES)).body;
  const rowMatches = async (id: string) => {
    const b = listed.breaches.find((x: { id: string }) => x.id === id), row = p1.locator(`[data-breach-row="${id}"]`);
    if (!b || (await row.count()) !== 1) return { b: !!b, row: false };
    const t = (await row.innerText()).replace(/\s+/g, " "), when = await row.locator("time").getAttribute("datetime");
    const firms = b.firms.length ? b.firms.map(firmWords).every((n: string) => t.includes(n)) : t.includes(COPY.underInvestigation);
    return { b: true, row: true, ok: when === b.discoveredAt && t.includes(whenWords(b.discoveredAt)) && t.includes(b.description) && firms && t.includes(noticesText(b)) && t.includes(STATUS_WORDS[statusOf(b)].word), t };
  };
  const r2 = await rowMatches(two.body?.id), rOpen = await rowMatches(open.body?.id);
  ok("PF-21rs A1-1 pass: each row equals the API's answer: discovered time (<time datetime>), what happened, firms A and B by name (or Under investigation), notices, status",
    !!r2.ok && !!rOpen.ok && (r2.t ?? "").includes(nameA) && (r2.t ?? "").includes(nameB) && (r2.t ?? "").includes("0 of 2 sent") && (r2.t ?? "").includes("Notices owed") && (rOpen.t ?? "").includes("Decision owed"), { r2, rOpen });
  const order = await p1.locator("[data-breach-row]").evaluateAll((els) => els.map((e) => e.getAttribute("data-breach-row")));
  ok("PF-21rs A1-1 pass: the rows keep the API's order (newest discovered first)", JSON.stringify(order) === JSON.stringify(listed.breaches.map((b: { id: string }) => b.id)), { order: order.length });
  await p1.screenshot({ path: join(SHOTS, "a1-01-breaches-1440.png"), fullPage: true });

  // ---------------------------------------------------------------------------------------- A1-2 record by the dialog
  await p1.getByRole("button", { name: "Record a breach" }).click();
  const dlg = p1.getByRole("dialog", { name: "Record a breach" });
  await dlg.waitFor();
  const before = count();
  await dlg.getByRole("button", { name: "Record the breach" }).click();
  const descErr = await dlg.locator("[data-field=description] ~ [role=alert]").innerText({ timeout: 10_000 }).catch(() => "");
  const reasonErr = await dlg.locator("[data-field=reason] ~ [role=alert]").innerText({ timeout: 5000 }).catch(() => "");
  ok("PF-21rs A1-2 fail (BR-7, m2): no description and no reason → each refusal under its own field (the API's words), nothing recorded, the dialog stays open",
    descErr.length > 0 && /reason/i.test(reasonErr) && count() === before && await dlg.isVisible(), { descErr, reasonErr });
  const focusOnDesc = await p1.evaluate(() => document.activeElement?.matches("[data-field=description]") ?? false);
  const desc = `Sample: a support export was sent to the wrong address (PF-21rs A1 ${run}).`;
  await dlg.getByLabel("What happened").fill(desc);
  const afterFix = { desc: await dlg.locator("[data-field=description] ~ [role=alert]").count(), reason: await dlg.locator("[data-field=reason] ~ [role=alert]").count() };
  ok("PF-21rs A1-2 pass: the focus goes to the first refused field; a changed field's refusal goes with the change, the others stay",
    focusOnDesc && afterFix.desc === 0 && afterFix.reason === 1, { focusOnDesc, afterFix });
  await dlg.getByRole("searchbox", { name: "Find a firm by name" }).fill(nameA.slice(0, 8));
  await dlg.getByRole("button", { name: `Add ${nameA}` }).click();
  await dlg.getByRole("checkbox", { name: "identity documents" }).check(); await dlg.getByRole("checkbox", { name: "contact details" }).check();
  await dlg.getByLabel("Containment").fill("Sample: the address was asked to delete it.");
  await dlg.getByLabel("Reason for the audit line").fill(`Sample: recording the incident (PF-21rs A1 ${run})`);
  await p1.screenshot({ path: join(SHOTS, "a1-02-record-dialog-1440.png") });
  const t0 = Date.now();
  await dlg.getByRole("button", { name: "Record the breach" }).dblclick();
  const done = await seen(p1, "[data-recorded]", 15_000);
  await dlg.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
  const stored = sql(`select status || '|' || array_to_string(affected_firms, ',') || '|' || array_to_string(data_categories, ',') || '|' || containment || '|' || opened_by || '|' || floor(extract(epoch from discovered_at)) from plat_breach where description = '${desc.replace(/'/g, "''")}'`).split("|");
  const many = sql(`select count(*) from plat_breach where description = '${desc.replace(/'/g, "''")}'`);
  ok("PF-21rs A1-2 pass (BR-1): the breach is stored as written: RECORDED, firm A, the two categories, the containment, opened by our staff member, discovered now (the box's own minute)",
    done && stored[0] === "RECORDED" && stored[1] === A && stored[2] === "identity_documents,contact_details" && stored[3] === "Sample: the address was asked to delete it." && stored[4] === `staff:${ownerId}`
      && Math.abs(Number(stored[5]) * 1000 - t0) < 120_000, { done, stored });
  ok("PF-21rs A1-2 pass (STANDARDS §4): a double click on \"Record the breach\" records it once (one Idempotency-Key per opening)", many === "1", many);
  const line = sql(`select count(*) from plat_system_audit where route = '/api/system/register/breaches' and outcome::text = 'ALLOWED' and staff_id = '${ownerId}' and reason = 'Sample: recording the incident (PF-21rs A1 ${run})'`);
  ok("PF-21rs A1-2 pass (BR-7): the guard's audit line carries the person's own reason", line === "1", line);
  const newId = sql(`select id from plat_breach where description = '${desc.replace(/'/g, "''")}'`);
  const freshRow = p1.locator(`[data-breach-row="${newId}"]`);
  await freshRow.waitFor({ timeout: 10_000 }).catch(() => undefined);
  // Discovered "now" (the box's minute): first unless an earlier run recorded one in the same minute, so the API's order decides.
  const orderNow = await p1.locator("[data-breach-row]").evaluateAll((els) => els.map((e) => e.getAttribute("data-breach-row")));
  const apiNow = (await api(tOwner, BREACHES)).body.breaches.map((b: { id: string }) => b.id);
  ok("PF-21rs A1-2 pass: the list shows it in the API's place (newest discovered first) with firm A, \"Decision owed\" and the next step in words",
    JSON.stringify(orderNow) === JSON.stringify(apiNow) && apiNow.indexOf(newId) >= 0 && apiNow.indexOf(newId) <= 1 && (await freshRow.innerText().catch(() => "")).includes("Decision owed") && (await freshRow.innerText().catch(() => "")).includes(nameA) && (await p1.locator("[data-recorded]").innerText()) === COPY.recorded, { at: apiNow.indexOf(newId), newId });
  await p1.screenshot({ path: join(SHOTS, "a1-03-recorded-1440.png"), fullPage: true });

  // ---------------------------------------------------------------------------------------- W5 the walls (A1's page)
  const firmEmail = sql(`select email from platform_staff where actor_id = 'user-R'`);
  const tFirm = (await api(null, "/platform/session/local", "POST", { firmKey: "sample-firm", email: firmEmail, secondStep: true })).body?.token as string;
  const n0 = count(), id2 = two.body?.id;
  const tries = [await api(tFirm, BREACHES), await api(tFirm, `${BREACHES}/${id2}`), await api(tFirm, BREACHES, "POST", { reason: "x", discoveredAt: ago(1), description: "x" }, { "idempotency-key": `pf21rs-f-${run}` }),
    await api(tFirm, `${BREACHES}/${id2}`, "PATCH", { reason: "x", description: "changed by a firm" }), await api(tFirm, `${BREACHES}/${id2}/notices`, "POST", { reason: "x", firmId: A })];
  ok("PF-21rs W5 fail (a): a firm Owner's token → 403 on the breach list, one breach, record, change and notice; nothing written",
    !!tFirm && tries.every((r) => r.status === 403) && count() === n0 && sql(`select count(*) from plat_breach_notice where breach_id = '${id2}'`) === "0" && !sql(`select description from plat_breach where id = '${id2}'`).includes("changed by a firm"), tries.map((r) => r.status));
  const c5 = await ctx(); await c5.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tFirm);
  const p5 = await pageIn(c5); await p5.goto(`${BASE}/system/privacy/breaches`);
  const cardShown = await seen(p5, "[data-system-sign-in]");
  await p5.getByLabel("Work email").fill(firmEmail); await p5.getByRole("button", { name: "Sign in" }).click();
  const firmRefused = await p5.locator("[data-system-sign-in-error]").innerText({ timeout: 10_000 }).catch(() => "");
  ok("PF-21rs W5 fail (b): a firm Owner's browser on Breaches sees the console's sign-in card and no register data; the card refuses their email and keeps no session",
    cardShown && (await p5.locator("[data-breach-row]").count()) === 0 && !(await p5.locator("body").innerText()).includes(String(two.body?.description ?? "-")) && firmRefused.length > 0
      && (await p5.evaluate((k) => sessionStorage.getItem(k), SESSION_KEY)) === null, firmRefused);
  await c5.close();
  sql(`with s as (insert into plat_system_staff (id, email, display_name) values (gen_random_uuid(), '${AUDITOR}', 'Auditor (Sample)') on conflict (email) do update set display_name = excluded.display_name returning id)
       insert into plat_system_role_grant (id, staff_id, role_code) select gen_random_uuid(), id, 'platform-auditor' from s where not exists (select 1 from plat_system_role_grant g where g.staff_id = s.id) returning staff_id`);
  const pa = await signedIn(await ourToken(AUDITOR)); await pa.goto(`${BASE}/system/privacy/breaches`);
  const audRows = await pa.locator(`[data-breach-row="${id2}"]`).waitFor({ timeout: 15_000 }).then(() => true, () => false);
  ok("PF-21rs W5 pass (c): the Auditor reads the register: the rows, the read-only line, no \"Record a breach\"",
    audRows && (await pa.locator("[data-read-only]").innerText().catch(() => "")) === COPY.readOnly && (await pa.getByRole("button", { name: "Record a breach" }).count()) === 0);
  await pa.context().close();
  const ps = await signedIn(await ourToken(SUPPORT)); await ps.goto(`${BASE}/system/privacy/breaches`);
  const noKey = await ps.locator("[data-breaches-error]").innerText({ timeout: 15_000 }).catch(() => "");
  ok("PF-21rs W5 fail (c, BR-8): Support (no breach key) reads the API's 403 words: no table, no \"Record a breach\", no Breaches link",
    /system\/breach:read|Platform Owner and Auditor/i.test(noKey) && (await ps.getByRole("table").count()) === 0 && (await ps.getByRole("button", { name: "Record a breach" }).count()) === 0 && (await ps.getByRole("link", { name: "Breaches" }).count()) === 0, noKey);
  await ps.context().close();

  // ---------------------------------------------------------------------------------------- W6 keyboard, axe, widths
  await p1.reload(); await heading(p1).waitFor({ timeout: 15_000 });
  const kdesc = `Sample: a laptop with a staff session was lost (PF-21rs keyboard ${run}).`;
  await p1.getByRole("button", { name: "Record a breach" }).focus(); await p1.keyboard.press("Enter");
  await dlg.waitFor();
  const firstFocus = await p1.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type ?? "");
  const reached: boolean[] = [];
  reached.push(await tabTo(p1, "[data-field=description]")); await p1.keyboard.type(kdesc);
  reached.push(await tabTo(p1, "[data-firm-search]")); await p1.keyboard.type(nameB);
  await dlg.locator(`[data-add-firm="${B}"]`).waitFor({ timeout: 10_000 }).catch(() => undefined);
  reached.push(await tabTo(p1, `[data-add-firm="${B}"]`)); await p1.keyboard.press("Enter");
  await dlg.locator(`[data-chosen-firm="${B}"]`).waitFor({ timeout: 5000 }).catch(() => undefined);
  const backInSearch = await p1.evaluate(() => document.activeElement?.matches("[data-firm-search]") ?? false);   // the Add button is gone: the focus is not lost
  reached.push(await tabTo(p1, "[data-category=sign_in_credentials]", 20)); await p1.keyboard.press("Space");
  reached.push(await tabTo(p1, "[data-field=reason]")); await p1.keyboard.type("Sample: recorded by keyboard");
  const axeDialog = await serious(p1);
  await p1.keyboard.press("Enter");                                                       // Enter in the reason box submits
  await seen(p1, `[data-recorded]`);
  const kStored = sql(`select array_to_string(affected_firms, ',') || '|' || array_to_string(data_categories, ',') from plat_breach where description = '${kdesc.replace(/'/g, "''")}'`);
  ok("PF-21rs W6 pass: keyboard only: Enter on \"Record a breach\" opens the dialog on its first field; Tab, typing, Enter on \"Add <firm>\", Space on a category and Enter record it",
    firstFocus === "datetime-local" && reached.every(Boolean) && backInSearch && kStored === `${B}|sign_in_credentials`, { firstFocus, reached, backInSearch, kStored });
  const widths: Record<number, { axe: string[]; sideways: boolean; rendered: boolean }> = {};
  for (const w of [1440, 1024, 400]) {
    await p1.setViewportSize({ width: w, height: 900 }); await p1.reload(); await heading(p1).waitFor({ timeout: 15_000 }).catch(() => undefined);
    await p1.locator("[data-breach-row]").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    widths[w] = { rendered: (await heading(p1).count()) === 1 && (await p1.getByRole("button", { name: "Record a breach" }).count()) === 1, axe: await serious(p1), sideways: await p1.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth > 1) };
    if (w !== 1440) await p1.screenshot({ path: join(SHOTS, `a1-04-breaches-${w}.png`), fullPage: true });
  }
  ok("PF-21rs W6 pass (j_86 W9): Breaches at 1440, 1024 and 400 px: rendered, axe-core WCAG 2.2 A/AA 0 serious (the dialog open too), no sideways page scroll",
    Object.values(widths).every((x) => x.rendered && !x.axe.length && !x.sideways) && !axeDialog.length, { widths, axeDialog });
  ok("PF-21rs: no page error during the walk", errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
}
process.exit(summary() ? 1 : 0);
