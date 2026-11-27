// FO-4 part 1 (brief lead-b-briefs/FO-4.md at 9ebb5da30; concept fo-4-sales r2; BR-1..BR-5, BR-10; AG-2-5, -13c, -84, -86,
// -94): the sales screens in a real browser against FO-2 part 1's real routes (no fake API): DW1, DW2, DW3, DW4, DW6, DW7
// (brief wording on each check), each a pass and a fail; break S1-S3; a keyboard-only Take it; axe-core (WCAG 2.2 AA);
// no sideways scroll; screenshots at 375, 1024, 1440 px. Seeds the Sample firms itself (PF-3, then FO-1a). US$0.
//   zsh studio/tools/isolated.sh screens_fo4 4524 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo4_sales_browser.ts 4524 xr_studio_screens_fo4
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4524), DBNAME = process.argv[3] ?? "xr_studio_screens_fo4";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "fo-4-sales", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();   // psql prints "INSERT 0 1" after a RETURNING row
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
ok("FO-4 setup: the Sample firm and its front office are seeded", !!A && fo.failed.length === 0, fo.failed);
const consent = new ConsentStore(auditEvent);
const wording = await db.$transaction((tx) => consent.publishWording(tx, { firmId: A, channel: "EMAIL", purpose: "MARKETING", locale: "en", text: "Send me news and offers from Sample Firm by email. I can stop at any time. (Sample; Unconfirmed: no counsel)", by: "seed:FO-4-test" }));
const token = sql(`update fo_web_form set enabled = true, consent_wording_version_id = '${wording.id}', thank_you_text = 'Thank you. We will be in touch within one working day. (Sample)' where firm_id = '${A}' returning public_token`);
if (!sql(`select 1 from fo_service where firm_id = '${A}' and label = 'Work permit (Sample)'`)) sql(`insert into fo_service (firm_id, label, sort_order, created_by) values ('${A}', 'Work permit (Sample)', 1, 'seed:FO-4-test')`);
const platformWs = await platformAuditWorkspaceId(db);
const seesAll = (value: boolean) => writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value, by: "seed:FO-4-test", workspaceId: platformWs, reason: "FO-4 test" });
await seesAll(false);   // AG-2-13c rule 9: a Case Officer then sees only their own and unassigned leads (DW3)
const staffOf = (actor: string) => { const [id, email, name] = sql(`select id || '|' || email || '|' || display_name from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email, name }; };
const T = staffOf("user-T"), O = staffOf("user-O");   // Case Manager (assigns, sees all), Case Officer (edits)
// A Read-only person and a soon-deactivated Case Officer, made for this run (the seed has neither).
const addStaff = (tag: string, role: string, name: string) => { const email = `fo4-${tag}-${run}@sample-firm.example.com`;
  const id = sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', '${email}', '${name}', 'fo4-${tag}-${run}', now()) returning id`);
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${id}', '${role}', 'seed:FO-4-test')`); return { id, email, name }; };
const RO = addStaff("ro", "READ_ONLY", `Sample Reader ${run}`), GONE = addStaff("gone", "CASE_OFFICER", `Sample Leaver ${run}`);
async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tokens = { T: await signIn(T.email), O: await signIn(O.email), RO: await signIn(RO.email) };
const staffCall = (tok: string, method: string, path: string) => fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${tok}` } });
const browser: Browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function pageAs(tok: string | null, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  if (tok) await ctx.addInitScript((t) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })), tok);
  p.on("pageerror", (e) => errors.push(String(e))); return p;
}
const axe = async (name: string, p: Page) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  ok(`${name}: axe finds no WCAG A/AA violation`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
const noSideways = async (name: string, p: Page) => ok(`${name}: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const leadIdOf = (given: string) => sql(`select l.id from fo_lead l join fo_person p on p.id = l.person_id where l.firm_id = '${A}' and p.given_names = '${given}' order by l.arrived_at desc limit 1`);
const formUrl = `${BASE}/front-office/web-form/${token}`;
/** A visitor fills and sends the form like a person (the stamp needs 2 s between drawing and sending, AG-2-49 rule 3). */
async function sendForm(p: Page, v: { given: string; family?: string; email: string; phone?: string; tick?: boolean; quick?: boolean }) {
  await p.goto(formUrl); await p.getByLabel("First name").waitFor({ timeout: 30_000 });
  await p.getByLabel("First name").fill(v.given); if (v.family) await p.getByLabel("Last name (optional)").fill(v.family);
  await p.getByLabel("Email", { exact: true }).fill(v.email); if (v.phone) await p.getByLabel("Phone (optional)").fill(v.phone);
  await p.getByLabel("Interested in (optional)").selectOption({ label: "Work permit (Sample)" }); if (v.tick) await p.getByRole("checkbox").check();
  if (!v.quick) await p.waitForTimeout(2300); await p.getByRole("button", { name: "Send my enquiry" }).click();
  await p.locator('[data-form-state="thanks"], [role="alert"]').first().waitFor({ timeout: 15_000 });
  return (await p.locator("main").innerText()).trim();
}
// DW1, DW2: the visitor's form
const visitor = await pageAs(null, 375);
const lena = `Lena${run}`;
await visitor.goto(formUrl); await visitor.getByLabel("First name").waitFor({ timeout: 30_000 });
ok("FO-4 BR-3: the hosted form shows the firm's consent wording beside the tick", (await visitor.getByText("Send me news and offers from Sample Firm").count()) === 1);
await axe("FO-4 web form (375 px)", visitor); await noSideways("FO-4 web form (375 px)", visitor); await shot(visitor, "web-form-375");
// Fail: the form's own check keeps the answers and sends nothing.
const before = Number(sql(`select count(*) from fo_lead where firm_id = '${A}'`));
await visitor.getByLabel("Email", { exact: true }).fill("lena@example.org");
await visitor.getByRole("button", { name: "Send my enquiry" }).click();
await visitor.getByText("Enter your first name.").first().waitFor({ timeout: 5_000 });
ok("FO-4 DW1 fail: no first name → refused on the field and in a summary, the email kept, no lead", (await visitor.getByLabel("Email", { exact: true }).inputValue()) === "lena@example.org" && Number(sql(`select count(*) from fo_lead where firm_id = '${A}'`)) === before);
const first = await sendForm(visitor, { given: lena, family: "Park", email: `lena.${run}@example.org`, phone: "+1 416 555 0101", tick: true });
ok("FO-4 DW1 pass: the form sent at 375 px gives the firm's thank-you", first.includes("Thank you. We will be in touch within one working day."), first);
await shot(visitor, "web-form-thanks-375");
const lenaId = leadIdOf(lena);
ok("FO-4 DW1 pass: the enquiry is one open lead with no owner, and the tick wrote one consent row", !!lenaId && sql(`select state || '|' || coalesce(owner_staff_id::text, '-') from fo_lead where id = '${lenaId}'`) === "OPEN|-", lenaId);
// Break S3: a visitor who sends at once (autofill) is held until 2 s and the enquiry is kept, never dropped as a bot.
const quick = await sendForm(visitor, { given: `Quick${run}`, email: `quick.${run}@example.org`, quick: true });
ok("FO-4 BR-3 pass: a form sent at once is held, thanked and stored (break S3)", quick.includes("Thank you.") && !!leadIdOf(`Quick${run}`), quick);
// A page out of date (a stamp not ours): redrawn with the answers kept and the consent tick cleared (Devin #1822, review r1).
await visitor.goto(formUrl); await visitor.getByLabel("First name").fill(`Stale${run}`); await visitor.getByLabel("Email", { exact: true }).fill(`stale.${run}@example.org`); await visitor.getByRole("checkbox").check(); await visitor.waitForTimeout(2300);
await visitor.route("**/submissions", (r) => r.continue({ postData: JSON.stringify({ ...JSON.parse(r.request().postData() ?? "{}"), loadStamp: "1.not-ours" }) }), { times: 1 });
await visitor.getByRole("button", { name: "Send my enquiry" }).click(); await visitor.getByText("The form was refreshed.").waitFor({ timeout: 15_000 });
ok("FO-4 BR-3 reload: a stale page is redrawn, the answers kept, the consent tick cleared, nothing stored", (await visitor.getByLabel("First name").inputValue()) === `Stale${run}` && !(await visitor.getByRole("checkbox").isChecked()) && !leadIdOf(`Stale${run}`));
await visitor.getByRole("button", { name: "Send my enquiry" }).click(); await visitor.locator('[data-form-state="thanks"]').waitFor({ timeout: 15_000 });
ok("FO-4 BR-3 reload: sent again, it is thanked and stored with no consent row", !!leadIdOf(`Stale${run}`) && sql(`select count(*) from msg_consent where subject_id = (select person_id from fo_lead where id = '${leadIdOf(`Stale${run}`)}')`) === "0");

// PF-28 part 3b (R1.10): the public door reads its post through the one input rule. The sweep's copy has no live form, so
// its probes cannot reach this door; here, on a live form: an unknown field, a wrong type and a missing submission id are
// each 422 naming the field (an unknown field named as sent), and nothing is stored.
{
  const post = (body: string) => fetch(`${BASE}/api/public/forms/${token}/submissions`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) as { fields?: Record<string, string> } | null }));
  const leadsBefore = sql(`select count(*) from fo_lead where firm_id = '${A}'`), sid = () => crypto.randomUUID();
  const base = { givenNames: `Rule${run}`, email: `rule.${run}@example.org`, submissionId: sid(), loadStamp: "1.x" };
  const unknown = await post(JSON.stringify({ ...base, pf28Unknown: "x" })), wrong = await post(JSON.stringify({ ...base, submissionId: sid(), givenNames: 5 })), missing = await post(JSON.stringify({ givenNames: `Rule${run}` }));
  ok("PF-28 part 3b pass: the public form refuses an unknown field 422 naming it", unknown.status === 422 && !!unknown.body?.fields?.pf28Unknown, unknown);
  ok("PF-28 part 3b fail: a wrong type (givenNames: 5) and a post with no submission id are 422 naming the field; nothing is stored", wrong.status === 422 && !!wrong.body?.fields?.givenNames && missing.status === 422 && !!missing.body?.fields?.submissionId && sql(`select count(*) from fo_lead where firm_id = '${A}'`) === leadsBefore, { wrong, missing });
}
// DW2: the same person again (known now): the same words, and a second lead flagged as a possible match (BR-2). FO-9b
// part 2b merges a safe repeat by itself, so Lena is given money first (a Sample tax setting): her repeat is never merged
// by itself and waits, flagged, for a person (P-574 (2)).
sql(`set session_replication_role = replica; insert into money_party_tax_treatment (firm_id, person_id, treatment, updated_by) values ('${A}', (select person_id from fo_lead where id = '${lenaId}'), 'EXEMPT', 'seed:fo4') returning 1`);
const again = await sendForm(visitor, { given: `${lena}b`, family: "Park", email: `lena.${run}@example.org` });
ok("FO-4 DW2 pass: a known person's enquiry gets the same thank-you, word for word", again.replace(`${lena}b`, lena) === first || again === first, { first, again });
// DW2 fail side: a form that is off says only that.
sql(`update fo_web_form set enabled = false where firm_id = '${A}'`); await visitor.goto(formUrl); await visitor.locator('[data-form-state="not-available"]').waitFor({ timeout: 15_000 });
ok("FO-4 DW2 fail: a form that is off shows \"This form is not available\" and no fields", (await visitor.locator("main").innerText()).includes("This form is not available.") && (await visitor.getByLabel("First name").count()) === 0);
await axe("FO-4 web form off", visitor);
sql(`update fo_web_form set enabled = true where firm_id = '${A}'`);
await visitor.goto(`${BASE}/front-office/web-form/not-a-real-token-at-all-xxxxxx`); await visitor.locator('[data-form-state="not-available"]').waitFor({ timeout: 15_000 });
ok("FO-4 DW2 fail: an unknown token gives the same answer as a form that is off", (await visitor.locator("main").innerText()).includes("This form is not available."));
// DW1: Unassigned with waited time
const cm = await pageAs(tokens.T); await cm.goto(`${BASE}/front-office/leads`);
const lenaRow = cm.locator(`tr[data-lead-row]`, { hasText: lena }).first(); await lenaRow.waitFor({ timeout: 30_000 });
const rowText = await lenaRow.innerText();
ok("FO-4 DW1 pass: the lead is in Unassigned leads (the first chip for a Case Manager) with its waited time", (await cm.locator('[data-chip="unassigned"][aria-pressed="true"]').count()) === 1 && /since it arrived/.test(rowText) && rowText.includes("Work permit (Sample)"), rowText);
ok("FO-4 plain words: the source reads \"Website form\", never the stored code", rowText.includes("Website form") && !rowText.includes("WEBSITE"), rowText);
ok("FO-4 frame: the place line reads Sales › Leads", /Sales\s*›\s*Leads/.test(await cm.locator('[data-where] nav[aria-label="Path"]').innerText()), await cm.locator("[data-where]").innerText());
ok("FO-4 BR-4: the menu badge counts the unassigned leads", /\d+ unassigned/.test(await cm.locator("[data-unassigned-badge]").innerText()));
await axe("FO-4 Leads (1440 px)", cm);
await shot(cm, "leads-unassigned-1440");
await cm.setViewportSize({ width: 1024, height: 800 }); await shot(cm, "leads-unassigned-1024"); await noSideways("FO-4 Leads (1024 px)", cm); await cm.setViewportSize({ width: 375, height: 800 }); await shot(cm, "leads-unassigned-375"); await noSideways("FO-4 Leads (375 px)", cm); await cm.setViewportSize({ width: 1440, height: 900 });
// Search: by name finds it; a name nobody has says so.
await cm.getByRole("searchbox").fill(lena);
ok("FO-4 search pass: the name finds the lead", (await cm.locator("tr[data-lead-row]").count()) >= 1);
await cm.getByRole("searchbox").fill(`nobody-${run}`);
ok("FO-4 search fail: a name nobody has says nothing matches", (await cm.getByText(`No lead matches “nobody-${run}”.`).count()) === 1);
await cm.getByRole("searchbox").fill("");
// DW3: the match line (BR-2)
// The Case Manager takes the first lead; the Case Officer (no "everyone sees all") may not see its person, the Case Manager may.
const takeFirst = await staffCall(tokens.T, "POST", `/front-office/leads/${lenaId}/take`);
const repeatId = leadIdOf(`${lena}b`);
ok("FO-4 DW3 setup: the Case Manager owns the first lead; the repeat is a second, unassigned lead", takeFirst.status === 200 && !!repeatId && repeatId !== lenaId);
await cm.goto(`${BASE}/front-office/leads/${repeatId}`); await cm.getByRole("heading", { level: 1 }).waitFor({ timeout: 20_000 });
const cmMatch = await cm.locator('[role="status"]').filter({ hasText: "Possible match" }).first().innerText();
ok("FO-4 DW3 pass: the Case Manager's match line names the person and the lead", cmMatch.includes(`Possible match: ${lena} Park (`), cmMatch);
ok("FO-4 BR-1: the lead's screen says Lead and shows no stage", (await cm.getByText("Lead", { exact: true }).count()) >= 1 && (await cm.getByText(/stage/i).count()) === 0);
await axe("FO-4 one lead (1440 px)", cm);
await shot(cm, "lead-match-1440");
const co = await pageAs(tokens.O);
await co.goto(`${BASE}/front-office/leads/${repeatId}`); await co.getByRole("heading", { level: 1 }).waitFor({ timeout: 20_000 });
const coMatch = await co.locator('[role="status"]').filter({ hasText: "Possible match" }).first().innerText();
ok("FO-4 DW3 fail: the Case Officer's match line names nobody", coMatch.includes("Possible match with a person you cannot see") && !coMatch.includes(lena), coMatch);
await co.goto(`${BASE}/front-office/leads/${lenaId}`); await co.getByRole("heading", { name: "Lead not found" }).waitFor({ timeout: 20_000 });
ok("FO-4 AG-2-94 rule 16: a lead the viewer may not see reads as not found", true);
// DW4: Take it, the race (BR-5)
// "Everyone sees all" on: the loser still sees the lead and hears who has it (off: FO-2 names the owner only to one who saw it).
await seesAll(true);
await co.goto(`${BASE}/front-office/leads`); const race = co.locator("tr[data-lead-row]", { hasText: `${lena}b` }).first(); await race.waitFor({ timeout: 20_000 });
const tookFirst = await staffCall(tokens.T, "POST", `/front-office/leads/${repeatId}/take`);   // the Case Manager is quicker
await race.getByRole("button", { name: /^Take it/ }).click();
const toast = co.getByText(`${T.name} already has this lead.`); await toast.first().waitFor({ timeout: 10_000 });
await co.locator("tr[data-lead-row]", { hasText: `${lena}b` }).waitFor({ state: "detached", timeout: 10_000 });
ok("FO-4 DW4 pass: Take it on a lead just taken names who has it, and the row leaves Unassigned", tookFirst.status === 200);
await seesAll(false);
// Pass side, keyboard only: a fresh lead, taken by Tab and Enter.
await sendForm(visitor, { given: `Kim${run}`, email: `kim.${run}@example.org` });
await co.reload(); const kim = co.locator("tr[data-lead-row]", { hasText: `Kim${run}` }).first(); await kim.waitFor({ timeout: 20_000 });
await co.getByRole("searchbox").focus();
let reached = false;
for (let i = 0; i < 40 && !reached; i++) { await co.keyboard.press("Tab"); reached = await co.evaluate((n) => (document.activeElement?.getAttribute("aria-label") ?? "").startsWith(`Take it: ${n}`), `Kim${run}`); }
await co.keyboard.press("Enter");
await co.getByText(/^You have lead /).first().waitFor({ timeout: 10_000 });
ok("FO-4 DW4 pass (keyboard only): Tab reaches Take it, Enter takes the lead, and it is the Case Officer's", reached && sql(`select owner_staff_id from fo_lead where id = '${leadIdOf(`Kim${run}`)}'`) === O.id);
await co.goto(`${BASE}/front-office/leads?view=mine`); await co.locator("tr[data-lead-row]", { hasText: `Kim${run}` }).waitFor({ timeout: 20_000 });
ok("FO-4 Mine: the taken lead is under Mine", true);
// DW6: buttons follow the keys
await sendForm(visitor, { given: `Ravi${run}`, email: `ravi.${run}@example.org` });
const ro = await pageAs(tokens.RO); await ro.goto(`${BASE}/front-office/leads`);
await ro.locator("tr[data-lead-row]", { hasText: `Ravi${run}` }).waitFor({ timeout: 20_000 });
ok("FO-4 DW6 pass: a Read-only person sees the unassigned lead but no Take it anywhere, and is told why", (await ro.getByRole("button", { name: /^Take it/ }).count()) === 0 && (await ro.locator("[data-why-no-take]").innerText()).includes("Taking one needs a role that works leads"));
await ro.goto(`${BASE}/front-office/leads/${leadIdOf(`Ravi${run}`)}`); await ro.getByRole("heading", { level: 1 }).waitFor({ timeout: 20_000 });
ok("FO-4 DW6 pass: on the lead too, no Take it and no Assign for Read-only, with the reason in the rail", (await ro.getByRole("button", { name: /Take it|Assign/ }).count()) === 0 && (await ro.locator("aside [data-why-no-take]").count()) === 1);
const roTake = await staffCall(tokens.RO, "POST", `/front-office/leads/${leadIdOf(`Ravi${run}`)}/take`);
ok("FO-4 DW6 fail: the server refuses Read-only's Take it (403) and the lead stays unowned", roTake.status === 403 && sql(`select coalesce(owner_staff_id::text, '-') from fo_lead where id = '${leadIdOf(`Ravi${run}`)}'`) === "-", roTake.status);
await cm.goto(`${BASE}/front-office/leads/${leadIdOf(`Ravi${run}`)}`); await cm.getByRole("heading", { level: 1 }).waitFor({ timeout: 20_000 });
ok("FO-4 DW6 pass: a Case Manager (agent/prospect:edit) sees Take it on the same lead and no reason line", (await cm.getByRole("button", { name: "Take it" }).count()) === 1 && (await cm.locator("[data-why-no-take]").count()) === 0);
// DW7: "(Inactive) Name"
await sendForm(visitor, { given: `Ola${run}`, email: `ola.${run}@example.org` });
const olaId = leadIdOf(`Ola${run}`);
sql(`update fo_lead set owner_staff_id = '${GONE.id}' where id = '${olaId}'`);
await cm.goto(`${BASE}/front-office/leads`); await cm.locator("tr[data-lead-row]").first().waitFor({ timeout: 20_000 });
ok("FO-4 DW7 fail: while its owner is active, the lead is not in Unassigned", (await cm.locator("tr[data-lead-row]", { hasText: `Ola${run}` }).count()) === 0);
sql(`update platform_staff set status = 'DEACTIVATED', deactivation_reason = 'FO-4 test (Sample)' where id = '${GONE.id}'`);
await cm.reload();
const ola = cm.locator("tr[data-lead-row]", { hasText: `Ola${run}` }).first(); await ola.waitFor({ timeout: 20_000 });
ok("FO-4 DW7 pass: a deactivated owner's lead is in Unassigned with \"(Inactive) Name\" and Take it", (await ola.locator("[data-owner]").innerText()).trim() === `(Inactive) ${GONE.name}` && (await ola.getByRole("button", { name: /^Take it/ }).count()) === 1);
await shot(cm, "leads-inactive-owner-1440");
// Break S2: after one person signs out, the next never sees the last person's rows, even for a moment.
const shared = await pageAs(tokens.T);
await shared.goto(`${BASE}/front-office/leads?view=all`);
await shared.locator("tr[data-lead-row]", { hasText: `${lena} Park` }).first().waitFor({ timeout: 20_000 });
await shared.evaluate(() => { (window as unknown as { seen: string[] }).seen = []; new MutationObserver(() => { for (const r of document.querySelectorAll("tr[data-lead-row]")) (window as unknown as { seen: string[] }).seen.push(r.textContent ?? ""); }).observe(document.body, { subtree: true, childList: true }); });
await shared.getByRole("button", { name: "Sign out" }).click(); await shared.getByLabel("Firm key").fill("sample-firm"); await shared.getByLabel("Work email").fill(O.email); await shared.getByRole("button", { name: "Sign in" }).click();
await shared.locator("tr[data-lead-row]").first().waitFor({ timeout: 20_000 }); await shared.waitForTimeout(800);
const seenRows = await shared.evaluate(() => (window as unknown as { seen: string[] }).seen);
ok("FO-4 break S2: the Case Officer never sees the Case Manager's lead after the switch", seenRows.length > 0 && !seenRows.some((t) => t.includes(`${lena} Park`) && !t.includes(`${lena}b`)), seenRows.length);
// Break S1: a session that expires with nobody clicking shows the sign-in card by itself.
const expiring = await pageAs(null);
await expiring.addInitScript((t) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 4000 })), await signIn(T.email));   // a fresh session: signing in again ends the older one
await expiring.goto(`${BASE}/front-office/leads`); await expiring.getByRole("heading", { name: "Leads" }).waitFor({ timeout: 20_000 }); await expiring.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 15_000 });
ok("FO-4 break S1: an expired session shows the sign-in card without a click, and no name or Sign out stays", (await expiring.getByRole("button", { name: "Sign out" }).count()) === 0);
// A browser that refuses storage still signs in, for as long as the page stays open (Devin #1822).
const noStore = await pageAs(null); await noStore.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error("refused"); }; });
await noStore.goto(`${BASE}/front-office/leads`); await noStore.getByLabel("Firm key").fill("sample-firm"); await noStore.getByLabel("Work email").fill(T.email); await noStore.getByRole("button", { name: "Sign in" }).click();
await noStore.getByRole("heading", { name: "Leads" }).waitFor({ timeout: 20_000 }); ok("FO-4 storage refused: sign-in still opens Leads (session kept in memory)", true);
// the sign-in card
const nobody = await pageAs(null); await nobody.goto(`${BASE}/front-office/leads`); await nobody.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 20_000 });
await nobody.getByLabel("Firm key").fill("sample-firm"); await nobody.getByLabel("Work email").fill(`nobody-${run}@example.org`); await nobody.getByRole("button", { name: "Sign in" }).click();
await nobody.getByText("No staff member signs in with that firm key and work email.").waitFor({ timeout: 10_000 });
ok("FO-4 sign-in fail: an unknown email is refused with the server's words", true);
await axe("FO-4 sign-in card", nobody);
await nobody.getByLabel("Work email").fill(O.email); await nobody.getByRole("button", { name: "Sign in" }).click(); await nobody.getByRole("heading", { name: "Leads" }).waitFor({ timeout: 20_000 });
ok("FO-4 sign-in pass: a Sample staff member signs in (local stand-in) and lands on Leads", true);
ok("FO-4: no page error in the browser", errors.length === 0, errors);
await db.$disconnect();
await browser.close();
process.exit(summary() ? 1 : 0);
