// qa 7 (24 Nov, Lead 26's ask): the replay's code-read claims S17 M1, M4 and M5 on the retainer page
// (product/design/replay-2026-11-24/CONTROLS-ON-MAIN.md on claude/fervent-mahavira-b75d49), walked by screens like a person
// on an isolated copy of main (own database and port, never :4400). Each judge states the right behaviour, so a FAIL
// reproduces the claim and a PASS refutes it.
//   M1 Check and send with typed, unsaved fee edits: the edit is not silently dropped (the panel shows it, or warns, or
//      what is sent carries it).
//   M4 a client with no email: the signer blocker says "Add it on <client>'s record, then save a new version here";
//      (a) the record offers a way to add the email by screens; (b) with the email on the record (labelled setup: SQL),
//      the draft can take it (Save as a new version is pressable, or the values show the email).
//   M5 a Potential conflict and a template without {conflict.disclosure} (the starter): Send is refused telling the
//      person to "use a template with {conflict.disclosure}"; the draft offers a way to change its template.
// Setup as J-53 (Sample people and prospects by SQL; the template uploaded by screens). US$0, no model call, no live mail.
// Run from prototype/:
//   zsh studio/tools/isolated.sh s17 4475 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh s17 4475 stop' EXIT && npx tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_s17_retainer_controls.ts s17 4475
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "s17", Number(process.argv[3] ?? 4475)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const SHOTS = join(STUDIO, "..", "..", "product", "qa", "reports", "2026-11-24-s17-retainer-controls"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });

