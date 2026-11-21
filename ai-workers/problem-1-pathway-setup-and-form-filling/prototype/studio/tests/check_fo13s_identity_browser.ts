// FO-13s part 1 (brief lead-b-briefs/FO-13s.md Part B; concept screens/FO-13s/concept.md BR-1..BR-9, challenge M1-M4):
// the Identity check panel in a real browser against FO-13i's real routes (no fake API), each rule a pass and a fail:
// BR-9 the empty sentence before a check and not after; BR-4 an expired expiry shows its sentence on the field (422,
// the firm's own rule, P-735) with nothing stored, today saves; BR-3 an expiry with no document; BR-5 a text file named
// .pdf; BR-7 one row for a Save; BR-8 the keys (Billing and finance: no Record, no Open copy; Read-only: Open copy, no
// Record); M1 the panel on the prospect page too; M4 the error summary. Also a keyboard-only Save, axe-core (WCAG 2.2 AA),
// no sideways scroll and screenshots at 375, 1024 and 1440 px. Seeds the Sample firms itself. US$0, no model call.
//   zsh studio/tools/isolated.sh screens_fo13s 4561 start PLATFORM_IDENTITY=local PROSPECT_WON_POLL_MS=500 && tsx studio/tests/check_fo13s_identity_browser.ts 4561 xr_studio_screens_fo13s
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, readSetting, TIME_ZONE, writeSetting } from "../api/src/platform/settings.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4561), DBNAME = process.argv[3] ?? "xr_studio_screens_fo13s";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "FO-13s", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const WORK = join(STUDIO, "var", `fo13s-check-${process.pid}`); mkdirSync(WORK, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const EXPIRED = "This document has expired. Check a current one.";
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "seed:FO-13s-test", workspaceId: await platformAuditWorkspaceId(db), reason: "FO-13s test" });
const zone = await readSetting<string>(db, A, TIME_ZONE.key);
const dayIn = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const TODAY = dayIn(Date.now()), YESTERDAY = dayIn(Date.now() - 86_400_000);
const staffOf = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
const O = staffOf("user-O"), R = staffOf("user-R");   // Case Officer: records, opens copies; Owner: converts (part 2)
const addStaff = (tag: string, role: string) => { const email = `fo13s-${tag}-${run}@sample-firm.example.com`;
  const id = sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', '${email}', 'Sample ${tag} ${run}', 'fo13s-${tag}-${run}', now()) returning id`);
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${id}', '${role}', 'seed:FO-13s-test')`); return { id, email }; };
const BF = addStaff("billing", "BILLING_FINANCE"), RO = addStaff("reader", "READ_ONLY");
const PID = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Client F${run}', 'Sample', 'fo13s-${run}@example.com', 'test', now()) returning id`);
const LID = sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values (gen_random_uuid(), '${A}', '${PID}', 'MANUAL', 'WEBSITE', '${O.id}', 'test', now()) returning id`);
const NAME = `Client F${run} Sample`;
const rows = () => Number(sql(`select count(*) from fo_identity_check where person_id = '${PID}'`));
async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tok = { O: await signIn(O.email), R: await signIn(R.email), BF: await signIn(BF.email), RO: await signIn(RO.email) };
const PDF = join(WORK, "passport-copy.pdf"), FAKE = join(WORK, "notes.pdf");
writeFileSync(PDF, "%PDF-1.4\n% FO-13s Sample copy\n%%EOF\n"); writeFileSync(FAKE, "just some text, not a PDF\n");
const browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function pageAs(t: string, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce", acceptDownloads: true }), p = await ctx.newPage();
  await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
  p.on("pageerror", (e) => errors.push(String(e))); return p;
}
const panel = (p: Page) => p.locator("[data-identity-panel]");
const openLead = async (p: Page) => { await p.goto(`${BASE}/front-office/leads/${LID}`); await panel(p).waitFor({ timeout: 30_000 }); await panel(p).locator("[data-loading]").waitFor({ state: "detached", timeout: 15_000 }); };
const shot = (p: Page, n: string) => p.screenshot({ path: join(SHOTS, `${n}.png`), fullPage: true });
const axe = async (p: Page, where: string) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).include("[data-identity-panel], [role=dialog]").analyze(); const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`FO-13s axe-core (WCAG 2.2 AA): no serious or critical finding — ${where}`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)); };
const drawer = (p: Page) => p.getByRole("dialog", { name: "Record an identity check" });
const save = (p: Page) => drawer(p).getByRole("button", { name: "Save check" }).click();

try {
  // ------------------------------------------------------------------------------- BR-9, BR-8 (empty state, keys)
  const o = await pageAs(tok.O);
  await openLead(o);
  ok("FO-13s BR-9 pass: with no check, the panel says the retainer Send's sentence word for word", (await panel(o).locator("[data-no-check]").innerText()).includes(`No identity check is recorded for ${NAME}.`));
  ok("FO-13s BR-8 pass: a Case Officer (identity-check:record) sees Record a check", await panel(o).getByRole("button", { name: "Record a check" }).isVisible());
  await shot(o, "empty-1440"); await axe(o, "the lead page, no check");

  // ------------------------------------------------------------------------- BR-4, BR-3, BR-5, M4 (refusals)
  await panel(o).getByRole("button", { name: "Record a check" }).click(); await drawer(o).waitFor();
  ok("FO-13s m1: nothing is ticked in Details corroborated when the panel opens", (await drawer(o).locator('input[type="checkbox"]:checked').count()) === 0);
  await drawer(o).getByLabel(/^Document type/).selectOption("PASSPORT");
  await drawer(o).getByLabel(/^Issuing country/).fill("ca");
  await drawer(o).getByLabel(/^Last 4/).fill("q7r2");
  await drawer(o).getByLabel(/^Expiry date/).fill(YESTERDAY);
  await drawer(o).getByLabel("Name", { exact: true }).check();
  await save(o);
  const expiry = drawer(o).getByLabel(/^Expiry date/);
  await drawer(o).locator("[data-error-summary]").waitFor({ timeout: 10_000 });
  ok("FO-13s BR-4 fail: yesterday (firm time) shows the server's sentence under Expiry date and in the summary, and nothing is stored",
    (await drawer(o).getByText(EXPIRED).count()) >= 2 && (await expiry.getAttribute("aria-invalid")) === "true" && rows() === 0, { rows: rows() });
  ok("FO-13s M4: the first field in error takes focus (Expiry date)", await expiry.evaluate((e) => e === document.activeElement));
  await shot(o, "expired-1440"); await axe(o, "the record panel with an error");
  await drawer(o).getByLabel(/^Document type/).selectOption("");
  await save(o);
  await drawer(o).getByText("A document is named by its type, issuing country and last 4 characters together.", { exact: true }).waitFor({ timeout: 10_000 });
  ok("FO-13s BR-3 fail: a country, last 4 and expiry without a document type is refused on Document type, nothing stored",
    (await drawer(o).getByLabel(/^Document type/).getAttribute("aria-invalid")) === "true" && rows() === 0, await drawer(o).locator("[data-error-summary]").innerText().catch(() => "no summary"));
  await drawer(o).getByLabel(/^Document type/).selectOption("PASSPORT");
  await drawer(o).getByLabel(/^Expiry date/).fill(TODAY);
  await drawer(o).getByLabel(/^Copy/).setInputFiles(FAKE);
  await save(o);
  await drawer(o).getByText("A PDF, JPEG or PNG.", { exact: true }).waitFor({ timeout: 10_000 });
  ok("FO-13s BR-5 fail: a text file named .pdf is refused on Copy (checked by content, 415), nothing stored", rows() === 0);

  // ---------------------------------------------------------------------------------- BR-4 pass, BR-7, BR-9 fail
  await drawer(o).getByLabel(/^Copy/).setInputFiles([]);
  // BR-7 (challenge M2): the first Save reaches the server and is stored, but its answer is lost; Save again must send
  // the same requestId, so the server replays the saved check (one row), never a second one. Without a copy: Playwright's
  // route.fetch does not carry a multipart file part faithfully.
  const sentIds: string[] = []; let firstStatus = 0;
  o.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith(`/people/${PID}/identity-checks`)) sentIds.push(/name="requestId"\r\n\r\n([0-9a-f-]{36})/.exec(r.postDataBuffer()?.toString("latin1") ?? "")?.[1] ?? "?"); });
  await o.route(`**/api/front-office/people/${PID}/identity-checks`, async (route) => { if (route.request().method() !== "POST") return route.fallback(); const first = await route.fetch(); firstStatus = first.status(); await route.abort("connectionreset"); }, { times: 1 });
  await save(o);
  await drawer(o).getByText("Could not reach the server. Your details are kept: Save again to retry the same check.").waitFor({ timeout: 15_000 });
  ok("FO-13s BR-7: the first Save was stored although its answer was lost (one row), and the panel says to Save again", firstStatus === 201 && rows() === 1, { firstStatus, rows: rows() });
  await save(o);
  await drawer(o).waitFor({ state: "detached", timeout: 15_000 });
  ok("FO-13s BR-7 pass: Save again after a lost answer sends the same requestId and stays one check", rows() === 1 && sentIds.length === 2 && sentIds[0] === sentIds[1] && sentIds[0] !== "?", sentIds);
  // The same document with its copy, as a new Save (a new panel, a new requestId).
  await panel(o).getByRole("button", { name: "Record a check" }).click(); await drawer(o).waitFor();
  await drawer(o).getByLabel(/^Document type/).selectOption("PASSPORT");
  await drawer(o).getByLabel(/^Issuing country/).fill("CA");
  await drawer(o).getByLabel(/^Last 4/).fill("q7r2");
  await drawer(o).getByLabel(/^Expiry date/).fill(TODAY);
  await drawer(o).getByLabel("Name", { exact: true }).check();
  await drawer(o).getByLabel(/^Copy/).setInputFiles(PDF);
  await save(o);
  await drawer(o).waitFor({ state: "detached", timeout: 15_000 });
  await panel(o).locator("[data-check]").first().waitFor({ timeout: 15_000 });
  const row = panel(o).locator("[data-check]").first();
  ok("FO-13s BR-4 pass: an expiry of the firm's today saves (a new Save, a second row), and the panel lists it with plain words, ···last 4 and who checked",
    rows() === 2 && (await row.locator("[data-doc]").innerText()) === "Passport, CA ···Q7R2" && (await row.locator("[data-expiry]").innerText()) === new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${TODAY}T00:00:00Z`)) && /In person/.test(await row.innerText()) && (await row.locator("[data-details]").innerText()) === "Name", await row.innerText());
  ok("FO-13s BR-9 fail: once a check is recorded, the no-check sentence is gone", (await panel(o).locator("[data-no-check]").count()) === 0);
  const dl = o.waitForEvent("download", { timeout: 15_000 });
  await row.getByRole("button", { name: "Open copy" }).click();
  const got = await dl, gotPath = join(WORK, "downloaded"); await got.saveAs(gotPath);
  ok("FO-13s: Open copy saves the stored copy (the same bytes, the server's file name)", readFileSync(gotPath).equals(readFileSync(PDF)) && got.suggestedFilename() === "identity-copy.pdf", got.suggestedFilename());
  await shot(o, "listed-1440"); await axe(o, "the lead page with a check");

  // ------------------------------------------------------------------------------------------ keyboard only
  await panel(o).getByRole("button", { name: "Record a check" }).focus(); await o.keyboard.press("Enter"); await drawer(o).waitFor();
  ok("FO-13s keyboard: Enter on Record a check opens the panel on its first field (Method)", await drawer(o).getByLabel("Method").evaluate((e) => e === document.activeElement));
  await o.keyboard.press("Tab"); await o.keyboard.type("Seen at the office (Sample)");
  for (let i = 0; i < 12; i++) { await o.keyboard.press("Tab"); if (await o.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type === "checkbox")) break; }
  await o.keyboard.press("Space");
  for (let i = 0; i < 12; i++) { await o.keyboard.press("Tab"); if (await o.evaluate(() => document.activeElement?.textContent === "Save check")) break; }
  await o.keyboard.press("Enter");
  await drawer(o).waitFor({ state: "detached", timeout: 15_000 });
  // Focus returns after useReturnFocus's 60 ms timer, which can be later than the drawer's detach: wait for it (up to 2 s).
  const recordBtn = await panel(o).getByRole("button", { name: "Record a check" }).elementHandle();
  const focusBack = await o.waitForFunction((e) => e === document.activeElement, recordBtn, { timeout: 2000 }).then(() => true, () => false);
  const kb = { rows: rows(), focusBack, first: await panel(o).locator("[data-check]").first().innerText(), focus: await o.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)) };
  ok("FO-13s keyboard pass: a check typed and saved with the keyboard only (Tab to Save check, Enter) lists first, and focus returns to Record a check",
    kb.rows === 3 && /Seen at the office/.test(kb.first) && kb.focusBack, kb);
  await panel(o).getByRole("button", { name: "Record a check" }).click(); await drawer(o).waitFor(); await o.keyboard.press("Escape");
  ok("FO-13s keyboard: Escape closes an untouched panel without asking", (await drawer(o).count()) === 0);

  // ------------------------------------------------- break MJ-2 (a half-typed date), MJ-1 (a long unbroken note)
  await panel(o).getByRole("button", { name: "Record a check" }).click(); await drawer(o).waitFor();
  await drawer(o).getByLabel(/^Document type/).selectOption("PASSPORT"); await drawer(o).getByLabel(/^Issuing country/).fill("CA"); await drawer(o).getByLabel(/^Last 4/).fill("q7r2");
  await drawer(o).getByLabel(/^Expiry date/).focus(); await o.keyboard.type("0315");   // month and day only
  await drawer(o).getByLabel("Name", { exact: true }).check();
  await save(o);
  await drawer(o).getByText("Enter the whole date (day, month and year), or clear it.", { exact: true }).waitFor({ timeout: 10_000 });
  ok("FO-13s break MJ-2 fail: a half-typed expiry is refused on its field, never saved as no expiry", rows() === 3 && (await drawer(o).getByLabel(/^Expiry date/).getAttribute("aria-invalid")) === "true", rows());
  await drawer(o).getByLabel(/^Expiry date/).fill(TODAY);
  await drawer(o).getByLabel(/^Note/).fill("Seen".padEnd(470, "x"));
  await save(o); await drawer(o).waitFor({ state: "detached", timeout: 15_000 });
  ok("FO-13s break MJ-2 pass: the whole date saves", rows() === 4);

  // ----------------------------------------------------------------------------------------- BR-8 (other keys)
  const bf = await pageAs(tok.BF); await openLead(bf);
  ok("FO-13s BR-8 fail: Billing and finance (no record, no document:show) sees the list but no Record and no Open copy, with the reason",
    (await panel(bf).locator("[data-check]").count()) === 4 && (await panel(bf).getByRole("button", { name: "Record a check" }).count()) === 0 && (await panel(bf).getByRole("button", { name: "Open copy" }).count()) === 0 && (await panel(bf).locator("[data-why-no-copy]").count()) === 1);
  const ro = await pageAs(tok.RO); await openLead(ro);
  ok("FO-13s BR-8: Read-only (document:show, no record) may open the copy but not record", (await panel(ro).getByRole("button", { name: "Open copy" }).count()) === 1 && (await panel(ro).getByRole("button", { name: "Record a check" }).count()) === 0);

  // ----------------------------------------------------------------------------------------- M1 prospect page
  const eng = await fetch(`${BASE}/api/front-office/leads/${LID}/engage`, { method: "POST", headers: { authorization: `Bearer ${tok.O}` } });
  const prospect = await eng.json() as { id: string };
  await o.goto(`${BASE}/front-office/prospects/${prospect.id}`); await panel(o).locator("[data-check]").first().waitFor({ timeout: 30_000 });
  ok("FO-13s M1: the prospect page shows the same panel with the person's four checks", eng.status === 201 && (await panel(o).locator("[data-check]").count()) === 4, eng.status);
  await axe(o, "the prospect page");

  // --------------------------------------------------- part 2 (QA-610): the client page, read-only, and its states
  // FO-13c: no client without a recorded conflict check; recorded through its API first (the conflict panel is FO-13s part 2).
  await fetch(`${BASE}/api/front-office/conflict-checks`, { method: "POST", headers: { authorization: `Bearer ${tok.R}`, "content-type": "application/json" }, body: JSON.stringify({ prospectId: prospect.id, requestId: crypto.randomUUID(), result: "NO_CONFLICT" }) });
  const conv = await fetch(`${BASE}/api/front-office/prospects/${prospect.id}/convert`, { method: "POST", headers: { authorization: `Bearer ${tok.R}`, "content-type": "application/json" }, body: "{}" });
  let CID = "";
  for (const until = Date.now() + 15_000; !CID && Date.now() < until; await new Promise((res) => setTimeout(res, 100))) CID = sql(`select id from case_client where prospect_id = '${prospect.id}'`);
  ok("FO-13s part 2 setup: Convert to client makes the person's client (FO-8's poll)", conv.status === 200 && !!CID, conv.status);
  const openClient = async (p: Page) => { await p.goto(`${BASE}/clients/${CID}`); await p.locator("[data-client-page]").waitFor({ timeout: 60_000 }); await panel(p).waitFor({ timeout: 15_000 }); await panel(p).locator("[data-loading]").waitFor({ state: "detached", timeout: 15_000 }); };
  await openClient(o); await panel(o).locator("[data-check]").first().waitFor({ timeout: 15_000 });
  ok("FO-13s part 2 pass: the client page lists the person's four checks, newest first, with Open copy for the Case Officer",
    (await panel(o).locator("[data-check]").count()) === 4 && (await panel(o).getByRole("button", { name: "Open copy" }).count()) >= 1);
  ok("FO-13s part 2 fail: the client page offers no Record a check (recorded on the lead or prospect page)", (await panel(o).getByRole("button", { name: "Record a check" }).count()) === 0);
  await axe(o, "the client page with checks"); await shot(o, "client-1440");
  // M1 (review): a viewer who may see the client but not the person (all leads not shared, another's lead) gets a plain line.
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:FO-13s-test", workspaceId: await platformAuditWorkspaceId(db), reason: "FO-13s part 2: own leads only" });
  const bfc = await pageAs(tok.BF); await openClient(bfc);
  await panel(bfc).locator("[data-identity-hidden]").waitFor({ timeout: 15_000 });
  ok("FO-13s part 2 fail: with leads not shared, a viewer who does not have the person's lead sees a plain line, no error and no Try again",
    (await panel(bfc).locator("[data-check]").count()) === 0 && (await panel(bfc).getByRole("button", { name: "Try again" }).count()) === 0 && (await panel(bfc).getByText("No such person", { exact: false }).count()) === 0);
  await axe(bfc, "the client page, checks not visible");
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "seed:FO-13s-test", workspaceId: await platformAuditWorkspaceId(db), reason: "FO-13s part 2: restore" });
  // S3 (review): a role without the list's key is told so, and the panel asks the server nothing.
  sql(`delete from platform_role_permission where role = 'READ_ONLY' and permission_key = 'agent/prospect:show'`);
  try {
    const roc = await pageAs(tok.RO); let asked = 0;
    roc.on("request", (r) => { if (/\/identity-checks$/.test(new URL(r.url()).pathname)) asked++; });
    await roc.goto(`${BASE}/clients/${CID}`); await roc.locator("[data-client-page]").waitFor({ timeout: 60_000 });
    await panel(roc).locator("[data-identity-forbidden]").waitFor({ timeout: 15_000 });
    ok("FO-13s part 2 fail: a role that may see clients but not prospects sees the reason line, and no identity request is sent", asked === 0 && (await panel(roc).locator("[data-check]").count()) === 0, asked);
    await axe(roc, "the client page, no key");
  } finally { sql(`insert into platform_role_permission (role, permission_key) values ('READ_ONLY', 'agent/prospect:show') on conflict do nothing`); }

  // ----------------------------------------------------------------------------------------- widths
  for (const w of [375, 1024, 1440]) {
    const p = await pageAs(tok.O, w); await openLead(p);
    const wide = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`FO-13s ${w} px: no sideways scroll on the lead page with the panel (a 470-character unbroken note included, break MJ-1)`, wide <= 1, wide);
    await shot(p, `lead-${w}`);
    await panel(p).getByRole("button", { name: "Record a check" }).click(); await drawer(p).waitFor(); await shot(p, `panel-${w}`);
    await p.context().close();
  }
  ok("FO-13s: no page error in any browser step", errors.length === 0, errors);
} finally {
  await browser.close(); await db.$disconnect(); rmSync(WORK, { recursive: true, force: true });
}
process.exit(summary() ? 1 : 0);
