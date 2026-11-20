// FO-4b (BACKLOG FO-4b; R1.26; AG-2-5 rules 2, 7, 10-11; AG-2-8a; AG-2-49 rules 1, 3, 4): the embed script in a real
// browser on a test host page served by this check (the firm's "own site", http://localhost:<host port>), built from
// the snippet the firm copies (web/…/embed/snippet.ts), against FO-2's real routes (no fake API). Each Done-when line
// is a pass and a fail: drawn on an allowed site, one enquiry with ?utm_campaign=spring → one lead whose attribution
// reads spring with the landing and referring page; a fresh submissionId per draw; the same send twice → one lead; a bot
// (honeypot, too fast, too many) refused without saying why and nothing saved; each field's message on the field; the
// same page on a site not allowed (http://127.0.0.1:<host port>) → not drawn, its send and pre-flight refused; no
// cookie or storage entry afterwards and no request after the form; a blocked script leaves the link, which opens the
// hosted form. axe-core (WCAG 2.2 AA) inside the shadow root, no sideways scroll, screenshots at 375 and 1440 px. US$0.
//   zsh studio/tools/isolated.sh screens_fo4b 4526 start && tsx studio/tests/check_fo4b_embed_browser.ts 4526 xr_studio_screens_fo4b
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { auditEvent } from "../api/src/platform/audit/audit-event.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { embedSnippet } from "../web/src/modules/front-office/embed/snippet.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4526), DBNAME = process.argv[3] ?? "xr_studio_screens_fo4b";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "fo-4b-embed", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
ok("FO-4b setup: the Sample firm and its front office are seeded", !!A && fo.failed.length === 0, fo.failed);

// The firm's "own site": one small server, reached as localhost (allowed) and as 127.0.0.1 (not allowed).
let token = "";
const CAMPAIGN_QUERY = "utm_source=google&utm_medium=cpc&utm_campaign=spring&gclid=abc123";   // the campaign a visitor arrives with
const hostServer: Server = createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>`
    + `<style>body{font-family:Georgia,serif;margin:0;padding:16px;color:#222}input{background:#fee}</style></head><body><main><h1>Sample firm's own site</h1>${body}<p id="after">The rest of the firm's page stays as it was.</p></main></body></html>`;
  res.setHeader("content-type", "text/html; charset=utf-8");
  // A firm with a strict CSP (break M1): our origin allowed for script and connect, no inline style.
  if (path === "/csp.html") { res.setHeader("content-security-policy", `default-src 'self'; script-src ${BASE}; connect-src ${BASE}; style-src 'self'`); return res.end(page("Contact us, strict (Sample)", `<h2>Contact us</h2>${embedSnippet(BASE, token)}`).replace(/<style>.*?<\/style>/, "")); }
  if (path === "/host.html") return res.end(page("Contact us (Sample)", `<h2 id="contact">Contact us</h2>${embedSnippet(BASE, token)}`));
  // The blog post links to the host page with the test's own fixed campaign query: nothing from the request reaches the page (CodeQL).
  if (path === "/ref.html") return res.end(page("A blog post (Sample)", `<p><a id="go" href="/host.html?${CAMPAIGN_QUERY.replace(/&/g, "&amp;")}">Contact the firm</a></p>`));
  res.statusCode = 404; res.end("not here");
});
await new Promise<void>((r) => hostServer.listen(0, () => r()));   // every address, so localhost (either family) and 127.0.0.1 reach it
const HP = (hostServer.address() as AddressInfo).port;
const SITE = `http://localhost:${HP}`, OTHER = `http://127.0.0.1:${HP}`;

