// QA-779 part (a) (R1.53; Gap · Major, qa 7, 24 Nov; the tech lead's ruling on #3532): the prospect page's Email field in a
// real browser against the real routes (no fake API), each rule a pass and a fail:
//   J1 the journey: a client with no email, a draft retainer whose signer needs an email → its link → the prospect page →
//      Add email → saved, shown, focus back on the opener; the conflict check is then out of date and the page says so;
//   J2 an address that is not an email is refused on the field, nothing saved; Escape cancels, focus back on Add email;
//   J3 a Read-only person sees the email but gets no Add or Edit email;
//   J4 another person with the address: saved, and the server's warning is shown (P-574 (2));
//   J5 a colleague saved the person first: both values shown, nothing saved; "Keep mine, then Save" saves;
//   J6 axe-core (WCAG 2.2 AA) with the field open and after the save; no sideways scroll at 375 px.
// Screenshots at 1440 px: product/screens/FO-5s/screenshots/qa779-*.png. Seeds the Sample firms itself; Sample people by
// SQL. US$0, no model call, no mail.
//   zsh studio/tools/isolated.sh qa779b 4449 start PLATFORM_IDENTITY=local && tsx studio/tests/check_qa779_person_email_browser.ts 4449 xr_studio_qa779b
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4449), DBNAME = process.argv[3] ?? "xr_studio_qa779b";
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "FO-5s", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const NOT_AN_EMAIL = "This is not an email address. Check it, for example name@example.com.";
const CHECK_AGAIN = "The conflict check was run with the old email. Run it again before you send the retainer.";
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "seed:QA-779-test", workspaceId: await platformAuditWorkspaceId(db as never), reason: "QA-779 test: everyone sees all" });
const staffOf = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
const R = staffOf("user-R");
const roEmail = `qa779b-reader-${run}@sample-firm.example.com`;
const RO = { id: sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', '${roEmail}', 'Sample reader ${run}', 'qa779b-reader-${run}', now()) returning id`), email: roEmail };
sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${RO.id}', 'READ_ONLY', 'seed:QA-779-test')`);
/** A Sample person (email or none) on an Engaged lead and Individual prospect owned by the Owner. */
const prospect = (given: string, email: string | null = null) => {
  const pid = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', '${given}${run}', 'Sample', ${email ? `'${email}'` : "null"}, 'test', now()) returning id`);
  const lead = sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, state, engaged_at, engaged_by, created_by, updated_at) values (gen_random_uuid(), '${A}', '${pid}', 'MANUAL', 'WEBSITE', '${R.id}', 'ENGAGED', now(), 'test', 'test', now()) returning number`);
  const id = sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    select gen_random_uuid(), '${A}', l.id, 'INDIVIDUAL', (select id from fo_stage where firm_id = '${A}' and pipeline = 'INDIVIDUAL' and key = 'ENGAGED'), '${pid}', '${pid}', '${R.id}', 'test', now() from fo_lead l where l.person_id = '${pid}' returning id`);
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${id}'`);
  return { id, pid, lead, name: `${given}${run} Sample` };
};
const emailOf = (pid: string) => sql(`select coalesce(email, '-') from fo_person where id = '${pid}'`);
async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tok = { R: await signIn(R.email), RO: await signIn(RO.email) };
async function call(t: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
  const form = body instanceof FormData;
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${t}`, ...(body && !form ? { "content-type": "application/json" } : {}) }, body: form ? body : body ? JSON.stringify(body) : undefined });
  const x = await r.text(); let b: unknown = x; try { b = JSON.parse(x); } catch { /* file or text */ } return { status: r.status, body: b };
}
sql(`update fo_retainer_template set active = false where firm_id = '${A}'`);   // re-runnable: one active template
const starter = await fetch(`${BASE}/api/front-office/retainer-templates/starter`, { headers: { authorization: `Bearer ${tok.R}` } });
const up = new FormData(); up.set("name", `Standard retainer ${run}`); up.set("file", new Blob([await starter.arrayBuffer()]), "starter.docx");
const tpl = await call(tok.R, "POST", "/front-office/retainer-templates", up);
ok("R1.53 QA-779 setup: the Sample starter template is uploaded", starter.ok && tpl.status === 201, tpl.body);

const browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function pageAs(t: string, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
  p.setDefaultTimeout(10_000); p.on("pageerror", (e) => errors.push(String(e))); return p;
}
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
/** Polls until `f` holds or `ms` pass: the step that relies on it then FAILs with its detail (never a silent catch). */
const until = async (p: Page, f: () => Promise<boolean>, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f().catch(() => false)) return true; await p.waitForTimeout(100); } return false; };
const axeBad = async (p: Page) => (await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).include("main").analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((x) => x.target.join(" ")).join(", ")}`);
const openProspect = async (p: Page, id: string) => { await p.goto(`${BASE}/front-office/prospects/${id}`); await p.locator("[data-retainer-card]").waitFor({ timeout: 30_000 }); };
const addBtn = (p: Page) => p.getByRole("button", { name: "Add email" }), editBtn = (p: Page) => p.getByRole("button", { name: "Edit email" });
const field = (p: Page) => p.getByLabel("Email", { exact: true }), saveBtn = (p: Page) => p.locator("[data-email-edit]").getByRole("button", { name: "Save", exact: true });
const focused = (p: Page) => p.evaluate(() => document.activeElement?.textContent?.trim() ?? document.activeElement?.tagName ?? "");
/** One journey: a step that cannot go on is one FAIL with its reason (the later steps are not reached). */
const journey = async (name: string, f: () => Promise<void>) => { try { await f(); } catch (e) { ok(`${name}: the journey reached its end`, false, String((e as Error).message ?? e).split("\n")[0].slice(0, 300)); } };

