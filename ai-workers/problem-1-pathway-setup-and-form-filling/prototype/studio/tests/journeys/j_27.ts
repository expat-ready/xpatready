// J-27 (R1.27, every lead carries a source: form, embed with campaign, manual; a lead without one refused by the
// database; lists filter by source): a person's walk on an isolated copy of the running app (its own database and port;
// never :4400), by screens at 1440 px, with the data read underneath. It starts where J-26 ends (an enquiry in the
// Owner's Leads) and ends at the next capability's first step (R1.28: the lead's page, where its consent is read).
//   W1: a visitor sends the hosted web form → a WEB_FORM lead with the form's source, shown "Website form" on Leads;
//   W2: an embedded send with a campaign (the embed script's call, as J-26 W2 walks by screens) → the same source, and
//       the lead's page shows the campaign;
//   W3: the Owner adds a phone enquiry by screens (FO-4 Add a lead, QA-606): no source → "Pick a source." and nothing
//       saved; "Phone call" → a MANUAL lead with that source, owned by the Owner;
//   W4: underneath, a lead with no source and one with a blank source are refused by the database (fail case), and no
//       lead of the firm is without a source;
//   W5: Leads › All open › Source "Phone call" shows only the manual lead; "Website form" shows the two web leads (R1.30's
//       filter, reused); the walk ends on the manual lead's page.
// The firm's web form is switched on (and https://firm.example allowed, the site the embed sends from) by SQL, as an Owner does in Settings (QA-605: the switch by screens is #2556; J-26
// walks the settings). Sample rows only; US$0, no model call. Repeatable on a kept copy (names carry a run stamp).
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j27 4427 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j27 4427 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_27.ts j27 4427
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

