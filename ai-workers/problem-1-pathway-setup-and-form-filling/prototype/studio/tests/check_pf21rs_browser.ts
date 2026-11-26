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
//   zsh studio/tools/isolated.sh pf21rs 4434 start AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local && tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf21rs_browser.ts 4434 xr_studio_pf21rs
// (the form run-suites.sh reads; it starts and stops the copy itself. By hand, stop it after: isolated.sh pf21rs 4434 stop)
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { client, recorder } from "./runtime/api.ts";
import { SESSION_KEY } from "../web/src/modules/system/contract.ts";
import { COPY, fieldErrors, firmsText, firmWords, fromLocalBox, noticesText, recordBody, STATUS_WORDS, statusOf, whenWords } from "../web/src/modules/system/privacy/contract.ts";
import { dueWords, logBody, REQUEST_COPY, stepWords } from "../web/src/modules/system/privacy/requests.ts";
import { coversWords, HOLD_COPY, holdBody, holdFieldErrors } from "../web/src/modules/system/privacy/holds.ts";
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
  const many = Array.from({ length: 124 }, (_, i) => ({ id: `f${i}`, name: `Firm ${i}` }));
  ok("PF-21rs P pass/fail (break m3): a long firm list shows three names and \"and N more\"; three or fewer show in full",
    firmsText(many) === "Firm 0, Firm 1, Firm 2 and 121 more" && firmsText(many.slice(0, 3)) === "Firm 0, Firm 1, Firm 2");
}

{
  ok("PF-21rs B1 P pass/fail: a target date reads \"in n days\", \"today\" or \"n days late\", nothing once completed",
    dueWords({ targetDate: "2026-12-10", status: "PENDING" }, "2026-12-07") === "in 3 days" && dueWords({ targetDate: "2026-12-10", status: "OVERDUE" }, "2026-12-12") === "2 days late"
      && dueWords({ targetDate: "2026-12-10", status: "IN_PROGRESS" }, "2026-12-10") === "today" && dueWords({ targetDate: "2026-12-10", status: "COMPLETED" }, "2026-12-12") === "");
  const lb = logBody({ type: "ACCESS", requester: "a", requesterEmail: "b", receivedOn: "2026-11-20", firmId: " ", personId: "" }), lp = logBody({ type: "DELETION", requester: "a", requesterEmail: "b", receivedOn: "2026-11-20", firmId: "f", personId: "p" });
  ok("PF-21rs B1 P pass/fail: the log body sends the firm and person together or not at all; steps read in words (Logged, A → B, the daily check's alert)",
    !("firmId" in lb) && !("subject" in lb) && lp.firmId === "f" && JSON.stringify(lp.subject) === JSON.stringify({ kind: "PERSON", id: "p" })
      && stepWords({ kind: "RECEIVED", from: null, to: "PENDING" }) === "Logged" && stepWords({ kind: "STATUS_CHANGED", from: "PENDING", to: "IN_PROGRESS" }) === "Pending → In progress" && stepWords({ kind: "OVERDUE_ALERTED", from: null, to: null }).startsWith("Overdue"));
}