const consent = new ConsentStore(auditEvent);
const wording = await db.$transaction((tx) => consent.publishWording(tx, { firmId: A, channel: "EMAIL", purpose: "MARKETING", locale: "en", text: "Send me news and offers from Sample Firm by email. I can stop at any time. (Sample; Unconfirmed: no counsel)", by: "seed:FO-4b-test" }));
token = sql(`update fo_web_form set enabled = true, allowed_sites = array['${SITE}'], consent_wording_version_id = '${wording.id}', thank_you_text = 'Thank you. We will be in touch within one working day. (Sample)' where firm_id = '${A}' returning public_token`);
ok("FO-4b setup: the form is on, with the test host page's site as its one allowed site", !!token);
if (!sql(`select 1 from fo_service where firm_id = '${A}' and label = 'Work permit (Sample)'`)) sql(`insert into fo_service (firm_id, label, sort_order, created_by) values ('${A}', 'Work permit (Sample)', 1, 'seed:FO-4b-test')`);
const leadsOf = (given: string) => Number(sql(`select count(*) from fo_lead l join fo_person p on p.id = l.person_id where l.firm_id = '${A}' and p.given_names = '${given}'`));
const allLeads = () => Number(sql(`select count(*) from fo_lead where firm_id = '${A}'`));

/** A raw call to our API with the headers a browser on another site would send. */
const raw = (method: string, path: string, headers: Record<string, string>, body?: unknown) => new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
  const data = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  const req = request({ host: "127.0.0.1", port: PORT, path, method, agent: false, headers: { ...headers, ...(data ? { "content-type": "application/json", "content-length": data.length } : {}) } }, (res) => {
    const c: Buffer[] = []; res.on("data", (b: Buffer) => c.push(b)); res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(c).toString("utf8") }));
  });
  req.on("error", reject); if (data) req.write(data); req.end();
});

// 1. The served script.
const js = await raw("GET", "/api/public/embed/form.js", {});
ok("FO-4b: the embed script is served by our API as JavaScript any site may load (nosniff, cross-origin resource policy)", js.status === 200 && /^text\/javascript/.test(String(js.headers["content-type"])) && js.headers["x-content-type-options"] === "nosniff" && js.headers["cross-origin-resource-policy"] === "cross-origin" && js.body.includes("data-expatready-form"), { status: js.status, type: js.headers["content-type"] });
ok("FO-4b: the script sets no cookie and uses no storage (no document.cookie, localStorage, sessionStorage or indexedDB in its source)", !/document\.cookie|localStorage|sessionStorage|indexedDB|set-cookie/i.test(js.body) && !js.headers["set-cookie"]);

// 2. CORS: the read and the pre-flight answer the allowed site only (AG-2-49 rule 4).
const readOk = await raw("GET", `/api/public/forms/${token}`, { origin: SITE });
const readOther = await raw("GET", `/api/public/forms/${token}`, { origin: OTHER });
ok("FO-4b: the form's read may be read by the allowed site's page (Access-Control-Allow-Origin names it, no credentials)", readOk.status === 200 && readOk.headers["access-control-allow-origin"] === SITE && !readOk.headers["access-control-allow-credentials"], readOk.headers["access-control-allow-origin"]);
ok("FO-4b fail: the same read from a site not allowed carries no CORS header, so that page cannot draw the form", readOther.headers["access-control-allow-origin"] === undefined, readOther.headers["access-control-allow-origin"]);
const pre = await raw("OPTIONS", `/api/public/forms/${token}/submissions`, { origin: SITE, "access-control-request-method": "POST", "access-control-request-headers": "content-type" });
const preOther = await raw("OPTIONS", `/api/public/forms/${token}/submissions`, { origin: OTHER, "access-control-request-method": "POST", "access-control-request-headers": "content-type" });
ok("FO-4b: a send's pre-flight from the allowed site is answered (POST, content-type)", pre.status === 204 && pre.headers["access-control-allow-origin"] === SITE && /POST/.test(String(pre.headers["access-control-allow-methods"])) && /content-type/i.test(String(pre.headers["access-control-allow-headers"])), { status: pre.status, h: pre.headers["access-control-allow-origin"] });
ok("FO-4b fail: the pre-flight from a site not allowed is refused in the form door's words, no CORS header", preOther.status === 403 && preOther.headers["access-control-allow-origin"] === undefined && /SITE_NOT_ALLOWED/.test(preOther.body), { status: preOther.status });
const preBad = await raw("OPTIONS", `/api/public/forms/not-a-token-at-all-xxxxxxxx/submissions`, { origin: SITE });
ok("FO-4b fail: a pre-flight for an unknown form is the one not-available answer, nothing about which forms exist", preBad.status === 404 && /FORM_NOT_AVAILABLE/.test(preBad.body) && preBad.headers["access-control-allow-origin"] === undefined, { status: preBad.status });