const [NAME, PORT] = [process.argv[2] ?? "j27", Number(process.argv[3] ?? 4427)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-27", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
try {
  // ---------------------------------------------------------------------------------------------- setup (Sample)
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`);
  const wordingId = sql(`select consent_wording_version_id from fo_web_form where firm_id = '${A}' order by created_at limit 1`)
    || (await db.$transaction((tx) => new ConsentStore(auditEvent).publishWording(tx, { firmId: A, channel: "EMAIL", purpose: "MARKETING", locale: "en", text: "Send me news from the firm by email. I can stop at any time. (Sample)", by: "seed:J-27-test" }))).id;
  const token = sql(`update fo_web_form set enabled = true, consent_wording_version_id = '${wordingId}', allowed_sites = array['https://firm.example'] where firm_id = '${A}' returning public_token`);
  ok("J-27 setup: firm A has a front office and its web form is on", !!A && fo.failed.length === 0 && !!token, fo.failed);
  const [rId, rEmail] = sql(`select id || '|' || email from platform_staff where actor_id = 'user-R'`).split("|");   // firm A's Owner
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email: rEmail, secondStep: true }) });
  const tokR = ((await r.json()) as { token?: string }).token;
  if (!tokR) { console.error("STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local)"); process.exit(2); }
  const errors: string[] = [];
  async function pageAs(t: string | null): Promise<Page> {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
    if (t) await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
    p.on("pageerror", (e) => errors.push(String(e))); return p;
  }
  const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
  const leadOf = (given: string) => sql(`select l.id || '|' || l.door || '|' || l.source || '|' || coalesce(l.owner_staff_id::text, '-') from fo_lead l join fo_person p on p.id = l.person_id where p.given_names = '${given}'`).split("|");
  const formSource = sql(`select source from fo_web_form where firm_id = '${A}' order by created_at limit 1`);

  // ---------------------------------------------------------------- W1: the hosted form
  const web = `Wes${run}`;
  const visitor = await pageAs(null);
  await visitor.goto(`${BASE}/front-office/web-form/${token}`);
  await visitor.getByLabel("First name", { exact: true }).waitFor({ timeout: 30_000 });
  await visitor.getByLabel("First name", { exact: true }).fill(web);
  await visitor.getByLabel("Last name (optional)").fill("Sample");
  await visitor.getByLabel("Email", { exact: true }).fill(`wes.${run}@j27.example`);
  await visitor.waitForTimeout(2_500);   // the form's minimum fill time
  await visitor.getByRole("button", { name: "Send my enquiry" }).click();
  await visitor.locator('[data-form-state="thanks"]').waitFor({ timeout: 20_000 });
  const w1 = leadOf(web);
  ok("J-27 W1: the hosted form's enquiry is a WEB_FORM lead carrying the form's source", w1[1] === "WEB_FORM" && w1[2] === formSource && !!formSource, w1);

  // ---------------------------------------------------------------- W2: embedded, with a campaign
  const emb = `Emi${run}`;
  const form = await (await fetch(`${BASE}/api/public/forms/${token}`)).json() as { submissionId: string; loadStamp: string };
  await new Promise((res) => setTimeout(res, 2_500));
  const sent = await fetch(`${BASE}/api/public/forms/${token}/submissions`, { method: "POST", headers: { "content-type": "application/json", origin: "https://firm.example" }, body: JSON.stringify({
    givenNames: emb, familyName: "Sample", email: `emi.${run}@j27.example`, submissionId: form.submissionId, loadStamp: form.loadStamp,
    attribution: { utmSource: "google", utmMedium: "cpc", utmCampaign: `spring-${run}`, landingPage: "https://firm.example/contact" } }) });
  const w2 = leadOf(emb);
  ok("J-27 W2: an embedded send with a campaign is a WEB_FORM lead with the same source, its campaign kept", sent.status < 300 && w2[1] === "WEB_FORM" && w2[2] === formSource && sql(`select utm_campaign from fo_lead_attribution where lead_id = '${w2[0]}'`) === `spring-${run}`, { status: sent.status, w2 });
  const owner = await pageAs(tokR);
  await owner.goto(`${BASE}/front-office/leads/${w2[0]}`);
  await owner.getByRole("heading", { level: 1, name: new RegExp(emb) }).waitFor({ timeout: 30_000 });
  const w2page = await owner.locator("main").innerText();
  await shot(owner, "w2-embed-lead-campaign-1440");
  ok("J-27 W2: the lead's page shows its source and its campaign", w2page.includes("Website form") && w2page.includes(`spring-${run}`), w2page.slice(0, 400));

  // ---------------------------------------------------------------- W3: Add a lead by screens
  const man = `Mia${run}`;
  await owner.goto(`${BASE}/front-office/leads?view=all`);
  await owner.locator("[data-add-lead-open]").click();
  await owner.locator("[data-add-lead]").waitFor({ timeout: 20_000 });
  await owner.getByLabel("First name", { exact: true }).fill(man);
  await owner.getByLabel("Email", { exact: true }).fill(`mia.${run}@j27.example`);
  await owner.getByRole("button", { name: "Save lead" }).click();
  await owner.locator("[data-add-lead]").getByText("Pick a source.").waitFor({ timeout: 10_000 });
  await shot(owner, "w3-add-lead-no-source-1440");
  ok("J-27 W3 (fail): Add a lead with no source says \"Pick a source.\" at the field and saves nothing", sql(`select count(*) from fo_person where given_names = '${man}'`) === "0");
  await owner.getByLabel("Source", { exact: true }).fill("Phone call");
  await owner.getByRole("button", { name: "Save lead" }).click();
  await owner.getByRole("heading", { level: 1, name: new RegExp(man) }).waitFor({ timeout: 20_000 });
  const w3 = leadOf(man);
  await shot(owner, "w3-manual-lead-1440");
  ok("J-27 W3: with \"Phone call\" it is a MANUAL lead with that source, owned by the Owner, and its page says so", w3[1] === "MANUAL" && w3[2] === "Phone call" && w3[3] === rId && /Source\s*Phone call/.test(await owner.locator("main").innerText()), w3);

  // ---------------------------------------------------------------- W4: the database refuses a lead with no source
  const pid = sql(`select person_id from fo_lead where id = '${w3[0]}'`);
  const refused = (source: string) => { try { sql(`insert into fo_lead (id, firm_id, person_id, door, source, created_by, updated_at) values (gen_random_uuid(), '${A}', '${pid}', 'MANUAL', ${source}, 'test', now())`); return false; } catch { return true; } };
  ok("J-27 W4 (fail case): the database refuses a lead with no source (NULL) and one with a blank source", refused("null") && refused("'  '"));
  ok("J-27 W4: every lead of firm A carries a source", sql(`select count(*) from fo_lead where firm_id = '${A}' and (source is null or btrim(source) = '')`) === "0");

  // ---------------------------------------------------------------- W5: Leads filter by source, by screens
  const rowsShown = async () => (await owner.locator("tr[data-lead-row]").allInnerTexts()).join("\n");
  const pick = async (source: string) => {
    await owner.locator("[data-source-toggle]").click(); await owner.locator("#fo-source-list").waitFor();
    await owner.locator(`input[data-source="${source}"]`).click(); await owner.keyboard.press("Escape");
    await owner.locator(`[data-source-chip="${source}"]`).waitFor({ timeout: 10_000 }); await owner.waitForTimeout(400);
  };
  await owner.goto(`${BASE}/front-office/leads?view=all`);
  await owner.locator("tr[data-lead-row]").first().waitFor({ timeout: 20_000 });
  await pick("Phone call");
  const phone = await rowsShown();
  await shot(owner, "w5-leads-source-phone-call-1440");
  ok("J-27 W5: Leads › All open › Source \"Phone call\" shows the manual lead and neither web lead", phone.includes(man) && !phone.includes(web) && !phone.includes(emb), phone.slice(0, 300));
  await owner.locator("[data-source-clear]").click(); await owner.waitForTimeout(400);
  await pick(formSource);
  const webRows = await rowsShown();
  ok("J-27 W5: Source \"Website form\" shows both web leads and not the manual one", webRows.includes(web) && webRows.includes(emb) && !webRows.includes(man), webRows.slice(0, 300));
  await owner.goto(`${BASE}/front-office/leads/${w3[0]}`);
  await owner.getByRole("heading", { level: 1, name: new RegExp(man) }).waitFor({ timeout: 20_000 });
  await shot(owner, "w5-ends-on-the-lead-1440");
  ok("J-27: no page error in the walk", errors.length === 0, errors);
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
