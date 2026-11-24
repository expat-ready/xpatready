// FO-5s part 1 (R1.53; concept screens/fo-5s-retainer-signing r2 §4 S2-S5, BR-2, BR-3, BR-5, BR-6, BR-7, BR-9, BR-17): the
// retainer card on the prospect page and the retainer page in a real browser against FO-5's and FO-5b's real routes (no
// fake API), each rule a pass and a fail: Prepare from the card (the preparer pre-selected as representative); Send
// refused at the field and in the summary while the fee is empty (BR-6) and a typed amount that is not money refused with
// nothing saved; every other empty value "missing"; the Code s. 24(3) line and its items, never blocking (BR-17); each save
// a new version, a sent version never changed (BR-7, BR-9); the conflict gate's refusal said with its link; Edit gone once
// signed (here on paper); a read-only person gets no Prepare. Keyboard-only Send, axe-core (WCAG 2.2 AA), no sideways
// scroll and screenshots at 375, 1024 and 1440 px. Seeds the Sample firms itself. US$0, no model call.
//   zsh studio/tools/isolated.sh screens_fo5s 4563 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo5s_retainer_screens_browser.ts 4563 xr_studio_screens_fo5s
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4563), DBNAME = process.argv[3] ?? "xr_studio_screens_fo5s";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "FO-5s", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
await seedSampleFirms(db);
await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
const staffOf = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
const R = staffOf("user-R"), T = staffOf("user-T");   // Owner + Case Manager with a licence; T a second representative (Case Manager)
const roEmail = `fo5s-reader-${run}@sample-firm.example.com`;
const RO = { id: sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', '${roEmail}', 'Sample reader ${run}', 'fo5s-reader-${run}', now()) returning id`), email: roEmail };
sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${RO.id}', 'READ_ONLY', 'seed:FO-5s-test')`);
let n = 0;
/** An Individual prospect owned by `owner` (Engaged), its person with an email and no phone. */
const prospect = (given: string, owner: string, withEmail = true) => {
  const pid = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', '${given}${run}', 'Sample', ${withEmail ? `'fo5s.${++n}.${run}@example.com'` : "null"}, 'test', now()) returning id`);
  sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, state, engaged_at, engaged_by, created_by, updated_at) values (gen_random_uuid(), '${A}', '${pid}', 'MANUAL', 'WEBSITE', '${owner}', 'ENGAGED', now(), 'test', 'test', now())`);
  const id = sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    select gen_random_uuid(), '${A}', l.id, 'INDIVIDUAL', (select id from fo_stage where firm_id = '${A}' and pipeline = 'INDIVIDUAL' and key = 'ENGAGED'), '${pid}', '${pid}', '${owner}', 'test', now() from fo_lead l where l.person_id = '${pid}' returning id`);
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${id}'`);
  return { id, name: `${given}${run} Sample` };
};
async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tok = { R: await signIn(R.email), RO: await signIn(RO.email), T: await signIn(T.email) };
async function call(t: string, method: string, path: string, body?: unknown): Promise<Ans> {
  const form = body instanceof FormData;
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${t}`, ...(body && !form ? { "content-type": "application/json" } : {}) }, body: form ? body : body ? JSON.stringify(body) : undefined });
  const x = await r.text(); let b: unknown = x; try { b = JSON.parse(x); } catch { /* file or text */ } return { status: r.status, body: b };
}
sql(`update fo_retainer_template set active = false where firm_id = '${A}'`);   // re-runnable: one active template (review m6)
// The firm's template, the Sample starter, through FO-5's route (the Retainer templates screen has its own check: check_fo5s2_templates_browser.ts).
const starter = await fetch(`${BASE}/api/front-office/retainer-templates/starter`, { headers: { authorization: `Bearer ${tok.R}` } });
const up = new FormData(); up.set("name", `Standard retainer ${run}`); up.set("file", new Blob([await starter.arrayBuffer()]), "starter.docx");
const tpl = await call(tok.R, "POST", "/front-office/retainer-templates", up);
ok("FO-5s setup: the Sample starter template is uploaded (the Retainer templates screen is part 2)", starter.ok && tpl.status === 201, tpl.body);
const recordCheck = (prospectId: string) => call(tok.R, "POST", "/front-office/conflict-checks", { requestId: crypto.randomUUID(), prospectId, result: "NO_CONFLICT" });

const browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function pageAs(t: string, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
  p.on("pageerror", (e) => errors.push(String(e))); return p;
}
const card = (p: Page) => p.locator("[data-retainer-card]");
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const axe = async (p: Page, where: string) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).include("main, [role=dialog]").analyze(); const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`FO-5s axe-core (WCAG 2.2 AA): no serious or critical finding — ${where}`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes.map((x) => x.target.join(" ")).join(", ")}`)); };
const ret = (prospectId: string) => db.foRetainer.findFirstOrThrow({ where: { firmId: A, prospectId }, include: { versions: { orderBy: { n: "asc" }, include: { fees: true } } } });

