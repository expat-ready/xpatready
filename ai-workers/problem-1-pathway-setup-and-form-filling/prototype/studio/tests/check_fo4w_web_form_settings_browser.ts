// FO-4w (R1.26; concept fo-4-sales r2 screen 2b, the part the row names; AG-2-5 rules 1, 2, 13; AG-2-49 rule 4): the
// web-form settings in a real browser against the real routes: Owner sets the allowed sites by screens (each rule a pass
// and a fail: a site with a page, another scheme, not a site; duplicates merged; at most 20; a stale save says so and
// reloads), copies the snippet (embed/snippet.ts's text) and the hosted link; a Case Officer has no menu item, the page
// says so, the API refuses (403), nobody is 401, another firm's form is 404; one audit line per save; the copied
// snippet draws the form on the saved site. axe (WCAG 2.2 AA), keyboard-only save, no sideways scroll, screenshots at
// 375 and 1440 px. Sample firms (PF-3, FO-1a seeds). US$0, live AI off.
//   zsh studio/tools/isolated.sh screens_fo4w 4527 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo4w_web_form_settings_browser.ts 4527 xr_studio_screens_fo4w
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
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
const PORT = Number(process.argv[2] ?? 4527), DBNAME = process.argv[3] ?? "xr_studio_screens_fo4w";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "fo-4w-web-form-settings", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
ok("FO-4w setup: the Sample firm and its front office are seeded", !!A && fo.failed.length === 0, fo.failed);
const wording = await db.$transaction((tx) => new ConsentStore(auditEvent).publishWording(tx, { firmId: A, channel: "EMAIL", purpose: "MARKETING", locale: "en", text: "Send me news from Sample Firm by email. (Sample; Unconfirmed: no counsel)", by: "seed:FO-4w-test" }));
const formId = sql(`update fo_web_form set enabled = true, allowed_sites = '{}', consent_wording_version_id = '${wording.id}' where firm_id = '${A}' returning id`);
const token = sql(`select public_token from fo_web_form where id = '${formId}'`);
const otherForm = sql(`select id from fo_web_form where firm_id <> '${A}' limit 1`);
const otherBefore = sql(`select array_to_string(allowed_sites, ' ') from fo_web_form where id = '${otherForm}'`);
const staffWith = (role: string) => sql(`select s.email from platform_staff s join platform_role_grant g on g.staff_id = s.id where s.firm_id = '${A}' and g.role = '${role}' and s.status = 'ACTIVE' order by s.email limit 1`);
const OWNER = staffWith("OWNER"), OFFICER = staffWith("CASE_OFFICER");
ok("FO-4w setup: the Sample firm has an Owner and a Case Officer", !!OWNER && !!OFFICER, { OWNER: !!OWNER, OFFICER: !!OFFICER });
async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tokens = { owner: await signIn(OWNER), officer: await signIn(OFFICER) };
const api = (tok: string | null, method: string, path: string, body?: unknown) => fetch(`${BASE}/api${path}`, { method, headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) as Record<string, any> | null }));   // eslint-disable-line @typescript-eslint/no-explicit-any -- answers read loosely in checks
const stored = () => sql(`select array_to_string(allowed_sites, ' ') from fo_web_form where id = '${formId}'`);
const audits = () => Number(sql(`select count(*) from audit_event where action = 'fo.web_form.sites_changed' and entity_key = '${formId}'`));

