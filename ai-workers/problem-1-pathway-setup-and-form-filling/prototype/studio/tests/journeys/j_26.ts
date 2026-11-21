// J-26 (R1.26: public enquiry form, hardened against abuse; Lead 2 (series 3) on #2451: the journey merges in the item's
// last PR, FO-4w, P-728). It adds no feature: it walks the merged parts (FO-2's door, FO-4 part 1's hosted form, FO-4b's
// embed, FO-4w's settings) on an isolated copy of the running app (its own database and port, never :4400), by screens
// at 1440 px, and asserts the stored rows underneath with SQL on that copy.
//   W1 the firm's Owner signs in on the sign-in card, opens Sales › Settings › Web form, switches the form on (it starts
//      off; R1.26 QA-605: by the screen, never SQL; one audit line, before off and after on), adds
//      the firm's own site, saves, and copies the snippet. Fail: while off the hosted page says "not available"; a site
//      with a page is refused on its field and nothing is saved.
//      QA-617: the form has no consent wording, as a new firm's has none; switching it on links the firm's current
//      wording (its set-up one), so nothing about consent is set underneath. Only the thank-you text still is (no screen).
//   W2 a visitor reaches the firm's site (a page the journey serves, made of the copied snippet) from a campaign link
//      (?utm_source=google&utm_medium=cpc&utm_campaign=spring&gclid=…) and sends an enquiry through the embedded form:
//      the firm's thank-you text, one lead (door WEB_FORM) whose attribution reads spring, google, cpc, the click id and
//      the landing and referring page; no cookie or storage entry is left.
//   W3 the same send twice is one lead; a bot filling the hidden field is thanked the same and nothing is stored.
//   W4 a visitor on the hosted form (the link from the settings page): an empty send shows each field's message on its
//      field; a good send makes one lead with no campaign facts (none were on the page; nothing is guessed).
//   W5 ends at the next capability's first step (R1.27, leads list): the Owner's Leads › Unassigned shows both leads.
// Sample data only (the Sample firms of PF-3 and FO-1a); US$0, no model call; live AI off.
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j26 4426 start --ttl 30 AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on && trap 'zsh studio/tools/isolated.sh j26 4426 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_26.ts j26 4426
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j26", Number(process.argv[3] ?? 4426)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", ".."), DB = `xr_studio_${NAME}`;
const DBURL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-26", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DBURL, options: "-c TimeZone=UTC" }) });
const psql = existsSync("/opt/homebrew/opt/postgresql@18/bin/psql") ? "/opt/homebrew/opt/postgresql@18/bin/psql" : "psql";
const sql = (q: string) => execFileSync(psql, [DBURL, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n")[0];

// ------------------------------------------------------------------------------------------------ setup (Sample)
const run = Date.now().toString(36);
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
ok("J-26 setup: the Sample firm and its front office are seeded", !!A && fo.failed.length === 0, fo.failed);
// QA-617: no consent wording is published or linked here. The firm has the wording its set-up gave it (firm-seed.ts
// ensureBookingWording); the Owner's switch links it in W1.
const firmWording = sql(`select id from msg_consent_wording where firm_id = '${A}' and channel = 'EMAIL' and purpose = 'MARKETING' order by published_at desc, version desc limit 1`);
const thanks = `Thank you. We will be in touch within one working day. (Sample ${run})`;
// The form stays OFF here, with no consent wording, as the firm's set-up made it: the Owner switches it on through the
// screen in W1 (QA-605, QA-617). Only the thank-you text, which has no screen yet, is set underneath.
const formId = sql(`update fo_web_form set enabled = false, allowed_sites = '{}', thank_you_text = '${thanks}' where firm_id = '${A}' returning id`);
const OWNER = sql(`select s.email from platform_staff s join platform_role_grant g on g.staff_id = s.id where s.firm_id = '${A}' and g.role = 'OWNER' and s.status = 'ACTIVE' order by s.email limit 1`);
ok("J-26 setup: the Sample firm's web form is off, with no allowed site and no consent wording linked; the firm has its set-up wording; an Owner exists", !!formId && !!OWNER && !!firmWording && sql(`select enabled || '|' || coalesce(consent_wording_version_id::text, 'none') from fo_web_form where id = '${formId}'`) === "false|none");
const leadsOf = (given: string) => Number(sql(`select count(*) from fo_lead l join fo_person p on p.id = l.person_id where l.firm_id = '${A}' and p.given_names = '${given}'`));

// The firm's own site: whatever the Owner copied off the settings page, served as its page.
let pasted = "";
const site: Server = createServer((req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  const path = (req.url ?? "/").split("?")[0];
  if (path === "/blog") return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sample blog</title></head><body><main><h1>Moving to Canada (Sample)</h1><p><a id="go" href="/contact?utm_source=google&amp;utm_medium=cpc&amp;utm_campaign=spring&amp;gclid=j26-click">Ask the firm</a></p></main></body></html>`);
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Contact (Sample)</title></head><body><main><h1>Contact the Sample firm</h1>${pasted}</main></body></html>`);
});
await new Promise<void>((r) => site.listen(0, () => r()));
const SITE = `http://localhost:${(site.address() as AddressInfo).port}`;

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const newPage = async (clipboard = false): Promise<Page> => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  if (clipboard) await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e))); return p;
};
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const axe = async (name: string, p: Page) => { const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  ok(`${name}: axe finds no WCAG A/AA violation`, r.violations.length === 0, r.violations.map((v) => v.id).join(" ") || undefined); };