try {
  // ------------------------------------------------------------------------------- S2, BR-2, BR-3: Prepare from the card
  const ana = prospect("Ana", R.id), r = await pageAs(tok.R);
  await r.goto(`${BASE}/front-office/prospects/${ana.id}`);
  await card(r).locator("[data-no-retainer]").waitFor({ timeout: 30_000 });
  ok("R1.53 FO-5s S2 pass: the prospect page has a Retainer card: \"No retainer yet.\" and Prepare retainer", (await card(r).innerText()).includes("No retainer yet.") && await card(r).getByRole("button", { name: "Prepare retainer" }).isVisible());
  await shot(r, "card-empty-1440"); await axe(r, "the prospect page with the retainer card");
  await card(r).getByRole("button", { name: "Prepare retainer" }).click();
  const prep = r.getByRole("dialog", { name: "Prepare retainer" }); await prep.waitFor();
  await prep.getByLabel("Template").locator("option", { hasText: `Standard retainer ${run}` }).waitFor({ state: "attached", timeout: 10_000 });
  ok("R1.53 FO-5s BR-3 pass: the preparer, an eligible representative, is pre-selected; the only template is chosen", (await prep.getByLabel("Representative").inputValue()) === R.id && (await prep.getByLabel("Template").inputValue()) === tpl.body.id);
  await axe(r, "the Prepare retainer panel");
  await prep.getByRole("button", { name: "Prepare retainer" }).click();
  await r.waitForURL(/\/front-office\/retainers\//, { timeout: 15_000 });
  await r.locator("[data-retainer-status]").waitFor({ timeout: 15_000 });
  let row = await ret(ana.id);
  ok("R1.53 FO-5s S3 pass: Prepare makes one Draft, version 1, and opens its page (Draft, Version 1, the client's name in the title)",
    row.status === "DRAFT" && row.versions.length === 1 && r.url().endsWith(row.id) && (await r.locator("[data-retainer-status]").innerText()) === "Draft" && (await r.locator("h1").innerText()).includes(ana.name), { status: row.status, url: r.url() });

  // ------------------------------------------------------------------------------- BR-6: blockers and "missing"
  const summ = r.locator("[data-error-summary]");
  ok("R1.53 FO-5s BR-6 fail: the empty fee blocks Send, said on the field and in the summary (\"Fee is missing. Add a fee row.\")",
    (await summ.innerText()).includes("Fee is missing. Add a fee row.") && (await r.locator('[data-blocker="fees"]').innerText()).includes("Fee is missing."));
  await r.locator("[data-check-and-send]").click();
  ok("R1.53 FO-5s BR-6 fail: Check and send with a blocker opens no Send panel, focuses the summary's link, and sends nothing",
    (await r.getByRole("dialog").count()) === 0 && await summ.locator("a").first().evaluate((e) => e === document.activeElement) && (await ret(ana.id)).versions[0].sentAt === null);
  const phone = r.locator("[data-values] dt", { hasText: "Client phone" });
  ok("R1.53 FO-5s BR-6 pass: an empty value the template prints (no phone on the record) shows \"missing\", not a blocker",
    (await phone.count()) === 0 || ((await phone.locator("xpath=following-sibling::dd[1]").innerText()).includes("missing") && !(await summ.innerText()).includes("phone")));
  await shot(r, "draft-blocked-1440"); await axe(r, "the retainer page with a blocker");

  // ------------------------------------------------------------------------------- BR-17: the Code's items, never blocking
  const cl = (await call(tok.R, "GET", `/front-office/retainer-templates/${tpl.body.id}/checklist`)).body;
  const line = await r.locator("[data-code-line]").innerText();
  ok(`R1.53 FO-5b/FO-5s BR-17 pass: the draft shows the Code line ("${cl.marked} of ${cl.total} items marked") and one chip per item, each marked or not, labelled Unconfirmed: no counsel`,
    line.includes(`${cl.marked} of ${cl.total} items marked`) && (await r.locator("[data-code-checklist] li").count()) === cl.total
    && (await r.locator("[data-code-checklist] li", { hasText: "not marked" }).count()) === cl.total - cl.marked && (await r.locator("[data-code-checklist]").innerText()).includes("Unconfirmed: no counsel"), line);
  await r.getByRole("button", { name: "See the items and how we check" }).click();
  const items = r.getByRole("dialog", { name: "The regulator's Code, s. 24(3)" }); await items.locator("[data-code-item]").first().waitFor({ timeout: 10_000 });
  ok("R1.53 FO-5s BR-17 pass: the items panel lists every item with the Code's words, the source line with its \"current to\" date, and \"How we check\" for unmarked ones",
    (await items.locator("[data-code-item]").count()) === cl.total && (await items.innerText()).includes(cl.source.currentTo) && (cl.marked === cl.total || (await items.innerText()).includes("How we check:")));
  await shot(r, "code-items-1440"); await axe(r, "the Code items panel");
  await r.keyboard.press("Escape"); await items.waitFor({ state: "detached" });

  // ------------------------------------------------------------------------------- BR-5, BR-9: each save a new version
  await r.getByLabel("Fee 1: amount").fill("12,34.5x");
  await r.getByRole("button", { name: "Save as version 2" }).click();
  await r.getByText("Fee row 1: An amount in dollars with a dot for cents, for example 1500 or 1,500.50.").waitFor({ timeout: 5_000 });
  ok("R1.53 FO-5s BR-5 fail: an amount that is not money is refused on its field, nothing saved (still version 1)", (await ret(ana.id)).versions.length === 1);
  await r.getByLabel("Fee 1: amount").fill("1500,50");
  await r.getByRole("button", { name: "Save as version 2" }).click();
  await r.getByText("Fee row 1: An amount in dollars with a dot for cents, for example 1500 or 1,500.50.").waitFor({ timeout: 5_000 });
  ok("R1.53 FO-5s break M1 fail: a decimal comma (1500,50) is refused, never read as CAD 150,050.00; nothing saved", (await ret(ana.id)).versions.length === 1);
  await r.getByLabel("Fee 1: amount").fill("1500");
  await r.getByRole("button", { name: "Save as version 2" }).click();
  await r.locator("[data-version]", { hasText: "Version 2" }).waitFor({ timeout: 15_000 });
  row = await ret(ana.id);
  ok("R1.53 FO-5s BR-9 pass: Save makes version 2 with CAD 1,500.00; version 1 keeps its empty fee (BR-7); the blocker is gone",
    row.currentVersion === 2 && row.versions[1].fees[0].amountMinor === 150000n && row.versions[0].fees[0].amountMinor === null && (await summ.count()) === 0, row.versions.map((v) => v.fees.map((f) => String(f.amountMinor))));

  // ------------------------------------------------------------------------------- S4, BR-8: Send (the conflict gate first)
  await r.locator("[data-check-and-send]").click();
  const sendP = r.getByRole("dialog", { name: /^Send to .* to sign$/ }); await sendP.waitFor();
  ok("R1.53 FO-5s S4 pass: the Send panel names the version, the signer's email and the fees", (await sendP.innerText()).includes("fo5s.1.") && (await sendP.innerText()).includes("CAD 1,500.00"));
  await shot(r, "send-panel-1440"); await axe(r, "the Send panel");
  await sendP.getByRole("button", { name: /^Send to / }).click();
  await r.getByRole("link", { name: "Open the prospect's conflict check" }).waitFor({ timeout: 10_000 });
  ok("R1.53 FO-5s fail (FO-13c gate): with no conflict check, Send is refused in the gate's words with a link to the prospect's check; nothing is sent", (await ret(ana.id)).status === "DRAFT");
  ok("FO-5s setup: a NO_CONFLICT check is recorded for the prospect (FO-13s's panel is J-53's walk)", (await recordCheck(ana.id)).status === 201);
  await r.locator("[data-check-and-send]").click(); await sendP.waitFor();
  await sendP.getByRole("button", { name: /^Send to / }).click();
  await r.locator("[data-retainer-status]", { hasText: "Sent" }).waitFor({ timeout: 15_000 });
  row = await ret(ana.id);
  ok("R1.53 FO-5s BR-8 pass: Send sends version 2 (Sent, sent time stored); the page says it waits for the client", row.status === "SENT" && row.versions[1].sentAt !== null && (await r.getByText(/^Waiting for .* to sign version 2\.$/).count()) === 1);

  // ------------------------------------------------------------------------------- BR-7, BR-9: Edit after Send
  ok("R1.53 FO-5s BR-9: a sent retainer offers Edit and no Check and send", await r.getByRole("button", { name: "Edit" }).isVisible() && (await r.locator("[data-check-and-send]").count()) === 0);
  await r.getByRole("button", { name: "Edit" }).click();
  await r.getByLabel("Fee 1: amount").fill("1750");
  await r.getByRole("button", { name: "Save as version 3" }).click();
  await r.locator("[data-version]", { hasText: "Version 3" }).waitFor({ timeout: 15_000 });
  row = await ret(ana.id);
  ok("R1.53 FO-5s BR-7/BR-9 pass: Edit on the sent one makes version 3 in Draft; version 2 keeps its CAD 1,500.00 and sent time and is ended as replaced",
    row.status === "DRAFT" && row.currentVersion === 3 && row.versions[1].fees[0].amountMinor === 150000n && row.versions[1].sentAt !== null && row.versions[1].endReason === "UPDATED" && row.versions[2].fees[0].amountMinor === 175000n);
  ok("R1.53 FO-5s S5: Versions lists 3, 2 (sent, replaced by a newer version) and 1 (not sent)", (await r.locator('[data-version-row="2"]').innerText()).includes("Replaced by a newer version") && (await r.locator('[data-version-row="1"]').innerText()).includes("Not sent"));
  await shot(r, "versions-1440");
  // Keyboard only: from the page's first link to Check and send, then the panel's Send.
  await r.locator("h1").click();
  for (let i = 0; i < 120 && !(await r.evaluate(() => document.activeElement?.hasAttribute("data-check-and-send"))); i++) await r.keyboard.press("Tab");
  await r.keyboard.press("Enter"); await sendP.waitFor({ timeout: 5_000 });
  await sendP.getByRole("button", { name: /^Send to / }).focus(); await r.keyboard.press("Enter");
  await r.locator("[data-retainer-status]", { hasText: "Sent" }).waitFor({ timeout: 15_000 });
  ok("R1.53 FO-5s keyboard-only: Tab to Check and send, Enter, Enter sends version 3", (await ret(ana.id)).status === "SENT");
  await r.goto(`${BASE}/front-office/prospects/${ana.id}`); await card(r).locator("[data-retainer-status]").waitFor({ timeout: 15_000 });
  ok("R1.53 FO-5s S2: the card then shows Sent, version 3, waiting for the client, and Open the retainer", (await card(r).innerText()).includes("Version 3") && (await card(r).locator("[data-waiting]").count()) === 1 && await card(r).getByRole("link", { name: "Open the retainer" }).isVisible());

  // ------------------------------------------------------------------------------- QA-780: a draft's template can be changed
  // A potential conflict needs its disclosure printed (Code s. 24(3)(o), 15(1); Unconfirmed: no counsel). The starter has no
  // {conflict.disclosure}, so Send is refused; the draft offers the fix: choose a template that prints it, save, send.
  // Bounded waits are read as true or false and asserted, so main (no pick) gives FAIL lines, not a stopped run.
  const shown = (l: ReturnType<Page["locator"]>, timeout: number) => l.waitFor({ timeout }).then(() => true, () => false);
  const { buildDocx } = await import("../api/src/front-office/retainers/docx.ts");
  const DISC_LINES = ["Client {client.name}", "Conflict: {conflict.disclosure}", "{#fees}", "{label}: {amount}", "{/fees}"], PLAIN_LINES = ["Client {client.name}", "{#fees}", "{label}: {amount}", "{/fees}"];
  const docx = (lines: string[], name?: string) => { const f = new FormData(); if (name) f.set("name", name); f.set("file", new Blob([buildDocx(lines)]), "t.docx"); return f; };
  const upT = (name: string, lines: string[]) => call(tok.R, "POST", "/front-office/retainer-templates", docx(lines, name));
  const onOff = (t: { body: { id: string } }, active: boolean) => call(tok.R, "PATCH", `/front-office/retainer-templates/${t.body.id}`, { active });
  const DISC = `Sample disclosure ${run}: the firm acted for a related party (Sample).`;
  const conflictOf = (prospectId: string) => call(tok.R, "POST", "/front-office/conflict-checks", { requestId: crypto.randomUUID(), prospectId, result: "POTENTIAL_CONFLICT", disclosureText: DISC });
  const draftOn = (prospectId: string, templateId: string) => call(tok.R, "POST", `/front-office/prospects/${prospectId}/retainers`, { templateId, fees: [{ label: "Deposit on signing", amountMinor: 150000, when: "ON_SIGNING" }] });
  const refuse = async (p: Page) => {   // Check and send, then Send: answered with the gate's NO_DISCLOSURE words
    await p.locator("[data-check-and-send]").click();
    const d = p.getByRole("dialog", { name: /^Send to .* to sign$/ }); await d.waitFor({ timeout: 10_000 });
    await d.getByRole("button", { name: /^Send to / }).click();
    return shown(p.getByText(/use a template with \{conflict\.disclosure\}/), 10_000);
  };
  const sendIt = async () => {
    await r.locator("[data-check-and-send]").click(); const d = r.getByRole("dialog", { name: /^Send to .* to sign$/ }); await d.waitFor({ timeout: 10_000 });
    await d.getByRole("button", { name: /^Send to / }).click(); return shown(r.locator("[data-retainer-status]", { hasText: "Sent" }), 15_000);
  };
  const offT = await upT(`Old retainer ${run}`, PLAIN_LINES), offR = await onOff(offT, false);
  const ida = prospect("Ida", R.id), ic = await conflictOf(ida.id), ir = await draftOn(ida.id, tpl.body.id);
  ok("FO-5s setup (QA-780): a switched-off template, a Potential conflict with its disclosure, and a draft on the starter (the only active template)",
    offT.status === 201 && offR.status === 200 && ic.status === 201 && ir.status === 201, [offT.status, offR.status, ic.status, ic.body?.code, ir.status]);
  const idaUrl = `${BASE}/front-office/retainers/${ir.body.id}`, pick = r.getByLabel("Template", { exact: true }), none = r.locator("[data-no-disclosure-template]");

  // No active template prints it: the refusal says so; the Owner gets the link to Retainer templates, others are told whom to ask.
  await r.goto(idaUrl); await r.locator("[data-check-and-send]").waitFor({ timeout: 30_000 });
  const refusedNone = await refuse(r), noneText = (await shown(none, 5_000)) ? await none.innerText() : "";
  ok("R1.53 QA-780 fail: with no active template that prints the disclosure, the refusal says so and, for the Owner, links to Retainer templates",
    refusedNone && noneText.includes("None of your firm's templates prints it yet.") && noneText.includes("then choose it here.") && (await none.getByRole("link", { name: /Retainer templates/ }).count()) === 1, noneText);
  await shot(r, "qa780-refused-none-prints-1440");
  const tp = await pageAs(tok.T); await tp.goto(idaUrl);
  const tSends = await shown(tp.locator("[data-check-and-send]"), 30_000), refusedT = tSends && await refuse(tp);
  const noneT = refusedT && await shown(tp.locator("[data-no-disclosure-template]"), 5_000) ? await tp.locator("[data-no-disclosure-template]").innerText() : "";
  ok("R1.53 QA-780 fail (review m3, m6): for someone who cannot change templates (a Case Manager), the refusal asks the firm's Owner or Admin, with no link",
    refusedT && noneT.includes("Ask your firm's Owner or Admin to add {conflict.disclosure} to a retainer template, then choose it here.") && (await tp.locator("[data-no-disclosure-template] a").count()) === 0, { tSends, noneT });
  await tp.context().close();
  // Review M1: the link opens Retainer templates, which lists the firm's templates (the pick's list shares no cache with it).
  const link = none.getByRole("link", { name: /Retainer templates/ });
  if (await link.count()) await link.click();
  const listed = await shown(r.locator(`[data-template-row="Standard retainer ${run}"]`), 15_000);
  ok("R1.53 QA-780 pass (review M1): the refusal's link opens Retainer templates, which shows the firm's templates (not \"This page could not be shown\")",
    listed && (await r.getByText("This page could not be shown").count()) === 0 && r.url().endsWith("/front-office/settings/retainer-templates"));

  // A template that prints it: the pick offers it, the refusal's action focuses the pick; switched off meanwhile → refused, nothing saved.
  const discT = await upT(`Disclosure retainer ${run}`, DISC_LINES);
  await r.goto(idaUrl); await r.locator("[data-check-and-send]").waitFor({ timeout: 30_000 });
  const hasPick = await shown(pick.locator("option", { hasText: `Disclosure retainer ${run}` }).first(), 10_000).then(async (x) => x || (await pick.count()) > 0 && (await pick.locator("option", { hasText: `Disclosure retainer ${run}` }).count()) > 0);
  const opts = hasPick ? await pick.locator("option").allInnerTexts() : [];
  ok("R1.53 QA-780 pass: the draft's agreement has a Template pick on this draft's template and version, and the template that prints the conflict disclosure says so",
    discT.status === 201 && hasPick && (await pick.inputValue()) === "" && opts[0]?.startsWith(`Standard retainer ${run} · version 1`) && !opts[0]?.includes("prints") && opts.some((o) => o.includes(`Disclosure retainer ${run} · version 1 · prints the conflict disclosure`)), opts);
  ok("R1.53 QA-780 fail: a switched-off template is not offered", hasPick && !opts.some((o) => o.includes(`Old retainer ${run}`)), opts);
  if (!hasPick) ok("R1.53 QA-780: the refusal's fix, the switched-off race, a newer version and a version made before the check need the Template pick", false);
  else {
    const fix = r.getByRole("button", { name: "Choose a template that prints it" });
    const fixShown = await refuse(r) && await shown(fix, 10_000);
    if (fixShown) await fix.click();
    ok("R1.53 QA-780 pass: Send on the starter is refused in the gate's words, and the notice's \"Choose a template that prints it\" focuses the Template pick; nothing is sent",
      fixShown && await pick.evaluate((e) => e === document.activeElement) && (await ret(ida.id)).status === "DRAFT");
    await shot(r, "qa780-refused-choose-template-1440");
    await pick.selectOption(discT.body.id);
    const offNow = await onOff(discT, false);   // a colleague switches it off meanwhile
    await r.getByRole("button", { name: "Save as version 2" }).click();
    const refusedOff = await shown(r.getByText("This template is switched off."), 10_000);
    const gone = await pick.locator("option", { hasText: `Disclosure retainer ${run}` }).waitFor({ state: "detached", timeout: 10_000 }).then(() => true, () => false);
    ok("R1.53 QA-780 fail (review m5): a template switched off before Save is refused on the Template pick, nothing is saved, and the pick then stops offering it",
      offNow.status === 200 && refusedOff && gone && (await pick.inputValue()) === "" && (await ret(ida.id)).versions.length === 1 && (await ret(ida.id)).templateId === tpl.body.id, { refusedOff, gone });
    await onOff(discT, true);
    await r.reload(); await pick.locator("option", { hasText: `Disclosure retainer ${run}` }).waitFor({ state: "attached", timeout: 15_000 });
    await pick.selectOption(discT.body.id);
    await r.getByRole("button", { name: "Save as version 2" }).click();
    await r.locator("[data-version]", { hasText: "Version 2" }).waitFor({ timeout: 15_000 });
    const iv = await call(tok.R, "GET", `/front-office/retainers/${ir.body.id}`);
    ok("R1.53 QA-780 pass: Save makes version 2 from the chosen template, which prints the check's disclosure; the pick now shows that template",
      (await ret(ida.id)).templateId === discT.body.id && iv.body.version?.values?.["conflict.disclosure"] === DISC && (await pick.inputValue()) === "" && (await pick.locator("option").first().innerText()).startsWith(`Disclosure retainer ${run} · version 1 · prints`), iv.body.version?.values?.["conflict.disclosure"]);
    const sentIda = await sendIt(), iSent = await ret(ida.id);
    ok("R1.53 QA-780 pass: Send then sends version 2 (the disclosure is printed, so the gate lets it through); version 1 on the starter was never sent",
      sentIda && iSent.status === "SENT" && !!iSent.versions[1]?.sentAt && iSent.versions[0].sentAt === null, iSent.status);

    // Review M2: the draft's own template gets a newer version that prints it: offered on its own, and picking it is a change.
    const plainT = await upT(`Plain retainer ${run}`, PLAIN_LINES), jo = prospect("Jo", R.id); await conflictOf(jo.id);
    const jr = await draftOn(jo.id, plainT.body.id), pv2 = await call(tok.R, "POST", `/front-office/retainer-templates/${plainT.body.id}/versions`, docx(DISC_LINES));
    await r.goto(`${BASE}/front-office/retainers/${jr.body.id}`);
    const newest = await shown(pick.locator("option", { hasText: "(newest)" }), 15_000).then(async (x) => x || (await pick.locator("option", { hasText: "(newest)" }).count()) > 0);
    const jopts = newest ? await pick.locator("option").allInnerTexts() : [];
    ok("R1.53 QA-780 fail (review M2): the draft's template at its own version does not claim to print the disclosure, and Save stays off until a change",
      jr.status === 201 && pv2.status < 300 && newest && jopts[0] === `Plain retainer ${run} · version 1 (this draft's)` && await r.getByRole("button", { name: "Save as version 2" }).isDisabled(), { pv2: pv2.status, jopts });
    ok("R1.53 QA-780 pass (review M2): the newer version of the draft's own template is offered on its own, saying it prints the disclosure",
      jopts.includes(`Plain retainer ${run} · version 2 (newest) · prints the conflict disclosure`), jopts);
    await pick.selectOption(plainT.body.id);
    await r.getByRole("button", { name: "Save as version 2" }).click();
    await r.locator("[data-version]", { hasText: "Version 2" }).waitFor({ timeout: 15_000 });
    const jv = await call(tok.R, "GET", `/front-office/retainers/${jr.body.id}`), sentJo = await sendIt();
    ok("R1.53 QA-780 pass (review M2): choosing it saves version 2 from template version 2, which prints the disclosure, and Send sends it",
      jv.body.template?.version === 2 && jv.body.version?.values?.["conflict.disclosure"] === DISC && sentJo, { template: jv.body.template, sentJo });

    // A version made before the check, on a template that prints it: the refusal offers to save a new version, which prints it.
    const kai = prospect("Kai", R.id), kr = await draftOn(kai.id, discT.body.id); await conflictOf(kai.id);
    await r.goto(`${BASE}/front-office/retainers/${kr.body.id}`); await r.locator("[data-check-and-send]").waitFor({ timeout: 30_000 });
    const resave = r.getByRole("button", { name: "Save version 2 with the disclosure" });
    const offered = await refuse(r) && await shown(resave, 10_000);
    if (offered) { await resave.click(); await r.locator("[data-version]", { hasText: "Version 2" }).waitFor({ timeout: 15_000 }); }
    const sentKai = offered && await sendIt();
    ok("R1.53 QA-780 pass: a version made before the check, from a template that prints it, is refused; \"Save version 2 with the disclosure\" makes a version that prints it, and Send sends it",
      offered && sentKai && (await call(tok.R, "GET", `/front-office/retainers/${kr.body.id}`)).body.version?.values?.["conflict.disclosure"] === DISC, { offered, sentKai });
    await onOff(plainT, false);
  }
  await onOff(discT, false);   // later steps expect one active template

  // ------------------------------------------------------------------------------- signed: Edit gone; read-only: no Prepare
  const bea = prospect("Bea", R.id);
  const d = await call(tok.R, "POST", `/front-office/prospects/${bea.id}/retainers`, { templateId: tpl.body.id, fees: [{ label: "L".repeat(120), amountMinor: 100000, when: "ON_SIGNING" }] });
  await recordCheck(bea.id);
  const off = new FormData(); off.set("reason", "Signed at the office (Sample)"); off.set("expectedVersion", "1"); off.set("file", new Blob(["%PDF-1.4\n% FO-5s Sample\n%%EOF\n"]), "signed.pdf");
  const so = await call(tok.R, "POST", `/front-office/retainers/${d.body.id}/signed-offline`, off);
  await r.goto(`${BASE}/front-office/retainers/${d.body.id}`); await r.locator("[data-retainer-status]").waitFor({ timeout: 15_000 });
  ok("R1.53 FO-5s BR-9 fail: once signed (on paper here), the page says it can no longer change and offers no Edit, no Save, no Check and send",
    so.status === 200 && (await r.getByText(/has already signed\. This retainer can no longer change\./).count()) === 1 && (await r.getByRole("button", { name: /^(Edit|Save as version)/ }).count()) === 0 && (await r.locator("[data-check-and-send]").count()) === 0, so.body);
  const cyd = prospect("Cyd", R.id), ro = await pageAs(tok.RO);
  await ro.goto(`${BASE}/front-office/prospects/${cyd.id}`); await ro.locator("h1").waitFor({ timeout: 30_000 }); await ro.waitForLoadState("networkidle");
  ok("R1.53 FO-5s BR-2 fail: a read-only person, on a prospect with no retainer, gets no Prepare retainer", (await ro.getByRole("button", { name: "Prepare retainer" }).count()) === 0);
  await r.goto(`${BASE}/front-office/prospects/${cyd.id}`); await card(r).getByRole("button", { name: "Prepare retainer" }).waitFor({ timeout: 30_000 });
  ok("R1.53 FO-5s BR-2 pass: the same prospect offers Prepare retainer to its owner", true);

  // ------------------------------------------------------------------------------- break M4: the representative reads, never changes
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:FO-5s-test", workspaceId: await platformAuditWorkspaceId(db), reason: "FO-5s test: representative only" });
  const dee = prospect("Dee", R.id), dr = await call(tok.R, "POST", `/front-office/prospects/${dee.id}/retainers`, { templateId: tpl.body.id, representativeStaffId: T.id });
  const t = await pageAs(tok.T); await t.goto(`${BASE}/front-office/retainers/${dr.body.id}`); await t.locator("[data-retainer-status]").waitFor({ timeout: 30_000 });
  ok("R1.53 FO-5s break M4 fail: the representative who cannot see the prospect reads the retainer but gets no Save, Edit or Check and send, and the prospect number is not a link",
    dr.status === 201 && (await t.getByRole("button", { name: /^(Edit|Save as version)/ }).count()) === 0 && (await t.locator("[data-check-and-send]").count()) === 0 && (await t.getByRole("link", { name: /^P-/ }).count()) === 0);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "seed:FO-5s-test", workspaceId: await platformAuditWorkspaceId(db), reason: "FO-5s test: back on" });

  // ------------------------------------------------------------------------------- review M1, M2: the signer
  const coP = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Corp${run}', 'Sample', 'fo5s.corp.${run}@example.com', 'test', now()) returning id`);
  const CO = sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Maple ${run} Ltd', 'maple ${run}', 'staff:${R.id}', now()) returning id`);
  sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, state, engaged_at, engaged_by, created_by, updated_at) values (gen_random_uuid(), '${A}', '${coP}', 'MANUAL', 'WEBSITE', '${R.id}', 'ENGAGED', now(), 'test', 'test', now()); insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${CO}', '${coP}', 'PRIMARY', 'test')`);
  const coX = sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_company_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    select gen_random_uuid(), '${A}', l.id, 'CORPORATE', (select id from fo_stage where firm_id = '${A}' and pipeline = 'CORPORATE' and key = 'ENGAGED'), '${CO}', '${coP}', '${R.id}', 'test', now() from fo_lead l where l.person_id = '${coP}' returning id`);
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${coX}'`);
  const cr = await call(tok.R, "POST", `/front-office/prospects/${coX}/retainers`, { templateId: tpl.body.id, fees: [{ label: "Fee", amountMinor: 90000, when: "ON_SIGNING" }] });
  await r.goto(`${BASE}/front-office/retainers/${cr.body.id}`); await r.locator("[data-error-summary]").waitFor({ timeout: 30_000 });
  ok("R1.53 FO-5s review M1 fail: a company with no signatory contact: Send is blocked with \"Choose who signs.\" and the summary link focuses the Who signs pick",
    (await r.locator("[data-error-summary]").innerText()).includes("Choose who signs.") && await r.locator("[data-error-summary] a").first().click().then(() => r.getByLabel("Who signs").evaluate((e) => e === document.activeElement)), { draft: cr.status, summary: await r.locator("[data-error-summary]").innerText(), focus: await r.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)) });
  await shot(r, "company-signer-1440");
  await r.getByLabel("Who signs").selectOption(coP);
  await r.getByRole("button", { name: "Save as version 2" }).click();
  await r.locator("[data-version]", { hasText: "Version 2" }).waitFor({ timeout: 15_000 });
  ok("R1.53 FO-5s review M1 pass (BR-4, AG-5-50): picking one of the company's contacts saves version 2 with that signer and Send is no longer blocked",
    (await db.foRetainer.findUniqueOrThrow({ where: { id: cr.body.id } })).signerPersonId === coP && (await r.locator("[data-error-summary]").count()) === 0 && await r.locator("[data-check-and-send]").isVisible());
  const eve = prospect("Eve", R.id, false), er = await call(tok.R, "POST", `/front-office/prospects/${eve.id}/retainers`, { templateId: tpl.body.id, fees: [{ label: "Fee", amountMinor: 90000, when: "ON_SIGNING" }] });
  await r.goto(`${BASE}/front-office/retainers/${er.body.id}`); await r.locator('[data-blocker="signer"]').waitFor({ timeout: 30_000 });
  const signerEmail = r.locator("[data-values] dt", { hasText: "Signer's email" }).locator("xpath=following-sibling::dd[1]");
  ok("R1.53 FO-5s review M2: a signer with no email blocks Send with a fix (a link to the client's record), and the values say \"blocks Send\", never \"You can send without it\"",
    (await r.locator('[data-blocker="signer"]').innerText()).includes("The signer needs an email.") && (await r.locator('[data-blocker="signer"]').getByRole("link").count()) === 1
    && ((await signerEmail.count()) === 0 || (await signerEmail.innerText()).includes("blocks Send")));
  // Lead 15 ruling on #2802 (P-628, reversible): CAD 0.00 means no fee is due; shown "No fee"; Send is not blocked.
  const fay = prospect("Fay", R.id), fr = await call(tok.R, "POST", `/front-office/prospects/${fay.id}/retainers`, { templateId: tpl.body.id, fees: [{ label: "Consultation credit", amountMinor: 0, when: "ON_SIGNING" }] });
  await r.goto(`${BASE}/front-office/retainers/${fr.body.id}`); await r.locator("[data-check-and-send]").waitFor({ timeout: 30_000 });
  const noFeeValues = (await r.locator("[data-values]").innerText()).includes("No fee"), noSummary = (await r.locator("[data-error-summary]").count()) === 0;
  await r.locator("[data-check-and-send]").click(); const fs = r.getByRole("dialog", { name: /^Send to .* to sign$/ }); await fs.waitFor();
  ok("R1.53 FO-5s (Lead ruling) pass: a CAD 0.00 fee reads \"No fee\" in Check before sending and the Send panel, and does not block Send",
    noFeeValues && noSummary && (await fs.innerText()).includes("No fee") && !(await fs.innerText()).includes("CAD 0.00"), { noFeeValues, noSummary });
  await r.keyboard.press("Escape");

  // ------------------------------------------------------------------------------- widths
  for (const w of [375, 1024, 1440]) {
    const p = await pageAs(tok.R, w);
    await p.goto(`${BASE}/front-office/retainers/${row.id}`); await p.locator("[data-code-line]").waitFor({ timeout: 30_000 });
    const wide = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`R1.53 FO-5s ${w} px: the retainer page has no sideways scroll`, wide <= 1, wide);
    await p.goto(`${BASE}/front-office/retainers/${d.body.id}`); await p.locator("[data-code-line]").waitFor({ timeout: 30_000 });
    const wideL = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`R1.53 FO-5s break M3 ${w} px: a 120-character unbroken fee label wraps (no sideways scroll)`, wideL <= 1, wideL);
    await shot(p, `retainer-${w}`);
    await p.context().close();
  }
  ok("FO-5s: no page error in any browser", errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
