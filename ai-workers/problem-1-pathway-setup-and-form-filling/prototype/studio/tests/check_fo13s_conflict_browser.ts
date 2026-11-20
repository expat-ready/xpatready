// FO-13s part 2 PR A (concept screens/FO-13s2-conflict/concept.md rev 2, approved; challenge M1-M4, m1-m10): the
// Conflict check panel on the prospect page in a real browser against FO-13c's real routes (no fake API), each rule a pass
// and a fail: BR-5 the status is the gate's refusal before a check, "Cleared" with the checker's name after a No conflict
// check (M1), "Potential conflict" (never Cleared) after a potential one (M2), the stale refusal after the email changes;
// the Convert dialog's reason before the click and its link only for a refusal a check fixes (M2, m5); BR-3 hidden
// matches turn the result off and record for confirmation; BR-4 a potential conflict needs its disclosure; a result is
// needed; BR-7 a read-only user sees no Run a check. Also keyboard (open, Escape, focus back), axe-core (WCAG 2.2 AA), no
// sideways scroll and screenshots at 375, 1024 and 1440 px. Seeds the Sample firms itself. US$0, no model call.
//   zsh studio/tools/isolated.sh screens_fo13s2 4562 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo13s_conflict_browser.ts 4562 xr_studio_screens_fo13s2
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
const PORT = Number(process.argv[2] ?? 4562), DBNAME = process.argv[3] ?? "xr_studio_screens_fo13s2";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "FO-13s2-conflict", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`), WS = await platformAuditWorkspaceId(db);
const seesAll = (value: boolean) => writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value, by: "seed:FO-13s2-test", workspaceId: WS, reason: "FO-13s part 2 test" });
await seesAll(true);
const staffOf = (actor: string) => { const [id, email, name] = sql(`select id || '|' || email || '|' || display_name from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email, name }; };
const R = staffOf("user-R"), T = staffOf("user-T"), O = staffOf("user-O");   // Owner + Case Manager, Case Manager, Case Officer
const roEmail = `fo13s2-reader-${run}@sample-firm.example.com`;
const RO = { id: sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', '${roEmail}', 'Sample reader ${run}', 'fo13s2-reader-${run}', now()) returning id`), email: roEmail };
sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${RO.id}', 'READ_ONLY', 'seed:FO-13s2-test')`);
const adEmail = `fo13s2-admin-${run}@sample-firm.example.com`;   // PR B: the firm's Admin confirms
const AD = { id: sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', '${adEmail}', 'Sample admin ${run}', 'fo13s2-admin-${run}', now()) returning id`), email: adEmail };
sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${AD.id}', 'ADMIN', 'seed:FO-13s2-test')`);
let n = 0;
/** A person with a lead (owned by `leadOwner`), and an Individual prospect owned by `owner` (Engaged). */
const person = (given: string, email: string, leadOwner: string) => {
  const pid = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', '${given}', 'Sample', '${email}', 'test', now()) returning id`);
  sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values (gen_random_uuid(), '${A}', '${pid}', 'MANUAL', 'WEBSITE', '${leadOwner}', 'test', now())`);
  return pid;
};
const prospect = (given: string, owner: string) => {
  const pid = person(`${given}${run}`, `fo13s2.${++n}.${run}@example.com`, owner);
  sql(`update fo_lead set state = 'ENGAGED', engaged_at = now(), engaged_by = 'test' where person_id = '${pid}'`);   // main's fo_prospect_lead_engaged: the lead first
  const id = sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    select gen_random_uuid(), '${A}', l.id, 'INDIVIDUAL', (select id from fo_stage where firm_id = '${A}' and pipeline = 'INDIVIDUAL' and key = 'ENGAGED'), '${pid}', '${pid}', '${owner}', 'test', now() from fo_lead l where l.person_id = '${pid}' returning id`);
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${id}'`);
  return { id, personId: pid, email: sql(`select email from fo_person where id = '${pid}'`) };
};
const checks = (prospectId: string) => Number(sql(`select count(*) from fo_conflict_check where prospect_id = '${prospectId}'`));
async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tok = { R: await signIn(R.email), T: await signIn(T.email), RO: await signIn(RO.email), AD: await signIn(AD.email) };
const browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function pageAs(t: string, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
  p.on("pageerror", (e) => errors.push(String(e))); return p;
}
const panel = (p: Page) => p.locator("[data-conflict-panel]");
const status = (p: Page) => panel(p).locator("[data-conflict-status]");
const open = async (p: Page, id: string) => { await p.goto(`${BASE}/front-office/prospects/${id}`); await status(p).waitFor({ timeout: 30_000 }); };
const drawer = (p: Page) => p.getByRole("dialog", { name: "Run a conflict check" });
const runCheck = async (p: Page) => { await panel(p).getByRole("button", { name: "Run a check" }).click(); await drawer(p).waitFor(); await drawer(p).locator("[data-searched]").waitFor({ timeout: 15_000 }); };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const axe = async (p: Page, where: string, scope = "[data-conflict-panel], [role=dialog]") => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).include(scope).analyze(); const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`FO-13s2 axe-core (WCAG 2.2 AA): no serious or critical finding — ${where}`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes.map((x) => x.target.join(" ")).join(", ")}`)); };

try {
  // ---------------------------------------------------- BR-5 before a check, the Convert dialog's reason and link (m5, M2)
  const ana = prospect("Ana", R.id);
  person(`Other${run}`, ana.email, R.id);   // a lead with the same email: a match the Owner may open
  const r = await pageAs(tok.R);
  await open(r, ana.id);
  ok("FO-13s2 BR-5 fail: with no check the status is the gate's refusal, word for word (CONFLICT_CHECK_REQUIRED)", (await status(r).getAttribute("data-conflict-status")) === "CONFLICT_CHECK_REQUIRED" && /Record a conflict-of-interest check for this client first/.test(await status(r).innerText()));
  await shot(r, "no-check-1440"); await axe(r, "the prospect page, no check");
  await r.getByRole("button", { name: "Convert to client" }).click();
  const conv = r.getByRole("dialog", { name: /Convert .* to a client\?/ });
  ok("FO-13s2 m5 pass: the Convert dialog says the gate's reason before the click, with Go to the conflict check, and no \"Work can start\"",
    await conv.locator('[data-convert-conflict="CONFLICT_CHECK_REQUIRED"]').isVisible() && await conv.locator("[data-go-conflict]").isVisible() && !(await conv.innerText()).includes("Work can start"));
  await conv.locator("[data-go-conflict]").click();
  await r.waitForFunction(() => document.activeElement?.id === "fo-conflict");
  ok("FO-13s2 m5 pass: Go to the conflict check closes the dialog and takes focus to the section", !(await conv.isVisible()));

  // ---------------------------------------------------- the result is needed; No conflict; BR-5 Cleared with the name (M1)
  await runCheck(r);
  ok("FO-13s2 BR-2 pass: the panel searched the client's own details (shown, never asked) and lists the same-email lead", (await drawer(r).locator("[data-searched]").innerText()).includes(ana.email) && (await drawer(r).locator("[data-match]").count()) >= 1);
  await shot(r, "run-check-1440"); await axe(r, "Run a conflict check");
  await drawer(r).getByRole("button", { name: "Save check" }).click();
  await drawer(r).locator("#fo-conflict-result-error").waitFor({ timeout: 10_000 });
  const noResult = await drawer(r).innerText();
  ok("FO-13s2 fail (review M1): Save with no result says it in plain words on Result and in the summary (no code), focus on Result, nothing stored",
    noResult.includes("Choose a result: No conflict, Potential conflict or Conflict: the firm cannot act.") && !/NO_CONFLICT|POTENTIAL_CONFLICT/.test(noResult) && await drawer(r).locator("[data-error-summary]").isVisible()
    && await drawer(r).locator('fieldset[aria-invalid="true"]').evaluate((el) => el === document.activeElement) && checks(ana.id) === 0);
  await drawer(r).getByLabel("No conflict").check();
  await drawer(r).getByRole("button", { name: "Save check" }).click();
  await status(r).and(r.locator('[data-conflict-status="CLEARED"]')).waitFor({ timeout: 15_000 });
  ok("FO-13s2 BR-5 / M1 pass: after a No conflict check the status is Cleared with the checker's name, and the history names who checked",
    (await status(r).innerText()).includes(`Cleared: no conflict found · ${R.name}`) && (await panel(r).locator("[data-checked-by]").first().innerText()) === R.name && checks(ana.id) === 1);
  await shot(r, "cleared-1440");
  await panel(r).locator("[data-result]").first().hover();
  const tip = await r.locator("[data-result-tip]").first().innerText({ timeout: 5_000 }).catch(() => "");
  ok("FO-13s2 BIC-14 pass (review M3): the result chip's tooltip says what it means for Convert and the retainer", /Convert and the retainer may go ahead/.test(tip), tip);
  await r.getByRole("button", { name: "Convert to client" }).click();
  ok("FO-13s2 m5 fail: with a clearing check the Convert dialog shows no conflict reason", (await conv.locator("[data-convert-conflict]").count()) === 0);
  await conv.getByRole("button", { name: "Yes, convert to client" }).click();
  await r.locator("[data-stage-now]", { hasText: "Won" }).waitFor({ timeout: 15_000 });
  ok("FO-13s2 pass (R1.108): with the recorded check, Convert makes the client", sql(`select s.kind from fo_prospect p join fo_stage s on s.id = p.stage_id where p.id = '${ana.id}'`) === "WON");

  // ---------------------------------------------------- BR-4 the disclosure; M2 a potential conflict is never "Cleared"
  const bea = prospect("Bea", R.id);
  await open(r, bea.id); await runCheck(r);
  await drawer(r).getByLabel("Potential conflict").check();
  await drawer(r).getByRole("button", { name: "Save check" }).click();
  await drawer(r).getByLabel("Disclosure").and(r.locator('[aria-invalid="true"]')).waitFor({ timeout: 10_000 });
  ok("FO-13s2 BR-4 fail: a potential conflict without its disclosure shows the server's words on Disclosure, nothing stored", checks(bea.id) === 0);
  await drawer(r).getByLabel("Disclosure").fill("We acted for the client's employer in 2025 (Sample).");
  await drawer(r).getByRole("button", { name: "Save check" }).click();
  await r.locator('[data-conflict-status="POTENTIAL"]').waitFor({ timeout: 15_000 });
  ok("FO-13s2 M2 pass: after a potential conflict the status says so and never \"Cleared\"; the disclosure is listed", !(await status(r).innerText()).includes("Cleared") && await panel(r).locator("[data-disclosure]").isVisible());
  await r.getByRole("button", { name: "Convert to client" }).click();
  await conv.getByRole("button", { name: "Yes, convert to client" }).click();
  await conv.getByRole("alert").first().waitFor({ timeout: 10_000 });
  ok("FO-13s2 M2 fail: Convert refused for the consent (the server's words) shows no Go to the conflict check (its fix is the retainer)", (await conv.locator("[data-go-conflict]").count()) === 0 && /written consent/.test(await conv.innerText()));
  await r.keyboard.press("Escape");

  // ---------------------------------------------------- BR-5 stale: the email changed after the check
  const cyd = prospect("Cyd", R.id);
  await open(r, cyd.id); await runCheck(r); await drawer(r).getByLabel("No conflict").check(); await drawer(r).getByRole("button", { name: "Save check" }).click();
  await r.locator('[data-conflict-status="CLEARED"]').waitFor({ timeout: 15_000 });
  sql(`update fo_person set email = 'cyd.changed.${run}@example.com' where id = '${cyd.personId}'`);
  await r.reload(); await status(r).waitFor();
  ok("FO-13s2 BR-5 fail: the client's email changed after the check → the status is the stale refusal (a new check is needed)", (await status(r).getAttribute("data-conflict-status")) === "CONFLICT_CHECK_STALE" && /new check/.test(await status(r).innerText()));

  // ---------------------------------------------------- review M2: every opening searches afresh (never the last answer)
  const eve = prospect("Eve", R.id);
  await open(r, eve.id); await runCheck(r);
  const before = await drawer(r).locator("[data-match]").count();
  await drawer(r).getByRole("button", { name: "Cancel" }).click(); await drawer(r).waitFor({ state: "hidden" });
  person(`Late${run}`, eve.email, R.id);   // a lead with the client's email arrives meanwhile
  await panel(r).getByRole("button", { name: "Run a check" }).click(); await drawer(r).locator("[data-searched]").waitFor({ timeout: 15_000 });
  ok("FO-13s2 M2 pass/fail: reopened at once, the panel searches again and lists the new match (it had none before)", before === 0 && (await drawer(r).getByText(`Late${run} Sample`).count()) === 1, before);
  await drawer(r).getByRole("button", { name: "Cancel" }).click();
  // m6: a Corporate prospect is searched by its company's name only, and says so.
  const coP = person(`Corp${run}`, `fo13s2.corp.${run}@example.com`, R.id), CO = sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Maple ${run} Ltd', 'maple ${run}', 'staff:${R.id}', now()) returning id`);
  sql(`update fo_lead set state = 'ENGAGED', engaged_at = now(), engaged_by = 'test' where person_id = '${coP}'; insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${CO}', '${coP}', 'PRIMARY', 'test')`);
  const coX = sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_company_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    select gen_random_uuid(), '${A}', l.id, 'CORPORATE', (select id from fo_stage where firm_id = '${A}' and pipeline = 'CORPORATE' and key = 'ENGAGED'), '${CO}', '${coP}', '${R.id}', 'test', now() from fo_lead l where l.person_id = '${coP}' returning id`);
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${coX}'`);
  await open(r, coX); await runCheck(r);
  ok("FO-13s2 m6 pass: a Corporate prospect's check searches the company's name and says a company is searched by its name only",
    (await drawer(r).locator("[data-searched]").innerText()).includes(`Maple ${run} Ltd`) && (await drawer(r).getByText("A company is searched by its name only.").count()) === 1);
  await drawer(r).getByRole("button", { name: "Cancel" }).click();

  // ---------------------------------------------------- BR-3 hidden matches: a Case Manager records for confirmation
  await seesAll(false);
  const dee = prospect("Dee", T.id);
  person(`Hidden${run}`, dee.email, O.id);   // the Case Officer's lead: hidden from the Case Manager
  const t = await pageAs(tok.T);
  await open(t, dee.id); await runCheck(t);
  ok("FO-13s2 BR-3 pass: a hidden match is counted with the server's line, never named; the result is off and the button records for confirmation",
    await drawer(t).locator("[data-hidden-line]").isVisible() && !(await drawer(t).innerText()).includes(`Hidden${run}`) && await drawer(t).getByLabel("No conflict").isDisabled()
    && await drawer(t).getByRole("button", { name: "Record for confirmation" }).isVisible());
  await shot(t, "hidden-1440"); await axe(t, "Run a check with a hidden match");
  await drawer(t).getByRole("button", { name: "Record for confirmation" }).click();
  await t.locator('[data-conflict-status="CONFLICT_CHECK_UNCONFIRMED"]').waitFor({ timeout: 15_000 });
  ok("FO-13s2 BR-3 fail: the check is stored with no result and the status waits for a manager's confirmation", sql(`select coalesce(result::text, 'none') from fo_conflict_check where prospect_id = '${dee.id}'`) === "none");

  // ---------------------------------------------------- BR-8 / m7 (PR B): the confirm page by link
  const link = await panel(t).locator("[data-waiting-link] a").getAttribute("href");
  ok("FO-13s2 BR-8 pass: the waiting check shows the link to send to a manager", !!link && /^\/front-office\/conflict-checks\/[0-9a-f-]{36}$/.test(link ?? ""), link);
  await t.goto(`${BASE}${link}`); await t.locator("[data-confirm-refused]").waitFor({ timeout: 30_000 });
  ok("FO-13s2 m7 fail: the checker opening the link gets the server's sentence, and no Confirm", /waiting for your confirmation/.test(await t.locator("[data-confirm-refused]").innerText()) && (await t.locator("[data-confirm-check]").count()) === 0);
  const ad = await pageAs(tok.AD);
  await ad.goto(`${BASE}${link}`); await ad.locator("[data-confirm-check]").waitFor({ timeout: 30_000 });
  ok("FO-13s2 BR-8 pass: the Admin sees the check (who and when, by name) and the hidden match by name, searched again", (await ad.locator("[data-checked-by]").innerText()).includes(T.name) && (await ad.getByText(`Hidden${run} Sample`).count()) >= 1);
  await shot(ad, "confirm-1440"); await axe(ad, "the confirm page", "main");
  await ad.locator("[data-confirm-check]").click();
  await ad.getByRole("alert").first().waitFor({ timeout: 10_000 });
  ok("FO-13s2 m7 fail: Confirm with no result shows the server's words, nothing confirmed", sql(`select coalesce(confirmed_by::text, 'none') from fo_conflict_check where prospect_id = '${dee.id}'`) === "none");
  await ad.getByLabel("No conflict").check(); await ad.locator("[data-confirm-check]").click();
  await ad.locator("[data-confirmed]").waitFor({ timeout: 15_000 });
  ok("FO-13s2 m7 pass: after Confirm the page says so, with no link to the prospect the Admin may not open", /Check confirmed: No conflict/.test(await ad.locator("[data-confirmed]").innerText()) && (await ad.locator(`a[href*="/front-office/prospects/"]`).count()) === 0);
  await t.goto(`${BASE}/front-office/prospects/${dee.id}`); await t.locator('[data-conflict-status="CLEARED"]').waitFor({ timeout: 30_000 });
  ok("FO-13s2 BR-8 pass: the checker's page is Cleared, naming who confirmed", (await panel(t).locator("[data-counts]").first().innerText()).includes("confirmed by Sample admin"));
  await ad.goto(`${BASE}${link}`); await ad.locator("[data-confirm-refused]").waitFor({ timeout: 30_000 });
  ok("FO-13s2 m7 fail: the link once confirmed answers the server's sentence (nothing waits)", (await ad.locator("[data-confirm-check]").count()) === 0);
  await seesAll(true);

  // ---------------------------------------------------- BR-7 keys; keyboard; widths
  const ro = await pageAs(tok.RO);
  await open(ro, ana.id);
  ok("FO-13s2 BR-7 fail/pass: a read-only user sees the status and history but no Run a check, and one line says why", (await panel(ro).getByRole("button", { name: "Run a check" }).count()) === 0 && await panel(ro).locator("[data-why-no-run]").isVisible());
  await open(r, bea.id);
  const run1 = panel(r).getByRole("button", { name: "Run a check" });
  await run1.focus(); await r.keyboard.press("Enter"); await drawer(r).waitFor(); await r.keyboard.press("Escape"); await drawer(r).waitFor({ state: "hidden" });
  const back = await r.waitForFunction(() => (document.activeElement as HTMLElement | null)?.dataset?.runCheck !== undefined, undefined, { timeout: 3_000 }).then(() => true, () => false);
  ok("FO-13s2 keyboard: Run a check opens with Enter, closes with Escape, and focus returns to the button", back);
  for (const w of [375, 1024, 1440]) {
    const p = await pageAs(tok.R, w); await open(p, ana.id);
    ok(`FO-13s2 ${w} px: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await shot(p, `prospect-${w}`); await p.context().close();
  }
  ok("FO-13s2: no page error", errors.length === 0, errors);
} catch (e) {
  ok(`FO-13s2: the run stopped — ${String((e as Error)?.stack ?? e).slice(0, 600)}`, false);
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
