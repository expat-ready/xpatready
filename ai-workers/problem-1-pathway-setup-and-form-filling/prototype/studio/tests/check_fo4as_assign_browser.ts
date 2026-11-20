// FO-4 later part (R1.32's screen part; AG-2-13c rules 1-4, 11, 15; AG-2-86; BR-5, BR-10; brief FO-4.md DW17, DW18):
// Assign and Reassign on one lead's screen, the owner history (who and when) and the one-user hiding, against the real
// API (FO-2's `POST leads/:id/assign`, `GET leads/:id/timeline`, `GET leads/assignees`) on an isolated copy.
//   AS1  DW17: a Case Manager assigns an unassigned lead by screens; the picker lists every active person of the firm,
//        whatever their role, and never a deactivated one; the history says who assigned it to whom and when;
//   AS2  a Case Officer (no `agent/prospect:assign`) sees no Assign or Reassign, and the server refuses (403);
//   AS3  Reassign moves an owned lead; a stale reassign (someone changed the owner since the screen was read) is refused
//        with the new owner's name, nothing changes, and the screen shows who has it now;
//   AS4  Take it by screens is recorded the same way ("<name> took it", with the time);
//   AS5  DW18: in a one-user firm, Unassigned leads, the owner column, Take it, Assign, the owner line and the history
//        are not shown;
//   AS4b a deactivated new owner keeps their name in the history, for every reader;
//   AS7  with "everyone sees all" off, assigning a lead away ends on Leads with a word, not on "Lead not found";
//   AS8  when `leads/assignees` fails, the lead page still draws (no endless wait, no request loop);
//   AS6  keyboard only, axe clean with the panel open, no sideways scroll at 375, 1024 and 1440 px.
// Sample rows only; US$0, no model call. Usage, from prototype/:
//   zsh studio/tools/isolated.sh screens_as 4532 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo4as_assign_browser.ts 4532 xr_studio_screens_as
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
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

