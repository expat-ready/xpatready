// FO-4 Add a lead (R1.27's manual door, QA-606; AG-2-4 rules 1, 4-6, 8, 10; concept r2 §4 screens 2 and 5; BR-2): the
// Leads screen's Add a lead panel against the real API (FO-2's `POST /api/front-office/leads`), on an isolated copy.
//   AL1  the button follows `agent/prospect:create`: a Case Officer sees it, a Read-only person does not, and the server
//        refuses Read-only's add (403);
//   AL2  Save without a source is refused at the field ("Pick a source.") and nothing is saved; with one, the lead is
//        saved with door MANUAL and that source, the adder owns it, and its page shows the source;
//   AL3  a known person (same email) is shown before saving, nothing saved; "Use existing person" places the lead on that
//        person (no new person); "Add as new" makes a new person (AG-2-4 rule 5);
//   AL4  a match the adder may not open shows only "Possible match with a record you cannot open — ask a manager", with
//        no name and no "Use existing person" (rule 6);
//   AL5  two clicks on Save make one lead (one request id per panel);
//   AL7  the breaker's findings: a double click on Save lead for a known person saves nothing (B1); the keyboard lands
//        on the match (m5); no stored code (WEBSITE) and no case/space twin among the sources (M2, m4); a server
//        refusal in the panel's words (m3);
//   AL6  keyboard only (Tab to the fields, Enter saves), axe clean with the panel open, no sideways scroll at 375, 1024
//        and 1440 px.
// Sample rows only; US$0, no model call. Usage, from prototype/:
//   zsh studio/tools/isolated.sh screens_al 4531 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo4al_add_lead_browser.ts 4531 xr_studio_screens_al
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const PORT = Number(process.argv[2] ?? 4531), DBNAME = process.argv[3] ?? "xr_studio_screens_al", BASE = `http://localhost:${PORT}`;
const SHOTS = join(import.meta.dirname, "..", "..", "..", "product", "screens", "fo-4-sales", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
// AL4 needs "each person sees their own" (the firm's sharing setting off), so a colleague's lead is one the Case Officer may not open.
await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:FO-4al-test", workspaceId: await platformAuditWorkspaceId(db as never), reason: "FO-4al: each person sees their own" });
await db.$disconnect();
const staffOf = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
const T = staffOf("user-T"), O = staffOf("user-O");   // Case Manager (sees all), Case Officer (sees own)
const roEmail = `fo4al-ro-${run}@sample-firm.example.com`;
const roId = sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', '${roEmail}', 'Sample Reader ${run}', 'fo4al-ro-${run}', now()) returning id`);
sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${roId}', 'READ_ONLY', 'seed:FO-4al-test')`);
async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tok = { T: await signIn(T.email), O: await signIn(O.email), RO: await signIn(roEmail) };
const post = async (t: string, body: unknown) => { const r = await fetch(`${BASE}/api/front-office/leads`, { method: "POST", headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) as any }; };   // eslint-disable-line @typescript-eslint/no-explicit-any -- answers read loosely, as in the other checks
const leads = (given: string) => sql(`select count(*) from fo_lead l join fo_person p on p.id = l.person_id where p.given_names = '${given}'`);
const persons = (email: string) => sql(`select count(*) from fo_person where firm_id = '${A}' and email = '${email}'`);

const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") && process.platform !== "darwin" ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {});
const errors: string[] = [];
async function pageAs(t: string, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
  p.on("pageerror", (e) => errors.push(String(e))); return p;
}
async function openPanel(p: Page) {
  await p.goto(`${BASE}/front-office/leads?view=mine`);
  await p.getByRole("heading", { level: 1, name: "Leads" }).waitFor({ timeout: 30_000 });
  await p.locator("[data-add-lead-open]").waitFor({ timeout: 30_000 });   // shown once the signed-in person's keys are read
  await p.locator("[data-add-lead-open]").click();
  await p.getByLabel("First name", { exact: true }).waitFor({ timeout: 20_000 });
}
const fill = async (p: Page, v: { given?: string; family?: string; email?: string; phone?: string; source?: string }) => {
  if (v.given !== undefined) await p.getByLabel("First name", { exact: true }).fill(v.given);
  if (v.family !== undefined) await p.getByLabel("Last name (optional)").fill(v.family);
  if (v.email !== undefined) await p.getByLabel("Email", { exact: true }).fill(v.email);
  if (v.phone !== undefined) await p.getByLabel("Phone", { exact: true }).fill(v.phone);
  if (v.source !== undefined) await p.getByLabel("Source", { exact: true }).fill(v.source);
  // What was typed is still there before anything is pressed (a fresh copy is slow; a wiped field must fail loudly here).
  const now = { given: await p.getByLabel("First name", { exact: true }).inputValue(), email: await p.getByLabel("Email", { exact: true }).inputValue(), source: await p.getByLabel("Source", { exact: true }).inputValue() };
  for (const k of ["given", "email", "source"] as const) if (v[k] !== undefined && now[k] !== v[k]) throw new Error(`fill: ${k} reads "${now[k]}", typed "${v[k]}"`);
};
try {
  // ---------------------------------------------------------------- AL1: the button follows agent/prospect:create
  const o = await pageAs(tok.O);
  await o.goto(`${BASE}/front-office/leads`); await o.getByRole("heading", { level: 1, name: "Leads" }).waitFor({ timeout: 30_000 });
  ok("FO-4al AL1 pass (R1.27): a Case Officer sees Add a lead on Leads", (await o.locator("[data-add-lead-open]").count()) === 1);
  const ro = await pageAs(tok.RO);
  await ro.goto(`${BASE}/front-office/leads`); await ro.getByRole("heading", { level: 1, name: "Leads" }).waitFor({ timeout: 30_000 }); await ro.waitForTimeout(500);
  const roPost = await post(tok.RO, { requestId: randomUUID(), givenNames: `Rook${run}`, email: `rook.${run}@example.org`, source: "Phone call" });
  ok("FO-4al AL1 fail: a Read-only person sees no Add a lead, and the server refuses their add (403), nothing saved", (await ro.locator("[data-add-lead-open]").count()) === 0 && roPost.status === 403 && leads(`Rook${run}`) === "0", roPost.status);

  // ---------------------------------------------------------------- AL2: source required; saved with it
  const ana = `Ana${run}`;
  await openPanel(o);
  await fill(o, { given: ana, family: "Sample", email: `ana.${run}@example.org` });
  await o.getByRole("button", { name: "Save lead" }).click();
  const srcErr = o.locator("[data-add-lead]").getByText("Pick a source.");
  await srcErr.waitFor({ timeout: 10_000 });
  await o.screenshot({ path: join(SHOTS, "fo4al-01-no-source-1440.png"), fullPage: true });
  ok("FO-4al AL2 fail (R1.27, AG-2-4 test 3): Save with no source says \"Pick a source.\" at the field, focus on it, nothing saved",
    leads(ana) === "0" && (await o.getByLabel("Source", { exact: true }).getAttribute("aria-invalid")) === "true" && (await o.getByLabel("Source", { exact: true }).evaluate((e) => e === document.activeElement)));
  const apiNoSource = await post(tok.O, { requestId: randomUUID(), givenNames: ana, email: `ana2.${run}@example.org` });
  ok("FO-4al AL2 fail: the route refuses a lead with no source too (422 on fields.source)", apiNoSource.status === 422 && !!apiNoSource.body?.fields?.source, apiNoSource);
  await fill(o, { source: "Walk-in" });
  // AL5: two clicks in a row make one lead.
  await o.getByRole("button", { name: "Save lead" }).dblclick();
  await o.getByRole("heading", { level: 1, name: new RegExp(ana) }).waitFor({ timeout: 20_000 });
  await o.screenshot({ path: join(SHOTS, "fo4al-02-saved-lead-1440.png"), fullPage: true });
  const [door, source, owner] = sql(`select l.door || '|' || l.source || '|' || coalesce(l.owner_staff_id::text, '-') from fo_lead l join fo_person p on p.id = l.person_id where p.given_names = '${ana}'`).split("|");
  ok("FO-4al AL2 pass (R1.27): saved as a MANUAL lead with source \"Walk-in\", owned by the adder (AG-2-4 rule 8)", door === "MANUAL" && source === "Walk-in" && owner === O.id, { door, source, owner });
  const main = await o.locator("main").innerText();
  ok("FO-4al AL2 pass: the lead's page shows Source Walk-in and the adder as owner", /Source\s*Walk-in/.test(main) && (await o.locator("aside [data-owner]").innerText()).trim().length > 0 && !(await o.locator("aside [data-owner]").innerText()).includes("Nobody"), main.slice(0, 300));
  ok("FO-4al AL5 pass (AG-2-4 test 4): two clicks on Save made one lead", leads(ana) === "1", leads(ana));

  // ---------------------------------------------------------------- AL3: a known person, seen
  const t = o;   // the Case Officer owns Ana's lead, so may open the match
  await openPanel(t);
  await fill(t, { given: `Anna${run}`, email: `ana.${run}@example.org`, source: "Phone call" });
  await t.getByRole("button", { name: "Save lead" }).click();
  await t.locator("[data-known-person]").waitFor({ timeout: 10_000 });
  const line = await t.locator("[data-known-person]").innerText();
  await t.waitForTimeout(300);
  ok("FO-4al AL7 m5: after one Save, when the match arrives, the keyboard is on the choice (the match box)", await t.locator("[data-known-person]").evaluate((e) => e === document.activeElement || e.contains(document.activeElement)), await t.evaluate(() => document.activeElement?.outerHTML.slice(0, 100)));
  await t.screenshot({ path: join(SHOTS, "fo4al-03-known-person-1440.png"), fullPage: true });
  ok("FO-4al AL3 fail (BR-2, AG-2-4 rule 4): the same email shows \"Possible match: <name> (L-…)\" and nothing is saved yet", line.includes(`Possible match: ${ana} Sample (L-`) && leads(`Anna${run}`) === "0" && persons(`ana.${run}@example.org`) === "1", line);
  await t.getByRole("button", { name: "Use existing person" }).click();
  await t.getByRole("heading", { level: 1, name: new RegExp(ana) }).waitFor({ timeout: 20_000 });
  ok("FO-4al AL3 pass (rule 5): Use existing person puts a second lead on the same person, no new person record", leads(ana) === "2" && persons(`ana.${run}@example.org`) === "1");
  await openPanel(t);
  await fill(t, { given: `Anya${run}`, email: `ana.${run}@example.org`, source: "Phone call" });
  await t.getByRole("button", { name: "Save lead" }).click();
  await t.getByRole("button", { name: "Add as new" }).click();
  await t.getByRole("heading", { level: 1, name: new RegExp(`Anya${run}`) }).waitFor({ timeout: 20_000 });
  ok("FO-4al AL3 pass (rule 5): Add as new makes a new person and its lead", leads(`Anya${run}`) === "1" && persons(`ana.${run}@example.org`) === "2");

  // ---------------------------------------------------------------- AL4: a match the adder may not open
  const tLead = await post(tok.T, { requestId: randomUUID(), givenNames: `Hidden${run}`, email: `hidden.${run}@example.org`, source: "Referral" });
  await openPanel(o);
  await fill(o, { given: `Hugo${run}`, email: `hidden.${run}@example.org`, source: "Phone call" });
  await o.getByRole("button", { name: "Save lead" }).click();
  await o.locator("[data-known-person]").waitFor({ timeout: 10_000 });
  const hidden = await o.locator("[data-known-person]").innerText();
  ok("FO-4al AL4 (rule 6): a match the Case Officer may not open shows only the nameless line, no name, no Use existing person",
    tLead.status === 201 && hidden.includes("Possible match with a record you cannot open — ask a manager") && !hidden.includes(`Hidden${run}`) && (await o.getByRole("button", { name: "Use existing person" }).count()) === 0, hidden);
  await o.getByRole("button", { name: "Add as new" }).click();
  await o.getByRole("heading", { level: 1, name: new RegExp(`Hugo${run}`) }).waitFor({ timeout: 20_000 });
  ok("FO-4al AL4: Add as new still works for that person", leads(`Hugo${run}`) === "1");

  // ---------------------------------------------------------------- AL7: the breaker's findings (B1, M2, m3, m4, m5)
  // B1: two clicks on Save lead 250 ms apart for a known email never send "Add as new": the choice is elsewhere.
  await openPanel(o);
  await fill(o, { given: `Dup${run}`, email: `ana.${run}@example.org`, source: "Phone call" });
  const saveBtn = o.getByRole("button", { name: "Save lead" });
  await saveBtn.click(); await o.waitForTimeout(250); await saveBtn.click({ force: true, timeout: 2_000 });   // the second click lands on a disabled button: that is the point
  await o.locator("[data-known-person]").waitFor({ timeout: 10_000 }); await o.waitForTimeout(800);
  ok("FO-4al AL7 B1 fail: two clicks on Save lead for a known person save nothing; the match waits for a choice", leads(`Dup${run}`) === "0" && (await saveBtn.isDisabled()), leads(`Dup${run}`));
  // Review M1 (EXPERIENCE §2.12): at 200 % zoom (720 x 450) the match is scrolled into view and holds the focus.
  const z = await pageAs(tok.O, 720); await z.setViewportSize({ width: 720, height: 450 }); await openPanel(z);
  await fill(z, { given: `Zoom${run}`, email: `ana.${run}@example.org`, source: "Phone call" });
  await z.getByRole("button", { name: "Save lead" }).click();
  await z.locator("[data-known-person]").waitFor({ timeout: 10_000 }); await z.waitForTimeout(400);
  const seen = await z.locator("[data-known-person]").evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: window.innerHeight, focused: e === document.activeElement }; });
  await z.screenshot({ path: join(SHOTS, "fo4al-05-match-200pct-720.png") });
  ok("FO-4al AL7 review M1: at 720 x 450 the match is on screen and focused, nothing saved", seen.top >= 0 && seen.top < seen.h && seen.focused && leads(`Zoom${run}`) === "0", seen);
  // Review S4: Escape on a half-typed panel asks first; dismissing the question keeps what was typed.
  z.once("dialog", (d) => void d.dismiss()); await z.keyboard.press("Escape"); await z.waitForTimeout(300);
  ok("FO-4al AL7 review S4: Escape on a half-typed panel asks, and \"Cancel\" keeps the panel and its words", (await z.locator("[data-add-lead]").count()) === 1 && (await z.getByLabel("First name", { exact: true }).inputValue()) === `Zoom${run}`);
  await z.context().close();
  // M2, m4: the suggestions are words a person typed, once each; a stored code (WEBSITE) is never offered.
  await post(tok.O, { requestId: randomUUID(), givenNames: `Case${run}`, email: `case.${run}@example.org`, source: "phone   CALL" });
  // A web-form lead the Case Officer owns, so the stored code WEBSITE is among the sources they see (review re-check: on a
  // fresh copy there was none, and the test could not fail).
  const webP = sql(`insert into fo_person (id, firm_id, given_names, email, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Webb${run}', 'webb.${run}@example.org', 'test', now()) returning id`);
  sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values (gen_random_uuid(), '${A}', '${webP}', 'WEB_FORM', 'WEBSITE', '${O.id}', 'test', now())`);
  const seenSources = await (await fetch(`${BASE}/api/front-office/leads/sources`, { headers: { authorization: `Bearer ${tok.O}` } })).json() as { sources: string[] };
  ok("FO-4al AL7 M2 setup: the Case Officer's sources include the stored code WEBSITE", seenSources.sources.includes("WEBSITE"), seenSources);
  await openPanel(o);
  const options = await o.locator("#fo-add-lead-sources option").evaluateAll((xs) => xs.map((x) => (x as HTMLOptionElement).value));
  ok("FO-4al AL7 M2 fail: the stored code WEBSITE is not offered as a source", !options.includes("WEBSITE"), options);
  ok("FO-4al AL7 m4: sources told apart only by case or spaces are offered once", options.filter((x) => x.trim().replace(/\s+/g, " ").toLowerCase() === "phone call").length === 1, options);
  // m3: a source the server refuses ("this is required." for emoji only) is said in the panel's words.
  await fill(o, { given: `Emo${run}`, email: `emo.${run}@example.org`, source: "🙂🙂" });
  await o.getByRole("button", { name: "Save lead" }).click();
  await o.locator("[data-add-lead]").getByText("Pick a source.").waitFor({ timeout: 10_000 });
  ok("FO-4al AL7 m3: an emoji-only source is refused as \"Pick a source.\", nothing saved", leads(`Emo${run}`) === "0");

  // ---------------------------------------------------------------- AL6: keyboard, axe, widths
  await openPanel(o);
  const axe = await new AxeBuilder({ page: o }).include("[role=dialog]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  ok("FO-4al AL6: the open panel passes axe (WCAG 2.1 A and AA)", axe.violations.length === 0, axe.violations.map((v) => `${v.id}: ${v.help}`));
  ok("FO-4al AL6: the panel opens on First name", await o.getByLabel("First name", { exact: true }).evaluate((e) => e === document.activeElement));
  const kim = `Kim${run}`;
  await o.keyboard.type(kim); await o.keyboard.press("Tab"); await o.keyboard.type("Sample"); await o.keyboard.press("Tab"); await o.keyboard.type(`kim.${run}@example.org`);
  await o.keyboard.press("Tab"); await o.keyboard.press("Tab"); await o.keyboard.type("Email"); await o.keyboard.press("Enter");
  await o.getByRole("heading", { level: 1, name: new RegExp(kim) }).waitFor({ timeout: 20_000 });
  ok("FO-4al AL6: keyboard only (type, Tab, Enter) adds the lead with source Email", sql(`select l.source from fo_lead l join fo_person p on p.id = l.person_id where p.given_names = '${kim}'`) === "Email");
  for (const w of [375, 1024, 1440]) {
    const p = await pageAs(tok.O, w); await openPanel(p);
    await p.screenshot({ path: join(SHOTS, `fo4al-04-panel-${w}.png`) });
    const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    ok(`FO-4al AL6: no sideways page scroll with the panel open at ${w} px`, !wide);
    await p.context().close();
  }
  ok("FO-4al: no page error", errors.length === 0, errors);
} finally { await browser.close(); }
process.exit(summary() ? 1 : 0);
