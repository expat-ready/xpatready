// FO-6ds (R1.54; concept screens/FO-6ds/concept.md §6, approved by Lead 18 on #3220; AG-5-61; J-54 W9): "Send for
// signature" and the "Signature requests" list on the prospect page, in a real browser against FO-6d's real routes (no fake
// API): BR-1 to BR-10 and M4, each a pass and a fail; keyboard only; axe-core (WCAG 2.2 AA) on the page and the open panel;
// no sideways scroll at 375, 1024 and 1440 px, Send at least 44 px tall at 375; screenshots. BR-8's signed request is
// written underneath (its sealed copy put in the copy's own files), as FO-6 part 4's door and the provider's webhook would:
// the fake adapter's envelopes live in the server's process. Seeds the Sample firms itself. Sample values; US$0, no model
// call, no vendor call, no email. Legal points (e-signature identity): Unconfirmed: no counsel. Arguments: the isolated
// copy's port and database, both required (run-suites.sh passes its own copy's; the copy's files are var/isolated-<name>):
//   zsh studio/tools/isolated.sh screens_fo6ds 4566 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo6ds_send_browser.ts 4566 xr_studio_screens_fo6ds
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Locator, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2]), DBNAME = process.argv[3] ?? "", NAME = DBNAME.replace(/^xr_studio_/, "");
if (!PORT || !/^xr_studio_[a-z0-9_]+$/.test(DBNAME)) { console.log("usage: <port of an isolated copy, never 4400> <its database, xr_studio_<name>>"); process.exit(2); }
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "FO-6ds", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const { sql: rawSql, until } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const pdf = (tag: string, extra = "") => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% Sample ${tag} ${run}, not a real document\ntrailer << /Root 1 0 R ${extra}>>\n%%EOF\n`, "latin1");

await seedSampleFirms(db);
await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
const staffOf = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
const R = staffOf("user-R"), T = staffOf("user-T");   // Owner + Case Manager; T a second firm person
const role = (tag: string, r: string) => {
  const email = `fo6ds-${tag}-${run}@sample-firm.example.com`;
  const id = sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', '${email}', 'Sample ${tag} ${run}', 'fo6ds-${tag}-${run}', now()) returning id`);
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${id}', '${r}', 'seed:FO-6ds-test')`);
  return { id, email };
};
const RO = role("reader", "READ_ONLY"), BF = role("billing", "BILLING_FINANCE");
const person = (given: string, withEmail = true) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', '${given}${run}', 'Sample', ${withEmail ? `'fo6ds.${given.toLowerCase()}.${run}@example.com'` : "null"}, 'test', now()) returning id`);
const lead = (pid: string) => sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, state, engaged_at, engaged_by, created_by, updated_at) values (gen_random_uuid(), '${A}', '${pid}', 'MANUAL', 'WEBSITE', '${R.id}', 'ENGAGED', now(), 'test', 'test', now()) returning id`);
const engaged = (type: "INDIVIDUAL" | "CORPORATE", primary: string, company: string | null) => {
  const l = lead(primary);
  const id = sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, subject_company_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    values (gen_random_uuid(), '${A}', '${l}', '${type}', (select id from fo_stage where firm_id = '${A}' and pipeline = '${type}' and key = 'ENGAGED'), ${company ? "null" : `'${primary}'`}, ${company ? `'${company}'` : "null"}, '${primary}', '${R.id}', 'test', now()) returning id`);
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${id}'`);
  return id;
};
// Corporate prospect B (Sample Bakery): Client B with an email (primary contact), Client C without one (signatory).
const PB = person("ClientB"), PC = person("ClientC", false);
const CO = sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Sample Bakery Ltd ${run}', 'sample bakery ltd ${run}', 'test', now()) returning id`);
sql(`insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${CO}', '${PB}', 'PRIMARY', 'test'), ('${A}', '${CO}', '${PC}', 'SIGNATORY', 'test'); select 1`);
const B = engaged("CORPORATE", PB, CO);
const PA = person("ClientA"), IA = engaged("INDIVIDUAL", PA, null);   // Individual: one person with an email → pre-ticked
const PL = person("ClientL"), L = engaged("INDIVIDUAL", PL, null);    // made Lost below
const PS = person("ClientS"), S = engaged("INDIVIDUAL", PS, null);    // BR-8's signed and expired requests