{
  ok("PF-21rs B2 P pass/fail: what a hold covers reads in words; the body holds the whole firm unless narrowed; scope field errors land on their fields",
    coversWords({ kind: "FIRM" }) === "All of the firm's data" && coversWords({ kind: "PERSON", id: "3f2a0000-0000-0000-0000-00000000c91e" }) === "Person record 3f2a…c91e" && coversWords({ kind: "CATEGORY", category: "case_notes" }) === "Case notes"
      && JSON.stringify(holdBody({ firmId: "f", kind: "FIRM", id: "x", category: "case_notes", from: "", to: "", reason: "r" }).scope) === JSON.stringify({ kind: "FIRM" })
      && JSON.stringify(holdFieldErrors({ "scope.id": "a uuid", firmId: "x", "scope.kind": "y", z: "w" })) === JSON.stringify({ id: "a uuid", firmId: "x", kind: "y", other: "w" }));
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
  sql(`with s as (insert into plat_system_staff (id, email, display_name) values (gen_random_uuid(), '${AUDITOR}', 'Auditor (Sample)') on conflict (email) do update set display_name = excluded.display_name returning id)
       insert into plat_system_role_grant (id, staff_id, role_code) select gen_random_uuid(), id, 'platform-auditor' from s where not exists (select 1 from plat_system_role_grant g where g.staff_id = s.id) returning staff_id`);
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
  const dlg = p1.getByRole("dialog", { name: "Record a breach" });
  const onRecordButton = () => p1.evaluate(() => document.activeElement?.textContent === "Record a breach");
  const closedFocus: boolean[] = [];
  await p1.getByRole("button", { name: "Record a breach" }).click(); await dlg.waitFor(); await p1.keyboard.press("Escape");
  await dlg.waitFor({ state: "hidden" }); await p1.waitForTimeout(200); closedFocus.push(await onRecordButton());
  await p1.getByRole("button", { name: "Record a breach" }).click(); await dlg.waitFor(); await dlg.getByRole("button", { name: "Cancel" }).click();
  await dlg.waitFor({ state: "hidden" }); await p1.waitForTimeout(200); closedFocus.push(await onRecordButton());
  await p1.getByRole("button", { name: "Record a breach" }).click();
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
  // A2: after the record the new breach's own page opens with its next step (board §2).
  const done = await seen(p1, "[data-done]", 15_000);
  const opened = new URL(p1.url()).pathname, doneWords = await p1.locator("[data-done]").innerText().catch(() => "");
  ok("PF-21rs A1-2 fail (break B1, WCAG 2.4.3): closing the dialog by Escape or Cancel puts the focus back on \"Record a breach\", never on the page",
    closedFocus.length === 2 && closedFocus.every(Boolean), closedFocus);
  const stored = sql(`select status || '|' || array_to_string(affected_firms, ',') || '|' || array_to_string(data_categories, ',') || '|' || containment || '|' || opened_by || '|' || floor(extract(epoch from discovered_at)) from plat_breach where description = '${desc.replace(/'/g, "''")}'`).split("|");
  const many = sql(`select count(*) from plat_breach where description = '${desc.replace(/'/g, "''")}'`);
  ok("PF-21rs A1-2 pass (BR-1): the breach is stored as written: RECORDED, firm A, the two categories, the containment, opened by our staff member, discovered now (the box's own minute)",
    done && stored[0] === "RECORDED" && stored[1] === A && stored[2] === "identity_documents,contact_details" && stored[3] === "Sample: the address was asked to delete it." && stored[4] === `staff:${ownerId}`
      && Math.abs(Number(stored[5]) * 1000 - t0) < 120_000, { done, stored });
  ok("PF-21rs A1-2 pass (STANDARDS §4): a double click on \"Record the breach\" records it once (one Idempotency-Key per opening)", many === "1", many);
  const line = sql(`select count(*) from plat_system_audit where route = '/api/system/register/breaches' and outcome::text = 'ALLOWED' and staff_id = '${ownerId}' and reason = 'Sample: recording the incident (PF-21rs A1 ${run})'`);
  ok("PF-21rs A1-2 pass (BR-7): the guard's audit line carries the person's own reason", line === "1", line);
  const newId = sql(`select id from plat_breach where description = '${desc.replace(/'/g, "''")}'`);
  ok("PF-21rs A2 pass (board §2): after the record the breach's own page opens: \"Recorded. Next: decide whether firms are told.\", status Decision owed",
    opened === `/system/privacy/breaches/${newId}` && doneWords === "Recorded. Next: decide whether firms are told." && (await p1.locator("[data-breach-status]").innerText()).includes("Decision owed"), { opened, doneWords });
  await p1.getByRole("link", { name: "Breaches" }).first().click(); await heading(p1).waitFor({ timeout: 15_000 });
  const freshRow = p1.locator(`[data-breach-row="${newId}"]`);
  await freshRow.waitFor({ timeout: 10_000 }).catch(() => undefined);
  // Discovered "now" (the box's minute): first unless an earlier run recorded one in the same minute, so the API's order decides.
  const orderNow = await p1.locator("[data-breach-row]").evaluateAll((els) => els.map((e) => e.getAttribute("data-breach-row")));
  const apiNow = (await api(tOwner, BREACHES)).body.breaches.map((b: { id: string }) => b.id);
  ok("PF-21rs A1-2 pass: the list shows it in the API's place (newest discovered first) with firm A, \"Decision owed\" and the next step in words",
    JSON.stringify(orderNow) === JSON.stringify(apiNow) && apiNow.indexOf(newId) >= 0 && (await freshRow.innerText().catch(() => "")).includes("Decision owed") && (await freshRow.innerText().catch(() => "")).includes(nameA), { at: apiNow.indexOf(newId), newId });
  await p1.screenshot({ path: join(SHOTS, "a1-03-recorded-1440.png"), fullPage: true });

  // A lost answer (review m1, break m1): the server records it, the page sees a 502; the person edits and tries again.
  const ldesc = `Sample: a lost answer (PF-21rs A1 ${run}).`;
  let lost = 0;
  await p1.route("**/api/system/register/breaches", async (r) => { if (r.request().method() !== "POST" || lost++) return r.continue(); await r.fetch(); await r.fulfill({ status: 502, body: "Bad gateway" }); });
  await p1.getByRole("button", { name: "Record a breach" }).click(); await dlg.waitFor();
  await dlg.getByLabel("What happened").fill(ldesc); await dlg.getByLabel("Reason for the audit line").fill("Sample: lost answer");
  await dlg.getByRole("button", { name: "Record the breach" }).click();
  await dlg.locator("[data-record-error]").waitFor({ timeout: 10_000 }).catch(() => undefined);
  await dlg.getByLabel("What happened").fill(`${ldesc} Edited.`); await dlg.getByRole("button", { name: "Record the breach" }).click();
  await p1.waitForTimeout(1500);
  const said = await dlg.locator("[data-record-error]").innerText().catch(() => "");
  await dlg.getByRole("button", { name: "Cancel" }).click(); await p1.unroute("**/api/system/register/breaches");
  const lostId = sql(`select id from plat_breach where description = '${ldesc.replace(/'/g, "''")}'`);
  await p1.locator(`[data-breach-row="${lostId}"]`).waitFor({ timeout: 10_000 }).catch(() => undefined);
  ok("PF-21rs A1-2 fail (review m1): an answer lost after the server recorded it, then an edited retry → plain words that it may be recorded already, the breach listed, nothing recorded twice",
    said === COPY.maybeRecorded && sql(`select count(*) from plat_breach where description like 'Sample: a lost answer (PF-21rs A1 ${run})%'`) === "1" && (await p1.locator(`[data-breach-row="${lostId}"]`).count()) === 1, { said, lostId });

  // ---------------------------------------------------------------------------------------- A2: one breach (row W4; j_86 W6)
  // Three Sample firms of this run, each with an active Owner (firm X also an Admin): X and Y named, Z never.
  const firm = (label: string) => {
    const key = `pf21rs-${label}-${run}`, name = `Sample Notice Firm ${label} ${run}`;
    const fid = sql(`insert into platform_firm (id, key, operating_name, country_code, contact_email, status, updated_at) values (gen_random_uuid(), '${key}', '${name}', 'CA', 'contact.${key}@example.com', 'ACTIVE', now()) returning id`);
    for (const [who, role] of label === "x" ? [["owner", "OWNER"], ["admin", "ADMIN"]] : [["owner", "OWNER"]]) {
      const sid = sql(`insert into platform_staff (id, firm_id, email, display_name, status, updated_at) values (gen_random_uuid(), '${fid}', '${who}.${key}@example.com', 'Sample ${who}', 'ACTIVE', now()) returning id`);
      sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${fid}', '${sid}', '${role}', 'seed:PF-21rs')`);
    }
    return { id: fid, name };
  };
  const X = firm("x"), Y = firm("y"), Z = firm("z");
  const w4 = await api(tOwner, BREACHES, "POST", { reason: "Sample: W4 seed", discoveredAt: ago(2), description: `Sample: a shared link exposed two firms' files (PF-21rs W4 ${run}).`, affectedFirms: [X.id, Y.id], dataCategories: ["identity_documents"] }, { "idempotency-key": `pf21rs-w4-${run}` });
  const bp = `/system/privacy/breaches/${w4.body?.id}`;
  await p1.goto(`${BASE}${bp}`); await p1.locator("[data-breach-status]").waitFor({ timeout: 15_000 });
  const sendX = p1.getByRole("button", { name: `Send notice to ${X.name}` }), sendY = p1.getByRole("button", { name: `Send notice to ${Y.name}` });
  ok("PF-21rs A2 fail (BR-2): undecided, the page names \"Decide\" as the next step and offers no send (\"Record the decision first\")",
    (await p1.locator("[data-next-step]").innerText()) === "Next: decide whether the affected firms are told." && (await sendX.count()) === 0 && (await p1.getByText("Not sent: Record the decision first.").count()) === 2);
  await p1.getByRole("button", { name: "Decide" }).click();
  const dd = p1.getByRole("dialog", { name: "Decide whether firms are told" }); await dd.waitFor();
  await dd.getByRole("button", { name: "Record the decision" }).click();
  await dd.locator("[role=alert]").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  const ddErr = await dd.locator("[role=alert]").allInnerTexts().catch(() => []);
  await dd.getByRole("radio", { name: "Notify the affected firms" }).check(); await dd.getByLabel("Why").fill("Sample: identity documents may have been seen.");
  await dd.getByLabel("Reason for the audit line").fill("Sample: deciding (PF-21rs W4)"); await dd.getByRole("button", { name: "Record the decision" }).click();
  await sendX.waitFor({ timeout: 15_000 }).catch(() => undefined);
  ok("PF-21rs A2 fail/pass (BR-7): Decide with nothing chosen → the API's refusals in the dialog, nothing stored; then Notify firms with why → stored with who, and a send offered per firm",
    ddErr.length > 0 && sql(`select decision || '|' || decision_reason || '|' || decided_by from plat_breach where id = '${w4.body?.id}'`) === `NOTIFY_FIRMS|Sample: identity documents may have been seen.|staff:${ownerId}` && (await sendX.count()) === 1 && (await sendY.count()) === 1, ddErr);
  const sendOne = async (btn: typeof sendX, why: string) => { await btn.click(); const sd = p1.getByRole("dialog", { name: /^Send the notice to/ }); await sd.waitFor(); await sd.getByLabel("Reason for the audit line").fill(why); await sd.getByRole("button", { name: "Send the notice" }).click(); await sd.waitFor({ state: "hidden", timeout: 20_000 }); };
  await sendOne(sendX, "Sample: notifying X (PF-21rs W4)");
  const rowX = p1.locator(`[data-notice-row="${X.id}"]`); await rowX.locator("time").waitFor({ timeout: 15_000 }).catch(() => undefined);
  const apiOne = (await api(tOwner, `${BREACHES}/${w4.body?.id}`)).body, nX = apiOne.notices?.find((n: { firmId: string }) => n.firmId === X.id);
  const dbX = sql(`select to_char(sent_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') from plat_breach_notice where breach_id = '${w4.body?.id}' and firm_id = '${X.id}'`);
  await rowX.getByText("Words sent").click();
  const xTime = await rowX.locator("time").getAttribute("datetime").catch(() => null), xSubject = await rowX.locator("[data-notice-subject]").innerText().catch(() => ""), xWords = await rowX.locator("[data-notice-words]").innerText().catch(() => "");
  ok("PF-21rs A2 pass (row W4, j_86 W6, QA-757): firm X's row shows its sent time (<time datetime> = plat_breach_notice), 2 people, the subject and the words exactly as sent; no send left for X",
    !!nX && xTime === dbX && xTime === nX.sentAt && xSubject === nX.subject && !!nX.text && xWords === nX.text && xWords.includes(X.name) && (await rowX.innerText()).includes("2 people") && (await sendX.count()) === 0 && (await sendY.count()) === 1, { xTime, dbX, xSubject });
  const again = await api(tOwner, `${BREACHES}/${w4.body?.id}/notices`, "POST", { reason: "Sample: a second send", firmId: X.id });
  await p1.reload(); await p1.locator("[data-breach-status]").waitFor({ timeout: 15_000 });
  ok("PF-21rs A2 fail (BR-3): a second send to firm X by the API → 409 ALREADY_NOTIFIED; the page still shows one notice to X and no send button for it",
    again.status === 409 && again.body?.code === "ALREADY_NOTIFIED" && sql(`select count(*) from plat_breach_notice where breach_id = '${w4.body?.id}' and firm_id = '${X.id}'`) === "1" && (await sendX.count()) === 0, again.status);
  await sendOne(sendY, "Sample: notifying Y (PF-21rs W4)");
  await p1.locator(`[data-notice-row="${Y.id}"] time`).waitFor({ timeout: 15_000 }).catch(() => undefined);
  const page4 = (await p1.locator("main").innerText()).replace(/\s+/g, " ");
  ok("PF-21rs A2 pass (row W4): both firms notified, one notice each; firm Z never listed; no send button left; the status Recorded and the decision fixed",
    sql(`select count(*) from plat_breach_notice where breach_id = '${w4.body?.id}'`) === "2" && !page4.includes(Z.name) && (await p1.getByRole("button", { name: /^Send notice to/ }).count()) === 0
      && (await p1.locator("[data-breach-status]").innerText()).includes("Recorded") && page4.includes(COPY.decisionFixed) && (await p1.getByRole("button", { name: /decision|Decide/ }).count()) === 0, page4.slice(0, 160));
  const hist = await p1.getByRole("list", { name: "History" }).innerText();
  ok("PF-21rs A2 pass: History lists Recorded, the decision (Not decided → Notify firms) and each notice by firm, each by our staff member's name",
    /Recorded/.test(hist) && hist.includes("Decision: Not decided → Notify firms") && hist.includes(`Notice sent to ${X.name}`) && hist.includes(`Notice sent to ${Y.name}`) && hist.includes("Platform Owner (Sample)"), hist.slice(0, 300));
  await p1.screenshot({ path: join(SHOTS, "a2-01-breach-notices-1440.png"), fullPage: true });
  // Break M1: a stale page never overwrites: the breach changes by the API while the dialog is open; Save stores nothing.
  await p1.getByRole("button", { name: "Edit the record" }).click();
  const st = p1.getByRole("dialog", { name: "Edit the record" }); await st.waitFor();
  const other = await api(tOwner, `${BREACHES}/${w4.body?.id}`, "PATCH", { reason: "Sample: another tab", rootCause: "Sample: changed in another tab" });
  await st.getByLabel("Root cause").fill("Sample: this tab's stale words"); await st.getByLabel("Reason for the audit line").fill("Sample: stale");
  await st.getByRole("button", { name: "Save the changes" }).click();
  await st.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
  const staleSaid = await p1.locator("[data-done]").innerText({ timeout: 10_000 }).catch(() => "");
  const closed = !(await st.isVisible());
  // Round 2 (M1): the stale form is gone, so it cannot be saved again; Edit opens on the latest words.
  await p1.getByRole("button", { name: "Edit the record" }).click(); await st.waitFor();
  const fresh = await st.getByLabel("Root cause").inputValue();
  await st.getByRole("button", { name: "Cancel" }).click(); await st.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
  ok("PF-21rs A2 fail (break M1, round 2): a breach changed elsewhere while Edit is open → nothing saved, Edit closes and the page says so; Edit opens again on the latest words",
    other.status === 200 && closed && staleSaid === COPY.stale && fresh === "Sample: changed in another tab" && sql(`select root_cause from plat_breach where id = '${w4.body?.id}'`) === "Sample: changed in another tab", { status: other.status, closed, staleSaid, fresh });
  // Break B1 on #3818: a decision a colleague changed after this page loaded is what "Change the decision" opens on.
  const nn = await api(tOwner, BREACHES, "POST", { reason: "Sample: decide-stale seed", discoveredAt: ago(2), description: `Sample: a report went to the wrong team (PF-21rs decide ${run}).` }, { "idempotency-key": `pf21rs-ds-${run}` });
  await api(tOwner, `${BREACHES}/${nn.body?.id}`, "PATCH", { reason: "Sample: first decision", decision: "NO_NOTICE", decisionReason: "Sample: nothing left our systems." });
  await p1.goto(`${BASE}/system/privacy/breaches/${nn.body?.id}`); await p1.locator("[data-breach-status]").waitFor({ timeout: 15_000 });
  await api(tOwner, `${BREACHES}/${nn.body?.id}`, "PATCH", { reason: "Sample: a colleague's decision", decision: "NOTIFY_FIRMS", decisionReason: "Sample: contact details may have been read." });
  await p1.getByRole("button", { name: "Change the decision" }).click();
  const cdlg = p1.getByRole("dialog").filter({ has: p1.locator("[data-decision]") }); await cdlg.waitFor();
  const opensOn = await cdlg.locator("[data-decision]:checked").getAttribute("data-decision").catch(() => null);
  await cdlg.getByLabel("Reason for the audit line").fill("Sample: re-saving"); await cdlg.locator("[data-decision=NO_NOTICE]").check(); await cdlg.getByLabel("Why").fill("Sample: this tab's view");
  // the colleague changes it again while this dialog is open: nothing is saved over it
  await api(tOwner, `${BREACHES}/${nn.body?.id}`, "PATCH", { reason: "Sample: colleague again", rootCause: "Sample: changed while the dialog was open" });
  await cdlg.locator("button[type=submit]").click(); await cdlg.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
  ok("PF-21rs A2 fail (break B1 on #3818): \"Change the decision\" opens on a colleague's newer decision, and a save after a further change elsewhere stores nothing (stale said)",
    opensOn === "NOTIFY_FIRMS" && sql(`select decision from plat_breach where id = '${nn.body?.id}'`) === "NOTIFY_FIRMS" && (await p1.locator("[data-done]").innerText().catch(() => "")) === COPY.stale, { opensOn, stored: sql(`select decision from plat_breach where id = '${nn.body?.id}'`) });
  await p1.goto(`${BASE}/system/privacy/breaches/${w4.body?.id}`); await p1.locator("[data-breach-status]").waitFor({ timeout: 15_000 });   // back to row W4's breach
  // Edit the record: a change of containment is stored and listed; a notified firm cannot be removed.
  await p1.getByRole("button", { name: "Edit the record" }).click();
  const ed = p1.getByRole("dialog", { name: "Edit the record" }); await ed.waitFor();
  const noRemove = (await ed.getByRole("button", { name: `Remove ${X.name}` }).count()) === 0;
  await ed.getByLabel("Containment").fill("Sample: the link was revoked."); await ed.getByLabel("Reason for the audit line").fill("Sample: containment known");
  await ed.getByRole("button", { name: "Save the changes" }).click(); await ed.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => undefined);
  await p1.getByText("Sample: the link was revoked.").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  ok("PF-21rs A2 pass (BR-3): Edit the record stores only the change (containment) and History says so; a notified firm offers no Remove",
    noRemove && sql(`select containment from plat_breach where id = '${w4.body?.id}'`) === "Sample: the link was revoked." && (await p1.getByRole("list", { name: "History" }).innerText()).includes("Changed: containment"), { noRemove });
  // A draft from an alert: Confirm the record, with the description firms will read.
  const draft = await api(tOwner, `${BREACHES}/from-alert`, "POST", { reason: "Sample: draft", alert: { kind: "audit_chain_break", detail: { rule: "BR-5" }, raisedAt: ago(1) } }, { "idempotency-key": `pf21rs-d-${run}` });
  await p1.goto(`${BASE}/system/privacy/breaches/${draft.body?.id}`); await p1.locator("[data-breach-status]").waitFor({ timeout: 15_000 });
  const draftNoSend = (await p1.getByRole("button", { name: "Decide" }).count()) === 0 && (await p1.locator("[data-breach-status]").innerText()).includes("Draft");
  await p1.getByRole("button", { name: "Confirm the record" }).click();
  const cd = p1.getByRole("dialog", { name: "Confirm the record" }); await cd.waitFor();
  const alertWords = await cd.locator("[data-draft-words]").innerText();
  const boxStart = await cd.getByLabel("What happened").inputValue();
  await cd.getByLabel("What happened").fill(alertWords); await cd.getByLabel("Reason for the audit line").fill("Sample: confirming");
  await cd.getByRole("button", { name: "Confirm the record" }).click();
  const sameErr = await cd.locator("[data-field=description] ~ [role=alert]").innerText({ timeout: 5000 }).catch(() => "");
  ok("PF-21rs A2 fail (break M2): Confirm starts with an empty description, shows the alert's words apart, and refuses them as the firms' words; still a draft",
    boxStart === "" && alertWords.startsWith("Draft from an alert") && sameErr === COPY.draftSame && sql(`select status from plat_breach where id = '${draft.body?.id}'`) === "DRAFT", { boxStart, sameErr });
  await cd.getByLabel("What happened").fill(`Sample: the activity log did not verify (PF-21rs draft ${run}).`); await cd.getByLabel("Reason for the audit line").fill("Sample: confirming");
  await cd.getByRole("button", { name: "Confirm the record" }).click(); await cd.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => undefined);
  await p1.getByText("Decision owed").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  ok("PF-21rs A2 pass/fail: a draft from an alert offers no Decide; Confirm the record with the firms' description makes it RECORDED, Decision owed",
    draft.status === 201 && draftNoSend && sql(`select status from plat_breach where id = '${draft.body?.id}'`) === "RECORDED" && (await p1.locator("[data-breach-status]").innerText()).includes("Decision owed"), { draftNoSend });
  // The walls on the breach page: the Auditor reads with no change button; Support reads the API's words.
  const pa2 = await signedIn(await ourToken(AUDITOR)); await pa2.goto(`${BASE}${bp}`); await pa2.locator("[data-breach-status]").waitFor({ timeout: 15_000 }).catch(() => undefined);
  ok("PF-21rs A2 W5 (c): the Auditor reads the breach, its notices and words, with no Edit, Decide or Send",
    (await pa2.locator("[data-notice-subject]").count()) === 2 && (await pa2.getByRole("button", { name: /Edit the record|Decide|Send notice/ }).count()) === 0 && (await pa2.locator("[data-read-only]").count()) === 1);
  await pa2.context().close();
  const ps2 = await signedIn(await ourToken(SUPPORT)); await ps2.goto(`${BASE}${bp}`);
  const noKey2 = await ps2.locator("[data-breach-error]").innerText({ timeout: 15_000 }).catch(() => "");
  ok("PF-21rs A2 W5 (c, BR-8): Support on the breach page reads the API's 403 words, no breach data", /system\/breach:read|Platform Owner and Auditor/i.test(noKey2) && !(await ps2.locator("body").innerText()).includes(X.name), noKey2);
  await ps2.context().close();
  const a2widths: Record<number, { axe: string[]; sideways: boolean }> = {};
  for (const w of [1440, 1024, 400]) { await p1.setViewportSize({ width: w, height: 900 }); await p1.goto(`${BASE}${bp}`); await p1.locator("[data-breach-status]").waitFor({ timeout: 15_000 }).catch(() => undefined);
    for (const sm of await p1.locator("details summary").all()) await sm.click();   // break M3: the words open, as a person reads them
    a2widths[w] = { axe: await serious(p1), sideways: await p1.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth > 1) }; }
  await p1.setViewportSize({ width: 1440, height: 900 });
  ok("PF-21rs A2 W6 (break M3): the breach page at 1440, 1024 and 400 px with every \"Words sent\" open: axe-core 0 serious, no sideways page scroll", Object.values(a2widths).every((x) => !x.axe.length && !x.sideways), a2widths);

  // ---------------------------------------------------------------------------------------- B1 requests to us (row W1, W2)
  const REQUESTS = "/system/register/requests", reqHeading = (p: Page) => p.getByRole("heading", { level: 1, name: REQUEST_COPY.title });
  const tday = sql(`select to_char((now() at time zone 'America/Toronto')::date, 'YYYY-MM-DD')`), minus = (n: number) => sql(`select to_char('${tday}'::date - ${n}, 'YYYY-MM-DD')`);
  await p1.goto(`${BASE}/system/privacy/requests`);
  const reqIn = await reqHeading(p1).waitFor({ timeout: 15_000 }).then(() => true, () => false);
  ok("PF-21rs B1 W1 pass (j_85 W1): the Privacy group links \"Requests to us\"; the page is headed \"Data requests to us\" with \"Log a request\"",
    reqIn && (await p1.getByRole("navigation", { name: "Console" }).getByRole("group", { name: "Privacy" }).getByRole("link", { name: "Requests to us" }).count()) === 1 && (await p1.getByRole("button", { name: "Log a request" }).count()) === 1);
  const reqCount = () => sql(`select count(*) from plat_data_request`), r0 = reqCount();
  await p1.getByRole("button", { name: "Log a request" }).click();
  const ld = p1.getByRole("dialog", { name: REQUEST_COPY.logTitle }); await ld.waitFor();
  await ld.getByLabel("Requester's email").fill("not an email"); await ld.getByRole("button", { name: "Log the request" }).click();
  await ld.locator("[role=alert]").first().waitFor({ timeout: 5000 }).catch(() => undefined);
  const invalid = await ld.locator("[aria-invalid=true]").evaluateAll((xs) => xs.map((x) => x.getAttribute("data-field")));
  ok("PF-21rs B1 W1 fail: no name and a bad email → each refusal under its field (the API's words), nothing stored",
    invalid.includes("requester") && invalid.includes("requesterEmail") && (await ld.locator("[role=alert]").count()) >= 2 && reqCount() === r0, invalid);
  // Review M1: the firm is picked from our firm list; a person id that is not one is said in plain words, nothing sent.
  await ld.getByLabel("Requester's name").fill(`Typo ${run}`); await ld.getByLabel("Requester's email").fill(`typo.${run}@example.com`);
  await ld.locator("[data-firm-search]").fill(nameA); await ld.locator(`[data-add-firm="${A}"]`).click({ timeout: 10_000 });
  const picked = (await ld.locator(`[data-chosen-firm="${A}"]`).innerText().catch(() => "")).includes(nameA);
  await ld.getByLabel("Person record id").fill(nameA); await ld.getByRole("button", { name: "Log the request" }).click();
  const idWords = await ld.getByText(REQUEST_COPY.personIdWords).count();
  ok("PF-21rs B1 W1 fail (review M1): the firm is picked by name, never typed; a person id that is not one is refused in plain words, nothing stored",
    picked && idWords === 1 && (await ld.getByLabel("Firm id").count()) === 0 && reqCount() === r0, { picked, idWords });
  await ld.getByRole("button", { name: /^Change the firm/ }).click(); await ld.getByLabel("Person record id").fill("");
  const who = `Requester ${run} Sample`;
  await ld.getByLabel("Type").selectOption("ACCESS"); await ld.getByLabel("Requester's name").fill(who); await ld.getByLabel("Requester's email").fill(`req.${run}@example.com`);
  await ld.getByLabel("Received on").fill(minus(2));
  await ld.getByRole("button", { name: "Log the request" }).click();
  await p1.locator("[data-request-status]").waitFor({ timeout: 15_000 }).catch(() => undefined);
  const reqId = sql(`select id from plat_data_request where requester_name = '${who}'`);
  const target = await p1.locator("[data-target-date]").getAttribute("datetime").catch(() => null);
  ok("PF-21rs B1 W1 pass: logged → the request's page, Pending, its target date received + 30 days (on the page and stored)",
    !!reqId && target === sql(`select to_char('${minus(2)}'::date + 30, 'YYYY-MM-DD')`) && sql(`select status || '|' || target_date from plat_data_request where id = '${reqId}'`) === `PENDING|${target}`
      && (await p1.locator("[data-done]").innerText().catch(() => "")) === REQUEST_COPY.logged, { reqId, target });
  await p1.getByRole("button", { name: "Start work" }).click();
  const mv = p1.getByRole("dialog", { name: "Start work?" }); await mv.waitFor(); await mv.getByRole("button", { name: "Start work" }).click(); await mv.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
  await p1.locator('[data-request-status="IN_PROGRESS"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
  await p1.waitForTimeout(300);
  const focusAfter = await p1.evaluate(() => (document.activeElement?.hasAttribute("data-done") ? document.activeElement.textContent : document.activeElement?.tagName) ?? "");
  ok("PF-21rs B1 W6 pass (review M2, WCAG 2.4.3): after a move the focus is on the \"Moved to …\" line, never lost to the page", focusAfter === "Moved to In progress.", focusAfter);
  await p1.getByRole("button", { name: "Mark completed" }).click();
  const cm = p1.getByRole("dialog", { name: "Mark completed?" }); await cm.waitFor(); await cm.getByRole("button", { name: "Mark completed" }).click();
  const actErr = await cm.locator("[data-field=actionsTaken][aria-invalid=true]").waitFor({ timeout: 5000 }).then(() => true, () => false);
  ok("PF-21rs B1 W1 fail: Mark completed without \"What was done\" → the API's field error under it; still In progress", actErr && (await cm.locator("[role=alert]").count()) === 1 && sql(`select status from plat_data_request where id = '${reqId}'`) === "IN_PROGRESS");
  await cm.getByLabel("What was done").fill("Sample: sent the requester a copy of their account data."); await cm.getByRole("button", { name: "Mark completed" }).click();
  await cm.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
  await p1.locator('[data-request-status="COMPLETED"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
  const steps1 = await p1.getByRole("list", { name: "Steps" }).innerText().catch(() => "");
  ok("PF-21rs B1 W1 pass (j_85 W2): In progress, then Completed; each step listed by our staff member's name; no move left",
    sql(`select status from plat_data_request where id = '${reqId}'`) === "COMPLETED" && /Logged/.test(steps1) && steps1.includes("Pending → In progress") && steps1.includes("In progress → Completed") && steps1.includes("Platform Owner (Sample)")
      && (await p1.locator("[data-actions-taken]").innerText()).includes("copy of their account data") && (await p1.getByRole("button", { name: /Start work|Mark completed|Put on hold/ }).count()) === 0, steps1.slice(0, 300));
  await p1.screenshot({ path: join(SHOTS, "b1-01-request-completed-1440.png"), fullPage: true });
  // W2: a request received 40 days ago is Overdue at once (the check runs on logging), with one alert step; Overdue is never a button.
  const late = await api(tOwner, REQUESTS, "POST", { type: "DELETION", requester: `Late ${run} Sample`, requesterEmail: `late.${run}@example.com`, receivedOn: minus(40) });
  await p1.goto(`${BASE}/system/privacy/requests/${late.body?.id}`); await p1.locator("[data-request-status]").waitFor({ timeout: 15_000 }).catch(() => undefined);
  const lateSteps = await p1.locator('[data-step="OVERDUE_ALERTED"]').count();
  ok("PF-21rs B1 W2 pass (j_85 W3): a request received 40 days ago shows Overdue, \"10 days late\", with one alert step underneath",
    late.status === 201 && (await p1.locator('[data-request-status="OVERDUE"]').innerText().catch(() => "")).includes("10 days late") && lateSteps === 1, { status: late.status, lateSteps });
  ok("PF-21rs B1 W2 fail (BR-5): no \"Overdue\" move is offered, and the API refuses one by hand (422)",
    (await p1.locator("[data-request-moves]").getByRole("button", { name: /overdue/i }).count()) === 0 && (await api(tOwner, `${REQUESTS}/${reqId}/status`, "POST", { status: "OVERDUE" })).status === 422);
  // Break M1 on #3818: a request moved elsewhere since this page loaded is never moved over: nothing sent, the page reloads.
  await p1.getByRole("button", { name: "Mark completed" }).click();
  const sm = p1.getByRole("dialog", { name: "Mark completed?" }); await sm.waitFor();
  const heldElsewhere = await api(tOwner, `${REQUESTS}/${late.body?.id}/status`, "POST", { status: "HELD", note: "Sample: a colleague's hold" });
  await sm.getByLabel("What was done").fill("Sample: stale tab"); await sm.getByRole("button", { name: "Mark completed" }).click();
  await sm.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
  await p1.locator('[data-request-status="HELD"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
  ok("PF-21rs B1 fail (break M1 on #3818): a request a colleague marked held meanwhile is not completed from the stale page; the page says so and shows Held with \"Resume work\"",
    heldElsewhere.status === 200 && sql(`select status from plat_data_request where id = '${late.body?.id}'`) === "HELD" && (await p1.locator("[data-done]").innerText().catch(() => "")).includes(REQUEST_COPY.stale)
      && (await p1.getByRole("button", { name: "Resume work" }).count()) === 1, { stored: sql(`select status from plat_data_request where id = '${late.body?.id}'`) });
  await p1.goto(`${BASE}/system/privacy/requests`); await p1.locator(`[data-request-row="${late.body?.id}"]`).waitFor({ timeout: 10_000 }).catch(() => undefined);
  await p1.locator('[data-status-chip="OVERDUE"]').click(); await p1.waitForTimeout(500);
  const overdueRows = await p1.locator("[data-request-row]").evaluateAll((rs) => rs.map((r) => r.getAttribute("data-status")));
  ok("PF-21rs B1 W2 pass: the Overdue chip lists only Overdue requests (the late one, since marked held, no longer among them)", overdueRows.every((x) => x === "OVERDUE") && (await p1.locator(`[data-request-row="${late.body?.id}"]`).count()) === 0, overdueRows);
  // W5 on these pages: a firm's token is refused on every route and nothing is written; the Auditor (no request key) reads the API's 403 words.
  const firmEmailB = sql(`select email from platform_staff where actor_id = 'user-R'`);
  const tFirmB = (await api(null, "/platform/session/local", "POST", { firmKey: "sample-firm", email: firmEmailB, secondStep: true })).body?.token as string;
  const r1 = reqCount();
  const reqTries = [await api(tFirmB, REQUESTS), await api(tFirmB, `${REQUESTS}/${reqId}`), await api(tFirmB, REQUESTS, "POST", { type: "ACCESS", requester: "x", requesterEmail: "x@example.com", receivedOn: tday }), await api(tFirmB, `${REQUESTS}/${late.body?.id}/status`, "POST", { status: "IN_PROGRESS" })];
  ok("PF-21rs B1 W5 fail (a): a firm Owner's token → 403 on the request list, one request, log and move; nothing written", reqTries.every((r) => r.status === 403) && reqCount() === r1 && sql(`select status from plat_data_request where id = '${late.body?.id}'`) === "HELD", reqTries.map((r) => r.status));
  const pr = await signedIn(await ourToken(AUDITOR)); await pr.goto(`${BASE}/system/privacy/requests`);
  const audWords = await pr.locator("[data-requests-error]").innerText({ timeout: 15_000 }).catch(() => "");
  ok("PF-21rs B1 W5 fail (c, BR-8): our Auditor on Requests reads the API's 403 words: no table, no \"Log a request\", no Requests link",
    audWords.length > 0 && (await pr.getByRole("table").count()) === 0 && (await pr.getByRole("button", { name: "Log a request" }).count()) === 0 && (await pr.getByRole("link", { name: "Requests to us" }).count()) === 0, audWords);
  await pr.context().close();
  // W6: keyboard opens Log a request on its first field; axe-core 0 serious and no sideways scroll on both pages at 1440, 1024 and 400 px.
  await p1.goto(`${BASE}/system/privacy/requests`); await reqHeading(p1).waitFor({ timeout: 15_000 });
  await p1.getByRole("button", { name: "Log a request" }).focus(); await p1.keyboard.press("Enter"); await ld.waitFor();
  const reqFirst = await p1.evaluate(() => document.activeElement?.getAttribute("data-field") ?? document.activeElement?.tagName ?? "");
  const axeLog = await serious(p1); await p1.keyboard.press("Escape"); await ld.waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
  const rw: Record<string, { axe: string[]; sideways: boolean }> = {};
  for (const [name, path] of [["list", "/system/privacy/requests"], ["one", `/system/privacy/requests/${reqId}`]] as const) for (const w of [1440, 1024, 400]) {
    await p1.setViewportSize({ width: w, height: 900 }); await p1.goto(`${BASE}${path}`); await p1.locator("[data-request-row], [data-request-status]").first().waitFor({ timeout: 15_000 }).catch(() => undefined);
    rw[`${name}-${w}`] = { axe: await serious(p1), sideways: await p1.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth > 1) };
    if (w === 400) await p1.screenshot({ path: join(SHOTS, `b1-02-request-${name}-400.png`), fullPage: true });
  }
  await p1.setViewportSize({ width: 1440, height: 900 });
  ok("PF-21rs B1 W6 pass: Enter on \"Log a request\" opens it on its first field; both pages at 1440, 1024 and 400 px (the dialog open too): axe-core 0 serious, no sideways page scroll",
    reqFirst === "type" && !axeLog.length && Object.values(rw).every((x) => !x.axe.length && !x.sideways), { reqFirst, axeLog, rw });

  // ---------------------------------------------------------------------------------------- B2 legal holds (row W3)
  const HOLDS = "/system/register/holds", holdsHeading = (p: Page) => p.getByRole("heading", { level: 1, name: HOLD_COPY.title });
  sql(`insert into fo_sales_setup (firm_id) values ('${A}') on conflict do nothing`);
  const heldPerson = sql(`insert into fo_person (id, firm_id, given_names, family_name, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Held${run}', 'Sample', 'seed:pf21rs', now()) returning id`);
  await import("reflect-metadata");   // the keep-period service is a Nest provider
  const { KeepPeriods } = await import("../api/src/platform/keep-period/service.ts");
  const { PgLegalHolds } = await import("../api/src/platform/register/holds/adapter.ts");
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
  // The app's one delete check (AUD-5's KeepPeriods.check, which asks LegalHoldPort first; as j_85 W4).
  const verdictFor = async (person: string) => { const keep = new KeepPeriods(owner as never, new PgLegalHolds() as never); let v = "", why = "";
    await owner.$transaction(async (tx) => { const r = await keep.check(tx as never, { firmId: A, class: "client_financial" as never, startedAt: new Date("2010-01-01"), subject: { kind: "PERSON", id: person } as never, recordDates: [new Date("2010-01-01")] }) as { verdict: string; holds?: { reason: string }[] }; v = r.verdict; why = JSON.stringify(r); }); return { v, why }; };
  const free = await verdictFor(heldPerson);
  await p1.goto(`${BASE}/system/privacy/holds`);
  const holdsIn = await holdsHeading(p1).waitFor({ timeout: 15_000 }).then(() => true, () => false);
  ok("PF-21rs B2 W3 pass: the Privacy group links \"Legal holds\"; the page is headed with \"Hold a firm's data\"; before any hold the delete check does not answer HELD",
    holdsIn && (await p1.getByRole("navigation", { name: "Console" }).getByRole("group", { name: "Privacy" }).getByRole("link", { name: "Legal holds" }).count()) === 1 && (await p1.getByRole("button", { name: "Hold a firm's data" }).count()) === 1 && free.v !== "HELD", free);
  const holdCount = () => sql(`select count(*) from plat_legal_hold`), h0 = holdCount();
  await p1.getByRole("button", { name: "Hold a firm's data" }).click();
  const hd = p1.getByRole("dialog", { name: HOLD_COPY.placeTitle }); await hd.waitFor();
  await hd.getByRole("button", { name: "Place the hold" }).click();
  await hd.locator("[role=alert]").first().waitFor({ timeout: 5000 }).catch(() => undefined);
  const holdErrs = await hd.locator("[role=alert]").allInnerTexts();
  ok("PF-21rs B2 W3 fail (review M1): no firm chosen and no reason → each refusal in plain words saying what to do, nothing placed",
    holdErrs.includes(HOLD_COPY.firmNotChosen) && holdErrs.includes(HOLD_COPY.reasonNeeded) && holdCount() === h0, holdErrs);
  // Typing the firm's name without choosing it, and an id that is not one: said in plain words, nothing sent.
  await hd.locator("[data-firm-search]").fill(nameA); await hd.locator("[data-advanced]").check(); await hd.getByLabel("Covers").selectOption("PERSON");
  await hd.getByLabel("Person record id").fill(nameA); await hd.getByLabel("Reason for the hold").fill("Sample"); await hd.getByRole("button", { name: "Place the hold" }).click();
  const slipErrs = await hd.locator("[role=alert]").allInnerTexts();
  ok("PF-21rs B2 W3 fail (review M1): a firm name typed but not chosen, and a person id that is not one, each say what to do; nothing placed",
    slipErrs.includes(HOLD_COPY.firmNotChosen) && slipErrs.includes(HOLD_COPY.idWords) && holdCount() === h0, slipErrs);
  await hd.locator("[data-advanced]").uncheck(); await hd.getByLabel("Reason for the hold").fill("");
  await hd.locator("[data-firm-search]").fill(nameA); await hd.locator(`[data-add-firm="${A}"]`).click({ timeout: 10_000 });
  await hd.locator("[data-advanced]").check(); await hd.getByLabel("Covers").selectOption("PERSON"); await hd.getByLabel("Person record id").fill(heldPerson);
  await hd.getByLabel("Reason for the hold").fill(`Sample litigation (PF-21rs ${run})`); await hd.getByRole("button", { name: "Place the hold" }).click();
  await hd.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => undefined);
  const holdId = sql(`select id from plat_legal_hold where target_id = '${heldPerson}'`) || sql(`select id from plat_legal_hold where reason = 'Sample litigation (PF-21rs ${run})'`);
  await p1.locator(`[data-hold-row="${holdId}"]`).waitFor({ timeout: 10_000 }).catch(() => undefined);
  const rowText = await p1.locator(`[data-hold-row="${holdId}"]`).innerText().catch(() => "");
  const held = await verdictFor(heldPerson);
  ok("PF-21rs B2 W3 pass: a person hold placed on screen (firm by search, Advanced → one person record, a reason) is listed Active with the firm's name, what it covers and who placed it",
    !!holdId && rowText.includes(nameA) && rowText.includes(coversWords({ kind: "PERSON", id: heldPerson })) && rowText.includes("Platform Owner (Sample)") && (await p1.locator("[data-done]").innerText().catch(() => "")) === HOLD_COPY.placed, { holdId, rowText });
  ok("PF-21rs B2 W3 pass (j_85 W4): the app's delete check now answers HELD for that person, with the hold's reason (shown in our console only)", held.v === "HELD" && held.why.includes(`Sample litigation (PF-21rs ${run})`), held);
  await p1.screenshot({ path: join(SHOTS, "b2-01-holds-active-1440.png"), fullPage: true });
  await p1.locator(`[data-release="${holdId}"]`).click();
  const rd = p1.getByRole("dialog", { name: HOLD_COPY.releaseTitle }); await rd.waitFor();
  const relWords = await rd.getByText(`Sample litigation (PF-21rs ${run})`).count();   // break m3: the dialog names the matter
  await rd.getByRole("button", { name: "Release the hold" }).click();
  const relErr = await rd.locator("[role=alert]").first().innerText({ timeout: 5000 }).catch(() => "");
  ok("PF-21rs B2 W3 fail (BR-6): Release without a reason → refused under the field; the hold stays active and the check still HELD", relErr === HOLD_COPY.releaseReasonNeeded && relWords > 0 && sql(`select released_at is null from plat_legal_hold where id = '${holdId}'`) === "t" && (await verdictFor(heldPerson)).v === "HELD", relErr);
  await rd.getByLabel("Reason for the release").fill("Sample: the matter settled"); await rd.getByRole("button", { name: "Release the hold" }).click();
  await rd.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => undefined);
  await p1.locator('[data-hold-chip="released"]').click(); await p1.locator(`[data-hold-row="${holdId}"] [data-released]`).waitFor({ timeout: 10_000 }).catch(() => undefined);
  const after = await verdictFor(heldPerson);
  ok("PF-21rs B2 W3 pass: released on screen with its reason → listed under Released with who and why; the same delete check proceeds (no longer HELD)",
    sql(`select released_at is null from plat_legal_hold where id = '${holdId}'`) === "f" && (await p1.locator(`[data-hold-row="${holdId}"]`).innerText().catch(() => "")).includes("the matter settled") && after.v !== "HELD", after);
  await owner.$disconnect();
  // W5 on this page: a firm's token is refused on every route and nothing is written; the Auditor (no hold key) reads the API's 403 words.
  const firmEmailH = sql(`select email from platform_staff where actor_id = 'user-R'`);
  const tFirmH = (await api(null, "/platform/session/local", "POST", { firmKey: "sample-firm", email: firmEmailH, secondStep: true })).body?.token as string;
  const h1 = holdCount();
  const holdTries = [await api(tFirmH, HOLDS), await api(tFirmH, HOLDS, "POST", { firmId: A, scope: { kind: "FIRM" }, reason: "x" }), await api(tFirmH, `${HOLDS}/${holdId}/release`, "POST", { reason: "x" })];
  ok("PF-21rs B2 W5 fail (a): a firm Owner's token → 403 on the hold list, place and release; nothing written", holdTries.every((r) => r.status === 403) && holdCount() === h1, holdTries.map((r) => r.status));
  const ph = await signedIn(await ourToken(AUDITOR)); await ph.goto(`${BASE}/system/privacy/holds`);
  const audHold = await ph.locator("[data-holds-error]").innerText({ timeout: 15_000 }).catch(() => "");
  ok("PF-21rs B2 W5 fail (c, BR-8): our Auditor on Legal holds reads the API's 403 words: no table, no \"Hold a firm's data\", no Legal holds link",
    audHold.length > 0 && (await ph.getByRole("table").count()) === 0 && (await ph.getByRole("button", { name: "Hold a firm's data" }).count()) === 0 && (await ph.getByRole("link", { name: "Legal holds" }).count()) === 0, audHold);
  await ph.context().close();
  // W6: keyboard opens the dialog on its first field; axe-core 0 serious, no sideways scroll at 1440, 1024 and 400 px (the dialog open too).
  await p1.goto(`${BASE}/system/privacy/holds`); await holdsHeading(p1).waitFor({ timeout: 15_000 });
  await p1.getByRole("button", { name: "Hold a firm's data" }).focus(); await p1.keyboard.press("Enter"); await hd.waitFor();
  const holdFirst = await p1.evaluate(() => document.activeElement?.hasAttribute("data-firm-search") ?? false);
  await hd.locator("[data-advanced]").check(); const axeHold = await serious(p1); await hd.getByRole("button", { name: "Cancel" }).click(); await hd.waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
  const hw: Record<number, { axe: string[]; sideways: boolean }> = {};
  for (const w of [1440, 1024, 400]) { await p1.setViewportSize({ width: w, height: 900 }); await p1.goto(`${BASE}/system/privacy/holds`); await holdsHeading(p1).waitFor({ timeout: 15_000 }).catch(() => undefined);
    await p1.locator('[data-hold-chip="all"]').click(); await p1.locator("[data-hold-row]").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    hw[w] = { axe: await serious(p1), sideways: await p1.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth > 1) };
    if (w === 400) await p1.screenshot({ path: join(SHOTS, "b2-02-holds-400.png"), fullPage: true }); }
  await p1.setViewportSize({ width: 1440, height: 900 });
  ok("PF-21rs B2 W6 pass: Enter on \"Hold a firm's data\" opens it on the firm search; the page at 1440, 1024 and 400 px (the dialog open too): axe-core 0 serious, no sideways page scroll",
    holdFirst && !axeHold.length && Object.values(hw).every((x) => !x.axe.length && !x.sideways), { holdFirst, axeHold, hw });

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
  await p1.goto(`${BASE}/system/privacy/breaches`); await heading(p1).waitFor({ timeout: 15_000 });
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
  await seen(p1, `[data-done]`);
  const kStored = sql(`select array_to_string(affected_firms, ',') || '|' || array_to_string(data_categories, ',') from plat_breach where description = '${kdesc.replace(/'/g, "''")}'`);
  ok("PF-21rs W6 pass: keyboard only: Enter on \"Record a breach\" opens the dialog on its first field; Tab, typing, Enter on \"Add <firm>\", Space on a category and Enter record it",
    firstFocus === "datetime-local" && reached.every(Boolean) && backInSearch && kStored === `${B}|sign_in_credentials`, { firstFocus, reached, backInSearch, kStored });
  const widths: Record<number, { axe: string[]; sideways: boolean; rendered: boolean }> = {};
  for (const w of [1440, 1024, 400]) {
    await p1.setViewportSize({ width: w, height: 900 }); await p1.goto(`${BASE}/system/privacy/breaches`); await heading(p1).waitFor({ timeout: 15_000 }).catch(() => undefined);
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
