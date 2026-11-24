// FO-5s part 2 (R1.53; concept screens/fo-5s-retainer-signing r2 §4 S1; BR-1, BR-17): Settings › Retainer templates in a
// real browser against FO-5's and FO-5b's real routes (no fake API), each rule a pass and a fail: the empty state and the
// starter download; Upload refused without a name, refused for an unknown placeholder (named), accepted with a warning
// without a fee placeholder; the template's Code s. 24(3) checklist ("n of 26 items marked", each unmarked item with how
// we check); a new version (n+1); Make inactive takes it out of Prepare retainer; a Case Officer has no menu item and the
// page says who sets templates. Axe-core (WCAG 2.2 AA), no sideways scroll at 375 and 1440 px. US$0, no model call.
//   zsh studio/tools/isolated.sh screens_fo5s2 4564 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo5s2_templates_browser.ts 4564 xr_studio_screens_fo5s2
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { buildDocx } from "../api/src/front-office/retainers/docx.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4564), DBNAME = process.argv[3] ?? "xr_studio_screens_fo5s2";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "FO-5s", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const WORK = join(STUDIO, "var", `fo5s2-check-${process.pid}`); mkdirSync(WORK, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
sql(`update fo_retainer_template set active = false where firm_id = '${A}'`);   // re-runnable
const fresh = sql(`select count(*) from fo_retainer_template where firm_id = '${A}'`) === "0";
const staffOf = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
const R = staffOf("user-R"), O = staffOf("user-O");   // Owner (configures templates); Case Officer (does not)
async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tok = { R: await signIn(R.email), O: await signIn(O.email) };
const UNKNOWN = join(WORK, "unknown.docx"), NOFEE = join(WORK, "no-fee.docx");
writeFileSync(UNKNOWN, buildDocx(["Client {client.name}", "{client.passport}", "{#fees}{label}: {amount}{/fees}"]));
writeFileSync(NOFEE, buildDocx(["Client {client.name}"]));
const browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function pageAs(t: string, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce", acceptDownloads: true }), p = await ctx.newPage();
  await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
  p.on("pageerror", (e) => errors.push(String(e))); return p;
}
const shot = (p: Page, n: string) => p.screenshot({ path: join(SHOTS, `${n}.png`), fullPage: true });
const axe = async (p: Page, where: string) => { const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).include("main, [role=dialog]").analyze(); const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`FO-5s2 axe-core (WCAG 2.2 AA): no serious or critical finding — ${where}`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes.map((x) => x.target.join(" ")).join(", ")}`)); };
const URL_ = `${BASE}/front-office/settings/retainer-templates`;

try {
  // ------------------------------------------------------------------------------- empty state, menu, starter
  const r = await pageAs(tok.R);
  await r.goto(`${BASE}/front-office/pipeline`); await r.getByRole("navigation", { name: "Sales" }).waitFor({ timeout: 30_000 });
  await r.getByRole("navigation", { name: "Sales" }).getByRole("link", { name: "Retainer templates" }).click();
  await r.getByRole("heading", { name: "Retainer templates" }).waitFor({ timeout: 15_000 });
  await r.locator("[data-no-templates], [data-template-row]").first().waitFor({ timeout: 15_000 });
  ok("R1.53 FO-5s2 S1 pass: the Owner reaches Settings › Retainer templates from the Sales menu; a firm with none says \"No retainer templates yet.\"",
    !fresh || (await r.locator("[data-no-templates]").innerText()).includes("No retainer templates yet. Upload your firm's .docx to start."));
  await shot(r, "templates-empty-1440"); await axe(r, "the templates page");
  const dl = r.waitForEvent("download"); await r.getByRole("button", { name: "Download a starter template" }).click();
  const starter = join(WORK, "starter.docx"); await (await dl).saveAs(starter);
  ok("R1.53 FO-5s2 BR-1 pass: Download a starter template saves a Word file (a zip, PK)", readFileSync(starter).subarray(0, 2).toString("latin1") === "PK");

  // ------------------------------------------------------------------------------- BR-1 upload: refusals, warning, pass
  const up = r.getByRole("dialog", { name: "Upload template" });
  await r.getByRole("button", { name: "Upload template" }).click(); await up.waitFor();
  await up.getByText("Placeholders you can use").click(); await up.getByText("{#fees} … {/fees}").waitFor({ timeout: 10_000 });
  ok("R1.53 FO-5s2 BR-1 pass (review M1): the Upload panel lists the placeholders you can use ({client.name}, the fee loop) and offers the starter",
    (await up.getByText("{client.name}", { exact: true }).count()) === 1 && (await up.getByRole("button", { name: "Download a starter template" }).count()) === 1);
  await up.getByLabel("Template file (.docx)").setInputFiles(starter);
  await up.getByRole("button", { name: "Upload template" }).click();
  await up.getByText("Name the template.").waitFor({ timeout: 5_000 });
  ok("R1.53 FO-5s2 BR-1 fail: no name is refused on the field, nothing stored", sql(`select count(*) from fo_retainer_template where firm_id = '${A}' and active`) === "0");
  await up.getByLabel("Name").fill(`Unknown ${run}`); await up.getByLabel("Template file (.docx)").setInputFiles(UNKNOWN);
  await up.getByRole("button", { name: "Upload template" }).click();
  await up.getByText(/\{client\.passport\}/).first().waitFor({ timeout: 10_000 });
  ok("R1.53 FO-5s2 BR-1 fail: a template with an unknown placeholder is refused and the placeholder named ({client.passport}), nothing stored",
    sql(`select count(*) from fo_retainer_template where firm_id = '${A}' and name = 'Unknown ${run}'`) === "0");
  await axe(r, "the upload panel with a refusal");
  await up.getByLabel("Name").fill(`No fee ${run}`); await up.getByLabel("Template file (.docx)").setInputFiles(NOFEE);
  await up.getByRole("button", { name: "Upload template" }).click(); await up.waitFor({ state: "detached", timeout: 15_000 });
  await r.getByText(/This template never prints the fee/).first().waitFor({ timeout: 10_000 });
  ok("R1.53 FO-5s2 BR-1 pass: a template without a fee placeholder is accepted with a plain warning", sql(`select count(*) from fo_retainer_template where firm_id = '${A}' and name = 'No fee ${run}'`) === "1");
  await r.getByRole("button", { name: "Upload template" }).click(); await up.waitFor();
  await up.getByLabel("Name").fill(`Standard ${run}`); await up.getByLabel("Template file (.docx)").setInputFiles(starter);
  await up.getByRole("button", { name: "Upload template" }).click(); await up.waitFor({ state: "detached", timeout: 15_000 });
  const row = r.locator(`[data-template-row="Standard ${run}"]`); await row.waitFor({ timeout: 10_000 });
  await r.getByRole("button", { name: "Upload template" }).click(); await up.waitFor();
  await up.getByLabel("Name").fill(`standard ${run}`); await up.getByLabel("Template file (.docx)").setInputFiles(starter);
  await up.getByRole("button", { name: "Upload template" }).click(); await up.getByText("A template with this name already exists.").waitFor({ timeout: 10_000 });
  ok("R1.53 FO-5s2 BR-1 fail (review m7): a name already used (any case) is refused on the Name field", (await up.getByLabel("Name").getAttribute("aria-invalid")) === "true");
  await r.keyboard.press("Escape"); await up.waitFor({ state: "detached" });
  const focusBack = await r.waitForFunction(() => document.activeElement?.textContent === "Upload template", undefined, { timeout: 3_000 }).then(() => true, () => false);   // the dialog hands focus back after its close (review n4)
  ok("R1.53 FO-5s2 (break M5): closing the panel gives focus back to Upload template", focusBack);
  ok("R1.53 FO-5s2 BR-1 pass: the starter uploads: listed Retainer, version 1, Active", /Retainer\s*1\s*\d+\s*Active/.test((await row.innerText()).replace(/\n/g, " ")), await row.innerText());

  // ------------------------------------------------------------------------------- BR-17 checklist, new version
  await row.getByRole("button", { name: `Standard ${run}` }).click();
  const tp = r.getByRole("dialog", { name: `Standard ${run}` }); await tp.locator("[data-template-summary]").waitFor({ timeout: 10_000 });
  const tplId = sql(`select id from fo_retainer_template where firm_id = '${A}' and name = 'Standard ${run}'`);
  const cl = await (await fetch(`${BASE}/api/front-office/retainer-templates/${tplId}/checklist`, { headers: { authorization: `Bearer ${tok.R}` } })).json() as { marked: number; total: number };
  ok(`R1.53 FO-5s2 BR-17 pass: the template panel says "${cl.marked} of ${cl.total} items marked in this template" and lists each unmarked item with its section and how we check, never blocking`,
    (await tp.locator("[data-template-summary]").innerText()) === `${cl.marked} of ${cl.total} items marked in this template` && (await tp.locator("[data-unmarked]").count()) === cl.total - cl.marked
    && (await tp.innerText()).includes("How we check:") && (await tp.innerText()).includes("never stops a send"));
  const found = sql(`select cardinality(placeholders) from fo_retainer_template where id = '${tplId}'`);
  ok("R1.53 FO-5s2 BR-1 pass (review M1): the template panel lists the placeholders found in its file", (await tp.locator("[data-placeholders-found] li").count()) === Number(found) && (await tp.locator("[data-placeholders-found]").innerText()).includes("{client.name}"), found);
  await shot(r, "template-panel-1440"); await axe(r, "the template panel");
  await tp.getByLabel("Template file (.docx)").setInputFiles(starter);
  await tp.getByRole("button", { name: "Upload version 2" }).click();
  await tp.getByRole("button", { name: "Upload version 3" }).waitFor({ timeout: 15_000 });
  ok("R1.53 FO-5s2 BR-1 pass: Upload a new version makes version 2", sql(`select version from fo_retainer_template where id = '${tplId}'`) === "2");
  const other = new FormData(); other.set("file", new Blob([readFileSync(starter)]), "other.docx");   // a colleague's version 3, from another tab
  const v3 = await fetch(`${BASE}/api/front-office/retainer-templates/${tplId}/versions`, { method: "POST", headers: { authorization: `Bearer ${tok.R}` }, body: other });
  await tp.getByLabel("Template file (.docx)").setInputFiles(starter);
  await tp.getByRole("button", { name: "Upload version 3" }).click();
  await tp.getByText("This template is now at version 3, not version 2. Open it again.").waitFor({ timeout: 10_000 });
  // The refusal shows first and the page's refresh follows it (templates-page.tsx: the list query is invalidated after the
  // error is set), so "Upload version 4" is waited for, at most 10 s, and false on a timeout. Read at once with
  // isVisible(), it was red on a busy machine (the refresh had not landed) and green alone.
  const refreshed = await tp.getByRole("button", { name: "Upload version 4" }).waitFor({ timeout: 10_000 }).then(() => true, () => false);
  ok("R1.53 FO-5s2 fail (break M1): a panel showing version 2 cannot replace a colleague's version 3; the page refreshes and nothing is stored",
    v3.status === 201 && sql(`select version from fo_retainer_template where id = '${tplId}'`) === "3" && refreshed);

  // ------------------------------------------------------------------------------- inactive: not offered
  await tp.getByRole("button", { name: "Make inactive" }).click(); await tp.getByRole("button", { name: "Make active" }).waitFor({ timeout: 10_000 });
  ok("R1.53 FO-5s2: the table shows the template Inactive", (await row.innerText()).includes("Inactive"));
  await r.keyboard.press("Escape");
  const p2 = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Ana${run}', 'Sample', 'fo5s2.${run}@example.com', 'test', now()) returning id`);
  sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, state, engaged_at, engaged_by, created_by, updated_at) values (gen_random_uuid(), '${A}', '${p2}', 'MANUAL', 'WEBSITE', '${R.id}', 'ENGAGED', now(), 'test', 'test', now())`);
  const px = sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    select gen_random_uuid(), '${A}', l.id, 'INDIVIDUAL', (select id from fo_stage where firm_id = '${A}' and pipeline = 'INDIVIDUAL' and key = 'ENGAGED'), '${p2}', '${p2}', '${R.id}', 'test', now() from fo_lead l where l.person_id = '${p2}' returning id`);
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${px}'`);
  await r.goto(`${BASE}/front-office/prospects/${px}`); await r.locator("[data-retainer-card]").getByRole("button", { name: "Prepare retainer" }).click();
  const prep = r.getByRole("dialog", { name: "Prepare retainer" }); await prep.getByLabel("Template").locator("option").nth(1).waitFor({ state: "attached", timeout: 10_000 });
  const offered = await prep.getByLabel("Template").locator("option").allInnerTexts();
  ok("R1.53 FO-5s2 BR-1 pass/fail: Prepare retainer offers the active template (No fee) and not the inactive one (Standard)", offered.some((o) => o.startsWith(`No fee ${run}`)) && !offered.some((o) => o.startsWith(`Standard ${run}`)), offered);

  // ------------------------------------------------------------------------------- a Case Officer; widths
  const o = await pageAs(tok.O);
  await o.goto(URL_); await o.getByText("Retainer templates are set by your firm's Owner or Admin.").waitFor({ timeout: 30_000 });
  ok("R1.53 FO-5s2 fail: a Case Officer has no Retainer templates menu item and the page says who sets them, with no Upload", (await o.getByRole("link", { name: "Retainer templates" }).count()) === 0 && (await o.getByRole("button", { name: "Upload template" }).count()) === 0);
  const longF = new FormData(); longF.set("name", "N".repeat(110) + run.slice(0, 8)); longF.set("file", new Blob([readFileSync(starter)]), "long.docx");
  await fetch(`${BASE}/api/front-office/retainer-templates`, { method: "POST", headers: { authorization: `Bearer ${tok.R}` }, body: longF });   // break M4: a long unbroken name
  for (const w of [375, 1024, 1440]) {
    const p = await pageAs(tok.R, w); await p.goto(URL_); await p.locator("[data-template-row]").first().waitFor({ timeout: 30_000 });
    const wide = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`R1.53 FO-5s2 ${w} px (break M4): the templates page has no sideways scroll, with a 118-character unbroken name`, wide <= 1, wide); await shot(p, `templates-${w}`); await p.context().close();
  }
  ok("FO-5s2: no page error in any browser", errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