async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tok = { R: await signIn(R.email), RO: await signIn(RO.email), BF: await signIn(BF.email) };
type Ans = { status: number; body: any; text: string };   // eslint-disable-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other checks
async function call(t: string, method: string, path: string, body?: unknown): Promise<Ans> {
  const form = body instanceof FormData;
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${t}`, ...(body && !form ? { "content-type": "application/json" } : {}) }, body: form ? body : body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let b: unknown = text; try { b = JSON.parse(text); } catch { /* not JSON */ } return { status: r.status, body: b, text };
}
const apiSend = (t: string, prospectId: string, signers: string[], title: string, bytes = pdf(title)) => {
  const f = new FormData(); f.append("title", title); f.append("prospectId", prospectId); f.append("signerPersonIds", signers.join(","));
  f.append("file", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), `${title}.pdf`); return call(t, "POST", "/front-office/signature-requests", f);
};
const requests = (prospectId: string) => Number(sql(`select count(*) from fo_signature_request r join fo_signing_document d on d.id = r.document_id where d.prospect_id = '${prospectId}'`));
const stageOf = (id: string) => sql(`select stage_id from fo_prospect where id = '${id}'`);

// The Lost prospect keeps an earlier request (BR-1 fail: the list stays).
const lr = await apiSend(tok.R, L, [PL], `Offer letter L ${run}`);
const lp = await call(tok.R, "GET", `/front-office/prospects/${L}`), reasons = await call(tok.R, "GET", "/front-office/prospects/lost-reasons");
const reasonId = (Array.isArray(reasons.body) ? reasons.body : reasons.body?.reasons ?? [])[0]?.id;
const lost = await call(tok.R, "POST", `/front-office/prospects/${L}/lost`, { reasonId, version: lp.body?.version });
ok("FO-6ds setup: the Lost prospect has one earlier request and is Lost", lr.status === 201 && lost.status === 200, { send: lr.status, lost: lost.text.slice(0, 200) });

const browser = await chromium.launch({ ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const pageAs = async (t: string, width = 1440, daysAhead = 0): Promise<Page> => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce", acceptDownloads: true });
  await ctx.route(/boldsign\.com|signing\.fake\.invalid/, (r) => r.abort());
  await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 40 * 86_400_000 })), t);
  const p = await ctx.newPage(); if (daysAhead) await p.clock.setFixedTime(new Date(Date.now() + daysAhead * 86_400_000)); p.on("pageerror", (e) => errors.push(String(e))); return p;
};
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const axe = async (p: Page, where: string) => {
  const r = await new AxeBuilder({ page: p }).withTags(TAGS).include("main, [role=dialog]").analyze(), bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`R1.54 FO-6ds axe-core (WCAG 2.2 AA): no serious or critical finding — ${where}`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes.map((x) => x.target.join(" ")).join(", ")}`));
};
const section = (p: Page) => p.locator("[data-signature-requests]");
const open = async (p: Page, prospectId: string) => {
  await p.goto(`${BASE}/front-office/prospects/${prospectId}`); await section(p).locator("[data-empty], [data-request], [data-load-error]").first().waitFor({ timeout: 30_000 });
};
const panelOf = (p: Page) => p.getByRole("dialog", { name: "Send for signature" });
const openPanel = async (p: Page) => { await section(p).getByRole("button", { name: "Send for signature" }).click(); const d = panelOf(p); await d.getByText("No firm signer").waitFor({ state: "attached" }); await d.getByRole("checkbox").first().waitFor(); return d; };
const pick = (d: Locator, name: string, bytes: Buffer) => d.getByLabel("File").setInputFiles({ name, mimeType: "application/pdf", buffer: bytes });
const fieldError = async (d: Locator, label: string) => (await d.getByLabel(label).getAttribute("aria-invalid")) === "true" ? (await d.locator("[role=alert]").allInnerTexts()).join(" | ") : "";