const PORT = Number(process.argv[2] ?? 4532), DBNAME = process.argv[3] ?? "xr_studio_screens_as", BASE = `http://localhost:${PORT}`;
const SHOTS = join(import.meta.dirname, "..", "..", "..", "product", "screens", "fo-4-sales", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
const firm = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
const A = firm("sample-firm"), SOLO = firm("sample-solo");
const sharing = async (on: boolean) => writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: on, by: "seed:FO-4as-test", workspaceId: await platformAuditWorkspaceId(db as never), reason: "FO-4as" });
await sharing(true);   // AS7 turns it off at the end; a rerun on the same copy starts from "everyone sees all"
const staffOf = (actor: string) => { const [id, email, name] = sql(`select id || '|' || email || '|' || display_name from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email, name }; };
const R = staffOf("user-R"), T = staffOf("user-T"), O = staffOf("user-O"), S = staffOf("user-S");   // Owner, Case Manager, Case Officer (firm A); solo Owner
// A deactivated colleague, made for this run: never offered (AG-2-13c rule 2).
const goneName = `Sample Leaver ${run}`;
sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, status, updated_at) values (gen_random_uuid(), '${A}', 'fo4as-gone-${run}@sample-firm.example.com', '${goneName}', 'fo4as-gone-${run}', 'DEACTIVATED', now())`);
async function signIn(firmKey: string, email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tok = { R: await signIn("sample-firm", R.email), T: await signIn("sample-firm", T.email), O: await signIn("sample-firm", O.email), S: await signIn("sample-solo", S.email) };
const api = async (t: string, method: string, path: string, body?: unknown) => { const r = await fetch(`${BASE}/api/front-office${path}`, { method, headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) as any }; };   // eslint-disable-line @typescript-eslint/no-explicit-any -- answers read loosely, as in the other checks
let n = 0;
/** A Sample unassigned web lead in a firm. */
const lead = (firmId: string, given: string) => {
  const p = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firmId}', '${given}', 'Sample', 'fo4as.${++n}.${run}@example.org', 'test', now()) returning id`);
  const id = sql(`insert into fo_lead (id, firm_id, person_id, door, source, created_by, updated_at) values (gen_random_uuid(), '${firmId}', '${p}', 'MANUAL', 'Phone call', 'test', now()) returning id`);
  return { id, name: `${given} Sample`, number: sql(`select number from fo_lead where id = '${id}'`) };
};
const ownerOf = (id: string) => sql(`select coalesce(owner_staff_id::text, '-') from fo_lead where id = '${id}'`);

const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") && process.platform !== "darwin" ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {});
const errors: string[] = [];
async function pageAs(t: string, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
  p.on("pageerror", (e) => errors.push(String(e))); return p;
}
async function openLead(p: Page, l: { id: string; name: string }) {
  await p.goto(`${BASE}/front-office/leads/${l.id}`);
  await p.getByRole("heading", { level: 1, name: l.name }).waitFor({ timeout: 30_000 });
}
const history = async (p: Page) => (await p.locator("[data-owner-history]").innerText()).trim();
const assignTo = async (p: Page, verb: "Assign" | "Reassign", who: string) => {
  await p.locator("[data-assign-open]").click(); await p.locator("[data-assign-choices]").waitFor({ timeout: 10_000 });
  await p.getByLabel(who, { exact: true }).check(); await p.getByRole("dialog").getByRole("button", { name: verb, exact: true }).click();
};
try {
  // ---------------------------------------------------------------- AS1: assign by screens (DW17)
  const a1 = lead(A, `Ada${run}`);
  const t = await pageAs(tok.T);
  await openLead(t, a1);
  ok("FO-4as AS1: an unassigned lead offers the Case Manager \"Assign\" (not Reassign)", (await t.locator("[data-assign-open]").innerText()).trim() === "Assign");
  await t.locator("[data-assign-open]").click(); await t.locator("[data-assign-choices]").waitFor({ timeout: 10_000 });
  const offered = (await t.locator("[data-assign-choices] label").allInnerTexts()).map((x) => x.trim()).sort();
  const active = rawSql(`select display_name from platform_staff where firm_id = '${A}' and status = 'ACTIVE' order by 1`).split("\n").map((x) => x.trim()).filter(Boolean).sort();
  await t.screenshot({ path: join(SHOTS, "fo4as-01-assign-panel-1440.png"), fullPage: true });
  ok("FO-4as AS1 pass (DW17, AG-2-13c rule 11): the picker lists every active person of the firm, any role", JSON.stringify(offered) === JSON.stringify(active), { offered, active });
  ok("FO-4as AS1 fail (rule 2): a deactivated colleague is never offered", !offered.includes(goneName));
  await t.getByRole("dialog").getByRole("button", { name: "Assign", exact: true }).click();
  ok("FO-4as AS1 fail: Assign with nobody chosen says \"Choose who gets the lead.\" and changes nothing", (await t.getByRole("dialog").innerText()).includes("Choose who gets the lead.") && ownerOf(a1.id) === "-");
  await t.getByLabel(O.name, { exact: true }).check(); await t.getByRole("dialog").getByRole("button", { name: "Assign", exact: true }).click();
  await t.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });
  await t.locator("aside [data-owner]", { hasText: O.name }).waitFor({ timeout: 10_000 });
  await t.locator("[data-owner-history] li", { hasText: "assigned it to" }).waitFor({ timeout: 10_000 });
  const h1 = await history(t);
  await t.screenshot({ path: join(SHOTS, "fo4as-02-assigned-history-1440.png"), fullPage: true });
  ok("FO-4as AS1 pass (rule 3): the lead is the Case Officer's, and the rail says so", ownerOf(a1.id) === O.id);
  ok("FO-4as AS1 pass (rule 4): the owner history reads \"<Case Manager> assigned it to <Case Officer>\" with the time", h1.includes(`${T.name} assigned it to ${O.name}`) && /\d{4}/.test(h1), h1);
  ok("FO-4as AS1 pass: underneath, one assign audit line with who, from whom and to whom", sql(`select count(*) from audit_event where entity = 'fo_lead' and entity_key = '${a1.id}' and action = 'lead.taken' and actor = 'staff:${T.id}' and detail->>'via' = 'ASSIGN' and detail->>'ownerStaffId' = '${O.id}' and detail->>'previousOwnerStaffId' is null`) === "1");

  // ---------------------------------------------------------------- AS2: no key, no button
  const o = await pageAs(tok.O);
  await openLead(o, a1);
  const no = await api(tok.O, "POST", `/leads/${a1.id}/assign`, { staffId: R.id, expectedOwnerStaffId: O.id });
  ok("FO-4as AS2 (DW17, rule 1): a Case Officer sees no Assign or Reassign, and the server refuses (403), owner unchanged", (await o.locator("[data-assign-open]").count()) === 0 && no.status === 403 && ownerOf(a1.id) === O.id, no.status);

  // ---------------------------------------------------------------- AS3: reassign, and a stale reassign
  await openLead(t, a1);
  ok("FO-4as AS3: an owned lead offers \"Reassign\"", (await t.locator("[data-assign-open]").innerText()).trim() === "Reassign");
  await assignTo(t, "Reassign", R.name);
  await t.locator("aside [data-owner]", { hasText: R.name }).waitFor({ timeout: 10_000 });
  await t.locator("[data-owner-history] li", { hasText: `assigned it to ${R.name}` }).waitFor({ timeout: 10_000 });
  ok("FO-4as AS3 pass: Reassign moves the lead to the Owner; the history keeps both lines in order", ownerOf(a1.id) === R.id && (await history(t)).indexOf(`assigned it to ${O.name}`) < (await history(t)).indexOf(`assigned it to ${R.name}`), await history(t));
  // The screen read the Owner as owner; meanwhile the Owner hands it back to the Case Officer.
  const meanwhile = await api(tok.R, "POST", `/leads/${a1.id}/assign`, { staffId: O.id, expectedOwnerStaffId: R.id });
  await assignTo(t, "Reassign", T.name);
  await t.getByRole("dialog").getByText("already has this lead").waitFor({ timeout: 10_000 });
  const said = await t.getByRole("dialog").innerText();
  await t.screenshot({ path: join(SHOTS, "fo4as-03-stale-reassign-1440.png"), fullPage: true });
  ok("FO-4as AS3 fail (BR-5): a stale reassign is refused with \"<Case Officer> already has this lead.\" and nothing changes", meanwhile.status === 200 && said.includes(`${O.name} already has this lead.`) && ownerOf(a1.id) === O.id, said.slice(0, 200));
  await t.keyboard.press("Escape");
  await t.locator("aside [data-owner]", { hasText: O.name }).waitFor({ timeout: 10_000 });
  ok("FO-4as AS3: the screen now shows who has it", (await t.locator("aside [data-owner]").innerText()).includes(O.name));

  // ---------------------------------------------------------------- AS4: Take it is recorded with who and when
  const a4 = lead(A, `Taj${run}`);
  await openLead(o, a4);
  await o.getByRole("button", { name: "Take it" }).click();
  await o.locator("[data-owner-history] li", { hasText: "took it" }).waitFor({ timeout: 10_000 });
  ok("FO-4as AS4 (AG-2-86, rule 4): Take it by screens makes the Case Officer the owner, and the history reads \"<name> took it\" with the time", ownerOf(a4.id) === O.id && (await history(o)).includes(`${O.name} took it`), await history(o));

  // ---------------------------------------------------------------- AS4b: a deactivated assignee keeps their name
  const tmpName = `Sample Temp ${run}`;
  const tmp = sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', 'fo4as-tmp-${run}@sample-firm.example.com', '${tmpName}', 'fo4as-tmp-${run}', now()) returning id`);
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${tmp}', 'CASE_OFFICER', 'seed:FO-4as-test')`);
  const a4b = lead(A, `Tem${run}`);
  const toTmp = await api(tok.T, "POST", `/leads/${a4b.id}/assign`, { staffId: tmp, expectedOwnerStaffId: null });
  sql(`update platform_staff set status = 'DEACTIVATED' where id = '${tmp}'`);
  await openLead(o, a4b);
  await o.locator("[data-owner-history] li", { hasText: "assigned it to" }).waitFor({ timeout: 10_000 });
  ok("FO-4as AS4b (rule 4, break 2): after the new owner leaves, even a Case Officer reads \"assigned it to (Inactive) <name>\", never \"A colleague\"", toTmp.status === 200 && (await history(o)).includes(`assigned it to (Inactive) ${tmpName}`) && !(await history(o)).includes("A colleague"), await history(o));

  // ---------------------------------------------------------------- AS5: one-user firm (DW18)
  const solo = await api(tok.S, "GET", "/leads/assignees");
  const s1 = lead(SOLO, `Sol${run}`);
  const s = await pageAs(tok.S);
  // Leads opened from the menu (no ?view): the badge stays hidden while the page works out its first chip (re-review M1).
  await s.goto(`${BASE}/front-office/leads`); await s.getByRole("heading", { level: 1, name: "Leads" }).waitFor({ timeout: 30_000 }); await s.waitForTimeout(1_500);
  ok("FO-4as AS5 (re-review M1): Leads opened from the menu in a one-user firm shows no \"n unassigned\" badge", (await s.locator("[data-unassigned-badge]").count()) === 0);
  await s.goto(`${BASE}/front-office/leads?view=all`);
  await s.locator(`tr[data-lead-row="${s1.number}"]`).waitFor({ timeout: 30_000 });
  const heads = await s.locator("table th").allInnerTexts();
  await s.screenshot({ path: join(SHOTS, "fo4as-04-one-user-leads-1440.png"), fullPage: true });
  ok("FO-4as AS5 (DW18, X-4): in a one-user firm Leads shows no Unassigned leads chip, no Owner column and no Take it",
    solo.body?.oneUser === true && (await s.locator('[data-chip="unassigned"]').count()) === 0 && !heads.some((h) => h.trim() === "Owner") && (await s.getByRole("button", { name: /^Take it/ }).count()) === 0, { oneUser: solo.body?.oneUser, heads });
  await s.goto(`${BASE}/front-office/leads/${s1.id}`);
  await s.getByRole("heading", { level: 1, name: s1.name }).waitFor({ timeout: 30_000 }); await s.waitForTimeout(800);
  ok("FO-4as AS5 (review M1): the one-user firm's menu shows no \"n unassigned\" badge, though an unowned lead exists", (await s.locator("[data-unassigned-badge]").count()) === 0 && sql(`select count(*) from fo_lead where firm_id = '${SOLO}' and owner_staff_id is null and state = 'OPEN'`) !== "0");
  ok("FO-4as AS5: on the lead, no owner line, Take it, Assign or owner history", (await s.locator("aside [data-owner]").count()) === 0 && (await s.getByRole("button", { name: /Take it|Assign|Reassign/ }).count()) === 0 && (await s.locator("[data-owner-history]").count()) === 0);
  lead(A, `Wait${run}`); await openLead(t, a1); await t.locator("[data-unassigned-badge]").waitFor({ timeout: 10_000 }); await t.locator("[data-owner-history]").waitFor({ timeout: 10_000 });
  ok("FO-4as AS5 fail side: the firm of three (firm A) does show them, badge included (the hiding is the one-user rule, not a lost button)", (await t.locator("[data-owner-history]").count()) === 1 && (await t.locator("[data-assign-open]").count()) === 1 && (await t.locator("[data-unassigned-badge]").count()) === 1);

  // ---------------------------------------------------------------- AS6: keyboard, axe, widths
  await openLead(t, a1);
  await t.locator("[data-assign-open]").focus(); await t.keyboard.press("Enter");
  await t.locator("[data-assign-choices]").waitFor({ timeout: 10_000 });
  const axe = await new AxeBuilder({ page: t }).include("[role=dialog]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  ok("FO-4as AS6: the open Assign panel passes axe (WCAG 2.1 A and AA)", axe.violations.length === 0, axe.violations.map((v) => `${v.id}: ${v.help}`));
  await t.getByLabel(T.name, { exact: true }).focus(); await t.keyboard.press("Space");
  await t.getByRole("dialog").getByRole("button", { name: "Reassign", exact: true }).focus(); await t.keyboard.press("Enter");
  await t.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });
  await t.locator("aside [data-owner]", { hasText: T.name }).waitFor({ timeout: 10_000 });
  const focusBack = await t.waitForFunction(() => document.activeElement?.hasAttribute("data-assign-open") ?? false, null, { timeout: 5_000 }).then(() => true, () => false);
  ok("FO-4as AS6: keyboard only (Enter, Space, Enter) reassigns, and focus returns to Reassign", ownerOf(a1.id) === T.id && focusBack, { owner: ownerOf(a1.id), focus: await t.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)) });
  for (const w of [375, 1024, 1440]) {
    const p = await pageAs(tok.T, w); await openLead(p, a1);
    await p.locator("[data-assign-open]").click(); await p.locator("[data-assign-choices]").waitFor({ timeout: 10_000 });
    await p.screenshot({ path: join(SHOTS, `fo4as-05-panel-${w}.png`) });
    ok(`FO-4as AS6: no sideways page scroll with the Assign panel open at ${w} px`, !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
    await p.context().close();
  }
  // ---------------------------------------------------------------- AS8: the colleague list fails (re-review N1)
  const f = await pageAs(tok.T); let asked = 0;
  await f.route("**/api/front-office/leads/assignees", (r) => { asked++; return r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ status: 500, detail: "Sample outage" }) }); });
  await f.goto(`${BASE}/front-office/leads/${a1.id}`);
  const drew = await f.getByRole("heading", { level: 1, name: a1.name }).waitFor({ timeout: 15_000 }).then(() => true, () => false);
  await f.waitForTimeout(3_000);
  ok("FO-4as AS8 (re-review N1): when the colleague list fails, the lead page still draws, with its owner line, and asks for the list only a few times", drew && (await f.locator("aside [data-owner]").count()) === 1 && asked <= 3, { drew, asked });
  await f.context().close();

  // ---------------------------------------------------------------- AS7: assigned away with sharing off (break 3b)
  await sharing(false);
  const a7 = lead(A, `Off${run}`);
  await openLead(t, a7);
  await assignTo(t, "Assign", O.name);
  await t.getByRole("heading", { level: 1, name: "Leads" }).waitFor({ timeout: 15_000 });
  ok("FO-4as AS7 (rule 1, every sharing mode): with sharing off, assigning away is done and the Case Manager is taken back to Leads and told, never left on \"Lead not found\"",
    ownerOf(a7.id) === O.id && (await t.getByText("You no longer see it.").count()) >= 1 && (await t.getByText("Lead not found").count()) === 0);
  await sharing(true);
  ok("FO-4as: no page error", errors.length === 0, errors);
} finally { await browser.close(); await db.$disconnect(); }
process.exit(summary() ? 1 : 0);
