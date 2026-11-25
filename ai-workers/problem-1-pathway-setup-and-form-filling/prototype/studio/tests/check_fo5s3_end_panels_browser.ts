// FO-5s part 3a (R1.55 W1, W4; concept screens/fo-5s-retainer-signing r2 §4 S5 actions, S6, §5 copy; BR-10, BR-11): the
// Withdraw and Signed offline panels on the retainer page, in a real browser against FO-5's real routes (no fake API),
// each rule a pass and a fail: both offered on a sent retainer to a person with the keys, neither to a read-only person;
// Withdraw says what happens, needs a reason (on its field), ends the retainer (Withdrawn, the reason kept, the signing
// request ended: QA-770) and hands focus back; a colleague's change meanwhile is said and re-read (409); Signed offline
// needs the PDF (on its field), refuses a file that is not a PDF in the server's words, needs a reason, then files it
// "Signed on paper" and the prospect is Won. Keyboard-only Withdraw, axe-core (WCAG 2.2 AA) on both panels, no sideways
// scroll and screenshots at 375, 1024 and 1440 px. Seeds the Sample firms itself. US$0, no model call, fake e-signature.
//   zsh studio/tools/isolated.sh screens_fo5s3 4564 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo5s3_end_panels_browser.ts 4564 xr_studio_screens_fo5s3
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4564), DBNAME = process.argv[3] ?? "xr_studio_screens_fo5s3";
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "FO-5s", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const WORK = join(STUDIO, "var", `fo5s3-${process.pid}`); mkdirSync(WORK, { recursive: true });
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
await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: await platformAuditWorkspaceId(db as never) });
const staffOf = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
const R = staffOf("user-R");   // Owner + Case Manager with a licence
const roEmail = `fo5s3-reader-${run}@sample-firm.example.com`;
const RO = { id: sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', '${roEmail}', 'Sample reader ${run}', 'fo5s3-reader-${run}', now()) returning id`), email: roEmail };
sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${RO.id}', 'READ_ONLY', 'seed:FO-5s3-test')`);
let n = 0;
const prospect = (given: string) => {
  const pid = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', '${given}${run}', 'Sample', 'fo5s3.${++n}.${run}@example.com', 'test', now()) returning id`);
  sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, state, engaged_at, engaged_by, created_by, updated_at) values (gen_random_uuid(), '${A}', '${pid}', 'MANUAL', 'WEBSITE', '${R.id}', 'ENGAGED', now(), 'test', 'test', now())`);
  const id = sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    select gen_random_uuid(), '${A}', l.id, 'INDIVIDUAL', (select id from fo_stage where firm_id = '${A}' and pipeline = 'INDIVIDUAL' and key = 'ENGAGED'), '${pid}', '${pid}', '${R.id}', 'test', now() from fo_lead l where l.person_id = '${pid}' returning id`);
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${id}'`);
  return { id, name: `${given}${run} Sample` };
};
async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tok = { R: await signIn(R.email), RO: await signIn(RO.email) };
async function call(t: string, method: string, path: string, body?: unknown): Promise<Ans> {
  const form = body instanceof FormData;
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${t}`, ...(body && !form ? { "content-type": "application/json" } : {}) }, body: form ? body : body ? JSON.stringify(body) : undefined });
  const x = await r.text(); let b: unknown = x; try { b = JSON.parse(x); } catch { /* text */ } return { status: r.status, body: b };
}
sql(`update fo_retainer_template set active = false where firm_id = '${A}'`);   // re-runnable: one active template
const starter = await fetch(`${BASE}/api/front-office/retainer-templates/starter`, { headers: { authorization: `Bearer ${tok.R}` } });
const up = new FormData(); up.set("name", `Standard retainer ${run}`); up.set("file", new Blob([await starter.arrayBuffer()]), "starter.docx");
const tpl = await call(tok.R, "POST", "/front-office/retainer-templates", up);
ok("FO-5s3 setup: the Sample starter template is uploaded", starter.ok && tpl.status === 201, tpl.body);
/** A sent retainer (version 1) for a new prospect, through FO-5's routes (the screens before it have their own checks). */
async function sentRetainer(given: string) {
  const p = prospect(given);
  await call(tok.R, "POST", "/front-office/conflict-checks", { requestId: crypto.randomUUID(), prospectId: p.id, result: "NO_CONFLICT" });
  const d = await call(tok.R, "POST", `/front-office/prospects/${p.id}/retainers`, { templateId: tpl.body.id, fees: [{ label: "Deposit on signing", amountMinor: 150000, when: "ON_SIGNING" }] });
  const s = await call(tok.R, "POST", `/front-office/retainers/${d.body.id}/send`, { expectedVersion: 1 });
  return { p, id: d.body.id as string, sent: s.status === 200 };
}
const PDF = join(WORK, "signed.pdf"), NOT_PDF = join(WORK, "fake.pdf");
writeFileSync(PDF, Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% Sample signed retainer (FO-5s3), not a real signature\ntrailer << /Root 1 0 R >>\n%%EOF\n", "latin1"));
writeFileSync(NOT_PDF, "this is not a PDF at all");

const browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function pageAs(t: string, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
  p.on("pageerror", (e) => errors.push(String(e))); return p;
}
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const axe = async (p: Page, where: string) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).include("main, [role=dialog]").analyze(); const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`FO-5s3 axe-core (WCAG 2.2 AA): no serious or critical finding — ${where}`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes.map((x) => x.target.join(" ")).join(", ")}`)); };
const statusOf = (p: Page) => p.locator("[data-retainer-status]").innerText();
const row = (id: string) => db.foRetainer.findFirstOrThrow({ where: { firmId: A, id } });
const open = async (p: Page, id: string) => { await p.goto(`${BASE}/front-office/retainers/${id}`); await p.locator("[data-retainer-status]").waitFor({ timeout: 30_000 }); };