const r = await pageAs(tok.R);
try {
  // ------------------------------------------------------------------------------------------------ BR-1, BR-4 (J-54 W9)
  await open(r, B);
  ok("R1.54 J-54 W9 / FO-6ds BR-1 pass: Corporate prospect B's page offers \"Send for signature\" to the Owner", await section(r).getByRole("button", { name: "Send for signature" }).count() === 1);
  ok("R1.54 FO-6ds BR-8 empty: \"No documents sent for signature yet.\"", (await section(r).locator("[data-empty]").innerText()).startsWith("No documents sent for signature yet."));
  await shot(r, "section-empty-1440"); await axe(r, "the prospect page with the Signature requests section");
  const d = await openPanel(r);
  const cbB = d.getByRole("checkbox", { name: new RegExp(`ClientB${run}`) }), cbC = d.getByRole("checkbox", { name: new RegExp(`ClientC${run}`) });
  ok("R1.54 FO-6ds BR-4 pass: on a Corporate prospect its people are listed; Client B (the one with an email) is pre-ticked", await cbB.isEnabled() && await cbB.isChecked());
  ok("R1.54 FO-6ds BR-4 fail: Client C (no email) shows disabled with \"No email: add an email first\"", await cbC.isDisabled() && (await d.locator("label", { hasText: `ClientC${run}` }).innerText()).includes("No email: add an email first"));
  ok("R1.54 FO-6ds BR-5 pass: the firm signer is optional and none by default", await d.getByLabel("Firm signer (optional)").inputValue() === "");
  ok("R1.54 FO-6ds BR-10 pass: the panel says no one is emailed until the client signing page is live", (await d.innerText()).includes("no one is emailed until the client signing page is live"));
  await axe(r, "the open Send for signature panel");

  // ------------------------------------------------------------------------------------------------ BR-2, BR-3, BR-7 fails
  const n0 = requests(B);
  await d.getByRole("button", { name: "Send", exact: true }).click();
  ok("R1.54 FO-6ds BR-2 fail: no file → \"Choose a PDF to send.\" on File; nothing sent", (await fieldError(d, "File")).includes("Choose a PDF to send.") && requests(B) === n0);
  await pick(d, "Offer letter.pdf", Buffer.from("PK\u0003\u0004 a word file renamed, Sample", "latin1"));
  ok("R1.54 FO-6ds BR-7 pass: the title is pre-filled from the file name without \".pdf\"", await d.getByLabel("Title").inputValue() === "Offer letter");
  await pick(d, `${"\u{1F600}".repeat(150)}.pdf`, pdf("emoji")); const emo = await d.getByLabel("Title").inputValue();
  ok("R1.54 FO-6ds BR-7 (break m3, review mn-4): a long emoji file name pre-fills whole characters within the API's 200 UTF-16 units", emo.length <= 200 && emo.length >= 198 && !/[\uD800-\uDBFF]$/.test(emo) && Array.from(emo).every((c) => c === "\u{1F600}"), emo.length);
  await pick(d, "Offer letter.pdf", Buffer.from("PK\u0003\u0004 a word file renamed, Sample", "latin1"));
  await d.getByRole("button", { name: "Send", exact: true }).click(); await d.locator("[role=alert]").first().waitFor();
  ok("R1.54 FO-6ds BR-2 fail: a .docx renamed .pdf → the API's NOT_PDF words on File; no row", (await fieldError(d, "File")).includes("This file is not a PDF. Only a PDF can be sent for signature.") && requests(B) === n0, await fieldError(d, "File"));
  await pick(d, "Protected offer.pdf", pdf("protected", "/Encrypt 5 0 R ")); await d.getByRole("button", { name: "Send", exact: true }).click();
  await until(async () => (await fieldError(d, "File")).includes("protected"), 10_000);
  ok("R1.54 FO-6ds BR-2 fail: a PDF with /Encrypt → \"This PDF is protected. Upload an open copy.\" on File; no row", (await fieldError(d, "File")).includes("This PDF is protected. Upload an open copy.") && requests(B) === n0, await fieldError(d, "File"));
  await pick(d, "IMM5257 sample.pdf", pdf("form")); await d.getByRole("button", { name: "Send", exact: true }).click();
  await until(async () => (await fieldError(d, "File")).includes("Government"), 10_000);
  ok("R1.54 FO-6ds BR-3 fail: \"IMM5257 sample.pdf\" → the government-form words on File; no row", (await fieldError(d, "File")).includes("Government forms are not sent for signature this way. The client signs the form itself on paper or in the government's portal.") && requests(B) === n0, await fieldError(d, "File"));
  await pick(d, "Employment offer - Sample Worker.pdf", pdf("offer"));
  await d.getByLabel("Title").fill(""); await d.getByRole("button", { name: "Send", exact: true }).click();
  ok("R1.54 FO-6ds BR-7 fail: an emptied title → \"Enter a title.\"; nothing sent", (await fieldError(d, "Title")).includes("Enter a title.") && requests(B) === n0);
  await d.getByLabel("Title").fill("x".repeat(201)); await d.getByRole("button", { name: "Send", exact: true }).click();
  const long = await apiSend(tok.R, B, [PB], "y".repeat(201));
  ok("R1.54 FO-6ds BR-7 fail: 201 characters refused on the screen and by the API (422); nothing sent", (await fieldError(d, "Title")).includes("at most 200 characters") && long.status === 422 && requests(B) === n0, long.status);
  await d.getByLabel("Title").fill(`Employment offer - Sample Worker ${run}`);
  await cbB.uncheck(); await d.getByRole("button", { name: "Send", exact: true }).click();
  ok("R1.54 FO-6ds BR-4 fail: none ticked → \"Pick at least one person to sign.\"; nothing sent", (await d.locator("#fo-who-error").innerText()) === "Pick at least one person to sign." && requests(B) === n0);
  const forcedC = await apiSend(tok.R, B, [PC], `Forced ${run}`);
  ok("R1.54 FO-6ds BR-4 fail: a forced send to Client C (no email) → 422 SIGNER_NO_EMAIL; nothing sent", forcedC.status === 422 && forcedC.body?.code === "SIGNER_NO_EMAIL" && requests(B) === n0, forcedC.text.slice(0, 200));

  // ------------------------------------------------------------------------------------------------ BR-5 fail: firm signer made inactive meanwhile
  await cbB.check(); await d.getByLabel("Firm signer (optional)").selectOption(T.id);
  ok("R1.54 FO-6ds BR-5: a chosen firm signer says \"Signs after the clients.\"", (await d.innerText()).includes("Signs after the clients."));
  sql(`update platform_staff set status = 'SUSPENDED' where id = '${T.id}'`);
  await d.getByRole("button", { name: "Send", exact: true }).click(); await until(async () => !!(await fieldError(d, "Firm signer (optional)")), 10_000);
  ok("R1.54 FO-6ds BR-5 fail: a firm person made inactive meanwhile → \"The firm signer must be an active person of your firm.\" on the select; nothing sent",
    (await fieldError(d, "Firm signer (optional)")).includes("The firm signer must be an active person of your firm.") && requests(B) === n0, await fieldError(d, "Firm signer (optional)"));
  ok("R1.54 FO-6ds review MJ-1 fail: after FIRM_SIGNER_NOT_IN_FIRM the select reloads and the person no longer offered is cleared (shows and sends \"No firm signer\")",
    await d.getByLabel("Firm signer (optional)").inputValue() === "" && await d.getByLabel("Firm signer (optional)").locator(`option[value="${T.id}"]`).count() === 0);

  // ------------------------------------------------------------------------------------------------ BR-6, BR-2/3 pass, BR-5 pass, BR-9, BR-10
  const stage0 = stageOf(B);
  await d.getByRole("button", { name: "Send", exact: true }).dblclick();   // T still suspended: the cleared select sends no firm signer
  await d.waitFor({ state: "detached", timeout: 15_000 });
  sql(`update platform_staff set status = 'ACTIVE' where id = '${T.id}'`);
  const toast = await r.getByText(/^Recorded for signature:/).innerText({ timeout: 10_000 });
  await section(r).locator("[data-request]").first().waitFor();
  ok("R1.54 FO-6ds BR-6 pass/fail: a double click on Send makes exactly one request", requests(B) === n0 + 1, requests(B) - n0);
  const row = section(r).locator("[data-request]").first();
  ok("R1.54 FO-6ds BR-2/BR-3 pass: an ordinary PDF records a row \"0 of 1 signed\" for Client B", (await row.innerText()).includes(`Employment offer - Sample Worker ${run}`) && (await row.locator("[data-count]").innerText()) === "0 of 1 signed");
  ok("R1.54 FO-6ds BR-5 pass (and review MJ-1 recovery): the send after the firm signer was cleared has 0 firm signers (db)", sql(`select count(*) from fo_signer s join fo_signature_request q on q.id = s.request_id join fo_signing_document d on d.id = q.document_id where d.prospect_id = '${B}' and s.role = 'FIRM'`) === "0");
  ok("R1.54 FO-6ds focus: after Send the focus is on the new row", await r.evaluate(() => document.activeElement?.hasAttribute("data-request") ?? false));
  ok("R1.54 FO-6ds BR-9: the prospect's stage is unchanged after the send (db)", stageOf(B) === stage0);
  const words = `${toast}\n${await section(r).innerText()}`;
  ok("R1.54 FO-6ds BR-10 pass: toast \"Recorded for signature: <title>. No one is emailed yet.\", the pill \"Recorded\", its tip says no one is emailed",
    toast === `Recorded for signature: Employment offer - Sample Worker ${run}. No one is emailed yet.` && await row.locator("[data-status]").innerText() === "Recorded" && (await row.locator("[data-tip]").innerText()).includes("No one is emailed"), toast);
  ok("R1.54 FO-6ds BR-10 fail (correction (a)): no pill, toast or row reads \"Sent\" or claims an email went out", !/\bSent\b/.test(words) && !/\b(?:was|were|been)\s+emailed\b|\bemailed to\b|\bemail (?:was )?sent\b/i.test(words), words.slice(0, 300));
  await shot(r, "section-recorded-1440");

  // ------------------------------------------------------------------------------------------------ M4: no answer, and a 500
  const n1 = requests(B);
  await r.route("**/api/front-office/signature-requests", async (rt) => { if (rt.request().method() !== "POST") return rt.fallback(); await rt.fetch(); await rt.abort("connectionreset"); }, { times: 1 });
  let p2 = await openPanel(r); await pick(p2, "Lost answer.pdf", pdf("m4")); await p2.getByRole("button", { name: "Send", exact: true }).click();
  await p2.getByText("We could not confirm the send. Check the list below before sending again.").waitFor({ timeout: 15_000 });
  await until(async () => (await section(r).locator("[data-request]").count()) === n1 + 1, 10_000);
  ok("R1.54 FO-6ds M4 pass: the answer lost after the server recorded it → \"We could not confirm the send…\", the panel stays, the list shows exactly one new row",
    await p2.isVisible() && requests(B) === n1 + 1 && (await section(r).locator("[data-request]").count()) === n1 + 1);
  await r.keyboard.press("Escape"); await p2.waitFor({ state: "detached" });
  ok("R1.54 FO-6ds keyboard: Esc closes the panel", await p2.count() === 0);
  await r.route("**/api/front-office/signature-requests", (rt) => rt.request().method() !== "POST" ? rt.fallback() : rt.fulfill({ status: 500, contentType: "application/problem+json", body: JSON.stringify({ title: "Server error", status: 500 }) }), { times: 1 });
  p2 = await openPanel(r); await pick(p2, "Server error.pdf", pdf("m4b")); await p2.getByRole("button", { name: "Send", exact: true }).click();
  await p2.getByText("Could not send. Nothing was sent; please try again.").waitFor({ timeout: 15_000 });
  ok("R1.54 FO-6ds M4 fail: a 500 → \"Could not send. Nothing was sent; please try again.\"; no row", requests(B) === n1 + 1);
  await r.keyboard.press("Escape");
  await r.route("**/api/front-office/signature-requests", async (rt) => { if (rt.request().method() !== "POST") return rt.fallback(); await new Promise((w) => setTimeout(w, 1500)); await rt.fulfill({ status: 500, contentType: "application/problem+json", body: JSON.stringify({ title: "Server error", status: 500 }) }); }, { times: 1 });
  p2 = await openPanel(r); await pick(p2, "Closed early.pdf", pdf("m4c")); await p2.getByRole("button", { name: "Send", exact: true }).click();
  await p2.getByRole("button", { name: "Recording…" }).waitFor(); await r.keyboard.press("Escape"); await p2.waitFor({ state: "detached" });
  const late = await r.getByText("Could not send. Nothing was sent; please try again.").waitFor({ timeout: 10_000 }).then(() => true, () => false);
  ok("R1.54 FO-6ds break M4 fail: a send that fails after the panel was closed is still said (toast \"Could not send. Nothing was sent…\"); no row", late && requests(B) === n1 + 1);

  // ------------------------------------------------------------------------------------------------ BR-4 pass on an Individual; keyboard only
  const k = await pageAs(tok.R); await open(k, IA);
  for (let i = 0; i < 80 && !(await k.evaluate(() => document.activeElement?.textContent === "Send for signature")); i++) await k.keyboard.press("Tab");
  await k.keyboard.press("Enter"); const kd = panelOf(k); await kd.getByText("No firm signer").waitFor({ state: "attached" });
  const cbA = kd.getByRole("checkbox", { name: new RegExp(`ClientA${run}`) }); await cbA.waitFor();
  ok("R1.54 FO-6ds BR-4 pass: an Individual prospect's one person with an email is pre-ticked", await cbA.isChecked());
  ok("R1.54 FO-6ds keyboard: the panel opens on the File field", await k.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type === "file"));
  await kd.getByLabel("File").setInputFiles({ name: "Keyboard offer.pdf", mimeType: "application/pdf", buffer: pdf("kbd") });   // the OS file chooser is outside the page
  await cbA.focus(); await k.keyboard.press("Space"); const unticked = !(await cbA.isChecked()); await k.keyboard.press("Space");
  for (let i = 0; i < 20 && !(await k.evaluate(() => document.activeElement?.textContent === "Send")); i++) await k.keyboard.press("Tab");
  const nA = requests(IA); await k.keyboard.press("Enter"); await kd.waitFor({ state: "detached", timeout: 15_000 });
  await until(async () => k.evaluate(() => document.activeElement?.hasAttribute("data-request") ?? false), 10_000);
  ok("R1.54 FO-6ds keyboard only: Tab to the button, Enter, Space ticks, Tab to Send, Enter records one; the focus lands on the new row",
    unticked && requests(IA) === nA + 1 && await k.evaluate(() => document.activeElement?.hasAttribute("data-request") ?? false));
  await k.context().close();

  // ------------------------------------------------------------------------------------------------ BR-8: signed, expired, open never hidden
  const older = await apiSend(tok.R, S, [PS], `Older open ${run}`), signed = await apiSend(tok.R, S, [PS], `Signed letter ${run}`);
  const SQ = signed.body.id as string, stageS = stageOf(S), sealed = pdf("sealed copy"), sealedKey = `signing/${SQ}/${sha(sealed).slice(0, 16)}/sealed.pdf`;
  await new LocalFiles(join(STUDIO, "var", `isolated-${NAME}`, "front-office-files")).put(A, sealedKey, sealed, "application/pdf");
  rawSql(`begin; select set_config('app.firm_id', '${A}', true);
    update fo_signer set consented_at = now(), consent_text_version = 'v1', signed_at = now() where request_id = '${SQ}';
    update fo_signature_request set status = 'CLIENT_SIGNED' where id = '${SQ}';
    insert into fo_signing_evidence (id, firm_id, request_id, sealed_file_key, sealed_sha256, audit_file_key, audit_sha256, consent_text_version) values (gen_random_uuid(), '${A}', '${SQ}', '${sealedKey}', '${sha(sealed)}', 'signing/${SQ}/audit.pdf', '${"f".repeat(64)}', 'v1');
    update fo_signature_request set status = 'SIGNED' where id = '${SQ}'; commit;`);
  await open(r, S);
  const rowOf = (t: string) => section(r).locator("[data-request]", { hasText: t });
  const sr = rowOf(`Signed letter ${run}`), titles = await section(r).locator("[data-request] h3").allInnerTexts();
  ok("R1.54 FO-6ds BR-8 pass: a signed request shows \"Signed\", \"1 of 1 signed\" and \"Download signed copy\"", await sr.locator("[data-status]").innerText() === "Signed" && await sr.locator("[data-count]").innerText() === "1 of 1 signed" && await sr.getByRole("button", { name: /Download signed copy/ }).count() === 1);
  const [dl] = await Promise.all([r.waitForEvent("download"), sr.getByRole("button", { name: /Download signed copy/ }).click()]);
  const got = readFileSync(await dl.path());
  ok("R1.54 FO-6ds BR-8 pass: the signed copy downloaded is the sealed file (sha256 = sealedSha256)", sha(got) === sql(`select sealed_sha256 from fo_signing_evidence where request_id = '${SQ}'`));
  ok("R1.54 FO-6ds BR-8 fail: the older open request is never hidden after newer ones; newest first", titles.length === 2 && titles.indexOf(`Older open ${run}`) > titles.indexOf(`Signed letter ${run}`), titles);
  const later = await pageAs(tok.R, 1440, 15); await open(later, S);   // the browser's clock 15 days on: the open request is past its 14-day expiry
  const lo = later.locator("[data-request]", { hasText: `Older open ${run}` }), ls = later.locator("[data-request]", { hasText: `Signed letter ${run}` });
  ok("R1.54 FO-6ds BR-8 fail: a live request past its expiry reads \"Expired on <date>\" beside its pill (status kept); a signed one and today's never do",
    (await lo.locator("[data-expired]").innerText()).startsWith("Expired on ") && await lo.locator("[data-status]").innerText() === "Recorded" && await ls.locator("[data-expired]").count() === 0 && await section(r).locator("[data-expired]").count() === 0);
  await shot(later, "section-expired-1440"); await later.context().close();
  ok("R1.54 FO-6ds BR-9: the prospect's stage is unchanged after a signed request (db)", stageOf(S) === stageS && older.status === 201);
  await shot(r, "section-states-1440");

  // ------------------------------------------------------------------------------------------------ review MJ-1: people changed under an open panel
  const P1 = person("ClientD"), P2 = person("ClientE"), P3 = person("ClientF");
  const CO2 = sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Sample Garage Ltd ${run}', 'sample garage ltd ${run}', 'test', now()) returning id`);
  sql(`insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${CO2}', '${P1}', 'PRIMARY', 'test'), ('${A}', '${CO2}', '${P2}', 'SIGNATORY', 'test'), ('${A}', '${CO2}', '${P3}', 'SIGNATORY', 'test'); select 1`);
  const B2 = engaged("CORPORATE", P1, CO2);
  await open(r, B2); const m = await openPanel(r);
  const cb = (g: string) => m.getByRole("checkbox", { name: new RegExp(`${g}${run}`) });
  await pick(m, "Garage offer.pdf", pdf("garage")); await cb("ClientD").check(); await cb("ClientE").check(); await cb("ClientF").check();
  sql(`update fo_person set email = null where id = '${P2}'`);
  await m.getByRole("button", { name: "Send", exact: true }).click(); await m.locator("#fo-who-error").waitFor({ timeout: 10_000 });
  await until(async () => await cb("ClientE").isDisabled(), 10_000);
  ok("R1.54 FO-6ds review MJ-1 fail: an email removed meanwhile → SIGNER_NO_EMAIL on Who signs; the person reloads disabled and unticked, the others stay ticked; nothing sent",
    (await m.locator("#fo-who-error").innerText()).includes("has no email address") && !(await cb("ClientE").isChecked()) && await cb("ClientD").isChecked() && await cb("ClientF").isChecked() && requests(B2) === 0);
  sql(`update fo_company_contact set valid_from = now() - interval '2 minutes', valid_to = now() - interval '1 minute' where company_id = '${CO2}' and person_id = '${P3}'`);
  await m.getByRole("button", { name: "Send", exact: true }).click();
  await until(async () => (await m.locator("#fo-who-error").innerText().catch(() => "")).includes("on this prospect") && await cb("ClientF").count() === 0, 10_000);
  ok("R1.54 FO-6ds review MJ-1 fail: a person who left the company meanwhile → SIGNER_NOT_ON_PROSPECT; the list reloads without them and they are no longer picked; nothing sent",
    (await m.locator("#fo-who-error").innerText()).includes("Each signer must be a person on this prospect.") && await cb("ClientF").count() === 0 && requests(B2) === 0);
  await m.getByRole("button", { name: "Send", exact: true }).click(); await m.waitFor({ state: "detached", timeout: 15_000 });
  ok("R1.54 FO-6ds review MJ-1 pass: the next Send records with the one person still offered, without Cancel (db: one request, 1 client signer)",
    requests(B2) === 1 && sql(`select count(*) from fo_signer s join fo_signature_request q on q.id = s.request_id join fo_signing_document d on d.id = q.document_id where d.prospect_id = '${B2}' and s.person_id = '${P1}'`) === "1"
      && sql(`select count(*) from fo_signer s join fo_signature_request q on q.id = s.request_id join fo_signing_document d on d.id = q.document_id where d.prospect_id = '${B2}'`) === "1");

  // ------------------------------------------------------------------------------------------------ BR-1 by role and stage
  const ro = await pageAs(tok.RO); await open(ro, S);
  ok("R1.54 FO-6ds BR-1 pass: Read only sees the list and \"Download original\", no Send button",
    await section(ro).locator("[data-request]").count() === 2 && await section(ro).getByRole("button", { name: /Download original/ }).count() === 2 && await section(ro).getByRole("button", { name: "Send for signature" }).count() === 0);
  const roPost = await apiSend(tok.RO, S, [PS], `Read only ${run}`);
  ok("R1.54 FO-6ds BR-1 fail: a role without agent/portal:request-work → no button and its forced send is 403", roPost.status === 403, roPost.status);
  const bf = await pageAs(tok.BF); await open(bf, S);
  ok("R1.54 FO-6ds BR-1 pass: Billing sees the list, no downloads (no agent/document:show), no button",
    await section(bf).locator("[data-request]").count() === 2 && await section(bf).getByRole("button", { name: /Download/ }).count() === 0 && await section(bf).getByRole("button", { name: "Send for signature" }).count() === 0);
  await open(r, L);
  ok("R1.54 FO-6ds BR-1 fail: a Lost prospect → no Send button; its list stays", await section(r).getByRole("button", { name: "Send for signature" }).count() === 0 && await section(r).locator("[data-request]").count() === 1);
  await ro.context().close(); await bf.context().close();

  // ------------------------------------------------------------------------------------------------ screen sizes
  for (const w of [375, 1024, 1440]) {
    const p = await pageAs(tok.R, w); await open(p, S);
    const wide = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const dd = await openPanel(p), h = (await dd.getByRole("button", { name: "Send", exact: true }).boundingBox())?.height ?? 0;
    const wideP = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`R1.54 FO-6ds ${w} px: no sideways scroll on the page or with the panel open${w === 375 ? "; Send at least 44 px tall" : ""}`, wide <= 0 && wideP <= 0 && (w !== 375 || h >= 44), { wide, wideP, h });
    await shot(p, `panel-${w}`); await p.keyboard.press("Escape"); await shot(p, `section-${w}`);
    if (w === 375) await axe(p, "the section at 375 px");
    await p.context().close();
  }
  ok("R1.54 FO-6ds: no page error during the walk", errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