// The browser.
const browser: Browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function context(width = 1440): Promise<{ ctx: BrowserContext; p: Page }> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e))); return { ctx, p };
}
const axe = async (name: string, p: Page) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  ok(`${name}: axe finds no WCAG A/AA violation (the shadow root included)`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
const noSideways = async (name: string, p: Page) => ok(`${name}: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const host = (p: Page) => p.locator("[data-expatready-form]");
const stateOf = (p: Page) => host(p).getAttribute("data-expatready-state");
const reads: string[] = [];   // every submissionId the form's read handed out to a page
const watchReads = (p: Page) => p.on("response", async (r) => { if (r.request().method() === "GET" && r.url() === `${BASE}/api/public/forms/${token}`) { try { reads.push((await r.json() as { submissionId: string }).submissionId); } catch { /* not JSON */ } } });
async function fill(p: Page, v: { given: string; email: string; family?: string; tick?: boolean }) {
  await p.getByLabel("First name").fill(v.given); if (v.family) await p.getByLabel("Last name (optional)").fill(v.family);
  await p.getByLabel("Email", { exact: true }).fill(v.email); await p.getByLabel("Interested in (optional)").selectOption({ label: "Work permit (Sample)" });
  if (v.tick) await p.getByRole("checkbox").check();
}
const thanksText = "Thank you. We will be in touch within one working day. (Sample)";

// 3. Drawn on the allowed site; one enquiry with its campaign facts (AG-2-5 rules 2 and 7, AG-2-8a).
const { ctx: c1, p: v1 } = await context(375);
watchReads(v1);
const query = CAMPAIGN_QUERY;
await v1.goto(`${SITE}/ref.html?${query}`); await v1.locator("#go").click();
await v1.getByLabel("First name").waitFor({ timeout: 30_000 });
ok("FO-4b: on the allowed site the script draws the firm's form in place of the link, with its words and its list", await stateOf(v1) === "form" && await v1.locator("[data-expatready-form] h2").count() === 1 && await v1.getByLabel("Interested in (optional)").locator("option", { hasText: "Work permit (Sample)" }).count() === 1);
ok("FO-4b: the firm's page around the form is untouched (its heading and its next paragraph still there)", await v1.getByRole("heading", { name: "Sample firm's own site" }).isVisible() && await v1.locator("#after").isVisible());
await noSideways("FO-4b host page with the form at 375 px", v1); await shot(v1, "fo4b-01-drawn-375"); await axe("FO-4b form drawn on the host page at 375 px", v1);
// Each field's message on the field (the form's own checks, then the server's).
await v1.getByRole("button", { name: "Send my enquiry" }).click();
await v1.getByText("Enter your first name.").first().waitFor({ timeout: 5_000 });
const firstNameInvalid = await v1.getByLabel("First name").getAttribute("aria-invalid");
ok("FO-4b fail: an empty send says \"Enter your first name.\" and \"Enter your email.\" on each field and in a summary, nothing sent", firstNameInvalid === "true" && await v1.locator("#xr-givenNames-err").innerText() === "Enter your first name." && await v1.locator("#xr-email-err").innerText() === "Enter your email." && await v1.getByRole("alert").innerText().then((t) => t.includes("Please check the form")) && leadsOf(`Lena${run}`) === 0);
await shot(v1, "fo4b-02-field-messages-375"); await axe("FO-4b field messages", v1);
await v1.getByLabel("First name").fill("!!!"); await v1.getByLabel("Email", { exact: true }).fill(`lena-${run}@example.org`);
await v1.getByRole("button", { name: "Send my enquiry" }).click();
await v1.locator("#xr-givenNames-err:not([hidden])").waitFor({ timeout: 15_000 });
ok("FO-4b fail: the server's refusal of a field is shown on that field (a first name with no letter), nothing saved", (await v1.locator("#xr-givenNames-err").innerText()).length > 0 && await v1.getByLabel("First name").getAttribute("aria-invalid") === "true" && Number(sql(`select count(*) from fo_person where firm_id = '${A}' and email = 'lena-${run}@example.org'`)) === 0, await v1.locator("#xr-givenNames-err").innerText());
// The good send.
const lena = `Lena${run}`;
await fill(v1, { given: lena, family: "Park", email: `lena-${run}@example.org`, tick: true });
const posts: string[] = [];
v1.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith(`/api/public/forms/${token}/submissions`)) posts.push(r.postData() ?? ""); });
await v1.getByRole("button", { name: "Send my enquiry" }).dblclick();
await v1.locator('[data-form-state="thanks"]').waitFor({ timeout: 15_000 });
ok("FO-4b: the visitor sees only the firm's thank-you text", (await v1.locator('[data-form-state="thanks"]').innerText()).trim() === thanksText);
ok("FO-4b: a double press sends once (one POST) and makes one lead", posts.length === 1 && leadsOf(lena) === 1, { posts: posts.length, leads: leadsOf(lena) });
const leadId = sql(`select l.id from fo_lead l join fo_person p on p.id = l.person_id where l.firm_id = '${A}' and p.given_names = '${lena}'`);
const att = sql(`select coalesce(utm_source,'') || '|' || coalesce(utm_medium,'') || '|' || coalesce(utm_campaign,'') || '|' || coalesce(click_id,'') || '|' || coalesce(click_id_kind::text,'') || '|' || coalesce(landing_page,'') || '|' || coalesce(referrer_url,'') from fo_lead_attribution where lead_id = '${leadId}'`).split("|");
ok("FO-4b: the lead's attribution reads campaign spring, source google, medium cpc, click id abc123 (GCLID)", att[0] === "google" && att[1] === "cpc" && att[2] === "spring" && att[3] === "abc123" && att[4] === "GCLID", att);
ok("FO-4b: the lead's attribution keeps the landing page (the host page with its campaign) and the referring page", att[5] === `${SITE}/host.html?${query}` && att[6] === `${SITE}/ref.html?${query}`, att.slice(5));
const leadRow = sql(`select door || '|' || source || '|' || coalesce(source_detail,'') from fo_lead where id = '${leadId}'`).split("|");
ok("FO-4b: the lead arrived by the web form door with the form's source, like the hosted form's leads", leadRow[0] === "WEB_FORM" && !!leadRow[1], leadRow);
ok("FO-4b: the ticked box wrote one consent row from the form's own wording", Number(sql(`select count(*) from msg_consent c join fo_person p on p.id = c.subject_id where p.given_names = '${lena}'`)) === 1);
// The same send again (a replay of the browser's exact body from the allowed site) → still one lead (AG-2-84).
const replay = await v1.evaluate(async ([url, body]) => { const r = await fetch(url, { method: "POST", mode: "cors", credentials: "omit", headers: { "content-type": "application/json" }, body }); return { status: r.status, body: await r.json() as { thankYouText?: string } }; }, [`${BASE}/api/public/forms/${token}/submissions`, posts[0]] as const);
ok("FO-4b: the same send twice makes one lead (the replay is thanked the same, nothing new)", replay.status === 201 && replay.body.thankYouText === thanksText && leadsOf(lena) === 1 && Number(sql(`select count(*) from fo_lead_attribution where lead_id = '${leadId}'`)) === 1, replay);
// No tracking after the form, no cookie or storage left.
const after: string[] = []; v1.on("request", (r) => { if (r.url().startsWith(BASE)) after.push(r.url()); });
await v1.waitForTimeout(2500);
ok("FO-4b: no request to us after the form is sent (no tracking after the form)", after.length === 0, after);
const stored = await v1.evaluate(async () => ({ cookie: document.cookie, local: localStorage.length, session: sessionStorage.length, idb: (await indexedDB.databases()).length, caches: "caches" in self ? (await caches.keys()).length : 0 }));
ok("FO-4b: the browser holds no cookie or storage entry from the script (cookies, localStorage, sessionStorage, indexedDB, caches)", (await c1.cookies()).length === 0 && stored.cookie === "" && stored.local === 0 && stored.session === 0 && stored.idb === 0 && stored.caches === 0, stored);
await shot(v1, "fo4b-03-thanks-375"); await axe("FO-4b thank-you on the host page", v1);

// 4. A fresh submissionId per draw.
const { ctx: c2, p: v2 } = await context(1440);
watchReads(v2);
await v2.goto(`${SITE}/host.html`); await v2.getByLabel("First name").waitFor({ timeout: 30_000 });
await v2.reload(); await v2.getByLabel("First name").waitFor({ timeout: 30_000 });
ok("FO-4b: each draw takes a fresh submissionId from the form's read (three draws, three ids)", reads.length >= 3 && new Set(reads).size === reads.length, reads.length);
await noSideways("FO-4b host page at 1440 px", v2); await shot(v2, "fo4b-04-drawn-1440"); await axe("FO-4b form drawn at 1440 px", v2);
// 5. A bot through the embed: the honeypot, then a too-fast send. Thanked like anyone, nothing saved.
const bot = `Bot${run}`;
await fill(v2, { given: bot, email: `bot-${run}@example.org` });
await v2.locator("[data-expatready-form] input[name=website]").evaluate((i: HTMLInputElement) => { i.value = "http://spam.example"; });
const before = allLeads();
await v2.getByRole("button", { name: "Send my enquiry" }).click();
await v2.locator('[data-form-state="thanks"]').waitFor({ timeout: 15_000 });
ok("FO-4b fail: a bot that fills the hidden field through the embed is thanked the same, told nothing of why, and no lead, person or consent exists", (await v2.locator('[data-form-state="thanks"]').innerText()).trim() === thanksText && leadsOf(bot) === 0 && allLeads() === before && Number(sql(`select count(*) from fo_person where email = 'bot-${run}@example.org'`)) === 0);
const fast = await v2.evaluate(async ([base, tok, given]) => {
  const f = await (await fetch(`${base}/api/public/forms/${tok}`, { mode: "cors", credentials: "omit", cache: "no-store" })).json() as { submissionId: string; loadStamp: string };
  const r = await fetch(`${base}/api/public/forms/${tok}/submissions`, { method: "POST", mode: "cors", credentials: "omit", headers: { "content-type": "application/json" }, body: JSON.stringify({ submissionId: f.submissionId, loadStamp: f.loadStamp, givenNames: given, email: `${given.toLowerCase()}@example.org` }) });
  return { status: r.status, body: await r.json() as { thankYouText?: string } };
}, [BASE, token, `Fast${run}`] as const);
ok("FO-4b fail: a send under 2 s after the draw, from the allowed site, is thanked the same and nothing is saved", fast.status === 201 && fast.body.thankYouText === thanksText && leadsOf(`Fast${run}`) === 0, fast);

// 5b. A strict CSP on the firm's page (break M1): the hidden field stays unseen and unreachable, a person's send is a lead.
const { ctx: c6, p: v6 } = await context(1440);
const cspBlocked: string[] = []; v6.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) cspBlocked.push(m.text().slice(0, 120)); });
await v6.goto(`${SITE}/csp.html?gbraid=g-777`); await v6.getByLabel("First name").waitFor({ timeout: 30_000 });
const trapSeen = await v6.locator("[data-expatready-form] input[name=website]").isVisible();
ok("FO-4b fail (break M1): under a strict CSP the hidden field is not visible to a person", !trapSeen);
ok("FO-4b (break M1): under a strict CSP the form keeps its own styles (no inline style for the CSP to block)", await v6.getByRole("button", { name: "Send my enquiry" }).evaluate((b) => getComputedStyle(b).borderRadius) === "8px" && cspBlocked.length === 0, cspBlocked);
const strict = `Strict${run}`;
await fill(v6, { given: strict, email: `strict-${run}@example.org` }); await v6.keyboard.press("Tab");
await v6.waitForTimeout(2200); await v6.getByRole("button", { name: "Send my enquiry" }).click();
await v6.locator('[data-form-state="thanks"]').waitFor({ timeout: 15_000 });
ok("FO-4b (break M1): a person's send from the strict-CSP page makes one lead", leadsOf(strict) === 1);
const strictAtt = sql(`select coalesce(a.click_id,'') || '|' || coalesce(a.click_id_kind::text,'') from fo_lead_attribution a join fo_lead l on l.id = a.lead_id join fo_person p on p.id = l.person_id where p.given_names = '${strict}'`);
ok("FO-4b (break m3): a click id of another platform (gbraid) is kept with kind OTHER", strictAtt === "g-777|OTHER", strictAtt);
await shot(v6, "fo4b-08-strict-csp-1440");
// 5c. The form switched off after it was drawn (break m1): "This form is not available", nothing saved.
await v6.goto(`${SITE}/host.html`); await v6.getByLabel("First name").waitFor({ timeout: 30_000 });
sql(`update fo_web_form set enabled = false where public_token = '${token}' returning 1`);
const offName = `Off${run}`;
await fill(v6, { given: offName, email: `off-${run}@example.org` }); await v6.waitForTimeout(2200);
await v6.getByRole("button", { name: "Send my enquiry" }).click();
await v6.locator('[data-form-state="not-available"], [data-expatready-form] #xr-summary:not([hidden])').first().waitFor({ timeout: 15_000 });
ok("FO-4b fail (break m1): a form switched off after it was drawn says \"This form is not available.\" and saves nothing", (await v6.locator('[data-form-state="not-available"]').count()) === 1 && (await v6.locator('[data-form-state="not-available"]').innerText()).trim() === "This form is not available." && leadsOf(offName) === 0);
sql(`update fo_web_form set enabled = true where public_token = '${token}' returning 1`);

// 5d. A lost connection at the send (break R1): the answers stay and a retry is asked for; never "not available".
const { ctx: c7, p: v7 } = await context(1440);
await v7.goto(`${SITE}/host.html`); await v7.getByLabel("First name").waitFor({ timeout: 30_000 });
const lost = `Lost${run}`;
await fill(v7, { given: lost, email: `lost-${run}@example.org` }); await v7.waitForTimeout(2200);
await c7.setOffline(true);
await v7.getByRole("button", { name: "Send my enquiry" }).click();
await v7.locator('[data-form-state="not-available"], [data-expatready-form] #xr-summary:not([hidden])').first().waitFor({ timeout: 15_000 });
ok("FO-4b fail (break R1): offline at the send → \"Not sent\" with a retry line, the answers kept, never \"not available\"", await v7.locator('[data-form-state="not-available"]').count() === 0 && /check your connection and try again/.test(await v7.locator("#xr-summary").innerText()) && await v7.getByLabel("First name").inputValue() === lost);
await c7.setOffline(false);
await v7.getByRole("button", { name: "Send my enquiry" }).click();
await v7.locator('[data-form-state="thanks"]').waitFor({ timeout: 15_000 });
ok("FO-4b (break R1): back online, the same press sends: one lead", leadsOf(lost) === 1);
const offRead = await raw("GET", `/api/public/forms/not-a-token-at-all-xxxxxxxx`, { origin: OTHER });
ok("FO-4b (break R1): the door's generic not-available answer may be read by any page (Access-Control-Allow-Origin *, no credentials)", offRead.status === 404 && offRead.headers["access-control-allow-origin"] === "*" && !offRead.headers["access-control-allow-credentials"], offRead.headers["access-control-allow-origin"]);

// 6. The same page on a site not allowed: not drawn, the link stays, its send is refused.
const { ctx: c3, p: v3 } = await context(1440);
await v3.goto(`${OTHER}/host.html?utm_campaign=spring`);
await v3.waitForFunction(() => document.querySelector("[data-expatready-form]")?.getAttribute("data-expatready-state") === "link", undefined, { timeout: 20_000 });
ok("FO-4b fail: on a site not allowed the form is not drawn; the link to the hosted form stays", await v3.getByRole("link", { name: "Send us an enquiry" }).isVisible() && await v3.getByLabel("First name").count() === 0);
const offSend = await raw("POST", `/api/public/forms/${token}/submissions`, { origin: OTHER }, { submissionId: reads[reads.length - 1], loadStamp: "1.x", givenNames: `Other${run}`, email: `other-${run}@example.org` });
ok("FO-4b fail: a send from a site not allowed is refused (403, the door's own words, no CORS header) and nothing is saved", offSend.status === 403 && /SITE_NOT_ALLOWED/.test(offSend.body) && offSend.headers["access-control-allow-origin"] === undefined && leadsOf(`Other${run}`) === 0, { status: offSend.status });
await shot(v3, "fo4b-05-site-not-allowed-1440");

// 7. A blocked script leaves no broken page: the link opens the hosted form, which works.
const { ctx: c4, p: v4 } = await context(1440);
await v4.route("**/api/public/embed/form.js", (r) => r.abort());
await v4.goto(`${SITE}/host.html`);
await v4.waitForTimeout(1500);
ok("FO-4b fail: with the script blocked the page shows the link and nothing broken", await v4.getByRole("link", { name: "Send us an enquiry" }).isVisible() && await stateOf(v4) === null && await v4.locator("#after").isVisible());
await v4.getByRole("link", { name: "Send us an enquiry" }).click();
await v4.getByLabel("First name").waitFor({ timeout: 30_000 });
ok("FO-4b: the link opens the hosted form, which draws", v4.url().startsWith(`${BASE}/front-office/web-form/`));
await shot(v4, "fo4b-06-blocked-script-link-1440");

// 8. Too many sends (AG-2-49 rule 1, last: it fills this address's minute): refused, the visitor's answers kept, nothing saved.
const { ctx: c5, p: v5 } = await context(1440);
await v5.goto(`${SITE}/host.html`); await v5.getByLabel("First name").waitFor({ timeout: 30_000 });
const flood = await v5.evaluate(async ([url]) => { let n = 0; for (let i = 0; i < 40; i++) { try { const r = await fetch(url, { method: "POST", mode: "cors", credentials: "omit", headers: { "content-type": "application/json" }, body: "{}" }); if (r.status === 429) break; n++; } catch { break; } } return n; }, [`${BASE}/api/public/forms/${token}/submissions`] as const);
const late = `Late${run}`;
await fill(v5, { given: late, email: `late-${run}@example.org` }); await v5.waitForTimeout(2200);
await v5.getByRole("button", { name: "Send my enquiry" }).click();
await v5.getByRole("alert").filter({ hasText: "Not sent" }).waitFor({ timeout: 15_000 });
ok("FO-4b fail: past the per-address limit the send is refused with \"Not sent\" and a wait-and-retry line; the answers stay; no lead", flood < 40 && /wait a minute/i.test(await v5.getByRole("alert").innerText()) && await v5.getByLabel("First name").inputValue() === late && leadsOf(late) === 0, { flood });
await shot(v5, "fo4b-07-too-many-1440");

ok("FO-4b: no page error in the browser", errors.length === 0, errors);
for (const c of [c1, c2, c3, c4, c5, c6, c7]) await c.close();
await browser.close();
hostServer.close();
await db.$disconnect();
process.exit(summary() ? 1 : 0);