await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const firmId = sql(`select id from platform_firm where key = 'sample-firm'`);
ok("S17 setup: the Sample firm and its front office are seeded", !!firmId && fo.failed.length === 0, fo.failed);
const [ownerId, ownerEmail] = sql(`select id || '|' || email from platform_staff where actor_id = 'user-R'`).split("|");
/** A Sample person (email or none) with an Engaged prospect owned by the Owner. */
const prospect = (k: string, email: string | null) => {
  const given = `S17${k}${run}`;
  const pid = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firmId}', '${given}', 'Sample', ${email ? `'${email}'` : "null"}, 'test', now()) returning id`);
  sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, state, engaged_at, engaged_by, created_by, updated_at) values (gen_random_uuid(), '${firmId}', '${pid}', 'MANUAL', 'WEBSITE', '${ownerId}', 'ENGAGED', now(), 'test', 'test', now())`);
  const id = sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    select gen_random_uuid(), '${firmId}', l.id, 'INDIVIDUAL', (select id from fo_stage where firm_id = '${firmId}' and pipeline = 'INDIVIDUAL' and key = 'ENGAGED'), '${pid}', '${pid}', '${ownerId}', 'test', now() from fo_lead l where l.person_id = '${pid}' returning id`);
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${id}'`);
  return { id, pid, name: `${given} Sample` };
};
const PA = prospect("a", `s17a.${run}@example.com`), PB = prospect("b", null), PC = prospect("c", `s17c.${run}@example.com`);
const signIn = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email: ownerEmail, secondStep: true }) });
const tok = ((await signIn.json()) as { token?: string }).token;
if (!tok) { console.error("STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local)"); process.exit(2); }
sql(`update fo_retainer_template set active = false where firm_id = '${firmId}'`);
const browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce", acceptDownloads: true });
await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tok);
const p: Page = await ctx.newPage();
const shot = (n: string) => p.screenshot({ path: join(SHOTS, `${n}.png`), fullPage: true });
const card = p.locator("[data-retainer-card]"), status = p.locator("[data-retainer-status]");
const ret = (prospectId: string) => db.foRetainer.findFirstOrThrow({ where: { firmId, prospectId }, include: { versions: { orderBy: { n: "asc" }, include: { fees: true } } } });
const check = async (prospectId: string, result: string, disclosure?: string) => {
  await p.goto(`${BASE}/front-office/prospects/${prospectId}`);
  await card.waitFor({ timeout: 30_000 });
  await p.locator("[data-conflict-panel]").getByRole("button", { name: "Run a check" }).click();
  const d = p.getByRole("dialog", { name: "Run a conflict check" }); await d.locator("[data-searched]").waitFor({ timeout: 15_000 });
  await d.getByLabel(result, { exact: true }).check();
  if (disclosure) await d.getByLabel("Disclosure").fill(disclosure);
  await d.getByRole("button", { name: "Save check" }).click(); await d.waitFor({ state: "detached", timeout: 15_000 });
};
const prepare = async () => {
  await card.getByRole("button", { name: "Prepare retainer" }).click();
  const prep = p.getByRole("dialog", { name: "Prepare retainer" });
  await prep.getByLabel("Template").locator("option", { hasText: `Starter ${run}` }).waitFor({ state: "attached", timeout: 10_000 });
  await prep.getByRole("button", { name: "Prepare retainer" }).click();
  await p.waitForURL(/\/front-office\/retainers\//, { timeout: 15_000 }); await status.waitFor({ timeout: 15_000 });
};

try {
  // The firm's template, by screens: the starter (it has no {conflict.disclosure}).
  await p.goto(`${BASE}/front-office/pipeline`); await p.getByRole("navigation", { name: "Sales" }).getByRole("link", { name: "Retainer templates" }).click();
  await p.getByRole("heading", { name: "Retainer templates" }).waitFor({ timeout: 30_000 });
  const dlS = p.waitForEvent("download"); await p.getByRole("button", { name: "Download a starter template" }).click();
  const starter = await (await dlS).path();
  await p.getByRole("button", { name: "Upload template" }).click();
  const up = p.getByRole("dialog", { name: "Upload template" });
  await up.getByLabel("Name").fill(`Starter ${run}`); await up.getByLabel("Template file (.docx)").setInputFiles(starter);
  await up.getByRole("button", { name: "Upload template" }).click(); await up.waitFor({ state: "detached", timeout: 15_000 });
  ok("S17 setup: the starter template is uploaded by screens and is the one active template", sql(`select count(*) from fo_retainer_template where firm_id = '${firmId}' and active`) === "1");

  // ------------------------------------------------------------------------------------------------ M1
  await check(PA.id, "No conflict"); await prepare();
  await p.getByLabel("Fee 1: amount").fill("1500");
  await p.getByRole("button", { name: "Save as version 2" }).click();
  await p.locator("[data-version]", { hasText: "Version 2" }).waitFor({ timeout: 15_000 });
  await p.getByLabel("Fee 1: amount").fill("1750");   // typed, not saved
  const saveOn = await p.getByRole("button", { name: "Save as version 3" }).isEnabled();
  await p.locator("[data-check-and-send]").click();
  const sendPanel = p.getByRole("dialog", { name: /^Send to .* to sign$/ }); await sendPanel.waitFor({ timeout: 10_000 });
  const panelText = (await sendPanel.innerText()).replace(/\s+/g, " ");
  await shot("M1-send-panel-after-typing-1750");
  await sendPanel.getByRole("button", { name: /^Send to / }).click();
  await status.filter({ hasText: "Sent" }).waitFor({ timeout: 15_000 }).catch(() => undefined);
  const ra = await ret(PA.id), sent = ra.versions.find((v) => v.sentAt);
  const typedVisible = (await p.getByLabel("Fee 1: amount").count()) ? await p.getByLabel("Fee 1: amount").inputValue() : "(no field)";
  console.log(`NOTE  M1: before Check and send, "Save as version 3" enabled: ${saveOn}; the Send panel says: "${panelText.slice(0, 240)}"; sent: version ${sent?.n} at ${sent?.fees[0]?.amountMinor} cents; versions: ${ra.versions.length}; the fee field now: ${typedVisible}`);
  ok("S17 M1: Check and send with a typed, unsaved fee (1,750.00 over a saved 1,500.00) does not drop it silently: the Send panel shows 1,750.00 or says there are unsaved changes, or what is sent carries 1,750.00",
    /1,750\.00/.test(panelText) || /unsaved|not saved|save (your|the) change/i.test(panelText) || sent?.fees[0]?.amountMinor === 175000n,
    { panel: panelText.slice(0, 200), sentVersion: sent?.n, sentCents: String(sent?.fees[0]?.amountMinor) });
  await shot("M1-after-send");

  // ------------------------------------------------------------------------------------------------ M4
  await check(PB.id, "No conflict"); await prepare();
  await p.getByLabel("Fee 1: amount").fill("1500");
  await p.getByRole("button", { name: "Save as version 2" }).click();
  await p.locator("[data-version]", { hasText: "Version 2" }).waitFor({ timeout: 15_000 });
  const blocker = await p.locator('[data-blocker="signer"]').innerText().catch(() => "");
  await shot("M4-signer-needs-email");
  ok("S17 M4 setup: the draft for a client with no email says the signer needs an email, and to add it on the client's record then save a new version here", /needs an email/.test(blocker) && /then save a new version here/.test(blocker), blocker);
  const retainerUrl = p.url();
  await p.locator('[data-blocker="signer"]').getByRole("link").click();
  await card.waitFor({ timeout: 30_000 });
  const onProspect = p.url();
  const emailControls = await p.getByLabel(/e-?mail/i).count() + await p.getByRole("button", { name: /e-?mail|edit (details|contact|person)/i }).count() + await p.getByRole("link", { name: /e-?mail|edit (details|contact|person)/i }).count();
  await shot("M4-the-record-link-lands-here");
  console.log(`NOTE  M4: the blocker's link opens ${onProspect.replace(BASE, "")}; email fields or edit controls found there: ${emailControls}`);
  ok("S17 M4 (a): the client's record the blocker links to offers a way to add the email by screens", emailControls > 0, { url: onProspect.replace(BASE, ""), emailControls });
  // Labelled setup: the email as if added (no screen found above); then back to the draft.
  sql(`update fo_person set email = 's17b.${run}@example.com', updated_at = now() where id = '${PB.pid}'`);
  await p.goto(retainerUrl); await status.waitFor({ timeout: 15_000 });
  const saveV3 = p.getByRole("button", { name: "Save as version 3" });
  const pressable = (await saveV3.count()) > 0 && await saveV3.isEnabled();
  const valuesShowEmail = (await p.locator("[data-values]").innerText()).includes(`s17b.${run}@example.com`);
  const stillBlocked = (await p.locator('[data-blocker="signer"]').count()) > 0;
  await shot("M4-after-email-on-record");
  console.log(`NOTE  M4 (b): with the email on the record (SQL), "Save as version 3" pressable: ${pressable}; values show the email: ${valuesShowEmail}; the signer blocker still shown: ${stillBlocked}`);
  ok("S17 M4 (b): with the email on the client's record, the draft can take it: Save as a new version is pressable, or the values already show the email", pressable || valuesShowEmail, { pressable, valuesShowEmail, stillBlocked });

  // ------------------------------------------------------------------------------------------------ M5
  await check(PC.id, "Potential conflict", `Sample disclosure ${run}: the firm acted for a related party (Sample).`); await prepare();
  await p.getByLabel("Fee 1: amount").fill("1500");
  await p.getByRole("button", { name: "Save as version 2" }).click();
  await p.locator("[data-version]", { hasText: "Version 2" }).waitFor({ timeout: 15_000 });
  await p.locator("[data-check-and-send]").click();
  const s5 = p.getByRole("dialog", { name: /^Send to .* to sign$/ }); await s5.waitFor({ timeout: 10_000 });
  const refusedP = p.waitForResponse((r) => r.request().method() === "POST" && /\/retainers\/[^/]+\/send$/.test(new URL(r.url()).pathname), { timeout: 15_000 });
  await s5.getByRole("button", { name: /^Send to / }).click();
  const refused = await refusedP; const rb = await refused.json().catch(() => null) as { code?: string; detail?: string } | null;
  await p.waitForTimeout(500);
  const pageWords = (await p.locator("main, body").first().innerText()).replace(/\s+/g, " ");
  await shot("M5-send-refused");
  const templateControl = await p.getByLabel(/template/i).count() + await p.getByRole("button", { name: /template/i }).count() + await p.getByRole("combobox", { name: /template/i }).count();
  console.log(`NOTE  M5: Send answered ${refused.status()} ${rb?.code}: "${rb?.detail}"; the page shows the words: ${pageWords.includes("use a template with")}; template controls on the draft: ${templateControl}; status now ${(await ret(PC.id)).status}`);
  ok("S17 M5 setup: Send of the draft is refused 409 CONFLICT_DISCLOSURE_NOT_PRINTED telling the person to use a template with {conflict.disclosure}", refused.status() === 409 && rb?.code === "CONFLICT_DISCLOSURE_NOT_PRINTED" && /use a template with \{conflict\.disclosure\}/.test(rb?.detail ?? ""), rb);
  ok("S17 M5: the draft offers a way to do what the refusal says: a control to change its template", templateControl > 0, { templateControl });
} finally {
  await browser.close().catch(() => undefined);
  await db.$disconnect().catch(() => undefined);
}
process.exit(summary() ? 1 : 0);