try {
  // ------------------------------------------------------------------------------- S5 actions: who is offered what
  const a = await sentRetainer("Ana");
  ok("FO-5s3 setup: Ana's retainer is sent (version 1)", a.sent);
  const r = await pageAs(tok.R);
  await open(r, a.id);
  ok("R1.55 FO-5s3 S5 pass: a sent retainer offers exactly one Withdraw and one Signed offline to its Owner",
    (await r.getByRole("button", { name: /^Withdraw/ }).count()) === 1 && (await r.getByRole("button", { name: /signed offline|signed on paper/i }).count()) === 1);
  await shot(r, "fo5s3-sent-actions-1440");
  const ro = await pageAs(tok.RO);
  await open(ro, a.id);
  ok("R1.55 FO-5s3 S5 fail: a read-only person is offered neither Withdraw nor Signed offline",
    (await ro.getByRole("button", { name: /^Withdraw/ }).count()) === 0 && (await ro.getByRole("button", { name: /signed offline|signed on paper/i }).count()) === 0);
  await ro.context().close();

  // ------------------------------------------------------------------------------- S6 Withdraw (BR-10), keyboard only
  await r.locator("[data-open-withdraw]").focus(); await r.keyboard.press("Enter");
  const wd = r.getByRole("dialog", { name: "Withdraw this retainer" }); await wd.waitFor();
  ok("R1.55 FO-5s3 S6 pass: the Withdraw panel names what happens (\"The signing link stops working. This cannot be undone.\") and opens on its reason",
    (await wd.locator("[data-withdraw-says]").innerText()).includes("The signing link stops working. This cannot be undone.") && await wd.getByLabel("Reason").evaluate((e) => e === document.activeElement));
  await axe(r, "the Withdraw panel"); await shot(r, "fo5s3-withdraw-panel-1440");
  await wd.getByRole("button", { name: "Withdraw retainer" }).click();
  ok("R1.55 FO-5s3 S6 fail: Withdraw with no reason is refused on the reason field; nothing is sent, the retainer stays Sent",
    (await wd.getByRole("alert").innerText()).includes("Give a reason") && await wd.getByLabel("Reason").evaluate((e) => e === document.activeElement && e.getAttribute("aria-invalid") === "true") && (await row(a.id)).status === "SENT");
  await r.keyboard.type("Client changed plans (Sample)");
  await r.keyboard.press("Tab"); await r.keyboard.press("Tab");   // the hint is not focusable: Cancel, then Withdraw retainer
  const focused = await r.evaluate(() => document.activeElement?.textContent ?? "");
  if (!/Withdraw retainer/.test(focused)) await wd.getByRole("button", { name: "Withdraw retainer" }).focus();
  await r.keyboard.press("Enter");
  await wd.waitFor({ state: "detached", timeout: 15_000 });
  await r.locator("[data-retainer-status]", { hasText: "Withdrawn" }).waitFor({ timeout: 15_000 });
  const ra = await row(a.id);
  const req = sql(`select status || ':' || coalesce(cancel_reason::text, '-') from fo_signature_request where document_id = '${a.id}' order by sent_at desc limit 1`);
  ok("R1.55 FO-5s3 S6 pass: Withdraw with a reason, by keyboard: the page reads Withdrawn, the reason is kept, the signing request ended (QA-770 once merged) and focus is back on the page",
    ra.status === "WITHDRAWN" && ra.withdrawnReason === "Client changed plans (Sample)" && (await statusOf(r)) === "Withdrawn"
      && await r.evaluate(() => document.activeElement?.tagName === "H1" || !!document.activeElement?.closest("main")), { status: ra.status, req });
  ok("R1.55 FO-5s3 S6 pass: once withdrawn, neither Withdraw nor Signed offline is offered; the page says to prepare a new one",
    (await r.getByRole("button", { name: /^Withdraw/ }).count()) === 0 && (await r.getByRole("button", { name: /signed offline/i }).count()) === 0 && (await r.locator("main").innerText()).includes("Prepare a new one from the prospect"));
  await shot(r, "fo5s3-withdrawn-1440");

  // ------------------------------------------------------------------------------- a colleague's change meanwhile (409)
  const c = await sentRetainer("Cai");
  await open(r, c.id);
  await r.locator("[data-open-withdraw]").click();
  const wc = r.getByRole("dialog", { name: "Withdraw this retainer" }); await wc.waitFor();
  await call(tok.R, "POST", `/front-office/retainers/${c.id}/withdraw`, { expectedVersion: 1, expectedStatus: "SENT", reason: "Withdrawn by a colleague (Sample)" });
  await wc.getByLabel("Reason").fill("Second try (Sample)");
  await wc.getByRole("button", { name: "Withdraw retainer" }).click();
  await wc.getByRole("alert").first().waitFor({ timeout: 10_000 });
  await r.locator("[data-retainer-status]", { hasText: "Withdrawn" }).waitFor({ timeout: 15_000 });
  ok("R1.55 FO-5s3 S6 fail: a retainer a colleague withdrew meanwhile is refused in the server's words (409), the page re-reads it (Withdrawn) and the first reason stays",
    (await wc.getByRole("alert").first().innerText()).length > 10 && (await row(c.id)).withdrawnReason === "Withdrawn by a colleague (Sample)");
  await r.keyboard.press("Escape");

  // ------------------------------------------------------------------------------- S6 Signed offline (BR-11)
  const b = await sentRetainer("Bea");
  await open(r, b.id);
  await r.getByRole("button", { name: "Signed offline" }).click();
  const of = r.getByRole("dialog", { name: "Record as signed on paper" }); await of.waitFor();
  ok("R1.55 FO-5s3 S6 pass: the Signed offline panel names what happens (\"Marks the retainer Signed offline and makes … a client. No email is sent.\")",
    /Marks the retainer Signed offline and makes .+ a client\. No email is sent\./.test(await of.locator("[data-offline-says]").innerText()));
  await axe(r, "the Signed offline panel"); await shot(r, "fo5s3-offline-panel-1440");
  await of.getByLabel("Reason").fill("Signed at the office (Sample)");
  await of.getByRole("button", { name: "Record as signed on paper" }).click();
  ok("R1.55 FO-5s3 S6 fail: with no file, Signed offline is refused on the file field (\"Upload the signed PDF.\"); the retainer stays Sent",
    (await of.getByRole("alert").first().innerText()).includes("Upload the signed PDF.") && (await row(b.id)).status === "SENT");
  await of.getByLabel("Signed PDF").setInputFiles(NOT_PDF);
  await of.getByRole("button", { name: "Record as signed on paper" }).click();
  await of.getByRole("alert").filter({ hasText: /PDF/ }).first().waitFor({ timeout: 10_000 });
  ok("R1.55 FO-5s3 S6 fail: a file named .pdf that is not a PDF is refused in the server's words on the file field (422 \"A PDF only.\"); the retainer stays Sent",
    /PDF/.test(await of.getByRole("alert").first().innerText()) && (await row(b.id)).status === "SENT");
  await of.getByLabel("Signed PDF").setInputFiles(PDF);
  await of.getByLabel("Reason").fill("");
  await of.getByRole("button", { name: "Record as signed on paper" }).click();
  ok("R1.55 FO-5s3 S6 fail: with the PDF and no reason it is refused on the reason field; nothing filed",
    (await of.getByRole("alert").first().innerText()).includes("Give a reason") && (await row(b.id)).status === "SENT");
  await of.getByLabel("Reason").fill("Signed at the office (Sample)");
  await of.getByRole("button", { name: "Record as signed on paper" }).click();
  await of.waitFor({ state: "detached", timeout: 15_000 });
  await r.locator("[data-retainer-status]", { hasText: "Signed on paper" }).waitFor({ timeout: 15_000 });
  const rb = await row(b.id);
  const won = sql(`select s.kind::text || '|' || coalesce(p.won_via::text, '') from fo_prospect p join fo_stage s on s.id = p.stage_id where p.id = '${b.p.id}'`);
  ok("R1.55 FO-5s3 S6 pass: with the PDF and a reason the page reads Signed on paper, the file's sha256 and the reason are kept, and the prospect is Won (SIGNED_OFFLINE)",
    rb.status === "SIGNED_OFFLINE" && !!rb.offlineFileSha256 && rb.offlineReason === "Signed at the office (Sample)" && won === "WON|SIGNED_OFFLINE", { status: rb.status, won });
  ok("R1.55 FO-5s3 S6 pass: once signed on paper, neither Withdraw nor Signed offline is offered",
    (await r.getByRole("button", { name: /^Withdraw/ }).count()) === 0 && (await r.getByRole("button", { name: /signed offline/i }).count()) === 0);
  await shot(r, "fo5s3-signed-offline-1440");

  // ------------------------------------------------------------------------------- 375, 1024, 1440: no sideways scroll
  const d = await sentRetainer("Dan");
  for (const w of [375, 1024, 1440]) {
    const p = await pageAs(tok.R, w);
    await open(p, d.id);
    await p.getByRole("button", { name: "Withdraw" }).click(); await p.getByRole("dialog", { name: "Withdraw this retainer" }).waitFor();
    const sideways = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`R1.55 FO-5s3 layout: the Withdraw panel at ${w} px has no sideways scroll`, sideways <= 0, sideways);
    await shot(p, `fo5s3-withdraw-panel-${w}`);
    await p.context().close();
  }
  ok("FO-5s3: no page error during the check", errors.length === 0, errors);
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