// ------------------------------------------------------------------------------------------------ W1 the Owner
const owner = await newPage(true);
await owner.goto(`${BASE}/front-office/leads`);
await owner.getByLabel("Firm key").fill("sample-firm"); await owner.getByLabel("Work email").fill(OWNER);
await owner.getByRole("button", { name: "Sign in" }).click();
await owner.getByRole("heading", { name: "Leads" }).waitFor({ timeout: 30_000 });
await owner.getByRole("navigation", { name: "Sales" }).getByRole("link", { name: "Web form" }).click();
await owner.getByRole("heading", { name: "Web form", level: 1 }).waitFor({ timeout: 20_000 });
const hostedOff = await owner.getByLabel("Hosted form page").inputValue();
const offProbe = await fetch(`${BASE}/api/public/forms/${hostedOff.split("/").pop()}`);
const offPost = await fetch(`${BASE}/api/public/forms/${hostedOff.split("/").pop()}/submissions`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
ok("J-26 W1 fail: while the form is off the page says so and the public door, read and send, answers \"not available\"", await owner.getByText("This form is off").isVisible() && offProbe.status === 404 && /not available/i.test(await offProbe.text()) && offPost.status === 404, { read: offProbe.status, send: offPost.status });
await owner.getByRole("button", { name: "Switch the form on" }).click();
await owner.getByText(/^Switched on\./).waitFor({ timeout: 15_000 });
ok("J-26 W1: the Owner switches the form on by screens (stored on; one audit line, before false, after true)", sql(`select enabled from fo_web_form where id = '${formId}'`) === "t" && sql(`select concat_ws('|', count(*), min(detail->>'enabled_before'), min(detail->>'enabled_after')) from audit_event where action = 'fo.web_form.enabled_changed' and entity_key = '${formId}'`) === "1|false|true" && await owner.getByText("This form is off").count() === 0);
ok("J-26 W1 (QA-617): the switch linked the firm's current consent wording (its set-up one), never a database edit; the audit line names the link", sql(`select consent_wording_version_id from fo_web_form where id = '${formId}'`) === firmWording && sql(`select detail->>'consentWordingVersionId_after' from audit_event where action = 'fo.web_form.enabled_changed' and entity_key = '${formId}'`) === firmWording);
await owner.getByLabel("Site 1", { exact: true }).fill(`${SITE}/contact`);
await owner.getByRole("button", { name: "Save sites" }).click();
await owner.getByText("Enter only the site, without a page").first().waitFor({ timeout: 15_000 });
ok("J-26 W1 fail: a site with a page is refused on its field; nothing saved", sql(`select cardinality(allowed_sites) from fo_web_form where id = '${formId}'`) === "0");
await owner.getByLabel("Site 1", { exact: true }).fill(SITE);
await owner.getByRole("button", { name: "Save sites" }).click();
await owner.getByText(/^Saved\. 1 site can show this form\./).waitFor({ timeout: 15_000 });
await owner.getByRole("button", { name: "Copy snippet" }).click(); await owner.getByText("Copied.").first().waitFor({ timeout: 5_000 });
pasted = await owner.evaluate(() => navigator.clipboard.readText());
const hosted = await owner.getByLabel("Hosted form page").inputValue();
ok("J-26 W1: the Owner saves the firm's site by screens (stored once, one audit line) and copies the snippet", sql(`select array_to_string(allowed_sites, ' ') from fo_web_form where id = '${formId}'`) === SITE && sql(`select count(*) from audit_event where action = 'fo.web_form.sites_changed' and entity_key = '${formId}'`) === "1" && pasted.includes("data-expatready-form") && pasted.includes("/api/public/embed/form.js"));
await axe("J-26 W1 settings", owner); await shot(owner, "j26-w1-settings-saved");

// ------------------------------------------------------------------------------------------------ W2 a visitor from a campaign
const lena = `Lena${run}`;
const visitor = await newPage();
const posts: string[] = []; visitor.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/submissions")) posts.push(r.postData() ?? ""); });
await visitor.goto(`${SITE}/blog`); await visitor.locator("#go").click();
await visitor.getByLabel("First name").waitFor({ timeout: 30_000 });
await visitor.getByLabel("First name").fill(lena); await visitor.getByLabel("Last name (optional)").fill("Park");
await visitor.getByLabel("Email", { exact: true }).fill(`lena-${run}@example.org`); await visitor.getByRole("checkbox").check();
await visitor.waitForTimeout(2200); await visitor.getByRole("button", { name: "Send my enquiry" }).click();
await visitor.locator('[data-form-state="thanks"]').waitFor({ timeout: 15_000 });
ok("J-26 W2: the visitor sees only the firm's thank-you text", (await visitor.locator('[data-form-state="thanks"]').innerText()).trim() === thanks);
const lead = sql(`select l.id || '|' || l.door from fo_lead l join fo_person p on p.id = l.person_id where p.given_names = '${lena}'`).split("|");
const att = sql(`select concat_ws('|', utm_campaign, utm_source, utm_medium, click_id, click_id_kind::text, landing_page, referrer_url) from fo_lead_attribution where lead_id = '${lead[0]}'`).split("|");
ok("J-26 W2: one lead by the web form door", leadsOf(lena) === 1 && lead[1] === "WEB_FORM", lead);
ok("J-26 W2: its attribution reads campaign spring, google / cpc, click id j26-click (GCLID), with the landing and referring page", att[0] === "spring" && att[1] === "google" && att[2] === "cpc" && att[3] === "j26-click" && att[4] === "GCLID" && att[5] === `${SITE}/contact?utm_source=google&utm_medium=cpc&utm_campaign=spring&gclid=j26-click` && att[6] === `${SITE}/blog`, att);
const left = await visitor.evaluate(async () => ({ cookie: document.cookie, local: localStorage.length, session: sessionStorage.length, idb: (await indexedDB.databases()).length }));
ok("J-26 W2: no cookie or storage entry is left in the visitor's browser", (await visitor.context().cookies()).length === 0 && left.cookie === "" && left.local === 0 && left.session === 0 && left.idb === 0, left);
await shot(visitor, "j26-w2-embed-thanks");

// ------------------------------------------------------------------------------------------------ W3 a repeat and a bot
const replay = await visitor.evaluate(async ([url, body]) => (await fetch(url, { method: "POST", mode: "cors", credentials: "omit", headers: { "content-type": "application/json" }, body })).status, [`${BASE}/api/public/forms/${pasted.match(/data-expatready-form="([^"]+)"/)?.[1]}/submissions`, posts[0]] as const);
ok("J-26 W3: the same send twice makes one lead", replay === 201 && leadsOf(lena) === 1, { replay, leads: leadsOf(lena) });
const botName = `Bot${run}`, bot = await newPage();
await bot.goto(`${SITE}/contact`); await bot.getByLabel("First name").waitFor({ timeout: 30_000 });
await bot.getByLabel("First name").fill(botName); await bot.getByLabel("Email", { exact: true }).fill(`bot-${run}@example.org`);
await bot.locator("[data-expatready-form] input[name=website]").evaluate((i: HTMLInputElement) => { i.value = "http://spam.example"; });
await bot.getByRole("button", { name: "Send my enquiry" }).click(); await bot.locator('[data-form-state="thanks"]').waitFor({ timeout: 15_000 });
ok("J-26 W3 fail: a bot filling the hidden field is thanked the same, told nothing, and nothing is stored", (await bot.locator('[data-form-state="thanks"]').innerText()).trim() === thanks && leadsOf(botName) === 0 && sql(`select count(*) from fo_person where email = 'bot-${run}@example.org'`) === "0");

// ------------------------------------------------------------------------------------------------ W4 the hosted form
const ana = `Ana${run}`, h = await newPage();
await h.goto(hosted); await h.getByLabel("First name").waitFor({ timeout: 30_000 });
await h.getByRole("button", { name: "Send my enquiry" }).click();
await h.getByText("Enter your first name.").first().waitFor({ timeout: 5_000 });
ok("J-26 W4 fail: an empty send on the hosted form shows each field's message on its field; nothing stored", await h.getByLabel("First name").getAttribute("aria-invalid") === "true" && await h.getByText("Enter your email.").first().isVisible());
await h.getByLabel("First name").fill(ana); await h.getByLabel("Email", { exact: true }).fill(`ana-${run}@example.org`);
await h.waitForTimeout(2200); await h.getByRole("button", { name: "Send my enquiry" }).click();
await h.locator('[data-form-state="thanks"]').waitFor({ timeout: 15_000 });
const anaLead = sql(`select l.id from fo_lead l join fo_person p on p.id = l.person_id where p.given_names = '${ana}'`);
ok("J-26 W4: a good send on the hosted form makes one lead, with no campaign facts (none on the page; nothing guessed)", leadsOf(ana) === 1 && sql(`select count(*) from fo_lead_attribution where lead_id = '${anaLead}'`) === "0");
await shot(h, "j26-w4-hosted-thanks");

// ------------------------------------------------------------------------------------------------ W5 the next step
await owner.goto(`${BASE}/front-office/leads?view=unassigned`); await owner.getByRole("heading", { name: "Leads" }).waitFor({ timeout: 20_000 });
await owner.getByText(lena).first().waitFor({ timeout: 15_000 });
ok("J-26 W5: the Owner's Leads › Unassigned shows both new leads (R1.27's first step)", await owner.getByText(lena).first().isVisible() && await owner.getByText(ana).first().isVisible());
await shot(owner, "j26-w5-unassigned");

ok("J-26: no page error in the browser", errors.length === 0, errors);
await browser.close(); site.close(); await db.$disconnect();
process.exit(summary() ? 1 : 0);