// The firm's "own site" for the last check: the page built from the snippet as copied off the screen.
let copied = "";
const host: Server = createServer((_req, res) => { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sample site</title></head><body><main><h1>Sample site</h1>${copied}</main></body></html>`); });
await new Promise<void>((r) => host.listen(0, () => r()));
const SITE = `http://localhost:${(host.address() as AddressInfo).port}`;

// API: who may, and the rules (each a pass and a fail).
const nobody = await api(null, "GET", "/front-office/web-forms"), officerGet = await api(tokens.officer, "GET", "/front-office/web-forms");
const officerPut = await api(tokens.officer, "PUT", `/front-office/web-forms/${formId}/allowed-sites`, { sites: [SITE], version: new Date().toISOString() });
ok("FO-4w fail: nobody signed in → 401; a Case Officer (no agent/prospect:configure-form) → 403 on the read and the save; nothing saved", nobody.status === 401 && officerGet.status === 403 && officerPut.status === 403 && stored() === "", { nobody: nobody.status, get: officerGet.status, put: officerPut.status });
const read = await api(tokens.owner, "GET", "/front-office/web-forms");
const mine = (read.body?.forms ?? []).find((f: { id: string }) => f.id === formId);
ok("FO-4w: the Owner reads the firm's form: state, sites, token, hosted page, version; and only the firm's own forms", read.status === 200 && !!mine && mine.publicToken === token && mine.hostedUrl === `${BASE}/front-office/web-form/${token}` && !(read.body?.forms ?? []).some((f: { id: string }) => f.id === otherForm), { status: read.status, n: read.body?.forms?.length });
const other = await api(tokens.owner, "PUT", `/front-office/web-forms/${otherForm}/allowed-sites`, { sites: [SITE], version: new Date().toISOString() });
ok("FO-4w fail: another firm's form is the one not-found (404), unchanged", other.status === 404 && sql(`select array_to_string(allowed_sites, ' ') from fo_web_form where id = '${otherForm}'`) === otherBefore, other.status);
const tooMany = await api(tokens.owner, "PUT", `/front-office/web-forms/${formId}/allowed-sites`, { sites: Array.from({ length: 21 }, (_, i) => `https://s${i}.example.com`), version: mine?.version });
ok("FO-4w fail: 21 sites → 422 \"at most 20\", nothing saved", tooMany.status === 422 && /at most 20/i.test(JSON.stringify(tooMany.body)) && stored() === "", tooMany.status);
// Break M1: twenty long sites saved at once, then all removed at once (the audit line fits; never a 500).
const longSites = Array.from({ length: 20 }, (_, i) => `https://www.sample-firm-number-${i}-with-a-long-name.example.co.uk`);
const v0 = (await api(tokens.owner, "GET", "/front-office/web-forms")).body?.forms.find((f: { id: string }) => f.id === formId)?.version;
const twenty = await api(tokens.owner, "PUT", `/front-office/web-forms/${formId}/allowed-sites`, { sites: longSites, version: v0 });
const cleared = await api(tokens.owner, "PUT", `/front-office/web-forms/${formId}/allowed-sites`, { sites: [], version: twenty.body?.version });
ok("FO-4w (break M1): twenty long sites save at once and are all removed at once (200, 200), one audit line each, its lists cut to fit and marked", twenty.status === 200 && twenty.body?.allowedSites?.length === 20 && cleared.status === 200 && stored() === "" && audits() === 2 && /more\)$/.test(sql(`select detail->>'added' from audit_event where action = 'fo.web_form.sites_changed' and entity_key = '${formId}' order by at asc limit 1`)), { twenty: twenty.status, cleared: cleared.status, audits: audits() });
const tooLong = await api(tokens.owner, "PUT", `/front-office/web-forms/${formId}/allowed-sites`, { sites: [`https://${"a".repeat(60)}.${"b".repeat(60)}.${"c".repeat(60)}.example.com`], version: cleared.body?.version });
ok("FO-4w fail (break M1): one site over 200 characters is refused on its field (422), never a 500", tooLong.status === 422 && !!tooLong.body?.fields?.["sites.0"], tooLong.status);
// Break m1: a host that is not a domain or an IP address is refused.
const odd = await api(tokens.owner, "PUT", `/front-office/web-forms/${formId}/allowed-sites`, { sites: ["https://*", "https://*.example.com", 'https://"onmouseover=alert(1).com', "https://a;b.example.com"], version: cleared.body?.version });
ok("FO-4w fail (break m1): https://*, a wildcard, a quote and a semicolon in the host are each refused on their field; nothing saved", odd.status === 422 && ["0", "1", "2", "3"].every((n) => !!odd.body?.fields?.[`sites.${n}`]) && stored() === "", odd.body?.fields);
const creds = await api(tokens.owner, "PUT", `/front-office/web-forms/${formId}/allowed-sites`, { sites: ["https://user:pass@www.example.com"], version: cleared.body?.version });
ok("FO-4w fail (review m2): a site with a user name or password is refused on its field; nothing saved", creds.status === 422 && /user name or password/.test(String(creds.body?.fields?.["sites.0"])) && stored() === "", creds.body?.fields);
const same = await api(tokens.owner, "PUT", `/front-office/web-forms/${formId}/allowed-sites`, { sites: [], version: cleared.body?.version });
ok("FO-4w (review m3): saving the same list again changes nothing: same version, no audit line", same.status === 200 && same.body?.version === cleared.body?.version && audits() === 2, { status: same.status, audits: audits() });
const stale = await api(tokens.owner, "PUT", `/front-office/web-forms/${formId}/allowed-sites`, { sites: [SITE], version: "2020-01-01T00:00:00.000Z" });
ok("FO-4w fail: a save naming an old version → 409 STALE in plain words, nothing saved", stale.status === 409 && stale.body?.code === "STALE" && stored() === "", stale.body);

// The screen.
const browser: Browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function pageAs(tok: string, width = 1440): Promise<{ ctx: BrowserContext; p: Page }> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await ctx.addInitScript((t) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })), tok);
  p.on("pageerror", (e) => errors.push(String(e))); return { ctx, p };
}
const axe = async (name: string, p: Page) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  ok(`${name}: axe finds no WCAG A/AA violation`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
const noSideways = async (name: string, p: Page) => ok(`${name}: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

const { ctx: oc, p: o } = await pageAs(tokens.owner);
await o.goto(`${BASE}/front-office/leads`); await o.getByRole("heading", { name: "Leads" }).waitFor({ timeout: 30_000 });
await o.getByRole("navigation", { name: "Sales" }).getByRole("link", { name: "Web form" }).click();
await o.getByRole("heading", { name: "Web form", level: 1 }).waitFor({ timeout: 20_000 });
ok("FO-4w: the Owner reaches Settings › Web form from the Sales menu", o.url().endsWith("/front-office/settings/web-form"));
const snippetBox = o.getByLabel("Snippet to paste into your page");
ok("FO-4w: the snippet on the screen is embed/snippet.ts's text for this form; the hosted link is the form's page", await snippetBox.inputValue() === embedSnippet(BASE, token) && await o.getByLabel("Hosted form page").inputValue() === `${BASE}/front-office/web-form/${token}`);
ok("FO-4w: with no site saved the screen says the snippet shows only the link until a site is saved", await o.getByText("Save your site above first").isVisible());
await axe("FO-4w settings, no site yet", o); await shot(o, "fo4w-01-no-site-1440");
// Fail: a site with a page, another scheme, not a site → each on its field, nothing saved.
await o.getByLabel("Site 1", { exact: true }).fill(`${SITE}/contact`);
await o.getByRole("button", { name: "Add a site" }).click(); await o.getByLabel("Site 2", { exact: true }).fill("ftp://files.example.com");
await o.getByRole("button", { name: "Add a site" }).click(); await o.getByLabel("Site 3", { exact: true }).fill("our website");
await o.getByRole("button", { name: "Save sites" }).click();
await o.getByText("Not saved: check sites 1, 2 and 3.").waitFor({ timeout: 15_000 });
const fieldText = async (n: number) => (await o.getByLabel(`Site ${n}`, { exact: true }).getAttribute("aria-invalid")) === "true";
ok("FO-4w fail: a site with a page, an ftp site and \"our website\" are each refused on their own field, in plain words; nothing saved", await fieldText(1) && await fieldText(2) && await fieldText(3) && await o.getByText("Enter only the site, without a page").isVisible() && await o.getByText("Only http:// or https:// sites").isVisible() && stored() === "" && audits() === 2);
await axe("FO-4w settings, refused sites", o); await shot(o, "fo4w-02-refused-1440");
// Break m2, m3: Remove takes its row's message with it (the others move up with their rows) and keeps focus on a field.
await o.getByRole("button", { name: /Remove site 1/ }).click();
// Focus moves on the next frame: wait for it (a timeout fails the step loudly).
await o.waitForFunction(() => (document.activeElement as HTMLInputElement | null)?.placeholder === "https://www.example.com", undefined, { timeout: 5_000 });
const focusedIsSite = true;
ok("FO-4w fail (break m2, m3): after Remove the messages stay with their own rows (ftp's is now on Site 1, \"our website\"'s on Site 2) and focus is on a site field", await o.getByLabel("Site 1", { exact: true }).inputValue() === "ftp://files.example.com" && await fieldText(1) && await fieldText(2) && await o.getByText("Enter only the site, without a page").count() === 0 && focusedIsSite, { v1: await o.getByLabel("Site 1", { exact: true }).inputValue(), e1: await fieldText(1), e2: await fieldText(2), page: await o.getByText("Enter only the site, without a page").count(), focusedIsSite });
await o.getByRole("button", { name: "Add a site" }).click(); await o.getByLabel("Site 3", { exact: true }).fill(`${SITE}/contact`);
// Pass (keyboard only): fix the list, duplicates merged, saved with Enter.
await o.getByRole("button", { name: /Remove site 3/ }).click(); await o.getByRole("button", { name: /Remove site 2/ }).click();
await o.getByLabel("Site 1", { exact: true }).fill(SITE.toUpperCase().replace("HTTP://", "http://"));
await o.getByRole("button", { name: "Add a site" }).click(); await o.getByLabel("Site 2", { exact: true }).fill(`${SITE}/`);
await o.getByLabel("Site 2", { exact: true }).press("Enter");
await o.getByText(/^Saved\. 1 site can show this form\./).waitFor({ timeout: 15_000 });
ok("FO-4w: the site saves by keyboard (Enter), stored once in the browser's form (lower case, no slash): duplicates merged", stored() === SITE.toLowerCase(), stored());
ok("FO-4w: one audit line for the save (fo.web_form.sites_changed, by the Owner, naming the added site)", audits() === 3 && sql(`select detail->>'added' from audit_event where action = 'fo.web_form.sites_changed' and entity_key = '${formId}' order by at desc limit 1`) === SITE.toLowerCase());
// Copy.
await o.getByRole("button", { name: "Copy snippet" }).click();
await o.getByText("Copied.").first().waitFor({ timeout: 5_000 });
copied = await o.evaluate(() => navigator.clipboard.readText());
ok("FO-4w: Copy snippet puts the exact snippet on the clipboard and says \"Copied.\"", copied === embedSnippet(BASE, token));
await noSideways("FO-4w settings at 1440 px", o); await axe("FO-4w settings, saved", o); await shot(o, "fo4w-03-saved-1440");
// Stale on the screen: another person saves first; this screen's save says so and Reload shows theirs.
const fresh = await api(tokens.owner, "GET", "/front-office/web-forms");
const theirs = await api(tokens.owner, "PUT", `/front-office/web-forms/${formId}/allowed-sites`, { sites: [SITE, "https://www.example.com"], version: fresh.body?.forms.find((f: { id: string }) => f.id === formId)?.version });
await o.getByRole("button", { name: "Add a site" }).click(); await o.getByLabel("Site 2", { exact: true }).fill("https://other.example.org");
await o.getByRole("button", { name: "Save sites" }).click();
await o.getByText("Someone else changed this form's sites").waitFor({ timeout: 15_000 });
ok("FO-4w fail: a save after someone else's is refused in plain words with a Reload; their list is kept", theirs.status === 200 && stored() === `${SITE.toLowerCase()} https://www.example.com`);
await o.getByRole("button", { name: "Reload" }).click();
await o.waitForFunction(() => (document.querySelectorAll<HTMLInputElement>('input[placeholder="https://www.example.com"]')[1]?.value ?? "") === "https://www.example.com", undefined, { timeout: 10_000 });
ok("FO-4w: Reload shows the newest list and takes the \"someone else changed\" notice away", await o.getByLabel("Site 2", { exact: true }).inputValue() === "https://www.example.com" && await o.getByText("Someone else changed this form's sites").count() === 0);
// The copied snippet works on the saved site (FO-4b's embed draws).
const { ctx: vc } = await pageAs(tokens.owner); const v = await vc.newPage();
await v.goto(`${SITE}/`); await v.getByLabel("First name").waitFor({ timeout: 30_000 });
ok("FO-4w: the copied snippet, pasted on the saved site, draws the firm's form (FO-4b)", await v.locator("[data-expatready-form]").getAttribute("data-expatready-state") === "form");
// 375 px.
const { ctx: sc, p: s } = await pageAs(tokens.owner, 375);
await s.goto(`${BASE}/front-office/settings/web-form`); await s.getByRole("heading", { name: "Web form", level: 1 }).waitFor({ timeout: 20_000 });
await noSideways("FO-4w settings at 375 px", s); await shot(s, "fo4w-04-375");
// The Case Officer: no menu item; the page says who may.
const { ctx: cc, p: c } = await pageAs(tokens.officer);
await c.goto(`${BASE}/front-office/leads`); await c.getByRole("heading", { name: "Leads" }).waitFor({ timeout: 30_000 });
const menuItem = await c.getByRole("navigation", { name: "Sales" }).getByRole("link", { name: "Web form" }).count();
await c.goto(`${BASE}/front-office/settings/web-form`); await c.getByText("Owners and Admins only").waitFor({ timeout: 20_000 });
ok("FO-4w fail: a Case Officer has no Web form menu item; the page says only an Owner or Admin can change it and shows no snippet", menuItem === 0 && await c.getByLabel("Snippet to paste into your page").count() === 0);
await axe("FO-4w settings, Case Officer", c);

ok("FO-4w: no page error in the browser", errors.length === 0, errors);
for (const x of [oc, vc, sc, cc]) await x.close();
await browser.close(); host.close(); await db.$disconnect();
process.exit(summary() ? 1 : 0);
