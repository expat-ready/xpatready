// qa gate A for R1.33 (Phone numbers), 20 Nov, after FO-9b #2405 (P-317, P-348 (3)): by screens only, from R1.33's last
// output to the next capability's first step. R1.33 ends with a lead whose phone is readable E.164 (a web-form "Fix
// number" fixed by staff, or a trunk-0 spelling read at the door); the next capability is working that lead: Engage
// (R1.30 / R1.31's first step, J-30 W2). The walk passes if Engage takes each such lead to one Engaged prospect, the
// prospect's "From lead" link opens a lead page showing the number in E.164 with no Fix number, and underneath the
// engaged person holds that number, readable (the prospect page itself shows no contact details, by design; Engage does
// not read the phone, so this gate shows the number survives the step, not that the step uses it).
//   G1 a visitor sends the web form with "+44 (0) 20 7946 0958"; the Owner opens the lead: E.164 shown, no Fix number;
//   G2 Engage → Engage as Individual on that lead page: one prospect, Engaged; its "From lead" link back shows +442079460958
//      (the prospect page carries no contact details by design; a person goes back to the lead to call);
//   G3 a "12" lead fixed by Fix number to "(416) 555-0100": Engage → the prospect, then "From lead", shows +14165550100;
//   G4 underneath: each prospect's person holds the E.164 number, readable; no page error.
// Sample rows only; US$0, no model call. On an isolated copy started with PLATFORM_IDENTITY=local:
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_r133_gate_a_engage.ts <name> <port>
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { auditEvent } from "../../api/src/platform/audit/audit-event.ts";
import { ConsentStore } from "../../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "qa_r133g", Number(process.argv[3] ?? 4472)];
const WIDTH = Number(process.env.WIDTH ?? 1440);
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "qa", "reports", "2026-11-20-capability-r133", "shots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql } = client(PORT, DBNAME);
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
const browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
try {
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`);
  const wordingId = sql(`select consent_wording_version_id from fo_web_form where firm_id = '${A}' order by created_at limit 1`)
    || (await db.$transaction((tx) => new ConsentStore(auditEvent).publishWording(tx, { firmId: A, channel: "EMAIL", purpose: "MARKETING", locale: "en", text: "Send me news from the firm by email. I can stop at any time. (Sample)", by: "seed:qa-r133g" }))).id;
  const token = sql(`update fo_web_form set enabled = true, consent_wording_version_id = '${wordingId}' where firm_id = '${A}' returning public_token`).split("\n")[0];
  const email = sql(`select email from platform_staff where actor_id = 'user-R'`);
  const s = await (await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) })).json() as { token?: string };
  ok("R1.33 gate A setup: firm A's web form is on and its Owner is signed in", fo.failed.length === 0 && !!token && !!s.token);
  const errors: string[] = [];
  const pageAs = async (t: string | null): Promise<Page> => {
    const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 900 }, reducedMotion: "reduce" }), p = await ctx.newPage();
    if (t) await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
    p.on("pageerror", (e) => errors.push(String(e))); return p;
  };
  const shot = (p: Page, n: string) => p.screenshot({ path: join(SHOTS, `${n}-${WIDTH}.png`), fullPage: true });
  const sendForm = async (given: string, phone: string) => {
    const v = await pageAs(null);
    await v.goto(`${BASE}/front-office/web-form/${token}`);
    await v.getByLabel("First name", { exact: true }).waitFor({ timeout: 30_000 });
    await v.getByLabel("First name", { exact: true }).fill(given);
    await v.getByLabel("Last name (optional)").fill("Gate");
    await v.getByLabel("Email", { exact: true }).fill(`${given.toLowerCase()}@qa133.example`);
    await v.getByLabel("Phone (optional)").fill(phone);
    await v.waitForTimeout(2_600);
    await v.getByRole("button", { name: "Send my enquiry" }).click();
    await v.locator('[data-form-state="thanks"]').waitFor({ timeout: 20_000 });
    await v.context().close();
  };
  const owner = await pageAs(s.token!);
  const openLead = async (given: string) => {
    await owner.goto(`${BASE}/front-office/leads?view=unassigned`);
    const row = owner.locator("tr[data-lead-row]", { hasText: given }).first(); await row.waitFor({ timeout: 30_000 });
    await row.getByRole("link").first().click();
    await owner.getByRole("heading", { level: 1, name: new RegExp(given) }).waitFor({ timeout: 20_000 });
  };
  const engage = async () => {
    await owner.getByRole("button", { name: "Engage", exact: true }).click();
    await owner.getByRole("button", { name: "Engage as Individual" }).click();
    await owner.locator("[data-stage-now]").waitFor({ timeout: 20_000 });
    const stage = (await owner.locator("[data-stage-now]").innerText()).trim(), url = owner.url();
    // The prospect page names the person and links its lead; contact details live on the lead page (no phone or email
    // on the prospect page by design), so the walk follows "From lead" back, as a person would to call them.
    await owner.locator("dd a[href^='/front-office/leads/'], a[href^='/front-office/leads/']").filter({ hasText: /^L-\d+$/ }).first().click();
    await owner.getByRole("heading", { level: 1 }).waitFor({ timeout: 20_000 });
    await owner.waitForTimeout(300);
    return { stage, text: await owner.locator("main").innerText(), url };
  };

  // G1-G2: a trunk-0 spelling from the web form → lead → Engage → prospect
  const g = `Gale${run}`;
  await sendForm(g, "+44 (0) 20 7946 0958");
  await openLead(g);
  const leadText = await owner.locator("main").innerText();
  await shot(owner, "G1-lead-trunk0-read-e164");
  ok("R1.33 gate A G1: the lead page shows +442079460958 and no Fix number", leadText.includes("+442079460958") && !leadText.includes("Fix number"), leadText.slice(0, 300));
  const p1 = await engage();
  await shot(owner, "G2-prospect-after-engage");
  ok("R1.33 gate A G2: Engage makes a prospect in Engaged; its \"From lead\" link opens the lead, which shows +442079460958 with no Fix number", p1.stage === "Engaged" && p1.text.includes("+442079460958") && !p1.text.includes("Fix number"), { stage: p1.stage, url: p1.url, t: p1.text.slice(0, 400) });

  // G3: "12" → Fix number "(416) 555-0100" → Engage
  const h = `Hale${run}`;
  await sendForm(h, "12");
  await openLead(h);
  await owner.locator("[data-fix-number]").click();
  const field = owner.getByLabel("Phone", { exact: true }); await field.waitFor();
  await field.fill("(416) 555-0100"); await owner.getByRole("button", { name: "Save" }).click();
  await owner.locator("[data-phone-edit]").waitFor({ state: "detached", timeout: 10_000 });
  await owner.getByText("+14165550100").first().waitFor({ timeout: 10_000 });
  const p2 = await engage();
  await shot(owner, "G3-fixed-number-prospect");
  ok("R1.33 gate A G3: after Fix number \"(416) 555-0100\", Engage makes a prospect; \"From lead\" opens the lead showing +14165550100 with no Fix number", p2.stage === "Engaged" && p2.text.includes("+14165550100") && !p2.text.includes("Fix number"), { stage: p2.stage, t: p2.text.slice(0, 400) });

  // G4: underneath
  const under = sql(`select string_agg(p.given_names || ':' || p.phone || ':' || p.phone_readable || ':' || (select count(*) from fo_prospect x join fo_lead l on l.id = x.lead_id where l.person_id = p.id), ',' order by p.given_names) from fo_person p where p.given_names in ('${g}', '${h}')`);
  ok("R1.33 gate A G4: underneath, each engaged person holds the E.164 number, readable, with one prospect", under === `${g}:+442079460958:true:1,${h}:+14165550100:true:1`, under);
  ok("R1.33 gate A: no page error in the walk", errors.length === 0, errors);
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