try {
  // ----------------------------------------------------------------------------------------- J1 the journey from the blocker
  await journey("R1.53 QA-779 J1", async () => {
    const nia = prospect("Nia");
    const check = await call(tok.R, "POST", "/front-office/conflict-checks", { requestId: crypto.randomUUID(), prospectId: nia.id, result: "NO_CONFLICT" });
    const draft = await call(tok.R, "POST", `/front-office/prospects/${nia.id}/retainers`, { templateId: tpl.body.id, fees: [{ label: "Professional fee", amountMinor: 150000, when: "ON_SIGNING" }] });
    ok("R1.53 QA-779 J1 setup: a client with no email, a conflict check recorded and a draft retainer with a fee", check.status === 201 && draft.status === 201, { check: check.status, draft: draft.body });
    const p = await pageAs(tok.R);
    await p.goto(`${BASE}/front-office/retainers/${draft.body.id}`);
    const blocker = p.locator('[data-blocker="signer"]'); await blocker.waitFor({ timeout: 30_000 });
    await blocker.getByRole("link").click();
    await p.locator("[data-retainer-card]").waitFor({ timeout: 30_000 });
    const onProspect = new URL(p.url()).pathname === `/front-office/prospects/${nia.id}`;
    const shownBefore = await until(p, async () => (await p.locator("[data-person-email]").innerText()) === "Not given" && await addBtn(p).isVisible());
    ok("R1.53 QA-779 J1 pass: the blocker's \"Add it on …'s record\" opens the prospect page, whose Contact block shows the email as Not given with Add email", onProspect && shownBefore, { url: p.url().replace(BASE, ""), shownBefore });
    await addBtn(p).click();
    const opened = await until(p, async () => (await field(p).count()) === 1 && await field(p).evaluate((x) => x === document.activeElement));
    await field(p).fill(`  Nia.${run}@Example.COM `);
    await shot(p, "qa779-add-email-open-1440");
    const axeOpen = await axeBad(p);
    ok("R1.53 QA-779 J6 pass: axe-core (WCAG 2.2 AA) finds nothing serious with the Email field open", opened && axeOpen.length === 0, { opened, axeOpen });
    await saveBtn(p).click();
    const savedShown = await until(p, async () => (await p.locator("[data-person-email]").innerText()) === `nia.${run}@example.com`);
    const toast = await p.getByText("Email saved.", { exact: true }).isVisible();
    const back = await until(p, async () => (await focused(p)) === "Edit email");
    ok("R1.53 QA-779 J1 pass: Add email, the address typed with spaces and capitals, Save → \"Email saved.\", the address shown lower-cased and saved, focus back on Edit email",
      opened && savedShown && toast && back && emailOf(nia.pid) === `nia.${run}@example.com`, { opened, savedShown, toast, back, focus: await focused(p), db: emailOf(nia.pid) });
    const again = await until(p, async () => (await p.locator("[data-check-again]").innerText()).includes(CHECK_AGAIN) && (await p.locator('[data-conflict-status="CONFLICT_CHECK_STALE"]').count()) === 1);
    await shot(p, "qa779-email-saved-check-again-1440");
    ok("R1.53 QA-779 J1 pass: the page then says the conflict check was run with the old email and is run again before the retainer is sent; the conflict panel shows the gate's own words",
      again, { line: await p.locator("[data-check-again]").innerText().catch(() => "(none)") });
    const axeSaved = await axeBad(p);
    ok("R1.53 QA-779 J6 pass: axe-core (WCAG 2.2 AA) finds nothing serious after the save", savedShown && axeSaved.length === 0, axeSaved);

    // J3: a Read-only person on the same prospect.
    const ro = await pageAs(tok.RO);
    await openProspect(ro, nia.id);
    const roSees = await until(ro, async () => (await ro.locator("[data-person-email]").innerText()) === `nia.${run}@example.com`);
    const roButtons = await ro.getByRole("button", { name: /^(Add|Edit) email$/ }).count();
    ok("R1.53 QA-779 J3 fail: a Read-only person sees the email in the Contact block but gets no Add email or Edit email", roSees && roButtons === 0, { roSees, roButtons });
    await ro.context().close(); await p.context().close();
  });

  // ----------------------------------------------------------------------------------------- J2 not an email; Escape
  await journey("R1.53 QA-779 J2", async () => {
    const oto = prospect("Oto");
    const p = await pageAs(tok.R);
    await openProspect(p, oto.id);
    await addBtn(p).click();
    await field(p).fill("oto at example dot com");
    await saveBtn(p).click();
    const refused = await until(p, async () => (await p.locator("#fo-email-edit-error").innerText()) === NOT_AN_EMAIL && (await field(p).getAttribute("aria-invalid")) === "true");
    await shot(p, "qa779-not-an-email-1440");
    ok("R1.53 QA-779 J2 fail: an address that is not an email → the field's sentence under it (aria-invalid), the field stays open with what was typed, nothing saved",
      refused && await field(p).inputValue() === "oto at example dot com" && emailOf(oto.pid) === "-", { refused, error: await p.locator("#fo-email-edit-error").innerText().catch(() => "(none)"), db: emailOf(oto.pid) });
    await field(p).press("Escape");
    const closed = await until(p, async () => (await field(p).count()) === 0 && (await focused(p)) === "Add email");
    ok("R1.53 QA-779 J2 fail: Escape cancels: the field closes, nothing is saved, focus is back on Add email", closed && emailOf(oto.pid) === "-" && (await p.locator("[data-person-email]").innerText()) === "Not given", { closed, focus: await focused(p) });
    await p.context().close();
  });

  // ----------------------------------------------------------------------------------------- J4 another person has it
  await journey("R1.53 QA-779 J4", async () => {
    const quin = prospect("Quin", `quin.${run}@example.com`), pip = prospect("Pip");
    const p = await pageAs(tok.R);
    await openProspect(p, pip.id);
    await addBtn(p).click(); await field(p).fill(`quin.${run}@example.com`); await saveBtn(p).click();
    const warned = await until(p, async () => (await p.locator("[data-contact]").innerText()).includes(`${quin.name} (${quin.lead}) already has this email address. Check whether this is the same person.`));
    await shot(p, "qa779-duplicate-warning-1440");
    ok("R1.53 QA-779 J4 pass: an address another person in the firm has is saved (never a block) and the page shows the warning naming them with their lead (P-574 (2))",
      warned && emailOf(pip.pid) === `quin.${run}@example.com`, { warned, db: emailOf(pip.pid) });
    await p.context().close();
  });

  // ----------------------------------------------------------------------------------------- J5 a colleague saved first
  await journey("R1.53 QA-779 J5", async () => {
    const ray = prospect("Ray");
    const p = await pageAs(tok.R);
    await openProspect(p, ray.id);
    await addBtn(p).click(); await field(p).fill(`ray.${run}@example.com`);
    sql(`update fo_person set email = 'ray.colleague.${run}@example.com', updated_at = now() + interval '1 second' where id = '${ray.pid}'`);   // a colleague's save meanwhile (Sample)
    await saveBtn(p).click();
    const both = await until(p, async () => (await p.locator('[data-conflict-row="Email"] [data-conflict-saved]').innerText()) === `ray.colleague.${run}@example.com` && (await p.locator('[data-conflict-row="Email"] [data-conflict-mine]').innerText()) === `ray.${run}@example.com`);
    ok("R1.53 QA-779 J5 fail: a colleague saved the person after the field opened → \"Someone else saved this first\" with both addresses; nothing of mine is saved",
      both && emailOf(ray.pid) === `ray.colleague.${run}@example.com`, { both, db: emailOf(ray.pid) });
    await p.locator("[data-conflict-keep-mine]").click(); await saveBtn(p).click();
    const kept = await until(p, async () => (await p.locator("[data-person-email]").innerText()) === `ray.${run}@example.com`);
    ok("R1.53 QA-779 J5 pass: \"Keep mine, then Save\" and Save → mine is saved on the newer version", kept && emailOf(ray.pid) === `ray.${run}@example.com`, { kept, db: emailOf(ray.pid) });
    await p.context().close();
  });

  // ----------------------------------------------------------------------------------------- J6 375 px
  await journey("R1.53 QA-779 J6", async () => {
    const sam = prospect("Sam");
    const p = await pageAs(tok.R, 375);
    await openProspect(p, sam.id);
    await addBtn(p).click(); await field(p).fill(`a.very.long.address.for.a.narrow.screen.${run}@example.com`);
    const fits = await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    ok("R1.53 QA-779 J6 pass: at 375 px the prospect page with the Email field open has no sideways scroll", (await field(p).count()) === 1 && fits, { fits });
    await p.context().close();
  });
  ok("R1.53 QA-779: no page error in the browser", errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close().catch(() => undefined);
  await db.$disconnect().catch(() => undefined);
}
process.exit(summary() ? 1 : 0);
